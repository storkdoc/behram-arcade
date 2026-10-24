/* ==========================================================================
   BEHRAM ARCADE — game registry
   To add a game: create games/<slug>/index.html (+ thumb.png) and add ONE
   entry below. Newest games are shown first (sorted by "added").
   ========================================================================== */
window.ARCADE_GAMES = [
  {
    slug: 'sporewood',
    title: 'SPOREWOOD',
    tagline: 'Roll the ball, split the centipede',
    description: 'A high-fidelity homage to the 1981 trackball bug-shooter coin-op. A glowing, articulated centipede winds down through a lush mushroom forest. Shoot a segment and it splits, the rear half grows its own head, and the hit leaves a mushroom behind. It speeds up every wave, and new heads crawl into your zone once it reaches the bottom. Mushrooms take four hits. Fleas sow more, spiders bounce through your zone eating them, and scorpions poison them so the centipede plunges straight down. Damaged mushrooms are restored for points when you lose a life. Your shooter rides the same virtual trackball as Trackball Football: roll the mouse, trackpad or a two-finger swipe, and the faster you stroke the faster it moves, coasting on after a flick. It has a pulsing synth beat, eight forest palettes, an arcade start-wave select and a high score table. Two-player is online: one player starts a Two-Player Game and the buddy taps Join Two-Player Game in Progress, with no code needed. You each clear your own forest, and clearing a wave sends your rival a row of mushrooms and a flea.',
    thumb: 'games/sporewood/thumb.png',
    added: '2026-10-24',
    genre: 'SHOOTER',
    year: '1981 STYLE',
    controls: 'click to grab the trackball, then roll mouse/trackpad or two-finger swipe (faster stroke = faster shooter, flicks coast) · arrows/WASD with acceleration · SPACE or click fire (hold to auto-fire) · ENTER start/select · P pause · M sound · ESC releases the ball · gamepad stick/d-pad + A',
    touch: 'drag anywhere on the field or the trackball pad to roll the shooter (flick to glide, slow drag to place) · red FIRE button (hold to auto-fire, AUTO toggle) · roll and fire with two thumbs · pause/sound buttons · tap menus · works portrait and landscape on iPhone and iPad · tap to host or join online',
    accent: '#9dff7a'
  },
  {
    slug: 'planet-guardian',
    title: 'PLANET GUARDIAN',
    tagline: 'Save the humanoids, save the planet',
    description: 'A high-fidelity homage to the 1981 side-scrolling planet-defense coin-op. Patrol a wrapping world with a long-range scanner, reversing your ship in an instant and riding real inertia. Landers abduct the humanoids on the surface - one that reaches the top becomes a mutant - so shoot the abductor, catch the falling humanoid and fly it home for 1000. Lose them all and the planet explodes and every lander turns mutant; it is rebuilt every fifth wave. Bombers lay mines, pods burst into swarmers, baiters hunt you if you dawdle, and you have smart bombs and risky hyperspace. Parallax nebula, moon and mountains, a glowing lit ridge, voxel explosions, arcade start-wave select and a high score table. Two-player is online: one player starts a Two-Player Game, the buddy taps Join Two-Player Game in Progress - no code needed - and you defend separate planets, sending swarmer raids at your rival with every rescue and cleared wave.',
    thumb: 'games/planet-guardian/thumb.png',
    added: '2026-10-24',
    genre: 'SHOOTER',
    year: '1981 STYLE',
    controls: 'up/down (W/S) move · left/right (A/D) thrust, opposite key flips instantly · SPACE fire · ENTER smart bomb · H or SHIFT hyperspace · P pause · M sound · gamepad stick + A fire, B bomb, X/Y hyper',
    touch: 'left thumb joystick: up/down moves, left/right thrusts and reverses · FIRE button (hold to auto-fire) · BOMB and HYPER buttons · pause/sound buttons · tap menus · works portrait and landscape on iPhone and iPad · tap to host or join online',
    accent: '#ff9a48'
  },
  {
    slug: 'star-invaders',
    title: 'STAR INVADERS',
    tagline: 'Hold the line, count your shots',
    description: 'A high-fidelity homage to the 1978 alien-invasion coin-op. A 5 x 11 swarm of glossy voxel invaders marches to an accelerating four-note heartbeat - one alien steps per tick, so the rack speeds up as you thin it out. Shields erode crater by crater from both sides, varied bombs (rolling, plunger, squiggly), the mystery ship with the classic shot-count scoring (the 23rd shot scores 300), an extra base, waves that start lower, arcade start-wave select and a high score table - over a parallax starfield and planet horizon, with an optional red/green cellophane cabinet overlay. Two-player is online: one player starts a Two-Player Game, the buddy taps Join Two-Player Game in Progress - no code needed - and you race on separate fields, raiding your rival every time you clear a whole row.',
    thumb: 'games/star-invaders/thumb.png',
    added: '2026-10-24',
    genre: 'SHOOTER',
    year: '1978 STYLE',
    controls: 'arrows/A-D move · SPACE fire · ENTER start/select · P pause · M sound · gamepad stick/d-pad + A',
    touch: 'hold the left/right rocker or drag on the field to move · red FIRE button (hold to auto-fire, AUTO toggle beside it) · pause/sound buttons · tap menus · works portrait and landscape · tap to host or join online',
    accent: '#5ff2ff'
  },
  {
    slug: 'trackball-football',
    title: 'TRACKBALL FOOTBALL',
    tagline: 'Roll the ball, feel the run',
    description: 'A modern homage to the 1978 trackball coin-op: the faster you stroke the heavy virtual trackball, the faster your man runs, and it keeps rolling when you let go. 7-on-7 under stadium lights with secret play calls, downs, the clock, passes, punts, field goals, big hits and fumbles - spin hard to break tackles. Play the CPU at Rookie, Pro or All-Pro, or go head to head online: one player starts a Two-Player Game, the buddy taps Join Two-Player Game in Progress - no code needed.',
    thumb: 'games/trackball-football/thumb.png',
    added: '2026-10-24',
    genre: 'SPORTS',
    year: '1978 STYLE',
    controls: 'click the field to grab the trackball, then roll the mouse/trackpad (or two-finger swipe) · click/SPACE hike, throw, juke, dive · SHIFT/right-click next man · arrows/WASD also roll · ESC lets go · P pause · M sound',
    touch: 'swipe/flick the on-screen trackball (rest a finger to brake) · red button hike/throw/juke/dive · blue button next man · tap plays to call them · tap to host or join online',
    accent: '#ff5a3c'
  },
  {
    slug: 'atari-football',
    title: 'ATARI FOOTBALL',
    tagline: '7-on-7 pixel gridiron',
    description: 'Call hidden plays from a 12-play offense and 6-play defense, then take control of one highlighted player as the play runs live. Throws, catches, jukes, dive tackles, punts, field goals and kickoffs. Play the CPU, or go head to head online: one player starts a Two-Player Game, the buddy taps Join Two-Player Game in Progress on their own device - no code needed. Each screen only ever shows its own playbook.',
    thumb: 'games/atari-football/thumb.png',
    added: '2026-10-24',
    genre: 'SPORTS',
    year: '1982 STYLE',
    controls: 'arrows/WASD move · SPACE action (pass/tackle/kick) · SHIFT cycle player/target · ESC pause',
    touch: 'joystick (left) · A action · B cycle · tap plays to call them · tap to host or join online',
    accent: '#ffd23c'
  },
  {
    slug: 'tube-shooter',            // folder name under games/
    title: 'VORTEX',
    tagline: 'Vector tube shooter',
    description: 'Ride the rim of 16 neon tube webs and blast Flippers, Tankers, Spikers, Fuseballs and Pulsars before they reach you. Superzapper, warp, spikes, a synth soundtrack for every level and an arcade-style "Rate Yourself" level select.',
    thumb: 'games/tube-shooter/thumb.png',
    added: '2026-10-24',             // YYYY-MM-DD
    genre: 'SHOOTER',
    year: '1981 STYLE',
    controls: '← → move · SPACE fire (hold) · ENTER superzapper · P pause · M sound/music',
    touch: 'drag or circle the spinner · hold FIRE · ZAP · ◀ ▶ arrow mode · ‖ pause',
    accent: '#ff47e6'
  },
];
