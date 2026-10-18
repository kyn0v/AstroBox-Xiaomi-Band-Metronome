# Background metronome feasibility — Xiaomi Smart Band 9 Pro

Research snapshot: **2026-10-18**, with subsequent owner feedback noted below. Related: [issue #1](https://github.com/kyn0v/astrobox-xiaomi-band-metronome/issues/1), [historical beta test guide](background-probe.md).

**Product decision for beta.3:** foreground-only practice with an integrated dark presentation. The experimental runtime and capability pages have been removed from the current RPK. The owner subsequently confirmed that only `vibrator.vibrate` reported support, not `start/stop`; exact firmware/runtime metadata and screenshots were not supplied. This agrees with the public restriction but remains a device-specific verbal observation, not a proof about all firmware. See [current foreground-dark controls](foreground-dark.md).

## 1. Decision summary

**No verified, supported route has been established for a standalone third-party RPK to provide continuous background vibration on the target Band 9 Pro. This is not a proof that the hardware or every possible firmware implementation is incapable of it.**

There are three different questions, and their answers must not be conflated:

1. **Does the underlying OS architecture have relevant facilities? Yes.** The inspected openvela native vibrator service implements interval and waveform playback using service-owned timers.
2. **Does the retail Band 9 Pro expose those facilities to a third-party JS app? Not established; the published device matrix explicitly says that its JS `vibrator.start/stop` task APIs are unsupported.**
3. **Did our tested app-only scheduling path work on the owner's device? No, according to the owner's observation.** Foreground dark mode did work. Firmware identity and the diagnostic counters were not supplied, so the exact stop mechanism remains unconfirmed.

Recommended direction: retain foreground practice as the reliable product baseline; investigate a read-only device capability report and vendor-supported task APIs before attempting another background implementation. Do not call this a solved background feature or infer that native code automatically grants extra access.

## 2. Evidence quality and scope

- **Official JS documentation:** inspected 12 relevant pages, including the background contract, lifecycle, vibrator, app, device, event, brightness, audio, geolocation, request, manifest and FAQ. The public feature navigation was also checked for timer/alarm interfaces.
- **Pinned upstream code:** inspected complete Git tree listings for six openvela repositories; retrieved 27 selected source/documentation files from five of them. The timer and vibrator implementations below are upstream evidence, **not a dump of the installed Band 9 Pro firmware**.
- **Device observation:** owner's feedback on the previously delivered `0.6.0-beta.1` experiment. It is not an independently measured timing trace.
- **Community evidence:** one accessible failure report on a different watch model; indexed claims for another timer whose linked pages returned HTTP 404 during direct retrieval; one public Lua/Shell companion project. None establishes a working standalone Band 9 Pro RPK implementation for this app.

A portable [source index](background-research-sources.json) records official-page retrieval hashes, pinned upstream revisions, search-lead retrieval failures and the limits of the device observation. Raw HTML, extracted examples and source snapshots are kept locally under ignored `artifacts/background-research/`. Only the report, source index, original diagnostic example and its tests belong in the public source tree; upstream source copies are not vendored.

### Observed result versus missing evidence

| Field | Evidence available |
| --- | --- |
| App build | `0.6.0-beta.1`, versionCode 20; source `57f4b19c355972e644a18344f90df344473250d2` |
| Intended device | Xiaomi Smart Band 9 Pro |
| Owner feedback | Leaving for the background stopped playback; foreground dark mode worked |
| Firmware / runtime / API level | Not captured |
| Exact exit gesture / whether it exited versus merely hid | Not captured |
| App-hide count / hidden callback count / last stop reason | Not supplied |
| Timing, battery, interruption and restart measurements | Not measured in this investigation |

Do not convert this observation into “all Vela JS applications can never run in the background.”

## 3. Findings

### 3.1 Public background execution is conditional

The [official background contract][background] requires **both**:

- declaring the background feature in `manifest.json`; and
- at least one declared background-capable feature actually running.

The listed features are `system.audio`, `system.request`, and `system.geolocation`. The document also recommends placing imports/background work in `app.ux` and says the necessity of background execution is reviewed during publication.

Consequences:

- Moving the timer from a page to `app.ux` is a lifecycle improvement, **not an authorization to remain active**.
- `system.vibrator` and a bare JS timer are not listed qualifying features.
- Adding `background: true`, or adding `system.vibrator` to `config.background.features`, is not a documented solution.
- A feature being declared is not equivalent to the feature being implemented, actively running, or accepted for this purpose.

### 3.2 The device-specific matrix narrows the options further

The current official pages state:

| Capability | Band 9 Pro documentation | Implication |
| --- | --- | --- |
| `vibrator.vibrate({mode})` | Supported; presets `short` and `long` | JS still has to schedule repeated calls in our implementation |
| `vibrator.start({duration, interval, count})` | **Not supported**; supported-device column lists Xiaomi Watch S5 | No documented vibration-task offload for 9 Pro |
| `vibrator.stop(id)` | **Not supported** on 9 Pro | Cannot assume a task cancellation API exists |
| `geolocation` | **Not supported** on 9 / 9 Pro | Hardware GNSS availability does not establish third-party JS access |
| `request.download` | **Not supported** on 9 / 9 Pro | A download-based background path is not an available documented route here |
| `system.event` | **Not supported** on 9 / 9 Pro | Cannot use its public-event API as a presumed wakeup mechanism |
| `system.audio` | API documented; the inspected page has no equivalent model support table | Band-specific availability and behavior remain unverified; do not assume support |

Sources: [vibrator][vibrator], [geolocation][geolocation], [request][request], [event][event], [audio][audio]. These are the published matrices at this snapshot, not measurements of the owner's installed firmware.

`system.event` documents battery/charging events, not an alarm scheduler. `brightness.setKeepScreenOn` is a screen-state request, not a background-execution permission.

### 3.3 Native vibration offload is a real architectural possibility

Pinned upstream vibrator source: [`47542f53a97476ec7a036366075e073158f002e6`][vib-repo].

The public C header contains:

- `vibrator_play_interval(duration, interval, count)`;
- `vibrator_play_waveform(timings, amplitudes, repeat, length)`;
- `vibrator_play_compose(...)` with repetition;
- `vibrator_cancel()`.

The [client implementation][vib-client] sends an IPC request, receives a result and closes its socket. The [service implementation][vib-interval] then drives interval playback with its own `uv_timer_start`; waveform repetition is likewise managed by the [service callback][vib-wave]. This is materially different from our JS code calling `vibrate` on each beat.

Important qualifications:

- This establishes what **that upstream native service** can do, not that the same implementation is present or reachable in retail 9 Pro firmware.
- Native `vibrator_start(timeoutms)` means a single timed vibration; it is **not** the same contract as JS `vibrator.start({duration, interval, count})`. Similar names must not be treated as interchangeable.
- In the inspected C interval implementation, the repeat period is **`duration + interval`**. For example, a 100 ms pulse plus 400 ms rest yields a 500 ms period. Do not blindly assume that a future JS bridge exposes identical timing semantics; measure it.
- JS task playback, even on a supported device, is a uniform repeated-pulse interface. Per-beat Long/Short/None patterns would need an additional sequencing facility or another design.
- Native service timers are still scheduled software. Motor response, power policy, competing notifications and cancellation semantics still require device validation.
- Never experiment with indefinite native repetition without a verified stop path and a finite fallback limit.

### 3.4 The public runtime exposes a boundary, not the complete retail policy

Pinned QuickApp container: [`58af216ec93b13f572aacb3e41b8e39a130056bf`][runtime-repo].

Its README explicitly says the core `quickapp`, `gui_wrapper`, `quickappfeatures` and inspector are distributed as **prebuilt static libraries**. Public source covers headers and the Shell integration layer; the JS Feature implementation and complete runtime policy cannot be audited from this repository alone.

The public header includes `QAPP_STATUS_BACKGROUND`, `QAPP_PRIORITY_PERSISTENT`, and `QAppInfo.background`. These are native host/runtime data structures, **not proof of a writable public JS setting**. They must not be copied into the application's manifest as invented permissions.

The inspected [XMS lifecycle glue][runtime-lifecycle] calls `shell_app_->hide()` on activity stop, and stops/releases the container on activity destruction. [Shell glue][runtime-hide] passes hiding to `QApplicationHide`. The hidden core determines further behavior. Also, there is no evidence that the owner's retail firmware uses exactly this revision or this integration mode.

### 3.5 Built-in countdown does not require a continuously executing UI

The [official Arch Alarm guide][arch-alarm] describes one-shot timers, scheduler integration and tickless low-power operation. That provides a plausible mechanism for a system countdown to register a deadline and receive an expiry event while its UI is absent.

However, the retail countdown's source and exact API usage have **not** been obtained. Do not label its programming language, timer backend, persistent-process policy or privilege model as confirmed facts.

A timer that displays the correct remaining time after reopening may merely calculate `deadline - now`. That does **not** prove that it could issue a vibration while hidden. A single expiry notification also does not establish a continuous metronome:

- simple meters in this app require a beat every 1200–240 ms for 50–250 BPM;
- 6/8 schedules three subdivisions per dotted-quarter beat, reaching 80 ms at 250 BPM;
- a 120 BPM metronome requires 1200 beat events in ten minutes, rather than one completion event.

### 3.6 Native extensions are not an ordinary RPK shortcut

The public JS [`app.loadLibrary` documentation][app] explicitly says loading a dynamic library requires cooperation with the vendor. Compiling C/C++, naming a library after a native symbol, or including it in an RPK is not evidence that the retail runtime will load it or expose the required service.

Building or modifying an openvela system can demonstrate a native implementation in a controlled environment. It does not automatically produce an installable third-party extension for this owner's retail band. No firmware modification, flashing, native library injection or privilege alteration was attempted.

### 3.7 Community leads: interesting, but not implementation proof

**Background timer listing.** Search indexes returned “腕上计时器—可后台运行” claims mentioning 9 Pro, background vibration/popups and firmware-dependent failures. Direct retrieval of resource pages [7675][timer-7675], [7676][timer-7676], [7677][timer-7677], associated reviews and thread 28295 returned HTTP 404 in this investigation. That does not establish why they are unavailable. There is no inspected implementation, authorized test package, measured result or independent confirmation here. Treat this only as a lead, not evidence of an available solution.

**Different-device failure report.** An accessible [Redmi Watch 6 Pomodoro discussion][watch6-report] describes failed background reminders and an unsuccessful `system.timer` attempt. It is an anecdote on a different device, not a specification or a disproof of 9 Pro capability.

**Lua/Shell companion.** The public [Vela-Shell-Bridge README][bridge] describes a QuickApp client plus an additional Lua watchface daemon, file IPC and explicit per-app authorization. This is a different deployment model, not standalone RPK background support. Retail 9 Pro compatibility, daemon lifetime, available native vibration commands, safety and store suitability were not verified. No bridge, watchface, extra permission or remote-control service was installed or enabled.

These leads justify asking for exact interfaces, firmware and reproducible demonstrations. They do not justify silently adding a host dependency or buying/downloading a paid resource without the owner's approval.

## 4. Route assessment

| Route | Assessment for this project |
| --- | --- |
| Change `setTimeout` to `setInterval`, promises or a worker | Does not establish a longer-lived runtime or permission. No public worker-based exemption found. Stop retrying this without new evidence. |
| App-owned JS timer without qualifying service | Implemented in beta; owner's tested path failed. Lifecycle distinctions still need logs, but it is not a supported background contract. |
| JS `vibrator.start/stop` offload | Most directly relevant public API, but officially unsupported on 9 Pro. Verify metadata on the specific firmware before considering any bounded experiment. |
| Native interval/waveform service | Source demonstrates a suitable scheduling architecture; retail access, binding and cleanup are blockers. Needs a supported bridge/vendor route. |
| System countdown/alarm API | No documented Vela JS alarm/timer scheduler was located in the inspected feature index. Indexed searches alone cannot prove that no private API exists. |
| Real audio playback | A documented class of background work, but device support and application purpose must both be legitimate. No silent-audio keep-alive workaround adopted. |
| GPS activity tracking | Even a genuine new running-tracker feature would require device support; public matrix marks 9 Pro geolocation unsupported. Merely adding GPS to stay alive is not justified. |
| Persistent download | Public matrix marks 9 Pro request download unsupported; an unrelated or endless transfer is not a legitimate metronome dependency. |
| Lua/watchface or other native host | Different product/deployment route with additional trust and lifecycle assumptions; not verified or adopted. |
| Foreground dark practice | Owner reports it works. Still foreground with screen-on request, not actual screen-off or proven power savings. |

## 5. Audit of what beta.1 actually tested

The tested source is [the app-owned probe at `57f4b19`][probe-source]. Its safeguards matter when interpreting a failure:

- `Try leaving` invokes root `router.back()` after entering with `clearTask`. System back may **exit** rather than merely hide an application.
- App `onDestroy` intentionally stops and releases the experiment.
- Returning to normal Home intentionally stops any retained diagnostic engine to avoid overlapping playback.
- A gap over `max(1500 ms, three slot intervals)` or the five-minute deadline intentionally stops the probe before another motor call.
- A persisted `running` marker becomes `interrupted`, never an automatic restart. Final asynchronous storage writes may be lost on process destruction.

Thus “it stopped after leaving” must not be rewritten as “the OS definitely suspended timers in a still-live app.” The current evidence does not isolate termination, timer suspension, the probe's guard, or a different navigation path. We should collect the stop reason and event counts before attributing the mechanism.

This qualification does not change the practical result: the tested experience did not meet the user's background-running requirement.

## 6. Next useful verification — no blind keep-alive experiments

### Stage A: read-only device inventory

Capture only model/product, OS and runtime versions, and `APILevel` when returned by [`device.getInfo`][device]. Do **not** call unique-device-ID, serial-number or account-ID APIs.

Use the documented format, for example:

```js
app.canIUse('@system.vibrator.start')
```

`canIUse` itself is marked API Level 3+. Missing or throwing capability queries must be recorded as **query unavailable/error**, not as a definitive “unsupported.” A true result is also not proof of permission, background lifetime or successful hardware operation.

The initial research prepared a dependency-injected, read-only helper with Node tests. It was integrated in **0.6.0-beta.2** as [the collector at commit 913c5ad](https://github.com/kyn0v/astrobox-xiaomi-band-metronome/blob/913c5ad/src/common/background-capabilities.js) and the [historical capability-check page](capability-check.md). It queried metadata, filtered returned device fields and bounded the device-info callback wait without starting a service or uploading results. In beta.3, the UI and `system.device` declaration are removed; the helper is kept only as a [tested research snippet](snippets/background-capabilities.js), outside the app source and RPK.

The helper also queries `@system.timer`, `@system.alarm`, and `@system.notification` as explicitly **undocumented search candidates**, without importing or executing them. These query names do not assert that such Vela interfaces exist.

### Stage B: separate lifecycle cases

If another diagnostic package is requested, test separately:

1. Staying on the visible page (baseline).
2. System back/return to watchface.
3. A system action that hides, rather than exits, the app if the firmware offers one.
4. Actual screen-off, separately from our black foreground page.
5. Return to retained probe versus a newly created app/Home instance.

Record app/page show-hide-destroy events, stop reason, runtime-instance continuity and actual motor behavior. Start with 4/4, 120 BPM and short pulses. Counters must not substitute for observation of the motor. No diagnosis should depend on users publishing identifiers or unredacted personal screens.

### Stage C: only test offloaded tasks after a supported access path exists

If the exact device reports an unexpected supported task API, first clarify the discrepancy with the official matrix. A candidate test must have:

- explicit user opt-in and a finite, very small pulse count;
- a verified stop/cancellation method;
- measured pulse period and duration semantics;
- checks for behavior after hiding, app destruction, notifications, reopening and cancellation;
- no overlapping normal/experimental engines;
- measured jitter and battery/comfort effects before expanding duration or tempo.

Do not start an infinite native loop to discover whether cancellation exists.

### Questions for Xiaomi/platform maintainers

Prepared questions, **not sent**:

1. On the specific Band 9 Pro firmware/runtime, is there a public task API for finite periodic vibration that survives UI hiding?
2. Is JS `vibrator.start/stop` planned for 9 Pro, or restricted to listed newer devices? What are duration/interval semantics and app-exit cleanup rules?
3. Is a countdown/alarm scheduling API exposed to third-party RPKs? What is its resolution, minimum repeat interval and cancellation model?
4. Which user action creates a supported hidden app state, versus terminating the app at root back?
5. If a native extension is required, is there a supported signing, packaging and review process for ordinary developers, without modifying retail firmware?

For a third-party timer author, additionally ask whether its behavior requires a phone, active media/location task, an extra watchface/host, or merely recalculates time when reopened. Request the exact tested firmware and a demonstration of the event firing while another screen is visible.

## 7. Completion criteria and boundaries

This investigation has established the API restrictions, a concrete native offload mechanism, the limits of the available runtime source, the ambiguity in our first device result, and a safe next measurement plan. It has **not** established a distributable background implementation.

A supported implementation should not be claimed until the required interface is documented/confirmed for the target, real hidden-state motor execution is reproduced, cadence/cancellation/interruption behavior is measured, and its permissions and power use are acceptable. Device/API updates or a vendor-confirmed binding are valid reasons to reopen a blocked route.

Local validation: **174 Node tests passed**, including six tests of the read-only capability helper (tri-state results, identifier filtering, callback timeout/cancellation and errors). These tests do not validate retail firmware behavior.

The research-only phase did not change app behavior, manifest permissions or the signing workflow; it did not build an RPK, access/flash a device, install an extra host, purchase a paid item or post an external message. The subsequent owner-requested beta.2 integrated only a read-only inventory UI; the owner reported that only `vibrator.vibrate` was supported. Beta.3 removes these diagnostics in favor of foreground dark practice. Neither change demonstrates a successful background implementation; full firmware identity and the exact beta.1 stop mechanism remain unresolved.

## Sources

Official website pages were inspected on the snapshot date; their content can change. Upstream code links below are pinned so that source evidence remains auditable.

[background]: https://iot.mi.com/vela/quickapp/zh/guide/framework/other/background-running.html
[vibrator]: https://iot.mi.com/vela/quickapp/zh/features/system/vibrator.html
[geolocation]: https://iot.mi.com/vela/quickapp/zh/features/system/geolocation.html
[request]: https://iot.mi.com/vela/quickapp/zh/features/network/request.html
[event]: https://iot.mi.com/vela/quickapp/zh/features/system/event.html
[audio]: https://iot.mi.com/vela/quickapp/zh/features/other/audio.html
[app]: https://iot.mi.com/vela/quickapp/zh/features/basic/app.html
[device]: https://iot.mi.com/vela/quickapp/zh/features/basic/device.html
[vib-repo]: https://github.com/open-vela/frameworks_system_vibrator/tree/47542f53a97476ec7a036366075e073158f002e6
[vib-client]: https://github.com/open-vela/frameworks_system_vibrator/blob/47542f53a97476ec7a036366075e073158f002e6/vibrator_api.c#L142-L203
[vib-interval]: https://github.com/open-vela/frameworks_system_vibrator/blob/47542f53a97476ec7a036366075e073158f002e6/vibrator_server.c#L927-L958
[vib-wave]: https://github.com/open-vela/frameworks_system_vibrator/blob/47542f53a97476ec7a036366075e073158f002e6/vibrator_server.c#L746-L823
[runtime-repo]: https://github.com/open-vela/frameworks_runtimes_quickapp/tree/58af216ec93b13f572aacb3e41b8e39a130056bf
[runtime-lifecycle]: https://github.com/open-vela/frameworks_runtimes_quickapp/blob/58af216ec93b13f572aacb3e41b8e39a130056bf/shell/xms/quick_activity.cpp#L250-L277
[runtime-hide]: https://github.com/open-vela/frameworks_runtimes_quickapp/blob/58af216ec93b13f572aacb3e41b8e39a130056bf/shell/common/shell_app.cpp#L340-L436
[arch-alarm]: https://github.com/open-vela/docs/blob/ef76237d468708be054b4c066d00fabf64ae4220/zh-cn/device_dev_guide/driver/timer_driver/timer/Arch_Alarm.md
[timer-7675]: https://www.bandbbs.cn/resources/7675/
[timer-7676]: https://www.bandbbs.cn/resources/7676/
[timer-7677]: https://www.bandbbs.cn/resources/7677/
[watch6-report]: https://www.bandbbs.cn/threads/25393/
[bridge]: https://github.com/FangAiden/Vela-Shell-Bridge/blob/99aef67ffffef9e81a540c5dd251f30b7075fd46/README.md
[probe-source]: https://github.com/kyn0v/astrobox-xiaomi-band-metronome/blob/57f4b19c355972e644a18344f90df344473250d2/src/common/background-probe.js
