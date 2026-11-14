# REDMI Watch 6 layout preparation / 真机验收

Tracking: [issue #4](https://github.com/kyn0v/AstroBox-Xiaomi-Band-Metronome/issues/4). Target: **REDMI Watch 6 standard edition**, not REDMI Watch 6 Active/活力版, not Xiaomi Watch 5.

## What the source changes do

The manifest retains `designWidth: 336` and the existing Vela watch package identity. The Watch 6's reported 432 × 514 rectangular display maps to approximately 336 × 400 logical CSS px with that design width; the accepted Band 9 Pro remains 336 × 480. The Vela `@media (min-width: 200) and (shape: rect)` query (width is in dp, not CSS px) shortens the practice button, Tap Tempo button, rhythm grid, and theme tiles on wider rectangular watches. No scheduling, vibration, storage, navigation, or screen-on API was changed. The rule may also apply to other wide rectangular devices, which are **not** thereby validated.

Sources: [Vela media queries](https://iot.mi.com/vela/quickapp/zh/guide/framework/style/media-query.html) lists REDMI Watch 6 as supporting media queries; [Vela multi-screen guidance](https://iot.mi.com/vela/quickapp/zh/guide/multi-screens/index.html) explains designWidth scaling. Verify actual size, system and runtime on the target device before publishing its support.

## Local checks (not device acceptance)

- `npm test` and `npm run build` on `source`.
- `npm run preview`: inspect `watch6-index-{zh,en}`, `watch6-tempo-{zh,en}`, `watch6-rhythm-{zh,en}`, `watch6-appearance-{zh,en}`, `watch6-welcome-zh`, `watch6-rhythm-six-zh`, `watch6-dark-en`. The browser simulates a **336 × 400 logical** area and a static 144px picker; it cannot prove native UI behavior.
- Confirm original `index-zh` / `tempo-zh` etc. still render at 336 × 480. The local `.debug.rpk` uses the toolkit's shared debug signature; do not treat it as a production upgrade.

## Real-device acceptance (pending)

1. Record standard Watch 6 model, firmware, Vela/API level, phone OS and test package version. Do not collect or publish device IDs, credentials, or personal account information.
2. Install a **correctly signed** test package for the target device using an appropriate supported method; do not flash firmware. Check startup/onboarding, all four pages, taps, swipes, native digit wheels, 050 and 250 boundaries, Tap Tempo, error notices, and Chinese/English text. Check that controls are not clipped and system back exits once.
3. Check each meter (2/4, 3/4, 4/4, 6/8), per-slot long/short/off vibration, visual flash, restart behavior, and saved preferences. Start at low BPM; at high BPM and 6/8 pulses may merge due to the motor's physical limits. Time a several-minute session against an external reference to detect missed or drifting beats; record BPM, conditions and observed variation rather than claiming sample-accurate timing.
4. Check the screen-on request and **foreground black-page mode**: vibration continues while that page stays visible, wake preserves beat phase, and exiting/hiding stops playback. Test battery/heat over a bounded session. System screen-off and background operation are out of scope (see #1).
5. Recheck Band 9 Pro behavior and existing automated tests before documenting Watch 6 as supported. Publish only after device results and packaging/signature/upgrade behavior are reviewed.

If no Watch 6 is available, mark the feature as **layout prepared / hardware unverified**, not completed or supported.
