/* ==========================================================================
   BEHRAM ARCADE — game registry
   To add a game: create games/<slug>/index.html (+ thumb.png) and add ONE
   entry below. Newest games are shown first (sorted by "added").
   ========================================================================== */
window.ARCADE_GAMES = [
  {
    slug: 'apex-gp',
    title: 'APEX GRAND PRIX',
    tagline: 'Qualify, then race to the flag',
    description: 'A true-3D homage to the 1982 Formula One coin-op. Drive one flying qualifying lap against the clock to earn your grid slot, then race 4 laps against 7 CPU cars. Checkpoints every half lap extend your time, and running out of time ends the race. A Fuji-style circuit with its long straight and snow-capped Mt. Fuji ahead, plus Seaside Circuit and Alpine Ring. Low and high gears, tyre squeal and skids, grass and gravel run-off, and billboards and rival cars that explode into fireballs before you respawn. WebGL2 HDR lighting, real-time shadows, lens flare, motion blur and bloom, a detailed chase-cam F1 car, a "Prepare to qualify" voice, a Web Audio engine that tracks RPM and gear, and lap, qualifying and high-score records. Choose a circuit and a difficulty. Two-player is online: one player hosts and the buddy taps Join Two-Player Game in Progress, with no code needed. You race head-to-head on the same grid, and your rival shows up as a yellow car.',
    thumb: 'games/apex-gp/thumb.png',
    added: '2026-10-24',
    genre: 'RACING',
    year: '1982 STYLE',
    controls: 'left/right arrows steer · up arrow gas · down arrow brake · SPACE (or SHIFT) gear LO/HI · ENTER start · P/ESC pause · M sound · optional mouse steering (Pointer Lock: move = wheel, left button gas, right button brake) · gamepad stick steers, RT gas, LT brake, X/Y/LB/RB gear, Start pause',
    touch: '◀ ▶ buttons steer (or drag on the left half) · big GAS button · BRAKE · GEAR (shows LO/HI) · optional TILT steering (tap TILT to allow motion) · hold GAS and steer with two fingers · pause/sound buttons · tap menus · best in landscape, portrait has a controls panel below the view · iPhone and iPad · tap to host or join online',
    accent: '#ff3b2f'
  },
  {
    slug: 'astro-shatter',
    title: 'ASTRO SHATTER',
    tagline: 'Shatter the rocks, dodge the saucers',
    description: 'A graphically advanced homage to the 1979 vector rock-blasting coin-op. Real-time 3D rocks, procedurally cratered and lit by a distant sun, tumble across a drifting nebula with a ringed planet. Pilot an inertial ship that wraps around the screen. Large rocks split into medium ones, medium into small. The big saucer fires at random, the small one aims, and it gets deadlier as your score climbs. Hyperspace is risky, the two-tone heartbeat speeds up as the wave goes on, and you earn an extra ship every 10,000 points. HDR bloom, 4x MSAA, shockwaves and debris, plus an optional Classic mode with glowing white vector outlines. Arcade start-wave select and a high score table with initials. Two-player is online: one player starts a Two-Player Game and the buddy taps Join Two-Player Game in Progress, with no code needed. You each fly your own field, and every 2nd large rock you break hurls a rock (or a small saucer) into your rival\'s field.',
    thumb: 'games/astro-shatter/thumb.png',
    added: '2026-10-24',
    genre: 'SHOOTER',
    year: '1979 STYLE',
    controls: 'left/right arrows rotate · up arrow thrust · SPACE fire (one shot per press, max 4) · ENTER/SHIFT/down arrow hyperspace · P/ESC pause · M sound · arrows + ENTER in menus · gamepad stick/d-pad rotate, A fire, RT thrust, B hyperspace, Start pause',
    touch: '◀ ▶ buttons rotate · THRUST button · red FIRE button (hold to auto-fire) · HYPER button · use several fingers at once · optional virtual stick steering in Options · pause/sound buttons · tap menus · works portrait and landscape on iPhone and iPad · tap to host or join online',
    accent: '#7dd8ff'
  },
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
    slug: 'vector-armor',
    title: 'VECTOR ARMOR',
    tagline: 'Enemy in range',
    description: 'A graphically intense homage to the 1980 first-person vector tank coin-op. Peer through the periscope across an endless glowing battlefield under a crescent moon, with an erupting volcano and a mountain skyline that turns with you. Hunt tanks, fast supertanks, zig-zag missiles that hop over obstacles, and the bonus saucer that cannot shoot back. Watch the radar sweep, heed ENEMY TO LEFT / RIGHT / REAR, use blocks and pyramids as cover (they stop shells and tanks), dodge incoming shells - you only get one shell in the air at a time - and see the glass crack when you are hit. HDR bloom, reflections, debris, classic green or modern palette, arcade start-level select, extra tanks and a high score table. Two-player is online: one player starts a Two-Player Game, the buddy taps Join Two-Player Game in Progress - no code needed - and you duel tank to tank on the same battlefield, each through your own periscope.',
    thumb: 'games/vector-armor/thumb.png',
    added: '2026-10-24',
    genre: 'SHOOTER',
    year: '1980 STYLE',
    controls: 'arrows/WASD drive and turn · SPACE fire · optional classic twin-tread keys (W/S left tread, up/down right tread) · mouse aim with pointer lock (option) · P pause · M sound · ENTER start · gamepad left stick + A/RT fire',
    touch: 'left thumb joystick drives and turns (or twin tread sliders in classic mode) · big FIRE button · pause button · tap menus · works portrait and landscape on iPhone and iPad · tap to host or join online',
    accent: '#ff3b3b'
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
