# DR. BEHRAM'S OFFICE — cabinet notes
(If resumed: read this file, office/NOTES.md, feud/NOTES.md and `git log -- games/dr-behrams-office`.)

One arcade cabinet, one lock, four games, set in Dr. Steven Behram's practice (Congressional OB GYN, Fallsgrove Plaza, Rockville MD).

| folder | game |
|---|---|
| `index.html` + `hub/` | Front desk + clinic-hallway menu (canvas perspective hallway: periwinkle exam-room wall on the right, silver-grey wallpaper opposite, plank floor, drop ceiling, orchid/calla niches, red EXIT, curved white reception desk on a white 3D tile wall, the circus mural). Unlock + instructor panel. |
| `office/` | CLINIC DAY (was games/congressional-obgyn). Owns the shared lock `office/js/access.js` (`COBAccess`). |
| `feud/` | FEUD & DELIVERY (was games/feud-and-delivery). |
| `surgery/` | SUTURE SELF! |
| `triage/` | OB TRIAGE (new): L&D fetal-strip reading + management. See `triage/NOTES.md`. Hub room 4, hallway door "L&D" (was EXAM 4). |

## Lock
- Same `office/js/access.js` and the same localStorage key `cob.access` as before, so old student codes and instructor tokens keep working.
- The instructor PIN is ONLY a salted hash in access.js. Never write the PIN anywhere. Tests use `COB_PIN` from the env, else
  `office/tests/testpin.js` patches a throwaway test PIN into the browser copy of access.js.
- Old URLs: `games/congressional-obgyn/` -> `../dr-behrams-office/#office`, `games/feud-and-delivery/` -> `#feud` (meta refresh + location.replace).
  The hub reads the hash, preselects that room and says it moved.

## SUTURE SELF! (surgery/)
- Files: `js/cases.js` (content: tools, surprises, 7 cases in 3 chapters, every step has an op-note sentence + pearl),
  `js/audio.js` (synth OR sounds, monitor beeps, radio stations, newborn cry, speech voices), `js/tex.js` (procedural textures, portraits, tool icons),
  `js/render.js` (draped open field in layers, uterus/fetus/adnexa, blood pools, laparoscopic fisheye view with fog/smoke),
  `js/mini.js` (minigames), `js/main.js` (flow, team, vitals, radio, scoring, operative note, history).
- Flow: case select -> pre-op (H&P, indication, consent, assistant name, Attending toggle) -> time-out -> per step:
  "what's next?" order quiz -> Mayo-stand instrument pick -> minigame/quiz -> (random complication with timed decision) -> op note.
- Team: Dr. Behram (attending), Dr. Ana Stasia (anesthesia), Ray Tractor CST (scrub, sassy on wrong instruments), Connie Count RN (circulator:
  time-out, count, NICU), Dr. Neo Nate (peds/NICU on cesareans). Radio ducks in a crisis ("Can we turn that down?") and resumes.
- Op note: header (pre/post-op dx, procedure, surgeon/assistant, anesthesia, findings incl. surprises, EBL, fluids/urine, specimens,
  complications, counts, disposition), annotated description (✔ ok / ▲ suboptimal / ✘ wrong + "Should have" + why), pearls, grade.
  Print/Save PDF = window.print with print CSS (paper only). History: localStorage `sts.v1`.hist (30 notes), from the case menu.
- Vitals (2026-10-31): physiology in `surgery/js/vitals.js` (SVITALS, pure, node-testable), driven by main.js. Runs at TS=6
  physiologic s per real s (frame dt ≤ 0.05 s). Baselines: term pregnant/spinal SBP 112–124, DBP 66–76, HR 84–96; GYN/GA
  114–128/70–80, HR 68–82 (abruption 136/86, HR 102). Smoothed OU noise (SBP sd ~3, HR ~2.5). Hemorrhage = ATLS classes on
  (EBL − blood − crystalloid/3) / EBV (100 mL/kg pregnant, 70 non-pregnant), lag ~50 s up / 90 s down; pregnant SBP holds
  ~4% EBV longer. Spinal dips 15–22% over ~2–4 min, phenylephrine (auto, or after the spinalHypo answer) fixes it in ~1–2 min,
  HR −5. Effects (`G.vitalsHit(delta, {on, hold, off})`): GA incision pain, insufflation/Trendelenburg (+ 30% vagal dip),
  surprise events (held until answered). Vitals surprises warp time ×4 until the event shows, then dialogue/stems fill
  {bp} {hr} {spo2} {etco2} {ebl} with the live numbers (`G.fill`). Monitor shows MAP. Test: `node surgery/tests/vitals.test.js`.
- Test hook: `SG.limitScale` shrinks minigame time limits (tests only).
- Tests: `node surgery/tests/cases.test.js` (content lint), `surgery/tests/page.test.js` (bot plays cases; ALL=1 for all 7, ~25 min),
  `tests/hub.test.js` (gate, codes, instructor, all 3 games on desktop/iPhone/iPad, redirects, games.js).
- MCQ answer-length lint (Clinic Day + SUTURE SELF!): `node tests/answer-length.test.js` (correct option not a length tell;
  see office/NOTES.md Day 4). Stats: `node tests/mcq.js`.
- Mood sticker: slug is `dr-behrams-office` from the path; do NOT call MoodSticker.game() (it would change the corner/slug).

## Rules
- Reference photos of the real hallway were used for colour/layout only; they are not in the repo. No student faces anywhere.
- No "Family Feud" or "Operation" trademarks in names or UI.
