# VECTOR ARMOR

A graphically intense homage to Atari's 1980 first-person vector tank coin-op, made for the Behram Arcade.
You look through a periscope across an endless battlefield under a crescent moon, with a smoking volcano and
a mountain skyline that turns as you do. Pick off tanks, fast supertanks, zig-zag missiles that hop over
obstacles, and the bonus saucer (it can't shoot back). Watch the radar sweep and the ENEMY IN RANGE /
ENEMY TO LEFT / RIGHT / REAR warnings, and use the blocks and pyramids as cover: they stop shells and tanks.
You get one shell in the air at a time. Enemy shells are slow enough to dodge, and the glass cracks when you're hit.

Play: https://storkdoc.github.io/behram-arcade/games/vector-armor/

## Controls

**Mac keyboard**: ↑/↓ (or W/S) drive forward and back, ←/→ (or A/D) turn, **SPACE** fires, **P** pauses,
**M** mutes and **ENTER** starts and selects. In **OPTIONS → CONTROLS: CLASSIC** you get the cabinet's twin treads:
W/S is the left tread and ↑/↓ the right one (both up drives straight, opposite directions pivot).
**MOUSE AIM** (options) uses pointer lock: move the mouse to turn and click to fire.
**Gamepad**: left stick drives, A or the right trigger fires, Start pauses (classic mode: the two sticks are the treads).

**iPhone / iPad (portrait or landscape)**: the left thumb works a joystick. Push up to drive and sideways to turn.
The right thumb has the big **FIRE** button, and the pause button sits up top. In classic mode the joystick becomes
two tread sliders. Tap menus to choose.

## Modes

- **1 PLAYER GAME**: pick your starting level (higher levels bring supertanks and missiles sooner). Every
  5 kills raises the level. Extra tanks come at 15,000 and 100,000 points (bonus options are in OPTIONS).
  High scores with initials are saved in this browser.
- **TWO-PLAYER GAME (ONLINE)**: you see "Call your buddy…" plus a backup code. Your buddy picks
  **JOIN TWO-PLAYER GAME IN PROGRESS** and needs no code. It's a tank duel on the same battlefield, first to 5 hits,
  and each of you sees only your own periscope. The host runs the battlefield and the guest's own tank is
  predicted locally. The HUD shows a LINK ms readout. REMATCH is on the result screen. By default a CPU tank also
  prowls the duel (turn it off in OPTIONS → DUEL CPU TANKS).

## Tech

WebGL2 renderer: HDR with 4x MSAA (FXAA fallback), bloom, ACES tonemapping, glowing instanced vector lines over
rim-lit solids, ground reflections, a procedural sky, lava and particles. Resolution is native (capped at about
5 megapixels on phones), and quality adapts automatically to hold the frame rate. The HUD and text use a bitmap font
drawn on whole device pixels on a separate pixel-crisp canvas, so they never blur. When WebGL2 is missing, a Canvas2D
wireframe renderer takes over. The rules run at a fixed 60 Hz (`js/sim.js`). Sound is Web Audio. Online play uses
PeerJS (vendored), with slot matchmaking on `behram-bz-v1-slot-N`.

Tests (run from the repo root with `python3 -m http.server 8080`):
`node games/vector-armor/tests/game.test.js` and `node games/vector-armor/tests/mp.test.js` (needs `playwright-core`).
