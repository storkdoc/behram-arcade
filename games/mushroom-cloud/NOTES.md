# MUSHROOM CLOUD — worker notes

## Status (2026-10-25 ~16:40 ET)
- Playable and PUSHED: sim (js/sim.js), AI (js/ai.js), renderer (js/render.js, three r169 vendored), UI/HUD/input/online glue (js/main.js), net (js/net.js, PeerJS ns behram-mc-v1), audio (js/audio.js), index.html, css/style.css, thumb.png, games.js entry.
- Tests:
  - `node tests/sim.test.js` (headless sim/AI) — ALL PASS
  - `node tests/game.test.mjs <chromium|webkit> <desktop|small|iphone|ipad> [full] [q]` — needs `python3 -m http.server 8080` at repo root.
    PASS: chromium desktop full, webkit desktop full, chromium iphone full, webkit iphone full, webkit desktop q=3 (locked bloom tier).
  - thumb: `node tools/thumb.mjs`
- Fixes this session: bloom threshold (was washing out clouds), deferred tier resize (no cleared frame), loading screen waits for real frames (WebKit first-frame black tiles), mobile select layout (sticky start button), fmtM(0).

- Also PASS: chromium/webkit small (1024x600@2x) + ipad; `NODE_PATH=/workspace/tools/node_modules node games/mushroom-cloud/tests/mp.test.js` ALL PASS (16 checks).
- Live verified: https://storkdoc.github.io/behram-arcade/games/mushroom-cloud/ 200, cabinet in carousel (Chromium + WebKit).
- Phone portrait HUD: forces strip moved under the top bar, key hints hidden on touch.

## Next steps
3. Polish: thumb at night with detonations; mobile camera offset so the globe centre is above the bottom panel; INCOMING banner contrast; balance (veteran AI is brutal).
