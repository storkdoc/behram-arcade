# Star Invaders

A high-fidelity homage to the 1978 alien-invasion coin-op. It plays by the original's rules, but the art is modern:
glossy voxel-bead invaders with glowing eyes, a lit metallic cannon, bevelled shields that crumble crater by crater,
selective bloom, particle debris and screen shake, all over a parallax starfield with a ringed gas giant and a home-planet
horizon. An optional **classic cabinet** mode adds the red/green cellophane bands.

## Controls
**Mac**: **← →** (or A/D) move, **Space** fires, **Enter** starts or selects, **P** pauses, **M** mutes, **Esc** goes back.
A gamepad also works (stick or d-pad to move, A to fire, Start to pause).

**iPhone / iPad (portrait or landscape)**: hold the ◀ ▶ rocker, or drag anywhere on the field and the cannon follows
your finger. Tap the red **FIRE** button to shoot. Holding it auto-fires, and **AUTO** switches to always-on fire. The
on-screen buttons pause and mute, and you tap the menus.

## Rules (as in the original)
- The rack is 5 × 11 aliens: squids are worth 30, crabs 20 and octopi 10. The rack steps **one alien per frame**, so
  it speeds up as you thin it out, and the four-note heartbeat speeds up with it. Each kill freezes the rack for a moment.
- There are three bomb types, at most one of each on screen: the **rolling** bomb aims at you, and the **plunger** and
  **squiggly** bombs follow the original column tables. Bombs fall faster once you reach 8 or fewer aliens, and they
  reload faster as your score climbs. A rolling bomb usually survives a hit from your shot.
- Shields erode per pixel from your shots (from below), bombs (from above) and aliens marching through them.
  Bombs also chip the ground line.
- The **mystery ship** comes about every 25 s while 8 or more aliens remain. Its value follows the classic
  shot-count table, so the 23rd shot and then every 15th after it scores **300**. The side it enters from depends
  on your shot count.
- You get an extra base at 1,500 (1,000 is available in Options). Each new wave starts lower, cycling after wave 9.
  The game ends when the aliens reach your line.
- You can choose your starting wave (1–9), as on the arcade's operator setting. The top 10 scores are saved in this browser.

## Two-player (online)
One player chooses **TWO-PLAYER GAME (ONLINE)**. The screen says to call your buddy and have them hop on their bike.
The buddy chooses **JOIN TWO-PLAYER GAME IN PROGRESS**, and no code is needed. A 5-letter backup code is shown in case
the automatic match fails.

Each player plays **their own field** from the same seed. You never see your rival's field, only a small readout
with their score, wave, lives and aliens left. **Clearing a whole row sends a raid**, which makes the rival's rack drop
one extra step. The higher score at the end wins, and you can rematch.

Only small status messages are sent between players (score, wave, lives, aliens left, raid and game over), never any
playfield data. The link uses PeerJS WebRTC with the namespace `behram-inv-v1-`.

## Tech
The game is plain canvas and JS with no build step. Files:

| File | Contents |
|---|---|
| `js/sim.js` | rules at a 60 Hz fixed tick on a 224×256 logical field |
| `js/render.js` | rendering at native device-pixel ratio (up to 3), with 2× supersampling on 1× screens |
| `js/font.js` | bitmap HUD font drawn on whole device pixels, so text stays crisp |
| `js/audio.js` | Web Audio synth |
| `js/net.js` | matchmaking |

Bloom uses a mip chain and `ctx.filter`, with a multi-tap fallback for Safari. Adaptive quality reduces particles and
then supersampling, but never renders below native resolution. URL flags: `?noglow`, `?nofilter`, `?touch=1`.

## Tests
```
python3 -m http.server 8080 &     # from the repo root
NODE_PATH=<playwright-core dir> node games/star-invaders/tests/game.test.js   # desktop + iPhone + rules + arcade regression
NODE_PATH=<playwright-core dir> node games/star-invaders/tests/mp.test.js     # online flow on a PeerJS stand-in
```
