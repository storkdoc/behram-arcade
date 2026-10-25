# MUSHROOM CLOUD — worker notes

## Status (2026-10-25 ~16:40 ET)
- Playable and PUSHED: sim (js/sim.js), AI (js/ai.js), renderer (js/render.js, three r169 vendored), UI/HUD/input/online glue (js/main.js), net (js/net.js, PeerJS ns behram-mc-v1), audio (js/audio.js), index.html, css/style.css, thumb.png, games.js entry.
- Tests:
  - `node tests/sim.test.js` (headless sim/AI) — ALL PASS
  - `node tests/game.test.mjs <chromium|webkit> <desktop|small|iphone|ipad> [full] [q]` — needs `python3 -m http.server 8080` at repo root.
    PASS: chromium desktop full, webkit desktop full, chromium iphone full, webkit iphone full, webkit desktop q=3 (locked bloom tier).
  - thumb: `node tools/thumb.mjs`
- Fixes this session: bloom threshold (was washing out clouds), deferred tier resize (no cleared frame), loading screen waits for real frames (WebKit first-frame black tiles), mobile select layout (sticky start button), fmtM(0).

## Next steps
1. tests/mp.test.mjs (fakepeer broker, host message text, namespace behram-mc-v1-, guest view contains no hidden host units, LINK ms).
2. Run small (1024x600) + ipad in both engines.
3. Polish: thumb at night with detonations; mobile camera offset so the globe centre is above the bottom panel; INCOMING banner contrast; balance (veteran AI is brutal).
