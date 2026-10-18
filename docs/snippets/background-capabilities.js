// Archived research helper; not imported by the foreground-only application.
// Read-only device/capability inventory. No vibration/audio/GPS, library loading,
// storage or network operations. A query result is not a background guarantee.
// Platform objects and timers are injected for lifecycle control and tests.
const QUERIES = [
  '@system.vibrator.vibrate', '@system.vibrator.start', '@system.vibrator.stop',
  '@system.audio', '@system.geolocation', '@system.request', '@system.event',
  // Search candidates, NOT claims that these are documented Vela interfaces.
  '@system.timer', '@system.alarm', '@system.notification'
]
const DEVICE_FIELDS = ['model', 'product', 'osVersionName',
  'osVersionCode', 'platformVersionName', 'platformVersionCode', 'APILevel']
const APP_FIELDS = ['packageName', 'versionName', 'versionCode']

function pick(values, fields) {
  const result = {}
  if (!values || typeof values !== 'object' || Array.isArray(values)) return result
  fields.forEach(field => {
    try {
      const value = values[field]
      if (typeof value === 'string') {
        const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ')
        result[field] = text.length > 120 ? text.slice(0, 117) + '...' : text
      } else if (typeof value === 'number' && isFinite(value)) result[field] = value
    } catch (error) { /* Ignore a broken metadata property, without copying its error. */ }
  })
  return result
}

function collectBackgroundCapabilities({ app, device, clock }, callback) {
  const timers = clock || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }
  const report = { schema: 1, app: {}, appInfoStatus: 'unavailable', device: {},
    deviceInfoStatus: 'pending', deviceInfoErrorCode: null, capabilities: {} }
  try {
    if (app && typeof app.getInfo === 'function') {
      report.app = pick(app.getInfo(), APP_FIELDS)
      report.appInfoStatus = 'ok'
    }
  } catch (error) { report.appInfoStatus = 'failed' }
  QUERIES.forEach(name => {
    try {
      if (!app || typeof app.canIUse !== 'function') { report.capabilities[name] = 'query-unavailable'; return }
      const value = app.canIUse(name)
      report.capabilities[name] = value === true ? 'reported-supported' : value === false ? 'reported-unsupported' : 'unknown'
    } catch (error) { report.capabilities[name] = 'query-error' }
  })
  let finished = false
  let timer = null
  function finish(status, values, code) {
    if (finished) return
    finished = true
    if (timer !== null) timers.clearTimeout(timer)
    report.deviceInfoStatus = status
    report.deviceInfoErrorCode = typeof code === 'number' && isFinite(code) ? code : null
    report.device = pick(values, DEVICE_FIELDS)
    callback(report)
  }
  try {
    if (!device || typeof device.getInfo !== 'function') {
      finish('unavailable')
    } else {
      timer = timers.setTimeout(() => finish('timeout'), 3000)
      device.getInfo({ success: value => finish('ok', value), fail: (data, code) => finish('failed', null, code) })
    }
  } catch (error) { finish('failed') }
  // Cancel on page hide/destroy. Late or repeated native callbacks are ignored.
  return () => {
    finished = true
    if (timer !== null) timers.clearTimeout(timer)
  }
}

module.exports = { collectBackgroundCapabilities, QUERIES, DEVICE_FIELDS }
