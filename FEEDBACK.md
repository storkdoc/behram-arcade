# Player feedback — the MoodSticker

Every page of the arcade (home page + all 21 games) loads one shared script,
[`assets/js/mood-sticker.js`](assets/js/mood-sticker.js). It draws a small animated smiley
sticker in a corner of the screen. The sticker reacts to play:

| signal | reaction |
|---|---|
| `MoodSticker.event('big')` / a combo, bonus, level-clear message / a burst of fast input | perks up (hop + sparkles) |
| `MoodSticker.event('win')` / "YOU WIN", "NEW HIGH SCORE", "LEVEL COMPLETE"… | celebrates (spin, party hat, confetti) |
| `MoodSticker.event('lose')` / "GAME OVER"… | pouts (shake + tear), then recovers |
| `MoodSticker.event('stall')` / no input for ~22 s | droops (sweat drop) |
| no input for ~75 s | dozes off (Zzz) |
| `MoodSticker.event('hit')` | quick wince |

The eyes follow the pointer, and the sticker blinks. With `prefers-reduced-motion` turned on, the
animations are toned down. Generic signals come from text that the game draws on its canvas
(`fillText`) or adds to the DOM, so games with no hooks still get reactions.

**Opening it:** tap or click the sticker, press **`** (backquote), or hold the gamepad
**SELECT/BACK** button. A small card opens with **Fun · Okay · Skip** and an optional
**"Suggest an improvement (optional)"** text box. Picking a face sends the rating, plus the note if
there is one. **Send note** sends the note with no rating. Esc, ✕, or a tap outside the card closes
it without sending. Nothing is required. Inside the card, arrow keys, Tab, 1/2/3 and gamepad
D-pad/A/B all work.

**Not getting in the way:**
- While the card is closed, the sticker never takes Space, Enter, arrow keys or clicks from the
  game. Only the backquote key is reserved.
- While the card is open, keys typed in the box do not reach the game.
- Opening the card sends the page a `blur` event. Games that auto-pause on blur (most of them)
  pause and release held keys. They resume the way they normally do. A game can register its own
  hooks with `MoodSticker.bindPause({ pause, resume })`.
- The sticker can be dragged to any corner, and the corner is remembered per game. By default it
  sits bottom-left on desktop. On phones it sits top-left, under the "← ARCADE" link, so it stays
  clear of joysticks and fire buttons.

**Explicit hooks are wired in:** VORTEX (warp / death / game over / play), Congressional OB GYN
(screens, correct/incorrect answers, encounter results, day summary), APEX GP, Astro Shatter,
Planet Guardian, Sporewood, Star Invaders (screens + end of game), Vector Armor and MELTDOWN
(screens), and CHALICE (screens, gates / slain dragons, bat thefts, being eaten, the win). All other games rely on the generic signals.

## What gets recorded

Each submission is one JSON record. It contains no names, emails or other personal data. Typed
emails and phone numbers are replaced, and the text is capped at 500 characters.

```json
{
  "v": 1, "id": "2a09421b2465f172", "sid": "fcad4f123d0d35a1", "test": false,
  "game": "tube-shooter", "gameTitle": "VORTEX",
  "rating": "fun | okay | skip | null", "text": "More levels please",
  "sessionStart": "2026-10-29T13:22:07.216Z", "durationSec": 186, "activeSec": 170,
  "lastScreen": "gameover", "screens": ["play", "warp", "gameover"],
  "ts": "2026-10-29T13:25:13.618Z",
  "url": "https://storkdoc.github.io/behram-arcade/games/tube-shooter/",
  "viewport": { "w": 390, "h": 664, "dpr": 3 }, "device": "phone | tablet | desktop",
  "input": "touch | mouse | keyboard | gamepad", "mood": "curious",
  "events": { "big": 3, "stall": 1, "win": 0, "lose": 1 }, "lang": "en-US"
}
```

- `sid` is a random id for the browser tab. It is anonymous.
- `lastScreen` comes from `MoodSticker.screen()`. If the game never called it, the value falls back
  to the visible `.screen.show` / `body[data-mode]`, then to recently sniffed text (title, paused,
  game-over), then to the URL hash, then to `document.title`.
- `test: true` is set automatically for automated browsers (`navigator.webdriver`), for `?msTest=1`
  or `?test=1`, and when `localStorage['moodSticker.test'] = '1'`.

## Where the data lives

The site is static, so there is no server of our own. Each record goes to three places:

1. **localStorage** of the player's browser, key `moodSticker.log` (last 150 records). Anything
   that failed to upload is retried on the next page load.
2. **textdb.dev**, the durable store. There is one JSON document per **UTC** day:
   `https://textdb.dev/api/data/behram-arcade-feedback-576d3eaa35c97915ac7d2c64-YYYY-MM-DD`
   (`{"v":1,"items":[…records…]}`). It needs no account and no API key. Data is kept on disk with
   no expiry; the open-source server code has no TTL. Because the store is overwrite-only, the
   client does read → append → write → **verify**, and retries with jitter if another player wrote
   at the same moment.
3. **ntfy.sh**, an append-only mirror (topic `behram-arcade-fb-816a8d80e0b671e8c39b`). It is
   race-free, but ntfy.sh only keeps messages for **12 hours**. The reader copies any record that
   reached ntfy but not textdb back into the textdb day document. That covers a tab closed in the
   middle of a write or a lost race.

Both sinks are keyless. Their names are random so nobody stumbles on them. They are **not
secret**: anyone who reads the page source could read or overwrite them. That is acceptable for
anonymous game ratings. Don't put anything sensitive there.

## Reading it (daily routine)

From the repo root (Node 18+, no dependencies, no login):

```bash
node tools/read-feedback.mjs                          # yesterday (America/New_York), real players only
node tools/read-feedback.mjs --json                   # same, as JSON for scripts
node tools/read-feedback.mjs --date 2026-10-29        # a specific day
node tools/read-feedback.mjs --today --include-test   # today so far, test records too
node tools/read-feedback.mjs --hours 36 --archive ~/behram-arcade-feedback.jsonl   # + local archive copy
```

Recommended morning command:
`node tools/read-feedback.mjs --json --archive ~/behram-arcade-feedback.jsonl`
The JSONL archive gives you a permanent local copy even if textdb.dev ever goes away.
Use `--no-sync` for a strictly read-only run.

To read without the repo: `curl -s https://textdb.dev/api/data/behram-arcade-feedback-576d3eaa35c97915ac7d2c64-$(date -u +%F)`

## Switching to another backend later

Edit `CONFIG` at the top of `assets/js/mood-sticker.js`, or set `window.MOOD_STICKER_CONFIG = {...}`
before the script loads. If you set `endpoint: 'https://…'`, every record is also POSTed there as
JSON text with no preflight, for example to Formspree, a Google Apps Script web app, or a Supabase
edge function. Setting `textdbKey` / `ntfyUrl` to `null` disables those sinks. If you change them,
keep `tools/read-feedback.mjs` in step: it reads `FEEDBACK_TEXTDB_KEY` / `FEEDBACK_NTFY_TOPIC` too.

## Tests

`tests/mood-sticker.test.js` (Playwright, desktop + iPhone 13) covers:
- opening by click, tap, the ` key and a gamepad
- empty, text, note-only and keyboard-only submits
- typing in the box never reaching VORTEX, and Space still reaching it once the card closes
- reactions, PII scrubbing, no console errors
- two simultaneous writers
- the full round trip through textdb.dev + ntfy.sh, read back by the reader script

```bash
python3 -m http.server 8080 &  NODE_PATH=<dir with playwright-core> node tests/mood-sticker.test.js
```
