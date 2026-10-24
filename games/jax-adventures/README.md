# JAX'S ADVENTURES

An open-world 3D adventure set in a national park, built for the Behram Arcade. It is an original game in the spirit of cozy "sneaky critter in a campground" adventures. All the art, code, characters and names are original, and the game has no photos or copied assets in it.
Plain ES modules + three.js r169 (vendored), Web Audio, no build step. Play: https://storkdoc.github.io/behram-arcade/games/jax-adventures/

## The game
- **Jax** is a curious 9-year-old (stylized 3D: tousled dark hair, brown eyes, black long-sleeve tee, jeans, sneakers) living in a secret **tree-fort hideout** in Pinecrest National Park. His animations include idle, walk, run, sneak, cast, reel, swim, bike and celebrate.
- **The park:** Lake Pinecrest with its dock and Acorn Island, the river, the forest, the campground, the ranger station, Mr. Hollis's general store, Willa's trading post and the lookout.
- **Sneak and grab:** campers guard picnic baskets and coolers. They have vision cones and a **?** suspicion meter that turns into **!** when you're spotted. Crouch-sneak (C) to stay quiet, and hide in **bushes, trash bins and empty tents**.
- **Ranger Bramble** patrols the park, and later a deputy joins him. If he spots you carrying snacks he chases you. Get caught and he keeps what's in your backpack and walks you home. He loses you if you break line of sight, hide, or swim.
- **Fishing:** face the water and press F. Hold to charge the cast, tap when the bobber dips, then reel while keeping the line out of the red. There are **20 species** plus junk, split by region (lake, river, deep water) and by time of day and weather, with rarer fish in rain. Better rods, lures and bait help. The **journal** tracks how many of each fish you've caught and your best size.
- **Economy:** sell fish, snacks and treasures to Mr. Hollis. **Trade** with Willa: her offers change, and her "hot item" pays extra. The shop sells rods, worms, lures, backpacks (more slots), disguises (to lower suspicion), a mountain bike (R), a canoe, and decor for the fort (fire pit, string lights, hammock, tire swing, telescope...).
- **More to do:** skip stones, cook campfire recipes, collect golden acorns and hidden treasures, rest to skip time, and side quests from the campers. The main arc runs over three chapters, ending with *The Legend of Silverjaw*.
- **World:** a day/night cycle with sunrise, sunset and stars, plus clear, cloudy and rain weather.
- **Saving:** progress is saved to localStorage automatically and when you quit or switch tabs. Choose Continue on the title screen.

## Controls
**Mac:** WASD/arrows move · Shift run · C/Ctrl sneak · Space jump / interact / hide · E grab, talk or sell · F fish (hold to cast, tap on the bite, hold to reel) · R bike · I/Tab backpack · M map · Q quests · J journal · drag to orbit the camera · scroll to zoom · P/Esc pause · N mute. Music and SFX volume and graphics quality are in the pause menu.
**Gamepad:** left stick moves, right stick turns the camera, RT runs, A interacts, B sneaks, X fishes, Y opens the backpack, LB rides the bike and Start pauses.
**iPhone / iPad:** the left thumb joystick moves you (push it to the edge to run). Drag the right side to turn the camera and pinch to zoom. Use the GRAB/TALK, SNEAK, FISH and JUMP buttons (plus BIKE once you own one). Tap the top buttons for the bag, map, quests and journal, and tap menus. Works in portrait and landscape.

## Graphics
three.js WebGL2 with ACES tone mapping, a shader sky with sun, moon and stars, PCF soft shadows, exponential fog, and a bloom pass. The lake water has reflections and ripples. There is instanced grass and forest, plus particles (splashes, ripples, rain, campfire sparks). The renderer uses the device pixel ratio, capped at about 5 MP on phones, and quality adapts on the fly (4 levels, which you can also set in Pause). The HUD is a separate 2D canvas drawn at device pixels, so text stays crisp. Without WebGL (or with `?gl=0`) the game falls back to a top-down 2D renderer driven by the same simulation.

## Files
`js/sim.js` game rules (fixed 60 Hz step, NPC AI, fishing, quests, save) · `js/world.js` park layout, terrain, colliders · `js/data.js` fish, items, shop, quests · `js/render3d.js` three.js renderer · `js/props.js` buildings and props · `js/chars.js` character rigs and animation · `js/textures.js` procedural textures · `js/render2d.js` fallback · `js/hud.js` HUD, menus, map, touch controls · `js/input.js` keyboard, mouse, touch and gamepad · `js/audio.js` Web Audio synth · `js/main.js` boot and loop.
Debug API: `window.JAX` (`start`, `tp`, `time`, `weather`, `coins`, `give`, `step`...).

## Tests
From the repo root: `python3 -m http.server 8080 &`, then
`NODE_PATH=<dir with playwright-core> node games/jax-adventures/tests/game.test.js`. It covers desktop Chrome: boot, sneak-grab, hiding, the ranger chase and catch, fishing, sell/buy/trade, menus, save/load across a reload, night and rain, and no console errors. It also checks the 2D fallback, and iPhone 13 portrait and landscape (DPR canvas, joystick movement, no console errors).
