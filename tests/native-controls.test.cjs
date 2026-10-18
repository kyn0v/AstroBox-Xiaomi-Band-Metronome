const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')

const root = path.join(__dirname, '..')
const homeSource = fs.readFileSync(path.join(root, 'src/pages/index/index.ux'), 'utf8')
const tempoSource = fs.readFileSync(path.join(root, 'src/pages/tempo/index.ux'), 'utf8')
const homeTemplate = homeSource.split('<script>')[0]
const tempoTemplate = tempoSource.split('<script>')[0]

test('home uses one native button without overlay images or custom hit testing', () => {
  const button = homeTemplate.match(/<input\b[^>]*id="primary"[^>]*>/)[0]
  assert.match(button, /type="button"/)
  assert.match(button, /onclick="toggleRunning"/)
  assert.doesNotMatch(button, /onswipe|ontouch/)
  for (const removed of ['<stack', '<progress', 'touch-surface', 'primary-icon', 'onDialTouch', 'getBoundingClientRect', 'dialPoint']) {
    assert.ok(!homeSource.includes(removed), removed)
  }
  assert.match(homeSource, /width: 192px; height: 192px/)
  assert.match(homeSource, /background-image: url\('\/common\/icons\/play-dark\.png'\)/)
})

test('native click activation has no coordinate or preceding-touch requirement', () => {
  const { page, calls } = pageHarness()
  for (const event of [undefined, {}, { offsetX: 0, offsetY: 0 }, { offsetX: 191, offsetY: 191 }, { clientX: NaN }]) {
    const before = calls.vibrations.length
    page.toggleRunning(event)
    assert.equal(page.running, true)
    assert.equal(calls.vibrations.length, before + 1)
    page.toggleRunning(event)
    assert.equal(page.running, false)
  }
})

test('native picker excludes its bubbled touches from page navigation', () => {
  assert.ok(!homeTemplate.includes('<picker'))
  assert.ok(!tempoTemplate.includes('<slider'))
  const picker = tempoTemplate.match(/<picker\b[^>]*>/)[0]
  assert.match(picker, /type="text"/)
  assert.match(picker, /onchange="onNativePickerChange\(\$item.id\)"/)
  assert.doesNotMatch(picker, /onswipe/)
  assert.match(picker, /ontouchstart="onPickerTouchStart"/)
  for (const template of [homeTemplate, tempoTemplate]) {
    assert.match(template, /<div class="page"[^>]*ontouchstart="onPageTouchStart"/)
    assert.match(template, /ontouchmove="onPageTouchMove"/)
    assert.match(template, /ontouchend="onPageTouchEnd"/)
    assert.doesNotMatch(template, /onswipe=/)
  }
})

test('four foreground pages stay focused and handle system back', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'))
  assert.deepEqual(Object.keys(manifest.router.pages).sort(), ['pages/appearance', 'pages/index', 'pages/rhythm', 'pages/tempo'])
  for (const route of Object.keys(manifest.router.pages)) {
    const source = fs.readFileSync(path.join(root, 'src', route, 'index.ux'), 'utf8')
    const template = source.split('<script>')[0]
    assert.doesNotMatch(template, /onclick="(?:exitApp|goBack|resetTempo|toggleVibrationMode)"/)
    assert.match(source, /onBackPress\(/)
  }
  assert.doesNotMatch(tempoTemplate, /openAppearance|showGuide/)
  assert.match(homeTemplate, /onclick="openRhythm"/)
  assert.match(homeTemplate, /onlongpress="showGuide"/)
})

test('tap target is circular and output icons have no background plate', () => {
  assert.match(tempoSource, /\.tap \{ width: 192px; height: 192px;.*border-radius: 96px/)
  assert.match(tempoTemplate, /id="tap".*type="button".*onclick="tapTempo"/)
  assert.match(tempoTemplate, /range="\{\{ \$item.options \}\}" selected="\{\{ \$item.selected \}\}"/)
  const quickStyle = homeSource.match(/\.quick \{([^}]+)\}/)[1]
  assert.doesNotMatch(quickStyle, /background/)
  for (const tag of homeTemplate.matchAll(/<div class="quick"[^>]*>/g)) assert.doesNotMatch(tag[0], /background/)
  assert.match(homeTemplate, /lit \? \(currentBeat === 0 \? colors.downbeat : colors.pulse\)/)
})
