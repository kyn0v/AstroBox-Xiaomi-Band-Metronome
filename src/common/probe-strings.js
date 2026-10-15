// The diagnostic wording deliberately does not promise background support.
const en = {
  title: 'BACKGROUND TEST',
  warning: 'Not guaranteed in background.\nThe system may pause or close it.',
  idle: 'Ready · maximum 5 minutes', running: 'Test running · 5 min limit',
  manual: 'Stopped manually', limit: '5-minute limit reached',
  timerGap: 'Stopped: timer was suspended', clockChanged: 'Stopped: clock changed',
  vibrationError: 'Stopped: vibration unavailable', destroyed: 'App closed; test stopped',
  home: 'Stopped on return to Home', interrupted: 'Previous run interrupted/unknown',
  start: 'Start 5 min', stop: 'Stop', leave: 'Try leaving', dim: 'Dark screen',
  homeButton: 'Stop & Home', wake: 'Foreground only · tap to return',
  callbacks: 'Hidden / total callbacks', hides: 'App-hide events', gap: 'Largest gap',
  note: 'Counters do not prove vibration.',
  noVibration: 'Enable vibration and a beat first.',
  saveError: 'Report storage unavailable', screenError: 'Keep-screen-on unavailable',
  routeError: 'Could not leave; test stopped', loading: 'Loading test report...'
}
const zh = {
  title: '后台运行试验',
  warning: '不保证后台运行\n系统可能暂停或关闭应用',
  idle: '待开始 · 最长 5 分钟', running: '试验中 · 最长 5 分钟',
  manual: '已手动停止', limit: '已达到 5 分钟上限',
  timerGap: '定时中断，已停止', clockChanged: '系统时间变化，已停止',
  vibrationError: '振动不可用，已停止', destroyed: '应用关闭，试验已停止',
  home: '返回首页，试验已停止', interrupted: '上次中断，后台情况未知',
  start: '开始 5 分钟', stop: '停止', leave: '尝试返回表盘', dim: '前台暗屏',
  homeButton: '停止并回首页', wake: '仍在前台 · 点击返回',
  callbacks: '后台 / 总回调', hides: '应用隐藏事件', gap: '最长间隔',
  note: '计数不代表马达实际振动',
  noVibration: '请先开启振动并设置拍位',
  saveError: '试验记录存储不可用', screenError: '无法保持亮屏',
  routeError: '无法返回系统，试验已停止', loading: '正在读取试验记录'
}
function getProbeStrings(language) {
  const value = String(language || 'en').toLowerCase()
  return Object.assign({}, value === 'zh' || value.indexOf('zh-') === 0 || value.indexOf('zh_') === 0 ? zh : en)
}
module.exports = { getProbeStrings }
