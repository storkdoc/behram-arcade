/* ==========================================================================
   BEHRAM ARCADE — game registry
   To add a game: create games/<slug>/index.html (+ thumb.png) and add ONE
   entry below. Newest games are shown first (sorted by "added").
   ========================================================================== */
window.ARCADE_GAMES = [
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
