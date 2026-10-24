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
- Arrows / WASD roll the ball too. A gamepad works (A = action, B = next, LB/RB = flip). **P** pauses, **M** mutes.

**iPhone / iPad (portrait or landscape)**
- Swipe or flick the trackball drawn on screen. A faster flick spins it harder, it coasts after your finger
  lifts, and a resting finger brakes it.
- Red button: lock in / hike / throw / juke / dive; on defense it takes the man closest to the ball, and a second
  tap as a pass arrives lunges for the pick. Blue button: next receiver / next defender.
- Tap a play card to pick it and tap it again (or LOCK IN) to call it. Tap **FLIP** (or the blue button) to mirror it.

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
`js/render.js` stadium and players · `js/ui.js` HUD and menus · `js/audio.js` synthesized sound ·
`js/net.js` matchmaking · `js/main.js` screens and input.

## Tests
From the repo root, with `python3 -m http.server 8080` running and `playwright-core` installed:
```
node games/trackball-football/tests/game.test.js   # feel, CPU rules checker, flip, picks, iPhone touch, other games
node games/trackball-football/tests/mp.test.js     # online flow + play-call and flip secrecy (fake PeerJS transport)
```
