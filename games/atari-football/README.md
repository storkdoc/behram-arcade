# ATARI FOOTBALL

A top-down, 7-on-7 American football game in the style of the Atari 800 XL. It's written in plain HTML5 Canvas and vanilla JavaScript, with no build step and no dependencies apart from a vendored copy of PeerJS.

Each down works the same way. Both players secretly pick a play from a playbook with diagrams. Once both have locked in, the play runs in real time. You control one highlighted player and everyone else follows their route or the AI. You can play the computer, a friend on the same keyboard, or a friend online using a 5-letter room code.

## Running locally

The game loads several script files, so serve it over HTTP instead of opening `index.html` from disk:

```
cd arcade            # the repository root
python3 -m http.server 8080
# open http://localhost:8080/games/atari-football/
```

Online play needs internet access, because it uses the PeerJS cloud signalling server and Google STUN. The other modes work offline.

## Hosting on GitHub Pages

Everything is static and every path is relative, so the folder works as it is on GitHub Pages or any other static host. Push the repository and turn on Pages for the `main` branch, root folder. The game is then at
`https://<user>.github.io/<repo>/games/atari-football/`. Live copy: https://storkdoc.github.io/behram-arcade/games/atari-football/

HTTPS is required for WebRTC on phones, and GitHub Pages already serves HTTPS.

## Game modes

| Menu item | What it does |
| --- | --- |
| PLAY VS COMPUTER | You are BLUE and the CPU calls plays and plays GOLD |
| HOST GAME (ONLINE) | Shows the homage loading screen, then a room code to give your friend. You are BLUE |
| JOIN GAME (ONLINE) | Type your friend's room code. You are GOLD |
| LOCAL 2-PLAYER | Two players on one keyboard, or two gamepads. Play calls are made one at a time behind a "LOOK AWAY!" screen |
| HOW TO PLAY | Six pages of instructions |
| QUARTERS | 2, 3 or 5 minute quarters |
| MUSIC / SOUND | Turn the chiptune music and the sound effects on or off |

## Room codes and online play

* The host's browser registers the PeerJS id `atarifb-<CODE>` on the free PeerJS cloud server. `<CODE>` is 5 letters with no I or O, and a new code is drawn if one is already taken. The code is reserved in the background while the homage screen plays, so it's usually ready by the time the lobby appears.
* The guest types the code and connects directly to the host over WebRTC, using Google STUN servers. No account or server of our own is needed.
* **The host is in charge.** The host runs the whole simulation and sends about 30 snapshots per second. The guest only sends stick and button input plus its play call, and draws the snapshots about 90 ms behind, smoothing between them. Neither side can see the other's play call until both have locked in.
* A heartbeat runs every second. If the connection drops, a "YOUR BUDDY DISCONNECTED" or "CONNECTION LOST" screen appears with **NEW ROOM** (host) or **JOIN AGAIN** (guest) buttons, plus a way back to the menu. A wrong code shows a clear "NO GAME FOUND" message. A third player trying to join is told the game is full.
* Very strict networks, such as some corporate or carrier-grade NAT, can block direct WebRTC connections. No TURN relay is set up, so in that case try another network or a phone hotspot.

## The homage screen

Hosting an online game (or starting local 2-player) first shows a fake Atari 800 XL cassette load. It lasts about 24 seconds: `READY`, `CLOAD` typed out, then "PRESS PLAY ON TAPE". After that you get the striped loading border, FSK tape screech and beeps, 32 tape blocks, and a kid pedalling his bike across the screen. Over all of it is the message:

> CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER.
> THE GAME IS LOADING... JUST LIKE THE OLD DAYS.

It ends with `READY`, then moves on to the room-code lobby. Press **Esc** or **K**, or tap **SKIP**, to skip it.

## Controls

There are only two buttons: **ACTION** and **CYCLE**. What they do depends on the situation, and the on-screen touch buttons are relabelled to match.

| Situation | ACTION | CYCLE |
| --- | --- | --- |
| QB with the ball on a pass play | Throw to the highlighted target (▼) | Switch to the next receiver |
| QB on a sweep | Pitch to the RB | – |
| Ball carrier | Juke (a burst that makes tackles less likely) | – |
| Receiver while the ball is in the air | Reach for the catch | – |
| Defense | Dive tackle (or rip free of a block) | Switch to the defender nearest the ball |
| Kick returner in the end zone | – | Kneel for a touchback |
| Punt / field goal | Stop the kick meter (the centre is best) | – |
| Play select | Lock in the highlighted play | – |

| Input | Move | ACTION | CYCLE | Pause |
| --- | --- | --- | --- | --- |
| Keyboard, 1 player | Arrows or WASD | Space, Enter, F or Z | Shift, G, X or C | Esc or P |
| Hot-seat P1 (BLUE) | WASD | F or Space | G or Left Shift | Esc or P |
| Hot-seat P2 (GOLD) | Arrows | Enter | Right Shift, / or . | Esc or P |
| Gamepad (standard mapping) | D-pad or left stick | A, RT or Start | B, X, Y or RB | – |
| Touch | Floating joystick (left half of the screen) | Red **A** button | Blue **B** button | **II** button |

Menus and the playbook can be tapped or clicked. On touch screens, tap a play to highlight it and tap it again (or tap LOCK IN) to lock it. To join on a phone, either tap the on-screen letter grid or tap **PHONE KEYBOARD** to use the system keyboard.

If you leave the stick alone, your player gets help. A QB still makes his drop, a runner follows the designed hole, a receiver runs under the throw, and a returner takes his first steps upfield.

## Phones and tablets

* Touch controls appear automatically on touch devices and stay hidden on desktop.
* The game is landscape. Holding a phone upright shows a "rotate your phone" hint.
* Pinch zoom, double-tap zoom and page scrolling are blocked, and the layout respects the iPhone notch and home bar.
* Audio unlocks on the first tap, which iOS requires. The game goes fullscreen where the browser allows it (Android Chrome; iPad Safari ignores it).
* You can host and join online from any phone or tablet. Local 2-player on one phone isn't supported, because it needs a keyboard or two gamepads.

## Rules

* 7 players a side, 4 downs to gain 10 yards. A touchdown is 7 points (the extra point is automatic), a field goal is 3, and a safety is 2.
* Kickoffs start each half and follow every score. Punts and kickoffs have returns, and touchbacks come out to the 20 for punts and the 25 for kickoffs.
* There are four quarters and the clock runs between plays. There are no penalties.

## Playbook

**Offense (12)**

1. RUN LEFT – handoff, RB hits the left guard hole
2. RUN RIGHT – handoff, RB hits the right guard hole
3. SWEEP – QB pitches (ACTION) to the RB racing wide left
4. DRAW – looks like a pass, then a late handoff up the middle
5. QB KEEPER – QB keeps it and runs left behind a lead blocker
6. SHORT PASS – quick 3-step: WR1 slant, WR2 out, RB swing
7. DEEP PASS – WR1 streak, WR2 post, RB blocks
8. CROSSING – WRs cross underneath at 7 yards, RB checkdown
9. SCREEN – let them rush, then dump it to the RB behind a wall on the right
10. PLAY ACTION – fake the run and go deep; linebackers and safety bite
11. PUNT – kick it away and cover
12. FIELD GOAL – time the kick meter

**Defense (6)**

1. MAN COVER – corners lock on, MLB takes the RB, safety deep
2. ZONE COVER – everyone guards an area; great against short passes
3. BLITZ – send 5 at the QB; risky if he gets it off
4. RUN STUFF – crowd the line; stops runs but can be beaten deep
5. CONTAIN – ends hold the edges, MLB spies; stops sweeps and scrambles
6. PREVENT – everyone drops deep; nothing long gets through

## Code layout

| File | Purpose |
| --- | --- |
| `index.html` | Page, CSS (touch controls, rotate hint, safe areas), script order |
| `peerjs.min.js` | PeerJS 1.5.4 (vendored, MIT) |
| `js/font.js` | 5×7 pixel font |
| `js/audio.js` | Web Audio chiptune music, sound effects and cassette-tape FSK sounds |
| `js/input.js` | Keyboard, gamepad and touch input merged into controllers |
| `js/field.js` | Palette, team colours, pixel primitives, sprites, scrolling field and camera |
| `js/plays.js` | Playbook data and the play-diagram renderer |
| `js/ai.js` | CPU play calling, QB reads, runners, blockers and defenders |
| `js/sim.js` | Rules and the host-side simulation (fixed 120 Hz step). It produces snapshots |
| `js/net.js` | PeerJS host and guest, room codes, heartbeat, errors |
| `js/render.js` | Draws a snapshot: field, players, ball, HUD, banners |
| `js/ui.js` | Title, how-to, homage, lobbies, playbook overlay, pause, end screen |
| `js/touch.js` | On-screen joystick and buttons, fullscreen, gesture blocking |
| `js/main.js` | App state machine, game loop, network glue, integer scaling |
| `tests/simcheck.js` | Headless AI-vs-AI balance check: `node tests/simcheck.js 20` |

The game draws into a 480×300 frame buffer using `fillRect` only. That buffer is scaled up by a whole number of device pixels with smoothing turned off, so it stays crisp in Safari and Chrome on any screen. `window.AFB` exposes the modules for debugging, and `AFB.App.timeScale` fast-forwards the simulation in tests.
