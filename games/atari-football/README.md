# ATARI FOOTBALL

A top-down, 7-on-7 American football game in the style of the Atari 800 XL. It's written in plain HTML5 Canvas and vanilla JavaScript, with no build step and no dependencies apart from a vendored copy of PeerJS.

Each down works the same way. Both players secretly pick a play from a playbook with diagrams. Once both have locked in, the play runs in real time. You control one highlighted player and everyone else follows their route or the AI. You can play the computer, or play a friend head to head online. Each of you is on your own device, wherever you are, and **neither screen ever shows the other side's playbook or call**.

## Running locally

The game loads several script files, so serve it over HTTP instead of opening `index.html` from disk:

```
cd arcade            # the repository root
python3 -m http.server 8080
# open http://localhost:8080/games/atari-football/
```

Online play needs internet access, because it uses the PeerJS cloud signalling server and Google STUN. Play vs Computer works offline.

## Hosting on GitHub Pages

Everything is static and every path is relative, so the folder works as it is on GitHub Pages or any other static host. Push the repository and turn on Pages for the `main` branch, root folder. The game is then at
`https://<user>.github.io/<repo>/games/atari-football/`. Live copy: https://storkdoc.github.io/behram-arcade/games/atari-football/

HTTPS is required for WebRTC on phones, and GitHub Pages already serves HTTPS.

## Game modes

| Menu item | What it does |
| --- | --- |
| PLAY VS COMPUTER | You are BLUE. The CPU calls its plays in secret and plays GOLD |
| TWO-PLAYER GAME (ONLINE) | Starts a game for you and a buddy. Shows the homage loading screen, then "WAITING FOR YOUR BUDDY…". You are BLUE |
| JOIN TWO-PLAYER GAME IN PROGRESS | Your buddy taps this on their own phone or computer. It finds the waiting game by itself, with no code to type. They are GOLD |
| HOW TO PLAY | Seven pages of instructions, including one on two-player |
| QUARTERS | 2, 3 or 5 minute quarters |
| MUSIC / SOUND | Turn the chiptune music and the sound effects on or off |

A same-screen hot-seat mode still exists for testing, but it's hidden from the menu. Add `?local=1` to the URL to show it.

## Two-player online

**How you start a game**

1. Player 1 taps **TWO-PLAYER GAME (ONLINE)**. The cassette-loading homage plays ("Call your buddy and tell them to hop on their bike and head over…"), then a **WAITING FOR YOUR BUDDY…** screen tells them what to say: open the Behram Arcade, pick Atari Football and tap *Join Two-Player Game in Progress*.
2. Player 2, on their own device and anywhere in the world, taps **JOIN TWO-PLAYER GAME IN PROGRESS**. The screen says "LOOKING FOR A GAME IN PROGRESS…" and the game starts as soon as it finds the waiting host.
3. If no game is waiting, they see **NO GAME WAITING – ask your buddy to start a Two-Player Game first**, with **RETRY**, **ENTER CODE INSTEAD** and **BACK** buttons. Everything is tap-driven on phones.

The host screen also shows a small 5-letter **backup room code**. Typing it under *Enter code instead* connects to that exact game, which is useful if several games are starting at the same moment.

**How matchmaking works (no server of our own)**

* A host registers the first free one of 20 well-known PeerJS ids, `behram-afb-v1-slot-1` to `slot-20`, on the free PeerJS cloud server. If the server says an id is taken, the host tries the next one. It also registers a backup id, `behram-afb-v1-code-<CODE>`.
* A joiner dials all 20 slots at once. Empty slots fail within about 0.2 s (`peer-unavailable`). A waiting host answers "available". The joiner gathers answers for 150 ms, then claims the lowest-numbered (longest-waiting) host.
* A host accepts exactly one guest. Anyone else who reaches it is told "busy" and moves on to the next host. Once paired, the host drops off the signalling server, which frees its slot and code for the next pair (the direct link keeps running). Closing a tab frees its ids too, and stale ids simply fail fast.
* **Limits:** up to 20 games can be *waiting* at the same moment. A 21st host still works through its room code only. There's no limit on games *in progress*, because they no longer use a slot. If two pairs start at the same moment, a joiner takes whichever host has waited longest, so two pairs could cross-match. The room code avoids that. There's no TURN relay, so very strict networks (some corporate or carrier-grade NAT) can block the direct WebRTC link. In that case the joiner gets "FOUND A GAME BUT COULD NOT CONNECT" and should try another network or a phone hotspot.

**Secret play calls**

* Each screen draws only its own playbook. The other side shows only *OPPONENT IS CHOOSING…* or *OPPONENT LOCKED IN*.
* While the guest picks, it sends nothing about its cursor. It sends only "locked" (no play id). The host asks for the guest's call (`need`) only after the host has locked too, so the host computer never holds the guest's call while the host is still choosing.
* Snapshots sent to the guest never contain the host's call before the snap. Until then the play name, play kind, kick meter, targets and the host's formation shift are stripped: opponents are shown standing where they were. Both calls are revealed ("BLITZ VS DEEP PASS") at the snap.
* Against the computer, the CPU's call is hidden the same way.
* `tests/mp.test.js` checks every message the guest receives and every string either screen draws during play selection.

**Keeping the guest's game responsive**

* The host runs the game, the guest sends its input, and each side has two WebRTC data channels. A reliable one carries play calls and control messages. An unordered "fast" one carries about 60 compact state snapshots a second and the guest's stick and buttons. Input is sent the instant it changes, plus a keep-alive every 50 ms, and stale out-of-order messages are dropped.
* The guest draws about 1.5 snapshot intervals behind (around 30 ms, adapting to jitter) and smooths between snapshots. Its own player is **predicted** locally, so it moves the moment the stick moves, and is pulled smoothly back to where the host says it is.
* `LINK xxMS` at the top of the screen shows the measured round trip.
* A heartbeat runs every second. If the link drops, both sides get a "DISCONNECTED" or "CONNECTION LOST" screen with NEW GAME / JOIN AGAIN buttons.

## The homage screen

Starting a Two-Player Game first shows a fake Atari 800 XL cassette load. It lasts about 24 seconds: `READY`, `CLOAD` typed out, then "PRESS PLAY ON TAPE". After that you get the striped loading border, FSK tape screech and beeps, 32 tape blocks, and a kid pedalling his bike across the screen. Over all of it is the message:

> CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER.
> THE GAME IS LOADING... JUST LIKE THE OLD DAYS.

It ends with `READY`, then moves on to the "waiting for your buddy" lobby. Press **Esc** or **K**, or tap **SKIP**, to skip it.

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
| Hidden hot-seat (`?local=1`) P1 / P2 | WASD / Arrows | F / Enter | G / Right Shift | Esc or P |
| Gamepad (standard mapping) | D-pad or left stick | A, RT or Start | B, X, Y or RB | – |
| Touch | Floating joystick (left half of the screen) | Red **A** button | Blue **B** button | **II** button |

Menus and the playbook can be tapped or clicked. On touch screens, tap a play to highlight it and tap it again (or tap LOCK IN) to lock it. Joining is all taps: JOIN TWO-PLAYER GAME IN PROGRESS, then RETRY or ENTER CODE INSTEAD if needed. For a backup code, tap the on-screen letters or tap **PHONE KEYBOARD**.

If you leave the stick alone, your player gets help. A QB still makes his drop, a runner follows the designed hole, a receiver runs under the throw, and a returner takes his first steps upfield.

## Phones and tablets

* Touch controls appear automatically on touch devices and stay hidden on desktop.
* The game is landscape. Holding a phone upright shows a "rotate your phone" hint.
* Pinch zoom, double-tap zoom and page scrolling are blocked, and the layout respects the iPhone notch and home bar.
* Audio unlocks on the first tap, which iOS requires. The game goes fullscreen where the browser allows it (Android Chrome; iPad Safari ignores it).
* You can start or join a two-player game from any phone, tablet or computer, in any combination.

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
| `js/net.js` | PeerJS matchmaking slots, backup room codes, reliable and fast channels, heartbeat, errors |
| `js/render.js` | Draws a snapshot: field, players, ball, HUD, banners |
| `js/ui.js` | Title, how-to, homage, lobbies, playbook overlay, pause, end screen |
| `js/touch.js` | On-screen joystick and buttons, fullscreen, gesture blocking |
| `js/main.js` | App state machine, game loop, network glue, integer scaling |
| `tests/simcheck.js` | Headless AI-vs-AI balance check: `node tests/simcheck.js 20` |
| `tests/mp.test.js` | Two-player test (matchmaking, secret calls, latency, disconnects) on a stand-in PeerJS with simulated lag; needs Chrome + playwright-core |

The game draws into a 480×300 frame buffer using `fillRect` only. That buffer is scaled up by a whole number of device pixels with smoothing turned off, so it stays crisp in Safari and Chrome on any screen. `window.AFB` exposes the modules for debugging, and `AFB.App.timeScale` fast-forwards the simulation in tests.
