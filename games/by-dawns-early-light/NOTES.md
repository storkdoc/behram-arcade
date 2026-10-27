# BY DAWN'S EARLY LIGHT — worker notes

One-night command-crisis strategy game, 01:00 → dawn (06:00). Inspired only by the premise of the 1990 TV film;
all characters, call signs, blocs, dialogue and story are original. No film assets, names, quotes or branding.

## Fiction (original)
- Player bloc: THE COMMONWEALTH (North America on the globe). Airborne command post call sign LANTERN.
- Rival bloc: THE NORTHERN FEDERATION. Premier Ilse Darova (original). Their post: KESTREL (2P only).
- Rogue launch: a renegade Federation missile brigade fired on a Commonwealth city; automatic retaliation followed.
- Chancellor (Commonwealth head of state) missing after her helicopter went down. Player = Deputy Secretary aboard LANTERN.
- Ground claimant: Defense Minister Garrison Vale at bunker GRANITE (hawk, issues go codes).
- Commonwealth wings: HALBERD TALON COBALT VESPER ORCHID. Subs: SCARAB DEEPWELL. Tanker SHEPHERD.

## Architecture
- js/sim.js  deterministic symmetric sim (UMD; node tests). viewFor(side) hides private info.
- js/render.js three.js scenes: globe (night Earth + dawn terminator), command-post interior w/ CRT CanvasTextures, cockpit terrain.
- js/cockpit.js bomber set-piece minigame logic.  js/audio.js synth audio.  js/net.js PeerJS (ns behram-bdel-v1-).
- js/main.js UI glue, stations, input (kbd/mouse/gamepad/touch), online.

## Progress
- [x] sim + tests (tests/sim.test.js: endings, escalation, recall, succession, privacy, chapters, balance; bot in tests/bot.js)
- [x] render (globe, cabin CRTs, sky/cockpit, Detonation), cinema.js films: coldopen, chapter, command, hotline, bomber, aftercockpit, strike, end_dawn/partial/catastrophe/relieved
- [x] main.js UI: stations, inbox, keyboard/gamepad/touch, pause, AAR, chapters, howto, online (host/join/solo-while-waiting/rematch/link lost)
- [x] tests/game.test.mjs (chromium|webkit; desktop, iphoneP, iphoneL, ipad), tests/mp.test.js (fakepeer), thumb (tools/thumb.mjs + tools/thumb_title.py)
- [x] games.js entry (added 2026-10-26), pushed; strike film = window POV + orbital shot
## Run tests (server: python3 -m http.server 8080 at repo root)
node tests/sim.test.js · node tests/game.test.mjs chromium · node tests/game.test.mjs webkit · NODE_PATH=/workspace/tools/node_modules node tests/mp.test.js (from repo root path)
## Next / known weaknesses
- swiftshader is slow: adapt() drops to tier 0 in tests; dark night content can trip a few readback samples (threshold = render self-check's 15%).
- mp test: join timed out 2 of 5 runs when the box was busy or running page tests in parallel; passes on an idle box. Root cause not confirmed (likely swiftshader slowness).
- polish: more cockpit variety, orbital detonation close-ups in ending films, title globe lighting.
