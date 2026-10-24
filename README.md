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
| ← / → | Move around the rim (↑ / ↓ also move, screen-relative) |
| Space | Superzapper (1st use destroys all enemies, 2nd destroys one) |
| Autofire | On by default; hold Z / X / Ctrl for rapid fire; F toggles autofire |
| Enter | Start / confirm level selection |
| ← / → on RATE YOURSELF | Choose starting level (1–99, with arcade start bonuses) |
| P / Esc | Pause |
| M | Mute |
| Esc (title screen) | Back to arcade |

Gamepad supported. URL options: `?level=N` preselects a starting level; `?debug=1` enables test keys (N clear level, K die, I invincible, S spikes).
