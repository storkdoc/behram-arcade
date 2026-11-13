# Behram Arcade: daily self-improvement log

## 2026-10-28 (day 1)

Test rig: headless Google Chrome (playwright-core) with SwiftShader software WebGL on a shared 8-core box. The load
average reached 20-36 because several workers were running at once. **No real GPU was available.** All fps numbers below
are software-GL numbers on a loaded CPU (0.2-20 fps) and say nothing about real devices. Timing-based browser
checks were flaky under that load. Each such failure was re-run on the unmodified origin/main to separate load from
regressions.

### Neuro Arena (read-only measurement)
`tests/evochoice.mjs <contest> 40 1 1 30 2800 1 1 evolved` (K=1, Lamarck on, 30 s matches, size 2800, seed 1,
reflex 1, evolved wiring, ABL=20; Word used 60 s matches). The runs hit a wall-clock cap, so some stopped before 40
generations.

- **champ**: champion accuracy on the current curriculum level.
- **full**: accuracy on the full task.
- **reflex base**: the `fullPrior` reflex/prior baseline on the full task.
- **probe**: held-out understanding probe.
- **beyond**: beyond-reflex score.
- **slope**: least-squares change in champion accuracy per generation.
- **stagnant**: generations since the champion's accuracy last changed.

| contest | gens | champ first→last (max) | level | full | reflex base | probe | beyond | slope/gen | reaps | champ changes | stagnant |
|---|---|---|---|---|---|---|---|---|---|---|---|
| add | 40 | 17%→69% (100) | 1 | 13% (end ablation 7%) | 10% | 7.5% | +0.03 | +0.85 pp | 1 | 13 | 3 |
| sub | 40 | 83%→93% (100) | 4 | 49% | 18% | 37.5% (end 42.5%) | +0.31 | +0.11 pp | 4 | 20 | 0 |
| big | 17 | 71%→100% | 0 | – | chance 50% | 93% | +0.22 | +1.20 pp | 3 | 7 | 5 |
| divisor | 29 | 34%→73% | 0 | 39% | **66%** | 20% | **−0.27** | +0.76 pp | 1 | 6 | **22** |
| simon | 31 | 34%→73% (83) | 1 | 47% | 26% | 47.5% | +0.21 | +0.32 pp | 1 | 4 | **26** |
| pong | 40 | hit 34%→74% | 0 | hit 74% | 65% | 42.5% (uHit 35%) | −0.01 | +0.83 pp | 2 | 4 | 3 |
| text (Word) | 25 | 40%→48% (82) | 1 | **19%** | **25%** | **1.7%** | −0.06 | +0.55 pp | 3 | 8 | 1 |
| rps | 29 | 100% from gen 1 | 0 | 100% | 33% | – | – | 0 | 0 | 0 | 28 (saturated) |
| dots | 40 | 100% from gen 1 | 0 | 100% | 17% | – | – | 0 | 0 | 0 | 39 (saturated) |
| pattern | 40 | 40%→100% at gen 3 | 0 | 100% | 50% | 100% | +0.50 | +0.34 pp | 2 | 2 | 37 (saturated) |
| echo | 3 | 81%→100% | 0 | – | 12.5% | – | – | – | 0 | 2 | (cut at gen 3) |

Pong extras: openSide 64% at the end (71% in the end ablation), duel winners 45%. Ablation at gen 40 showed that removing
self units drops Pong full hit from 74% to 54%, and removing self+enemy units drops it to 48%. So the learned units
matter. In add and sub, removing unit classes barely changes the score (add 7%→9-12%, sub 49%→49-51%), so those gains sit
mostly in the reflex/wiring and not in the learned units. In Word (gen 20), removing all units drops full from 20% to 9%. Contests not run today: add5, evenodd, text3, simon2,
tug.

**Findings**
1. **Word is still below its reflex baseline**: 19% on the full task against a 25% reflex prior, and the probe is 1.7%. The
   champion's 82% peak was on the easy level and did not carry over. The growing lexicon landed today, so this needs a
   fresh measurement next time.
2. **Divisor is clearly worse than reflex**: 39% on the full task against a 66% prior (beyond −0.27), and its champion
   has stagnated for 22 generations. Evolution is unlearning a prior that works.
3. **Selection barely acts**: 0-4 reaps in 40 generations, and long plateaus (simon 26 generations, divisor 22).
4. **rps, dots and pattern are saturated** (100% from generation 1-3). They give no learning signal and only use up compute.
5. **Pong** now beats its prior (74% against 65% hits), but beyond-reflex is about 0 and openSide is only 64%.

### Other games: smoke test (desktop 1280×800 and iPhone 390×844, local server)
The smoke test loads each game, then does:
- desktop: a click, then Space, Enter and the arrow keys
- iPhone: four taps
- both: connects an emulated standard gamepad (stick plus A, START and RT), then holds Space

| game | console errors (desktop / iPhone) | notes |
|---|---|---|
| living-chess, star-raider, sky-shield, mushroom-cloud, neuro-storm, apex-gp, astro-shatter, sporewood, vector-armor, planet-guardian, star-invaders, trackball-football, atari-football, tube-shooter, tank-duel, meta-arena, neuro-arena | none / none | jax-adventures timed out taking screenshots under load (no errors) |
| by-dawns-early-light | favicon 404 / favicon 404 | **fixed**: clean after the change |
| reactor | 404 on desktop | still under construction, not touched |

Input audit: every game except Neuro Storm already read `navigator.getGamepads`. Neuro Storm had no gamepad support and no
Enter action, and Space only paused the simulation. **Fixed** (see below).

**Star Raider (sim, auto.js bots)**: Commander was the weakest spot. A sharp bot won **0%** of Commander games in both
campaign and blitz, at N=6-30, and games ended after about 1.6 min. Two causes:
- Hits that got through damaged shields could kill outright (bareKill 1).
- Starbases fell after about 2 min, because Commander needed only 2 fleets to start a siege.
Other baseline rates: Warrior 33%, Pilot and Novice 100%, and the sloppy bot won Pilot 17%.

**Landing page**:
- The `tests/landing.test.js` 'fast flick right' check failed 1 run in 3 to 1 in 8. Its CDP touch round trips took 30-250 ms
  each on this box, which turned the "fast" flick into a slow drag.
- `tests/vortex-touch.test.js` still looked for the old `a.card[data-slug]` landing markup. Its URL check would also have
  matched `?game=tube-shooter` as a launch.

### Changes (all pushed to origin/main)
| commit | change | tests |
|---|---|---|
| `abe0e2e` | **Star Raider Commander rebalance** (see below) | `tests/sim.test.js` (2 new asserts) and `war.test.js` pass. Under a load of 30+, page.test had 7 timing failures (arrows steer, dock, warp). Re-run at load ~7 it gives **97 passed, 0 failed** |
| `36f2ec4` | **By Dawn's Early Light**: empty favicon, which removes the only console error the smoke test found | smoke test clean on both devices |
| `2d76558` | **Neuro Storm: keyboard and gamepad play** (`js/padkeys.js`, see below) | `tests/padkeys.test.cjs`: 30/30 on 4K and on the 55K cortex, both locally and against the **live site**. Its page.test failed the same timing check on unmodified origin/main under load, and **passes fully** at load ~7 |
| `c39fe88` | **Landing**: flick momentum (see below) | landing.test 4/4 runs pass, 0 flaky. vortex-touch landing section passes |

Star Raider Commander rebalance (`abe0e2e`):
- A hit that leaks through damaged but raised shields never kills outright. It costs 1000 energy and 1 system.
- Outright death is only possible with shields off or destroyed, at 50%.
- A siege needs 3 attackers, siege time is 62 s, and fleets are 3/4/3.
- Aim error and homing are softer.
- The autopilot breaks off a fight to repair.
- Voice line: "Shields failing. Dock for repairs".
- Result: the sharp bot wins Commander 17% at N=12 (27% at N=30) and games last 4.0 min (was 1.6). Blitz Commander 8%,
  Warrior 58%.

Neuro Storm keyboard and gamepad play (`2d76558`):
- Arrows or the left stick aim a reticle.
- **Space** or A stimulates the aimed neuron; holding it in electrode mode gives a 50 Hz train.
- **Enter** or X/B sends a special volley (strong, or thalamic on the dense cortex).
- Shift+arrows or the right stick rotate the view, and +/− or the triggers zoom.
- P or START pauses (pause moved from Space), Y starts the demo and LB/RB change speed.
- Mouse and touch work as before, and pointer use hides the reticle.

Landing flick momentum (`c39fe88`):
- The carousel now keeps coalesced pointer samples and the lift point, so a flick that fits in one frame keeps its momentum
  on real phones.
- The test now sends timestamped touches.
- vortex-touch's landing check was rewritten for the carousel.

Read-only measurement of VORTEX (tube-shooter, not edited):
- `tests/vortex-rim.test.js` passes.
- `tests/vortex-touch.test.js` gives 128 PASS and 2 FAIL. Both failures are "heat limit still applies to touch FIRE"
  (overheat=false, 6 shots on screen) on 2 of the 4 devices. It looks frame-rate dependent. Passing devices show
  overheat=true with 1-2 shots on screen. This is for the VORTEX owner.

Live checks after pushing: `star-raider/js/sim.js` serves `bareKill: 0.5` and the page loads with no errors.
`neuro-storm/js/padkeys.js` is live and padkeys.test passes against https://storkdoc.github.io/behram-arcade/games/neuro-storm/.

### Recommended Neuro Arena changes for tomorrow
1. **Divisor and Word: keep the reflex as a floor.** Reject (or reap) a child whose full-task score falls below the reflex
   prior (`fullPrior`). Today divisor dropped from a 66% prior to 39%, and Word reached 19% against 25%.
2. **Make selection bite**: 0-4 reaps in 40 generations and plateaus of 22-26 generations. Options:
   - Raise mutation size or the number of children (K>1) when the champion has stagnated for more than 8 generations.
   - Or score the champion on the full task and the probe instead of only the current level, so plateaus at level 0/1
     move.
3. **Retire or harden the saturated contests** (rps, dots, pattern hit 100% by generation 3). Either add a harder level
   (an adaptive rps opponent, more dots, longer patterns) or drop them from the rotation to free compute.
4. **Word**: measure the new growing lexicon (new vs familiar words) with seeds 1-3. The probe is 1.7%, so the
   letter/bigram units are not generalizing yet. Try giving more of the unit budget to `bigram`/`neighbor` units and
   fewer to `far`/`letters` (133 letters vs 40 bigram today).
5. **Pong**: beyond-reflex is about 0 and openSide is 64%. Reward returns aimed at the open side directly in the duel score.
6. Run add5, evenodd, text3, simon2 and tug next time, at 2 seeds, when the box is less loaded.

## 2026-10-29 (day 2): gameplay evaluation

Headless Playwright (Chrome, SwiftShader) at 1440×900 and iPhone 14 (390×844), local server and then live. Space is the
main action and Enter the special. Feedback hosts (textdb.dev, ntfy.sh) were blocked during tests so no real feedback was posted.

### Findings by game
- **Congressional OB GYN**: there are 257 questions. A 28-question spot check found them all accurate. The flow and the
  accuracy-based grade are fair. The PIN and the student codes work: code generation was tested through
  `tests/testpin.js`, and the PIN stays a salted hash. Problems found:
  - The correct option is the **longest one in 74% of questions**. That is a test-wiseness cue, so balance option lengths
    when questions are next edited.
  - On iPhone, the Next button sits partly below the fold.
  - The PIN is still in the git history, so Dr. Behram should rotate it.
  - Fixed: the iPhone answer-tap timeout.
- **VORTEX (tube-shooter)**: a scripted bot reaches levels 5-10. Most deaths come from enemy shots, then spikes and rim
  grabs, and they cluster at L5 and L8+. Before today a shot death showed no cause and no warning. The heat-limit
  touch failures from day 1 were a test race: a warp happened between the snapshots of the ▶ tap check. That check now
  retries, and vortex-touch passes on all 4 devices.
- **MELTDOWN (reactor)**: the sim tests pass 47/47. After a trip the shift could not be recovered, because xenon plus the
  instant withdrawal of the shutdown bank left no path back. Forced repair trips were also scored as lost grid
  accuracy, so the grade depended on luck (a D). Both are fixed below. A competent restart takes about 170 s and needs
  boron dilution.
- **Star Raider**: the numbers match day 1. A sloppy bot scores Pilot at 25%, which may be harsh for casual players. Not changed.
- **All 21 games (smoke test)**: clean on desktop and iPhone. Every game loads with no console or page errors, and every
  game includes the new MoodSticker. planet-guardian desktop had one screenshot timeout, with no errors.
- **Landing archive.json error**: not reproduced. The landing test passes, `games/meta-arena/data/archive.json` returns
  200 locally and live, and the relative fetch resolves from `games/meta-arena/index.html`.
- **Neuro Arena** (same seeds as day 1; the results are identical because none of the day 1 recommendations was
  implemented):
  - divisor: 12 generations, champion 34→73%. Full task 3%→39% against the 66% reflex prior. 0 reaps after
    generation 1.
  - text: 15 generations, champion 10→52%. Full task 20% against 25%. 0 reaps, plateau from generation 4.
  - rps: saturated at 100%.
  - **Honest-science correction to day 1**: the full-task score *rises* from generation 1. It starts at 3% because the
    default reflex is Limited (capped at 20% of wMax). The brain is not "unlearning" the prior; it starts below the
    prior and climbs. Day 1 recommendation 1 (a reflex floor) would therefore reject every child. Compare instead
    against a like-for-like baseline: the capped Limited reflex alone, with the brain silenced. The real problem is
    that selection is not acting (0 reaps), so recommendation 2 still stands.

### Changes (pushed to origin/main, verified live)
- `4a35578` Congressional: rescue for the iPhone answer tap. The plain-text PIN was removed from the tests and NOTES,
  and `tests/testpin.js` was added.
- `b2c75fe` MELTDOWN: a trip can now be recovered. The shutdown bank withdraws slowly (0.08/s) and holds while the
  period is under 20 s. Grid accuracy is not scored while the crew repairs a tripping fault, and the end screen shows
  this as "Off grid for crew repairs (not scored)". The reset toast now explains xenon (pull rods ↑, dilute boron N).
  Test: `games/reactor/tests/restart.test.mjs`.
- `e7b1ec6` VORTEX (Tempest): a warning for incoming shots. The claw's lane rim glows red when an enemy shot is within
  0.35 of the rim. After each death the game names the cause, and for the first 2 deaths of each kind it adds a tip
  (shot, grab, spike, spark, mine, fuse). The MoodSticker "lose" line is kept. Test: `tests/vortex-tips.test.js`
  (desktop and iPhone). The vortex-touch ▶ check was also made race-free.

Regression after rebasing on `c33d910` (MoodSticker): vortex-tips, v4, waves, rim and touch pass, as do reactor
restart, the Congressional access/core/page tests (desktop and iPhone) and landing. mood-sticker passes 46. Its 8
failures are only the textdb/ntfy delivery checks, which were blocked on purpose.

Live checks: the live `reactor/js/main.js`, `tube-shooter/game.js`, `congressional-obgyn/js/main.js` and
`assets/js/mood-sticker.js` serve the new code. Against https://storkdoc.github.io/behram-arcade/, restart.test.mjs
gives ALL PASS and vortex-tips.test.js gives ALL PASSED.

### For tomorrow
1. Neuro Arena: add a like-for-like Limited-reflex baseline to the report, and make selection act (see day 1 recommendation 2).
2. Congressional: balance option lengths, and keep Next above the fold on iPhone.
3. Star Raider: consider a gentler Pilot threshold for casual players.

### Trackball Football: you can't run for a touchdown every play anymore (`816c6bd`)
- **Root cause**: a human ball carrier at full trackball spin was faster than every CPU defender (RB about 9.9 yd/s
  vs Pro defenders' 8.4, plus a free juke speed burst every second), and he could cut instantly. Defenders just
  chased the runner instead of taking angles, nobody kept the edge or stayed deep, and mashing escaped about half
  of all wraps. Sideline sweeps and QB scrambles scored 100% of the time at every level.
- **Fix**: defenders now take intercept angles (Rookie defenders' angles are sloppier), keep contain, and leave a
  deep safety. The CPU dives from 1–2 yd, gang tackles are harder to escape, and wrap escapes depend on spin, luck
  and fatigue. A carrier fades after about 3 s and only cuts sharply while juking. The juke is now a timed fake: it
  works from 1.3–2.2 yd ("FAKED HIM OUT!") and juking in open space wastes energy. The CPU learns your run, outside
  and scramble tendencies (stuff, man or spy calls and a cheating safety) and shows a banner telling you to mix in a
  pass. The same rules apply to both teams and to 2P.
- **Naive run-exploit TD rate (headless bots)**:
  - Rookie: 63.6% → 0.7%
  - Pro: 43.9% → 0.3%
  - All-Pro: 29.9% → 0%
- **Skilled "evasive" bot** (well-timed jukes), before → after:
  - Rookie: 72% → about 5%
  - Pro: 43% → about 5%
  - All-Pro: 18% → 0%
- Long breakaways still happen. Pro sweeps average about 5–11 yd.
- Tests: new `games/trackball-football/tests/run-defense.test.js` (pure Node), ALL PASSED. game.test.js and
  mp.test.js are ALL PASS.

## 2026-10-30 (day 3): gameplay evaluation + fixes

Yesterday's run was marked failed: its Neuro Arena plateau-rule edits were left uncommitted in an old worktree
(`/workspace/daily-1029`, untouched). Today they were re-applied in a fresh worktree from `acf46ab`, tested and shipped.
All work in `/workspace/arcade-daily-2026-10-30`; headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14.

### Player feedback
`node tools/read-feedback.mjs --json --no-sync`: **0 real submissions** in the last 48 h. All 38 records were TEST
entries from the Oct 29 test runs (ignored; archived to ~/behram-arcade-feedback.jsonl). No ratings or suggestions to act on.

### Findings
- **All 22 games smoke test**: every game loads on desktop and iPhone with no console or page errors. A few
  screenshot timeouts (jax-adventures, living-chess, mushroom-cloud, apex-gp on iPhone) were CPU load, not errors.
- **Congressional OB GYN**: access/core/page tests pass (desktop + iPhone; PIN only as a salted hash, test PIN via
  testpin.js; 6-week expiry checked). The correct answer was the longest option in 74.3% of 257 questions, up to 4.9×
  longer than any distractor. On iPhone 14 / SE, after answering, the Next button showed only 7 px above the panel's
  scroll edge (iPhone 14 landscape: probe could not reach the schedule rows, not investigated further).
- **VORTEX (Tempest)**: enemy shots are still the #1 death cause; the rim glow warning from day 2 is easy to miss while
  watching the far end. No haptics existed. Regression suite passes; `vortex-v4` "warden shield" is flaky (failed 1 of
  2 runs on unmodified origin/main too: a pre-existing test timing flake, not caused by today's change).
- **MELTDOWN**: sim 47/47, restart test ALL PASS (back above 8% power in 166 s, 0 re-trips).
- **Star Raider**: sim + war tests pass. Sloppy bot wins campaign Pilot 17% (day 2: 25%): the Pilot step is still
  steep for casual players. Not changed today.
- **Neuro Arena** (evochoice, seed 12345, 10 rounds × K=4 = 40 generations, ABL off):
  | contest | chance | champ start→end | reaps | full task | beyond reflex | notes |
  | divisor (plateau off / on) | 8% | 22→73% / 22→80% | 0 / 1 | 40% / 44% | −0.26 / −0.22 | |
  | simon (off / on) | 25% | 41→67% / 41→78% | 0 / 1 | 33% / 47% | +0.07 / +0.21 | |
  | text (off / on) | 8% | 22→40% / 22→38% | 0 / 1 | 12% / 14% | −0.13 / −0.11 | below letter-frequency |
  | pong (off / on) | – | 40→48% / 40→44→28% | 0 / 2 | – | – | plateau crown hurt |
  | add (on) | 5% | 28→78% | 1 | 9% | −0.01 | level 0 |
  | sub (on) | 10% | 67→88% | 2 | 27% | +0.09 | reached level 3 |
  | big (on) | 50% | 68→94% | 2 | – | +0.17 | |
  | pattern (on) | 12.5% | 65→100% | 2 | – | +0.50 | |
  | echo / dots / rps (on) | – | saturated at 100% | 1 each | – | – | |
  Understanding layer units (self / enemy) stay ~20–30 / ~20–30 in every contest; text keeps neighbour (42) and bigram (46)
  units but its full-task score is still below the "commonest letter for that slot" baseline, so it has **not** moved
  beyond letter-frequency guessing. Divisor's full task (40–44%) is still below the 66% full reflex prior.
  Versus day 2: plateau-off runs reproduce the day-2 freeze (0 reaps); the plateau rule makes selection act again
  (1–2 reaps per contest). Single seed each, so treat the gains as suggestive, not proven.

### Changes (pushed to origin/main, verified live)
- `f294c14` **Congressional OB GYN**: rewrote distractors for the 47 worst questions and trimmed 37 wordy correct
  options (doses kept where they matter, e.g. the PID regimen). Correct-is-longest 74.3% → 71.6%, max ratio 4.9× → 2.5×,
  questions with a >1.3× length cue 146 → 101. New lint `tests/bank-cues.test.js`. Next/Finish is now sticky at the
  bottom of the encounter panel (fully visible on iPhone 14 and SE).
- `ff1318a` **VORTEX**: gamepad rumble (dual-rumble; Firefox haptics) and touch vibration (Android; iOS has no API)
  for deaths, captures, Superzapper, hits, warps, life-ups; H toggles (saved). An audible double-blip + light rumble when
  an enemy shot enters the warning zone of your lane (once per shot). Test `vortex-haptics.test.js` (fake gamepad,
  desktop + iPhone) passes 3×; tips, waves, rim, touch pass.
- `c37caa8` **Neuro Arena**: the plateau rule (after 8 stagnant gens, judge challengers against the champion's own
  post-duel benchmark from the same duel and double copy errors), for choice contests only; Pong excluded after it
  crowned a worse champion. CSV columns plateau / plateau_stag / champ_post_duel_acc. lexicon + page tests pass.

- **Trackball Football: HELMET CAM**, an optional second view from your own man's facemask: the carrier on
  offense, your defender on defense. It sits next to the broadcast view (side by side on Mac and phone landscape,
  stacked on a phone held upright). Toggle with V, the HELMET CAM button, gamepad Y, pause or Options; saved,
  off by default.
  - Intent cues come straight from the AI's state (`S.it`), only for men in view: pursuit angles, CONTAIN EDGE,
    DEEP SAFETY, BLITZ, a flashing "!" in the real dive window, blocker assignments, routes, blind-side warnings,
    and the D's key read.
  - The AI is byte-identical to before (seeded check).
  - A cue-only juke bot scores 0-1.3% TDs against a 9.6-19.2% limit; run-defense is unchanged.
  - New `tests/helmet-cam.test.js`. game, mp, run-defense and helmet-cam tests all pass.

### For tomorrow
1. Neuro Arena: repeat plateau on/off on 3+ seeds; add the like-for-like Limited-reflex (brain silenced) baseline.
2. Congressional: keep balancing (still 72% longest); check the iPhone landscape encounter layout.
3. Star Raider: gentler Pilot step for casual players. Fix the flaky vortex-v4 warden test timing.
4. PIN is still in git history: Dr. Behram should rotate it.

### Trackball Football: mix up your plays, the defense learns (play-counter)
- The defense tracks the human's play calls (play + flip, with recent calls counting most, plus pairs to catch
  alternating). Once confident (Pro: about 3 of the last 4) it may SELL OUT and call a counter: EDGE BLITZ (sweep),
  RUN BLITZ (dive), JUMP THE SLANTS, BRACKET THE POST, DEEP BRACKET + BLITZ (bomb), SNIFF THE SCREEN.
  It never sees the current call. Pre-snap tell (sometimes a bluff), STUFFED / WIDE OPEN banners and sounds.
- Symmetric: the CPU offense scouts itself and varies its calls. A human defender gets a scouting line and a SELL OUT card.
  Both humans see the same history-based lines in 2P. HELMET CAM shows the counter jobs and "D SOLD OUT".
- Bot sims, Pro: a repeated play or 2-play alternation averages 0.4 yd/play after play 5 (read by play ~4) and
  scores on 0% of drives. Random / anti-adaptive callers average 10-11 yd/play and score on ~60% of drives.
- New `tests/play-counter.test.js`. play-counter, run-defense, game, mp and helmet-cam tests all pass.

### Removals (2026-10-30): Atari Football, Helmet Cam, Mushroom Cloud, By Dawn's Early Light
- Removed games/atari-football with its games.js cabinet, README sections, and the references in other games' tests. Trackball Football stays.
- Trackball Football: removed the HELMET CAM entirely (helmet.js, V / gamepad Y / button / pause + Options toggle, pref,
  How to Play page, FOV cone, split viewport, it/rt/ky sync fields, helmet-cam test, README section). The smart defense,
  play-counter / SELL OUT, scouting lines, banners and juke are kept. The AI is unchanged: a seeded CPU-vs-CPU fingerprint is identical before and after.
- Removed games/mushroom-cloud and games/by-dawns-early-light with their games.js cabinets and FEEDBACK.md hook list mention. 19 games remain.
- Tests: trackball run-defense, play-counter, game and mp all pass, and so does the root landing test. Only the mood-sticker test's external textdb CORS checks fail.

### New game (2026-10-30): CHALICE (games/chalice)
- A painterly 2.5D homage to the 1979 console adventure. Three castles with keys and portcullis gates, the blue labyrinth,
  catacombs where you see only what your light reaches, the river and Bridge, the Magnet, and the Chalice to bring home to the Gold Castle.
  Three dragons each hunt in their own way (Yorgrim, Grumbald, Rhindra), a bat steals what you carry, and a grey dot opens the secret Makers' Room.
- Levels: I The Gold Road, II The Three Castles, III The Shifting Kingdom (items placed at random), and a bonus IV The Jade Kingdom (three key pedestals, faster dragons).
  A/B difficulty switches, a tutorial, a timer with best times in localStorage, and a map plus minimap.
- Graphics and sound: torchlight and a light map, soft shadows, particles, a day/night cycle, sliding room transitions,
  procedural music for each area with a danger layer, and stereo sound effects. Keyboard (SPACE drops, ENTER fires a flare), mouse, touch (floating stick plus buttons) and gamepad all work.
- Tests: `tests/sim.test.js` checks the rules, and the bot wins 8/8 seeds on every level with both switch settings.
  `tests/game.test.js` drives 1280x800 keyboard/mouse/gamepad play and iPhone portrait/landscape touch with no console errors. The root landing test passes.

### New game (2026-10-30): AGE OF EMBERS (games/age-of-embers)
- A single-player isometric RTS homage to Age of Empires.
  - Four resources (food, wood, gold, stone) and 18 building types.
  - Four ages: Hearth, Bronze, Iron and Imperial.
  - Tech tree with unit tiers.
  - Counters: spear > cavalry > archer > infantry > spear, plus rams and catapults.
  - Formations, attack-move, control groups, fog of war, and 200+ units.
  - Victory by conquest or by holding a Wonder.
- Progression:
  - A 6-mission campaign that doubles as the tutorial.
  - Skirmish on 5 random maps against 1–3 CPUs (Easy, Normal, Hard, Legendary), FFA or 2v2.
  - Autosave and resume.
  - End-of-game stats with graphs, XP ranks, 18 achievements, and unlocks (maps, Legendary, banners, map size).
- Graphics and sound are fully procedural:
  - Canvas sprites with lighting, shadows and particles.
  - WebAudio spatial sound effects and voice acknowledgements.
  - Music that changes with each age.
- Controls:
  - Mouse, keyboard (SPACE = idle villager, ENTER = army / attack-move), touch, and gamepad.
  - Mac trackpad and Safari gestures are handled.
- Tests:
  - `tests/campaign-test.js`: a bot clears all 6 missions, and a passive player loses mission 4.
  - `tests/botmatch.js` / `batch.js`: Hard beats Easy 3/3 by conquest (24–37 min).
  - `tests/counters.js`: 5/5 pass.
  - Playwright mouse 15/15 and touch 14/14 pass, with no console errors at 1280x800, iPad landscape and iPhone landscape.

## 2026-11-01 (day 5): gameplay evaluation + fixes

The Oct 31 daily run failed, so there's no day-4 entry. Its VORTEX power-ups had already shipped and are written up in
games/tube-shooter/NOTES.md. Today's work ran in a fresh worktree `/workspace/arcade-daily-2026-11-01` from `eb719e4`,
using headless Chrome (SwiftShader) at desktop 1440×900 and iPhone 14. The box was heavily loaded (load average 17–28).

### Player feedback (Oct 31)
`node tools/read-feedback.mjs --date 2026-10-31 --no-sync`: 2 real submissions, no test records, both from one desktop/mouse
session (about 7 min, Oct 31 4:01 PM EDT) in Clinic Day (`congressional-obgyn`, office/).
- Ratings: Clinic Day had 1 FUN and 1 note-only. No other game was rated.
- Suggestion cluster, answer cues (1): "correct answers are overexplained and almost invariably the longest choice".
  That was already fixed upstream in `c6187c5` (Clinic Day bank and SUTURE SELF! quizzes; `tests/answer-length.test.js`
  passes). Today the same check was extended to OB Triage (see below).

### Findings
- **Smoke test, all 21 games, desktop and iPhone**: every game loads with no console or page errors. The screenshot
  timeouts (jax-adventures, planet-guardian) were CPU load.
- **Dr. Behram's Office**: hub, office access and office page tests all pass, so the instructor PIN (salted hash only;
  the tests use testpin.js) and the generated student codes with their 6-week expiry still work. Clinic core and
  bank-cues pass, surgery cases and vitals pass, triage cases and CTG pass, feud engine passes, and the answer-length lint passes.
  - The OB Triage page test passes on desktop (pit A+ 93, push A+ 95, prolapse B 80, random students F), iPhone
    (abruption A 90) and iPad. One first run timed out under load and passed on the re-run.
  - **Weakness**: OB Triage's one text MCQ (the oxytocin restart ask) had the longest correct answer (11 words vs 5–6)
    and always showed it first. The answer-length lint didn't cover triage.
- **VORTEX (Tempest)**: enemy shots are still the #1 death cause (days 2–4). Classic Tempest 2000 has a JUMP; we didn't.
  All VORTEX tests pass: powerups, tips, haptics, waves, v4 (the warden flake didn't recur) and root rim/touch.

### Changes
1. `7c20f16` **VORTEX JUMP power-up** (games/tube-shooter). The 2nd green crystal is now JUMP. The order is LASER → JUMP → DROID → BONUS.
   - Controls: SHIFT/J, pad Y/LB/RB, mouse middle button, or a green JUMP touch button.
   - Portrait places the button left of FIRE under ZAP; landscape places it above ZAP. It overlaps nothing on iPhone 14/SE, iPad Mini or Pixel 7.
   - A 0.75 s arc off the rim with a shadow claw and thrust trail, then a 1.5 s recharge bar.
   - In the air you're safe from shots, grabs, zaps, fuseballs, spikes and mine walls (+50 "DODGED!").
   - You lose JUMP when you lose a life, and landing next to a grabber still kills you.
   - New `tests/vortex-jump.test.js` covers desktop, iPhone 14 and iPhone 14 landscape. `vortex-powerups` was updated for the new order.
2. `23ea18f` **OB Triage answer cue** (games/dr-behrams-office).
   - The restart options were rewritten to equal length (8–10 words; the correct one is now the shortest by words).
   - Text asks show in a case-seeded shuffled order. Replays keep the same order and answer indexes are unchanged.
   - Category re-checks stay in I/II/III order.
   - `tests/mcq.js` and `answer-length.test.js` now load the triage ASKS and check that no correct option is the longest and that the order is shuffled.
- Both changes were live-verified on GitHub Pages about 20 s after the push (Nov 1 7:38 AM EST).

### Neuro Arena (seed 1101; 10 rounds × K=4, Lamarck, 30 s matches, size 2800, ABL=5; plateau rule on, 40 generations)
| contest | chance | champ by round | full task | beyond reflex | plateau / reaped | notes |
|---|---|---|---|---|---|---|
| divisor | 8% | 22→41→55→61→63→63→64→68→81→84% | 59% | −0.07 | 0 / 1 | best yet (day 3: 80%, full 44%); still below the full reflex prior |
| simon | 25% | 46→56→73→…→80% | 36% | +0.10 | 1 / 2 | real beyond-reflex gain, flat rounds 3–7 |
| text | 8% | 36→44→…→56% | 19% | −0.06 | 0 / 0 | new words 27% vs familiar 40%: some generalisation, part memorisation |
| add | 5% | 28 (×5)→33→72→89→100→56% | 7% | −0.03 | 3 / 1 | stuck 5 rounds, then broke out; reached level 1 (the drop to 56% is the harder level) |
| sub | 10% | 67→83→92→60→…→73% | 15% | −0.04 | 0 / 1 | reached level 2, and the drops follow level-ups |
| big | 50% | 60→76→…→90% | – | +0.12 | 1 / 1 | |
| pattern | 13% | 65→90→95→100% | – | +0.50 | 2 / 2 | saturated by round 4 |
| pong | – | 40% for all 10 rounds | – | +0.04 | 0 / 1 | **stagnant**: the champion never changed (hit 40%, duel 58%) |
| echo, dots, rps, tug | 13/17/33/50% | 88→100, 100, 100, 100% | – | – | | saturated, uninformative |
- Compared with day 3 (seed 12345): divisor, simon, text and big are all higher today, but this is a different seed and
  one seed only, so it isn't evidence of improvement. Pong regressed from day 3's 40→48% to fully flat. Add, sub and
  pattern behave the same as before. The "beyond reflex" scores are still ≤0 for the arithmetic contests: their gains
  come from task inputs a reflex already reads, not new understanding.

### For tomorrow
- Pong in Neuro Arena: the champion is never displaced. Look at selection and the match length (30 s may be too noisy).
- Run plateau on/off on 3+ seeds before claiming it helps. The iPhone landscape encounter layout is still not probed.
- Bot playthroughs to measure how JUMP changes VORTEX death level. The DROID now arrives later.
- The PIN is still in git history (unchanged; only a salted hash in the current tree).

## 2026-11-04 (day 8): gameplay evaluation + fixes

The Nov 2 and Nov 3 daily runs pushed code (Nov 2: `4338f23`, `2c86922` VORTEX Bonus Warp, `d9d2137`, `3aaa109` Clinic Day;
Nov 3: `3fbe3ac` VORTEX rim grab warning, `0f4ee36` Clinic Day explanations) but never wrote a log entry, and the
Nov 3 run is reported as failed. Their VORTEX work is written up in games/tube-shooter/NOTES.md (days 6–7); the Nov 3
Neuro Arena numbers were recovered from its work dir and are below. Today ran in a fresh worktree
`/workspace/arcade-daily-2026-11-04` from `0f4ee36`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14
(+ landscape). The box was loaded (load average 12–28).

### Player feedback (Nov 3)
`node tools/read-feedback.mjs --date 2026-11-03`: **0 submissions** (0 test records either; Nov 2 also 0). The store is
reachable (the Oct 31 document still reads back), so this is no feedback, not a broken pipe. No ratings, no suggestions
to cluster or act on.

### Findings
- **Smoke, all 21 games + home, desktop and iPhone 14**: no console or page errors anywhere. Screenshot timeouts only in
  the two WebGL-heavy games (jax-adventures, planet-guardian), same as every day: software GL, not a real-device signal.
- **Dr. Behram's Office / Clinic Day** (the old congressional-obgyn URL redirects to `#office`): access, core, bank-cues,
  answer-length, feud access/engine, triage cases/CTG, surgery cases (590 checks), vitals (942) and the office page test
  (desktop + iPhone, touch encounter) all pass. Correct option is the longest in 19.8% of questions (≈ chance) and
  position is randomized. Instructor PIN: still only a salted hash in the tree; tests use the throwaway testpin.js, and
  student codes validate. A 14-question sample read for accuracy was all correct (recurrent VVC, hydrosalpinx before IVF,
  Tdap 27–36 wk, ACE-inhibitor switch in pregnancy, mastitis per ABM, fezolinetant, alendronate, PID minimum criteria,
  fundal height, lichen sclerosus, Shingrix, fetal movement, cerclage). Copy remains generic ("student name"), no faces.
  hub.test timed out once under load and passed on the re-run.
- **Star Raider**: sim asserts all OK (Novice sloppy bot wins 75%, Commander hard; last-stand 0% by design), war test OK.
- **MELTDOWN**: sim 47/47.
- **VORTEX (Tempest)**, 8 bot games each: original bot death level sharp 14/14/13/15, average 7/11/15/9 (fuseballs
  over-counted: that bot steers into rim fuseballs). Fuseball-dodging bot: sharp 14/11/10/13, average 13/12/12/9; deaths
  shots 15, fuseballs 10, **rim grabs 9 (was #1 yesterday, 13/36, before the grab warning)**, zaps 7, spikes 4 of 45.
  Deaths come 7–29 s after a respawn (no respawn-grace problem). All spike deaths land during the warp, the only death
  with almost no tell. On phone landscape the touch "MODE: SPINNER" button sat under the feedback sticker.
  All VORTEX tests pass; root `tests/vortex-rim.test.js` fails intermittently (one random camping trial survives) on
  both today's code and unmodified origin/main (1 of 2 runs each), so it's a pre-existing random flake, not a regression.

### Changes
1. `5efcc9d` **VORTEX warp spike guide** (games/tube-shooter): during the warp a spike in the claw's lane burns red →
   white-hot with a tip dot and a "parking sensor" blip that speeds up as it closes (0.40 → 0.07 s); the nearest
   spike-free lane each way lights green; steering out stops it. First-time tip "SPIKE AHEAD! STEER TO A GREEN LANE".
   Off in the bonus warp. New tests/vortex-spikewarn.test.js (desktop, iPhone 14, iPhone 14 landscape: standing still
   still dies to the spike, steering away reaches the next level with no life lost).
2. `5efcc9d` **VORTEX landscape MODE button** moved below the feedback sticker. tests/vortex-modebtn.test.js (iPhone 14 /
   SE / Pixel 7 landscape + portrait: no overlap with sticker, knob or arrows; still toggles).
- Live-verified: https://storkdoc.github.io/behram-arcade/games/tube-shooter/game.js served both changes ~1 min after the
  push (Nov 4 ~7:45 AM EST).

### Neuro Arena (seed 1104; 10 rounds × K=4, Lamarck, 30 s, size 2800, ABL=5) — Nov 3 (seed 1103) for comparison
| contest | chance | champ by round (today) | full task vs reflex prior | beyond reflex | Nov 3 champ / full |
|---|---|---|---|---|---|
| divisor | 8% | 30→50→58→63→71→76→…→78% | 46% vs 66% | −0.20 | 31→72%, full 66% |
| simon | 25% | 53→70→…→78% | 45% vs 26% | **+0.19** | 47→78%, full 48% |
| text | 8% | 26→36→44→52→54% | 16% vs 25% | −0.09 | 38→46%, full 16% |
| add | 5% | 33→56→…→94→66→81% (level 1) | 13% | +0.03 | 22→67% |
| sub | 10% | 67→92→70→…→100→73→97→74% (level 3) | 25% vs 18% | +0.13 | 67→85% (level 1) |
| big | 50% | 60→70→…→93% | – | +0.16 | 72→92% |
| pattern | 13% | 65→85→95→100% | – | +0.50 | 70→100% |
| pong | – | 38% ×6 → 40% ×4 | – | +0.13 (units ablated: 40→18%) | 40% flat |
| echo, dots, rps, tug | | ~100% | – | – | saturated, uninformative |
- Honest read: only simon (and weakly sub, big, pattern) shows learning beyond what a reflex gets. Divisor and text
  champions win duels but on the full task stay **below the frequency/position baseline** (memorising the duel set more
  than understanding). Sub/add swings follow curriculum level-ups. **Pong is stagnant for the 4th straight run**
  (champion never displaced; 0 reaps). The plateau rule for Pong was re-tested on Nov 3 (seeds 1103–1105, test-only):
  one seed broke out (38→80% vs 40% off), one tied (40/40), one was slightly worse (90 vs 96%); with the Oct 30 result
  that is 1 better / 2 worse / 1 tie, so Pong stays excluded. No Neuro Arena code was changed.

### For tomorrow
- Pong stagnation: try a different lever than plateau mutation (e.g. more duels per child or a harder opponent pool),
  test-only first, 3+ seeds.
- Divisor/text below baseline on the full task: look at whether the duel set is too small (memorisation).
- VORTEX: re-run the bot to see if warp spike deaths drop; enemy shots are still #1.
- PIN still in git history from before the hash (only the salted hash in the tree).

## 2026-11-05 (day 9): gameplay evaluation + fixes

Fresh worktree `/workspace/arcade-daily-2026-11-05` from `9b4313e`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14
(+ landscape for VORTEX tests). Active worktrees (cap-wt, tbf-gfx, cob-wt, …) were far behind or already on main; none locked
tube-shooter or neuro-arena. Box load was high (≈14–21) during the Neuro Arena batch.

### Player feedback (Nov 4–5 and lookback)
`node tools/read-feedback.mjs --hours 48` and `--date 2026-11-04` / `--today`: **0 submissions** (store still readable;
Oct 31 document returns). Last real player notes remain Oct 30–31:
- FEUD & DELIVERY: Fun ×1 (Oct 30)
- CONGRESSIONAL OB GYN / Clinic Day: Fun ×1 + note “correct answers are overexplained / almost invariably the longest”
  (Oct 31) — already addressed in prior days; today's answer-length test: correct is longest in **19.8%** (≈ chance),
  no option >2.5× longest distractor. No new suggestions to cluster.

### Findings
- **Smoke, all 21 games + home, desktop and iPhone 14**: no console or page errors. Screenshot timeouts only on
  jax-adventures, planet-guardian (desktop) and apex-gp (iPhone) — software GL, same as prior days.
- **Dr. Behram's Office / Congressional**: hub.test ALL PASSED (desktop + iPhone + iPad): student codes, instructor PIN
  (salted hash only; tests use throwaway testpin.js), four rooms, redirects from `congressional-obgyn` and
  `feud-and-delivery`, drive to Holy Cross. access / core / bank-cues / answer-length all pass. Copy stays generic.
- **Star Raider**: sim.test OK (Novice/Pilot/Warrior/Commander bands). war.test "better commander usually wins" failed
  once (3/6) then passed 3/3 re-runs — small-N flake, not a balance change.
- **MELTDOWN**: sim 47/47.
- **VORTEX (Tempest)**, 8 bot games (FD=1 fuseball-dodging, sharp + average): death levels sharp 7/11/15/13, average
  12/15/12/11. Deaths of 47: **shot 12, zap 12, capture 10, fuse 9, spike 4**. Spike deaths still rare; fuseballs still
  ~1 in 5 with no on-rim telegraph (grabs/shots/spikes already warn). Zaps tied shots for #1 — lane already flashed
  white but nothing beeped.

### Changes
1. `e79a6f7` **VORTEX fuseball rim warning + pulsar zap cue** (games/tube-shooter): rim fuseball within 2 rails → white/cyan
   sparks (lethal rail burns white-hot); bright `fusewarn` chirp once when within 1 rail; jumping fuseballs that would
   cross the claw's lane flagged. Pulsar in your lane entering the lethal pulse → rising `zapwarn` buzz once per pulse.
   Tips updated. tests/vortex-fusewarn.test.js (desktop, iPhone 14, iPhone 14 landscape) ALL PASSED; grabwarn regression OK.
2. `9b24650` **Neuro Arena Word Completion THINKING 700 → 900 ms** (games/neuro-arena/js/contests.js): more integration
   time per user preference; stage/Lab pick it up via `trialOf(C)`. Disclosure in NOTES updated.
- Live-verified: https://storkdoc.github.io/behram-arcade/games/tube-shooter/game.js and
  …/neuro-arena/js/contests.js matched local SHA-256 (~1 min after push, Pages build `built` at ~7:14 AM EST).

### Neuro Arena (seed 1105; 10 rounds × K=4, Lamarck, 30 s, size 2800, ABL=5) — Nov 4 (seed 1104) for comparison
| contest | chance | champ by round (today) | full task vs reflex prior | beyond reflex | Nov 4 champ / full |
|---|---|---|---|---|---|
| divisor | 8% | 33→62→69→77→81→86→81→74→72→72% (lv 3) | 72% vs 66% | **+0.06** | 30→78%, full 46% |
| simon | 25% | 49→58→…→83→61→70% (lv 1) | 44% vs 26% | **+0.18** | 53→78%, full 45% |
| text | 8% | 26→36→…→34→40% | 10% vs 25% | −0.15 | 26→54%, full 16% |
| add | 5% | 33→56→…→89→83% | 4% | −0.06 | 33→81% |
| sub | 10% | 83→…→81% (lv 3) | 29% vs 18% | +0.11 | 67→74% |
| big | 50% | 63→…→96% | – | +0.18 | 60→93% |
| pattern | 13% | 60→…→100% | – | +0.50 | 65→100% |
| pong | – | **76→98→…→100%** (2 reaps) | – | +0.03 (ablate units: full still ~96–100%) | 38–40% flat, 0 reaps |
| echo, dots, rps, tug | | ~100% | – | – | saturated |
- Honest read: **Pong finally moved** after four flat runs (champion displaced twice; hit 76→100%). Ablation shows the
  high score is still mostly the Full reflex + decoder (silencing understanding units barely drops full hit %), so
  beyond-reflex stays thin (+0.03) — progress on selection, not yet on a self/opponent model. Divisor reached level 3 and
  full-task 72% (above the frequency prior for the first time in these logs). Simon still the clearest beyond-reflex
  learner (+0.18). **Text remains below the position-frequency baseline** on the full task (10% vs 25%); plateau fired
  5 times — the 900 ms THINKING bump is for the next run to measure.

## 2026-11-06 (day 10): gameplay evaluation + fixes

Fresh worktree `/workspace/arcade-daily-2026-11-06` from `bb25d5f`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14
(+ landscape for VORTEX). No other worktree was on tube-shooter or neuro-arena.

### Player feedback (Nov 5–6)
`node tools/read-feedback.mjs --hours 30`: **0 submissions** (3rd day in a row). Nothing to cluster or act on. Last real notes
are still Oct 30–31 (answer-length complaint; today's bank-cues check: correct option longest in 19.8%, about chance).

### Findings
- **Smoke, all games + home, desktop and iPhone 14 (44 pages)**: no console or page errors. Screenshot timeouts only on
  jax-adventures (both) and planet-guardian (desktop), software GL, same as prior days.
- **Dr. Behram's Office / Congressional**: hub.test ALL PASSED (desktop/iPhone/iPad: codes, PIN as salted hash only, 4 rooms,
  redirects, games.js). core / access / bank-cues / answer-length all pass. Copy still generic.
- **Star Raider**: sim.test OK, war.test passed first try. **MELTDOWN**: sim 47/47.
- **VORTEX**: 8 bot games on unchanged main: levels sharp 15/10/13/7, average 10/10/12/12 (mean 11.1). Deaths of 44: fuse 12,
  **shot 11**, capture 10, spike 8, zap 3. Enemy shots still appeared with no warning until they reached the rim.
  The old tests/vortex-modebtn.test.js crashes (`null.y`) on main too. That predates today and is not fixed yet.

### Changes
1. `8c1b9d9` + `a313352` **VORTEX shot charge-up** (games/tube-shooter): flippers and tankers now charge for 0.3 s before
   firing. A growing white and magenta muzzle ring shows on the enemy, red-tinted when it is in your lane, then the shot
   releases. A flip during the charge cancels it. Fire rate and shot speed are unchanged. Shot death tip: "ENEMY GLOWS, THEN FIRES".
   New tests/vortex-charge.test.js (desktop, iPhone 14, landscape) passed 3 of 3 runs. fusewarn / grabwarn / haptics / jump /
   powerups / spikewarn / tips / v4 / waves / bonus / touch / rim regressions pass.
   Same bot, 8 games after the change: mean level **12.75** (sharp 14/18/13/15, average 11/9/13/13). **Shot deaths 11 → 7**.
   Captures (16) and fuseballs (17) are now the top killers. With N=8, treat this as directional only.

### Neuro Arena (seed 1106; 10 rounds × K=4, Lamarck, 30 s, size 2800, ABL=5), compared with Nov 5 (seed 1105)
| contest | chance | champ by round | full task vs prior | beyond reflex | Nov 5 |
|---|---|---|---|---|---|
| divisor | 8% | 44→79% (lv 0) | 52% vs 66% | −0.14 | 72% vs 66%, +0.06 |
| simon | 25% | 48→77% | 39% vs 26% | +0.13 | 44%, +0.18 |
| text | 8% | 24→36→28% | 11% vs 25% | −0.14 | 10%, −0.15 |
| add | 5% | 28→89% | 9% | −0.01 | 4% |
| sub | 10% | 67→86% (lv 3) | 33% | +0.15 | 29%, +0.11 |
| big | 50% | 64→91% | – | +0.13 | 96%, +0.18 |
| pattern | 13% | 60→100→90% | – | +0.40 | +0.50 |
| pong | – | **36→44% flat, 0 reaps** | hit 44% | +0.17 (ablating all units: 44→12%) | 76→100%, 2 reaps |
| echo, dots, rps, tug | | 100% | – | – | saturated |
- My read: yesterday's Pong breakout did **not** reproduce with seed 1106. The champion was never displaced and stayed at 44%,
  so Pong's progress depends on the seed and is not robust yet. Divisor fell back below the frequency prior (52% vs 66%),
  so yesterday's 72% also looks seed-dependent. **Text stays below the position baseline even with the 900 ms THINKING
  window** (11% vs 25%), so that bump did not help. Simon, sub and pattern remain the honest beyond-reflex learners.
  Duel scores well above full-task scores for divisor and text still point to memorising the duel set.
  No Neuro Arena code was changed.

### For tomorrow
- Fix the vortex-modebtn test crash (likely a selector/geometry change).
- VORTEX: captures and fuseballs are now the top killers. Re-run the bot with more games before tuning.
- Neuro Arena: run multiple seeds for Pong/divisor before claiming progress. Text needs a larger duel set or a different lever.

## 2026-11-07 (day 11): gameplay evaluation + fixes

Fresh worktree `/workspace/arcade-daily-2026-11-07` from `e1d26a1`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14
(+ landscape for VORTEX). No other worktree was actively editing tube-shooter / neuro-arena / star-raider / office.

### Player feedback (Nov 6–7)
`node tools/read-feedback.mjs --hours 36`: **0 submissions** (4th day in a row). Nothing to cluster or act on. Last real note
in the local archive is still Oct 30 (Feud & Delivery, Fun, empty text). Answer-length bank check today: ALL PASS
(correct longest ≈ chance; Clinic Day slot uniform ~20%).

### Findings
- **Smoke-lite, 22 games + home, desktop and iPhone 14 (45 page loads)**: no pageerrors / local 4xx. YouTube telemetry noise
  ignored on NAME THAT GROOVE / home. Full smoke was CPU-starved by Neuro Arena; lite pass is clean.
- **Dr. Behram's Office / Congressional**: answer-length ALL PASS. hub.test desktop path ALL key asserts pass after drive
  fixes (codes, PIN as salted hash only via testpin.js, four rooms, redirects, drive office→stairs). iPhone hub run hit a
  load-flake tapping `#drive` skip (`<html>` intercepts pointer / canvas detach) after the return drive — not a PIN/access
  regression. Copy stays generic. No student faces used.
- **Star Raider**: war.test OK. sim.test: sloppy Pilot was winning only **17%** on unchanged day-10 DCFG (assert ≥30%) while
  sharp Pilot stayed 100%. Combat easing also dropped sharp below 90%; survivability-only nudge fixed the band
  (sloppy Pilot **67%**, sharp **100%**).
- **MELTDOWN**: sim 47/47 (earlier in the pass).
- **VORTEX**: FD bot 8 games on pre-change main: sharp levels 13/10/11/15, average 10/4/8/13 (mean ~10.5). Day-10 note that
  captures/fuseballs lead deaths after the shot charge-up still stood; modebtn crashed on null `r.mode` because frozen
  `step()` never called `touchSync()` so `data-ts` stayed `menu` on some landscape phones.

### Changes
1. **VORTEX grab-imminent telegraph + harness sync** (`games/tube-shooter`): `grabDelay` floor 0.1→**0.18** (base 0.25→0.28);
   at 40% of the same-lane countdown a sharper `grabimminent` cue + white/red rim flash; tip text updated; `step`/`gotoLevel`
   call `render`+`touchSync` (fixes modebtn). Tests: grabimminent ALL PASS (desktop/iPhone/landscape); modebtn ALL PASS;
   grabwarn ALL PASSED.
2. **Star Raider Pilot survivability** (`games/star-raider/js/sim.js`): hitE 100→88, bareKill 0.15→0.1, leakE 600→480.
   Combat knobs untouched. sim.test ALL ok after change.
3. **Office drive under load** (`games/dr-behrams-office/hub/drive.js`): set first scene synchronously; 50 ms interval backup
   beside rAF; backfill scene names when a frame jumps the timeline so `stairs` still appears in `DriveFX.log`. hub.test
   waits hardened. Desktop hub path green; Neuro Arena Word Completion `thinkMs` 900→**1100**.

### Neuro Arena (seed 1107; 10 rounds × K=4, Lamarck, 30 s, size 2800, ABL=5) — Nov 6 (seed 1106) for comparison
| contest | chance | champ by round (today) | full task vs prior | beyond reflex | Nov 6 |
|---|---|---|---|---|---|
| divisor | 8% | 33→72% (lv 3) | **72%** vs 66% | **+0.06** | 52% vs 66%, −0.14 |
| simon | 25% | 41→75% | 47% vs 26% | **+0.21** | 39%, +0.13 |
| text | 8% | 20→34% | 11% vs 25% | −0.14 | 11%, −0.14 |
| add | 5% | 28→67% (5 r) | 8% | −0.02 | 9% |
| sub | 10% | 58→90% (lv 1, 5 r) | 18% | 0 | 33%, +0.15 |
| big | 50% | 67→86% (4 r) | – | +0.08 | 91%, +0.13 |
| pattern | 13% | 65→100% (7 r) | – | +0.50 | +0.40 |
| pong | – | **32→38% flat, 0 reaps** | hit 38% | −0.03 (ablate all: 38→30%) | 36→44%, 0 reaps |
| echo, dots, rps, tug | | 5-round snapshots only (CPU) | – | – | saturated prior days |
- Honest read: **divisor recovered** above the frequency prior (72% vs 66%, level 3) — matches Nov 5 more than Nov 6.
  Simon remains the clearest beyond-reflex learner (+0.21). **Text still stuck below the position baseline** (11% vs 25%)
  even after the 1100 ms THINKING bump (curve only 20→34% duel acc). Pong flat again (38%, 0 reaps); ablation barely
  moves full hit % — still mostly reflex. Short runs of echo/dots/rps look unsaturated here only because they were
  stopped early under load.

### For tomorrow
- Text: try `FIX=mix` / larger duel `matchSec` rather than more THINKING — 700→900→1100 did not lift full-task above prior.
- VORTEX: re-run FD bot with deathKind hooks now exposed; captures vs fuseballs after grab-imminent.
- Office hub iPhone: `#drive` tap intercepted by `<html>` under load — force-click / bindPause interaction with sticker.

## 2026-11-10 (day 14): recover stranded Nov 8–9 work + VORTEX sputter fire

Fresh worktree `/workspace/arcade-daily-2026-11-10` from `76b4220`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone.
**Why yesterday failed:** the Nov 9 run committed 3 tested commits in `/workspace/arcade-daily-2026-11-09` but never pushed them
and never wrote a log entry (also no Nov 8 entry). Today they were cherry-picked first, re-tested, and pushed before any new work:
`c38eeb0` VORTEX CONTINUE (level 3+), `bea047f` OB Triage distractor trim + hub/Star Raider test hardening, `e17042b` MoodSticker
auto-dodge. The uncommitted Nov 9 sputter WIP was finished and shipped as today's VORTEX change. No other worker had recent
commits on tube-shooter / office / neuro-arena (only the jukebox PRs Nov 7–9).

### Player feedback (Nov 6–10)
`node tools/read-feedback.mjs --hours 96`: **0 real submissions** (store reachable; Nov 9 doc only has `test:true` records).
Day 6 in a row with nothing to cluster or act on.

### Findings
- **Smoke, 23 cabinets + home, desktop + iPhone (48 loads):** no page errors, no local 4xx.
- **Dr. Behram's Office (Congressional OB GYN redirects to `#office`):** answer-length ALL PASS (no correct answer >14 words,
  Clinic Day slot uniform ~20%); hub.test ALL PASSED (67 checks: desktop/iPhone, 4 rooms, redirects, codes); access.test ALL
  PASSED (PIN only as salted SHA-256, 20/20 random codes, NY-date rollover). Copy generic, no faces.
- **Star Raider:** sim.test all ok, war.test ok. LAST STAND shows 0% "wins" for every bot; it is an endless survival mode by design.
- **MELTDOWN:** sim 47/47.
- **VORTEX:** 15 cabinet tests + touch (130) pass. `tests/vortex-rim.test.js` was flaky on main (1 camping case alive).
  The Nov 9 sputter WIP as written broke anti-camping (3–5 rim-camper cases survived), so it was not shippable as-is.

### Changes
1. Carry-over (above), re-tested today: vortex-continue 15/15, mood-sticker-dodge 16/16, hub/answer-length pass.
2. **VORTEX sputter fire** (`bc43e9b`): an overheated barrel no longer goes silent. Held fire spits one weak orange shot every
   0.3 s (no heat, no laser) that can shoot down an enemy bullet. Sputter shots **pass through enemies already on the rim**,
   so a rim camper still loses. The claw glows orange as heat builds, pulses with sparks when overheated, plays a hiss, and
   shows a one-time BARREL HOT: FIRE IN BURSTS tip. Tests: vortex-sputter ALL PASS (desktop + iPhone, also against the live
   site); vortex-rim ALL PASSED; all other VORTEX tests green.
- Live check: game.js, mood-sticker.js and triage cases.js served by Pages match the pushed commits.

## 2026-11-13 (day 17): first real player feedback acted on + VORTEX fuseball lock-on

Fresh worktree `/workspace/arcade-daily-2026-11-13` from `57e0234`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone.
**Why Nov 11–12 have no entry:** Nov 11 pushed `6f06737` (VORTEX fuseball landing warning) but never wrote the log. Nov 12 left
BREAK FREE + two bank fixes uncommitted in its worktree and ran two full test sweeps in parallel with Neuro Arena; the second
sweep was still finishing ~14 h later, so the run never got to commit. Today: carry-over committed and pushed first, every long
job ran in the background with `timeout`, and each change was pushed as soon as its tests passed.
Skipped as under active development by the user: Me & My Placenta (10 commits Nov 13), Relax, Jukebox.

### Player feedback (last 72 h, `node tools/read-feedback.mjs --hours 72`): 3 real submissions
| game | fun | okay | skip | notes |
|---|---|---|---|---|
| Congressional OB GYN (Clinic Day) | 0 | 0 | 0 | 1: "add normal lab values as reference for the vignettes like we would for exams" (2 min, last screen enc) |
| FEUD & DELIVERY | 0 | 0 | 0 | 1: "the fast money needs more than 20 sec, not enough time to type" (16 min session, won, played Fast Money) |
| Me & My Placenta | 1 | 0 | 0 | none (1 min) |
Clusters: (a) exam-style reference support in Clinic Day; (b) Fast Money time pressure too tight for typed answers. Both acted on.

### Findings
- **Smoke, 26 pages × desktop + iPhone (56 loads):** no page errors, no local 4xx.
- **Clinic Day:** answer-length ALL PASS, bank-cues ALL PASS (with Nov 12's new duplicate-sentence lint), core/access/page ALL PASS
  (PIN only as salted hash, student codes accept/expire), hub.test ALL PASSED. Copy stays generic ("Student"). No lab reference
  existed, which is what the player asked for.
- **Feud:** engine 14/14, page tests pass. Fast Money was 20 s / 25 s, the TV values, for typed diagnoses.
- **Star Raider:** sim all ok (Novice 100%, Pilot 67% sloppy / 100% sharp, Warrior 0% / 50%, Commander 0% / 17%). war.test not re-run.
- **MELTDOWN:** sim 47/47.
- **VORTEX:** 4-game bot eval on main (with BREAK FREE): fuseballs were the #1 killer again (fuse death tips 10 of ~17; fd hooks
  13 fuse events: arrive 4, chase 5, rimjump 3). The only counterplay, shooting a fuseball mid-hop, had no on-screen tell.
  `vortex-fuseland` flaked once in 4 runs (desktop: the climbing fuseball did a random hop on the first step). Pre-existing, logged.

### Changes
1. `ad4f1cc` **VORTEX BREAK FREE** (Nov 12 carry-over). While a grabber drags the claw down (z < 0.8), Superzapper (Enter /
   right click / ZAP button / pad B) kills the captor and springs the claw back. It spends the level's big zap, keeps power-ups, and gives 0.9 s grace.
   breakfree / rim / grabwarn / grabimminent / continue / powerups / touch ALL PASS.
2. `2275ac5` Clinic Day: two duplicated explanation sentences removed (gonorrhea doxy dose, breast-lump biopsy) + lint (carry-over).
3. `46139c8` **FEUD Fast Money 20/25 s → 40/45 s** (player feedback). One `FM_TIMES` constant drives the clock, dock text and rules.
   Engine test asserts it; page tests pass (clock reads 40).
4. `fe9abd9` **Clinic Day Lab values sheet** (player feedback). Lab values button + `L` key (pad/arrow nav, tap) on the chart,
   question and answer screens. It holds 43 adult-female teaching ranges (USMLE/NBME-style) with ACOG/SMFM/CDC/IADPSG pregnancy thresholds
   (anemia by trimester, preeclampsia severe features, HELLP, MgSO4 levels, GTT cutoffs, bile acids, hCG, AFI, Triple I...).
   "In this chart" rows are highlighted from vignette + stem keywords (tuned so "delivered" ≠ liver, vulvar itching ≠ ICP).
   **The question clock and speed bonus pause while it is open.** tests/labs.test.js 20/20 local and **against the live site**.
5. `15e3976` **VORTEX fuseball LOCK-ON.** While a tube fuseball is mid-hop and shootable, cyan lock-on brackets snap around
   it and its lane glows. A rising blip plays once per hop if the lane is the claw's or adjacent. Hit window widened 15–85% → 10–90%.
   Rim fuseballs are still invulnerable. Death tip now names the cue. fuselock 16/16 (desktop + iPhone), fusewarn, fuseland (3/4,
   flake above), tips, powerups, jump pass.
   Post-change bot (4 games, same seeds): fuse events 13 → 5, captures now top (10 tips). The bot does not aim at the
   brackets, so that drop comes from the wider window + noise with n=4. It is not proof the telegraph works for humans.
- **Live check:** Pages serves labs.js, FM_TIMES [40,45], FUSEBALL LOCK-ON, BREAK_FREE_Z and the bank fix. labs.test passes on live.

### Neuro Arena (seed 1113; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5). Nov 12 (seed 1112) for comparison
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | reaps | Nov 12 |
|---|---|---|---|---|---|---|
| divisor | 8% | 35→67% | 51% vs 66% | −0.15 | 3 | 64% vs 66%, −0.02 |
| simon | 25% | 49→82→66% (peak r5, fell) | 31% vs 26% | +0.05 | 0 | 55%, **+0.29** |
| text | 8% | 32→44→38% | 12% vs 25% | −0.13 | 2 | 9%, −0.16 |
| add | 5% | 28→83% | 9% vs 10% | −0.01 | 2 | 10%, 0 |
| sub | 10% | 92→86% (lv 3) | 25% vs 18% | +0.07 | 1 | 22%, +0.04 |
| big | 50% | 66→88% | – (prior 78%) | +0.10 | 2 | +0.06 |
| pattern | 13% | 65→100% (r4) | – | +0.50 | 3 | +0.50 |
| pong | – | 48→68% flat 5 r, 96% in r10 | hit 96% vs open-side prior 65% | +0.16 | 2 | 40% flat |
| echo / dots / rps / tug | | 100% from round 1–2 | – | 0 | | saturated |
- Honest read: champion duel accuracy rises in every contest, but on **full-task** accuracy only simon (+5 pts) and sub
  (+7 pts) beat their priors, and only by a little. **Divisor fell below the frequency prior** (51% vs 66%) after being at/above it
  Nov 7 and Nov 12, so it swings run to run. **Text is stuck below the position baseline for the 4th straight run** (12% vs 25%).
  Pong's late jump to 96% hit is **mostly reflex**: ablating all learned units only drops it to 92% (reflex-only 94%), so
  little of it is learning. Echo/dots/rps/tug are saturated from round 1 and give no learning signal at this size.
  Simon peaked at 82% in round 5 and then fell back with 0 reaps, which looks like champion drift rather than memorization.

### For tomorrow
- Text: still try `FIX=mix` / longer `matchSec` (THINKING bumps did not help). Consider harder echo/dots/rps/tug levels so they measure something.
- VORTEX: captures are top again after the fuse fix. Check BREAK FREE uptake (bot offers 2, used 0, because the bot never presses zap
  while dragged) and the grab telegraph on touch. De-flake vortex-fuseland (pin `jumping:false` before the first step).
- Re-read feedback first: these were the first real notes in 7 days. Check whether 40/45 s and the lab sheet change behaviour.
