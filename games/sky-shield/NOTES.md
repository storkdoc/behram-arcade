# SKY SHIELD — status notes

## Status (2026-10-26)
- DONE: sim.js (deterministic seeded logic), auto.js (autopilot/attract), net.js (PeerJS, ns behram-ss-v1), render.js (three.js + custom bloom post, tiers, selfCheck), audio.js (WebAudio synth), index.html/style.css, main.js (menus, input, loop, HUD, tally, high scores, initials, pause, versus).
- Game playable in Chromium + WebKit, desktop / iPhone portrait / landscape / iPad.

## Remaining
- tests/sim.test.js, tests/mp.test.js (fakepeer + broker), tests/page.test.mjs
- thumb.png (960x600) + games.js entry
- tools/rtest.html is a dev harness (render-only), safe to keep.

## Dev
- serve repo root: python3 -m http.server 8080 → /games/sky-shield/
- URL params: ?q=0..3 lock quality tier, ?msaa=1, ?touch=1/0
- window.SS exposes app, g, R, newGame, fireBase, fireEmp for tests.
