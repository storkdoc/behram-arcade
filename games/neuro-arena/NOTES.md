# NEURO ARENA — working notes (contests, THE REAPER, Lab)

## What is live
- **Carousel** of contests (arrows, swipe, click a card, `[`/`]` or ←/→). Each contest has its own evolution,
  champion, Hall of Fame and history (localStorage `neuroArena.v3.<contest>`; the v2 Pong save migrates).
- Visible contests: Pong, Addition (curriculum 0–2 + 0–2 … 0–9 + 0–9), Subtraction (curriculum, 0 ≤ b ≤ a ≤ 2 … 9),
  Bigger number (L/R), Even or odd (E/O, numbers 0–9 → 0–99 → 0–999), Text completion (3-letter words, guess the last letter), Rock paper scissors (answer the move
  that beats theirs), Echo (repeat a letter A–H), Count the dots (1–6), Pattern completion (a, a+d, a+2d, ?),
  Simon (repeat a two-colour sequence; a 2-character answer scored per character).
- Not built: Odd one out (needs three input slots), Matching pennies (adversarial, no fixed right answer for the
  Reaper's frozen benchmark), Air hockey (a Pong variant; Pong already covers it).
- Hidden: Addition small (`add5`, fixed 0..4 + 0..4), Tug-of-war reflex (`tug`). (`add7`/`sub9` were replaced
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

## Evolution (headless Turbo, `node tests/evochoice.mjs <contest> 10 4 1 30`: 4 arenas, Lamarckian, 30-s duels)
- Addition: champion benchmark 24% (gen 4) → 26% (gen 12–40); chance 11%; 40 generations in 2 min wall.
- Subtraction: 19% (gen 4) → 38% (gen 8–40); chance 17%.
- In both runs THE REAPER reaped no challenger in 40 generations: the gains came from the champion's own
  learning kept by elitism, and challengers (best 40% vs 38%) never cleared margin + sign test. Copy errors
  mostly hurt (Lab: mean effect per gene is negative). Strict judging stops drift, but it also slows progress.

## Lab (LAB button or L)
Benchmark curve vs chance, live rolling accuracy, dopamine (RPE) trace with reward pulses, champion synapse
histogram + per-generation drift, spike raster (24 sampled cells × 9 areas) + firing rates (Hz), lineage and
copy-error effects by gene, every Reaper verdict, Lamarck vs Darwin per contest, CSV and JSON export.

## Known weaknesses
- Addition at 0–7 + 0–7 and beyond gets ~60–70% on that level's benchmark in 3,000 trials; reaching 0–9 + 0–9
  well needs a longer lifetime or several generations (evolution carries the curriculum level and the weights).
- Even or odd only wires the ones and tens digits (the hundreds digit is shown but has no input tile).
- Big brains are slower than real time.
