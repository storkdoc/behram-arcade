# Astro Shatter

A graphically advanced homage to the 1979 vector rock-blasting coin-op. It plays by the original's rules, with modern art:
real-time **3D rocks** in WebGL2 (procedurally cratered, normal-mapped, lit by a distant sun), a lit metallic ship with
an engine plume, HDR bloom, particle debris, shockwaves and screen shake, all over a drifting nebula with a ringed planet.
An optional **Classic** graphics mode switches to glowing white vector outlines, like the original cabinet's beam-drawn
screen.

## Controls
**Mac**: **← →** rotate, **↑** thrusts, **Space** fires (one shot per press, as in the arcade), **Enter / Shift / ↓**
jump to hyperspace, **P** or **Esc** pauses, **M** mutes. Menus: arrows + Enter. A gamepad works too: stick or d-pad
rotates, **A** fires, **RT** or d-pad up thrusts, **B** jumps to hyperspace, **Start** pauses.

**iPhone / iPad (portrait or landscape)**: **◀ ▶** buttons rotate, **THRUST** pushes, red **FIRE** shoots (hold it
to auto-fire), and **HYPER** jumps. Use several fingers at once. In Options, **TOUCH STEERING: STICK** switches to a
virtual stick that points the ship where you push. On-screen buttons pause and mute, and you tap the menus.
In portrait the controls sit in a panel below the playfield.

## Rules (as in the original)
- Large rocks split into 2 medium ones (20 points), medium rocks split into 2 small ones (50), and small rocks are
  destroyed (100). Each wave starts with more large rocks, and they get faster.
- Your ship has inertia and wraps around the screen edges. You can have at most 4 shots on screen, and they wrap and
  then expire.
- **Hyperspace** makes you vanish and reappear somewhere random, and sometimes the jump destroys your ship.
- The **big saucer** (200) fires at random. The **small saucer** (1000) aims at you, and it gets more accurate as your
  score climbs. Small saucers show up more often in later waves.
- The two-tone heartbeat speeds up as the wave goes on. You get an extra ship every 10,000 points.
- You can choose your starting wave (1–9) on the arcade-style select screen. The top 10 scores, with initials, are
  saved in this browser.

## Two-player (online)
One player chooses **TWO-PLAYER GAME (ONLINE)**. The screen says: *"Call your buddy and tell them to hop on their bike
and head over. The game is loading… just like the old days."* The buddy chooses **JOIN TWO-PLAYER GAME IN PROGRESS**,
and no code is needed. A 5-letter backup code is shown in case the automatic match fails.

Each player flies **their own field**, and both fields start from the same seed. You never see the rival's field, only a
small readout with their score, wave and lives, plus the **LINK** latency in ms. Every 2nd large rock you break hurls
a large rock into your rival's field, and every 8th sends them a small saucer. The higher score wins, and you can
rematch. If your buddy disconnects, you're told and can keep playing solo.

Only small status messages cross the wire (score, wave, lives, rocks left, attacks and game over), never any positions
or field data. The link uses PeerJS WebRTC (vendored `peerjs.min.js`) with the namespace `behram-ast-v1-`.

## Tech
Plain JS with no build step.

| File | Contents |
|---|---|
| `js/sim.js` | deterministic rules at a 60 Hz fixed tick (seeded RNG) |
| `js/render.js` | WebGL2: HDR (RGBA16F) target, 4× MSAA (FXAA fallback), bloom mip chain, ACES tone mapping, 3D rock and ship meshes |
| `js/meshes.js` | procedural rock, ship and saucer geometry |
| `js/render2d.js` | Canvas2D fallback when WebGL2 is unavailable |
| `js/fx.js` | particles, shockwaves, screen shake |
| `js/font.js` | bitmap HUD font drawn on whole device pixels on a separate HUD canvas, so text stays pixel-crisp |
| `js/audio.js` | Web Audio synth: heartbeat, thrust, saucer sirens, explosions |
| `js/net.js` | online matchmaking (slot scan + backup code) |

Rendering is always at the native device-pixel ratio, capped at about 5 MP on phones. If the frame rate stays below 45 fps
for 3 s, adaptive quality drops effects (bloom levels, rock detail, particles, MSAA → FXAA), never the resolution.
URL flags: `?nogl` (force Canvas2D), `?q=0|1|2` (fixed quality), `?nomsaa`, `?touch=1`.

## Tests
```
python3 -m http.server 8080 &     # from the repo root
NODE_PATH=<playwright-core dir> node games/astro-shatter/tests/game.test.js   # rules, desktop, gamepad, iPhone, fallback, arcade regression
NODE_PATH=<playwright-core dir> node games/astro-shatter/tests/mp.test.js     # online two-player (fake PeerJS + broker)
```
