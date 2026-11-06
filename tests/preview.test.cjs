const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { once } = require('node:events')
const { cases, buildCase, createPreviewServer } = require('../scripts/preview.cjs')
const { prepareSource } = require('../scripts/preview-browser.js')
const ROOT = path.join(__dirname, '..')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'band-preview-'))
  fs.cpSync(path.join(ROOT, 'src'), path.join(root, 'src'), { recursive: true })
  for (const name of ['tests/helpers.cjs', 'scripts/preview.cjs', 'scripts/preview-browser.js']) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.copyFileSync(path.join(ROOT, name), path.join(root, name))
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
function change(root, name, before, after) {
  const filename = path.join(root, name)
  const original = fs.readFileSync(filename, 'utf8')
  assert.ok(original.includes(before), `mutation target exists in ${name}`)
  fs.writeFileSync(filename, original.replace(before, after))
}
async function serve(t, options) {
  const server = createPreviewServer(options)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  assert.equal(server.address().address, '127.0.0.1')
  return (url, method = 'GET') => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }))
    })
    request.on('error', reject)
    request.end()
  })
}

test('bounded catalog covers every manifest route in both languages and executes real cases', async t => {
  const request = await serve(t)
  const response = await request('/catalog.json')
  assert.equal(response.status, 200)
  const catalog = JSON.parse(response.bytes)
  assert.ok(catalog.length >= 16 && catalog.length <= 24, 'eight baseline frames plus eight to sixteen edge layouts')
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length)
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/manifest.json')))
  for (const route of Object.keys(manifest.router.pages)) {
    for (const locale of ['en', 'zh']) {
      const baseline = catalog.find(item => item.id === `${route.split('/').at(-1)}-${locale}`)
      assert.equal(baseline?.route, route)
      const payload = JSON.parse((await request(`/case/${baseline.id}.json`)).bytes)
      assert.equal(payload.snapshot.bindings.ready, true)
      assert.equal(payload.case.locale, locale)
      assert.equal(payload.source.filename, `src/${route}/index.ux`)
      assert.deepEqual(payload.viewport, { width: 336, height: 480 })
    }
  }
  for (const item of catalog) {
    const payload = JSON.parse((await request(`/case/${item.id}.json`)).bytes)
    assert.equal(payload.result.status, 'pending', `${item.id} supplies a valid browser payload`)
    assert.equal(payload.snapshot.caseId, item.id)
    assert.ok(payload.result.assumptions.some(value => value.includes('144px')))
  }
  assert.throws(() => buildCase('not-a-case'), /Unknown preview case/)
})

test('real source and handler state determine digit snapshots, not stale native initialization', () => {
  const baseline = buildCase('tempo-en')
  const native = buildCase('native-173-en')
  assert.equal(native.snapshot.bindings.bpm, 173)
  assert.equal(native.snapshot.pickerDigits.join(''), '173')
  assert.equal(native.snapshot.bindings.pickerEntries.map(entry => entry.options[entry.selected]).join(''), '120', 'native selected initialization is deliberately stale')
  assert.equal(baseline.snapshot.pickerDigits.join(''), '120')
  const tapped = buildCase('tap-reset-en')
  assert.equal(tapped.snapshot.pickerDigits.join(''), '120')
  assert.equal(tapped.snapshot.bindings.tapLit, true)
  assert.equal(tapped.snapshot.bindings.pickerEntries.map(entry => entry.options[entry.selected]).join(''), '120')
  assert.equal(buildCase('clamp-low-zh').snapshot.pickerDigits.join(''), '050')
  assert.equal(buildCase('clamp-high-en').snapshot.pickerDigits.join(''), '250')
  assert.equal(buildCase('clamp-low-zh').snapshot.bindings.notice, '最低 50 BPM')
  assert.equal(buildCase('clamp-high-en').snapshot.bindings.notice, 'Maximum: 250 BPM')
})

test('edge snapshots expose onboarding, running/dark, six cells, four themes and storage states', () => {
  assert.equal(buildCase('welcome-zh').snapshot.bindings.showWelcome, true)
  const running = buildCase('running-six-en').snapshot.bindings
  assert.equal(running.running, true)
  assert.equal(running.currentBeat, 3)
  assert.equal(running.lit, true)
  const dark = buildCase('dark-zh').snapshot.bindings
  assert.equal(dark.dark, true)
  assert.equal(dark.running, true)
  assert.equal(dark.lit, false)
  const rhythm = buildCase('rhythm-six-en').snapshot.bindings
  assert.equal(rhythm.rowTop.length, 3)
  assert.equal(rhythm.rowBottom.length, 3)
  assert.equal(rhythm.cellWidth, 84)
  assert.equal(rhythm.rowBottom[0].mode, 'off')
  for (const theme of ['mint', 'blue', 'violet', 'amber']) {
    const id = theme === 'mint' ? 'appearance-en' : `appearance-${theme}-en`
    assert.equal(buildCase(id).snapshot.bindings.theme, theme)
  }
  assert.equal(buildCase('loading-zh').snapshot.bindings.ready, false)
  assert.equal(buildCase('loading-zh').snapshot.bindings.labels.loading, '正在读取偏好')
  const error = buildCase('save-error-en').snapshot.bindings
  assert.equal(error.warning, true)
  assert.equal(error.status, 'Save failed · tap to retry')
})

test('changed actual template, CSS, script state and asset bytes feed served preview with new hashes', async t => {
  const root = fixture(t)
  change(root, 'src/pages/index/index.ux', '{{ bpm }}</text>', 'Tempo {{ bpm }}</text>')
  change(root, 'src/pages/index/index.ux', 'font-size: 52px', 'font-size: 51px')
  change(root, 'src/common/metronome.js', 'DEFAULT_BPM = 120', 'DEFAULT_BPM = 121')
  const asset = path.join(root, 'src/common/icons/play-dark.png')
  fs.appendFileSync(asset, Buffer.from('asset-mutation'))
  const request = await serve(t, { root })
  const payload = JSON.parse((await request('/case/index-en.json')).bytes)
  assert.equal(payload.result.status, 'pending')
  assert.match(payload.source.template, /Tempo \{\{ bpm \}\}/)
  assert.match(prepareSource(payload.source).html, /Tempo __BIND_/)
  assert.match(prepareSource(payload.source).css, /font-size: 51px/)
  assert.equal(payload.snapshot.bindings.bpm, 121)
  for (const name of ['src/pages/index/index.ux', 'src/common/metronome.js', 'src/common/icons/play-dark.png']) {
    assert.equal(payload.result.sourceHashes[name], hash(fs.readFileSync(path.join(root, name))))
    assert.notEqual(payload.result.sourceHashes[name], hash(fs.readFileSync(path.join(ROOT, name))))
  }
  assert.deepEqual((await request('/common/icons/play-dark.png')).bytes, fs.readFileSync(asset))
})

test('binding and image hazards are protected before HTML parsing and native CSS is retained', () => {
  const home = prepareSource(buildCase('index-en').source)
  assert.equal((home.html.match(/<img /g) || []).length, 3)
  assert.doesNotMatch(home.html, /<\/?image|on(?:click|touch|longpress)=|\{\{/)
  const rhythm = prepareSource(buildCase('rhythm-en').source)
  assert.doesNotMatch(rhythm.html, /rowBottom.length > 0/)
  const tempo = prepareSource(buildCase('tempo-en').source)
  assert.match(tempo.css, /--picker-selected-font-size: 36px/)
  assert.match(tempo.html, /data-preview-style="selected-color: __BIND_/)
  assert.doesNotMatch(tempo.html, /\sstyle="/)
  assert.match(tempo.css, /width: 64px/)
})

test('unsupported original constructs are rejected even in hidden branches or unknown CSS', async t => {
  const original = buildCase('tempo-en').source
  const variants = [
    { template: original.template.replace('<div class="loading"', '<div unknown="yes" class="loading"') },
    { template: original.template.replace('<text class="title">', '<canvas class="title">').replace('</text>', '</canvas>') },
    { template: original.template.replace('!ready', 'labels.loading.toUpperCase()') },
    { template: original.template.replace('!ready', 'ready = false') },
    { template: original.template.replace('!ready', 'ready => true') },
    { template: original.template.replace('!ready', 'new Something') },
    { template: original.template + '<!-- unsupported comment -->' },
    { style: original.style + '\n@media (width: 336px) { .page { width: 100%; } }' },
    { style: original.style.replace('width: 64px', 'mystery-size: 64px') },
    { style: original.style.replace('width: 64px', 'width: calc(64px)') },
    { style: original.style + '\n.foo { background-image: url(\'/outside.png\'); }' }
  ]
  for (const variant of variants) assert.throws(() => prepareSource({ ...original, ...variant }), /Unsupported|Unbalanced|Unknown/)
  assert.throws(() => prepareSource({ ...original, template: original.template.replace('!ready', '!ready && futureWidget') }, Object.keys(buildCase('tempo-en').snapshot.bindings)), /Unknown source binding: futureWidget/)
  const root = fixture(t)
  change(root, 'src/pages/tempo/index.ux', '<div class="loading"', '<div unsupported="yes" class="loading"')
  const request = await serve(t, { root })
  const payload = JSON.parse((await request('/case/tempo-en.json')).bytes)
  assert.equal(payload.result.status, 'failed')
  assert.match(payload.result.diagnostics.join('\n'), /Unsupported attribute unsupported/)
})

test('preview rejects increment expressions without mistaking quoted plus signs for operators', () => {
  const original = buildCase('tempo-en').source
  for (const binding of ['bpm++', '++bpm', 'bpm /* gap */ ++']) {
    assert.throws(() => prepareSource({ ...original, template: `<text>{{ ${binding} }}</text>` }, ['bpm']), /Unsupported/)
  }
  const quoted = prepareSource({ ...original, template: "<text>{{ 'C++' + bpm }}</text>" }, ['bpm'])
  const scope = { bpm: 120 }
  assert.equal(quoted.functions[0](scope), 'C++120')
  assert.equal(scope.bpm, 120)
})

test('new manifest routes cannot silently disappear from the catalog', t => {
  const root = fixture(t)
  const filename = path.join(root, 'src/manifest.json')
  const manifest = JSON.parse(fs.readFileSync(filename))
  manifest.router.pages['pages/unknown'] = { component: 'index' }
  fs.writeFileSync(filename, JSON.stringify(manifest))
  assert.throws(() => buildCase('index-en', { root }), /Missing baseline preview: pages\/unknown/)
})

test('server serves exact allowlisted assets including CSS backgrounds, rejects traversal and writes', async t => {
  const request = await serve(t)
  const home = buildCase('index-en')
  assert.match(home.source.style, /url\('\/common\/icons\/play-dark.png'\)/)
  assert.match(home.source.style, /url\('\/common\/icons\/stop-dark.png'\)/)
  for (const asset of home.source.assets) {
    const response = await request(asset)
    assert.equal(response.status, 200)
    assert.equal(response.headers['content-type'], 'image/png')
    assert.deepEqual(response.bytes, fs.readFileSync(path.join(ROOT, 'src', asset)))
    assert.equal(hash(response.bytes), home.result.sourceHashes[`src${asset}`])
  }
  for (const url of ['/package.json', '/src/pages/index/index.ux', '/tests/helpers.cjs', '/.git/config', '/common/../manifest.json', '/../package.json', '/%2e%2e/package.json', '/common/%2e%2e/manifest.json', '/common%2ficons/play-dark.png', '//common/icon.png', '/common/icon.png/extra', '/case/missing.json']) {
    assert.equal((await request(url)).status, 404, url)
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) assert.equal((await request('/catalog.json', method)).status, 405)
  const shell = await request('/?case=native-173-en')
  assert.equal(shell.status, 200)
  assert.match(shell.bytes.toString(), /Browser simulation \/ 非真机截图/)
  assert.match(shell.bytes.toString(), /id="device" inert/)
  assert.match(shell.bytes.toString(), /width: 336px; height: 480px/)
  assert.equal((await request('/', 'HEAD')).bytes.length, 0)
  assert.match(shell.headers['content-security-policy'], /default-src 'self'/)
})
