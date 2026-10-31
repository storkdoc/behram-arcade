# CHALICE

A painterly 2.5D homage to the 1979 console classic that started the action-adventure genre. Find the enchanted Chalice
and carry it home to the Gold Castle's throne hall, past three dragons, a thieving bat, a labyrinth and dark catacombs.

Pure HTML5 canvas + Web Audio. No libraries, no CDNs, no build step. All art and music is procedural and original.

## Play
Open `index.html` (or https://storkdoc.github.io/behram-arcade/games/chalice/).

| Action | Keyboard | Mouse | Touch | Gamepad |
|---|---|---|---|---|
| Walk | Arrows / WASD | hold the button: walk toward the pointer | drag anywhere in the stick zone (floating joystick) | left stick / d-pad |
| Drop / swap (main action) | **Space** | right-click or DROP | DROP | A |
| Flare (special action) | **Enter** | FLARE | FLARE | B / X |
| Map | M / Tab | Map button | MAP | Y / Back |
| Pause | P / Esc | pause button | ❚❚ | Start |

You carry one thing at a time. Walk into an item with empty hands to pick it up; press Space while touching another item to swap.

## The kingdom
* **Level I: The Gold Road.** A smaller first quest: the gold and black castles, the blue labyrinth, and the yellow and green dragons. No bat.
* **Level II: The Three Castles.** The full kingdom: gold, white and black castles and their keys, the blue labyrinth,
  the torch-lit catacombs (you see only what your light reaches), the river (needs the Bridge), the Magnet, the Bat and all three dragons.
* **Level III: The Shifting Kingdom.** As Level II, but every item is hidden somewhere new each game.
* **Level IV: The Jade Kingdom (bonus).** A fourth castle whose reliquary only opens when all three keys rest on its pedestals.
  The dragons are faster.
* **The secret.** A grey dot hides in the Black Castle's maze. While you carry it, a shimmering barrier lets you through to the Makers' Room.

### Dragons and the Bat
* **Yorgrim** (yellow) is slow, gives up easily, and flees from anyone holding the Gold Key.
* **Grumbald** (green) is stubborn and keeps watch over the treasure he guards, wherever it ends up.
* **Rhindra** (red) is fast and relentless and never gives up, but she has to stop and pant after a long chase.

A dragon that touches you rears up, then bites. Strike it with the Sword's blade to slay it. If you're eaten, press Space
to rise again at the Gold Castle. The clock keeps running while you're down.

The Bat flies wherever it likes. It covets treasures, snatches whatever you carry and drops it somewhere far away. Catch the bat to grab the item back.
A flare (10 s recharge) dazes nearby dragons and scatters the bat.

### Difficulty switches (like the console's)
* **Left A:** dragons bite almost instantly.
* **Right A:** dragons flee from the Sword.

The timer starts on your first move. Best times are kept per level and switch combination in localStorage (`chalice.best.*`).

## Graphics and audio
* **Art.** Painterly room art is rendered once per room into cached canvases: grass, flowers, hedges and trees,
  marble and checkered halls, a crystal labyrinth, rune-lit crypts, water.
* **Lighting.** Soft wall shadows, a light map for torches, the hero's light and flares (catacombs are nearly black),
  and a 5-minute day/night cycle.
* **Motion.** Additive glows, particles, screen shake, and sliding camera transitions between rooms.
* **Map.** A parchment map that remembers visited rooms and where you last saw each item.
* **Audio.** A look-ahead Web Audio sequencer plays a theme for each area (meadow, castle, hall, labyrinth, catacomb,
  forest, secret) and adds a danger layer while a dragon hunts you. Sound effects are spatial and stereo-panned by position.

## Code
| File | Contents |
|---|---|
| `js/world.js` | Room grid, castles, maze and catacomb layouts for all 4 levels |
| `js/sim.js` | Deterministic 60 Hz simulation: player, items, gates, dragons with personalities, bat AI, magnet, bridge, win |
| `js/bot.js` | Autoplay bot: BFS route planning. Used for playtests and the title-screen demo |
| `js/render.js` | Painter, sprites, lighting, particles, map and minimap |
| `js/audio.js` | Music and SFX synthesis |
| `js/main.js` | Layout (phones, tablets, desktop), input, screens, HUD, tutorial, storage, mood-sticker hooks |

## Tests
```
node games/chalice/tests/sim.test.js            # rules + bot wins every level, both switch settings (SEEDS=8)
python3 -m http.server 8080 &
NODE_PATH=<dir with playwright-core> node games/chalice/tests/game.test.js   # 1280x800 keyboard/mouse/gamepad + iPhone portrait/landscape touch
```
