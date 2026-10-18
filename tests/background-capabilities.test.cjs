const test = require('node:test')
const assert = require('node:assert/strict')
const { fakeClock } = require('./helpers.cjs')
const { collectBackgroundCapabilities, QUERIES } = require('../src/common/background-capabilities')

test('read-only capability helper preserves supported/unsupported/unknown distinctions', () => {
  const clock = fakeClock(), queried = []
  let result
  const app = {
    getInfo: () => ({ packageName: 'org.bandmetronome.app', versionName: 'test', versionCode: 20, source: 'not collected' }),
    canIUse(name) { queried.push(name); return name.endsWith('.vibrate') ? true : name.endsWith('.start') ? false : undefined }
  }
  collectBackgroundCapabilities({ app, clock, device: { getInfo: o => o.success({ model: 'test band', APILevel: 2 }) } }, r => { result = r })
  assert.deepEqual(queried, QUERIES)
  assert.equal(result.capabilities['@system.vibrator.vibrate'], 'reported-supported')
  assert.equal(result.capabilities['@system.vibrator.start'], 'reported-unsupported')
  assert.equal(result.capabilities['@system.timer'], 'unknown')
  assert.deepEqual(result.device, { model: 'test band', APILevel: 2 })
  assert.equal(result.app.source, undefined)
  assert.equal(clock.pending(), 0)
})

test('missing or throwing canIUse is not falsely called unsupported', () => {
  for (const [app, expected] of [[{}, 'query-unavailable'], [{ canIUse() { throw Error('not available') } }, 'query-error']]) {
    let result
    collectBackgroundCapabilities({ app, device: null, clock: fakeClock() }, r => { result = r })
    assert.ok(Object.values(result.capabilities).every(value => value === expected))
    assert.equal(result.deviceInfoStatus, 'unavailable')
  }
})

test('only non-identifying device fields are retained and unique-ID APIs are never touched', () => {
  let result
  const forbidden = () => { throw Error('identifying API must not be called') }
  collectBackgroundCapabilities({ app: {}, clock: fakeClock(), device: {
    getInfo: o => o.success({ model: 'Band', osVersionName: 'firmware', APILevel: 4,
      deviceId: 'private', serial: 'private', userId: 'private', mac: 'private', latitude: 1, token: 'private', brand: { unknown: 1 } }),
    getDeviceId: forbidden, getSerial: forbidden, getUserId: forbidden
  } }, r => { result = r })
  assert.deepEqual(result.device, { model: 'Band', osVersionName: 'firmware', APILevel: 4 })
  assert.ok(!JSON.stringify(result).includes('private'))
})

test('device query timeout is bounded and late/duplicate callbacks are ignored', () => {
  const clock = fakeClock(); let options; const results = []
  collectBackgroundCapabilities({ app: {}, clock, device: { getInfo: o => { options = o } } }, r => results.push(r))
  clock.advance(3000)
  options.success({ model: 'late' }); options.fail()
  assert.equal(results.length, 1)
  assert.equal(results[0].deviceInfoStatus, 'timeout')
  assert.equal(clock.pending(), 0)
})

test('cancellation suppresses delivery and clears timeout', () => {
  const clock = fakeClock(); let options; let calls = 0
  const cancel = collectBackgroundCapabilities({ app: {}, clock, device: { getInfo: o => { options = o } } }, () => calls++)
  cancel(); options.success({}); clock.advance(4000)
  assert.equal(calls, 0)
  assert.equal(clock.pending(), 0)
})

test('device failures and malformed info do not leak raw errors or extra values', () => {
  for (const getInfo of [() => { throw Error('private details') }, o => o.fail('private details')]) {
    let result
    collectBackgroundCapabilities({ app: {}, device: { getInfo }, clock: fakeClock() }, r => { result = r })
    assert.equal(result.deviceInfoStatus, 'failed')
    assert.ok(!JSON.stringify(result).includes('private'))
  }
})
