const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const timing = require('../src/common/metronome')
const probe = require('../src/common/background-probe')

function fakeClock() {
  let now = 0
  let id = 0
  const tasks = new Map()
  const next = () => [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  return {
    now: () => now,
    setTimeout(callback, delay) {
      tasks.set(++id, { at: now + delay, callback })
      return id
    },
    clearTimeout(id) { tasks.delete(id) },
    pending: () => tasks.size,
    nextAt: () => next()?.[1].at,
    advance(ms) {
      const target = now + ms
      let task
      let count = 0
      while ((task = next()) && task[1].at <= target) {
        assert.ok(++count < 10000, 'timer loop must be bounded')
        tasks.delete(task[0])
        now = task[1].at
        task[1].callback()
      }
      now = target
    },
    lateTick(at) {
      const task = next()
      assert.ok(task)
      tasks.delete(task[0])
      now = at
      task[1].callback()
    }
  }
}

// Stub platform APIs only; run the actual app and page scripts from the UX files.
function pageHarness({
  preferences = {}, locale = 'en', keepScreenFails = false,
  vibrationFails = false, deferLoad = false, deferSaves = false, saveFails = false,
  terminateFails = false, probeReport = '', capabilityQuery,
  deviceInfo = { model: 'test-band', product: 'test-product', osVersionName: 'test-firmware', osVersionCode: 1, platformVersionName: 'test-runtime', platformVersionCode: 2, APILevel: 2 },
  deferDeviceInfo = false, deviceInfoFails = false, deviceInfoThrows = false, deviceImportFails = false
} = {}) {
  const clock = fakeClock()
  const calls = { keepScreenOn: [], vibrations: [], routes: [], routeOptions: [], writes: [], probeWrites: [], exits: 0, exitTimerCounts: [], deviceInfoReads: 0, identityReads: 0, capabilityQueries: [] }
  let stored = JSON.stringify(Object.assign({ onboardingDone: true }, preferences))
  let probeStored = probeReport ? JSON.stringify(probeReport) : ''
  let pendingLoad
  const pendingSaves = []
  const pendingDeviceInfo = []
  const storage = {
    get(options) {
      if (options.key === probe.PROBE_STORAGE_KEY) { options.success(probeStored); return }
      if (deferLoad) pendingLoad = options
      else options.success(stored)
    },
    set(options) {
      if (options.key === probe.PROBE_STORAGE_KEY) {
        calls.probeWrites.push(JSON.parse(options.value))
        if (saveFails) options.fail()
        else { probeStored = options.value; options.success() }
        return
      }
      calls.writes.push(JSON.parse(options.value))
      if (deferSaves) pendingSaves.push(options)
      else if (saveFails) options.fail()
      else { stored = options.value; options.success() }
    }
  }
  const modules = {
    '@system.vibrator': {
      vibrate(options) {
        if (vibrationFails) throw new Error('unsupported')
        calls.vibrations.push(options.mode)
      }
    },
    '@system.brightness': {
      setKeepScreenOn(options) {
        calls.keepScreenOn.push(options.keepScreenOn)
        if (keepScreenFails && options.keepScreenOn) options.fail()
      }
    },
    '@system.storage': storage,
    '@system.app': {
      getInfo() {
        const manifest = require('../src/manifest.json')
        return { packageName: manifest.package, versionName: manifest.versionName, versionCode: manifest.versionCode }
      },
      terminate() {
        calls.exitTimerCounts.push(clock.pending())
        if (terminateFails) throw new Error('terminate unavailable')
        calls.exits++
      }
    },
    '@system.device': {
      getInfo(options) {
        calls.deviceInfoReads++
        if (deviceInfoThrows) throw new Error('device unavailable')
        if (deferDeviceInfo) pendingDeviceInfo.push(options)
        else if (deviceInfoFails) options.fail('not supported', 203)
        else options.success(deviceInfo)
      },
      getDeviceId() { calls.identityReads++; throw new Error('must not collect identifiers') },
      getSerial() { calls.identityReads++; throw new Error('must not collect identifiers') }
    },
    '@system.configuration': { getLocale: () => ({ language: locale }) },
    '@system.router': {
      push(options) { calls.routes.push(options.uri); calls.routeOptions.push(options) },
      replace(options) { calls.routes.push(options.uri); calls.routeOptions.push(options) },
      back() { calls.routes.push('back') }
    },
    './common/preferences': require('../src/common/preferences'),
    './common/background-probe': probe,
    '../../common/probe-strings': require('../src/common/probe-strings'),
    '../../common/background-capabilities': require('../src/common/background-capabilities'),
    '../../common/capability-strings': require('../src/common/capability-strings'),
    '../../common/capability-view': require('../src/common/capability-view'),
    '../../common/strings': require('../src/common/strings'),
    '../../common/themes': require('../src/common/themes'),
    '../../common/rhythm': require('../src/common/rhythm'),
    '../../common/page-swipe': require('../src/common/page-swipe'),
    '../../common/tap-tempo': require('../src/common/tap-tempo'),
    '../../common/metronome': {
      ...timing,
      createMetronome: onBeat => timing.createMetronome(onBeat, clock)
    }
  }
  if (capabilityQuery) modules['@system.app'].canIUse = name => { calls.capabilityQueries.push(name); return capabilityQuery(name) }
  function loadUx(filename) {
    const source = fs.readFileSync(path.join(__dirname, '../src', filename), 'utf8')
    const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    const context = {
      module: { exports: {} },
      require(name) {
        assert.ok(Object.hasOwn(modules, name), `unexpected dependency: ${name}`)
        if (name === '@system.device' && deviceImportFails) throw new Error('device module unavailable')
        return modules[name]
      },
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      Date: { now: clock.now },
      console
    }
    vm.runInNewContext(script.replace('export default', 'module.exports ='), context)
    return context.module.exports
  }
  const app = loadUx('app.ux')
  function createPage(name, { show = true } = {}) {
    const page = loadUx(`pages/${name}/index.ux`)
    Object.assign(page, page.private)
    page.$app = { $def: app }
    page.onInit()
    if (show) {
      page.onShow()
      if (page.onReady) page.onReady()
    }
    clock.advance(0)
    return page
  }
  const page = createPage('index')
  return {
    page, app, clock, calls, createPage,
    probeStored: () => probeStored ? JSON.parse(probeStored) : null,
    deviceRequests: () => pendingDeviceInfo.length,
    finishDeviceInfo(index = 0, value = deviceInfo) { assert.ok(pendingDeviceInfo[index]); pendingDeviceInfo[index].success(value) },
    setLocale(value) { locale = value },
    stored: () => JSON.parse(stored),
    pendingSaves: () => pendingSaves.length,
    finishLoad(fail = false) {
      if (fail) pendingLoad.fail()
      else pendingLoad.success(stored)
    },
    finishSave(ok = true) {
      const options = pendingSaves.shift()
      assert.ok(options)
      if (ok) { stored = options.value; options.success() }
      else options.fail()
    }
  }
}

module.exports = { fakeClock, pageHarness }
