# NEURO ARENA — working notes (contests, THE REAPER, Lab)

## What is live
- **Carousel** of contests (arrows, swipe, click a card, `[`/`]` or ←/→). Each contest has its own evolution,
  champion, Hall of Fame and history (localStorage `neuroArena.v3.<contest>`; the v2 Pong save migrates).
- Visible contests: Pong, Addition (curriculum 0–2 + 0–2 … 0–9 + 0–9), Subtraction (curriculum, 0 ≤ b ≤ a ≤ 2 … 9),
  Bigger number (L/R), Smallest divisor (2–99 → 99,999; see below), Word completion (5-letter words, any one letter missing; see below), Rock paper scissors (answer the move
  that beats theirs), Echo (repeat a letter A–H), Count the dots (1–6), Pattern completion (a, a+d, a+2d, ?),
  Simon (4 colours, 3 → 6 lights played back one light per trial; see below).
- Not built: Odd one out (needs three input slots), Matching pennies (adversarial, no fixed right answer for the
  Reaper's frozen benchmark), Air hockey (a Pong variant; Pong already covers it).
- Hidden: Even or odd (`evenodd`, replaced by Smallest divisor), the 2-colour Simon (`simon2`), the old 3-letter Text completion (`text3`), Addition small (`add5`, fixed 0..4 + 0..4), Tug-of-war reflex (`tug`). (`add7`/`sub9` were replaced
  by the curricula.) Reach them with `?contest=<id>`.

## THE REAPER (js/contests.js `judge`, `reaper`)
- After each duel, champion and challenger sit the same frozen benchmark: learning off, same items, same order,
  same seed (quiz: the items of the current curriculum level, ×2 only if ≤ 50 items, shuffled with seed 9001,
  capped at 100, e.g. 100 frozen numbers from 0–999 for Even or odd; Pong: 50 fixed serves).
- Per character: +1 right, −2 wrong, 0 abstain. Multi-character answers ("10") are scored per position.
- Reap only if margin ≥ need (quiz: max(3, ceil(5% of max points)); Pong: 2 serves) **and** a paired sign test
  over items passes (b − c ≥ max(1, √(b + c))). Tiebreak: fewer wrong characters, then lower mean latency.
- Verdict pops up on screen (both scores, ✓/✗/abstain counts, margin, sign test, reaped or not), goes into the
  spawn log, the Lab's Reaper table, and the CSV/JSON exports.

## Choice brain (js/cbrain.js)
- Same LIF conductance physiology as Pong. Thalamus → sensory symbol tiles (one tile per symbol per input slot)
  → association gain-field grid (G×G; row = slot-0 symbol, column = slot-1 symbol) → K answer populations with
  winner-take-all inhibition. 40% of Even-or-odd association cells (`marg`) are tuned to one digit place only.
- Explicit trial loop (`TRIAL` in contests.js, `ChoiceMatch`): PRESENT 40 ms (input drive) → THINKING 300 ms
  (answer populations integrate; spike counts reset at its start) → ACCEPT (winner-take-all on the window's
  counts) → commit 30 ms → JUDGED (Reaper verdict, then dopamine) → reset to baseline (`quiesce`: V, thresholds,
  conductances, delay rings, traces, OU noise) → next item. Confidence threshold
  max(margin, k·√(n1+n2)) applies only in Play against a human; practice duels and the benchmark are forced choice.
- Learning (`ChoiceBrain.accept`, after the verdict): ΔW = η·α·RPE·wMax·x_pre·dev, where x_pre is the
  association cell's spike count over the trial (thresholded at 25% of the max, so cells sharing only one
  operand get no credit) and only the CHOSEN population's synapses change. RPE = r − r̄ (abstain: small
  −0.05 raw, r̄ not updated). Exploration: slow OU noise (300 ms) on the answer populations.
- Curriculum (`Curriculum`, `CURR = {thr 0.9, win 60}`): next level when 90% of the last 60 practice answers are
  right; in evolution the level advances when the champion scores ≥ 90% on the level's frozen benchmark (toast +
  dashed marker on the Lab curve; benchmark resets for the new level). Saves from before the trial loop
  (`TRIAL_LOOP = 2`) are not restored.
- Size slider (quiz contests): 1,400 / 2,800 (default) / 5,600 / 11,200 / 22,400 neurons; every area scales.

| neurons | plastic synapses | fixed synapses | total | speed (1 core) |
|---|---|---|---|---|
| 1,402 | 39K | 90K | 129K | ~4× real time |
| 2,804 (default) | 78K | 200K | 278K | ~2× real time |

(Since the trial-loop rework the association → answer connectivity is 4× denser (`pAMx 4`): plastic synapses
78K → 182K at 2,800, 404K at 5,600; headless speed at 2,800 is ~6× real time.)

| 5,599 | 154K | 404K | 558K | ~0.6× |
| 11,198 | 308K | 830K | 1.14M | ~0.2× |
| 22,396 (max) | 615K | 1.74M | 2.36M | ~0.1× |

Pong brain: fixed 2,800 neurons, ~190K fixed + 77K plastic synapses.

## Learning results after the trial-loop rework (Oct 26 2026; `S0=<seed> PROBE=2 node tests/learn.mjs <contest> <trials> 1 2800 <every>`)
One gen-0 brain, one lifetime, 2,800 neurons, curriculum on. probe = accuracy on a fixed frozen benchmark
(level index 2: 0–4 + 0–4 for Addition, 0 ≤ b ≤ a ≤ 4 for Subtraction, 100 numbers from 0–999 for Even or odd).

Addition (chance on 0–4 + 0–4: 11%), probe at trial 0 / 500 / 1000 / 1500 / 2000 / 2500 / 3000, level reached:
- seed 1: 6 / 42 / 60 / 74 / 88 / 94 / **94%** → 0–6 + 0–6
- seed 2: 2 / 46 / 72 / 88 / 88 / 76 / **92%** → 0–6 + 0–6
- seed 3: 8 / 34 / 56 / 86 / 82 / 94 / **96%** → 0–5 + 0–5
- seed 4: 6 / 34 / 52 / 68 / 90 / 96 / **90%** → 0–6 + 0–6
With the faster 80%/40 curriculum all seeds reached 0–9 + 0–9 by trial ~2,500 but 0–4 + 0–4 only peaked 80–86%.

Subtraction (chance on 0 ≤ b ≤ a ≤ 4: 20%), same checkpoints:
- seed 1: 10 / 73 / 87 / 87 / 90 / 90 / **90%** → 0 ≤ b ≤ a ≤ 9 (full)
- seed 2: 17 / 57 / 83 / 97 / 90 / 90 / **93%** → 0 ≤ b ≤ a ≤ 7
- seed 3: 7 / 83 / 93 / 93 / 97 / 97 / **93%** → 0 ≤ b ≤ a ≤ 9 (full)

Even or odd (chance 50%), probe on 100 frozen numbers 0–999 at trial 0 / 150 / 300 / 450 / 600:
- seed 1: 49 / 100 / 100 / 100 / **100%** (0–99 at trial 65, 0–999 at 125)
- seed 2: 52 / 97 / 100 / 99 / **99%** (84, 144)
- seed 3: 56 / 100 / 98 / 98 / **100%** (70, 130)

Other contests, seed 1, benchmark at trial 0 → 500 → 1,000 (before the rework: see the old table below):
Bigger number 37 → 88 → 92% · Text completion 3 → 81 → 75% · Rock paper scissors 33 → 100 → 100% ·
Echo 19 → 94% · Count the dots 0 → 100 → 100% · Pattern completion 10 → 90 → 85% · Simon 0 → 83 → 100%.

### What was wrong with Addition before
1. Readout: the answer was the first population to lead by a margin within 260 ms, so early noise was accepted
   (even ideal hand-made wiring scored only 84% on 0..4 + 0..4; with the fixed-window count readout it is 100%).
2. Abstaining starved learning: ~70% abstains, and abstains got a positive RPE when the running reward was negative.
3. Credit assignment: covariance eligibility spread credit to every population and to cells that share only one
   operand; now trial counts, a presynaptic threshold and chosen-only credit.
4. Too few association → answer synapses per conjunctive tile (~2 per motor cell) for the 10×10 grid (pAMx 4 fixes).
5. No carry-over reset between items, and no curriculum (19 answers from the start).

### Old table (before Oct 26, first-lead readout)
Headless, `node tests/learn.mjs <contest> <trials> 1 2800 <every>` with S0=seed;
one gen-0 brain, one lifetime, accuracy on the frozen benchmark, all characters right)
| contest | chance | start (3 seeds) | after N trials | seeds |
|---|---|---|---|---|
| Bigger number | 50% | 41% | 86% after 1,000 (≈3 min sim) | 1 |
| Even or odd | 50% | 35–40% | 75–85% after 500–1,500 | 2 |
| Text completion | 10% | 3% | 25–31% after 1,000–2,000 | 1 |
| Addition 0..4 | 11% | 0–6% | 14–30% after 2,000 (train acc 20–25%) | 3 |
| Subtraction 0..5 | 17% | 7–24% | 21–33% after 2,000 (train acc 27–32%) | 3 |
| Rock paper scissors | 33% | 17–50% | 83–100% after 1,500 | 3 |
| Count the dots | 17% | 0–8% | 58–67% after 1,500 (75% peak) | 3 |
| Echo | 12.5% | 6–13% | 25–56% after 1,500 (69% peak) | 3 |
| Pattern completion | 12.5% | 10–15% | 25–50% after 1,500 | 3 |
| Simon | 11% | 0–6% | 39–44% after 1,500 | 2 |
| Addition to 12 (hidden) | 7.7% | — | 2.5–12.5% after 3,000: not above chance | 3 |
| Subtraction to 8 (hidden) | 11% | 9% | 16–20% after 3,000 | 3 |
| Tug-of-war (hidden) | 50% | 25% | 25% (abstains ~70%) | 1 |
Evolution (Lamarckian) carries learned synapses across generations, so in the browser champions keep improving
beyond one lifetime; Even or odd reached a 100% benchmark by generation ~3 in Turbo.

## Word completion (5-letter, Oct 27 2026; contest id `text`, the old 3-letter one is hidden as `text3`)
- **Task:** a five-letter word with one letter missing at any of the 5 positions (`L_GHT`); answer one of 26 letters.
  643 curated common words (`js/words5.js` PUZZLE5), every word × every blank position = 3,215 items.
- **Any legitimate answer counts.** THE REAPER (`judgeItem` in contests.js) accepts ANY letter that makes a word in
  DICT5: the 8,636 five-letter words of the ENABLE word list (public domain, vendored in words5.js), much broader
  than the puzzle list. An alternate valid letter gets full credit (+1, the same dopamine) and the stage shows
  `VALID ALT: SOUTH→MOUTH ✓`. 47% of items have more than one valid letter (mean 1.96). Ambiguous puzzles are kept.
  The benchmark, live accuracy and curriculum all use the same rule. Live stats and the Lab (caption under the live
  curve) split correct answers into intended + alternate; the champion benchmark reports `alt` too.
- **Chance** under that rule = mean(#valid letters)/26 = 7.6% (shown everywhere). A stronger baseline: always guessing
  the most common valid letter for the blank's position (S, R, A, E, E) gets **25.3%** on the full set.
- **Curriculum** (Oct 27 rework, `TXL`; save key bumped to 6 so old saves restart): L1 25 words, blank in the last
  letter (≥80%) → L2 25 words, blank in the last 2 letters (≥60%) → L3 25 words, any position (≥42%) → L4 80 words
  (≥38%) → L5 200 words (≥33%) → L6 all 643. Every level mixes in 25% puzzles of the level below (`mixOld`).
- **Input coding** (new discrete mode in cbrain.js, `spec.tiles`): slot 0 = the blank's position (5 symbols, 20% of
  the thalamic/sensory cells, `split`), slot 1 = (position, letter) of the 4 known letters (130 symbols, multi-hot:
  4 on at once). Association cells are conjunction tiles [blank position, (position, letter)]: the 468 pairs that
  occur in the words (≈2 cells per tile at 2,800 neurons). Contest-level `aBias −4` (sharper AND) and `wSA 0.35`.
  Learning, the trial loop, dopamine, eligibility, evolution and the Lab are unchanged.
- **Ceilings measured** (`tests/ideal5.mjs`, hand-wired Assoc→Motor weights = P(letter | tile)): ~85–94% at L1 and
  ~27–33% at L5 for the spiking brain; a noiseless linear readout of the same features reaches 50%. `tests/diag5.mjs`
  showed the limit is association cells that match only the blank position firing a little (noise ~1.5× the signal);
  re-weighting the two slots, bigger brains (5,600) and position-only cells did not raise the spiking ceiling.
- **Learning** (`S0=<seed> PROBE=4 node tests/learn.mjs text <trials> 1 2800 <every>`; benchmark = 50–100 frozen
  items, so ±4–5 points of noise; ~2× real time on one core, 4,000 trials ≈ 33 simulated minutes ≈ 6.5 wall min):
  | seed | full-level probe at trial 0 | L1→L2 / L3 / L4 / L5 reached at trial | full level, benchmark at 4k / 5k / 6k | practice acc at L5 |
  |---|---|---|---|---|
  | 1 | 8% | 477 / 1,365 / 1,978 / 2,407 | 17 / 30 / 27% | 21–25% |
  | 2 | 13% | 451 / 1,399 / 1,572 / 3,014 | 16 / 24 / 20% | 22–24% |
  | 3 | 3% | 527 / 2,232 / 2,520 / 3,123 | 21 / 26 / 19% | 20–23% |

  So: 3–13% (chance 7.6%) → ~20–25% on all 643 words after 4,000–6,000 trials (33–49 simulated min), i.e. about
  3× chance but only level with the 25% position-frequency baseline. In the small levels the climb is clearly word
  knowledge: 25 words, last letter: 2–6% → 74–88% in 500–750 trials (baseline 28%); 25 words, any position:
  → 45–51% after 3,500 trials (baseline 27%). Trained directly on the full level (no curriculum, seeds 1–3):
  8/3/11% → 24/22/12% after 4,000–5,000 trials.

## Why Word completion "lost" its proficiency (diagnosed Oct 27 2026)
- **It never forgot.** Evolution (`evo.js record`) promoted on the global `CURR.thr` = 90% and ignored the
  contest's `currThr`. At gen ~165 the champion passed 90% on L1 (25 words, last letter missing) and was moved to
  L2 (the same 25 words, blank at ANY position). Its benchmark was reset and re-measured on the harder test, whose
  spiking ceiling is ~45–51%, so the chart fell from ~90% to ~30% in one step and the 90% bar could never be reached
  again, i.e. it was stuck at L2 for good. "Slow recovery" = it was already near the ceiling of the new test.
- **Downward lifetime curve:** within one duel the brain keeps learning (plasticity + exploration noise), which
  degrades a tuned network a little, plus regression to the mean (the champion's weights are its best benchmark
  snapshot). `tests/lifetime.mjs` (old 80-word level): learning on ≈25% vs the same weights frozen ≈29%; carrying
  the reward baseline `rBar` across generations made no difference (kept, harmless).
- **Fixes:** promotion uses `levelThr(C, level)` (the per-level `currThr`), smaller steps (new L2), 25% old-level
  puzzles, "best ever" is per level. The generations chart now shows a dashed marker + "LEVEL n: name" label at
  each level change, colours the champion line per level, draws a cyan **full-task** line (the champion probed on
  the final level every 10 gens, `j.probe`) so real progress is visible across levels, and a 7-s toast at
  level-up: "Harder test: a score drop is expected (the brain did not forget)".

## Think time (Oct 27 2026)
- THINKING is now per contest (`contest.trial.thinkMs`, `trialOf(C)`): Word completion 700 ms (was 300), Smallest
  divisor 500, Simon 400; shown in the stage phase bar ("THINKING 700ms") and the Lab caption.
- Measured, full 643-word level trained directly, 300-item seeded probe (`T_thinkMs=… PROBE=5 PROBEN=300 node
  tests/learn.mjs text 5000 1 2800 1000`), seeds 1/2/3:
  | think | 1k | 2k | 3k | 4k | 5k trials | mean at 4k–5k |
  |---|---|---|---|---|---|---|
  | 300 ms | 14 / 18 / 16% | 19 / 16 / 17% | 26 / 26 / 22% | 23 / 22 / 21% | 24 / 19 / 24% | 22.3% |
  | 700 ms | 19 / 19 / 18% | 20 / 20 / 20% | 25 / 23 / 22% | 27 / 22 / 25% | 26 / 23 / 26% | 24.7% |
  ≈ +2–3 points and faster early learning, but still level with the 25.3% position-frequency baseline (chance
  7.6%). The hand-wired ideal ceiling barely moves with think time (300 ms 36%, 700 ms 34%, 1,200 ms 37%; 5,600
  neurons 34%): the limit is systematic cross-talk noise in the association tiles, not spike-count (Poisson) noise.
  Cost: longer trials → fewer trials per 30-s duel and slower benchmarks.

## Smallest divisor (Oct 27 2026; contest id `divisor`, replaces Even/odd which is hidden as `evenodd`)
- **Task:** N from 2 to 99,999; answer its smallest divisor > 1: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, "37+"
  (a composite whose smallest prime factor is ≥ 37) or P (N is prime). 13 answers, chance 1/13 = 7.7%. THE REAPER
  scores the whole token (+1 / −2). The stage shows the factorization ("9,991 = 97 × 103 · smallest divisor 97").
- **Curriculum:** 2–99 → ≤999 → ≤9,999 → ≤99,999 (thresholds 85 / 75 / 72%, 25% old-level mix).
- **Input = disclosed preprocessing** (the brain cannot do long division in 0.5 s): slot 0 = last digit; slot 1
  (multi-hot) = tens digit, digit sum mod 3, alternating digit sum mod 11. Tiles = last digit × each feature (240).
  So 2, 5 (last digit), 3 (digit sum) and 11 (alternating sum) are learnable; 7, 13 … 31, 37+ and prime-vs-37+
  are NOT learnable from these features (it can only guess the commonest remaining class, mostly P).
- **Baselines:** "always 2" ≈ 48–51% (shown in the header as `always “2”`, orange line on the chart); we also report
  balanced accuracy (mean per-class recall; always-2 = 7.7%). Ideal hand-wired spiking ceiling: L1 98%, L2 82%,
  L3 86%, L4 73% (balanced 26%); Bayes optimum with all features jointly ≈ 85%.
- **Learning** (`S0=s PROBE=3 PROBEN=300 node tests/learn.mjs divisor 4000 1 2800 500`, 300-item probe on the full
  99,999 level, always-2 = 47.7% on that set): L4 reached at trial 470 / 522 / 593 (seeds 1/2/3); full-task probe
  at 4,000 trials **72 / 74 / 70%** (balanced 25 / 30 / 24%), i.e. ≈ the 73% ideal and +22–26 points over always-2.

## Simon (Oct 27 2026; 4 colours, up to 6 lights; the old 2-colour one is hidden as `simon2`)
- A sequence of L lights (R, G, B, Y) is shown; the brain plays it back one light per trial, in order (the duel
  continues the sequence, then draws a new one). Curriculum 3 → 4 → 5 → 6 lights (≥80%, 25% old-level mix); the
  top level is the full 6-item sequence. THE REAPER: +1 right colour in that position, −2 wrong. Save key 2.
- **Working memory is modelled, not learned:** slot 1 = position slots (position q, colour c), multi-hot, held on
  through the replay; slot 0 = the step clock (which light is being played). Tiles step × (q, c) = 144. Think 400 ms.
- The stage draws all L lights as coloured boxes with the current step outlined and each player's ✓/✗ dots.
- Ideal hand-wired ceiling at 6 lights: 61% per light (whole sequence ≈ 0.61⁶ ≈ 5%); 3 lights 91%.
- **Learning** (`S0=s PROBE=3 PROBEN=300 node tests/learn.mjs simon 4000 1 2800 1000`, probe = 50 whole 6-light
  sequences): per light **53 / 57 / 50%** at 4,000 trials (chance 25%), whole sequence 2 / 2 / 2% (chance
  1/4096 = 0.024%; the probe has 50 sequences so 2% = 1 sequence). Per position (seed 2): 56, 60, 54, 64, 52, 58%.
  Levels reached: 6 lights at trial 1,568 / 1,617 / 3,591.
- Bug fixed on the way: `runTrial` (tests) now plays exactly the given item (`fixed: true`); before, it jumped to
  the sequence start so tests only ever trained light 1.

## Evolution (headless Turbo, `node tests/evochoice.mjs <contest> 10 4 1 30`: 4 arenas, Lamarckian, 30-s duels)
- Addition: champion benchmark 24% (gen 4) → 26% (gen 12–40); chance 11%; 40 generations in 2 min wall.
- Subtraction: 19% (gen 4) → 38% (gen 8–40); chance 17%.
- In both runs THE REAPER reaped no challenger in 40 generations: the gains came from the champion's own
  learning kept by elitism, and challengers (best 40% vs 38%) never cleared margin + sign test. Copy errors
  mostly hurt (Lab: mean effect per gene is negative). Strict judging stops drift, but it also slows progress.

## THE UNDERSTANDING LAYER: know yourself, know your enemy (Oct 27 2026; js/understand.js)
Hypothesis (owner): intelligence evolves when reflexive pathways are limited; to beat a weak reflex the brain has to
"understand" the task. Sun Tzu: "Know yourself and know your enemy and you will always be victorious."
- **Genome `ux`** (one shared module, understand.js): `units[]` (each an AND of 1-3 input codes `src*4096+sym`;
  src 0/1 = task slots, src 2 = context, Pong 0/1/3/4 = ball−paddle, paddle y, ball x, ball vy), `rec[]`
  (hidden→hidden links), `o` per unit (output on/off), `reflex` 0 Full / 1 Limited / 2 None. `mutateUX`:
  rewire an input, add/drop an input, shift to a neighbouring bin, duplicate, delete, toggle output, add/drop
  recurrence. Seeded random+sparse from `uxSeed` (per experiment). Kept with Lamarckian/Darwinian and the Reaper.
- **Context sub-layers.** KNOW YOURSELF: own last answer, right/wrong, streak, confidence (choice) / own paddle
  motion, last point won/lost, hit last (Pong). KNOW YOUR ENEMY: opponent's last answer, who answered first
  (choice) / enemy paddle band 0-5, enemy motion, enemy hit last (Pong). Relay cells `ch 2` (choice) / `ch 8` (Pong).
- **The reflex** = units on the blank position alone (Word: S,R,A,E,E = 25.3%) / the Pong gain field + units on
  ball−paddle alone (tracking). Limited: row cap 20% of wMax and decay (choice ×0.99 per trial, Pong ×0.998 per
  100 ms); None: no output. `preNorm` skips capped rows so the cost is real. Lab select Reflex Full/Limited/None
  and Wiring Evolved/Designed (both restart the contest's evolution). Default Limited + Evolved.
- **Measures.** Frozen Understanding probe (Word: 60 items where the frequency guess is wrong and the neighbours
  imply the answer, e.g. Q_ICK→U, N_WLY→E, reflex 0%). Beyond-reflex = full-task accuracy − 25.3%. Ablations
  (none / all units / self / enemy / self+enemy / reflex / neighbour detectors) every 100 generations or on
  "Run ablation". Unit readout: which answer each unit's learned synapses favour, sorted by selectivity.
  Charts: probe (dashed aqua) and beyond (orange) on the generations chart; unit-class census in the Lab.
  CSV/JSON export carry them (probe_acc, beyond_reflex, units_*, pong_open_side, pong_duel_winners).
- **Pong** (brain.js `PONG_UX`, only when genome.ux exists; save key bumped to .s3, the old Pong save is left in
  localStorage untouched): thalamus re-split [96,64,48,48]+64 context; the 176-cell context grid of Assoc becomes
  88 evolved units ×2 cells. Aiming is possible because the contact point sets the return angle (pong.js).
  Probe (`pongProbe`): 40 frozen serves while the enemy is a statue at 80% / 20% height; acc = serves won
  outright; a perfect tracker wins 65% (bounce luck). Beyond-reflex = share of the brain's returns that beat the
  statue − 65%. Duel stat `duelWinners` = share of the champion's returns its opponent then missed. The benchmark
  vs the tracker is unchanged (the tracker never misses, so winners there are always 0).
- Headless: `ABL=<every> node tests/evochoice.mjs <contest|pong> rounds K lamarck matchSec size seed reflex wiring`.

### Understanding experiments, interim (Oct 27 2026 08:58 EDT; 1 arena, Lamarckian, 60-s Word / 30-s Pong duels)
`ABL=50 node tests/evochoice.mjs text 400 1 1 60 2800 <seed 1-3> <0 Full | 1 Limited>`, Pong the same with 30-s duels.
- **Word completion, ~60-80 generations, 3 seeds each:** full-task accuracy Full 10-18%, Limited 15-17% (reflex
  guess 25.3%): beyond-reflex is NEGATIVE in all 6 runs (−7 … −15 points). Probe 2-5% (reflex 0%; 60 items, ±3%).
  Neighbour/bigram detectors exist from the random seed wiring (~55 / ~45 units) and their count does not grow.
  Ablation at gen 50: silencing neighbour detectors does not lower the probe (it is at the floor); silencing all
  units cuts the full task 16→12 / 17→5 / 15→8%. Most selective units are reflex units (“gap at 5 → T”) and a few
  neighbour units (“E at 4 + gap at 5 → R”, “S at 4 + gap at 5 → S”). **No understanding has emerged yet.**
- **Pong, 40 generations:** Full: benchmark returns 86-94%, probe 40-48% of serves won vs the statue (tracker 65%),
  open-side 55-71% of returns (tracker 65%) → beyond-reflex −10 … +6 points: no aiming yet. Limited: the capped,
  decaying tracking reflex cripples returns (38% in 2 seeds, 74% in 1), probe 18-23%. Knocking out enemy units cut
  returns 38→22% (seeds 2, 3), i.e. the enemy context is used for HITTING, not for aiming; silencing all units
  raised the seed-1 probe 43→58% (the units add noise to aim).

### Baseline runs, final (stopped 09:33 EDT; Word 78-100 generations, Pong 72-77)
| run | gens | full task / returns | probe | beyond-reflex | open side | units nbr/bigram, self, enemy |
|---|---|---|---|---|---|---|
| Word Full s1/s2/s3 | 91/100/99 | 18 / 16 / 17% | 10 / 5 / 1.7% | −7 / −9 / −8 | | 56/40, 47/56 nbr/bigram; ~31-37 self, 11-12 enemy |
| Word Limited s1/s2/s3 | 80/85/78 | 18 / 20 / 18% | 3.3 / 3.3 / 1.7% | −7 / −5 / −7 | | (same seed wiring; counts did not change) |
| Pong Full s1/s2/s3 | 73/74/72 | 94 / 90 / 98% | 62.5 / 55 / 70% | +8.5 / −3.9 / +8.7 | 74 / 61 / 74% | enemy 26/32/27, self 10/14/5 |
| Pong Limited s1/s2/s3 | 73/77/76 | 76 / 48 / 40% | 47.5 / 15 / 27.5% | +0.5 / −10.5 / −0.3 | 66 / 55 / 65% | as Full (same seeds) |
Probe noise: Word 60 items (±4 points at 5%), Pong 40 serves (±8 points at 65%). Only 0-4 thrones changed per run:
selection barely acted. Word ablation (gen 100, Full s2): all units 16→8% full task, neighbour detectors 16→19% (no
loss). Pong Full ablations (gen 40): silencing all units RAISED the probe in all 3 seeds (+2.5…+15 points) and cut
returns 0-8 points; silencing enemy units cut returns 74→68%, 90→86%, 86→76% (s1 Limited / Full s2 / s3) but did not
lower the probe. Verdict: no understanding emerged; Pong Full seeds 1 and 3 aim ~9 points better than a tracker, within
noise. Fix runs (Oct 27 09:35): `FIX=nbr,mix,rate` Word (bigram-only stage 40 gens, 40 probe-style puzzles in the
benchmark, 3× unit-wiring mutation, 2 arenas) and `FIX=aim,statue,rate` Pong (aimed-winner reward 1.5× hitR, half of
each duel practised against a statue, 3× mutation).

### Fix runs, results (Oct 27 09:35-10:20 EDT, Limited Word / Full Pong, 3 seeds)
| run | gens | full task / returns | probe | beyond-reflex | notes |
|---|---|---|---|---|---|
| Word `FIX=nbr,mix,rate` s1/s2/s3 | 44 (killed) | 15-18% | 5-6.7% | −7 … −10 | no better than baseline; reflex guess is 25.3% |
| Pong `FIX=aim,statue,rate` s1/s2/s3 | 50/50/46 | 100 / 96 / 100% (vs tracker) | 72.5 / 50 / 62.5% | open side 72.5 / 64.5 / 69.4% → +7.5 / −0.5 / +4.4 | duel winners 0-11% |
Pong ablation at gen 30 (stored champion weights): open side 67 / 72 / 67%; seed 1 enemy knockout cut probe 55→40%
and returns 88→76%, seeds 2/3 no enemy effect. Detectors: "enemy moving up + my paddle moving up → UP", "enemy paddle
low + ball just below my paddle → DOWN". Verdict: fixes improved tracking (returns ~96-100%) but aim beyond a tracker
stays within probe noise (±8 points); Word shows no understanding.

### Other contests, brief runs (6 generations, Limited, 3 seeds, /tmp/ux3)
| contest | probe (round log) | full task / champ | beyond | ablation |
|---|---|---|---|---|
| add | 0-10% | 3-7% | −3 … −7 | — |
| big (14 close pairs) | 36-50% (re-measure 71-86%) | champ 78-93% | 0 … +15.6 | s2 enemy knockout 71→57% probe |
| divisor | 5-7.5% (re-measure 15-20%) | 23-49% | −17 … −43 | knockouts move probe ≤±8 points (noise) |
| evenodd | 41-62% (re-measure 93-100%) | 98-99% | +51 | no knockout matters: the designed tiles read the ones digit |
| pattern (5 items) | 0-20% (re-measure 80-100%) | 95-100% | +45 … +50 | same: designed tiles, not units |
| simon | 22-32% (re-measure 35-47%) | 24-44% | −2 … +18 | silencing all units RAISES probe (s1 47→62%) |
Big/evenodd/pattern "beyond reflex" comes from the designed (uncapped) tiles, not evolved units; the cap applies to
units only. Probe values in the round log (post-duel weights) and ablation re-measures (stored weights) disagree.
Examples: "enemy's last answer R + B=0 → L", "I am on a 3+ losing streak + A=7 → 2". No contest showed unit-driven
understanding in these short runs. echo/dots/rps have no probe (no reflex-wrong items defined); RPS hidden cycle not built.
Tests after the fixes (Oct 27 10:30 EDT): page.test.cjs ALL PASS; live game smoke in Chromium + WebKit, desktop + iPhone
viewport, no errors; Lab understanding panels checked in both engines.

## Growing lexicon for Word completion (Oct 28 2026; js/lexicon.js, commit 261b15a)
The lexicon was a fixed curated list (643 PUZZLE5 words, same order each cycle). Now it grows:
- **Source**: the 643 curated words (same seeded order as before) + 2,014 common ENABLE 5-letter words (`COMMON5` in words5.js; Zipf >= 3.0 in wordfreq, CC BY-SA 4.0; slurs/vulgar words removed) = 2,657 words, ranked by index.
- **Held-out set**: 300 words never admitted (100 curated words of rank >= 200 + 200 extras). Every 10 generations the champion is tested on 100 held-out items ("new words") and 100 items from the 50 most-shown words ("familiar"), using the current level's gap positions. Pink line = new, dotted lime = familiar on the chart.
- **Pool**: starts at max(25, level n) words. Caps per level 40/40/60/150/400/unbounded. Each word keeps [shown, correct, EMA accuracy (alpha 0.15)].
- **Draw**: 80% weighted from the active pool with weight 1/(1+shown/12), so repeats are de-emphasised; 20% uniform from retired words (review). Gap positions come from the level, or with 25% probability from the level below.
- **Retirement** after each generation: shown >= 24 and EMA >= 0.7 (mastered), or shown >= 60 (worn out). If the pool is over the cap, the most-shown words are retired too.
- **Admission**: at least 3 never-seen words per generation, in source order. Target pool = min(cap, max(start, kept) + 3).
- **Stats**: the UI line `#lexStat` shows active / seen of 2,357 / retired / +new this cycle / repeat share / 300 held out, plus new vs familiar %. Also in the Lab CSV (lex_*, new_word_acc, familiar_word_acc, first_sight_acc, familiar_live_acc) and the JSON export. State persists in the save; old saves get a fresh lexicon at their level.
- **Unchanged**: curriculum levels, per-level thresholds, level benchmarks, Reaper valid-alternate acceptance, and the understanding/ablation metrics.
- **Control**: `opts.lexicon='static'` (`LEX=static` in evochoice.mjs) keeps the old fixed list and still records the stats.

**Tests.** tests/lexicon.test.mjs passes (300 simulated cycles):
- words seen grew 28 → 175 → 475 → 925;
- at least 3 new words every cycle;
- the pool stayed within the cap;
- 0 held-out words were drawn;
- repeat share over the last 100 cycles was 0.7%, against 40.9% for the fixed list;
- a real 3-generation Evolution round-tripped through save and restore.

page.test passes, the smoke runs pass in Chromium and WebKit on desktop and phone (a watch duel, then a reload keeps the lexicon), and the live deploy serves lexicon.js.

**Early results.** Three seeds per condition, K=1, Limited reflex, Lamarckian, 30-s duels, about 57-68 generations. The test sets are 100 items, so each number is about ±9 points. The reflex letter-frequency guess on held-out items is 23% at level 1 and 25% at level 2.

| condition | new words, last test | familiar words | level-1 benchmark | level-ups |
|---|---|---|---|---|
| growing | 25 / 29 / 28% | 36 / 38 / 52% | 54-64% | none |
| fixed | 17 / 14 / 21% | 40 / 52 / 36% | 41-68% | 2 of 3 seeds (gen 37, gen 51) |

What this shows:
- With the growing lexicon, new-word accuracy sits at the frequency-guess level (about 23-25%) and holds there.
- With the fixed list, new-word accuracy falls below that guess as the brains memorise (s2 is at 14-16% while its familiar accuracy is 52-60%).
- So the growth removes memorisation and the generalisation gap, but nothing has learned spelling rules beyond the reflex guess yet.
- Growth also slows the level-1 pass: no growing run has levelled up so far.

**Caveats:**
- The familiar set is the current top-50 most-shown words, so it moves over time.
- At cap 40 with rotation, no word reached 20 showings, so there is little live "familiar" data.
- Level benchmarks are still the first n curated words.
- The association tiles still come from the 643 curated words.
- The held-out curated words are more common than the held-out extras.

## Lab (LAB button or L)
Benchmark curve vs chance, live rolling accuracy, dopamine (RPE) trace with reward pulses, champion synapse
histogram + per-generation drift, spike raster (24 sampled cells × 9 areas) + firing rates (Hz), lineage and
copy-error effects by gene, every Reaper verdict, Lamarck vs Darwin per contest, CSV and JSON export.

## Known weaknesses
- Addition at 0–7 + 0–7 and beyond gets ~60–70% on that level's benchmark in 3,000 trials; reaching 0–9 + 0–9
  well needs a longer lifetime or several generations (evolution carries the curriculum level and the weights).
- Smallest divisor: 7 … 31, 37+ and prime-vs-37+ cannot be learned from the disclosed features.
- Simon's working memory is a modelled buffer; the brain learns the readout, not the memorising.
- The full-task probe costs one extra benchmark every 10 generations.
- Big brains are slower than real time.
- Word completion at the full 643-word level plateaus around the position-frequency baseline (≈20–25% vs 25%):
  the brain clearly learns words in the small levels (25 words: 2–8% → 50–88%) but at full size its 2 cells per
  conjunction tile are too noisy to beat "guess the commonest letter for that slot" by much (700 ms think: ≈25%).

## Plateau rule (2026-10-30, finished from the Oct 29 draft)
Lamarckian champions keep their best-benchmarked synapses, so the champion's bar is the max of many noisy lifetimes
(winner's curse) and selection stopped acting (0 reaps for 20+ gens on divisor/simon/text). After `plateau` (8)
generations with no new champion and no better snapshot, a challenger is judged against the champion's own post-duel
benchmark from the same duel (paired, still THE REAPER's margin + sign test) and copy errors are doubled. Choice
contests only (Pong excluded, see below). CSV columns: plateau, plateau_stag, champ_post_duel_acc; toast "Plateau broken".
evochoice (`PLAT=0|8 ABL=0 node tests/evochoice.mjs <contest> 10 4`, seed 12345, 40 gens, ONE seed each, so small evidence):
| contest | plateau off | plateau on (8) |
| divisor | champ 73%, full 40%, 0 reaps | champ 80%, full 44%, 1 reap |
| simon   | champ 67%, full 33%, 0 reaps | champ 78%, full 47%, 1 reap |
| text    | champ 40%, full 12%, 0 reaps | champ 38%, full 14%, 1 reap |
| pong    | champ 48%, 0 reaps           | champ 44% -> 28% after a plateau crown (best kept 44%) -> excluded |
Next: repeat on 3+ seeds before trusting the effect; add the like-for-like Limited-reflex baseline (brain silenced).
