# SKY SHIELD — working notes

Status: IN PROGRESS (agent build, 2026-10-26)

Done
- js/sim.js — deterministic seeded game rules (waves, MIRV, bombers/satellites, smart bombs, chains, tally, bonus city, EMP, THE END, versus attack queue)
- js/auto.js — autopilot gunner (attract demo + tests)
- js/net.js — PeerJS slot matchmaking (namespace behram-ss-v1-), from tank-duel
- js/render.js — three.js renderer, 8-bit bloom chain (no MSAA / no float RTs), tiers 0-3, self-check
- tools/rtest.html — renderer dev harness (auto-play)

Remaining
- js/audio.js, js/main.js (UI, input: trackball/direct/keys/gamepad/touch, versus), index.html, css
- tests: sim.test.js, mp.test.js, page.test.mjs; tools/thumb.mjs + thumb.png; games.js entry
