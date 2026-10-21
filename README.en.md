# Band Metronome

A foreground metronome for Xiaomi Smart Band 9 Pro, built with Vela JS.

[中文说明](README.md)

## Features

- 50–250 BPM with three native digit wheels and Tap Tempo.
- 2/4, 3/4, 4/4 and 6/8 meters; each slot can use long, short or no vibration.
- Independent vibration and flash controls; visible-practice dots show the current beat.
- **Foreground dark practice**: a black page continues vibration; tap to restore without restarting the beat.
- Four themes, local preferences, and English/Simplified Chinese following the device locale.

## Controls

Tap the central button on Home to start or stop.

| Gesture from Home | Action |
| --- | --- |
| Swipe left | Set tempo or use Tap Tempo |
| Swipe up | Choose a meter and edit per-beat vibration |
| Swipe down | Select a theme |
| Swipe right | Stop and exit; subpages return home |

Tap the BPM or meter to open its settings; hold the meter for the gesture guide. Entering settings stops playback, and returning never starts it automatically.

In 6/8, BPM counts dotted quarters. Six slots form two groups of three; at 60 BPM a bar lasts two seconds. Tap Tempo follows the two main beats.

### Foreground dark practice

The bottom row is **Vibration → Moon / dark mode → Flash**.

1. Start playback, enable vibration and keep at least one vibrating beat.
2. Tap the middle moon to enter dark mode. Controls and flashes are hidden without changing the rhythm, tempo or saved flash/theme preferences.
3. Tap to restore. Left/up/down gestures also restore controls without navigating blindly. Beat phase is preserved, without an extra vibration on wake.
4. Right swipe and system back stop/exit as before. Hiding or destroying Home stops playback.

A brief click guard prevents entry/wake taps from activating newly shown controls. Errors restore visible controls. Dark mode is not persisted or resumed on launch, and it never turns vibration on automatically.

**This is a black foreground page, not actual screen-off or background execution.** It still requests screen-on; power savings are not guaranteed. The old experimental five-minute cap is removed: normal practice runs until stopped or the page is left. See the [device-test guide](docs/foreground-dark.md).

## Installation and limitations

Current version is **0.6.0** (versionCode **23**), promoting the owner-accepted beta.3 without functional changes. The earlier 0.5.11 [AstroBox PR #1156](https://github.com/AstralSightStudios/AstroBox-Repo/pull/1156) was merged; publishing 0.6.0 still requires CreatorConsole submission and review. Building a package does not update the store resource.

Develop on `source`; CreatorConsole manages packages and store images on [`main`](https://github.com/kyn0v/AstroBox-Xiaomi-Band-Metronome/tree/main).

- Target: Xiaomi Smart Band 9 Pro (336 × 480); other devices are unverified.
- **Foreground only.** Background experiments and capability-check screens are removed from the current package. Research and historical findings remain in the [feasibility report](docs/background-research.md).
- Long vibration means longer duration, not more force. Fast tempos or 6/8 may merge pulses; an already-started pulse cannot be cut short. Begin testing slowly.
- Automated tests cannot verify motor timing, native touch rendering or battery use.
- Version 0.5.5 changed the package ID; earlier-package preferences do not migrate automatically.

## Development

Do not merge `source` into the independent resource branch `main`. Requires Node.js 20+ and npm; Python 3 is needed to regenerate icons.

```bash
npm ci --ignore-scripts
npm test
npm run build
```

Output: `dist/org.bandmetronome.app.debug.0.6.0.rpk`.

The local build uses a shared debug key. Manual delivery uses the existing project signing workflow; do not substitute a debug signature for an installed release. See [development and publishing](docs/development.md).

## Feedback

Include device model, firmware, app version and reproduction steps in an [issue](https://github.com/kyn0v/AstroBox-Xiaomi-Band-Metronome/issues). Redact personal information from screenshots or video.

This is not an official Xiaomi or AstroBox application.
