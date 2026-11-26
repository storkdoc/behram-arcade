# LIVING CHESS — worker notes
(If resumed: check `git log -- games/living-chess` and this file first.)

## Brief summary (from parent + user follow-ups)
- Real chess, Stockfish 19 lite single-thread WASM (GPL-3, vendor/stockfish/Copying.txt) + JS fallback engine
- Every piece is a character named only by type (King, Queen, Rook, Bishop, Knight, Pawn); temperament is subtle
- Emotion from LOOKAHEAD: MultiPV lines evaluated from each piece's perspective (dies on move N, mates, wins queen, promotes, sacrifice)
- Dialogue cites concrete foreseen moves/squares; honest counsel vs raw emotions toggle; selfish/cowardly pieces tagged
- Articulated arms/hands: point at threats/targets, cower, beckon, head-shake at bad hovered move, cover eyes, fists, cheer, salute
- Live reaction to previewed moves + ghost path of the foreseen line
- Speech (speechSynthesis) ON by default after first gesture, per-type voices, emotion pitch/rate, mouth sync, queue+interrupt, captions, own volume slider + mute
- Online 2P via PeerJS namespace behram-lc-v1-, host-authoritative, each side computes only its own pieces' thoughts locally

## Status
- [x] js/chess.js rules + perft tests (tests/rules.test.js) PASS
- [x] js/engine.js + jsengine.js / jsengine-worker.js (Stockfish WASM in a Worker, JS fallback; 5 levels SQUIRE..GRANDMASTER)
- [x] js/mind.js per-piece lookahead thoughts, Memory, preview() army reactions (tests/mind.test.js PASS)
- [x] js/render.js three.js r169 scene, composer (bloom, FOCUS blur, FXAA), quality tiers 0-3 with self-check, iOS maxTier 1
- [x] js/chars.js + faces.js articulated characters (faces, lip sync, arms/gestures)
- [x] js/voice.js speechSynthesis per type, captions, iOS unlock; js/audio.js synthesized SFX/music + sliders
- [x] js/net.js PeerJS host-authoritative (UCI only over the wire; thoughts never leave the device), 30s heartbeat
- [x] js/main.js screens, input (mouse/touch/keys/gamepad), counsel, cinematics, clocks, undo, net queue (G.netQ)
- [x] tools/thumb.mjs -> thumb.png (960x600, real game render)
- [x] games.js entry (top)

## Tests (server: `python3 -m http.server 8080` from repo root; NODE_PATH=/workspace/tools/node_modules)
- `node games/living-chess/tests/rules.test.js` and `mind.test.js` (pure node)
- `node games/living-chess/tests/page.test.js chromium|webkit desktop|iphone [full]` — boot, menu, 16 typed thoughts, hover/tap dialog + voice,
  voice cast, King counsel, preview reactions + ghost, move/AI reply/undo, Queen terror FEN, promotion picker, mate-in-1 + Rook dream,
  checkmate panel, (full) a whole game vs SQUIRE to mate, pixel self-check, no console errors
- `node games/living-chess/tests/mp.test.js` — 2 pages over a fake PeerJS broker: host text, backup code, mid-game join as Black,
  orientation, privacy (no thought fields in any message), sync both ways, illegal move rejected, resign, rematch swap, disconnect -> AI

## On-board emotion clips (js/cine-detect.js + js/clips.js, assets in clips/)
- User asked for "little tiny videos" like his example (a porcelain bishop sobbing and melting), with variants per square colour,
  pieces that look like ours, playing ON the board. Replaced the live-3D cutaway (old js/cine.js) with AI-generated clips.
- Pipeline (tools/clips/): ref.js renders a still of each of our pieces (6 types x 2 sides) on our light and dark tile, green
  surround, fixed camera (distance 3.9 to a point 0.62 above the square, fov 36, 720x720, ?q=1 so no bloom). Each still is the
  first frame of an image-to-video generation (3 s, 1:1, prompts in jobs.py). convert.py keys the green, spill-suppresses, crops
  the same 0.78-width square from every clip and packs 15 fps x 224 px frames into a WebP atlas (~100-250 KB). build.py writes
  clips/manifest.js. Generated mp4s live outside the repo (/workspace/chess-clips-assets/raw).
- Playback (clips.js, same API as the old director): a camera-facing quad 1.98 squares wide centred 0.62 above the square,
  frame = atlas offset/repeat, feathered alphaMap, depthTest off. The 3D piece hides once the clip has faded in and returns after,
  except deaths. No <video> (Tesla in Drive pauses video). Atlases load lazily; a clip that cannot load in 2.5 s is dropped.
- Captures: render.js captureSeq asks the hook for a demise clip of the victim (random among its variants, never the same twice in
  a row); if one played, the victim is gone and the capturer steps in; else the old knock-back + shatter. Then cine-detect's
  capture TRIUMPH gets +30 priority so the capturer celebrates on its destination square after nearly every capture.
- Deaths: melt, shatter, dust, burn, topple, sand, lightning, freeze, sink (varied across types, 1-2 per piece/side/square).
  Celebrations: fist pump, dance, gloat, glow, confetti, flex. Fear/sorrow/rage/hope/relief/dismay play where clips exist
  (clipList / CLIP_FOR fallbacks: sorrow->fear, dismay->fear, hope/relief->triumph); missing ones simply do not play.
- Setting chip EMOTION CLIPS: FULL / SHORT (1.5x speed, no voice line) / OFF (saved in lc-settings.cine; ?cine= overrides;
  ?fast=1 => off). Throttle as before (min priority 45, cooldowns, 7/11 s gap). Any tap, key or pad button skips.
- Test: `node tests/clips.test.js desktop|iphone` (manifest, sizes, variety, forced clips on square, hide/restore, skip,
  real capture -> demise then triumph, Off -> shatter, no <video>, no console errors).

## Known weaknesses
- Voice quality depends on the OS speechSynthesis voices (some Androids/Linux have one robotic voice).
- Tested only with SwiftShader (Chromium) and Playwright WebKit at iPhone size; no physical iPhone run.
- JS fallback engine is weak (used only if WASM fails); on phones analysis depth is shallower, so thoughts are less far-sighted.
- Picking uses the visible meshes: a piece fully hidden behind a taller one needs a tap on its square or a different angle.
- Online relies on the public PeerJS broker; strict NATs may fail to connect (no TURN server).
- Emotion clips: the clip is a flat billboard drawn over the board (depthTest off), generated from a camera at about 35 deg
  elevation, so at the default ~46 deg view the clip's own tile shows as a slightly lighter, slightly offset square; pieces in
  front can be drawn over. AI generation drifts at times (knights lose their snout when celebrating, a mitre gains a cross,
  glow/lightning flashes tint the keyed edge). Not tested in a car or on a physical iPhone.
