// Diagnostic only: app-owned timers do NOT grant system background execution.
const { createMetronome } = require('./metronome')
const { getMeter } = require('./rhythm')
const { normalizePreferences } = require('./preferences')
const PROBE_STORAGE_KEY = 'metronome.background-probe.v1'
const PROBE_LIMIT_MS = 5 * 60 * 1000
const REASONS = ['running', 'manual', 'limit', 'timerGap', 'clockChanged', 'vibrationError', 'destroyed', 'home', 'interrupted']

function readReport(raw) {
  const value = raw ? JSON.parse(raw) : null
  if (!value || value.schema !== 1 || REASONS.indexOf(value.reason) < 0) return null
  const result = { schema: 1, reason: value.reason, meter: getMeter(value.meter).id }
  for (const field of ['startedAt', 'endedAt', 'bpm', 'ticks', 'hiddenTicks', 'appHideCount', 'maxGapMs', 'lastAt']) {
    if (typeof value[field] !== 'number' || !isFinite(value[field]) || value[field] < 0) return null
    result[field] = value[field]
  }
  // A persisted running marker is not evidence of continued execution.
  if (result.reason === 'running') { result.reason = 'interrupted'; result.endedAt = 0 }
  return result
}

function createBackgroundProbe({ clock, storage, vibrate, keepScreenOn }) {
  let loaded = false
  let loading = false
  let destroyed = false
  let running = false
  let appVisible = true
  let pageVisible = false
  let leaving = false
  let screenHeld = false
  let screenError = false
  let saveError = false
  let report = null
  let engine = null
  let deadlineTimer = null
  let generation = 0
  let hasTick = false
  let expectedInterval = 500
  let pattern = []
  let readers = []
  let writing = false
  let pendingWrite = null
  const listeners = new Set()

  function snapshot() {
    return { loaded, running, appVisible, pageVisible, screenError, saveError,
      report: report ? Object.assign({}, report) : null }
  }
  function emit() {
    if (pageVisible && !destroyed) listeners.forEach(callback => callback(snapshot()))
  }
  function writeNext() {
    if (writing || pendingWrite === null) return
    const value = pendingWrite
    pendingWrite = null
    writing = true
    let settled = false
    function finish(ok) {
      if (settled) return
      settled = true
      writing = false
      saveError = !ok
      emit()
      writeNext()
    }
    try { storage.set({ key: PROBE_STORAGE_KEY, value, success: () => finish(true), fail: () => finish(false) }) }
    catch (error) { finish(false) }
  }
  function save() {
    if (!report) return
    pendingWrite = JSON.stringify(report)
    writeNext()
  }
  function syncScreen() {
    const wanted = running && appVisible && pageVisible && !leaving && !destroyed
    if (wanted === screenHeld) return
    screenHeld = wanted
    const token = generation
    const fail = () => {
      if (token !== generation || destroyed) return
      screenError = true
      emit()
    }
    try { keepScreenOn(wanted, fail) } catch (error) { fail() }
  }
  function stop(reason = 'manual') {
    if (!running) return
    running = false
    generation++
    if (engine) engine.stop()
    if (deadlineTimer !== null) clock.clearTimeout(deadlineTimer)
    deadlineTimer = null
    report.reason = reason
    report.endedAt = clock.now()
    leaving = false
    syncScreen()
    save()
    emit()
  }
  function guard() {
    if (!running) return false
    const now = clock.now()
    if (now < report.startedAt || (hasTick && now < report.lastAt)) { stop('clockChanged'); return false }
    const gap = hasTick ? now - report.lastAt : 0
    report.maxGapMs = Math.max(report.maxGapMs, gap)
    if (now - report.startedAt >= PROBE_LIMIT_MS) { stop('limit'); return false }
    if (hasTick && gap > Math.max(1500, expectedInterval * 3)) { stop('timerGap'); return false }
    return true
  }
  function beat(index) {
    if (!guard()) return
    report.lastAt = clock.now()
    hasTick = true
    report.ticks++
    if (!appVisible) report.hiddenTicks++
    const mode = pattern[index]
    if (mode !== 'off') {
      try { vibrate(mode) } catch (error) { stop('vibrationError'); return }
    }
    // These are JS callback counts, not confirmations from the physical motor.
    emit()
  }
  function load(callback) {
    if (destroyed) return
    if (loaded) { callback(snapshot()); return }
    readers.push(callback)
    if (loading) return
    loading = true
    let settled = false
    function finish(raw, failed) {
      if (settled || destroyed) return
      settled = true
      try { report = readReport(raw) } catch (error) { report = null; failed = true }
      saveError = failed
      loaded = true
      loading = false
      const callbacks = readers
      readers = []
      emit()
      callbacks.forEach(reader => reader(snapshot()))
    }
    try { storage.get({ key: PROBE_STORAGE_KEY, default: '', success: raw => finish(raw, false), fail: () => finish('', true) }) }
    catch (error) { finish('', true) }
  }

  return {
    load, snapshot, stop,
    subscribe(callback) {
      if (destroyed) return () => {}
      listeners.add(callback)
      callback(snapshot())
      return () => listeners.delete(callback)
    },
    start(preferences) {
      if (!loaded || running || destroyed || !appVisible || !pageVisible) return false
      const values = normalizePreferences(preferences)
      pattern = values.patterns[values.meter].slice()
      if (!values.vibration || pattern.every(mode => mode === 'off')) return false
      generation++
      screenError = false
      leaving = false
      hasTick = false
      expectedInterval = 60000 / values.bpm / getMeter(values.meter).divisions
      report = { schema: 1, reason: 'running', startedAt: clock.now(), endedAt: 0,
        bpm: values.bpm, meter: values.meter, ticks: 0, hiddenTicks: 0,
        appHideCount: 0, maxGapMs: 0, lastAt: 0 }
      running = true
      engine = createMetronome(beat, clock)
      engine.setBpm(values.bpm)
      engine.setMeter(values.meter)
      const token = generation
      deadlineTimer = clock.setTimeout(() => { if (token === generation) stop('limit') }, PROBE_LIMIT_MS)
      syncScreen()
      save()
      engine.start()
      emit()
      return true
    },
    setAppVisible(visible) {
      if (destroyed || appVisible === visible) return
      appVisible = visible
      if (running && !visible) report.appHideCount++
      if (visible) { leaving = false; guard() }
      syncScreen()
      save()
      emit()
    },
    setPageVisible(visible) {
      if (destroyed) return
      pageVisible = visible
      if (visible) { leaving = false; guard() }
      syncScreen()
      emit()
    },
    prepareLeave() {
      if (!running || destroyed) return
      leaving = true
      syncScreen()
      save()
      // Do not count a navigation request as an actual app-background event.
      emit()
    },
    destroy() {
      if (destroyed) return
      stop('destroyed')
      destroyed = true
      pageVisible = false
      syncScreen()
      readers = []
      listeners.clear()
    }
  }
}

module.exports = { createBackgroundProbe, PROBE_STORAGE_KEY, PROBE_LIMIT_MS, readReport }
