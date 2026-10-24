/* ==========================================================================
   BEHRAM ARCADE — game registry
   To add a game: create games/<slug>/index.html (+ thumb.png) and add ONE
   entry below. Newest games are shown first (sorted by "added").
   ========================================================================== */
window.ARCADE_GAMES = [
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
