const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { pageHarness, fakeClock } = require('./helpers.cjs')
const { collectBackgroundCapabilities, QUERIES } = require('../src/common/background-capabilities')
const { getCapabilityStrings } = require('../src/common/capability-strings')
const { buildCapabilityPages, capabilityStatus } = require('../src/common/capability-view')

function open(h) { h.page.onHide(); return h.createPage('capabilities') }

test('capability entry is independent of the background experiment and preserves normal navigation', () => {
  const h = pageHarness(); h.page.onHide(); const a = h.createPage('appearance')
  a.openCapabilities()
  assert.equal(h.calls.routes.at(-1), '/pages/capabilities')
  assert.equal(h.calls.routeOptions.at(-1).params, undefined)
  a.openCapabilities(); assert.equal(h.calls.routes.length, 1)
  assert.equal(h.calls.vibrations.length, 0)
})

test('read-only page collects real API results, not manifest minAPILevel or hard-coded model values', () => {
  const h = pageHarness({ locale: 'zh-CN', capabilityQuery: name => name.endsWith('.vibrate') })
  const p = open(h)
  assert.equal(p.loading, false)
  assert.equal(p.pageCount, 5)
  assert.equal(p.rows.find(r => r.id === 'model').value, 'test-band')
  assert.equal(p.rows.find(r => r.id === 'api-level').value, '2')
  assert.deepEqual(h.calls.capabilityQueries, QUERIES)
  assert.equal(h.calls.deviceInfoReads, 1)
  assert.equal(h.calls.identityReads, 0)
  assert.deepEqual(h.calls.vibrations, [])
  assert.deepEqual(h.calls.keepScreenOn, [])
  assert.deepEqual(h.calls.writes, [])
  assert.deepEqual(h.calls.probeWrites, [])
  assert.equal(h.clock.pending(), 0)
  p.nextPage(); p.nextPage()
  assert.deepEqual(p.rows.map(r => r.value), ['报告支持', '报告不支持', '报告不支持'])
  assert.match(p.note, /不代表/)
})

test('five panels remain bounded and candidate names are explicitly unconfirmed', () => {
  const h = pageHarness(); const p = open(h)
  for (let i = 0; i < 10; i++) p.nextPage()
  assert.equal(p.pageIndex, 4)
  assert.match(p.panelTitle, /UNLISTED/)
  assert.match(p.note, /not confirmed/)
  assert.equal(p.rows.length, 3)
  for (let i = 0; i < 10; i++) p.previousPage()
  assert.equal(p.pageIndex, 0)
  assert.equal(p.pageCounter, '1 / 5')
  assert.equal(h.calls.deviceInfoReads, 1)
})

test('missing query API remains cannot-query, not unsupported, while device information still works', () => {
  const h = pageHarness(); const p = open(h)
  assert.match(p.status, /query API unavailable/)
  p.nextPage(); p.nextPage()
  assert.ok(p.rows.every(row => row.value === 'Cannot query'))
  h.setLocale('zh-CN'); p.onConfigurationChanged()
  assert.match(p.status, /未提供能力查询/)
  assert.ok(p.rows.every(row => row.value === '无法查询'))
})

test('missing device module, thrown device API and numeric failure codes are handled', () => {
  for (const options of [{ deviceImportFails: true }, { deviceInfoThrows: true }, { deviceInfoFails: true }]) {
    const h = pageHarness(options); const p = open(h)
    assert.equal(p.loading, false)
    assert.ok(p.rows.every(row => row.value === 'Not returned'))
    assert.match(p.status, /unavailable|failed/)
    if (options.deviceInfoFails) assert.match(p.status, /203/)
    assert.equal(h.clock.pending(), 0)
  }
})

test('three-second timeout can be rechecked; late callbacks cannot overwrite the newer result', () => {
  const h = pageHarness({ deferDeviceInfo: true }); const p = open(h)
  p.recheck(); assert.equal(h.calls.deviceInfoReads, 1)
  h.clock.advance(3000)
  assert.equal(p.loading, false); assert.match(p.status, /timed out/)
  p.recheck(); assert.equal(p.loading, true); assert.equal(h.calls.deviceInfoReads, 2)
  h.finishDeviceInfo(0, { model: 'stale' })
  assert.equal(p.loading, true)
  h.finishDeviceInfo(1, { model: 'new result', APILevel: 3 })
  assert.equal(p.loading, false)
  assert.equal(p.rows[0].value, 'new result')
  assert.equal(h.clock.pending(), 0)
})

test('hide/destroy cancels queries and re-show starts only an interrupted query again', () => {
  const h = pageHarness({ deferDeviceInfo: true }); const p = open(h)
  p.nextPage(); p.onHide()
  assert.equal(h.clock.pending(), 0)
  h.finishDeviceInfo(0, { model: 'hidden result' })
  assert.equal(p._report, null)
  p.onShow(); assert.equal(h.calls.deviceInfoReads, 2); assert.equal(p.pageIndex, 1)
  h.finishDeviceInfo(1, { platformVersionName: 'current runtime' })
  assert.equal(p.rows[0].value, 'current runtime')
  p.onHide(); p.onShow()
  assert.equal(h.calls.deviceInfoReads, 2)
  p.recheck(); p.onDestroy(); h.finishDeviceInfo(2, { model: 'destroyed result' })
  assert.equal(p._report, null)
  assert.equal(h.clock.pending(), 0)
})

test('long metadata opens readable details; back closes detail before leaving the page', () => {
  const value = 'runtime-build-' + 'x'.repeat(100)
  const h = pageHarness({ deviceInfo: { model: value } }); const p = open(h)
  p.showDetail('model')
  assert.equal(p.detailVisible, true)
  assert.equal(p.detailValue.replace(/\n/g, ''), value)
  assert.equal(p.onBackPress(), true)
  assert.equal(p.detailVisible, false)
  assert.equal(h.calls.routes.length, 0)
  p.showDetail('model'); p.goBack(); assert.equal(p.detailVisible, false)
  p.goBack(); assert.equal(h.calls.routes.at(-1), 'back')
})

test('system back clears a pending timeout and does not claim successful detection', () => {
  const h = pageHarness({ deferDeviceInfo: true }); const p = open(h)
  assert.equal(p.onBackPress(), false)
  assert.equal(p.onBackPress(), true)
  assert.equal(h.clock.pending(), 0)
  h.finishDeviceInfo(0, { model: 'late' })
  assert.equal(p._report, null)
})

test('entering the capability page stops a retained vibration experiment', () => {
  const h = pageHarness(); h.page.onHide(); const probe = h.createPage('probe')
  probe.toggleRunning(); probe.onHide()
  const count = h.calls.vibrations.length
  const p = h.createPage('capabilities')
  h.clock.advance(1000)
  assert.equal(h.calls.vibrations.length, count)
  assert.equal(h.app.getBackgroundProbe().snapshot().running, false)
  assert.equal(h.calls.keepScreenOn.at(-1), false)
  assert.equal(p.loading, false)
  assert.equal(h.clock.pending(), 0)
})

test('localized view labels and states are complete, with at most four rows per panel', () => {
  for (const language of ['en', 'zh']) {
    const labels = getCapabilityStrings(language)
    for (const state of ['reported-supported', 'reported-unsupported', 'query-unavailable', 'query-error', 'unknown']) {
      const report = { device: {}, app: {}, deviceInfoStatus: 'ok', capabilities: Object.fromEntries(QUERIES.map(q => [q, state])) }
      const pages = buildCapabilityPages(report, labels)
      assert.equal(pages.length, 5)
      for (const page of pages) {
        assert.equal(typeof page.title, 'string'); assert.equal(typeof page.note, 'string')
        assert.ok(page.rows.length <= 4)
        for (const row of page.rows) { assert.equal(typeof row.label, 'string'); assert.equal(typeof row.value, 'string') }
      }
      assert.equal(typeof capabilityStatus(report, labels), 'string')
    }
  }
})

test('production manifest adds only device metadata, with no identifying permissions or keep-alive feature', () => {
  const m = JSON.parse(fs.readFileSync('src/manifest.json'))
  assert.equal(m.permissions, undefined)
  assert.equal(m.config.background, undefined)
  assert.deepEqual(m.features.map(f => f.name).sort(), [
    'system.app', 'system.brightness', 'system.configuration', 'system.device', 'system.router', 'system.storage', 'system.vibrator'
  ])
  const source = fs.readFileSync('src/pages/capabilities/index.ux', 'utf8')
  assert.ok(!source.includes('getDeviceId'))
  assert.ok(!source.includes('getSerial'))
  assert.ok(!source.includes("require('@system.audio')"))
  assert.ok(!source.includes("require('@system.geolocation')"))
})

test('metadata getters, control characters, overlong strings and non-boolean queries stay bounded', () => {
  const info = { model: 'a\u0000b\nc', osVersionName: 'x'.repeat(200), APILevel: NaN }
  Object.defineProperty(info, 'product', { get() { throw Error('private details') } })
  let report
  const app = { getInfo() { throw Error('private details') } }
  Object.defineProperty(app, 'canIUse', { get() { throw Error('private details') } })
  collectBackgroundCapabilities({ app, device: { getInfo: o => o.success(info) }, clock: fakeClock() }, r => { report = r })
  assert.equal(report.appInfoStatus, 'failed')
  assert.equal(report.device.model, 'a b c')
  assert.equal(report.device.product, undefined)
  assert.equal(report.device.APILevel, undefined)
  assert.equal(report.device.osVersionName.length, 120)
  assert.ok(report.device.osVersionName.endsWith('...'))
  assert.ok(Object.values(report.capabilities).every(value => value === 'query-error'))
  assert.ok(!JSON.stringify(report).includes('private'))
})
