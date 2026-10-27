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
