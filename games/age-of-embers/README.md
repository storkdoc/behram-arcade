# Age of Embers

A single-player real-time strategy game in the spirit of *Age of Empires*. You gather four
resources, build a town, advance through four ages and win by conquest or by building a Wonder.
All art and audio are generated in code. There are no image or sound files, and nothing loads from a CDN.

## Playing

- **Campaign** (6 missions, which also teach the game): Kindling → Hearth and Home → Bronze Dawn →
  Raiders at Dusk → First Conquest → The Eternal Flame.
- **Skirmish** on random maps: Heartland, Riverlands, Inland Sea, Black Forest and Highlands.
  - Black Forest and Highlands must be unlocked first.
  - Choose 1–3 CPU opponents, free-for-all or 2v2, and map size.
  - CPU difficulty: Easy, Normal, Hard and Legendary (Legendary must be unlocked).
- **Ages:** Hearth → Bronze → Iron → Imperial.
- **Victory:** destroy every enemy, or build a Wonder and hold it until its timer runs out.
- **Counters:** spearmen beat cavalry, cavalry beat archers, archers beat infantry, and infantry beat spearmen.
  - Rams break buildings.
  - Catapults deal splash damage.
- **Buildings:** Town Center, House, Mill, Farm, Lumber Camp, Mining Camp, Dock, Barracks,
  Archery Range, Stable, Blacksmith, Market, Watch Tower, Palisade and Stone Walls, Siege Works,
  Academy and Wonder.
  - The tech tree has economy, military-tier and armour upgrades.
- **Army control:** formations, attack-move, control groups, rally points and market trading.
- **Saving:** the game autosaves every minute and when you leave the tab. Use Resume on the title screen.
- **After each game:** a stats screen with graphs (score, population, army and gathering), XP ranks,
  18 achievements and unlockable maps, difficulty and banner colours.

## Controls

| | |
|---|---|
| Mouse | Left-click / drag selects. Right-click gives a smart command. Wheel zooms. Edge or arrow keys pan. Mac: two-finger pan, pinch to zoom, ctrl-click = right-click |
| Keyboard | **Space** = next idle villager. **Enter** = select army, or attack-move to the cursor. QWERT/ASDFG/ZXCVB = command card. Ctrl/⌘+1-9 sets a group. 1-9 recalls a group. H = Town Center. `.` = idle army. Del, +/- = speed, Esc = menu |
| Touch | Tap to select or command. One-finger drag box-selects. Two-finger drag pans. Pinch zooms. Double-tap or long-press selects all units of that type. Side buttons for army, idle villager, attack-move and deselect |
| Gamepad | Stick = cursor. A = select (hold to box). X = command. Y = idle villager. B = cancel. LT = army. LB/RB = zoom. RT = command card. L3 = Town Center. Start = menu |

The Backquote key and the gamepad Back button are reserved for the arcade mood sticker.

## Code

All game code lives in `js/`. The sim, AI and campaign files also run in Node, so they can be tested headless.

| File | Purpose |
|---|---|
| `util`, `data` | Unit, building and tech data |
| `map` | Random maps |
| `path` | A* pathfinding and flow fields |
| `sim` | Deterministic 20 Hz simulation |
| `ai` | CPU players |
| `campaign` | Missions |
| `sprites`, `render` | Procedural isometric sprites and the canvas renderer, with fog of war, lighting and particles |
| `audio` | WebAudio synthesis: spatial SFX, voice acks, and music that changes with each age |
| `ui`, `input`, `main`, `screens` | Interface, input, game flow and menus |

## Tests

```
node tests/campaign-test.js   # a bot plays all 6 missions (6/6 should pass)
node tests/botmatch.js 2 0 7  # CPU Hard vs Easy, prints pacing
node tests/batch.js           # several seeds
node tests/counters.js        # rock-paper-scissors balance
```

Open `tests/render.html` and `tests/sprites.html` in a browser to check the visuals.
