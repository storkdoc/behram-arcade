# Trackball Football

A modern homage to Atari's 1978 trackball coin-op *Atari Football*: 7-on-7, side-view broadcast camera,
and a heavy virtual trackball. Stroke it faster and your man runs faster; let go and it keeps rolling
until friction stops it.

## Controls

**Mac (mouse or trackpad)**
- Click the field to grab the trackball (Pointer Lock), then roll the mouse or trackpad. **Esc** lets go.
- A two-finger trackpad swipe also spins the ball without grabbing anything (natural or inverted, in Options).
- **Click / Space**: lock in a play, hike, throw, juke (and mash it to fight out of a tackle).
- **Shift / X / right-click**: pick the next receiver before you throw, or cycle to the next defender.
- **F** (or Shift / right-click while calling, or the FLIP pill): **flip** the play you're calling, mirrored left-right.
- **Defense, Space / click**: jump to the defender closest to the ball (the runner, or where a pass is coming down);
  near the runner it's a diving tackle. With a pass in the air, **press again right as it arrives** to lunge for a pick.
- Arrows / WASD roll the ball too. A gamepad works (A = action, B = next, LB/RB = flip, Y = helmet cam). **P** pauses, **M** mutes,
  **V** turns the **HELMET CAM** on or off.

**iPhone / iPad (portrait or landscape)**
- Swipe or flick the trackball drawn on screen. A faster flick spins it harder, it coasts after your finger
  lifts, and a resting finger brakes it.
- Red button: lock in / hike / throw / juke / dive; on defense it takes the man closest to the ball, and a second
  tap as a pass arrives lunges for the pick. Blue button: next receiver / next defender.
- Tap a play card to pick it and tap it again (or LOCK IN) to call it. Tap **FLIP** (or the blue button) to mirror it.

## Helmet Cam (optional second view)
See the play through your own man's facemask while the main broadcast view keeps working exactly as before.
It follows the ball carrier on offense and your selected defender on defense. It slides in at the snap and
gets out of the way while you call plays.
- **Toggle**: **V**, the **HELMET CAM** button (top left; in the control panel on a phone held upright), gamepad
  **Y**, the pause menu or Options. It's off by default and remembered on that device (`tbf.helmet`). Options
  also has *ON · NO SHAKE*, which turns off the tackle camera shake. Shake is off by default if the system asks
  for reduced motion.
- **Layout**: on wide screens, Mac and phone landscape, the broadcast view is on the left and the helmet view on
  the right. On a phone held upright the helmet view sits on top and the field below. A yellow cone on the
  broadcast view shows where you're looking.
- **The view**: a field-level stadium with stands, light towers, yard lines, hashes, numbers, the LOS and
  first-down lines, and goal posts. Players are lit and depth-sorted in team colours and numbers. The camera
  bobs with your stride, drops when you dive or go down, and shakes on hits. A man right in your face goes
  see-through.
- **Intent cues**: each cue comes from the AI's own decision on that frame (`S.it`, recorded in `sim.js`
  without changing the AI), and only for men inside your field of view.
  - Tacklers' pursuit angles are red and orange lines to where they mean to meet you. Their jobs are tagged:
    CONTAIN EDGE, DEEP SAFETY, BLITZ / RUSH, SPY, FILLING, MAN #, ZONE.
  - A flashing red **!** means a tackler is in his real dive window, so juke now.
  - Your blockers show green lines to the man they're taking.
  - Receivers' routes are cyan. You see the full route for your own receivers and only the next cut for theirs.
  - The ball's landing spot is marked.
  - A red edge arrow, *BLIND SIDE / BEHIND YOU · #nn N YD*, warns of a pursuer you can't see, with a soft
    whoosh.
  - The defense's tendency read appears as "D IS KEYING ON …".
- **Online 2P**: each player gets their own helmet cam on their own device; the guest gets the cues in the
  host's snapshots.

## Flip and interceptions
- **Flip** mirrors the whole call: formation, routes, run direction, man assignments and zones. The play cards redraw
  mirrored so you can see it. The CPU flips about 40% of its non-kicking calls. Online, the flip is part of the
  secret call: it is sent with the play only after both sides lock, and the field only shows it at the snap.
- **Picks**: the second press is graded against the moment the ball arrives. PERFECT is within ±0.12 s; odds fade to
  nothing at 0.32 s early or 0.22 s late, and with distance from the catch (full within 1.5 yd, none past 3.2 yd).
  A perfect, close lunge intercepts 85% / 78% / 70% of the time vs Rookie / Pro / All-Pro QBs (78% vs a human).
  A miss that was still decent usually breaks the pass up. Pressing more than 0.6 s early does nothing but confirm
  your man, an early lunge costs a 0.25–0.85 s stumble, and you get one lunge per pass, so mashing doesn't work.
  CPU defenders play the ball with timing error of 0.24 / 0.16 / 0.10 s by level.
- Online, the host decides; the guest's press carries the time-to-arrival it saw on its own screen (checked
  against the link lag), so guest timing feels the same as local.

## Run defense
Running the ball is no longer a free touchdown. Defenders now play the angle the way real ones do:
- **Pursuit angles**: each defender aims at the point where he can meet the carrier, not where the carrier is now. If
  nobody can catch the runner, the closest one cuts him off at the goal line. Rookie defenders take sloppier angles.
- **Containment and a deep safety**: on every run, one defender keeps outside leverage on the side the carrier is
  heading, and the safety stays over the top. Sweeps get turned back inside and long runs get caught from behind.
- **Gang tackles**: the CPU dives from 1–2 yd. Every extra tackler makes mashing out of a wrap harder, and so does
  being tired. Escape odds also depend on how you spin and on a bit of luck.
- **Carrier fatigue and cuts**: a runner reaches top speed more slowly and fades after about 3 s with the ball. Hard
  cuts are only quick during a juke.
- **The juke is a timed move**, not a free speed boost. Press it as a defender closes from about 1.3–2.2 yd and he may
  bite ("FAKED HIM OUT!"). Juking in open space just tires you out. Rookie defenders bite most often and All-Pro
  defenders least.
- **The defense learns**: the CPU keys on your runs, outside runs and QB scrambles. It calls more stuff, man and spy
  defenses, cheats a safety down, and tells you when it is keying. Mixing in passes keeps it honest.
- The same rules apply to both teams and to both humans in two-player games.

## Modes
- **Play vs Computer**: Rookie, Pro or All-Pro, with 1:30, 2:30 or 4:00 halves (Options).
- **Two-Player Game (Online)**: shows "Call your buddy…" and a backup room code, then waits.
- **Join Two-Player Game in Progress**: finds the waiting host automatically with no code. If nobody is
  waiting, it offers Retry or Enter Code Instead.

Online play is host-authoritative over PeerJS/WebRTC (namespace `behram-tbf-v1-`). Play calls are secret
at the network level: the guest sends only "locked" (with no play) until the host has also locked and
asks for it. The guest never receives the host's call (or whether it is flipped) until the snap.

## Files
`js/plays.js` playbook · `js/sim.js` rules, AI, physics · `js/trackball.js` trackball model ·
`js/render.js` stadium and players · `js/helmet.js` the helmet cam · `js/ui.js` HUD and menus · `js/audio.js` synthesized sound ·
`js/net.js` matchmaking · `js/main.js` screens and input.

## Tests
From the repo root, with `python3 -m http.server 8080` running and `playwright-core` installed:
```
node games/trackball-football/tests/game.test.js   # feel, CPU rules checker, flip, picks, iPhone touch, other games
node games/trackball-football/tests/mp.test.js     # online flow + play-call and flip secrecy (fake PeerJS transport)
node games/trackball-football/tests/run-defense.test.js # pure Node, no server: run-exploit bots must stay under TD-rate caps
node games/trackball-football/tests/helmet-cam.test.js # cues == AI state, "!" == real dive window, balance; toggle/persist/render (NOBROWSER=1: Node part only)
```
