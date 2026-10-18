const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')
const { normalizePreferences } = require('../src/common/preferences')
const { getTheme } = require('../src/common/themes')
const { getStrings } = require('../src/common/strings')

function openAppearance(h) {
  h.page.openAppearance()
  h.page.onHide()
  return h.createPage('appearance')
}

test('old themes migrate safely; legacy global vibration mode is no longer stored', () => {
  for (const theme of [undefined, 'unknown', '__proto__', 'constructor']) {
    const p = normalizePreferences({ theme, vibrationMode: 'long', bpm: 93, vibration: false })
    assert.equal(p.theme, 'mint')
    assert.equal(Object.hasOwn(p, 'vibrationMode'), false)
    assert.equal(p.meter, '4/4')
    assert.equal(p.bpm, 93)
    assert.equal(p.vibration, false)
  }
  for (const theme of ['mint', 'blue', 'violet', 'amber']) assert.equal(normalizePreferences({ theme }).theme, theme)
})

test('theme selection is immediate and shared across all pages, with no playback or vibration', () => {
  const h = pageHarness({ preferences: { bpm: 137, vibration: false } })
  const a = openAppearance(h)
  for (const id of ['blue', 'violet', 'amber', 'mint']) {
    a.chooseTheme(id)
    assert.equal(a.colors.accent, getTheme(id).accent)
    assert.equal(h.stored().theme, id)
  }
  a.chooseTheme('violet')
  a.goBack()
  a.onHide()
  h.page.onShow()
  assert.equal(h.page.colors.accent, getTheme('violet').accent)
  assert.equal(h.page.running, false)
  assert.equal(h.page.bpm, 137)
  assert.equal(h.page.vibration, false)
  for (const name of ['tempo', 'rhythm']) {
    h.page.onHide()
    const page = h.createPage(name)
    assert.equal(page.colors.accent, getTheme('violet').accent)
    page.onHide()
  }
  assert.deepEqual(h.calls.vibrations, [])
  assert.equal(h.clock.pending(), 0)
  assert.equal(pageHarness({ preferences: h.stored() }).page.colors.accent, getTheme('violet').accent)
})

test('preference loading, hidden pages, and navigation block theme mutation', () => {
  const h = pageHarness({ deferLoad: true })
  h.page.onHide()
  const a = h.createPage('appearance')
  a.chooseTheme('blue')
  assert.deepEqual(h.calls.writes, [])
  h.finishLoad()
  a.onHide()
  a.chooseTheme('blue')
  assert.deepEqual(h.calls.writes, [])
  a.onShow()
  a.goBack()
  a.chooseTheme('blue')
  assert.deepEqual(h.calls.writes, [])
})

test('theme page reports saving errors with localized labels', () => {
  const h = pageHarness({ saveFails: true, locale: 'zh-CN' })
  const a = openAppearance(h)
  a.chooseTheme('blue')
  assert.equal(a.status, '保存失败，点此重试')
  h.setLocale('en')
  a.onConfigurationChanged({ type: 'locale' })
  assert.equal(a.labels.appearance, 'COLORS')
})

test('visible template labels exist in both languages and versions/routes are consistent', () => {
  const root = path.join(__dirname, '..')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json')))
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')))
  assert.equal(manifest.versionName, pkg.version)
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].version, pkg.version)
  for (const route of Object.keys(manifest.router.pages)) {
    const source = fs.readFileSync(path.join(root, 'src', route, 'index.ux'), 'utf8')
    for (const [, key] of source.split('<script>')[0].matchAll(/labels\.(\w+)/g)) {
      for (const lang of ['en', 'zh']) assert.equal(typeof getStrings(lang)[key], 'string', `${route}: ${lang}.${key}`)
    }
  }
  for (const lang of ['en', 'zh']) for (const mode of ['long', 'short', 'off']) {
    assert.equal(typeof getStrings(lang)[mode], 'string')
  }
})
