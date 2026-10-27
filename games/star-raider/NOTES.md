# STAR RAIDER — worker notes

## Status (2026-10-26 22:40 EDT): IN PROGRESS
- [x] js/sim.js rules (strategic fleets/sieges/bases, tactical darter/lancer/hive AI, torps, plasma, shields, damage, docking, hyperwarp drift, ranks, missions campaign/laststand/blitz)
- [x] js/auto.js autopilot (attract + tests)
- [ ] render.js, hud.js, audio.js, main.js, net.js, index.html, css
- [ ] tests (sim, page, mp), thumb.png, games.js entry

## Design decisions
- Guest owns its own ship pose (steering/throttle/hyperwarp marker), host owns everything else.
- Keys: CLASSIC layout (default) = arrows steer, original letters (A aft, S shields...). WASD layout = WASD steers, R = rear (aft) view, E = shields. Toggle on the setup screen.
