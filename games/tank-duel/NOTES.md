# TANK DUEL — worker notes

## Status: playable, published, all tests passing (2026-10-25)
- [x] js/sim.js: fixed 60 Hz rules (26 variations, 11 maps, bounces, guided/seeker shells, invisible tanks, bricks, movers, portals, hill, mines, power-ups, ice, weather)
- [x] js/ai.js: CPU with A* pathing, aim leading, bounce-shot search, dodging, 4 levels (ROOKIE/SERGEANT/VETERAN/ACE), with reaction delay and aim error
- [x] js/net.js: PeerJS slot namespace behram-td-v1-, backup code, LINK ms. Host-authoritative 30 Hz snapshots, guest prediction and replay
- [x] js/render.js: three r169. Bloom/grade/FXAA composer (no MSAA unless ?msaa=1), adaptive tiers, readPixels black self-check, night fog-of-war
- [x] js/audio.js: synthesized WebAudio sfx, engines, weather ambience, iOS unlock
- [x] js/main.js: menus, select grid, keyboard/gamepad/touch, attract mode, online host/guest, join in progress, buddy leaves → CPU takes over
- [x] tests: tests/sim.test.js (node), tests/mp.test.js (stand-in PeerJS), tests/page.test.mjs (chromium|webkit × desktop|iphone|iphone-land|ipad)
- [x] thumb.png (tools/thumb.mjs), games.js entry

## Run tests (from repo root, with `python3 -m http.server 8080` running)
    node games/tank-duel/tests/sim.test.js
    NODE_PATH=/workspace/tools/node_modules node games/tank-duel/tests/mp.test.js
    node games/tank-duel/tests/page.test.mjs webkit iphone

## URL params
?v=N quick-starts game N (1-based) [&l=0..3 CPU level] · ?q=0..3 locks the quality tier · ?msaa=1 opt-in MSAA

## Ideas / known weaknesses
- In night variants your own tank is a little dark outside its headlight cone
- Guest shells are dead-reckoned between snapshots, so a fast guided turn can show a small correction
- Real fps was only measured in swiftshader. Real Mac/iPad hardware should reach tier 3; the adaptive tier steps down if not
