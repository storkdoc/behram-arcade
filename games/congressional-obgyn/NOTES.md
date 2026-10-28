# CONGRESSIONAL OB GYN — Clinic Day — worker notes
(If resumed: read this file and `git log -- games/congressional-obgyn` first.)

## Brief
Teaching game for Dr. Steven Behram's medical students, set in Congressional OB GYN (Fallsgrove Plaza 14995, Shady Grove Rd, Rockville MD).
Hallway hub with exam rooms -> encounter = vignette + 4-5 board-style MCQs with Dr. Behram coaching; scoring, streaks, levels,
mastery (spaced repetition), daily challenge, badges, local leaderboard. Instructor PIN (salted SHA-256 only) -> random 6-week student codes.

## Workflow (IMPORTANT — shared checkout)
- Develop in the clean worktree **/workspace/cob-wt** (branch cob-dev, created from origin/main). NOT in /workspace/arcade
  (other agents have uncommitted work there; an untracked copy of this folder there would break their `git pull`).
- Commit: `git add games/congressional-obgyn [games.js]` only; then `git pull --rebase origin main && git push origin HEAD:main`.
- Raw photos are NOT committed (students' photo never used anywhere). Only processed headshot: assets/behram.webp (cutout), assets/behram-face.jpg.
- Tooling: NODE_PATH=/workspace/tools/node_modules (playwright-core), chrome /usr/bin/google-chrome.

## Files
- js/bank.js — question bank (26 topics, 54 cases, 257 questions). Correct option is listed FIRST in source; shuffled at runtime.
- js/access.js — PIN hash + HMAC student codes (offline). tests/access.test.js
- js/core.js — scoring / levels / mastery / selection (pure). tests/core.test.js
- js/audio.js — WebAudio synth. js/art1-3.js — SVG art (building, hallway + original circus mural, exam room, patients).
- js/main.js — UI, screens, input (keys/mouse/touch/gamepad), particles.

## Access-code scheme
CONG-XXXX-XXXX, 32-symbol alphabet (no 0/1/I/O). 40 bits = 20-bit masked payload (issue day since 2026-01-01 [14b] + nonce [6b])
+ 20-bit truncated HMAC-SHA256. Valid while 0 <= today - issue <= 41 (America/New_York dates); expires on issue+42.
**Security caveat (honest):** the HMAC key is in client JS (lightly obfuscated) and the PIN hash is of a 4-digit PIN (10,000
possibilities, trivially brute-forced offline). Anyone with dev tools can bypass the gate or mint codes. Classroom honor lock only.

## Content accuracy self-review (done 2026-10-28)
Sources: ACOG PBs/COs, CDC STI Treatment Guidelines 2021, ASCCP 2019 risk-based, USPSTF (cervical, breast 2024, CRC 2021, lung 2021,
folic acid, osteoporosis), CDC US MEC/US SPR 2024, ASRM, NAMS 2022/2023, ABM 2022 mastitis, Endocrine Society FHA, AUA OAB.
Deliberately avoided contested items: RhIG <12 wk change, BV partner treatment (2025 StepUp trial vs CDC), routine 3rd-tri syphilis
(state-dependent), septum resection, Makena (withdrawn). Fixed: pneumococcal distractor (now recommended at 50 since 2024) replaced.

## Gameplay facts
- Clinic day: 6 patients (3 at 8:30 AM, others check in at ~30/75/125 s, or earlier if nobody is waiting), 4 exam rooms, rooms cleaned 7 s after a visit.
  Waiting time counts at full speed in the hallway and ×0.35 during an encounter, and lowers patient hearts after 60 s.
- Daily Challenge: dailyPlan(day) seeded, 5 patients. Practice: one case from Topic Mastery (XP counts; no leaderboard).
- Saves: localStorage cob.v1 (progress), cob.access ({code} or {t: instructor token}), cob.mute, cob.music.
- Debug hook: window.COB.debug (day, enc, save, screen(), title(), summary()), used by tests and tools/thumb.mjs.

## Tests
node tests/access.test.js · node tests/core.test.js · (serve repo root on :8090) NODE_PATH=/workspace/tools/node_modules node tests/page.test.js
page.test: wrong/expired code UI, expired screen on relaunch, wrong PIN, PIN 0232 -> code + another, student code unlocks + rechecked on reload,
full 6-patient keyboard day -> summary/grade/XP/board/badges/mastery, iPhone touch encounters, no console errors. All pass (2026-10-28).
Thumbnail: node tools/thumb.mjs 8090

## Status
- [x] bank (26 topics), access + tests, core + tests, audio, art (building, hallway, room, patients)
- [x] index.html / css / main.js UI; page tests pass desktop + iPhone; thumb.png; games.js entry
- [ ] (ideas) more cases per topic; real-device iOS check by the user
