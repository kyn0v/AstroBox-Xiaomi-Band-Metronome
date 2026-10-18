// Follow the device locale; unsupported languages fall back to English.
const en = {
  title: 'METRONOME', tempo: 'TEMPO', rhythm: 'RHYTHM', appearance: 'COLORS',
  darkWake: 'Foreground dark · tap to restore', darkExit: 'Swipe right: stop and exit',
  darkStartFirst: 'Start playback before dark mode', darkVibrationFirst: 'Enable vibration for dark mode',
  darkBeatFirst: 'Set a vibrating beat first',
  start: 'Start', stop: 'Stop', tap: 'Tap Tempo',
  tapRange: 'Use 50–250 BPM',
  tempoMinimum: 'Minimum: 50 BPM', tempoMaximum: 'Maximum: 250 BPM',
  quarterUnit: 'Quarter-note BPM', dottedUnit: 'Dotted-quarter BPM',
  loading: 'Loading preferences...', ready: '← Tempo   ↑ Rhythm   ↓ Colors',
  running: 'Playing', stopped: 'Stopped',
  screenError: 'Keep-screen-on unavailable', vibrationError: 'Vibration unavailable',
  loadError: 'Could not load preferences', saveError: 'Save failed · tap to retry',
  saved: 'Saved', saving: 'Saving...',
  vibrationOn: 'Vibration on', vibrationOff: 'Vibration off',
  flashOn: 'Flash on', flashOff: 'Flash off',
  long: 'Long', short: 'Short', off: 'None',
  cycleHint: 'Tap a cell: Long → Short → None',
  vibrationNote: 'Long pulses may overlap at speed.',
  simpleGrouping: 'One cell per quarter note', compoundGrouping: 'Two groups of three eighth notes',
  returnHint: 'Swipe right to return',
  mint: 'Mint', blue: 'Sky blue', violet: 'Lavender', amber: 'Amber',
  welcome: 'Welcome', welcomeSubtitle: 'One screen. One task.',
  swipeLeft: '← Tempo', swipeUp: '↑ Rhythm', swipeDown: '↓ Colors',
  swipeRight: '→ Back / exit',
  quickGuide: 'Tap BPM or meter to configure.\nHold meter for this guide.',
  letsPlay: 'Let\'s play'
}

const zh = {
  title: '节拍器', tempo: '调整速度', rhythm: '节拍编排', appearance: '主题配色',
  darkWake: '前台暗屏 · 点击恢复', darkExit: '右滑停止并退出',
  darkStartFirst: '开始播放后可进入暗屏', darkVibrationFirst: '请先开启振动',
  darkBeatFirst: '请先设置有振动的拍位',
  start: '开始', stop: '停止', tap: '击拍测速',
  tapRange: '请使用 50–250 BPM',
  tempoMinimum: '最低 50 BPM', tempoMaximum: '最高 250 BPM',
  quarterUnit: '四分音符 BPM', dottedUnit: '附点四分音符 BPM',
  loading: '正在读取偏好', ready: '← 调速  ↑ 节拍  ↓ 配色',
  running: '播放中', stopped: '已停止',
  screenError: '无法保持亮屏', vibrationError: '振动不可用',
  loadError: '无法读取偏好', saveError: '保存失败，点此重试',
  saved: '已保存', saving: '正在保存',
  vibrationOn: '振动已开启', vibrationOff: '振动已关闭',
  flashOn: '闪烁已开启', flashOff: '闪烁已关闭',
  long: '长', short: '短', off: '无',
  cycleHint: '点格子切换：长 → 短 → 无',
  vibrationNote: '快拍时长振动可能连在一起',
  simpleGrouping: '每格一个四分音符', compoundGrouping: '两组三连分组，每格一个八分音符',
  returnHint: '右滑返回',
  mint: '薄荷绿', blue: '天空蓝', violet: '薰衣草紫', amber: '琥珀黄',
  welcome: '欢迎使用', welcomeSubtitle: '一页一件事，专注节奏',
  swipeLeft: '← 左滑：调整速度', swipeUp: '↑ 上滑：节拍编排', swipeDown: '↓ 下滑：主题配色',
  swipeRight: '→ 右滑：返回／退出',
  quickGuide: '点击速度或拍号也能进入设置\n长按拍号重看指南',
  letsPlay: '开始使用'
}

function getStrings(systemLanguage) {
  const selected = String(systemLanguage || 'en').toLowerCase()
  return Object.assign({}, selected === 'zh' || selected.indexOf('zh-') === 0 || selected.indexOf('zh_') === 0 ? zh : en)
}

module.exports = { getStrings }
