# NEURO ARENA — working notes (contests, THE REAPER, Lab)

## What is live
- **Carousel** of contests (arrows, swipe, click a card, `[`/`]` or ←/→). Each contest has its own evolution,
  champion, Hall of Fame and history (localStorage `neuroArena.v3.<contest>`; the v2 Pong save migrates).
- Visible contests: Pong, Addition (0..4 + 0..4), Subtraction (a − b, 0 ≤ b ≤ a ≤ 5), Bigger number (L/R),
  Even or odd (E/O), Text completion (3-letter words, guess the last letter), Rock paper scissors (answer the move
  that beats theirs), Echo (repeat a letter A–H), Count the dots (1–6), Pattern completion (a, a+d, a+2d, ?),
  Simon (repeat a two-colour sequence; a 2-character answer scored per character).
- Not built: Odd one out (needs three input slots), Matching pennies (adversarial, no fixed right answer for the
  Reaper's frozen benchmark), Air hockey (a Pong variant; Pong already covers it).
- Hidden (built, not learning well enough yet): Addition to 12 (`add7`), Subtraction to 8 (`sub9`),
  Addition small (`add5`), Tug-of-war reflex (`tug`). Reach them with `?contest=<id>`.

## THE REAPER (js/contests.js `judge`, `reaper`)
- After each duel, champion and challenger sit the same frozen benchmark: learning off, same items, same order,
  same seed (quiz: every item ×2 shuffled with seed 9001, capped at 80; Pong: 50 fixed serves).
- Per character: +1 right, −2 wrong, 0 abstain. Multi-character answers ("10") are scored per position.
- Reap only if margin ≥ need (quiz: max(3, ceil(5% of max points)); Pong: 2 serves) **and** a paired sign test
  over items passes (b − c ≥ max(1, √(b + c))). Tiebreak: fewer wrong characters, then lower mean latency.
- Verdict pops up on screen (both scores, ✓/✗/abstain counts, margin, sign test, reaped or not), goes into the
  spawn log, the Lab's Reaper table, and the CSV/JSON exports.

## Choice brain (js/cbrain.js)
- Same LIF conductance physiology as Pong. Thalamus → sensory symbol tiles (one tile per symbol per input slot)
  → association gain-field grid (G×G; row = slot-0 symbol, column = slot-1 symbol) → K answer populations with
  winner-take-all inhibition. The answer is the first population to lead the runner-up by a margin (in spikes)
  within 260 ms; otherwise abstain.
- Learning: reward-modulated STDP on association → answer synapses, phasic RPE (reward − running mean),
  covariance eligibility.
- Size slider (quiz contests): 1,400 / 2,800 (default) / 5,600 / 11,200 / 22,400 neurons; every area scales.

| neurons | plastic synapses | fixed synapses | total | speed (1 core) |
|---|---|---|---|---|
| 1,402 | 39K | 90K | 129K | ~4× real time |
| 2,804 (default) | 78K | 200K | 278K | ~2× real time |
| 5,599 | 154K | 404K | 558K | ~0.6× |
| 11,198 | 308K | 830K | 1.14M | ~0.2× |
| 22,396 (max) | 615K | 1.74M | 2.36M | ~0.1× |

Pong brain: fixed 2,800 neurons, ~190K fixed + 77K plastic synapses.

## Learning results (headless, `node tests/learn.mjs <contest> <trials> 1 2800 <every>` with S0=seed;
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

## Lab (LAB button or L)
Benchmark curve vs chance, live rolling accuracy, dopamine (RPE) trace with reward pulses, champion synapse
histogram + per-generation drift, spike raster (24 sampled cells × 9 areas) + firing rates (Hz), lineage and
copy-error effects by gene, every Reaper verdict, Lamarck vs Darwin per contest, CSV and JSON export.

## Known weaknesses
- Arithmetic learns only to ~2× chance in one lifetime; more answers (sums to 12) do not learn.
- Benchmarks are small (Even or odd: 20 items) so easy contests saturate fast.
- Big brains are slower than real time.
