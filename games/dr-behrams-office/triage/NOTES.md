# OB TRIAGE — notes (games/dr-behrams-office/triage/)
Room 4 of Dr. Behram's Office. Shared lock: `../office/js/access.js` (`cob.access`), same checkAccess as surgery. Never write the PIN.

## Files
- `js/ctg.js` (`CTG`, UMD, node-testable): 4 Hz seeded (mulberry32) fetal-heart/uterine simulator. Params in `sim.p`
  (baseline, var amplitude, reserve 0..1 clamped to rMin..rMax, upi → lates, head → earlies, cord → variables, oxy/miso → contraction rate,
  drop → prolonged decel, sine → sinusoidal, mag, temp...). Ground truth is logged (ucs, decels, accels, drops); `sim.truth(t,win,vwin)` gives the
  NICHD answer key; `CTG.analyze(fhr,uc)` is an independent analyzer from samples only (used by tests to check the drawn strip matches the key).
  Early vs late vs variable: least-squares shape fit (gradual bell vs abrupt piecewise) + nadir lag vs contraction peak.
- `js/cases.js` (`OBC`): 14 cases (ch 1–5), TEAM (fictional nurse Paige Toco RN, anesthesia Dr. Ana Stasia, peds Dr. Neo Nate), ACTIONS, grades per
  action (key/good/ok/neutral/meh/bad/harm with deadline `by` seconds and a why), scripted surprises, debrief summary + pearls, EXPECT (answer key per case).
- `js/audio.js` (`OBA`): Web Audio Doppler whoosh per beat, alarms, UI sounds.
- `js/main.js` (`OBT`): screens, live monitor (canvas), analysis (marks + MCQ), bedside actions, rechecks, delivery, scoring, debrief, history (replay
  from seed + action log), random shift mode (triage 3 monitors by severity), input (keys, pointer, touch pads, gamepad), boot.
- Scoring: interpretation 40, management 45 (key actions on time, penalties for meh/bad/harm), fetal outcome 15 (cord pH), −2 per hint.
  2★ unlocks Attending mode (no hints, no feedback until debrief). Instructor token opens all Attending modes.
- localStorage `obt.v1` {best, att, hist (30), set}.

## Tests (serve the repo root, e.g. `python3 -m http.server 8090`)
- `node triage/tests/ctg.test.js` — simulator/analyzer unit tests.
- `node triage/tests/cases.test.js` — content lint + EXPECT vs truth/analyzer over seeds, no trademarks, no PIN.
- `NODE_PATH=/workspace/tools/node_modules node triage/tests/page.test.js [base]` — desktop/iPhone/iPad, lock, bot plays cases. SHOTS=<dir>.
