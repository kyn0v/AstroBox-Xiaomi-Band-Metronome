const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { fakeClock, pageHarness } = require('./helpers.cjs')
const { createBackgroundProbe, PROBE_LIMIT_MS, PROBE_STORAGE_KEY, readReport } = require('../src/common/background-probe')

function harness({ raw = '', deferred = false, failStorage = false, failVibration = false, failScreen = false } = {}) {
  const clock = fakeClock()
  const pulses = [], screen = [], writes = [], pending = []
  let stored = raw
  const storage = {
    get(o) { assert.equal(o.key, PROBE_STORAGE_KEY); o.success(stored) },
    set(o) {
      assert.equal(o.key, PROBE_STORAGE_KEY)
      writes.push(JSON.parse(o.value))
      if (deferred) pending.push(o)
      else if (failStorage) o.fail()
      else { stored = o.value; o.success() }
    }
  }
  const probe = createBackgroundProbe({ clock, storage,
    vibrate(mode) { if (failVibration) throw Error('motor'); pulses.push({ at: clock.now(), mode }) },
    keepScreenOn(on, fail) { screen.push(on); if (failScreen) fail() }
  })
  probe.setPageVisible(true)
  probe.load(() => {})
  return { clock, probe, pulses, screen, writes, pending,
    stored: () => stored && JSON.parse(stored),
    finish(ok = true) { const o = pending.shift(); assert.ok(o); if (ok) { stored = o.value; o.success() } else o.fail() }
  }
}
const prefs = { bpm: 120, meter: '4/4', vibration: true }

test('probe is explicit, bounded and app-owned, with no extra background permissions', () => {
  const h = harness()
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.probe.snapshot().running, false)
  assert.equal(h.probe.start(prefs), true)
  assert.equal(h.probe.start(prefs), false)
  h.clock.advance(1000)
  assert.equal(h.pulses.length, 3)
  assert.deepEqual(h.screen, [true])
  const manifest = JSON.parse(fs.readFileSync('src/manifest.json'))
  assert.equal(manifest.config.background, undefined)
  assert.ok(!manifest.features.some(f => ['system.audio', 'system.geolocation', 'system.request'].includes(f.name)))
})

test('foreground dark-page visibility and app-background events are not conflated', () => {
  const h = harness()
  h.probe.start(prefs)
  h.probe.setPageVisible(false)
  h.clock.advance(1000)
  assert.equal(h.probe.snapshot().report.hiddenTicks, 0)
  h.probe.setAppVisible(false)
  h.probe.setAppVisible(false)
  h.clock.advance(1500)
  assert.equal(h.probe.snapshot().report.hiddenTicks, 3)
  assert.equal(h.probe.snapshot().report.appHideCount, 1)
  assert.deepEqual(h.screen, [true, false])
  h.probe.setAppVisible(true)
  assert.deepEqual(h.screen, [true, false])
  h.probe.setPageVisible(true)
  assert.deepEqual(h.screen, [true, false, true])
})

test('a navigation request alone is not reported as background execution', () => {
  const h = harness(); h.probe.start(prefs); h.probe.prepareLeave()
  h.clock.advance(1000)
  assert.equal(h.probe.snapshot().report.appHideCount, 0)
  assert.equal(h.probe.snapshot().report.hiddenTicks, 0)
  assert.deepEqual(h.screen, [true, false])
})

test('five-minute wall-clock cap stops both timers, including while hidden', () => {
  for (const hidden of [false, true]) {
    const h = harness(); h.probe.start(prefs)
    if (hidden) { h.probe.setPageVisible(false); h.probe.setAppVisible(false) }
    h.clock.advance(PROBE_LIMIT_MS)
    assert.equal(h.probe.snapshot().running, false)
    assert.equal(h.probe.snapshot().report.reason, 'limit')
    assert.equal(h.pulses.length, 600)
    assert.equal(h.clock.pending(), 0)
    assert.equal(h.screen.at(-1), false)
  }
})

test('late timer and foreground resume both detect suspension before any extra pulse', () => {
  for (const resume of [false, true]) {
    const h = harness(); h.probe.start(prefs)
    h.probe.setPageVisible(false); h.probe.setAppVisible(false)
    if (resume) {
      // Move wall time without delivering timers, as a suspended JS runtime would.
      const original = h.clock.now
      h.clock.now = () => 12000
      h.probe.setAppVisible(true)
      h.clock.now = original
    } else h.clock.lateTick(12000)
    const state = h.probe.snapshot()
    assert.equal(state.running, false)
    assert.equal(state.report.reason, 'timerGap')
    assert.equal(state.report.maxGapMs, 12000)
    assert.equal(h.pulses.length, 1)
    assert.equal(h.clock.pending(), 0)
  }
})

test('resuming after the deadline never produces catch-up vibration', () => {
  const h = harness(); h.probe.start(prefs)
  h.clock.lateTick(PROBE_LIMIT_MS + 10000)
  assert.equal(h.pulses.length, 1)
  assert.equal(h.probe.snapshot().report.reason, 'limit')
  assert.equal(h.clock.pending(), 0)
})

test('backward wall clock stops the experiment safely', () => {
  const h = harness(); h.clock.advance(1000); h.probe.start(prefs)
  h.probe.setAppVisible(false); h.clock.advance(-500); h.probe.setAppVisible(true)
  assert.equal(h.probe.snapshot().report.reason, 'clockChanged')
  assert.equal(h.clock.pending(), 0)
})

test('manual stop and app destruction release screen-on and do not auto-resume', () => {
  for (const action of ['stop', 'destroy']) {
    const h = harness(); h.probe.start(prefs); h.probe[action]()
    assert.equal(h.clock.pending(), 0)
    assert.equal(h.screen.at(-1), false)
    h.probe.setAppVisible(false); h.probe.setAppVisible(true); h.probe.setPageVisible(true)
    h.clock.advance(1000)
    assert.equal(h.pulses.length, 1)
    if (action === 'destroy') assert.equal(h.probe.start(prefs), false)
  }
})

test('persisted running markers become interrupted/unknown, never resumed playback', () => {
  const a = harness(); a.probe.start(prefs); a.clock.advance(500); a.probe.setAppVisible(false)
  const b = harness({ raw: JSON.stringify(a.stored()) })
  assert.equal(b.probe.snapshot().running, false)
  assert.equal(b.probe.snapshot().report.reason, 'interrupted')
  assert.equal(b.clock.pending(), 0)
  assert.equal(b.pulses.length, 0)
})

test('malformed report data cannot create a running session', () => {
  for (const raw of ['{', '[]', '{}', '{"schema":1,"reason":"running"}']) {
    const h = harness({ raw })
    assert.equal(h.probe.snapshot().report, null)
    assert.equal(h.probe.snapshot().running, false)
    assert.equal(h.clock.pending(), 0)
  }
  assert.equal(readReport(''), null)
})

test('reports are isolated from snapshots and saved only on lifecycle boundaries', () => {
  const h = harness(); h.probe.start(prefs)
  h.clock.advance(5000)
  assert.equal(h.writes.length, 1)
  h.probe.snapshot().report.hiddenTicks = 999
  assert.equal(h.probe.snapshot().report.hiddenTicks, 0)
  h.probe.setAppVisible(false); h.clock.advance(2000); h.probe.stop()
  assert.equal(h.writes.length, 3)
  assert.equal(h.stored().hiddenTicks, 4)
})

test('report writes serialize and coalesce so a running marker cannot overwrite final state', () => {
  const h = harness({ deferred: true }); h.probe.start(prefs)
  h.probe.setAppVisible(false); h.clock.advance(1000); h.probe.stop()
  assert.equal(h.pending.length, 1)
  h.finish()
  assert.equal(h.pending.length, 1)
  h.finish()
  assert.equal(h.stored().reason, 'manual')
  assert.equal(h.stored().hiddenTicks, 2)
  assert.equal(h.writes.length, 2)
})

test('motor, storage and screen errors do not leave unbounded background timers', () => {
  const motor = harness({ failVibration: true }); motor.probe.start(prefs)
  assert.equal(motor.probe.snapshot().report.reason, 'vibrationError')
  assert.equal(motor.clock.pending(), 0)
  assert.deepEqual(motor.screen, [true, false])
  const storage = harness({ failStorage: true }); storage.probe.start(prefs)
  assert.equal(storage.probe.snapshot().saveError, true)
  storage.probe.stop(); assert.equal(storage.clock.pending(), 0)
  const screen = harness({ failScreen: true }); screen.probe.start(prefs)
  assert.equal(screen.probe.snapshot().screenError, true)
  screen.probe.stop(); assert.equal(screen.clock.pending(), 0)
})

test('disabled vibration and silent patterns cannot masquerade as a successful vibration test', () => {
  const h = harness()
  assert.equal(h.probe.start({ ...prefs, vibration: false }), false)
  assert.equal(h.probe.start({ ...prefs, patterns: { '4/4': ['off', 'off', 'off', 'off'] } }), false)
  assert.equal(h.clock.pending(), 0)
})

test('meter, tempo and rests are copied at start; settings are not mutated', () => {
  const h = harness()
  const input = { bpm: 60, meter: '6/8', patterns: { '6/8': ['long', 'off', 'short', 'short', 'off', 'short'] } }
  h.probe.start(input); input.patterns['6/8'][0] = 'off'
  h.clock.advance(2000)
  assert.equal(h.probe.snapshot().report.ticks, 7)
  assert.deepEqual(h.pulses.map(p => p.mode), ['long', 'short', 'short', 'short', 'long'])
})

function openProbe(h) {
  h.page.onHide()
  return h.createPage('probe')
}

test('appearance entry uses documented clearTask so test back does not hide behind Home', () => {
  const h = pageHarness(); h.page.onHide()
  const a = h.createPage('appearance'); a.openProbe()
  const route = h.calls.routeOptions.at(-1)
  assert.equal(route.uri, '/pages/probe')
  assert.equal(route.params.___PARAM_LAUNCH_FLAG___, 'clearTask')
  a.openProbe(); assert.equal(h.calls.routeOptions.length, 1)
})

test('probe page uses actual app-owned engine and does not force app termination on back', () => {
  const h = pageHarness(); const p = openProbe(h)
  assert.equal(p.ready, true); assert.equal(p.running, false)
  p.toggleRunning(); assert.equal(p.running, true)
  p.tryLeave(); assert.equal(h.calls.routes.at(-1), 'back'); assert.equal(h.calls.exits, 0)
  p.onHide(); h.app.onHide(); h.clock.advance(1000)
  assert.equal(h.calls.vibrations.length, 3)
  h.app.onShow(); p.onShow()
  assert.equal(p.running, true)
  assert.match(p.callbacksText, /2 \/ 3/)
  p.toggleRunning(); assert.equal(h.clock.pending(), 0)
})

test('destroying only the page does not claim a new background privilege or keep a UI listener', () => {
  const h = pageHarness(); const p = openProbe(h); p.toggleRunning()
  p.onDestroy(); h.app.onHide(); h.clock.advance(1000)
  assert.equal(h.calls.vibrations.length, 3)
  assert.equal(p.ready, false)
  h.app.onDestroy(); assert.equal(h.clock.pending(), 0)
  assert.equal(h.probeStored().reason, 'destroyed')
})

test('dark practice is foreground only, wakes on tap, and exits on stop/deadline', () => {
  const h = pageHarness({ locale: 'zh-CN' }); const p = openProbe(h)
  p.enterDark(); assert.equal(p.dark, false)
  p.toggleRunning(); p.enterDark(); assert.equal(p.dark, true)
  assert.match(p.labels.wake, /前台/)
  assert.equal(h.calls.keepScreenOn.at(-1), true)
  p.wake(); assert.equal(p.dark, false)
  p.enterDark(); h.clock.advance(PROBE_LIMIT_MS)
  assert.equal(p.dark, false); assert.equal(p.running, false)
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.calls.keepScreenOn.at(-1), false)
})

test('normal Home stops retained probe before any normal playback can begin', () => {
  const h = pageHarness(); const p = openProbe(h); p.toggleRunning()
  p.onHide(); h.app.onHide(); h.clock.advance(1000)
  h.app.onShow(); h.page.onShow()
  assert.equal(h.app.getBackgroundProbe().snapshot().running, false)
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.probeStored().reason, 'home')
  h.page.toggleRunning(); assert.equal(h.clock.pending() > 0, true)
  h.page.stop(); assert.equal(h.clock.pending(), 0)
})

test('return-Home button stops safely; system back remains system-owned', () => {
  const h = pageHarness(); const p = openProbe(h); p.toggleRunning()
  assert.equal(p.onBackPress(), false)
  assert.equal(h.calls.exits, 0)
  p.goHome()
  assert.equal(h.calls.routes.at(-1), '/pages/index')
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.calls.keepScreenOn.at(-1), false)
})

test('probe locale, disabled vibration and report errors are visible without changing preferences', () => {
  const h = pageHarness({ locale: 'zh-CN', preferences: { vibration: false } })
  const p = openProbe(h); p.toggleRunning()
  assert.equal(p.running, false); assert.match(p.status, /开启振动/)
  assert.equal(h.calls.writes.length, 0)
  h.setLocale('en'); p.onConfigurationChanged()
  assert.match(p.status, /Enable vibration/)
  const failing = pageHarness({ saveFails: true }); const f = openProbe(failing); f.toggleRunning()
  assert.match(f.status, /storage unavailable/)
})
