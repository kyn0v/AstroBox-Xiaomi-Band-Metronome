const { QUERIES } = require('./background-capabilities')
const STATE_LABELS = {
  'reported-supported': 'supported', 'reported-unsupported': 'unsupported',
  'query-unavailable': 'queryUnavailable', 'query-error': 'queryError', unknown: 'unknown'
}
function buildCapabilityPages(report, labels) {
  const device = report ? report.device : {}
  const app = report ? report.app : {}
  const value = input => input === undefined || input === null || input === '' ? labels.notProvided : String(input)
  const info = (id, label, input) => ({ id, label, value: value(input) })
  const feature = (name, label) => {
    const state = report && report.capabilities[name]
    return { id: name, label, value: report ? labels[STATE_LABELS[state] || 'unknown'] : labels.pending }
  }
  let appVersion = value(app.versionName)
  if (app.versionCode !== undefined) appVersion += ' / ' + app.versionCode
  return [
    { title: labels.deviceTitle, note: labels.metadataNote, rows: [
      info('model', labels.model, device.model), info('product', labels.product, device.product),
      info('firmware', labels.firmware, device.osVersionName), info('api-level', labels.apiLevel, device.APILevel)
    ] },
    { title: labels.runtimeTitle, note: labels.metadataNote, rows: [
      info('runtime', labels.runtime, device.platformVersionName), info('runtime-code', labels.runtimeCode, device.platformVersionCode),
      info('os-code', labels.osCode, device.osVersionCode), info('app-version', labels.appVersion, report ? appVersion : undefined)
    ] },
    { title: labels.vibrationTitle, note: labels.capabilityNote, rows: [
      feature('@system.vibrator.vibrate', 'vibrator.vibrate'), feature('@system.vibrator.start', 'vibrator.start'), feature('@system.vibrator.stop', 'vibrator.stop')
    ] },
    { title: labels.backgroundTitle, note: labels.capabilityNote, rows: [
      feature('@system.audio', 'system.audio'), feature('@system.geolocation', 'system.geolocation'),
      feature('@system.request', 'system.request'), feature('@system.event', 'system.event')
    ] },
    { title: labels.candidateTitle, note: labels.candidateNote, rows: [
      feature('@system.timer', 'system.timer'), feature('@system.alarm', 'system.alarm'), feature('@system.notification', 'system.notification')
    ] }
  ]
}
function capabilityStatus(report, labels) {
  if (!report) return labels.idle
  const failure = { unavailable: 'deviceUnavailable', failed: 'deviceFailed', timeout: 'deviceTimeout' }[report.deviceInfoStatus]
  if (failure) {
    return labels[failure] + (report.deviceInfoErrorCode === null || report.deviceInfoErrorCode === undefined ? '' : ' (' + report.deviceInfoErrorCode + ')')
  }
  if (QUERIES.every(name => report.capabilities[name] === 'query-unavailable')) return labels.queriesUnavailable
  if (QUERIES.some(name => report.capabilities[name] === 'query-error')) return labels.queriesError
  return labels.complete
}
function wrapCapabilityDetail(text) {
  const chars = Array.from(String(text))
  const width = /[^\x00-\x7f]/.test(text) ? 14 : 26
  const lines = []
  for (let i = 0; i < chars.length; i += width) lines.push(chars.slice(i, i + width).join(''))
  return lines.join('\n')
}
module.exports = { buildCapabilityPages, capabilityStatus, wrapCapabilityDetail }
