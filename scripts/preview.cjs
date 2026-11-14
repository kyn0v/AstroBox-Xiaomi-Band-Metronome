const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { prepareSource } = require('./preview-browser.js')

/** @typedef {{id: string, locale: string, route: string, watch6?: boolean, options?: object, exercise?: Function, expected: object}} Case */
/** @typedef {{caseId: string, bindings: object, pickerDigits: string[]}} Snapshot */
/** @typedef {{filename: string, template: string, style: string, assets: string[], hashes: Object<string, string>}} SourceBundle */
/** @typedef {{status: 'pending'|'ready'|'failed', caseId: string, diagnostics: string[], assumptions: string[], sourceHashes: Object<string, string>, rendered?: object}} Result */

const ROOT = path.join(__dirname, '..')
const ASSUMPTIONS = [
  'Browser simulation / 非真机截图. Not Vela or hardware compatibility evidence.',
  '336×480 Band 9 Pro or ~336×400 Watch 6 logical application area. Browser fonts, flex layout and corners approximate Vela.',
  'Native picker is static, with assumed height 144px. Width, fonts and colors come from source.',
  'Controls are inert. Cases run real page handlers and a fake clock before rendering.',
  'Band 9 Pro is user-accepted. Band 10 Pro and REDMI Watch 6 are layout preparation only; hardware is unverified.'
]

/** @type {Case[]} */
const cases = ['en', 'zh'].flatMap(locale => ['index', 'tempo', 'rhythm', 'appearance'].flatMap(page => [
  { id: `${page}-${locale}`, locale, route: `pages/${page}`, expected: { ready: true } },
  { id: `watch6-${page}-${locale}`, locale, route: `pages/${page}`, watch6: true, expected: { ready: true } }
]))
function edge(id, locale, page, options, exercise, expected, watch6 = false) {
  cases.push({ id, locale, route: `pages/${page}`, options, exercise, expected, watch6 })
}
function native173(page) {
  page.onNativePickerChange(page.pickerEntries[1].id, { newValue: '7' })
  page.onNativePickerChange(page.pickerEntries[2].id, { newValue: '3' })
}
for (const locale of ['en', 'zh']) {
  edge(`welcome-${locale}`, locale, 'index', { preferences: { onboardingDone: false } }, null, { showWelcome: true })
  edge(`rhythm-six-${locale}`, locale, 'rhythm', { preferences: { meter: '6/8' } }, page => page.cycleSlot(3), { meter: '6/8', cellWidth: 84 })
}
edge('running-six-en', 'en', 'index', { preferences: { meter: '6/8', bpm: 60, theme: 'amber' } }, (page, h) => {
  page.toggleRunning()
  h.clock.advance(1050)
}, { running: true, currentBeat: 3, lit: true })
edge('dark-zh', 'zh', 'index', {}, (page, h) => {
  page.toggleRunning()
  page.enterDark()
  h.clock.advance(1500)
}, { running: true, dark: true })
for (const theme of ['blue', 'violet', 'amber']) {
  edge(`appearance-${theme}-en`, 'en', 'appearance', {}, page => page.chooseTheme(theme), { theme })
}
edge('native-173-en', 'en', 'tempo', {}, native173, { bpm: 173 })
edge('tap-reset-en', 'en', 'tempo', {}, (page, h) => {
  native173(page)
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(500)
    page.tapTempo()
  }
}, { bpm: 120, tapLit: true })
edge('clamp-low-zh', 'zh', 'tempo', { preferences: { bpm: 50 } }, page => {
  page.onNativePickerChange(page.pickerEntries[1].id, { newValue: '0' })
}, { bpm: 50 })
edge('clamp-high-en', 'en', 'tempo', { preferences: { bpm: 250 } }, page => {
  page.onNativePickerChange(page.pickerEntries[2].id, { newValue: '9' })
}, { bpm: 250 })
edge('loading-zh', 'zh', 'tempo', { deferLoad: true }, null, { ready: false })
edge('save-error-en', 'en', 'tempo', { saveFails: true }, native173, { bpm: 173, warning: true })
edge('watch6-welcome-zh', 'zh', 'index', { preferences: { onboardingDone: false } }, null, { showWelcome: true }, true)
edge('watch6-rhythm-six-zh', 'zh', 'rhythm', { preferences: { meter: '6/8' } }, null, { meter: '6/8', cellWidth: 84 }, true)
edge('watch6-dark-en', 'en', 'index', {}, (page, h) => {
  page.toggleRunning()
  page.enterDark()
  h.clock.advance(1500)
}, { running: true, dark: true }, true)

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function sourceFiles(root) {
  function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
      const name = `${dir}/${entry.name}`
      return entry.isDirectory() ? walk(name) : [name]
    })
  }
  return [...walk('src'), 'tests/helpers.cjs', 'scripts/preview.cjs', 'scripts/preview-browser.js'].sort()
}
function loadSources(root) {
  return new Map(sourceFiles(root).map(name => [name, fs.readFileSync(path.join(root, name))]))
}
function buildCase(id, { root = ROOT } = {}) {
  const scenario = cases.find(item => item.id === id)
  if (!scenario) throw new Error(`Unknown preview case: ${id}`)
  const files = loadSources(root)
  const manifest = JSON.parse(files.get('src/manifest.json'))
  const routes = Object.keys(manifest.router.pages)
  for (const route of routes) {
    for (const locale of ['en', 'zh']) {
      if (!cases.some(item => item.route === route && item.locale === locale && !item.exercise && !item.options)) {
        throw new Error(`Missing baseline preview: ${route} ${locale}`)
      }
    }
  }
  if (!routes.includes(scenario.route)) throw new Error(`Case route missing from manifest: ${scenario.route}`)
  if (manifest.config.designWidth !== 336) throw new Error('Review preview geometry after designWidth changes')
  const hashes = Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)]))
  const assets = [...files.keys()].filter(name => /^src\/common\/(?:icons\/)?[^/]+\.png$/.test(name)).map(name => name.slice(3))
  const filename = `src/${scenario.route}/${manifest.router.pages[scenario.route].component}.ux`
  const ux = files.get(filename)?.toString()
  if (!ux) throw new Error(`Missing source for route ${scenario.route}`)
  const template = ux.match(/<template>([\s\S]*?)<\/template>/)?.[1]
  const style = ux.match(/<style>([\s\S]*?)<\/style>/)?.[1]
  if (!template || !style) throw new Error(`Expected template and style sections in ${filename}`)
  /** @type {SourceBundle} */
  const source = { filename, template, style, assets, hashes }
  const { pageHarness } = require(path.join(root, 'tests/helpers.cjs'))
  const h = pageHarness({ ...scenario.options, locale: scenario.locale })
  let page = h.page
  if (scenario.route !== manifest.router.entry) {
    h.page.onHide()
    page = h.createPage(scenario.route.split('/').at(-1))
  }
  try {
    if (scenario.exercise) scenario.exercise(page, h)
    for (const [key, expected] of Object.entries(scenario.expected)) {
      if (page[key] !== expected) throw new Error(`${id}: expected ${key}=${expected}, got ${page[key]}`)
    }
    const bindings = JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(page.private).map(key => [key, page[key]]))))
    prepareSource(source, Object.keys(bindings))
    /** @type {Snapshot} */
    const snapshot = {
      caseId: id, bindings,
      pickerDigits: scenario.route === 'pages/tempo' ? String(page.bpm).padStart(3, '0').split('') : []
    }
    return {
      case: { id, locale: scenario.locale, route: scenario.route, expected: scenario.expected },
      snapshot, source, viewport: { width: manifest.config.designWidth, height: scenario.watch6 ? 400 : 480, wide: !!scenario.watch6 },
      result: { status: 'pending', caseId: id, diagnostics: [], assumptions: ASSUMPTIONS, sourceHashes: hashes }
    }
  } finally {
    page.onDestroy()
    if (page !== h.page) h.page.onDestroy()
  }
}

const SHELL = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Band Metronome browser simulation</title>
<style>
body { margin: 24px; background: #e2e8f0; color: #172033; font: 16px system-ui, sans-serif; }
#capture { width: 336px; background: white; }
#device { width: 336px; height: 480px; position: relative; overflow: hidden; }
#caption { padding: 10px 8px; font-size: 13px; line-height: 20px; }
#caption strong, #caption span { display: block; }
#diagnostics { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 1000px; }
#catalog a { display: inline-block; margin: 6px 12px 6px 0; }
</style>
<h1>Band Metronome browser simulation</h1>
<nav id="catalog" aria-label="Preview cases"></nav>
<div id="capture" hidden><div id="device" inert></div><div id="caption"><strong>Browser simulation / 非真机截图</strong><span id="case-caption"></span><span id="geometry-caption">336×480 · Static native picker, assumed 144px height</span></div></div>
<pre id="diagnostics" role="status">Loading preview catalog...</pre>
<script src="/preview-browser.js"></script>
</html>`

function createPreviewServer({ root = ROOT } = {}) {
  const files = loadSources(root)
  const known = new Map([
    ['/', ['text/html; charset=utf-8', Buffer.from(SHELL)]],
    ['/preview-browser.js', ['text/javascript; charset=utf-8', files.get('scripts/preview-browser.js')]]
  ])
  const catalog = cases.map(({ id, locale, route }) => ({ id, locale, route }))
  known.set('/catalog.json', ['application/json; charset=utf-8', Buffer.from(JSON.stringify(catalog))])
  for (const [name, bytes] of files) {
    if (/^src\/common\/(?:icons\/)?[^/]+\.png$/.test(name)) known.set(name.slice(3), ['image/png', bytes])
  }
  for (const { id, locale, route } of cases) {
    try {
      known.set(`/case/${id}.json`, ['application/json; charset=utf-8', Buffer.from(JSON.stringify(buildCase(id, { root })))])
    } catch (error) {
      known.set(`/case/${id}.json`, ['application/json; charset=utf-8', Buffer.from(JSON.stringify({
        case: { id, locale, route },
        result: { status: 'failed', caseId: id, diagnostics: [error.message], assumptions: ASSUMPTIONS,
          sourceHashes: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])) }
      }))])
    }
  }
  return http.createServer((request, response) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end('Read-only preview')
      return
    }
    // Match raw URL paths, before URL normalization can hide traversal attempts.
    const pathname = request.url.split('?')[0]
    const entry = known.get(pathname)
    if (!entry) { response.writeHead(404, headers).end('Unknown preview file'); return }
    response.writeHead(200, { ...headers, 'Content-Type': entry[0] })
    response.end(request.method === 'HEAD' ? undefined : entry[1])
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535')
  const server = createPreviewServer()
  server.on('error', error => { console.error(error.message); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => {
    console.log(`Browser simulation / 非真机截图: http://127.0.0.1:${server.address().port}/`)
    console.log(`${cases.length} static source-derived cases. No emulator, RPK or device connection. Ctrl+C to stop.`)
  })
}
module.exports = { cases, buildCase, createPreviewServer }
