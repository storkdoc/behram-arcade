# MUSHROOM CLOUD — work notes

## Progress
- [x] Data/textures: tools/gen.py builds tex/day.jpg, night.jpg, clouds.jpg (NASA, public domain), tex/terr.png
      (R = bloc id*30, G = water mask, B = country borders) and js/world.js (1° sim grid, cities, outlines) from Natural Earth (PD).
- [x] Vendored three r169 (+postprocessing) in vendor/three, peerjs.min.js, test stand-in transport tests/mp/.
- [ ] js/sim.js  game logic + AI (node-compatible)
- [ ] js/net.js  PeerJS (namespace behram-mc-v1)
- [ ] js/render.js three.js globe + fx
- [ ] js/audio.js, js/main.js UI/input
- [ ] tests, thumb.png, games.js entry, push

## Grid chars
'.' ocean, '0'-'5' bloc land, 'n' neutral land, 'a'-'f' bloc territorial waters.
Blocs: 0 WA Western Alliance, 1 EB Eastern Bloc, 2 PC Pacific Coalition, 3 EU Continental Union, 4 SA Southern Accord, 5 MC Meridian Compact.
