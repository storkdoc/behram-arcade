# BEHRAM ARCADE

A static, no-build retro arcade website. Open `index.html` through any static web server.

```
arcade/
├── index.html            landing page (game picker)
├── games.js              game registry – the ONLY file the landing page reads
├── assets/arcade.css     landing page styles (neon / CRT)
├── assets/arcade.js      renders cards from games.js, keyboard navigation
├── games/
│   └── tube-shooter/     VORTEX (game #1)
│       ├── index.html
│       ├── game.js
│       └── thumb.png     card thumbnail (real gameplay screenshot, 16:10)
└── screenshots/          reference screenshots
```

## Adding a new game (daily)

1. Create `games/<slug>/index.html` (self-contained: no CDN, relative paths only).
   Include a back link to the picker: `<a href="../../index.html">◀ BACK TO ARCADE</a>`
   and `<link rel="icon" href="data:,">` to avoid a favicon 404.
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
