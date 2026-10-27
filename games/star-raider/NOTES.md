# STAR RAIDER — worker notes

## Status (2026-10-27 ~00:15 EDT): FEATURE-COMPLETE, final test pass + push in progress
- [x] sim.js / auto.js (solo, co-op, WAR rules + bots), render.js, hud.js, audio.js, voice.js, models.js, net.js, main.js
- [x] tests: sim.test.js (balance), war.test.js (war balance + fog privacy), page.test.mjs (Playwright, every engine/device),
      mp.test.mjs (2P over the stand-in transport tests/mp/fakepeer.js + broker.js)
- [x] tools/thumb.mjs -> thumb.png (960x600, rendered from the real game), games.js entry (top, with touch line)
- If resumed: git log, then rerun tests in this order (box is loaded, run them one at a time):
  node tests/sim.test.js · node tests/war.test.js · node tests/page.test.mjs chromium /tmp/sr ·
  DEV=iphone,iphone-land,ipad node tests/page.test.mjs chromium /tmp/sr · node tests/page.test.mjs webkit /tmp/sr ·
  node tests/mp.test.mjs chromium · node tests/mp.test.mjs webkit   (server: python3 -m http.server 8080 at repo root)

## Why the gameplay works (the loop)
- Every minute is a decision: the chart shows fleets crawling toward your starbases. Warping costs energy AND time,
  so you choose which siege to break, whether to dock first, and when to gamble on a long jump.
- Combat is short and readable: each enemy type has its own "tell" (Darters pair up and pincer, Lancers swing wide then
  strafe, Hives hang back and spawn Darters behind a shield you must strip first). Hit-stop, flashes, score pops and the
  voice callouts make every kill land.
- Damage is attrition you can feel: losing Photons, Computer or Long-range scan changes how you play until you dock,
  so the quiet stretches (cruising, docking, planning on the chart) are tense rather than dead time.
- Efficiency scoring (rank + class) rewards fast clears, saved bases and few warps, so replays have a goal beyond "win".
- WAR turns it into a real-time strategy duel where your own piloting is one more unit on the board.

## Gameplay tuning decisions (from tests/sim.test.js)
- Flight has angular inertia (av eases toward stick, k=8.5/s): weighty but not mushy.
- Darters: pincer approach (pairs offset to opposite flanks), break-off after a pass, every
  2nd break they regroup on a lancer/hive escort -> readable "they're forming up" moments.
- Lancers: flank/strafe state machine. Hives: shields must be dropped (4 pips) before hull.
- Starbases radio for help: adjacent fleet, 50% siege, 80% MAYDAY; breaking a siege = SAVE bonus.
- Fleet cleared < 50 s after contact = FAST-CLEAR bonus. Enemy plasma rate ramps +40% over 20 min.
- Rating rewards efficiency: kills + win + bases alive + saves + fast clears - bases lost - energy/200 - 4/warp - 2/min - 60/death, x difficulty.
- Dock range raised 70 -> 95 units (bot and players kept stalling just outside).
- Novice fleets 3/4/1 (one hive teaches shields). bareKill: Novice 0 / Pilot .15 / Warrior .35 / Commander 1.
- Result (N=5): sloppy bot wins Novice 100%, sharp bot Pilot 100%, Warrior ~20%, Commander 0%.

## WAR (2-player head-to-head) design
- Team 0 BLUE (west, host), team 1 GOLD (east, guest). 3 starbases each, 4 squadrons, a flagship.
- Reserves: 1600 start, +4/s +0.9/s per sector held. Costs: squadron 1100 (18 s build), probe 250,
  decoy 250, mines 350, jam 600, ECCM 250, base repair 400 (+35%).
- Fog: bases see 2, squadrons 1, flagship 2 (less with damaged L), probes 1 (see into nebula, expose decoys).
  Edge-of-range contacts are "?" (size unknown). Jammed: -1 range, intel refresh 5 s, radio silent.
- Squadron battles resolve per sector over time; a flagship present doubles its side's punch, and enemy
  squadrons appear as live 3D ships around an enemy flagship. Both flagships in one sector = live PvP duel.
- Squadrons besiege enemy bases (hp 100). Flagships can torpedo enemy bases (3%/hit) under turret fire.
- Win: all enemy bases destroyed; or enemy flagship destroyed when they have no base; or most sectors
  held at the timer (short 9 min / long 20 min). Layouts: classic, crossfire, nebula.
- Privacy: only viewFor(G, team) feeds a side's chart; guest snapshots are built from viewFor(G,1).

## Design decisions
- Guest owns its own ship pose (steering/throttle/hyperwarp marker), host owns everything else.
- Keys: CLASSIC layout (default) = arrows steer, original letters (A aft, S shields...). WASD layout = WASD steers, R = rear (aft) view, E = shields. Toggle on the setup screen.

## Graphics
- three.js r169 (vendored). PBR (MeshStandard/Physical) ships and starbases lit by a nebula cube environment map,
  painted nebula sky + planets, star streaks, hyperwarp tunnel, pooled particle fireballs, shockwave rings, debris.
- Bloom chain. On desktop WebGL2 with EXT_color_buffer_float the scene renders to a HalfFloat (HDR) target, so bright
  cores bloom without clipping. Never on iOS or phones (8-bit sRGB target there). ?hdr=0 forces it off.
- No MSAA unless ?msaa=1. A pixel-readback self-check samples frames: black frames with HDR on rebuild the post chain as
  8-bit first, then the quality tier drops. Slow frames (>1/45 s median) with HDR on drop HDR first, then tiers.
  Phones start one tier lower. Fatal errors show a banner with a RELOAD button.

## Audio
- WebAudio, all synthesized, iOS unlock on the first gesture. Buses: SFX (slider), MUSIC (slider), VOICE (slider + mute,
  speechSynthesis). All three persist in localStorage (sr.sfxv, sr.musv, voice keys) and appear on the title and pause screens.
- Convolution reverb from a synthesized 2.7 s impulse response (stereo noise tail + early reflections), sends from SFX and music.
- 3D: HRTF PannerNodes for explosions, plasma and hits, positioned in the listener frame (mirrored in the aft view).
  The 3 nearest hostiles get engine loops whose pitch follows Doppler (240/(240+radial speed)).
- Generative score: 96 BPM, Dm Bb F C Dm Gm Bb A. Pad always; bass, drums, arpeggio and hats join as music level rises
  (cruise 0.24 -> threat 0.62 -> combat 1.0, warp 0.45, docked 0.16).
- Voice: picks the best installed English voice (Siri/Premium/Enhanced/Samantha/Ava on Mac and iOS, Google US English
  on Chrome), throttled and de-duplicated, urgent lines cut in. Callouts: red alert, shields down, hull hit, system
  damaged/destroyed, hyperwarp engaged, starbase under attack in sector X-Y, enemy flagship detected, sensors jammed...

## 2-player networking
- PeerJS over WebRTC, namespace behram-sr-v1-. Host is authoritative (see net.js header). Lobby: 1 PLAYER, 2 PLAYER host
  (shows "Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days."
  and a 5-letter backup code), JOIN TWO-PLAYER GAME IN PROGRESS (auto-search or type the code).
- Privacy: in WAR the guest only receives viewFor(G,1) and events/radio filtered to its team; the host pose is sent only
  when both ships share a sector. mp.test.mjs taps every wire message and asserts no hidden info leaks.
- Link: 9 s heartbeat (20 s until 40 messages arrive, so a slow first shader compile is not a disconnect). A drop gives the
  other player a forfeit win in WAR; in co-op the host keeps flying solo.

## Test results (latest)
- sim.test.js: Novice 100% win for a sloppy bot; sharp bot Pilot 100%, Warrior ~33%, Commander 0%. PASS.
- war.test.js: better commander usually wins, equal bots split, fog privacy holds. PASS.
- page.test.mjs chromium desktop 28/28 (HDR boot + self-check, full loop: combat, kill, chart, warp, dock, game over, rank).
- mp.test.mjs chromium + webkit 60/60 before the audio/HDR pass; final rerun below.

