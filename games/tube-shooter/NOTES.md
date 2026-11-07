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

## Wave formations (v5, 2026-10-29)
Every level from 3 on has a spawn **formation**. The enemy pool (types and count, `poolCounts`) is unchanged; only where
and when enemies enter changes. The level intro shows `WAVE: <NAME>` (first time per game also a one-line tip).
- Cycle from L3 (`WAVE_CYCLE`, `waveKind(L)`): SWARM, STREAM, PINCER, SPIRAL, STREAM, SWARM, SPIRAL, PINCER (repeats). L1-2 are STREAM.
- **STREAM**: one entry at a time in a random lane (the old behaviour), gap `spawnGap * 0.6-1.3`.
- **SWARM**: packs of 3 in adjacent lanes 0.14 s apart (open webs shift the pack inward), then a lull of `spawnGap * 2.2-2.7`.
  Kill every member of a pack with your own shots (or a lured Spark chain) for **PACK CLEAR +200 per member**; a pack
  touched by the Superzapper pays nothing. Sounds `swarm` (pack enters) and `pack` (clear).
- **PINCER**: pairs 0.06 s apart on both sides of the claw, `max(2, round(n/4)) + 0-1` lanes away, gap `spawnGap * 1.7-2.1`.
- **SPIRAL**: entries step 2 lanes (1 on webs under 14 lanes) around the web at `spawnGap * 0.78-0.9`; open webs bounce at the ends. Readable, so you can pre-aim.
- Average entry rate per enemy is about the same as STREAM (0.8-0.95 x spawnGap). `maxActive` still caps the field; a pack never plans more members than there is room for.
- Fuseballs keep their own random rail. On a death the queued formation and packs are reset (enemies go back to the pool).
- Hooks: `VORTEX.wave()` (kind, queued, packs, packClears, spawn log), `waveKind(L)`, `kill(id, zapped)`, `score()`, `playerLane()`, `webInfo()`.
- Test: `games/tube-shooter/tests/vortex-waves.test.js` (desktop + iPhone 14; geometry and timing of each formation, PACK CLEAR paid by shots and not by the Superzapper, live intro, 25 s of real level-8 play, no console errors).

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
  - Fixed 2026-10-29: the intermittent `vortex-touch` failures "heat limit still applies to touch FIRE" and "ZAP fires the superzapper" were a test bug. The test emptied the field without `__noWarp`, so the game warped to the next level and FIRE/ZAP were measured during the warp and zoom-in (ZAP only works in play). Reproduced on unmodified code (2 FAIL), 131/131 PASS twice after the fix.
- **Run:**
  ```
  python3 -m http.server 8137                                  # from the repo root
  NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-v4.test.js http://localhost:8137 [shotDir]
  NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-waves.test.js http://localhost:8137 [shotDir]
  ```

## Repo etiquette
Other workers share this checkout. Stage only `games/tube-shooter` (plus `games.js` for this game's card text). Never `git add -A`, stash or reset.

## Day 2 eval (2026-10-29): shot warning + death tips
- Bot playtests: most deaths were enemy "shot" (then spike, capture), clustered at L5 (Warden debut) and L8+.
- Incoming-shot warning: an enemy shot in the last 35 % (SHOT_WARN_Z) of the claw's own lane lights that lane's rim edge
  and the near rail ends red, brighter as it closes (drawShotWarn, additive glow). Cue only, no gameplay change.
- Death cause + tip: after each lost life a one-line cause ("HIT BY AN ENEMY SHOT", "GRABBED AT THE RIM", ...) and,
  the first two times per cause per game, a short tip (DEATH_TIPS in game.js).
- Hooks: VORTEX.shotWarn(), shotWarnFrames(), addEShot(lane, z), messages().
- Test: `node games/tube-shooter/tests/vortex-tips.test.js http://localhost:PORT` (desktop + iPhone).
- tests/vortex-touch.test.js: the "▶ tap = one sub-position" check retries when a warp/new web lands inside the tap
  window (it reset the lane 4:0 -> 1:0 on iPhone portrait: a test race, not a game bug).

## Day 3 (2026-10-30): pad rumble + audible shot warning
- Haptics (game.js, `HAPTIC` table + `Haptics`): every game sound with a haptic entry also rumbles the active gamepad
  (`vibrationActuator.playEffect('dual-rumble')`, Firefox `hapticActuators`), or calls `navigator.vibrate` on touch
  (Android; iOS Safari has no vibration API, so iPhone gets the audio cue only). Device = last input (keyboard/mouse,
  pad, touch). Throttled; H toggles (saved as `haptics`), help row added.
- Shot warning is now audible too: one `shotwarn` double-blip (+ a light rumble) the moment an enemy shot enters
  SHOT_WARN_Z in the claw's lane (once per shot). Shots are still the #1 death cause, and the visual rim cue was easy
  to miss while watching the far end of the web.
- Hooks: VORTEX.shotWarnCues(), eshotList(), haptics() -> {on, src, log, padHeld}.
- Test: `node games/tube-shooter/tests/vortex-haptics.test.js http://localhost:PORT` (fake gamepad + vibrate stub;
  desktop pad + iPhone touch).

## Day 4 (2026-10-31): Tempest 2000-style POWER-UPS
- From level 2 a shot kill (not a zap) drops a green spinning crystal (first after 7-9 kills, then every 16-21; one on
  the web at a time). It drifts up its lane, waits ~2.6 s on the rim (beacon ring, blinks before it fizzles); the claw
  catches it by being in / moving into its lane. Warp auto-collects any crystal still on the web.
- Order: 1 PARTICLE LASER (shots 1.45x faster, pierce one enemy, burn through enemy shots, Warden shields -2, 0.7x
  barrel heat, cyan streak + 'lshoot' sound; kept until you lose a life), 2 AI DROID (orange diamond riding just inside
  the rim; flies 9 lanes/s to the enemy closest to the rim, fires every 0.45 s, droid shots don't count toward the
  8-shot cap; 12 s, at most to the end of the level, then DROID OFFLINE), 3+ BONUS 2500. Losing a life: POWER-UPS LOST.
- Feedback: 'pupdrop'/'pup' sounds, green flash, shards, MoodSticker, HAPTIC.pup on pads/phones; first-catch tips.
  No new inputs: works with keyboard, mouse, touch (iPhone/iPad), gamepad because catching is just steering.
- Hooks: VORTEX.pups(), dropPup(lane, z), power() -> {laser, droid, n, kills, next, stats}, shotList().
  window.__noPups = true disables drops (older tests that count kills/shots are unaffected).
- Test: tests/vortex-powerups.test.js (12 checks x desktop + iPhone 14). v4/waves/tips/haptics/rim/touch still pass.
- Bot (eval, 4 games each, pup-seeking): death level sharp 13/11/13/5 (baseline no-pups 10/10/10/6), average 7/12/12/8
  (baseline 7/7/4/10). A first try (every 8-11 kills, droid all level) gave sharp 10-18, too generous; tuned down.

## Day 5 (2026-11-01): JUMP (Tempest 2000)
- Why: enemy shots have been the #1 death cause in every eval (days 2-4). JUMP gives the claw a skill-based answer.
- Crystal order is now 1 PARTICLE LASER, 2 JUMP, 3 AI DROID, 4+ BONUS 2500. JUMP lasts until you lose a life.
- Input: SHIFT or J (keyboard), pad Y/LB/RB (buttons 3/4/5), mouse middle button, or the green JUMP touch button.
  On portrait it sits left of FIRE under ZAP; on landscape it sits above ZAP. Both are clear of the knob and the top bar.
- Feel: 0.75 s sine arc lifting the claw off the rim, with a shadow left on the rim, a green thrust trail, and land shards.
  1.5 s recharge (HUD bar, button dims). Before you have it, pressing it shows "NO JUMP YET" once and plays a soft buzz.
- While airborne, enemy shots, grabs (flipper capture), pulsar zaps, fuseball touches, spikes/mines and mine walls
  can't hurt you; each dodge is +50 with a "DODGED!" pop (throttled). Landing next to a grabber still kills, so it's
  a timing tool, not a shield.
- Hooks: VORTEX.jump() -> {has, air, h, cd, n, dodged}, VORTEX.doJump(); power() includes jump.
- Test: tests/vortex-jump.test.js (desktop, iPhone 14, iPhone 14 landscape: gating, launch by key/button/pad/mouse,
  touch button visible and non-overlapping, recharge, shot dodge, airborne grab immunity then grab after landing,
  mine-wall hop, death loses JUMP, no console errors). vortex-powerups updated for the new order.

## Day 6 (2026-11-02): WARP TOKENS + BONUS WARP (Tempest 2000 bonus round)
- Why: the eval bot (12 games each) dies around level 9-13 and power-ups end at "BONUS 2500", so a clean run had no
  goal beyond score. Tempest 2000 rewards clean play with a bonus round; this adds one that uses only steering.
- WARP TOKENS: clear a level from level 3 up without losing a life ("EXCELLENT! NO LIVES LOST"), or catch a 4th+ green
  crystal (now "WARP TOKEN +1000" instead of BONUS 2500). Tokens are kept when you die and reset on a new game.
  HUD: three green diamonds under the power-up line (only shown once you have one).
- BONUS WARP: with 3 tokens the next level clear opens a gate round inside the warp (tokens go back to 0). 16 glowing
  gates race up the tube (1.7 s travel, 1.15 -> 0.72 s apart, the path steps 1 lane, then up to 2, then up to 3);
  the next gate's rim edge lights up as it closes. Steer the claw into its lane as it reaches the rim. No shooting, nothing
  can hurt you. Each gate = 250 x streak multiplier (x1..x4, every 4 in a row), a chime that climbs a pentatonic scale
  with the streak; a miss is a low buzz, a small shake and resets the streak. End: all 16 = PERFECT +10000 + extra life;
  12+ = EXCELLENT +5000; else "KEEP CLOSER TO THE GATES". Then the normal warp flight (spikes still count).
- Inputs: it is ordinary claw steering, so keyboard, mouse, touch spinner/knob and gamepad all work (tested).
- Hooks: VORTEX.bonus() -> {tokens, clean, active, stats, b:{t, passed, missed, streak, pts, gates[{lane, at, res, z}]}},
  giveToken(), setTokens(n), bonusCfg(). window.__noTokens / window.__noBonus switch them off for other tests.
- Test: tests/vortex-bonus.test.js (desktop: clean-level token, kept on death, 3 tokens open the bonus, gate path on the web,
  arrow/mouse/pad steer, no fire, perfect bot 16/16 + extra life + next level, ignoring gates = no life and no death;
  iPhone 14 the same with the touch spinner; no console errors). vortex-powerups updated for the 4th-crystal token.
- Balance (bot, 12 games, fuseball-dodging + gate-following): ~2.75 bonus rounds per 15-minute game. A first version
  (400/gate, PERFECT +20000 + life, EXCELLENT + life) handed out ~2-3 lives per round (the points also crossed 20 000-point
  lives) and 6 of 12 bot games ran out the 15-minute cap alive, so it was cut to 250/gate, PERFECT +10000 + 1 life,
  EXCELLENT +5000 (a perfect round is ~20 750 points).

## Day 7 (2026-11-03): RIM GRAB WARNING
- Why: in today's bot eval (6 games, sharp + average, the bot now uses JUMP on close shots), rim grabs were the joint #1
  death cause (13 of 36 deaths, the same as enemy shots). JUMP had taken the edge off shots, but nothing telegraphed a grabber
  sliding along the rim toward the claw. Death level: sharp 12/14/17, average 13/14/13.
- What: a grabber on the rim (flipper, pulsar, phaser, warden, a climbing mine layer) within 2 lanes of the claw draws
  pulsing orange chevrons in its lane, just inside the rim, pointing at the claw (>> = next lane, > = 2 lanes away).
  In the claw's own lane the rim edge burns orange, then white-hot, with the grab countdown (`landT / grabDelay`).
  When it reaches the next lane, a low sawtooth 'wup-wup' plays once (unlike the high shot beep), with a pad rumble
  (`grabwarn` haptic). There's a 0.35 s global throttle, and the cue re-arms once it is 2+ lanes away again. Fuseballs
  (dodge them) and enemies still down the tube aren't flagged. It only telegraphs: the timed rim shot is still the skill.
- The capture death tip now reads "ORANGE RIM ARROWS = GRABBER COMING. SHOOT FIRST".
- Hooks: `VORTEX.grabWarn()` -> {threats:[{id,type,d}], frames, cues}.
- Test: tests/vortex-grabwarn.test.js (desktop, iPhone 14, iPhone 14 landscape: far = none, 2 lanes = drawn, no cue;
  adjacent = one cue, no repeat; kill clears it; fuseball / climbing flipper not flagged; in-lane countdown flagged before the
  grab; capture tip; no console errors).

## Day 8 (2026-11-04): WARP SPIKE GUIDE + landscape MODE button
- Why: today's bot eval (8 games, fuseball-dodging bot, sharp + average) died to: enemy shots 15, fuseballs 10, rim grabs 9,
  zaps 7, spikes 4 of 45 (death level sharp 14/11/10/13, average 13/12/12/9). Rim grabs dropped from #1 (yesterday 13 of 36)
  after the rim grab warning. Spike deaths are few but every one lands during the warp ~ the instant the level ends, the only
  death in the game with no on-screen tell beyond a thin spike line rushing at you.
- What: during the end-of-level warp, a spike in the claw's lane burns red, then white-hot, with a white tip dot, and a
  'parking sensor' blip (triangle + sine, `spikewarn` haptic) repeats faster as the tip closes in (gap 0.40 s -> 0.07 s).
  The nearest spike-free (or already passed) lane each way lights green just ahead of the claw. Steering out of the lane
  stops it at once. First time per game: "SPIKE AHEAD! STEER TO A GREEN LANE". Off during the bonus warp (the gate path
  is the guide there). It only telegraphs: you still have to steer (or shoot it short).
- Phone landscape: the touch MODE: SPINNER/ARROWS button sat under the feedback sticker (top-left, 48 px down). It now
  starts at least 100 px from the top (below the sticker). Portrait unchanged.
- Hooks: `VORTEX.spikeGuide()` -> {ahead, dz, lane, safe[], frames, beeps, steered}, `VORTEX.setSpike(lane, depth)`.
- Tests: tests/vortex-spikewarn.test.js (desktop 1440x900, iPhone 14, iPhone 14 landscape: flagged, safe lanes, blip starts
  and speeds up, tip, standing still = spike death, steering away clears it and the warp reaches the next level with no life
  lost, clear lane silent, bonus warp unaffected, no console errors). tests/vortex-modebtn.test.js (iPhone 14 / SE / Pixel 7
  landscape + iPhone 14 portrait: MODE clear of sticker, knob, arrows; still toggles).

## Day 9 (2026-11-05): FUSEBALL RIM WARNING + PULSAR ZAP CUE
- Why: today's bot eval (8 games, fuseball-dodging, sharp + average) died to: enemy shots 12, pulsar zaps 12, rim grabs 10,
  fuseballs 9, spikes 4 of 47 (death level sharp 7/11/15/13, average 12/15/12/11). Fuseballs were still ~1 in 5 deaths and
  the only major kill with no on-rim telegraph (grabs/shots/spikes already warn). Zaps tied shots for #1; the lane already
  flashes white but nothing beeped the way a shot or grab does.
- FUSEBALL WARNING: a rim fuseball (invulnerable; dodge only) within 2 rail-steps of the claw draws pulsing white/cyan
  sparks on its rail (denser when adjacent); on a lethal rail the rim edge burns white-hot with radial sparks. A bright
  chirp (`fusewarn`, + pad rumble) plays once when it first comes within 1 rail. Jumping fuseballs that would cross the
  claw's lane are flagged the same way. Mid-tube fuseballs and grabbers are not. Tip: "WHITE RIM SPARKS = FUSEBALL…".
- PULSAR ZAP CUE: when a pulsar in the claw's own lane enters the lethal pulse window a rising buzz (`zapwarn`) plays
  once per pulse (0.55 s throttle). Tip: "WHITE LANE + RISING BUZZ = ZAP COMING…". Visual telegraph unchanged.
- Hooks: `VORTEX.fuseWarn()` -> {threats:[{id,type,d,jump}], frames, cues}, `VORTEX.zapWarn()` -> {cues, pulsing, pulseAmt, armed}.
- Test: tests/vortex-fusewarn.test.js (desktop, iPhone 14, iPhone 14 landscape: far/near/adjacent/lethal rail, tip, flipper
  and mid-tube ignored, one chirp, zapwarn once per pulse with auto-fire off; no console errors). grabwarn regression OK.

## Day 11 (2026-11-07): grab-imminent telegraph
After the day-10 shot charge-up, bot deaths flipped to **captures** and fuseballs. Same-lane grabbers already drew a
rim burn and a soft `grabwarn`, but the soft cue was easy to miss and high-level `grabDelay` bottomed out at 0.1 s.
- `grabDelay` floor raised 0.1 → **0.18** (and the base 0.25 → 0.28), so the shot/JUMP window stays readable.
- At 40% of the countdown a sharper `grabimminent` "bwaah" (+ stronger pad rumble) fires once, and the claw lane flashes
  white/red with an inset rim. Tip text updated.
- `VORTEX.step` / `gotoLevel` now call `touchSync()` so frozen harnesses keep `data-ts=game` (fixes modebtn null crash).
- Hooks: `grabWarn().imminent`, per-threat `imminent`, `deathTips()`.
- Tests: `tests/vortex-grabimminent.test.js`, `tests/vortex-modebtn.test.js`.
