# Apex Grand Prix

A true-3D homage to the 1982 Formula One coin-op *Pole Position* (Namco/Atari). First you drive one flying **qualifying lap** against the clock, and your time sets your **grid slot** (1–8). Then you **race 4 laps** against 7 CPU cars. Checkpoints every half lap extend your time, and the race ends if the clock runs out.

Play: https://storkdoc.github.io/behram-arcade/games/apex-gp/

## Circuits and difficulty
- **Fuji Speedway** (the classic): a 1.5 km straight with snow-capped Mt. Fuji ahead.
- **Seaside Circuit**: a coastal course.
- **Alpine Ring**: a mountain course.
- Three difficulties: Beginner, Pro and Expert. They change CPU pace, the qualifying time and the checkpoint extensions.

## Features
- **Gearbox:** LO and HI gears. LO pulls hard at low speed; HI is needed for top speed (~300 km/h).
- **Handling:** tyre squeal and skids, plus kerb, grass and gravel run-off.
- **Crashes:** billboards and rear-ending CPU cars cause explosions. The car then respawns, briefly ghosted.
- **Voice and banners:** "Prepare to qualify" / "Prepare to race" with banners, 5-light start gantry, "Extended time", "Final lap", "Qualified 3rd".
- **Records:** lap records, best qualifying per circuit, and a top-10 high score table with initials, all saved in localStorage.
- **Attract mode:** a demo lap plays behind the title, switching between chase and TV cameras.
- **WebGL2 renderer:**
  - HDR lighting with sun shadow maps, bloom, lens flare and motion blur.
  - Vignette and MSAA.
  - Native device-pixel resolution, capped at ~5 MP on mobile.
  - Adaptive quality drops effects (never resolution) if fps stays under 45 for 3 s.
  - A Canvas2D projected-road fallback renderer. Force it with `?2d`.
- **HUD:** drawn crisp at device pixels, snapped to whole pixels.
- **Sound (Web Audio):**
  - An engine that follows RPM and gear, plus squeal, rumble, wind and the rival engine.
  - Explosions, start beeps and optional music.
  - Speech synthesis for the voice, with a chime fallback.

## Controls
| | Mac | iPhone / iPad |
|---|---|---|
| Steer | ← / → (or optional Pointer Lock mouse steering) | ◀ ▶ buttons, drag on the left half, or TILT (tap TILT to allow motion) |
| Gas / brake | ↑ / ↓ | GAS / BRAKE buttons (multi-touch) |
| Gear LO/HI | Space (Shift also works) | GEAR button |
| Start, pause, sound | Enter, P/Esc, M | tap menus, pause and sound icons |

- **Gamepad:** the stick steers, RT is gas, LT is brake, X/Y/LB/RB change gear, and Start pauses.
- **Phones and tablets:** landscape is best. Portrait puts a controls panel below the view.

## Online two-player
1. One player taps **Host Two-Player Online** and picks the circuit.
2. The buddy taps **Join Two-Player Game in Progress**. No code is needed; a backup code is shown if the scan can't find the game.

You race head-to-head for 3 laps on the same grid with 6 CPU cars, and your rival is the yellow car.
- **State:** the host owns the race state (start, CPU cars, finishing order). The guest predicts locally and smooths.
- **Readouts:** RIVAL gap and LINK ms on the HUD.
- **After the race:** finishing order and rematch.

PeerJS uses its own `behram-agp-v1-*` namespace.

## Files
- `js/sim.js`: track and physics.
- `js/scene.js`, `gl.js`, `shaders.js`: WebGL2.
- `js/render2d.js`: the fallback renderer.
- `js/audio.js`: sound.
- `js/net.js`: online play.
- `js/font.js`: the HUD font.
- `js/main.js`: UI, input, HUD and the game loop.

## Tests
From the repo root, with `python3 -m http.server 8080` running:
```
NODE_PATH=<playwright-core dir> node games/apex-gp/tests/game.test.js   # rules, keyboard, touch, tilt, 2D fallback, arcade regression
NODE_PATH=<playwright-core dir> node games/apex-gp/tests/mp.test.js     # online play over an in-page PeerJS stand-in with latency
```
