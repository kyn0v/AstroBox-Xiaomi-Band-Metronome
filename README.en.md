# Band Metronome

A metronome application for Xiaomi Smart Band 9 Pro, built with Vela JS.

[中文说明](README.md)

## Features

- 50–250 BPM, with three native digit wheels (hundreds, tens, ones) and Tap Tempo.
- 2/4, 3/4, 4/4, and 6/8 meters. Each slot can use long, short, or no vibration.
- Independent vibration and flash controls, with dots showing the current position in the bar.
- Four color themes and locally saved preferences.
- Simplified Chinese and English interface, following the system language.

## Controls

Tap the central button on Home to start or stop.

| Gesture from Home | Action |
| --- | --- |
| Swipe left | Set tempo or use Tap Tempo |
| Swipe up | Choose a meter and edit per-beat vibration |
| Swipe down | Select a color theme |
| Swipe right | Exit the app; from a subpage, return home |

Tapping the BPM or meter also opens its page. Hold the meter to view the gesture guide. Entering a configuration page stops playback; start it manually after returning.

In 6/8, BPM counts dotted quarters. The six slots are grouped 3+3, so a bar lasts two seconds at 60 BPM. For Tap Tempo, tap the two main beats.

## Installation and limitations

Current source is **0.6.0-beta.2**, adding a read-only device capability inventory for [background-running issue #1](https://github.com/kyn0v/astrobox-xiaomi-band-metronome/issues/1), not confirmed background support. The earlier 0.5.11 [AstroBox PR #1156](https://github.com/AstralSightStudios/AstroBox-Repo/pull/1156) was merged; this beta does not update the store resource.

This repository's `source` branch contains code. CreatorConsole manages packages and store images on [`main`](https://github.com/kyn0v/astrobox-xiaomi-band-metronome/tree/main).

- Target device: Xiaomi Smart Band 9 Pro (336 × 480). Other devices are unverified.
- Normal practice remains foreground-only and stops on leaving Home. The separate diagnostic does not grant background execution.
- Long vibration means longer duration, not greater strength. Pulses may overlap at high tempos or in 6/8, and an active pulse cannot be cut short. Test at a low tempo first.
- Automated tests cannot verify physical vibration timing, touch response, or battery use. Device testing is still required.
- Version 0.5.5 changed the package ID. Migrating from an earlier version creates a separate app, so preferences must be entered again.

## Read-only capability check (beta.2)

Swipe down from Home to Colors → **Device capabilities**. It reads once automatically, with a three-second device-info timeout. The five panels show device/firmware, runtime/app, vibration APIs, background-related APIs and explicitly unconfirmed timer/alarm/notification query names.

Tap a value to view details; use **Prev / Next** and **Recheck** as needed. Results stay in page-instance memory only, without storage or upload. See the [test guide](docs/capability-check.md).

- Calls only `app.getInfo`, `app.canIUse` when available, and `device.getInfo`.
- Does not read unique device IDs, serials or accounts, or start vibration, audio, GPS, downloads, native libraries or background services.
- Stops a retained diagnostic vibration session before entering this read-only check.
- Missing/erroring capability queries are **not** interpreted as unsupported; reported support is **not** proof of background execution.
- Missing API Level is shown as not returned, never replaced with the manifest's minimum API requirement.
- Existing normal practice and the earlier background experiment remain available; no new background-support claim is made.

## Background-running diagnostic (beta)

Swipe down from Home to Colors and select **Background test (beta)**. Configure tempo, meter and vibration normally first; begin testing at 4/4, 120 BPM with short pulses.

- Starts only after **Start 5 min**; it never resumes automatically.
- **Try leaving** delegates root-back navigation to the system. Observe the actual motor; this action does not grant background permission.
- Reports app-hide events, hidden/total JS callbacks and the largest callback gap. **Counts are not proof of physical vibration.**
- Stops at a five-minute wall-clock limit, a large timer gap, backward clock change or synchronous vibration error, without catch-up pulses. If JS is suspended, the deadline can only be checked when execution resumes.
- **Dark screen** is a black foreground page that still requests screen-on, not real screen-off or background execution; power savings are not guaranteed. Tap it to restore controls.
- **Stop & Home** stops the test and restores normal navigation. Restarting the app never restarts the test.
- No audio, location or download keep-alive workaround or additional permissions.

See the [device-test guide](docs/background-probe.md). Real-device validation is required before claiming support.

## Development

Develop on `source`; do not merge source files into the resource branch `main`. Requires Node.js 20+ and npm. Python 3 is needed to regenerate icons.

```bash
npm ci --ignore-scripts
npm test
npm run build
```

Output: `dist/org.bandmetronome.app.debug.0.6.0-beta.2.rpk`.

The current build uses the toolkit's shared debug signing key and is not a production release. See the [development guide](docs/development.md) for signing, testing, and publishing details.

## Feedback

Include the device model, firmware version, app version, and reproduction steps when reporting an [issue](https://github.com/kyn0v/astrobox-xiaomi-band-metronome/issues). Redact personal information from screenshots or videos.

This is not an official Xiaomi or AstroBox application.
