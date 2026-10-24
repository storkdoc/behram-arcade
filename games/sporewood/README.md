# SPOREWOOD

A high-fidelity homage to the 1981 trackball bug-shooter coin-op, built for the Behram Arcade.
Plain HTML5 canvas + Web Audio, no build step. Play: https://storkdoc.github.io/behram-arcade/games/sporewood/

## The game
- A segmented centipede winds down through a mushroom field. Shoot a segment and it **splits**: the rear half grows a new head and the hit segment leaves a **mushroom**. Heads 100, body 10.
- Hitting a mushroom (or the field edge) makes it drop a row and reverse. When it reaches the bottom it turns back up, but **stays inside the player zone**. Then **new heads** start crawling in from the sides of the zone. Lone heads move faster. Every wave is faster, and swaps more of the body for extra heads (12+0, 11+1, 10+2 ...).
- **Mushrooms take 4 hits** (1 pt). **Fleas** (from wave 2) drop when the zone runs low on mushrooms and sow new ones; they take 2 hits and the first one makes them fall faster (200). **Spiders** zig-zag and bounce through the lower band and eat mushrooms (300/600/900 depending on how close they are). **Scorpions** (from wave 3) poison every mushroom they cross (1000), and a centipede that touches a poisoned mushroom **dives straight down**.
- Losing a life restores every damaged or poisoned mushroom for 5 points each. Extra shooter every 12,000 (12k/15k/20k/never in Options). Each wave has a new forest palette (8 palettes). Arcade start-wave select (1-9). Top-10 high scores in localStorage.

## Controls
**Mac**: click the field to grab the trackball (Pointer Lock). Then roll the mouse or trackpad, or **swipe with two fingers** (the wheel; natural or reversed in Options). The ball model is the same one as Trackball Football: the faster you stroke, the faster the shooter moves. A hard flick keeps gliding after you let go, and a slow nudge stops dead. **Arrows/WASD** move with acceleration. **Space/Z/X or click** fires, and holding it auto-fires. **P** pauses, **M** mutes, **Enter** starts or selects, and **Esc** lets go of the ball (and pauses).
**Gamepad**: stick or d-pad rolls the ball. A/X/RT/RB fire, Start pauses.
**iPhone / iPad**: drag anywhere on the field or on the trackball pad to roll. Flick to glide. Hold the red **FIRE** button to auto-fire; the AUTO button toggles this. You can roll with one thumb while firing with the other. Pause and sound buttons are on screen. Works in portrait (controls under the field) and landscape (pad left, FIRE right).

## Online two-player
One player picks **TWO-PLAYER GAME (ONLINE)** and sees "Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.", plus a backup room code. The friend taps **JOIN TWO-PLAYER GAME IN PROGRESS**. No code is needed; it scans the waiting slots. Each player plays their own forest from the same seed, and **neither ever sees the other's field**. Only the score, wave, lives and segments left are sent, for a small RIVAL readout. Harassment: clear a wave and your rival gets a mushroom row plus a flea. A point-blank 900 spider sends a flea. Most points wins, and you can rematch. Uses PeerJS (public broker) with its own namespace `behram-spw-v1-`.

## Graphics
Native device-pixel-ratio canvas (2:1 supersampling on 1x screens), a bloom pass (`ctx.filter` blur, with a downscale fallback for Safari), and adaptive quality. The adaptive quality sheds particles and supersampling but never goes below native resolution. All text is a bitmap font drawn on whole device pixels. The forest floor has leaves, moss, twigs, pebbles, light shafts, spores and fireflies. The mushrooms are glossy, with gills, spots and charred bite damage. The centipede is articulated, with walking legs. The spider, flea and scorpion are animated, and the player is a little gnome-mage with a glowing wand.

## Files
`js/sim.js` rules (deterministic, 60 Hz) · `js/trackball.js` virtual trackball · `js/render.js` drawing + bloom · `js/audio.js` synth · `js/net.js` PeerJS matchmaking · `js/main.js` screens, input, layout · `js/font.js` pixel font.

## Tests
From the repo root: `python3 -m http.server 8080 &`, then
`NODE_PATH=<dir with playwright-core> node games/sporewood/tests/game.test.js` (rules, trackball physics, desktop + iPhone portrait/landscape touch, render fallbacks, arcade regression) and
`node games/sporewood/tests/mp.test.js` (online flow on an in-page PeerJS stand-in with simulated latency).

Not affiliated with or endorsed by Atari; "Sporewood" is an original homage.
