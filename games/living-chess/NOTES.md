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

## Known weaknesses
- Voice quality depends on the OS speechSynthesis voices (some Androids/Linux have one robotic voice).
- Tested only with SwiftShader (Chromium) and Playwright WebKit at iPhone size; no physical iPhone run.
- JS fallback engine is weak (used only if WASM fails); on phones analysis depth is shallower, so thoughts are less far-sighted.
- Picking uses the visible meshes: a piece fully hidden behind a taller one needs a tap on its square or a different angle.
- Online relies on the public PeerJS broker; strict NATs may fail to connect (no TURN server).
