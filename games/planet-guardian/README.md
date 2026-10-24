# Planet Guardian

A high-fidelity homage to the 1981 side-scrolling planet-defense coin-op. It plays by the original's rules, but the art
is modern: a wrapping world under a painted nebula sky with a cratered moon, two parallax mountain ranges lit by the
horizon glow, a glowing planet ridge with strata and settlement lights, a vector-shaded ship with a thrust plume, broken
colour-cycling laser streaks, voxel explosions in which each enemy's own pixels fly apart, selective bloom and screen shake.

## Controls
**Mac**: **↑ ↓** (or W/S) move. **← →** (or A/D) thrust, and pressing the opposite way flips the ship instantly.
**Space** fires (hold to auto-fire), **Enter** fires a smart bomb, and **H** or **Shift** jumps to hyperspace.
**P** or **Esc** pauses and **M** mutes. Menus use the arrows with Enter or Space.
A gamepad also works: the stick or d-pad flies, **A** fires, **B** fires a smart bomb, **X** or **Y** is hyperspace,
and **Start** pauses.

**iPhone / iPad (portrait or landscape)**: the left thumb works a floating joystick. Up and down move the ship, and
left and right thrust (flick the other way to reverse). The right thumb has **FIRE** (hold to auto-fire), **BOMB** and
**HYPER**. In portrait the controls sit below the playfield; in landscape they sit on either side. Pause and sound
are on-screen buttons, and you tap the menus.

## Rules (as in the original)
- **Ten humanoids** walk the surface. **Landers** (150) hunt them, descend and lift them away. A lander that reaches
  the top of the sky becomes a **mutant** (150), which chases you, and the humanoid is lost.
- Shoot the abductor and the humanoid falls. **Catch it** for 500 and **set it down on the ground** for another 500.
  A humanoid that falls a short way lands safely (250); one dropped from high up dies. Your own laser can kill humanoids.
- Lose every humanoid and **the planet explodes**: the terrain is gone and every lander becomes a mutant. The planet
  is **rebuilt every fifth wave** (5, 10, 15 …) with ten new humanoids.
- **Bombers** (250) lay mines, **pods** (1000) burst into **swarmers** (150) when shot, and **baiters** (200) arrive
  if you take too long to finish a wave, then match your speed and shoot.
- **Smart bombs** destroy everything on screen (pods leave no swarmers) and clear bullets and mines. **Hyperspace**
  jumps to a random spot on the planet. In the classic setting it fails 1 time in 8; Options can make it always safe.
- The **scanner** at the top shows the whole planet centred on your view, including every enemy, humanoid, the ship and the terrain.
- A wave ends when every lander and mutant is destroyed. The wave bonus is **100 × wave** (max 500) for each surviving
  humanoid. You get an extra ship and smart bomb every 10,000.
- You can choose your starting wave (1–9), as on the arcade's operator setting. The top 10 scores are saved in this browser.

## Two-player (online)
One player chooses **TWO-PLAYER GAME (ONLINE)**. The screen says to call your buddy and have them hop on their bike.
The buddy chooses **JOIN TWO-PLAYER GAME IN PROGRESS**, and no code is needed. A 5-letter backup code is shown in case
the automatic match fails.

Each player defends **their own planet** from the same seed. You never see your rival's world, only a small readout
with their score, wave, lives (♥) and humanoids (☺). **Every humanoid you return to the ground sends 2 swarmers** at
your rival, and **every wave you clear sends 4**. The higher score at the end wins, and you can rematch.

Only small status messages are sent between players (score, wave, lives, humanoids left, raid and game over), never
any world data. The link uses PeerJS WebRTC with the namespace `behram-pg-v1-`.

## Tech
The game is plain canvas and JS with no build step. Files:

| File | Contents |
|---|---|
| `js/sim.js` | rules at a 60 Hz fixed tick: a 2560-unit wrapping world, 240 units tall |
| `js/render.js` | rendering at native device-pixel ratio (up to 3), with 2× supersampling on 1× screens |
| `js/font.js` | bitmap HUD font drawn on whole device pixels, so text stays crisp |
| `js/audio.js` | Web Audio synth, including a thrust rumble and optional space ambience |
| `js/net.js` | matchmaking |

The view width adapts to the screen: 240 units on a portrait phone and up to 430 on a wide Mac window.

Bloom uses a mip chain and `ctx.filter`, with a multi-tap fallback for Safari. Adaptive quality reduces particles and
then supersampling, but never renders below native resolution. URL flags: `?noglow`, `?nofilter`, `?touch=1`.

## Tests
```
python3 -m http.server 8080 &     # from the repo root
NODE_PATH=<playwright-core dir> node games/planet-guardian/tests/game.test.js   # desktop + iPhone + iPad + rules + arcade regression
NODE_PATH=<playwright-core dir> node games/planet-guardian/tests/mp.test.js     # online flow on a PeerJS stand-in
```
