# BEHRAM ARCADE

A static, no-build retro arcade website. Open `index.html` through any static web server.

```
arcade/
├── index.html            landing page (game picker)
├── games.js              game registry – the ONLY file the landing page reads
├── assets/arcade.css     landing page styles (neon / CRT)
├── assets/arcade.js      renders cards from games.js, keyboard navigation
├── games/
│   ├── age-of-embers/    AGE OF EMBERS (isometric RTS: 4 ages, campaign, skirmish vs CPU)
│   └── tube-shooter/     VORTEX (game #1)
│       ├── index.html
│       ├── game.js
│       ├── icon-*.png, manifest.webmanifest   home-screen icon / app manifest
│       └── thumb.png     card thumbnail (real gameplay screenshot, 16:10)
└── screenshots/          reference screenshots
```

## Adding a new game (daily)

1. Create `games/<slug>/index.html` (self-contained: no CDN, relative paths only).
   Include a back link to the picker: `<a href="../../index.html">◀ BACK TO ARCADE</a>`
   and `<link rel="icon" href="data:,">` to avoid a favicon 404.
   Add the shared feedback sticker in `<head>`, before the game's own scripts:
   `<script src="../../assets/js/mood-sticker.js"></script>` and, where easy, call
   `MoodSticker.screen('play')` / `MoodSticker.event('big'|'stall'|'win'|'lose')` (see FEEDBACK.md).
2. Save a 16:10 gameplay screenshot as `games/<slug>/thumb.png` (≈660×412 or larger).
3. Add one entry at the top of the array in `games.js`:

```js
{
  slug: 'my-game',
  title: 'MY GAME',
  tagline: 'One-line pitch',
  description: 'Two or three sentences shown on the card.',
  thumb: 'games/my-game/thumb.png',
  added: '2026-10-25',          // YYYY-MM-DD; games added < 2 days ago get a NEW badge
  genre: 'PUZZLE',
  year: '1980 STYLE',            // optional
  controls: '← → move · SPACE fire',
  touch: 'tap to jump',           // optional: touch controls line on the card
  accent: '#36e6ff'              // card glow colour
},
```

Cards are sorted newest first. A "COMING SOON" card is always appended.
Store any per-game localStorage under a unique prefix (VORTEX uses `vortex.`).

## Running locally

```
cd arcade && python3 -m http.server 8080
```

## VORTEX controls

| Key | Action |
| --- | --- |
| ← / → | Move around the rim (reversed sense: ← moves the claw one way, → the other; ↑ / ↓ also move) |
| | The claw has 3 positions per lane (edge, center, edge) and tilts as it slides |
| Space | Fire — hold for rapid-fire bursts (max 8 shots on screen; the barrel needs a moment to cool between bursts). Z / X / Ctrl also fire |
| Enter | Superzapper (1st use destroys all enemies, 2nd destroys one) |
| Space / Enter | Start game, confirm starting level |
| ← / → on RATE YOURSELF | Choose starting level (1–99, with arcade start bonuses) |
| F | Toggle autofire (off by default) |
| P / Esc | Pause |
| M | Mute sound effects + music |
| Esc (title screen) | Back to arcade |

Music: procedurally synthesized chiptune/synthwave (Web Audio), a different track per level, low volume, fades out during warp.
Rendering: full devicePixelRatio × 2 supersampling (capped ~9.4 MP), steps down automatically if the frame rate drops.

Gamepad supported (A/RT fire, B/X/LT/Start superzapper). URL options: `?level=N` preselects a starting level; `?ss=1..3` forces the supersampling factor; `?debug=1` enables test keys (N clear level, K kill all, I invincible, S spikes).

### Difficulty and the rim fight (v3)

- Difficulty ramps quickly: more enemies (15 at level 1, 39 by level 17), faster climbing, flipping and enemy fire, and Tankers / Spikers / Fuseballs / Pulsars arrive from levels 2 / 3 / 6 / 9. Tuning lives in `levelParams()` and `poolCounts()`.
- Enemies that reach the rim hunt the claw lane by lane (shortest way round on closed webs). One that settles in your lane grabs you after a short delay (0.25 s at level 1, down to 0.1 s), and that delay is the only time it can be shot. A rim enemy mid-flip can't be hit, and one flipping onto the edge where the claw sits grabs it at once. Fuseballs on the rim can't be shot, so dodge them.
- Regression tests: `tests/vortex-rim.test.js` (camping must fail; a well-timed shot must work). See the header for how to run it.

### Touch controls (iPhone / iPad / Android)

Touch controls appear automatically on phones and tablets (first touch on any device also turns them on; `?touch=1` forces them, `?touch=0` disables them). Works in landscape and portrait; the tube is laid out between / above the controls and respects notch / home-bar safe areas.

| Control | Action |
| --- | --- |
| SPIN knob (left) | Drag sideways or circle your thumb like the arcade spinner: the claw moves in proportion to the drag (drag right / clockwise = same as →). The whole left zone below the HUD is live |
| MODE pill | Switch to ◀ ▶ arrow buttons instead of the spinner (tap = one step, hold = auto-repeat); remembered on the device |
| FIRE (right) | Hold for rapid fire (same heat limit / 8-shot cap as the keyboard); turns orange when the barrel overheats |
| ZAP | Superzapper |
| ‖ / 🔊 / ⛶ buttons | Pause (tap the screen to resume), mute, fullscreen (where the browser supports it) |
| Title / Game over | Tap to start / continue |
| RATE YOURSELF | Tap a level, swipe, or ◀ ▶; tap the selected level or START to play |
| Initials | Tap letters on the on-screen pad (or ↑ ↓ to cycle), DEL, OK |

Multi-touch: fire and spin at the same time. Sound unlocks on the first tap (on iPhone the ring/silent switch also mutes Web Audio). iPhone Safari has no fullscreen API, so use Share → Add to Home Screen for a full-screen app-style launch (icons + manifest included). On phones / tablets rendering is capped at ~5 MP to hold 60 fps.
Test: `tests/vortex-touch.test.js` (Playwright mobile emulation, touch input only).
