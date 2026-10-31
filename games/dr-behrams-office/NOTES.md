# DR. BEHRAM'S OFFICE — cabinet notes
(If resumed: read this file, office/NOTES.md, feud/NOTES.md and `git log -- games/dr-behrams-office`.)

One arcade cabinet, one lock, three games, set in Dr. Steven Behram's practice (Congressional OB GYN, Fallsgrove Plaza, Rockville MD).

| folder | game |
|---|---|
| `index.html` + `hub/` | Front desk + clinic-hallway menu (canvas perspective hallway: periwinkle exam-room wall on the right, silver-grey wallpaper opposite, plank floor, drop ceiling, orchid/calla niches, red EXIT, curved white reception desk on a white 3D tile wall, the circus mural). Unlock + instructor panel. |
| `office/` | CLINIC DAY (was games/congressional-obgyn). Owns the shared lock `office/js/access.js` (`COBAccess`). |
| `feud/` | FEUD & DELIVERY (was games/feud-and-delivery). |
| `surgery/` | SUTURE SELF! (new) |

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
- Test hook: `SG.limitScale` shrinks minigame time limits (tests only).
- Tests: `node surgery/tests/cases.test.js` (content lint), `surgery/tests/page.test.js` (bot plays cases; ALL=1 for all 7, ~25 min),
  `tests/hub.test.js` (gate, codes, instructor, all 3 games on desktop/iPhone/iPad, redirects, games.js).
- Mood sticker: slug is `dr-behrams-office` from the path; do NOT call MoodSticker.game() (it would change the corner/slug).

## Rules
- Reference photos of the real hallway were used for colour/layout only; they are not in the repo. No student faces anywhere.
- No "Family Feud" or "Operation" trademarks in names or UI.
