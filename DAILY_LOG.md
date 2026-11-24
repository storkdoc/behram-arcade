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

## 2026-11-17 (day 21): VORTEX kill cam + Clinic Day text cleanup

Fresh worktree `/workspace/arcade-daily-2026-11-17` from `8a18af2`, headless Chrome (SwiftShader), desktop 1440×900 + iPhone 14.
**Why Nov 14–16 have no entry / why yesterday was marked failed:** Nov 14–15 left their work stranded. Nov 16 recovered it and
pushed 3 commits (`992a42e` VORTEX RUN REPORT + LAST-ZAP BREAK FREE, `e39dc49` Clinic Day Asherman text, `8a18af2` VORTEX
PULSAR CHARGE-UP). It then ran three test sweeps and Neuro Arena in parallel (load ~35 on 8 cores) and re-ran the failing page
tests, and it never wrote this log. The work shipped; the log did not. Today each change was pushed as soon as its tests
passed, and this entry was written before the slow re-runs finished.
Its leftover failures were re-checked today (see Findings); none is a game bug.
Skipped as under active development elsewhere: Cubertron (3 cloud-agent commits Nov 15–16 + open `cursor/cubertron-*` branches),
Me & My Placenta (open `cursor/placenta-*` branches), Jukebox, plus the separate `cosmic-odyssey-wip` branch.

### Player feedback (Nov 13 06:00 → Nov 17, `node tools/read-feedback.mjs --hours 100`): **0 real submissions**
The store is reachable: the Nov 13 doc still holds the 3 notes acted on that day. The Nov 14–17 docs are empty, test records
included. So there are no ratings to tally and no suggestions to cluster. We cannot yet tell whether the Nov 13 changes (Fast
Money 40/45 s, Lab values sheet) changed how people play.

### Findings
- **Smoke, 28 pages × desktop + iPhone (56 loads):** no page errors, no local 4xx.
- **Congressional OB GYN → Dr. Behram's Office / Clinic Day** (26 encounters, 257 questions). answer-length, bank-cues, core,
  labs, page, access, feud (access/engine/page), surgery cases (590) + vitals (942), triage cases/ctg/page all pass.
  Access test: the PIN is stored only as a salted SHA-256 hash, wrong PINs are rejected, 0 of 3000 random codes and 0 of 248
  tampered codes were accepted, and future-dated codes are rejected. Copy stays generic, with no faces.
  **Manual audit of 30 seeded-random items:** no factual errors. NICHD Cat II (minimal variability + recurrent lates),
  Naegele / CRL redating, CDC 2021 GC/PID regimens, US MEC cat 4, Cu-IUD EC, VVC, POI, CAIS, letrozole, fezolinetant boxed
  warning and TOLAC 0.5–0.9% all check out. Four explanations ended with a sentence that **paraphrased an earlier one** (the exact-
  duplicate lint added Nov 12 cannot see paraphrases), so a word-overlap scan was run over the whole bank and those four were fixed.
- **Star Raider:** sim all ok (campaign Novice 100%, Pilot 67% sloppy / 100% sharp, Warrior 0% / 50%, Commander 0% / 17%;
  unchanged). war.test ok. The page test fails 5 desktop keyboard checks (arrows steer, Shift+Up/Down, auto-dock), as it did
  Nov 16. **It is not a game bug:** a manual probe (`_eval/srprobe.mjs`) steers (q.y 0 → 0.233) and ramps throttle 4 → 6.
  Under SwiftShader the sim advances only ~0.4 game-s per 1.5 s of wall time, so the test's fixed 450 ms hold sees zero frames.
  The test could hold until game time advances (backlog).
- **MELTDOWN:** sim 47/47, restart test passes, page test passes all 48 Chromium checks. The page test only "fails" because
  WebKit is not installed on the box (`webkit-2272` missing). Nov 16's failures were the same.
- **VORTEX baseline bot** (8 games, sharp + average, from L8, BF=1, on `8a18af2`): death level sharp 13/13/17/16, average
  14/13/13/13. Lives lost by tip count: **grab 14, fuseball 13, pulsar zap 11**, shot 8, spike 5 (Nov 16 before the charge-up:
  fuse 19, grab 13, zap 11). The bot ignores visual and audio cues, so zap staying at 11 is not evidence about the charge-up.
  The cue that was missing for *humans*: at the moment of death the claw just explodes, the cause appears as text 2.2 s later
  after the field has reset, and nothing shows **which** object killed you or where it was.

### Changes
1. `dd591ce` **Clinic Day explanation cleanup.** Removed 4 paraphrased repeat sentences (postpartum thyroiditis "watch for a
   hypothyroid phase", recurrent VVC induction repeated, PCOS "5–10% weight loss" folded into the first sentence, fezolinetant
   "monitor liver enzymes" repeated). No answers changed. bank-cues / answer-length / core ALL PASS.
2. `ecefbe8` **VORTEX KILL CAM** (today's Tempest change). For the first 2 s of a death, the killer is frozen in red lock-on
   brackets that snap in. `KILLED BY` + its name (ENEMY SHOT, FUSEBALL, PULSAR, MINE, SPARK, SPIKE) is drawn outside the
   brackets on a dark plate, away from the centre messages. A grab reads `GRABBED BY FLIPPER/PHASER/…` while the claw is being
   dragged and BREAK FREE is still offered. A shot's lane glows red down its length, a dashed trace links the killer to the claw,
   and a low lock thud plays. It is presentation only, with no change to rules, timing or input, so it works the same for
   keyboard, mouse, touch and gamepad. New tests/vortex-killcam.test.js ALL PASSED (7 causes × desktop / iPhone 14 /
   landscape: same death, one cam, right label and lane, drawn on screen, ends at 2 s, BREAK FREE still works). Regression ALL
   PASS: breakfree 57, runreport 50, tips, fusewarn, fuseland 30/30 (no flake today), fuselock, grabwarn, grabimminent,
   zapcharge 54, spikewarn, powerups, jump, continue, haptics, root vortex-rim 25, vortex-touch 130.
   No post-change bot run: the bot cannot read the screen, so its numbers would not move.

### Neuro Arena (seed 1117; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5). Nov 16 = seed 1116 (never logged)
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | reaps | champ changes | Nov 16 |
|---|---|---|---|---|---|---|---|
| divisor | 8% | 32→78% | 51% vs 66% | −0.15 | 0 | 7 | 27→72, 43% vs 66%, −0.23 |
| simon | 25% | 53→77% | 48% vs 26% | +0.22 | 1 | 5 | 46→71, 34%, +0.08 |
| text | 8% | 20→52% | 14% vs 25% (new/fam 24/38%) | −0.11 | 2 | 7 | 20→40, 13%, −0.12 |
| add | 5% | 39→83→61% (fell in r10) | 4% vs 10% | −0.06 | 1 | 3 (5 plateau rounds) | 9% vs 10% |
| sub | 10% | 92→80% (lv 2) | 18% vs 18% | 0 | 3 | 7 | 20% vs 18% |
| big | 50% | 67→91% | – (prior 78%) | +0.13 | 1 | 4 | 86%, +0.08 |
| pattern | 12% | 65→100% (r4) | – (prior 50%) | +0.50 | 4 | 3 | same |
| pong | – | 34→48% flat from r5 | hit 48% vs open-side prior 65% | −0.09 | 0 | 2 | 38% flat, −0.23 |
| echo / dots / rps | | 100% by round 1–2 | – | 0 | | 0–1 | saturated |
| tug | 50% | 75→100→50% | – | 0 | 2 | 3 | 100% |
- Honest read: the champion's duel accuracy rises in 8 of 12 contests. On the **full task**, only **simon** clearly beats its prior
  (48% vs 26%, best in 3 logged runs). But ablating *all* learned units leaves simon at 40%, about the same as the intact 39% on
  the end-of-run probe, so this run does not show the gain coming from learned units. **Divisor is below the frequency prior for
  the 3rd straight run.** **Text is below the position baseline for the 6th straight run.** Nov 16 also tried `FIX=mix` (14–18%,
  still below 25%), so the mix fix does not rescue it. Pong improved over Nov 16 (48% vs 38%) and learned units do matter
  (ablating all of them drops it to 26%), but it is still below the open-side prior and flat for 5 rounds. Add peaked and then
  fell, with 5 plateau rounds. Tug's 100→50% fall is on a 4-duel evaluation (0.25 steps), so it is noise rather than
  forgetting. Echo / dots / rps / tug still saturate at round 1–2 and measure nothing.
  There are no memorization signs beyond text's familiar > new gap (38% vs 24%).

### For tomorrow
- Re-read feedback first (4 days of silence).
- Star Raider page test: hold keys until `SR.sess.G.t` advances instead of a fixed 450 ms. MELTDOWN page test: skip WebKit when
  it is not installed. Then both suites can go green on the box.
- Neuro Arena: text / divisor need a real change (a harder curriculum or a bigger `matchSec`), not more runs. Also make
  echo/dots/rps/tug harder so they measure learning, and evaluate tug with more than 4 duels.
- VORTEX: grabs are the #1 bot killer again. Check whether the kill cam's GRABBED BY label clashes with ZAP TO BREAK FREE on small
  landscape phones in real play (it is clamped on screen in tests).

## 2026-11-18 (day 22): VORTEX portrait message band + honest warm-up labels + green test suites

Fresh worktree `/workspace/arcade-daily-2026-11-18` from `a297b9b`, headless Chrome 156 (SwiftShader), desktop 1440×900 +
iPhone sizes. Time-boxed; each change was pushed as soon as its tests passed and this entry was written before the optional
extra checks. Note: the shared `_tools` symlink chain used by earlier daily worktrees now points at a deleted directory
(`arcade-daily-2026-11-14/_tools`); today used a local `_tools/node_modules` linked to the box's pnpm playwright-core 1.63
(1.59 cannot open iPhone contexts in Chrome 156).
Skipped as in active development elsewhere: **GLOW MUNCH** (new maze chase, 2 commits Nov 17), Cubertron, Me & My Placenta,
Jukebox, and the `cosmic-odyssey-wip` branch.

### Player feedback (Nov 17 + everything since the Nov 17 entry; `read-feedback.mjs --hours 30` and `--date 2026-11-17`): **0 real submissions**
The store is reachable (textdb Nov 17 / Nov 18 docs return 200, both empty). There are no ratings and no suggestions to
cluster. Five days of silence now (the last real notes, Nov 13, were all acted on).

### Findings
- **Smoke, 29 pages × desktop + iPhone (58 loads, GLOW MUNCH included as a read-only check):** no page errors, no local 4xx.
- **Congressional OB GYN → Dr. Behram's Office / Clinic Day** (257 questions): answer-length 65, bank-cues, core 15, labs 20,
  page 22, access 15, hub 51, feud access/engine/page 10/14/38, surgery cases 590 + vitals 942, triage cases + ctg all pass.
  Access: PIN only as a salted SHA-256 hash, 0/3000 random codes accepted, garbage rejected, NY-midnight boundary right. Copy is
  generic ("Student name"), no faces. **Manual audit of 30 seeded items (seed 1118): no factual errors.** Checked: ASCCP HPV+
  ASC-US → colposcopy, Cu-IUD EC on day 4, RSVpreF 32–36 wk Sep–Jan, mifepristone 200 mg + misoprostol 800 mcg 24 h later,
  penicillin desensitization for syphilis in pregnancy, CDC 2021 ceftriaxone 500 mg + doxycycline, magnesium toxicity →
  calcium gluconate 1 g, early GDM screening (BMI ≥25/≥23 + risk factor), TOLAC rupture 0.5–0.9%, Amsel criteria, ABM mastitis.
  Triage page and surgery page tests failed today **only under load** (load average 30–43 from Neuro Arena + 3 browsers): fixed
  6 s / wall-clock waits timed out. They are re-run below.
- **Star Raider:** sim (campaign Novice 100%, Pilot 67% sloppy / 100% sharp, Warrior 0/50%, Commander 0/17%; unchanged) and
  war pass. Page test: the backlog flake (keys held for a fixed 450 ms of wall time under a slow SwiftShader sim) is fixed;
  see Changes.
- **MELTDOWN:** sim 47/47, restart passes, page test passes all Chromium cases and now exits 0 (WebKit skipped when missing).
- **VORTEX baseline bot** (8 games, sharp + average, from L8, BF=1, before today's change): death level sharp 9/13/12/13,
  average 14/14/14/12. Lives lost by tip count: **shot 13**, grab 9, zap 8, fuseball 8, spike 4, mine 1 (Nov 17: grab 14,
  fuse 13, zap 11, shot 8). Grabs dropped from #1 to #2 for the first time since Nov 13; small sample, so not a trend yet.
  **Real-phone layout bug found:** on every portrait phone the touch deck (MODE, AUTO/fullscreen/sound/pause bar, ZAP, knob)
  starts at ~67% of the height, but centre messages sit at 58–81%: WAVE: <name> + tip, TAP ZAP TO BREAK FREE!, USES YOUR LAST
  ZAP, POWER-UPS LOST were drawn over the buttons. On 320-px phones the MODE button also ran under AUTO.
- **Sky Shield (iPhone 13):** "← ARCADE" and the feedback sticker covered BEHRAM ARCADE PRESENTS and the S of SKY on the title.
- **Star Invaders, Astro Shatter title screens (iPhone 13):** clean.

### Changes
1. `42da267` **VORTEX: messages clear of the touch controls (portrait)** (today's Tempest change). On touch portrait screens
   the message band from 35% down is squeezed so the lowest slot ends 1.5 U above the control deck; order, spacing ratios and
   text size kept; desktop and landscape unchanged. The MODE button now ends 8 px before the square bar. Hook
   `VORTEX.msgLayout()`. New tests/vortex-msgband.test.js ALL PASSED (44 checks: desktop, iPhone SE 320 + 375, iPhone 14,
   iPhone 14 landscape). Regression ALL PASS: killcam 84, breakfree 57, runreport 50, jump 36, modebtn 28, powerups 26,
   tips 14, root vortex-rim 25, vortex-touch 130. Live: https://storkdoc.github.io/behram-arcade/games/tube-shooter/ (Pages
   served it at 06:47).
2. `2058c15` **Neuro Arena: warm-up contests labelled honestly.** Echo (8 puzzles), Count the dots (6), RPS (3), Pattern (10)
   have no curriculum and reach 100% in rounds 1–4 of every run. Their carousel cards now start with `warm-up · N puzzles`,
   and the tooltip + selection toast say a memorized lookup table can score 100%, which is not evidence of understanding.
   No simulation change. tests/warmup.test.cjs ALL PASSED (desktop + iPhone 13). Today's ablations back the label: with
   **all learned units removed**, echo/dots/rps/tug/pattern still score 100%. Live:
   https://storkdoc.github.io/behram-arcade/games/neuro-arena/ (served at 06:51).
3. `cc8b47a` **Sky Shield: title clear of the back link and sticker** on portrait phones ≥600 px tall (title block starts
   64 px lower; iPhone SE and desktop unchanged). Checked by layout probe + screenshots (iPhone 13, Pixel 5, SE). The
   Sky Shield page test's desktop intro → play / fire checks failed under load (8 s wall-clock waits; the CSS rule cannot
   apply at 1440 px). https://storkdoc.github.io/behram-arcade/games/sky-shield/
4. `984c98f` **MELTDOWN page test:** the WebKit case is skipped with a note when WebKit is not installed, so the suite exits 0
   on a Chromium-only box (backlog item from Nov 17).
5. Star Raider page test (commit below): steering / Shift+Up hold for game time (`holdGame`), not 450 ms of wall time; longer
   waits for Shift+Down, docking, chart, and warp; Shift+Down waits for `thrustDir` to clear after release. Backlog item.

### Neuro Arena (seed 1118; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5). Compared with Nov 17 (seed 1117)
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | champ changes | ablate all units (full) | Nov 17 |
|---|---|---|---|---|---|---|---|
| divisor | 8% | 24→86→66% (lv 3) | 61% vs 66% | −0.05 | 4 | 65% | 51% vs 66% |
| simon | 25% | 51→73% | 35% vs 26% | +0.09 | 1 | 38% (= intact) | 48% vs 26% |
| text | 8% | 24→40% flat from r4 | 12% vs 25% (new/fam 14/34%) | −0.13 | 3 | 4% | 14% vs 25% |
| add | 5% | 33→94→72% (lv 2) | 10% vs 10% | 0 | 1 | 15% | 4% vs 10% |
| sub | 10% | 58→92→77% (lv 3) | 22% vs 18% | +0.04 | 0 | 20% | 18% vs 18% |
| big | 50% | 66→83→80% | probe 71% vs prior 78% | +0.02 | 2 | 81% | 91% |
| pattern | 13% | 55→100% (r3) | probe 100% vs 50% | +0.50 | 2 | 100% | 100% (r4) |
| pong | – | 40% flat all 10 rounds | hit 40% vs open-side 60% | −0.05 | 1 | 24% | 48%, flat from r5 |
| echo / dots / rps / tug | 13/17/33/50% | 100% by r1–2 | – | – | 1–2 | 100% | saturated |
- Honest read: the champion's duel accuracy rises in 7 of 12 contests. On the **full task** only **simon** (35% vs 26%) and
  weakly **sub** (22% vs 18%) beat their priors. For both, ablating all learned units gives the same or a better score, so this
  run again does **not** show the gain coming from learned units. **Divisor is below the frequency prior for the 4th straight
  run** (61% vs 66%; ablating all units gives 65%). **Text is below the position baseline for the 7th straight run** and flat
  for 7 rounds; its familiar-vs-new gap (34% vs 14%) is the one memorization sign. **Pong regressed** to a flat 40% (below
  the 60% open-side prior), although learned units matter there (ablating all of them gives 24%). Add peaked at 94% and then
  fell after its level-up, which is the expected harder-level dip, not forgetting. Pattern and the four warm-ups are solved
  without learned units, which is why they are now labelled warm-up.

### For tomorrow
- Re-read feedback first.
- Neuro Arena: text / divisor / pong need a design change (bigger `matchSec`, a curriculum for text, a pong reward that
  beats the open-side prior), not more runs.
- VORTEX: shots are #1 in the bot tally again. Check whether the JUMP / shot-warning cues are readable in the newly squeezed
  portrait band on real devices.
- Daily runs: do not run 3 Neuro Arena contests × 4 workers alongside browser tests (load 40 on 8 cores made the triage /
  surgery / Sky Shield page tests time out). Run NA after the page tests, or with `-P2`.

### Addendum (after the entry above; load back down to ~10)
- `625e2d5` Star Raider page test (change 5): Chromium desktop / iPhone / landscape / iPad **101 passed, 0 failed**, first
  green run on the box since Nov 16.
- Sky Shield page test: intro / fire / EMP checks wait for a sim frame (`until`) instead of fixed 200–250 ms and 8 s; Chromium
  **62 ok, 0 FAIL** with today's title change (commit below).
- Re-runs at lower load: triage page **147 PASS, ALL PASSED**. Surgery page had 0 FAIL in every case it reached (breech, tah, …),
  but was cut off by the 600 s `timeout` while still playing the remaining cases (it is slow under SwiftShader). Today's
  breech failures were load, not a game bug.

## 2026-11-20 (day 24): VORTEX SHORT-CIRCUIT + eval (time-boxed run)
Note: the 2026-11-19 run pushed `1292234` (VORTEX SHOT-STOPPER) and `32fa6a8` (Star Raider / Tank Duel / MELTDOWN portrait
titles) but was interrupted before writing a log entry. Its Neuro Arena run (seed 1119) finished; its numbers are used below
as the comparison point.

### Player feedback
- `node tools/read-feedback.mjs --json --no-sync`: **0 submissions for 2026-11-19** (also 0 with `--include-test`, 0 in the
  last 72 h). The reader worked: textdb.dev returned HTTP 200 for the 11-19 and 11-20 keys. No ratings or suggestions to act on.

### Evaluation
- **Smoke, all 28 games + home, desktop 1280x800 + iPhone 390x844 touch:** 58/58 loads with no page errors, no console errors,
  no failed local requests.
- **Congressional OB GYN (Dr. Behram's Office):** access test (test PIN accepted, 5 wrong PINs rejected, only a salted SHA-256
  hash stored, future-dated / 248 tampered / 3000 random student codes rejected), core, bank-cues, labs, office page,
  answer-length, hub, feud access / engine / page, surgery cases 590 + vitals 942, triage cases + CTG: all pass. Copy stays
  generic ("Student name"), no faces. **Manual audit of 30 seeded items (seed 1120, 257 items in 26 encounters): no factual
  errors.** Checked: bisphosphonate ONJ / atypical femur fracture + drug holiday, biopsy of a suspicious mass despite negative
  imaging, Amsel criteria, 7-day topical azole in pregnancy, hCG first in pelvic pain, POP 48 h backup (US SPR), syphilis
  two-step serology + Jarisch–Herxheimer, uterine rupture in TOLAC, APS repeat at 12 weeks, mirabegron over oxybutynin in
  older adults (Beers), stable previa → cesarean 36 0/7–37 6/7, Cu-IUD as most effective EC on day 4, short cervix ≤20 mm →
  vaginal progesterone, magnesium toxicity → calcium gluconate 1 g, Wernicke thiamine before dextrose, clobetasol for lichen
  sclerosus. Triage page test: 139 PASS, then the last iPad case (drop) hit a fixed 6 s wait under load 20 (same load flake as
  Nov 18). Surgery page: no FAIL before the 600 s timeout (slow under SwiftShader).
- **Star Raider:** sim unchanged (campaign Novice 100%, Pilot 67% sloppy / 100% sharp, Warrior 0/50%, Commander 0/17%; sloppy
  Warrior runs still end in 2.7 min). Sloppy-player Warrior is still the weakest balance spot.
- **MELTDOWN:** page test and restart test pass (Chromium; WebKit skipped). My first run passed the wrong URL (harness bug, not
  a game bug), so it was re-run.
- **VORTEX bot** (8 games from L8, BF=1, before today's change): lives lost by tip count **zap (pulsar) 15**, capture 14,
  shot 7, spike 7, fuseball 5 (Nov 19: fuseball 15, grab 11, zap 10, shot 6). Death level sharp 17/17/12/16, average
  13/9/13/13; 0 console errors. Shots dropped from 13 (Nov 18) to 7 after SHOT-STOPPER, but the sample is too small to call
  that a trend. Caveat: the eval bot does not dodge pulsars, so pulsar deaths are inflated for it.

### Changes
1. `9f73b59` **VORTEX: SHORT-CIRCUIT** (today's Tempest change). If your own shot kills a pulsar while it is charging or zapping
   in your lane (z < 0.8), you get +300 on top of the 200 kill. You also get an electric burst, a crackle + chord with a
   rumble, a `SHORT-CIRCUIT!  +300` pop, a one-time tip (`PULSAR SHORTED! SHOOT IT BEFORE IT ZAPS`) and a PULSARS SHORTED
   line in the run report. Superzapper and AI DROID kills earn no bonus, and the rules are unchanged. Before this, every
   pulsar cue taught only "step aside". New tests/vortex-shortcircuit.test.js ALL PASSED (30 checks: keyboard, mouse,
   gamepad A, touch FIRE; desktop, iPhone 14, iPhone 14 landscape). Regression: shotstop 39, runreport 50, tips 14,
   zapcharge 54, killcam 84 all pass. vortex-charge passed every check, but its exit code failed: a page.screenshot
   timed out under load 17.
   https://storkdoc.github.io/behram-arcade/games/tube-shooter/
2. `91a7471` **MoodSticker: ASK bubble.** Player feedback has been 0 on most days since Oct 31, and the sticker is easy to
   miss. A game over or a win now shows a small "How was it? Tap me" bubble next to the sticker for 7 s ("Click me ( ` )"
   on desktop). It only appears after 40 s on the page, once per page load, at most once per game per day, and never if
   this browser rated the game in the last 3 days. It is purely visual (`pointer-events: none`): it never takes a key,
   click or touch from the game, and the card opens only when the player taps the sticker. New
   tests/mood-sticker-ask.test.js ALL PASS (desktop + iPhone: Star Invaders, VORTEX, MELTDOWN; on screen, click-through,
   once per page / day, rated-recently, 40 s default, backquote still opens the card). Regression: mood-sticker.test.js
   (NO_REMOTE=1) and mood-sticker-dodge ALL PASS. Applies to every page (home + all games).
3. (commit below) **Triage page test:** the wait for the 2.4 s strip reveal went from 6 s to 40 s. Diagnosis: the game was not
   paused or stuck (`paused:false`, `reveal` 0.72 after 6.7 s). Under load the page runs at about 1 fps, and the reveal
   advances at most 0.1 s per frame, so the reveal takes about 24 s. With the new wait the test gave **147 PASS, exit 0**.
   Before, it failed at a different case each run.

### Live deploy
- VORTEX `game.js` with SHORT-CIRCUIT was served by Pages at 07:04 (about 1 min after the push).
- `assets/js/mood-sticker.js` with the ask bubble was served at 07:11.

### Neuro Arena (seed 1120; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5; the 4 saturated warm-ups were skipped)
Compared with Nov 19 (seed 1119; that run finished but was never logged).
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | champ changes | ablate all units (full) | Nov 19 full |
|---|---|---|---|---|---|---|---|
| divisor | 8% | 29→86→74% (lv 1) | 52% vs 66% | −0.14 | 1 | 61% (intact 58%) | 62% |
| simon | 25% | 41→83→68% (lv 1) | 38% vs 26% | +0.11 | 1 | 44% (intact 40%) | 44% |
| text | 8% | 24→40%, flat r2–r7, 48% at end | 13% vs 25% (new/fam 18/26%) | −0.12 | 0 | 2% | 10% |
| add | 5% | 33→89% | 6% vs 10% | −0.04 | 3 | 12% | 9% |
| sub | 10% | 67→95% (lv 1) | 24% vs 18% | +0.05 | 2 | 20% (= intact) | 16% |
| big | 50% | 60→97% | probe 86% vs prior 78% | +0.19 | 1 | probe 79%, full 90% (intact 86/97%) | probe 86% |
| pattern | 13% | 45→100% (r3) | probe 80% vs 50% | +0.50 | 3 | probe 100% | probe 100% |
| pong | – | 38→48%, flat from r4 | hit 48% vs open-side 65% | +0.05 | 0 | 26% | 38% |
- Honest read: the champion's duel accuracy rose in all 8 contests. On the full task only **simon** (38% vs 26%) and
  **sub** (24% vs 18%) beat their priors. For both, ablating all learned units gives the same or a better score, so the
  gain still does not come from learned units. **Divisor has been below its frequency prior for the 6th straight run.**
  **Text has been below the position baseline for the 8th straight run** and is flat for 5 rounds. Its familiar-vs-new gap
  (26% vs 18%) is the one memorization sign. Ablation shows text and pong do use their units (2% and 26% without them),
  but both stay below the simple prior. **Big** is the only contest where removing all units hurt (full 97% → 90%,
  probe 86% → 79%). The probe has 14 items, so that probe drop is one item. Not significant. Duel accuracy (8 rising
  curves) is not task understanding. Stagnation: text and pong plateaued, and pong's champion never changed.

### Findings (worst first)
1. **No player feedback again.** The loop has been almost silent since Nov 13. The ask bubble (change 2) is the attempt to fix
   discoverability. Check tomorrow whether records arrive.
2. **Neuro Arena text / divisor / pong** are stuck below simple priors for 6–8 runs. They need a design change (see Nov 18),
   not more runs.
3. **VORTEX:** pulsars topped the bot tally today. SHORT-CIRCUIT adds the "shoot it first" answer. The bot itself never
   dodges pulsars, so tomorrow's tally should be compared with that in mind.
4. **Star Raider:** a sloppy player still wins 0% of Warrior campaigns (unchanged for weeks). It is a design choice
   (sharp: 50%), but it is the steepest step in the ladder.
5. **Test load flakes:** Star Raider page test 99 ok / 2 FAIL ("warp completes" on iPhone and iPad, wall-clock waits) and
   the surgery page test hit its 600 s timeout with 0 FAIL, both under load 17–20. vortex-charge passed every check, but a
   screenshot timed out. None of these are game bugs.

### For tomorrow
- Re-read feedback, and look for the first records sent after the ask bubble.
- VORTEX: add pulsar dodging to the eval bot (`_eval/vbot.js` only steers toward targets) so the zap count reflects human
  play. Watch SHORT-CIRCUIT counts in the run report.
- Star Raider page test: make "warp completes" wait on game time like the steering fix.

## 2026-11-22 (day 26): VORTEX RIM SHOT + Clinic Day explanation fix
Note: the 2026-11-21 run pushed `622d7ce` (VORTEX announcer) but never wrote a log entry. Its Neuro Arena run (seed 1121) and
bot eval finished, and their numbers are used below as the comparison point.

### Player feedback
- `node tools/read-feedback.mjs --date 2026-11-21`: **0 submissions** (also 0 with `--include-test`). Archive +0. No ratings or
  suggestions to act on. This is the second full day of the ask bubble (added Nov 20), and it still brought no records.

### Evaluation
- **Smoke, all 28 game pages + home, desktop 1440x900 + iPhone 390x844 touch:** 58/58 loads, with no page errors, no console
  errors and no failed local requests. One harness stall: the first pass hung after planet-guardian desktop under load ~30.
  Re-running the last 5 pages was clean.
- **Harness note:** port 18722 was already held by a leftover server serving the 2026-11-20 worktree, so my first test
  runs hit old code. I re-ran everything on 18822. The Nov 21 runner had passed the wrong URLs to the reactor and Star
  Raider page tests (those were harness failures, not game bugs). Today both got correct URLs: **MELTDOWN page 48 ok / 0 FAIL,
  restart 5 ok; Star Raider page 101 passed / 0 failed.**
- **Congressional OB GYN (Dr. Behram's Office):** office access 15 PASS. The test PIN was accepted, 5 wrong PINs were rejected,
  only a salted SHA-256 hash is stored, and future-dated, 248 tampered and 3000 random student codes were all rejected. Feud
  access 10 PASS. Core, bank-cues, labs, office page, answer-length, feud engine/page, surgery cases + vitals, triage cases
  + CTG + page (146 PASS) all pass. Hub failed once on an 8 s wait under load 25 and passed on re-run. Surgery page: breech
  timed out at 420 s under load (same as Nov 21). Re-run alone with a longer case budget: **breech 18/18 steps, op note
  complete, ALL PASSED**. It is slow under SwiftShader, not a game bug. Copy stays generic, with no faces.
  **Manual audit of 30 seeded items (seed 1122, 257 items in 26 encounters):** I found no factual errors, but two
  explanations needed cleanup (change 2). Items checked: SUI → PFMT, two-step syphilis serology, desensitization in
  pregnancy, iron deficiency at Hb 9.6/MCV 74, Bartholin carcinoma biopsy after 40, LEEP → preterm birth, complete mole +
  46,XX androgenetic, GDM by Carpenter–Coustan + insulin preferred, magnesium for seizure prophylaxis, abruption → expedited
  cesarean, a normal US not excluding abruption, cervical screening interval, postpartum LARC, obstetric APS LDA + heparin,
  letrozole midluteal progesterone > 3, ASRM 6-month evaluation at ≥ 35, Tdap + IIV at 28 wk, RED-S energy balance, hCG first
  in AUB, NICHD Category II, clinical menopause diagnosis, fezolinetant, HG hypochloremic alkalosis, previa + prior
  cesareans, mastitis (ABM 2022), ARRIVE.
- **Star Raider:** sim 8/8 ok (unchanged ladder). The war test failed once: "the better commander usually wins" was 3/6.
  It is not seeded (re-runs gave 5/6, 5/6), and at **N=30 sharp beat sloppy only 19/30 (63%)** against a 60% bar with N=6.
  So it is a flaky test and a thin skill edge in war mode. Not changed today.
- **MELTDOWN:** page + restart + sim pass (above).
- **VORTEX bot** (8 games from L8, pulsar dodging PD=1, break-free BF=1). On Nov 21, before RIM SHOT, lives lost by tip were
  **grab 12, fuseball 11, shot 11, zap 7, spike 3**. Today, with RIM SHOT: fuseball 13, zap 12, shot 10, grab 10, spike 1.
  The bot made 16 rim shots (1 clutch). Its policy is fixed, so it does not respond to the new reward and the death mix is
  noise at this sample size. Max level per game was sharp 13/9/10/13 and average 14/13/16/17. 0 console errors.

### Changes
1. `1e3b39f` **VORTEX: RIM SHOT** (today's Tempest change). Grabs were the #1 bot death cause on Nov 21. The grab already
   had four telegraphs, but the skill they teach (shoot the grabber in the short window after it settles in your lane) paid
   the same 150 as any kill. Now your shot killing a grabber settled on the rim in your lane pays **+250 (RIM SHOT)**, or
   **+500 (CLUTCH)** once the grab countdown is past 40% (the rim is already flashing white). Each one gets a snare-style rim
   crack (the clutch one adds a sting + rumble + small shake), an orange/white burst + rim flash, a pop, and the announcer
   says "Clutch!". The first one shows a tip ('RIM SHOT! HIT GRABBERS THE MOMENT THEY LAND'), and the RUN REPORT gets a RIM
   SHOTS line. Superzapper, droid and other-lane kills earn nothing, and the rules are unchanged. New
   tests/vortex-rimshot.test.js **ALL PASSED** (keyboard, mouse, gamepad A on desktop 1280x800; touch FIRE on iPhone 14
   portrait + landscape). Regression passed: shortcircuit, shotstop, runreport, tips, grabwarn, grabimminent, killcam,
   voice, waves, powerups. breakfree timed out under load 30 and passed on re-run.
   https://storkdoc.github.io/behram-arcade/games/tube-shooter/
2. `bd2e5b1` **Clinic Day explanations.** The abruption item said "vaginal delivery is appropriate if the fetus has died…" and
   then "reasonable only if it is imminent". The two sentences contradicted each other, so they are merged into one: a
   vaginal delivery is reasonable after fetal death, or when the mother is stable and delivery is imminent. A repeated
   closing sentence was removed from the Bartholin item. Office core, bank-cues and answer-length pass.
   https://storkdoc.github.io/behram-arcade/games/dr-behrams-office/

### Live deploy
- Pushed at about 07:07 EST. Both changes were served by Pages at **07:08:27** (VORTEX `game.js` contains CLUTCH RIM SHOT,
  and `bank.js` has the new abruption text).

### Neuro Arena (seed 1122; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5; the 4 saturated warm-ups were skipped)
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | reaps | ablate all units (full) | Nov 21 full (seed 1121) |
|---|---|---|---|---|---|---|---|
| divisor | 8% | 35→93 (r6)→72% (lv 3) | **72% vs 66%** | +0.06 | 3 | 71% (intact 72%) | 42% |
| simon | 25% | 56→89→74% (lv 1) | 48% vs 26% | +0.22 | 1 | 49% (intact 48%) | 32% |
| text | 8% | 36→44%, flat | 16% vs 25% (new/fam 27/28%) | −0.09 | 2 | 6% (intact 17%) | 10% |
| add | 5% | 39→100 (r9)→59% (lv 1) | 8% vs 10% | −0.02 | 3 | 12% | 6% |
| sub | 10% | 58→95% (lv 1) | 24% vs 18% | +0.05 | 2 | 15% (intact 24%) | 25% |
| big | 50% | 67→96% | probe 86% vs prior 78% | +0.18 | 2 | probe 86%, full 94% (intact 96%) | probe 71% |
| pattern | 13% | 65→100% (r3) | probe 100% vs 50% | +0.50 | 2 | probe 100%, full 95% | probe 100% |
| pong | – | 32→46% | hit 46% vs open-side 88% | +0.22 | 0 | 28% | hit 46% |
- Honest read: **divisor beat its frequency prior on the full task for the first time in 7 runs (72% vs 66%).** But ablating
  every learned unit leaves 71%, so the gain does not come from learned units. It is most likely the evolved
  preprocessing/reflex wiring, and it does not show the units understand the task. **Simon** (48% vs 26%) also does not drop
  under ablation. **Sub** is the one contest where the units clearly carry weight: 24% intact vs 15% ablated, against an 18%
  prior. Text uses its units (17% → 6% when ablated) but is below the position baseline for the **9th straight run**, and its
  curve is flat. New vs familiar words is 27% vs 28%, so there is no memorization gap today. Pong's champion never changed
  (0 reaps), and it stays far below the open-side baseline (46% vs 88%). Add stays below prior. Its duel curve hit 100% at
  r9, then fell to 59% after the level-up, which is the expected benchmark restart. Duel accuracy rose in all 8 contests,
  and that is still not task understanding.

### Findings (worst first)
1. **No player feedback for 9 days running.** The last real records in the local archive are from the evening of Nov 12 ET (01:17–02:27 UTC on Nov 13). The ask bubble has not changed that so far.
2. **Neuro Arena text / pong** are stuck below simple baselines (text 9 runs, pong's champion unchanged). Divisor's first
   above-prior result does not depend on its learned units. These need design changes, not more generations.
3. **Star Raider war mode:** a sharp commander beats a sloppy one only ~63% (N=30), and the N=6 test flakes on that.
4. **Test harness:** stale servers on shared ports and wall-clock waits (hub, surgery breech, breakfree, smoke stall) cause
   false failures under load 25–35. None were game bugs today.

### For tomorrow
- Re-read feedback. If it is still 0, consider whether the ask bubble needs to appear sooner (it waits 40 s on the page).
- VORTEX: the bot could take RIM SHOTs deliberately (wait for settle, then fire) to measure whether the window is fair at
  high levels (grabDelay floor 0.18 s).
- Star Raider war test: seed it, or raise N, so "better commander usually wins" stops flaking. Consider widening the
  sharp-vs-sloppy edge.
- Use a unique port per daily run (for example 188DD) and check `ss -ltnp` first.

## 2026-11-24 (day 28): VORTEX one-hop fuseballs, long-play ask bubble, Star Raider WAR ladder, Clinic Day text
Note: the 2026-11-23 run committed two changes locally (Star Raider WAR `3c16222` and Clinic Day `e977194`) and had VORTEX
ONE HOP, THEN DROP tested but uncommitted. It never pushed them and never wrote a log entry. Its worktree had been idle
since Nov 23 09:46. Today I re-tested all three and shipped them (new hashes below). The Nov 23 bot numbers are the "before" comparison.

### Player feedback
- `node tools/read-feedback.mjs --json --archive ~/behram-arcade-feedback.jsonl` (Nov 23 ET): **0 submissions**. With
  `--hours 72 --include-test` there are also 0. The archive gained 0 records, and textdb answered 200. This is the 11th
  straight day with no real feedback. The last real records are from the evening of Nov 12 ET (Congressional OB GYN lab
  values, Feud fast-money time, two "Fun" ratings, all acted on earlier). I had no ratings or suggestions to cluster.

### Evaluation (local server :18924, Chromium headless + SwiftShader, load 12–37 from parallel suites)
- **Smoke, all 28 game pages + home, desktop 1440x900 + iPhone 390x844 touch:** 58/58 loads, with no page errors, no console
  errors and no failed local requests. On the live site, VORTEX, Dr. Behram's Office, Star Raider and home had 0 console
  errors after the deploy. Star Raider's `load` event took more than 30 s once on live, while domcontentloaded was fine.
- **Congressional OB GYN (Dr. Behram's Office):** office access 15 PASS. The test PIN was accepted, 5 wrong PINs were
  rejected, only a salted SHA-256 hash is stored, codes expire on day 42, and 248 tampered and 0/3000 random codes were
  accepted (correct). Core, bank-cues, labs, office page, answer-length, feud access/engine/page (38), surgery cases + vitals,
  triage cases + CTG + page (146) all pass. Hub timed out once at load 37 and passed on re-run (67). Surgery page breech
  timed out under load, as on Nov 21–22 (see addendum). The copy stays generic and shows no student faces.
  **Manual audit of 30 seeded items (seed 1124, 257 items in 26 encounters):** I found no factual errors. One explanation
  had a repeated sentence (severe-range BP said "treat within 30–60 minutes" twice, change 4). Items checked: LDA for
  chronic HTN, moderate variability excludes acidemia, DXA in RED-S, implant failure rate, mastitis, EFW ≥ 4,500 g with
  diabetes, NVP ultrasound for twins/mole, atrophy as the top PMB cause, midluteal progesterone > 3, fFN NPV, A1GDM
  nutrition first, hCG first in pelvic pain, HELLP → aspirin + CV risk, breastfeeding LARC, preop iron, DXA ≥ 65, complete
  mole 46,XX androgenetic, PCOS endometrial risk, early GDM screen at BMI ≥ 25 + risk, previa ultrasound first, CRL
  redating > 5 d before 9 wk, TSH before pituitary MRI, hCG first in amenorrhea, no misoprostol in TOLAC, trich NAAT,
  inflammatory breast cancer punch biopsy, cabergoline for microadenoma, insulin resistance not a Rotterdam criterion,
  magnesium < 32 wk, severe-range BP treatment. I also checked the Nov 23 BV fix: CDC 2021 does drop the alcohol
  restriction with metronidazole.
- **Star Raider:** page test 101 passed / 0 failed. Sim pass. War test (Nov 23 change, seeded) passes, including the CPU skill ladder.
- **MELTDOWN:** page 48 ok / 0 FAIL (correct URL `/games/reactor/`; the first try today passed the bare base URL, which
  was a harness error), restart pass, sim 47/0. The iodine-pit drill is winnable.
- **VORTEX:** fusehop ALL PASSED. fuselock, killcam, rimshot, runreport, tips pass. fusewarn failed once at load ~30 and
  passed on re-run. fuseland was flaky on base too (Nov 23); de-flaked today. **Bot** (8 games from L1, PD=1 BF=1, same
  seeds as Nov 23), lives lost by tip: **fuse 12, zap 8, spike 7, capture 6, shot 5 (38)**, against Nov 23 before the change
  fuse 14, shot 10, zap 8, capture 6, spike 5 (44). Rim chases were 4 (before: 6), arrivals 6, rim-jumps 4. Max level
  15/12/10/5 sharp and 8/15/13/15 average. One sharp game died twice to spikes on L3. 0 console errors.

### Changes (pushed 07:19 EST; live at 07:20:33 EST)
1. `90c31b6` **VORTEX: ONE HOP, THEN DROP** (today's Tempest change; built by the Nov 23 run, re-tested and shipped today).
   The 1981 coin-op rule: outside the end-of-round hunt, a rim fuseball crosses one lane toward the claw, lingers 0.3 s,
   then drops back into the tube, where it can be shot mid-jump on the way down. When only fuseballs are left, they hunt
   as before, with a one-time "LAST FUSEBALLS HUNT YOU! KEEP MOVING" callout and chirp. The fuse death counters now count
   real deaths only. vortex-fuseland's two flakes are fixed in the test (hold `mdir`, stub `Math.random` for the cue
   check), and it passed twice in a row. Honest effect: on the bot, fuse deaths are 12/38 against 14/44 before, so the
   share is about the same. Chases fell from 6 to 4. The sample is small, so "no worse, likely a little better".
   https://storkdoc.github.io/behram-arcade/games/tube-shooter/
2. `0939795` **MoodSticker LONG-PLAY ASK** (for the 11-day feedback drought). The ask bubble only fired on a sniffed GAME
   OVER/win, which many pages never draw (Clinic Day, Jukebox, Relax, Chess, long sessions). Now, after 240 s of active
   play (page visible, input or pointer movement in the last 30 s), the same purely visual bubble shows at the first
   3–20 s lull. The same once-per-page / once-per-game-per-day / rated-in-3-days rules apply. FEEDBACK.md is updated.
   mood-sticker-ask ALL PASS (adds desktop Dr. Behram's Office, iPhone Jukebox, and "an idle page never counts") and
   mood-sticker ALL PASS. The first two runs failed on my own test timing at load 37 (the lull came before the scripted
   input started), and I fixed the test. Affects every page.
3. `0af4953` **Star Raider WAR: CPU skill shapes strategy** (Nov 23 work, its numbers): before, a sharp commander beat
   NOVICE/PILOT/WARRIOR/COMMANDER 70/87/53/53% (N=30). After: 97/77/60/53% (holdout 100/70/63/60%). The war test is
   seeded, so the "better commander usually wins" flake from Nov 22 is gone. War + sim pass today.
   https://storkdoc.github.io/behram-arcade/games/star-raider/
4. `1b9a2ea` + `a69f344` **Clinic Day explanations:** the EC item drops a repeated levonorgestrel/BMI sentence. BV now
   says CDC 2021 no longer advises avoiding alcohol with metronidazole. Severe-range BP no longer repeats "treat within
   30–60 minutes"; it now just notes that oral nifedipine means the immediate-release form. Office suites pass.
   https://storkdoc.github.io/behram-arcade/games/dr-behrams-office/

### Live deploy
- Polled with cache-busting: at 07:20:33 EST Pages served all four files with today's change (`game.js` with LAST
  FUSEBALLS HUNT YOU, `mood-sticker.js` with askPlayMs, `auto.js` with the split strategy, `bank.js` with the nifedipine text).

### Neuro Arena (seed 1124; 10 rounds × K=4 = 40 gens, Lamarck, 30 s, size 2800, ABL=5; warm-ups skipped)
| contest | chance | champ curve (duel acc) | full task vs prior | beyond reflex | reaps | ablate all units (full) | Nov 22 full |
|---|---|---|---|---|---|---|---|
| divisor | 8% | 33→86 (r6)→72% (lv 2) | 59% vs 66% | −0.07 | 2 | 65% (intact 64%) | 72% |
| simon | 25% | 54→82 (r9)→59% (lv 1) | 50% vs 26% | +0.24 | 2 | 39% (intact 44%) | 48% |
| text | 8% | 26→44→40%, flat | 15% vs 25% (new/fam 16/30%) | −0.10 | 2 | 12% (intact 18%) | 16% |
| add | 5% | 67→94→70% (lv 2) | 15% vs 10% | +0.05 | 3 | 21% (intact 17%) | 8% |
| sub | 10% | 92→100 (r7)→90% (lv 3) | 29% vs 18% | +0.11 | 2 | 38% (intact 36%) | 24% |
| big | 50% | 71→91% | probe 79% vs prior 78% | +0.13 | 1 | probe 86%, full 80% (intact 91%) | probe 86% |
| pattern | 13% | 75→100% (r6) | probe 100% vs 50% | +0.50 | 2 | probe 100%, full 100% | probe 100% |
| pong | – | 36→86% | hit 86% vs open-side 76% | +0.11 | 1 | 90% (intact 86%) | hit 46% |
- Honest read: **pong beat the open-side baseline for the first time (86% vs 76%)**. But ablating every learned unit
  gives 90%, so the skill sits in the evolved reflex/preprocessing, not in learned units. The same holds for **add**
  (now above prior, 15% vs 10%) and **sub** (29% vs 18%): ablated ≥ intact, so this is not unit understanding. Sub was the
  one unit-dependent contest on Nov 22, and today it is not. **Big** is the only contest where the units carry weight on
  the full task (91% intact vs 80% ablated), with the probe about at prior. **Simon** keeps a modest unit effect
  (44% → 39%). **Divisor** fell back below its frequency prior (59% vs 66%) after Nov 22's first above-prior result,
  consistent with that result having been reflex, not learning. **Text is below baseline for the 10th straight run**, and
  today it shows a **memorization gap** (familiar words 30% vs new 16%). Duel curves rose in all 8, which again is not task
  understanding.

### Findings (worst first)
1. **No player feedback for 11 days.** The long-play ask is today's attempt. If it is still 0 in a few days, traffic is
   probably the limit rather than the prompt.
2. **Neuro Arena:** text is stuck below baseline (10 runs) and now memorizes. Pong/add/sub gains come from reflex wiring,
   not learned units. These need design changes (e.g. a held-out word split in selection, ablation-gated fitness), not more generations.
3. **VORTEX:** fuseballs remain the #1 bot death cause (12/38), and spikes rose to 7 (a sharp game lost 2 lives on L3).
4. **Process:** the Nov 23 run left tested work unpushed, and harness URL/port mistakes still cost re-runs (reactor bare
   URL today). Suites at load 30+ give timing flakes (hub, fusewarn, surgery breech).

### For tomorrow
- Re-read feedback, and check whether any record has `lastScreen` from a long-play ask.
- VORTEX: look at spike deaths (warp-into-spike telegraph at low levels) and teach the bot to step around landing fuseballs, to measure the hop rule fairly.
- Neuro Arena: consider making text selection score on held-out words only.
- Run the reactor page test with `$B/games/reactor/` from the start; keep one port per day (189DD).
