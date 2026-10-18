const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')
const { getTheme } = require('../src/common/themes')
const { createPreferenceStore } = require('../src/common/preferences')
const names = ['index', 'tempo', 'rhythm', 'appearance']
const saved = {
  bpm: 173, meter: '6/8', theme: 'violet', vibration: false, flash: false,
  patterns: { '6/8': ['off', 'short', 'short', 'long', 'short', 'off'] }
}

function assertSavedView(page, name, expected = saved) {
  assert.equal(page.ready, true, name)
  assert.equal(page.colors.accent, getTheme(expected.theme).accent, name)
  if (name !== 'appearance') assert.equal(page.meter, expected.meter, name)
  if (name === 'index' || name === 'tempo') assert.equal(page.bpm, expected.bpm, name)
  if (name === 'index') {
    assert.equal(page.vibration, expected.vibration)
    assert.equal(page.flash, expected.flash)
    assert.equal(page.beatSlots.length, Number(expected.meter[0]))
    assert.deepEqual(page._pattern, expected.patterns[expected.meter])
  }
  if (name === 'rhythm') {
    assert.deepEqual([...page.rowTop, ...page.rowBottom].map(cell => cell.mode), expected.patterns[expected.meter])
  }
  if (name === 'appearance') assert.equal(page.theme, expected.theme)
}

test('every warm page has saved colors and configuration in onInit, before first render/onShow', () => {
  const h = pageHarness({ preferences: saved })
  h.page.onHide()
  for (const name of names) {
    const page = h.createPage(name, { show: false })
    assert.equal(page._visible, false)
    assertSavedView(page, name)
    page.onDestroy()
  }
  assert.deepEqual(h.calls.writes, [])
  assert.deepEqual(h.calls.vibrations, [])
  assert.equal(h.clock.pending(), 0)
})

test('cold pages hide all preference-dependent content until the complete snapshot is ready', () => {
  const h = pageHarness({ preferences: saved, deferLoad: true })
  const frames = []
  const pages = names.map(name => {
    const page = h.createPage(name)
    assert.equal(page.ready, false)
    let ready = false
    Object.defineProperty(page, 'ready', {
      get: () => ready,
      set(value) {
        ready = value
        if (value) {
          assertSavedView(page, name)
          frames.push(name)
        }
      }
    })
    return page
  })
  assert.deepEqual(frames, [])
  h.finishLoad()
  assert.deepEqual(frames, names)
  assert.deepEqual(h.calls.writes, [])
  assert.equal(h.clock.pending(), 0)
  pages.forEach(page => page.onDestroy())
})

test('retained pages synchronize while hidden without remounts, old-color frames or default-value writes', () => {
  const h = pageHarness({ preferences: saved })
  h.page.onHide()
  const pages = names.map(name => h.createPage(name))
  pages.forEach(page => page.onHide())
  const next = { ...saved, theme: 'amber', bpm: 89, meter: '3/4', patterns: { '3/4': ['short', 'off', 'long'] } }
  h.page._store.update(next)
  pages.forEach((page, i) => assertSavedView(page, names[i], next)) // Before resuming any page.
  for (const page of pages) {
    const colors = page.colors
    const transitions = []
    let ready = page.ready
    Object.defineProperty(page, 'ready', { get: () => ready, set(value) { ready = value; transitions.push(value) } })
    for (let i = 0; i < 3; i++) { page.onShow(); page.onHide() }
    assert.deepEqual(transitions, [])
    assert.equal(page.colors, colors)
  }
  assert.equal(h.calls.writes.length, 1)
  assert.deepEqual(h.calls.vibrations, [])
  assert.equal(h.clock.pending(), 0)
})

test('destroyed pages unsubscribe and cannot be revived by a late load or future edits', () => {
  const h = pageHarness({ preferences: saved, deferLoad: true })
  const pages = names.map(name => h.createPage(name))
  pages.forEach(page => page.onDestroy())
  h.finishLoad()
  h.page._store.update({ theme: 'blue', bpm: 90 })
  for (const page of pages) {
    assert.equal(page.ready, false)
    assert.equal(page.colors.accent, getTheme('mint').accent)
  }
  assert.equal(h.clock.pending(), 0)
  assert.deepEqual(h.calls.vibrations, [])
})

test('settings propagation does not reset a running beat, hardware-failure disable, or tap sequence', () => {
  const h = pageHarness({ vibrationFails: true })
  h.page.toggleRunning()
  assert.equal(h.page.vibration, false)
  h.clock.advance(500)
  assert.equal(h.page.currentBeat, 1)
  h.page.toggleFlash() // A store publication must not reset to slot 0 or re-enable a failed motor.
  assert.equal(h.page.vibration, false)
  assert.equal(h.page.currentBeat, 1)
  assert.equal(h.page.running, true)
  h.page.openTempo()
  h.page.onHide()
  const t = h.createPage('tempo')
  t.tapTempo()
  for (let i = 0; i < 3; i++) { h.clock.advance(400); t.tapTempo() }
  assert.equal(t.bpm, 150)
  h.clock.advance(400)
  t.tapTempo()
  assert.equal(t.tapLit, true) // Publication after the fourth tap did not clear feedback.
  assert.equal(t.notice, '')
})

test('store subscriptions immediately replay warm state and isolate snapshots per observer', () => {
  const store = createPreferenceStore({ get(o) { o.success(JSON.stringify(saved)) }, set(o) { o.success() } })
  store.load(() => {})
  const frames = []
  const unsubscribe1 = store.subscribe(value => { value.patterns['6/8'][0] = 'long' })
  const unsubscribe2 = store.subscribe(value => frames.push(value))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].theme, 'violet')
  assert.equal(frames[0].patterns['6/8'][0], 'off')
  store.update({ theme: 'blue' })
  assert.equal(frames.length, 3) // New value while saving, then terminal saved state.
  assert.equal(frames[1].theme, 'blue')
  assert.equal(frames[1].patterns['6/8'][0], 'off')
  assert.equal(frames[2].theme, 'blue')
  unsubscribe1()
  unsubscribe2()
  store.update({ theme: 'amber' })
  assert.equal(frames.length, 3)
})

test('all four templates guard initial content, but leave the page/back gesture surface alive', () => {
  for (const name of names) {
    const source = fs.readFileSync(path.join(__dirname, `../src/pages/${name}/index.ux`), 'utf8')
    const template = source.split('<script>')[0]
    assert.match(template, /class="loading" if="\{\{ !ready \}\}"/)
    assert.match(template, name === 'index' ? /class="practice" if="\{\{ ready && !showWelcome && !dark \}\}"/ : /class="content" if="\{\{ ready \}\}"/)
    assert.match(template, /<div class="page"[^>]*ontouchend="onPageTouchEnd"/)
  }
})
