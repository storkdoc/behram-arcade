# BY DAWN'S EARLY LIGHT — worker notes

One-night command-crisis strategy game, 01:00 → dawn (06:00). Inspired only by the premise of the 1990 TV film;
all characters, call signs, blocs, dialogue and story are original. No film assets, names, quotes or branding.

## Fiction (original)
- Player bloc: THE COMMONWEALTH (North America on the globe). Airborne command post call sign LANTERN.
- Rival bloc: THE NORTHERN FEDERATION. Premier Ilse Darova (original). Their post: KESTREL (2P only).
- Rogue launch: a renegade Federation missile brigade fired on a Commonwealth city; automatic retaliation followed.
- Chancellor (Commonwealth head of state) missing after her helicopter went down. Player = Deputy Secretary aboard LANTERN.
- Ground claimant: Defense Minister Garrison Vale at bunker GRANITE (hawk, issues go codes).
- Commonwealth wings: HALBERD TALON COBALT VESPER ORCHID. Subs: SCARAB DEEPWELL. Tanker SHEPHERD.

## Architecture
- js/sim.js  deterministic symmetric sim (UMD; node tests). viewFor(side) hides private info.
- js/render.js three.js scenes: globe (night Earth + dawn terminator), command-post interior w/ CRT CanvasTextures, cockpit terrain.
- js/cockpit.js bomber set-piece minigame logic.  js/audio.js synth audio.  js/net.js PeerJS (ns behram-bdel-v1-).
- js/main.js UI glue, stations, input (kbd/mouse/gamepad/touch), online.

## Progress
- [x] scaffold (vendor/tex/net copied from mushroom-cloud)
- [ ] sim + tests
- [ ] UI + render + cockpit
- [ ] page tests, mp test, thumb, games.js, push
