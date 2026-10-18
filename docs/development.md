# Development and publishing

[简体中文首页](../README.md) · [English overview](../README.en.md)

Technical notes for contributors and release preparation. For everyday controls,
see the project overview rather than this document.

## Build and test

Node.js 20+ and npm are required. The build tool is pinned to `aiot-toolkit` 2.0.5;
previous builds ran on macOS arm64 with Node 26.8.2. Python 3 is only needed when
regenerating the original RGBA launcher/control icons.

```bash
npm ci --ignore-scripts
# Optional, after changing the icon generator:
python3 scripts/generate-icons.py
npm test
npm run build
```

Current identity: `org.bandmetronome.app`, version **0.6.0**, version code **23** (release promotion of the owner-accepted beta.3, without functional changes).
Output: `dist/org.bandmetronome.app.debug.0.6.0.rpk`.

This is a debug **application package, not firmware**, signed with the toolkit's
shared development key. There are no runtime npm dependencies in the app; npm
packages are desktop build/debug tooling. Do not use the shared key for production.

The tests execute the actual page scripts with stubbed platform APIs. They cover
meter timing, stalls, settings persistence, page initialization, navigation event
ordering, save retries, and icon transparency. They do not render Vela, verify
physical motor timing, or control a connected band.

For visual checks, open the project in Xiaomi AIoT-IDE with an appropriate Vela
simulator. `npm start` exposes the vendor debug command; it does not install an
emulator. Keep debugger services on a trusted local network.

## Manual signed release build

In `kyn0v/astrobox-xiaomi-band-metronome`, use GitHub **Actions → Build signed RPK → Run workflow**, selecting **`source`**.
An identical workflow entry is also kept on the default resource branch `main`
so GitHub exposes the manual-run UI. Runs dispatched on `main` are skipped;
select `source`. Keep both workflow copies synchronized when editing the build.
The workflow only supports `workflow_dispatch`; it does not run on pushes or PRs,
write branches, create GitHub Releases, or submit AstroBox PRs. Other branch
selections are skipped. Each run builds its exact dispatched source commit.

Repository Actions Secrets:

- `RPK_SIGNING_PRIVATE_KEY`: PEM private key.
- `RPK_SIGNING_CERTIFICATE`: PEM certificate.

The certificate fingerprint is pinned in `.github/workflows/build-release.yml`.
Do not replace the signing identity casually: it affects upgrade compatibility.
GitHub does not provide a read-back UI for Secrets. The owner chose Secrets-only
storage; there is no retained local private-key backup.

Tests and dependency installation run before the secrets are materialized.
The signing step writes restricted temporary files, checks the key/certificate
match, then `aiot release` builds with that identity. Temporary signing files are
removed in an always-run cleanup step. Only the release RPK, `SHA256SUMS`, and
`release.json` are uploaded as an Actions artifact, retained for 14 days. Metadata
records the source commit, package hash, and certificate fingerprint. Nothing is
uploaded from the signing directory. Treat Actions artifacts in this public
repository as distributable; keep all personal information out of them.

The workflow has read-only repository permissions and pinned action revisions.
Only trusted maintainers should be allowed to modify/run signing workflows:
build tools execute code with access to the temporary key. These controls are
not a sandbox for the existing third-party build dependencies.

Download the artifact from the run page. Verify `SHA256SUMS` and test installation
on the target band before using the RPK for the store submission. The new release
signature may prevent replacing the older debug installation in place. Do not
uninstall or erase preferences automatically.

## Code map and conventions

Identifiers, filenames, comments, and technical documentation use English.
User-facing strings live in `src/common/strings.js`, with English and Simplified
Chinese translations. Update both languages together.

| Path | Responsibility |
| --- | --- |
| `src/app.ux` | App-owned preference store |
| `src/common/metronome.js` | Meter-aware beat scheduler |
| `src/common/rhythm.js` | Meters and normalized per-meter patterns |
| `src/common/tap-tempo.js` | Tap estimator, 50–250 BPM |
| `src/common/preferences.js` | Validation, subscriptions, serialized writes and retry status |
| `src/common/page-swipe.js` | Four-direction touch observer and click suppression |
| `src/common/themes.js` | Four palettes and pulse colors |
| `src/pages/index/index.ux` | Foreground practice, dark-mode presentation and navigation |
| `src/pages/tempo/index.ux` | Native number picker and circular Tap Tempo |
| `src/pages/rhythm/index.ux` | Meter selection and editable cells |
| `src/pages/appearance/index.ux` | Theme swatches |
| `scripts/generate-icons.py` | Original transparent icons, using standard Python |

## Timing and musical units

| Meter | BPM unit | Slots per bar | Editor layout |
| --- | --- | --- | --- |
| 2/4 | Quarter note | 2 | One row of two |
| 3/4 | Quarter note | 3 | One row of three |
| 4/4 | Quarter note | 4 | Two rows of two |
| 6/8 | Dotted quarter | 6 eighth notes | Two rows of three |

At 6/8 and 60 BPM, each slot lasts 333.33 ms, the second main beat begins at one
second, and the next bar begins at two seconds. Tap Tempo measures the main beats,
not subdivisions. None suppresses a motor pulse without removing the slot's time.
Default patterns use Long on the first slot and Short on the others.

The scheduler uses intended timestamps, advances musical position after stalls,
and skips missed slots instead of emitting catch-up bursts. Tests cover ten
minutes of fractional intervals, but JavaScript timers and the motor are not a
real-time system. Playback always restarts from the first slot.

Band 9 Pro's documented `vibrator.vibrate` supports `short` and `long` preset
durations, with no amplitude setter or programmable `start`/`stop` tasks. An
already-started pulse cannot be interrupted. At 250 dotted-quarter BPM, 6/8 slots
are only 80 ms apart: distinct physical pulses cannot be guaranteed. Do not add
undocumented intensity APIs or extra delayed pulses to simulate stronger beats.

Visual pulses last at most 100 ms and 40% of a slot, ending before the next slot.
The main button changes color; the app does not flash the entire screen or vary
hardware brightness. Position dots continue when Flash is disabled in the visible
practice UI. In foreground dark mode, flashes and reactive beat-dot updates are
suppressed without changing the scheduler or the saved Flash preference.

## UI lifecycle and navigation

- Apply cached preferences synchronously during `onInit`, before first render.
  Keep retained pages synchronized while hidden and unsubscribe on destruction.
- Gate controls only during cold loading. Do not reset `ready` and remount the
  picker on ordinary navigation; remounting previously caused default-value flashes.
- Keep rhythm cells identified by `tid`, with stable unchanged cells and rows.
  Unrelated settings or save-status updates must not rebuild the entire grid.
- Vela's `swipe` recognizes quick flicks and does not bubble. The page observes
  documented bubbling touch events instead, using viewport coordinates, a 36 px
  threshold and 1.5:1 dominant axis. Axis locking rejects direction-changing drags.
- Moved touches suppress synthetic clicks for 350 ms. Native picker touch streams
  are excluded from navigation.
- Tempo uses three equal-width official `picker type="text"` digit wheels in
  hundreds/tens/ones order. Every column always offers 0–9. Values below 100 show
  a leading zero (050). An out-of-range selection clamps to 50 or 250 and briefly
  replaces the BPM unit with a minimum/maximum notice. The attempted wheel is
  reset even when the saved BPM was already at that boundary; stale callbacks
  are ignored. No out-of-range value is persisted.
  Version 0.5.11 removes the bottom guidance/progress/result line. Tap Tempo uses
  button pulses and updates the digits directly. Only range notices (1.8 seconds)
  or persistent save/load errors replace the BPM unit. Errors take precedence and
  remain tappable to retry. Notices are cleared on navigation and destruction.
  Short wheels avoid the previous 201-item list.
  [LVGL issue #7410](https://github.com/lvgl/lvgl/issues/7410) describes long-list
  coordinate limits causing incorrect selected text, consistent with the reported
  symptoms but not confirmed for this device's firmware. This is a bounded-list
  workaround, not a firmware fix. Native rendering still requires device testing.
- All three wheels use equal 36 px candidate/selected fonts, 64 px column widths,
  intrinsic height and a non-shrinking wrapper. The stylesheet requests bold text;
  the device's native font support still needs visual confirmation. Selection is
  distinguished by color, not font size.
- `selected` is a per-column initialization index, not a feedback binding to BPM.
  Events read `newValue` first, or fall back to `newSelected`; values must belong
  to the emitting column's current options. Saving a native selection does not
  write `selected` back while that wheel is snapping.
- External tempo changes (including Tap Tempo) replace only the keyed columns
  whose values change. Boundary correction also resets the attempted column.
  Old-instance callbacks are ignored. Returning
  to the same page, changing theme, and save-status updates do not recreate them.
  Same-value echoes do not write, retry failed saves, or reset tap sampling.
  There is no custom slider, offset correction or timer-based snap workaround.
  Native buttons still own hit-testing; no overlays.
- System back and custom right-swipe share a navigation latch. The first system
  back cleans up and returns false; an already-pending navigation returns true.
  Reset the latch on `onShow`. Verify both event orders in tests and on-device.
- Entering a configuration page stops playback and releases screen-on. Hiding or
  destroying a page clears its timers; returning must not auto-start playback.

These are application-level choices, not a guarantee about every firmware's
native gesture arbitration. There are no permanent Exit/Back buttons.

## Foreground dark practice (0.6.0; introduced in beta.3)

The bottom action row is Vibration / Moon / Flash, with three equal 64 x 48 px
hit areas. A theme-colored crescent indicates running/vibration state; a gray
variant is shown otherwise. Tapping while stopped, muted or entirely silent gives
a localized notice, never starts playback or enables vibration automatically.

Dark mode is an opaque black alternative presentation of Home, not a new route,
background service, screen-off API or hardware brightness change. The normal
practice controls are conditionally unmounted so invisible controls cannot be
activated. A small low-contrast hint explains tap-to-restore and right-swipe exit.

The same page-owned metronome engine continues running. Entering dark mode clears
pending flashes/notices; dark ticks update only a non-reactive last-beat field and
the normal vibration output. On wake, that beat index is restored without an
immediate motor pulse, scheduler restart or phase reset. Saved theme, Flash,
vibration, meter and BPM values are not changed. Normal visible flashes resume
on the next beat if enabled.

A 350 ms click guard is applied both when entering and leaving dark mode. It uses
the existing swipe controller without another timer, preventing the entry tap
from immediately waking and the wake tap from activating remounted controls.
Left/up/down gestures in dark mode only restore the UI. Right swipe and system
back retain their stop/exit semantics, including during the click guard.

Stop, hide and destroy clear dark state, the beat scheduler and flash/notice
timers, and release screen-on. Reopening never restarts or restores dark mode.
Vibration, persistence and screen-on errors restore visible controls. A playback
generation token prevents late screen-on failures from an earlier run corrupting
a new run. No hardware brightness value/mode is changed, so there is no brightness
setting to restore. Power savings are not asserted.

There is no five-minute experimental cap: this uses normal foreground practice
until stopped or the page is left. See the [foreground-dark acceptance guide](foreground-dark.md).

## Retired diagnostics and research

The beta.1 background probe and beta.2 capability pages, engine, strings and
`system.device` declaration are removed from the active app in beta.3. The
application returns to four foreground pages and has no app-owned background
scheduler. Existing diagnostic storage, if present from an old beta, is not read,
resumed or transmitted; normal preferences keep their existing key and schema.

The owner's follow-up reports that only `vibrator.vibrate` was supported, not the
repeat-task APIs. Full firmware metadata was not supplied, so this conclusion is
limited to the reported device and tested route. Keep the [research report](background-research.md),
[historical beta.1 guide](background-probe.md) and [historical beta.2 guide](capability-check.md)
for evidence rather than exposing unsupported features in the current UI. The
read-only collector is retained as a tested [research snippet](snippets/background-capabilities.js),
outside src and outside the RPK. The complete historical implementations remain
in Git history. No background feature or unsupported API should be added merely
because a native upstream implementation exists.

## Persistence and package migration

The storage key is retained, but storage is scoped to the application ID. The
0.5.5 identity change therefore requires a separate installation; earlier settings
do not migrate automatically. Re-enter the old BPM, patterns, and theme manually.
Future same-ID upgrades should retain preferences. Playback state is never saved.

Values are normalized, writes are serialized, and nested pattern arrays are copied
at storage boundaries. Save status belongs to the shared store: leaving a page
must not swallow a late failure or falsely show Saved. Tap the error text to retry
the latest snapshot. Selecting the same BPM/theme also retries a failed save.
There is no automatic retry timer. On termination, unsaved changes are lost.

## Device acceptance checklist

Test on the intended band and record its model and firmware. Successful packaging
and unit tests are not device-compatibility evidence.

1. **Before playing**, right-swipe Home to exit. Reopen and navigate to all three
   subpages and back, slowly and quickly, over controls and blank space. Confirm
   no duplicate navigation or stuck screen.
2. Check all four pages in Chinese and English at 336 × 480. Test buttons, cells,
   and swatches near their edges; check text clipping and the launcher icon's alpha.
3. Choose a non-default theme, 6/8, and a BPM such as 87 or 173. Revisit pages and
   restart the app: no temporary mint/4/4/120 or old-color frame should appear.
4. At 4/4 and 120 BPM, verify Long/Short/Short/Short. Set slot 2 to None: its dot
   still advances without a motor pulse. Stop/restart begins at slot 1.
5. At 6/8 and 60 BPM, verify six positions over two seconds. Edit slot 4, switch
   meters and return; each meter retains its own pattern.
6. Test all three wheels at 050, 099, 100, 153, 165, 199, 249 and 250 BPM.
   Try selections below 050 and above 250, including attempts while already at
   a boundary: check the notice and all three corrected digits. Verify larger
   fonts, closer spacing and the saved BPM on Home. Wheel
   drags must not navigate or press Tap Tempo. At high tempos,
   check visual timing first; choose Short/None if motor pulses merge.
7. Tap at 500 ms intervals in simple meters: expect 120 BPM. In 6/8, tap main beats
   at 1000 ms intervals: expect 60 BPM. Neither action should start playback.
8. Toggle vibration/Flash independently. Check transient text, main-button pulses,
   and position dots. Stop or leave Home; no new pulses or feedback timers remain.
9. Verify a failed save remains visible after navigation and retries correctly.
   Fault injection is covered by automated tests; do not damage storage to test it.
10. Compare timing with a trusted reference and observe battery use, comfort, and
    connectivity. A pulse already in progress can finish after stopping.

The app requests no Bluetooth or network API. The cause of an earlier reported
phone disconnection was not established; watch for recurrence during device tests.

## Publishing and privacy

The repository `kyn0v/astrobox-xiaomi-band-metronome` uses `source` for the full
source history and `main` for CreatorConsole-managed RPKs, metadata and images.
Do not merge these branches. Only the manual build workflow is mirrored to `main`
for GitHub's workflow discovery. This migration preserves the signing certificate;
repository Secrets were transferred sealed for the destination's public key, with
no plaintext key downloaded locally.

Use CreatorConsole for store submissions and resource updates. Keep the active
submission branch in `kyn0v/AstroBox-Repo`: PR #1156 is based on that fork, not on
this project's `source`. Resource changes must be referenced by a new fixed commit
in the store submission. Do not force-rewrite commits referenced by the store.

Before public binary distribution:

- Use the stable signing identity stored in Actions Secrets, never commit its
  private key. Verify migration from debug-signed builds.
- Complete device acceptance, and list only verified devices/firmware.
- Prepare the AstroBox resource metadata and submit a PR referencing the exact
  resource commit. Preserve published branch history; do not force-rewrite it.
- Decide the source license explicitly. This repository currently has no LICENSE;
  public source visibility alone does not grant an open-source license.
- Use a deliberately public project/author identity. Check tracked files, history,
  commit metadata, and uncompressed package contents for personal information,
  credentials, private keys, and local home-directory paths before pushing.

Local delivery instructions are in [AGENTS.md](../AGENTS.md). A local iCloud copy
is not proof of synchronization. Do not automatically install on a band, unpair,
factory-reset, or flash firmware. This project ships an application, not firmware.

## Toolchain security

The initial dependency audit reported 14 affected development-tool entries
(11 high, 3 low), including inherited reports—not 14 independent flaws or device
runtime dependencies. This is a historical result, not a fresh security verdict.
No forced toolkit changes were applied. Recheck with `npm audit` when preparing a
release, and validate vendor-tool updates with builds and device tests.

`npm ci --ignore-scripts` disables install lifecycle scripts; it does not sandbox
build tools or remove advisories. Use trusted projects and archives.

## Official references

- [AIoT-IDE](https://iot.mi.com/vela/quickapp/zh/guide/start/use-ide.html)
- [Native button](https://iot.mi.com/vela/quickapp/zh/components/form/input.html)
- [Native picker](https://iot.mi.com/vela/quickapp/zh/components/form/picker.html)
- [Touch/swipe events](https://iot.mi.com/vela/quickapp/zh/components/general/events.html)
- [Page lifecycle and system back](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/lifecycle.html)
- [Vibration support](https://iot.mi.com/vela/quickapp/zh/features/system/vibrator.html)
- [Background execution conditions](https://iot.mi.com/vela/quickapp/zh/guide/framework/other/background-running.html)
- [Router and clearTask](https://iot.mi.com/vela/quickapp/zh/features/basic/router.html)
- [Storage](https://iot.mi.com/vela/quickapp/zh/features/data/storage.html)
- [AstroBox resource guidelines](https://github.com/AstralSightStudios/AstroBox-Repo/blob/main/assets/docs/ResAdptV2.md)
