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

## iPhone hardening (2026-10-25, after a user report that it was "not working on iPhone correctly")
- Portrait phone view was drowned in fog: the camera sits farther back in portrait (about 97 units vs about 40) but the fog range was fixed. Fog now scales with camera distance
- Safe areas (notch, home indicator) are measured and fed into the camera insets. The HUD names wrap in portrait. Menus use dvh. The arcade link is hidden on panel screens
- Touch: document touchmove is prevented (except in scrollable menu lists), gesturestart (pinch) and dblclick are blocked, and fast double-taps on the controls don't zoom. touch-action: manipulation on buttons, pan-y on lists. No callout or selection
- Audio: unlock retries on touchend/click/pointerup until the context is 'running'. navigator.audioSession.type='playback' (iOS 17+) lets sound play with the silent switch on. Audio suspends and resumes on visibilitychange, and a local game pauses when the tab is hidden
- Quality: phones and tablets start at tier 2 with a 2.2 MP (phone) or 3.2 MP (tablet) pixel budget and 1536 shadows. With no half-float colour buffer, post-processing is disabled (maxTier 1)
- Robustness: a visible #fatal banner (with RELOAD) appears for startup errors, scripts that fail to load (25 s), WebGL failure, repeated loop errors, or a black render even at tier 0. Context loss is handled (reloads offline; toast online). Gamepad polling is wrapped in try/catch
- Not done: a Canvas2D fallback renderer (three r169 needs WebGL2, which iOS 15+ has)

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
