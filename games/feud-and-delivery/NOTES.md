# Feud & Delivery: notes

A game-show teaching game. Each round's "top answers" are the differential diagnoses for an OB/GYN presentation.
Dr. Behram hosts as a caricature. The game is an original design and uses no Family Feud name, logo or assets.
Live at `/games/feud-and-delivery/`.

## Access lock (shared with Congressional OB GYN)
- **Shared script:** the gate loads the office game's own lock script, `../congressional-obgyn/js/access.js` (`COBAccess`).
  - Nothing is copied. There is no PIN hash in this folder, and `tests/access.test.js` checks this.
- **Shared storage:** both games use the same localStorage key, `cob.access`.
  - A student code unlocks both games on that device.
- **Student codes:** `CONG-XXXX-XXXX` codes are valid for 42 days.
- **Instructor access:** open it with the INSTRUCTOR button or the **I** key, then enter the PIN on the PIN pad.
  - The PIN is checked against the salted SHA-256 hash in the shared script.
  - This issues a new code that works in both games.
  - The **H** host panel is not PIN-gated. It is meant for whoever is running the game at the front of the room.
- **No PIN in plain text anywhere:** not in code, tests, notes or commits.
  - Tests use `games/congressional-obgyn/tests/testpin.js`. It uses the `COB_PIN` env var if set. Otherwise it swaps in a throwaway test PIN by patching the access script inside the test browser only.

## Files
- **`js/rounds.js`:** 47 rounds (21 OB, 26 GYN); Fast Money draws its 5 presentations from the same bank.
  - Each round has 4–6 answers whose points sum to about 100, with synonyms, a teaching pearl, a `basis`, `ties` and joke answers.
- **`js/engine.js`:** pure logic (UMD).
  - Fuzzy matching (synonyms, abbreviations, Levenshtein), face-off and steal rules, multipliers (x1, x1, x2, x3), Fast Money scoring and the Night Float rival.
- **`js/game.js`:** stage, board, face-off, play/pass, strikes, steal, sudden death, Fast Money, host panel and pearls.
- **`js/main.js`:** boot, gate, title (1P/2P), input (keyboard, mouse, touch, gamepads) and screens.
- **`js/banter.js`:** host lines, drawn from shuffled decks so lines don't repeat back to back.
- **`js/audio.js`:** original WebAudio synthesis (buzzers, dings, strike, sad trombone, drumroll, theme stings) with no samples.
  - Every sound is wrapped so a WebAudio error can never stall the game.
- **`assets/`:** the host caricature (happy, shock, wince and cheer) and a fictional confused-patient cameo.
  - Generated art in the office game's clinic style. No student faces.
- **`tools/thumb.mjs`:** re-renders `thumb.png` (960x600) from the live title screen.

## Rules as built
- **Board rounds:** 4 rounds at x1, x1, x2 and x3.
  - **Face-off:** the higher-ranked answer wins control. The controlling side chooses play or pass.
  - **Play:** 3 strikes and the other side gets one steal for the whole bank.
  - A repeated answer is waved off with no strike.
- **Ties after round 4:** a single-answer sudden-death face-off.
- **Fast Money:** the winner plays. Seat 1 gets 20 s and seat 2 gets 25 s for the same 5 presentations.
  - Seat 2 must not repeat seat 1's answers.
  - Reaching 200 points wins. TAB passes and returns to the condition later.
- **1 player:** you against the simulated **Night Float** team.
  - It buzzes with a human-like delay, answers from a skill model (it usually names likely answers and sometimes misses), takes control, and steals.
- **Joke answers** (e.g. "Dr. Google said so") always score 0 with a NOPE, a sad trombone and a host reaction.
  - They are never real ranked answers. The occasional **BONUS JOKE TILE** is clearly labelled and worth 0.
- **Host override (H, the HOST button, or gamepad Start):** accept an answer as any slot, add a strike, peek at or reveal slots, reveal all and end the round, or quit.

## Tests
Serve the repo root (for example, `python3 -m http.server 8098`), then run:
```
node games/feud-and-delivery/tests/engine.test.js        # 14 engine tests
node games/feud-and-delivery/tests/access.test.js        # shared lock, code expiry, no PIN material here
NODE_PATH=/workspace/tools/node_modules node games/feud-and-delivery/tests/page.test.js http://localhost:8098 /tmp/shots
```
The page test (Playwright and Chrome) covers:
- Desktop 1440x900: the gate, invalid and expired codes, the instructor flow, an office code unlocking this game, a full 2P round with dupe, gag, slow-mo third strike and steal, rounds 2–4, a match win, Fast Money and results.
- iPhone portrait: a full 1P round against Night Float by touch, and Fast Money.
- iPhone landscape and iPad: layouts.
- Every viewport: checks for console errors and horizontal overflow.

## Caveats
- Point values are approximate relative likelihoods for teaching, written from ACOG, CDC, ASRM and standard texts. They are not survey data, and every round says so.
- The office game's iOS double-tap zoom guard can swallow a fast second tap. This game has a fixed copy (it re-clicks the target), but the office game was left untouched.
