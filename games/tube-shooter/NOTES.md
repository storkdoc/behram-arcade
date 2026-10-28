# VORTEX (games/tube-shooter): notes

This is a Tempest-style vector tube shooter. It is plain **Canvas 2D plus Web Audio** in a single `game.js` file, with no build step and no WebGL.

## Rendering / performance rules
- **Canvas 2D only.** There are no float render targets and no MSAA bloom targets, because there are no GPU render targets at all. This satisfies the iOS rules ("no float RTs on iOS, no MSAA on bloom targets") trivially. Keep it that way: do not add WebGL post-processing.
- **Glow** uses a mip chain of downscaled 2D canvases (`bloomPass(boost)`). The two blurred levels are added back with `'lighter'` compositing. `boost` (the Superzapper surge) only re-adds those same two buffers, so it costs no extra blur.
- **Resolution** is DPR times supersampling. The pixel cap is about 5 MP on phones and 9.4 MP on desktop. Supersampling steps down automatically when fps stays below 45.
- **Game loop:** fixed 1/120 s update substeps (`update(h)`), with one render per animation frame.
- **Error handling:** `frame()` wraps everything in try/catch. Three consecutive frame errors (or any uncaught error or unhandled rejection, through the inline handler in `index.html`) show `#errbar` with the message and a **RELOAD** button. The player never gets a silent black screen.

## Movement model (v4), "analog rim"
- `player.pos` is a real-valued, *unwrapped* lane coordinate (lane + fraction). Every input writes `player.aim`. Each 8 ms tick, `pos` eases toward `aim` with an exponential filter (`MOVE.tau` = 20 ms), so motion is interpolated, frame-rate independent and jitter-free.
- **Derived values:**
  - `lane = floor(pos)`
  - `sub` is -1 / 0 / +1 (edge, centre, edge), with hysteresis. The rim-grab rule uses it.
  - `vis` and `lean` drive drawing. The claw rests in its lane and only hops across a rail in the outer 14 % of the lane.
- **Keyboard and d-pad:** a tap moves exactly 1/3 lane (to the next of the stops at lane+1/6, 1/2, 5/6). A hold accelerates smoothly from 5.5 to 17 lanes/s. On release, `settle()` glides to the next stop ahead of the *visible* position, so there is no lurch.
- **Gamepad stick:** proportional speed (0.2 deadzone, ^1.5 curve, up to 15 lanes/s). The d-pad behaves like the keys. In menus the stick behaves like the d-pad.
- **Mouse (desktop):** the claw tracks the pointer's rim position. `rimCoordAt()` maps a screen point to a rim coordinate: by angle on closed webs, by x on open webs, and by the crossing nearest the current aim on multi-valued shapes. Left button fires, right button triggers the Superzapper. Space fires, Enter triggers the Superzapper, F toggles smart autofire.
- **Touch:**
  - `#trim` covers the tube. Dragging along or around the rim moves the claw *relatively* with a gain of 1.15. Because it is relative, the finger never covers the claw and there is no jump on touch-down. Motion near the centre of closed webs is damped. A finger ring (`#tring`) shows the touch point.
  - `#tspin` and `#tknob` are the spinner: 1/3 lane per `TC.stepPx` of drag, and circling works too.
  - `#tfz` is a big fire zone behind FIRE and ZAP (the right part of the control area in portrait, the right panel in landscape).
  - `#tauto` toggles smart auto-fire (stored as `touchAuto`, default ON).
  - All touch handlers use `getCoalescedEvents()` and apply input inside the event handler, so there is no extra frame of latency. Controls are laid out from `env(safe-area-inset-*)`, read through `#tprobe`.
- **Smart auto-fire** (`laneHasTarget`) fires only when something is *down the tube* in the claw's lane (an enemy, an enemy shot, a spike or a drifting mine) or an enemy is about to flip in. It deliberately ignores enemies already on the rim, so the timed rim shot stays a skill and the anti-camping rule still works.
- **Mine walls:** `constrainMove()` stops the claw at the rail before a lane walled off by an armed rim mine, with a "bump" sound and flash.

## Enemies
- **Classic enemies:** flipper, tanker (carrying flipper, pulsar or fuseball), spiker, fuseball, pulsar.
- **v4 enemies:** defined in the `NEWE` table (colour, intro level, points, tip). The first one of each type in a game shows "NEW: NAME" plus a tip and plays the `newenemy` sound. Attract mode 2 is a live "KNOW YOUR ENEMY" guide.

| enemy | from | behaviour | counter-play |
|---|---|---|---|
| **PHASER** (orange double diamond) | L4 | Climbs like a flipper, but blinks 2–3 lanes sideways (biased toward you). It phases out (0.16 s), stays gone for `LP.phaseGone` while a flickering **ghost** marks the destination, then re-forms. It cannot be hit while phased. On the rim it blinks next to a distant claw, then hunts. | Pre-aim at the ghost lane. |
| **WARDEN** (blue hexagon with a cyan shield) | L5 | Slow climber. A 3-hit shield in front of it blocks shots (`ping`, then `wbreak` when it breaks). The shield also covers enemies behind it in the same lane. Before each shot it **vents**: the shield opens for about 0.55 s. | Hit it mid-flip or while it vents, or spend 3 shots on the shield. On the rim the shield is gone. |
| **SPARK** (white/cyan star) | L7 | Fast homing star. It steers toward the claw with limited lateral acceleration (momentum) and stops steering below z 0.14. On the rim it detonates: deadly in its own lane, and it kills rim enemies and armed mines within ±1 lane (+250 each, "CHAIN"). | Dodge late, or lure it onto rim enemies. |
| **MINE LAYER** (magenta crawler) | L8 | Dives to mid-tube, crawls sideways for 6–8 s dropping mines, then climbs like a flipper. Mines drift up (one shot kills one, 50 points). A mine that reaches the rim in the claw's lane kills you. Elsewhere it **arms** as a wall for `LP.mineLife`: neither the claw nor rim enemies can enter that lane (rim flippers go the other way round). Maximum 3 armed mines; the oldest fizzles. | Shoot mines early, or use the walls as cover against rim flippers. The Superzapper clears all mines. |

- **Pool counts** (`poolCounts`): the new enemy types are taken out of the flipper share, and flippers always stay at 4 or more.
  - phasers: min(1+⌊(L−4)/4⌋, 4)
  - wardens: min(1+⌊(L−5)/5⌋, 3)
  - sparks: min(1+⌊(L−7)/3⌋, 5)
  - layers: min(1+⌊(L−8)/6⌋, 2)

## Superzapper (v4)
- **First use (big):**
  - `zfx` timeline of about 1.3 s: jagged electric arcs race down every rail (the head reaches the far end at 0.34 s), then flicker and fade.
  - A crackling rim ring.
  - A chromatic tube-ring shockwave: the web cross-section drawn at three R/G/B depths racing down the tube.
  - A screen-space chromatic ring (`drawZapScreen`).
  - A white flash *before* bloom, so the flash blooms too.
  - A bloom surge (`bloomPass(boost)`) and screen shake.
  - Every zapped enemy gets a lightning bolt from the claw plus about 22 disintegration **shards**.
  - Enemy shots and mines are also disintegrated.
  - Sound: `zapBig()`, layering a sub drop, thunder crack, snap, detuned saws through a sweeping band-pass, a charge sweep, crackles and a shimmer tail. Each kill plays `zkill`.
- **Second use:** a smaller variant (kills one random enemy, `zap2`).
- **Phone performance:**
  - Shards are capped at 420 and batched into a few `stroke()` calls by colour and 4 alpha levels.
  - Arcs use 10 segments per rail on mobile and 16 on desktop.
  - Bolts are capped at 24.

## Testing hooks (`window.VORTEX`)
- **Hooks:** `freeze`, `step(sec, until)`, `key`, `spawn`, `setLane(l, sub)` (calls `placeClaw`), `emptyField` (also clears mines), `enemy(id)`, `setEnemy(id, o)`, `mineList`, `addMine(lane, z, armed)`, `setAuto`, `superzap`, `rimPoint(c)`, `rimCenter()`, `poolCounts(L)`, `gotoLevel`.
- **`state`:** includes `pos`, `aim`, `auto`, `mines`, `armed`, `shards` and `zfx`.
- **`window.__noWarp = true`** stops an empty field from warping (for tests).

## Tests
- **`games/tube-shooter/tests/vortex-v4.test.js`:** desktop 1280x800, iPhone 14 portrait and iPhone 14 landscape.
  - Keyboard tap and hold smoothness; mouse rim tracking and fire; smart auto-fire.
  - Wave intro, then each new enemy's behaviour: phaser blink and invulnerability, warden shield and vent, spark homing and chain, layer mines, mine walls, shooting mines.
  - Superzap FX and clear, the error banner.
  - Touch rim drags (CDP touch events, checked for monotonic aim), the fire zone, AUTO and the knob.
  - Console errors.
- **Root regression tests** (`tests/vortex-rim.test.js`, `tests/vortex-touch.test.js`) still pass.
  - Known flake: "▶ tap = one sub-position" depends on headless timing (the finger can be down longer than 140 ms at around 10 fps).
  - The landing-page section of `vortex-touch` currently fails because another worker rewrote the landing page (no `a.card[data-slug]`). That is unrelated to this game.
- **Run:**
  ```
  python3 -m http.server 8137                                  # from the repo root
  NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-v4.test.js http://localhost:8137 [shotDir]
  ```

## Repo etiquette
Other workers share this checkout. Stage only `games/tube-shooter` (plus `games.js` for this game's card text). Never `git add -A`, stash or reset.
