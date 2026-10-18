const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')
const { pageHarness, fakeClock } = require('./helpers.cjs')
const { createPageSwipe } = require('../src/common/page-swipe')

function startDark(options) {
  const h = pageHarness(options)
  h.page.toggleRunning()
  h.page.enterDark()
  assert.equal(h.page.dark, true)
  return h
}

test('Home places the moon action between vibration and flash with separate opaque dark content', () => {
  const source = fs.readFileSync('src/pages/index/index.ux', 'utf8')
  const template = source.split('<script>')[0]
  const quick = template.match(/<div class="quick-row">([\s\S]*?)<text class="hint"/)[1]
  assert.deepEqual([...quick.matchAll(/onclick="([^"]+)"/g)].map(m => m[1]), ['toggleVibration', 'enterDark', 'toggleFlash'])
  assert.match(template, /ready && !showWelcome && !dark/)
  assert.match(template, /class="dark-screen" if="\{\{ dark \}\}" onclick="wakeFromDark"/)
  assert.match(template, /dark \? '#000000'/)
  assert.doesNotMatch(source, /brightness\.(setValue|setMode)/)
})

test('moon icons have transparent backgrounds and all theme/disabled assets are present', () => {
  for (const name of ['mint', 'blue', 'violet', 'amber', 'off']) {
    const png = PNG.sync.read(fs.readFileSync(path.join('src/common/icons', 'dark-' + name + '.png')))
    assert.equal(png.width, 64); assert.equal(png.height, 64)
    assert.equal(png.data[3], 0)
    let visible = 0
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 0) visible++
    assert.ok(visible > 300 && visible < 2000)
  }
})

test('dark mode requires explicit playback and useful vibration without changing those preferences', () => {
  const stopped = pageHarness({ locale: 'zh-CN' }); stopped.page.enterDark()
  assert.equal(stopped.page.dark, false); assert.match(stopped.page.status, /开始播放/)
  assert.deepEqual(stopped.calls.keepScreenOn, []); assert.deepEqual(stopped.calls.writes, [])
  const muted = pageHarness({ preferences: { vibration: false } }); muted.page.toggleRunning(); muted.page.enterDark()
  assert.equal(muted.page.dark, false); assert.match(muted.page.status, /Enable vibration/)
  assert.equal(muted.page.vibration, false); assert.deepEqual(muted.calls.writes, [])
  const silent = pageHarness({ preferences: { patterns: { '4/4': ['off', 'off', 'off', 'off'] } } })
  silent.page.toggleRunning(); silent.page.enterDark()
  assert.equal(silent.page.dark, false); assert.match(silent.page.status, /vibrating beat/)
  assert.deepEqual(silent.calls.writes, [])
})

test('loading, onboarding, hidden and navigating pages cannot enter dark mode', () => {
  const loading = pageHarness({ deferLoad: true }); loading.page.enterDark(); assert.equal(loading.page.dark, false)
  const welcome = pageHarness({ preferences: { onboardingDone: false } }); welcome.page.enterDark(); assert.equal(welcome.page.dark, false)
  const hidden = pageHarness(); hidden.page.onHide(); hidden.page.enterDark(); assert.equal(hidden.page.dark, false)
  const leaving = pageHarness(); leaving.page.openTempo(); leaving.page.enterDark(); assert.equal(leaving.page.dark, false)
})

test('entering dark cancels flashes/notices but preserves the original beat deadline and screen request', () => {
  const h = pageHarness(); h.page.toggleVibration(); h.page.toggleVibration(); h.page.toggleRunning()
  assert.ok(h.clock.pending() >= 2)
  const writes = h.calls.writes.length
  h.page.enterDark()
  assert.equal(h.page.lit, false)
  assert.equal(h.page._noticeTimer, null)
  assert.equal(h.clock.pending(), 1)
  assert.equal(h.clock.nextAt(), 500)
  assert.deepEqual(h.calls.keepScreenOn, [true])
  assert.equal(h.calls.writes.length, writes)
  h.clock.advance(499); assert.equal(h.calls.vibrations.length, 1)
  h.clock.advance(1); assert.equal(h.calls.vibrations.length, 2)
  assert.equal(h.page._flashTimer, null)
})

test('dark ticks retain phase and vibration without updating reactive beat/flash fields', () => {
  const h = startDark()
  let beatWrites = 0, flashWrites = 0
  let current = h.page.currentBeat, lit = h.page.lit
  Object.defineProperty(h.page, 'currentBeat', { get: () => current, set: v => { current = v; beatWrites++ } })
  Object.defineProperty(h.page, 'lit', { get: () => lit, set: v => { lit = v; flashWrites++ } })
  h.clock.advance(750)
  assert.equal(beatWrites, 0); assert.equal(flashWrites, 0)
  assert.equal(h.page._lastBeat, 1)
  const pulses = h.calls.vibrations.length
  h.page.wakeFromDark()
  assert.equal(h.page.dark, false); assert.equal(h.page.currentBeat, 1)
  assert.equal(h.calls.vibrations.length, pulses)
  assert.equal(h.clock.nextAt(), 1000)
  h.clock.advance(250)
  assert.equal(h.page.currentBeat, 2); assert.equal(h.page.lit, true)
  assert.deepEqual(h.calls.keepScreenOn, [true])
})

test('entry tap cannot immediately wake, and wake tap cannot activate remounted controls', () => {
  const h = startDark()
  h.page.wakeFromDark(); assert.equal(h.page.dark, true)
  h.clock.advance(350); h.page.wakeFromDark(); assert.equal(h.page.dark, false)
  const count = h.calls.vibrations.length
  h.page.toggleRunning(); h.page.toggleVibration(); h.page.toggleFlash()
  h.page.openTempo(); h.page.openRhythm(); h.page.openAppearance(); h.page.showGuide()
  assert.equal(h.page.running, true)
  assert.equal(h.page.vibration, true); assert.equal(h.page.flash, true)
  assert.equal(h.page.showWelcome, false)
  assert.equal(h.calls.vibrations.length, count)
  assert.deepEqual(h.calls.routes, []); assert.deepEqual(h.calls.writes, [])
  h.clock.advance(350); h.page.toggleRunning(); assert.equal(h.page.running, false)
})

test('invisible normal controls cannot change settings or navigate while dark', () => {
  const h = startDark(); h.clock.advance(400)
  h.page.toggleRunning(); h.page.toggleVibration(); h.page.toggleFlash()
  h.page.openTempo(); h.page.openRhythm(); h.page.openAppearance(); h.page.showGuide(); h.page.retrySave()
  assert.equal(h.page.running, true); assert.equal(h.page.dark, true)
  assert.deepEqual(h.calls.writes, []); assert.deepEqual(h.calls.routes, [])
})

test('left/up/down gestures restore controls without accidental navigation or restart', () => {
  for (const direction of ['left', 'up', 'down']) {
    const h = startDark(); h.clock.advance(750)
    h.page.onPageSwipe({ direction })
    assert.equal(h.page.dark, false); assert.equal(h.page.running, true)
    assert.equal(h.page.currentBeat, 1); assert.equal(h.clock.nextAt(), 1000)
    assert.deepEqual(h.calls.routes, [])
  }
})

test('right swipe from dark stops and exits once, even during the entry click guard', () => {
  const h = startDark(); h.page.onPageSwipe({ direction: 'right' }); h.page.onPageSwipe({ direction: 'right' })
  assert.equal(h.page.dark, false); assert.equal(h.page.running, false)
  assert.equal(h.calls.exits, 1)
  assert.equal(h.clock.pending(), 0)
  assert.deepEqual(h.calls.keepScreenOn, [true, false])
})

for (const method of ['stop', 'onHide', 'onDestroy', 'onBackPress']) {
  test(method + ' releases foreground dark mode and leaves no beat/flash/notice timer', () => {
    const h = startDark(); h.clock.advance(400); h.page[method]()
    assert.equal(h.page.dark, false); assert.equal(h.page.running, false)
    assert.equal(h.clock.pending(), 0)
    assert.equal(h.calls.keepScreenOn.at(-1), false)
    const count = h.calls.vibrations.length
    h.clock.advance(5000); h.page.beat(0, 500)
    assert.equal(h.calls.vibrations.length, count)
  })
}

test('dark mode continues beyond the old five-minute diagnostic cap until explicitly stopped', () => {
  const h = startDark(); h.clock.advance(6 * 60 * 1000)
  assert.equal(h.page.running, true); assert.equal(h.page.dark, true)
  assert.equal(h.calls.vibrations.length, 721)
  assert.equal(h.clock.pending(), 1)
  assert.deepEqual(h.calls.keepScreenOn, [true])
  h.page.stop(); assert.equal(h.clock.pending(), 0)
})

test('all meters keep the same sequence and rests as visible foreground playback', () => {
  for (const meter of ['2/4', '3/4', '4/4', '6/8']) {
    const preferences = { bpm: 87, meter, patterns: { '4/4': ['long', 'off', 'short', 'short'] } }
    const reference = pageHarness({ preferences }); reference.page.toggleRunning()
    const h = startDark({ preferences })
    h.clock.advance(10000); reference.clock.advance(10000)
    assert.deepEqual(h.calls.vibrations, reference.calls.vibrations)
    assert.equal(h.page._lastBeat, reference.page.currentBeat)
  }
})

test('dark mode and flash suppression are not persisted, and returning never auto-starts', () => {
  const h = startDark({ preferences: { flash: true, dark: true, theme: 'amber' } })
  assert.equal(h.page.flash, true); assert.equal(h.page.theme, 'amber')
  assert.equal(h.calls.writes.length, 0)
  h.page.onHide(); h.page.onShow()
  assert.equal(h.page.dark, false); assert.equal(h.page.running, false)
  assert.equal(h.page.flash, true); assert.equal(h.page.theme, 'amber')
  assert.equal(h.clock.pending(), 0)
  const fresh = pageHarness({ preferences: h.stored() })
  assert.equal(fresh.page.dark, false); assert.equal(fresh.page.running, false)
})

test('vibration failure restores controls with an error rather than leaving silent black UI', () => {
  const h = startDark({ locale: 'zh-CN' }); h.setVibrationFailure(true); h.clock.advance(500)
  assert.equal(h.page.dark, false)
  assert.equal(h.page.vibration, false)
  assert.equal(h.page.status, '振动不可用')
  h.page.stop(); assert.equal(h.clock.pending(), 0)
})

test('keep-screen failure blocks dark mode and a late failure restores it safely', () => {
  const failed = pageHarness({ keepScreenFails: true }); failed.page.toggleRunning(); failed.page.enterDark()
  assert.equal(failed.page.dark, false); assert.match(failed.page.status, /screen-on unavailable/)
  const h = startDark(); const failedRequest = h.calls.screenRequests[0]
  failedRequest.fail()
  assert.equal(h.page.dark, false); assert.match(h.page.status, /screen-on unavailable/)
  h.page.stop(); assert.equal(h.clock.pending(), 0)
})

test('stale keep-screen callbacks from an older playback do not invalidate a new session', () => {
  const h = startDark(); const old = h.calls.screenRequests[0]
  h.page.stop(); h.clock.advance(350); h.page.toggleRunning(); h.page.enterDark()
  assert.equal(h.page.dark, true)
  old.fail()
  assert.equal(h.page.dark, true); assert.equal(h.page._screenFailed, false)
  h.page.onHide(); old.fail(); assert.equal(h.page.status, 'Stopped')
})

test('save failures and lost vibration preferences restore controls to expose the problem', () => {
  const h = pageHarness({ deferSaves: true }); h.page.toggleFlash(); h.page.toggleRunning(); h.page.enterDark()
  assert.equal(h.page.dark, true)
  h.finishSave(false)
  assert.equal(h.page.dark, false); assert.match(h.page.status, /Save failed/)
  const muted = startDark(); muted.app.getPreferences().update({ vibration: false })
  assert.equal(muted.page.dark, false)
  const silent = startDark(); silent.app.getPreferences().update({ patterns: { '4/4': ['off', 'off', 'off', 'off'] } })
  assert.equal(silent.page.dark, false)
})

test('the click guard is bounded, does not allocate timers, and resets on fresh page show', () => {
  const clock = fakeClock(); const swipe = createPageSwipe(clock.now)
  swipe.blockClicks(); assert.equal(swipe.canClick(), false); assert.equal(clock.pending(), 0)
  clock.advance(349); assert.equal(swipe.canClick(), false)
  clock.advance(1); assert.equal(swipe.canClick(), true)
  swipe.blockClicks(); swipe.cancel(); assert.equal(swipe.canClick(), true)
})

test('production app has only four foreground pages, no diagnostic routes or device-info feature', () => {
  const manifest = JSON.parse(fs.readFileSync('src/manifest.json'))
  assert.deepEqual(Object.keys(manifest.router.pages).sort(), ['pages/appearance', 'pages/index', 'pages/rhythm', 'pages/tempo'])
  assert.equal(manifest.permissions, undefined); assert.equal(manifest.config.background, undefined)
  assert.ok(!manifest.features.some(f => ['system.device', 'system.audio', 'system.geolocation', 'system.request'].includes(f.name)))
  for (const removed of ['src/pages/probe', 'src/pages/capabilities', 'src/common/background-probe.js', 'src/common/background-capabilities.js']) {
    assert.equal(fs.existsSync(removed), false, removed)
  }
  const app = fs.readFileSync('src/app.ux', 'utf8')
  assert.doesNotMatch(app, /BackgroundProbe|vibrator|setTimeout/)
})
