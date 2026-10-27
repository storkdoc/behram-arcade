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

## Spawn-kill fix (Oct 2026)
Problem: after a kill the victim recovered in place (0.7 s flicker), so the killer could re-kill it over and over.
- **Respawn** (sim.js `respawn`/`pickSpawn`): at the end of the 1.1 s hit spin the victim is moved to a safe spot. Candidates are
  every open cell where the hull fits (cached per `tilesVer`). It skips cells within 7 tiles of the killer (3.5 in a second, loose pass),
  near moving-wall rails, mines, portals, the hill, live shells and power-ups. Score = path (BFS) distance from the killer
  + 12 if the killer has no line of sight + straight distance + openness − distance from own home + small randomness.
  If nothing fits it falls back to the home spawn. It faces the longest open ray, leaning away from the killer.
- **Spawn shield**: `tk.prot = SPAWN_PROT` (2 s). Shells deflect off it (`deflect` event), seekers ignore it, mines don't
  trigger, and it can't take the hill. Firing drops it at once. The last 0.5 s blinks.
- **Ceasefire**: `g.cease = 0.75 s` from every kill. Nobody can fire (mega specials are blocked too).
- **Killer nudge**: if the killer is more than 1.5 tiles from home, it gets a knockback-style push of up to 3 tiles toward home (`nudge` event).
- **CPU** (ai.js): holds fire while the target's shield is up or the ceasefire is on. While the target is shielded it regroups
  toward its own side instead of chasing the spawn, and does no strafing at it.
- **Online**: the host simulates all of it. Snapshots carry `pr` (prot) per tank and `cs` (cease). In invisible and night variants,
  the host's own respawn and nudge events reach the guest with their coordinates stripped. Guest interpolation of the host
  tank snaps on jumps of more than 2 tiles.
- **Render/audio**: team-tinted icosahedron-lattice bubble, plus warp-out and warp-in rings and sparks. Warp-in is hidden from the opponent
  in invisible and night variants. `AU.spawn` chime arpeggio. Toast "RESPAWNED — SHIELD UP 2s (FIRING DROPS IT)".
- `cfg.legacySpawn` restores the old behaviour (tests only, to show the chain).
- Tests: `tests/respawn.test.js` covers the camper aimbot in all 26 variants (old vs new), the mechanics, and ACE-vs-ACE and ACE-vs-idle checks.
  mp.test.js covers online respawn sync and the invisible no-leak check. page.test.mjs runs a 4-kill chain in Chromium and WebKit, desktop and iPhone.
