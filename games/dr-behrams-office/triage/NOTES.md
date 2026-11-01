# OB TRIAGE — notes (games/dr-behrams-office/triage/)
Room 4 of Dr. Behram's Office. Shared lock: `../office/js/access.js` (`cob.access`), same checkAccess as surgery. Never write the PIN.

## Files
- `js/ctg.js` (`CTG`, UMD, node-testable): 4 Hz seeded (mulberry32) fetal-heart/uterine simulator. Params in `sim.p`
  (baseline, var amplitude, reserve 0..1 clamped to rMin..rMax, upi → lates, head → earlies, cord → variables, oxy/miso → contraction rate,
  drop → prolonged decel, sine → sinusoidal, mag, temp...). Ground truth is logged (ucs, decels, accels, drops); `sim.truth(t,win,vwin)` gives the
  NICHD answer key; `CTG.analyze(fhr,uc)` is an independent analyzer from samples only (used by tests to check the drawn strip matches the key).
  Early vs late vs variable: least-squares shape fit (gradual bell vs abrupt piecewise) + nadir lag vs contraction peak.
- `js/cases.js` (`OBC`): 14 cases (ch 1–5), TEAM (fictional nurse Paige Toco RN, anesthesia Dr. Ana Stasia, peds Dr. Neo Nate). Each case is
  pt + vignette (present, nurse line, Dr. B line), sim params `p`, optional `hist` events (set/ramp at t ≤ C.HIST = 1800 s, so the strip on
  screen already shows the problem), ONE management question `choice: {q, hint, opts:[{t, g, why}]}` with 4–6 options, best authored first
  (shown shuffled; grades best | ok | meh | wrong | harm; the best is never the longest text), debrief summary + pearls + refs, EXPECT
  (answer key per case: what the strip shows at the decision time).
- `js/audio.js` (`OBA`): Web Audio Doppler whoosh per beat, alarms, UI sounds.
- `js/main.js` (`OBT`): owner request 2026-11-01: "the strip spans the entire upper half; the bottom half is the case and actions; one choice per
  patient; it's really about reading the strip". Flow: case → the strip quick-draws (2.4 s, Space/tap skips) and keeps running live → one pick
  (digit key, click, tap, gamepad A) commits → debrief (your call + why, Dr. Behram's read table, annotated 20-min strip with a pink "your call"
  line, every option with its grade and why, summary, pearls, refs, print/PDF). No marks, no questionnaire, no action menu.
  Keys: 1–6 pick, arrows move focus, Space/Enter press, H or ? hint, [ ] or drag scroll strip, L live, M mute, Esc/P pause.
  Gamepad: A press, B back, X/Y hint, LB/RB scroll. History replays the sim from the seed to the decision time.
  Shift mode: triage 3 monitors by severity, then one call each, shift report at the end.
- Scoring: best 100 (A, 3★); best after the hint 90 (A−, 2★); ok 70 (C); meh 40; wrong 20; harm 0.
  2★ unlocks Attending mode for that case (no Dr. B line, no hint). Instructor token opens all Attending modes.
- localStorage `obt.v1` {best, att, hist (30), set}.

## Tests (serve the repo root, e.g. `python3 -m http.server 8090`)
- `node triage/tests/ctg.test.js` — simulator/analyzer unit tests.
- `node triage/tests/cases.test.js` — content lint (one question, 4–6 options, one best, best not longest) + EXPECT vs truth/analyzer over seeds, no trademarks, no PIN.
- `NODE_PATH=/workspace/tools/node_modules node triage/tests/page.test.js [base]` — desktop/iPhone/iPad, lock, plays all 14 cases on desktop by keys (best + some wrong after hint), taps on iPhone/iPad, history, pause, shift, Attending. SHOTS=<dir>.
