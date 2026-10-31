# SKY SHIELD — status notes

## Status (2026-10-26): COMPLETE, live
- sim.js: deterministic seeded 60 Hz rules (MIRVs, bombers, satellites, smart bombs, EMP, chains, tally, bonus city, THE END).
- auto.js: autopilot (attract demo + tests). net.js: PeerJS slots, namespace behram-ss-v1-.
- render.js: three.js r169, custom 8-bit bloom (no MSAA unless ?msaa=1, no float RTs), tiers 0-3, adaptive drop, pixel-readback selfCheck.
- audio.js: synthesized WebAudio. main.js: menus, input (trackball inertia / direct), touch, gamepad, HUD, high scores, versus.
- thumb.png from tools/thumb.mjs; games.js entry added.

## Tests (server at repo root: python3 -m http.server 8080)
- node tests/sim.test.js            (15 rules tests)
- node tests/page.test.mjs all      (Chromium + WebKit × desktop / iPhone / iPhone landscape / iPad: black regions, touch, multi-touch, keys)
- node tests/mp.test.mjs chromium|webkit   (two pages over the fake PeerJS broker)

## Ideas / known gaps
- Real-device perf only estimated (headless uses SwiftShader); adaptive tiering handles slow GPUs.
- Versus targets can differ slightly between screens (warheads aim at whatever is still standing).
- tools/rtest.html is a render-only dev harness (?w= wave).

## 2026-10-31: closest-silo launch, bigger blasts, chains
- Launch mode (start screen, localStorage ss.launch): CLOSEST SILO (default) = Space / double-click / double-tap fire the nearest silo with ammo (sim fire(g,-2)); PICK SILO L·C·R = original controls. A S D / L C R / gamepad X A B work in both.
- Bigger blasts (abm 9, foe 5.8), secondary blast gen shrink 0.93 capped at 12 gens, chain multiplier x1..x5 + 'chainpop' popup; waves ~6% faster, +1 warhead.
- Audio: limiter after compressor, layered boom/crackle, richer launch, rumble, bonus, wave-clear.
- Tests: node tests/launch.test.js; tests/modes.test.mjs (browser, both modes + touch).
