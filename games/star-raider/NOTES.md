# STAR RAIDER — worker notes

## Status (2026-10-26, late evening EDT): IN PROGRESS
- [x] js/sim.js: solo/co-op rules + WAR head-to-head mode (newGame({mode:'war'}), warAct, viewFor)
- [x] js/auto.js: autopilot make(skill) + WAR strategist makeWar(skill, style)
- [x] render.js, hud.js, audio.js, models.js, net.js, index.html, css (committed)
- [x] tests/sim.test.js (solo balance), tests/war.test.js (war balance + fog privacy)
- [ ] js/main.js (screens, input, loop, net glue, war chart UI)  <- NEXT
- [ ] tests/page.test.mjs, tests/mp.test.mjs, tools/thumb.mjs, thumb.png, games.js entry, push

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
