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
