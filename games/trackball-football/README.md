# Trackball Football

A modern homage to Atari's 1978 trackball coin-op *Atari Football*: 7-on-7, side-view broadcast camera,
and a heavy virtual trackball. Stroke it faster and your man runs faster; let go and it keeps rolling
until friction stops it.

## Controls

**Mac (mouse or trackpad)**
- Click the field to grab the trackball (Pointer Lock), then roll the mouse or trackpad. **Esc** lets go.
- A two-finger trackpad swipe also spins the ball without grabbing anything (natural or inverted, in Options).
- **Click / Space**: lock in a play, hike, throw, juke (and mash it to fight out of a tackle), dive-tackle on defense.
- **Shift / X / right-click**: pick the next receiver before you throw, or switch to the next defender.
- Arrows / WASD roll the ball too. A gamepad works. **P** pauses, **M** mutes.

**iPhone / iPad (portrait or landscape)**
- Swipe or flick the trackball drawn on screen. A faster flick spins it harder, it coasts after your finger
  lifts, and a resting finger brakes it.
- Red button: lock in / hike / throw / juke / dive. Blue button: next receiver / next defender.
- Tap a play card to pick it and tap it again (or LOCK IN) to call it.

## Modes
- **Play vs Computer**: Rookie, Pro or All-Pro, with 1:30, 2:30 or 4:00 halves (Options).
- **Two-Player Game (Online)**: shows "Call your buddy…" and a backup room code, then waits.
- **Join Two-Player Game in Progress**: finds the waiting host automatically with no code. If nobody is
  waiting, it offers Retry or Enter Code Instead.

Online play is host-authoritative over PeerJS/WebRTC (namespace `behram-tbf-v1-`). Play calls are secret
at the network level: the guest sends only "locked" (with no play) until the host has also locked and
asks for it. The guest never receives the host's call until the snap.

## Files
`js/plays.js` playbook · `js/sim.js` rules, AI, physics · `js/trackball.js` trackball model ·
`js/render.js` stadium and players · `js/ui.js` HUD and menus · `js/audio.js` synthesized sound ·
`js/net.js` matchmaking · `js/main.js` screens and input.

## Tests
From the repo root, with `python3 -m http.server 8080` running and `playwright-core` installed:
```
node games/trackball-football/tests/game.test.js   # feel, CPU rules checker, iPhone touch, other games
node games/trackball-football/tests/mp.test.js     # online flow + play-call secrecy (fake PeerJS transport)
```
