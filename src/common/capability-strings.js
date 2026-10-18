const en = {
  title: 'READ-ONLY CHECK', deviceTitle: 'DEVICE / FIRMWARE', runtimeTitle: 'RUNTIME / APP',
  vibrationTitle: 'VIBRATION API', backgroundTitle: 'BACKGROUND-RELATED', candidateTitle: 'UNLISTED CANDIDATES',
  reading: 'Reading device information...', complete: 'Read-only check complete', idle: 'Tap Recheck to run again',
  deviceUnavailable: 'Device-info API unavailable', deviceFailed: 'Device-info query failed', deviceTimeout: 'Device-info query timed out',
  queriesUnavailable: 'Capability-query API unavailable', queriesError: 'Some capability queries failed',
  notProvided: 'Not returned', pending: 'Waiting', supported: 'Reported yes', unsupported: 'Reported no',
  queryUnavailable: 'Cannot query', queryError: 'Query error', unknown: 'Unknown result',
  model: 'Model', product: 'Product', firmware: 'OS version', apiLevel: 'Device API Level',
  runtime: 'Runtime version', runtimeCode: 'Runtime version code', osCode: 'OS version code', appVersion: 'App version / code',
  previous: 'Prev', next: 'Next', recheck: 'Recheck', back: 'Back', close: 'Close',
  metadataNote: 'Tap a value for details. No device ID collected.',
  capabilityNote: 'Reported support is not a background guarantee.',
  candidateNote: 'Unlisted query names, not confirmed Vela APIs.',
  detailNote: 'Read-only result. No service was started.',
  detailMissing: 'No value returned', code: 'code'
}
const zh = {
  title: '设备能力检测 · 只读', deviceTitle: '设备与固件', runtimeTitle: '运行时与应用',
  vibrationTitle: '振动接口', backgroundTitle: '后台相关接口', candidateTitle: '未公开候选接口',
  reading: '正在读取设备信息', complete: '只读检测完成', idle: '点击重新检测',
  deviceUnavailable: '设备信息接口未提供', deviceFailed: '设备信息读取失败', deviceTimeout: '设备信息读取超时',
  queriesUnavailable: '系统未提供能力查询接口', queriesError: '部分能力查询异常',
  notProvided: '未返回', pending: '等待检测', supported: '报告支持', unsupported: '报告不支持',
  queryUnavailable: '无法查询', queryError: '查询异常', unknown: '结果未知',
  model: '设备型号', product: '设备代号', firmware: '系统版本', apiLevel: '设备 API Level',
  runtime: '运行时版本', runtimeCode: '运行时版本号', osCode: '系统版本号', appVersion: '应用版本 / 版本号',
  previous: '上一页', next: '下一页', recheck: '重新检测', back: '返回', close: '关闭',
  metadataNote: '点击数值可看详情；不读取设备唯一标识',
  capabilityNote: '报告支持不代表能在后台持续运行',
  candidateNote: '仅查询候选名称，不代表官方存在此接口',
  detailNote: '只读结果，没有启动任何服务',
  detailMissing: '系统未返回此项', code: '代码'
}
function getCapabilityStrings(language) {
  const value = String(language || 'en').toLowerCase()
  return Object.assign({}, value === 'zh' || value.indexOf('zh-') === 0 || value.indexOf('zh_') === 0 ? zh : en)
}
module.exports = { getCapabilityStrings }
