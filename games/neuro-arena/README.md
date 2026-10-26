# NEURO ARENA

Two spiking brains compete in a carousel of contests: Pong, Addition, Subtraction, Bigger number, Even or odd and Text completion (see NOTES.md for THE REAPER judge, the brain sizes, the Lab and measured learning). In every contest the winner spawns a copy of itself, with small copy errors, and the copy replaces the loser. Over the generations the champion lineage gets better at returning the ball. You can watch it live, run turbo evolution in Web Workers, or play the champion yourself.

## Brain (per player, 2,800 conductance-based integrate-and-fire neurons, 80/20 E/I, Dale's law)
| area | E | I |
|---|---|---|
| Thalamus (relay + TRN) | 320 | 80 |
| Sensory cortex (ball−paddle foveal code, paddle y, ball distance, vy population codes) | 640 | 160 |
| Association cortex (gain-field (ball−paddle) × paddle-y cells + (ball−paddle) × vy context cells) | 960 | 240 |
| Motor L5 UP / DOWN | 160 / 160 | 80 |

- Physiology matches NEURO STORM: rest −70 mV, threshold ≈ −55 mV, spike peak +35 mV, AHP ≈ −79 mV, 2 ms absolute refractory period plus relative refractoriness (a threshold and K⁺ conductance that decay), EPSP reversal 0 mV, IPSP reversal −80 mV, 0.5 ms time step, axonal delays.
- About 190k fixed synapses and 77k plastic synapses (association→motor).
- The paddle velocity is decoded from the rate competition between the UP and DOWN populations.
- **Sensing:** channel 0 is a foveal code of where the ball is relative to the own paddle, fovea(Δ) = 0.5 + 0.5·tanh(Δ/0.22), so "ball above me → UP" is one linearly separable split.
- **Learning:** reward-modulated STDP, a three-factor rule. STDP pre/post traces (τ 20 ms) feed eligibility traces (gene τ) with a covariance baseline (pre × (post − its expected rate)), multiplied by a dopamine reward-prediction error (DA minus its 2-s running mean). Hits give a burst and misses a dip; the dense approach critic (every 5 ms) does most of the credit assignment, because hit/miss dopamine arrives 300–800 ms after the movement, long after the 80 ms eligibility trace. Homeostatic synaptic scaling holds motor rates near a target.

## Genome (49 genes) and copy errors
- **The genes:** sensory gain and receptive-field width, motion anticipation, connection probabilities and weights per pathway, E/I balance, 16 innate axon-guidance genes (bias association bands toward UP or DOWN), motor WTA, background and exploration drive, decoder gain, learning rate, LTD/LTP, eligibility and dopamine τ, reward sizes, wMax, homeostasis, noise, and 5 structural genes (velocity-context pathway, TRN, recurrence, motor self-excitation, wiring seed).
- **Copy errors:** each spawn copies each gene with probability = **copy-error rate** (default 2%). Of the errors, ~85% are small (Gaussian, 12% of range), ~13% are point errors (40% of range), and ~2% are structural (a pathway flips on or off, or the wiring is re-rolled).
- **Inheritance:**
  - In **Lamarckian** mode (default), learned weights are inherited too, with per-synapse copy errors at the same rate.
  - In **Darwinian** mode, each spawn starts from innate wiring and must learn from scratch.
- **Selection (benchmark, not the duel):**
  - Each round the champion duels K spawns (K = Turbo arenas; 1 in Watch). The duel is the show and a lifetime of learning.
  - Then both brains, with plasticity frozen, play the same **50 fixed serves** against a tracker (common random numbers, deterministic).
  - A spawn takes the throne only if it is ≥ 2 serves better **and** passes a paired sign test (b − c ≥ √(b+c) on discordant serves).
  - Elitism (Lamarckian): the champion keeps its best-scoring synapses; a worse champion copy never replaces them, so the benchmark never drops.
  - Darwinian: the champion's score is the running mean of its last 8 lifetime benchmarks.
  - Hall of Fame of 5 (top 2 saved with synapses); every ≥ 25 generations the best HoF member gets a rematch if it is well above the champion.
  - Generation = one spawn tested (a round of K arenas adds K).

## Controls
- **Mac:** W/S or ↑/↓ moves your paddle in Play mode. Space serves. A gamepad works too.
- **iPhone/iPad:** drag on the court to move, and tap to serve. Use the ☰ drawer for controls and the tabs for panels.
- **Modes:** Watch (live duel per generation), Turbo (parallel workers), Play (you vs the champion, first to 11).
- **Saving:** progress auto-saves to localStorage (`neuroArena.v3.<contest>`; the v2 Pong save is migrated). You can export or import the champion as JSON.

## Tests
- `node tests/audit.mjs [--quick]` is the learning audit: sensing (mirroring, own paddle, vy sign), motor direction and speed, ideal-wiring capacity, STDP sign/timing, dopamine sign, RPE, covariance baseline, lifetime learning with/without the critic, weight persistence/clamping, homeostasis, 8-bit storage, every selection/elitism/HoF/Darwinian path, save/restore, and fitness noise.
- `node tests/evolve.mjs [rounds] [K] [rate] [lamarck] [matchSec] [tag] [seed]` runs headless evolution; held-out test = 4 seeds × 45 s vs a wall, synapses frozen.
- `tests/page.test.cjs` runs Playwright on desktop, iPhone and iPad.
- `node tests/serve.mjs` checks the service rule: after a point against one side, the next serve goes toward the other side (the first serve of a game is random).

## Service

A point against blue (champion, left) is served toward red (spawn, right), and vice versa. In Play mode, a point against you is served toward the champion. The first serve of each game goes to a random side, and the serve angle stays randomized. Turbo, Watch and Play all use the same rule in `js/pong.js`.

## Audit (Oct 2026) — why the old version did not learn
See `AUDIT_NOTES.md`. In short: (1) the sensory code made the right policy a diagonal the brain could not represent well (a hand-wired *ideal* brain only hit 64–73%); (2) STDP eligibility drifted common-mode; (3) gen-0 learning genes were too weak; (4) selection used single 30-s duels, which are a coin flip (identical twins "clearly win" ~25–50% of them, hit-rate SD 0.25–0.28), so evolution drifted and regressed (old best: 0.26 → 0.56 → 0.41).

## Measured (headless, K=6 arenas, 2% copy errors, 30-s duels; random paddle 0.24 on the benchmark, 0.27 held-out)
| run | round 1 | round 2 | round 3 | round 6 | round 14 | held-out (frozen, vs wall) |
|---|---|---|---|---|---|---|
| Lamarckian seed 1 | 48% | 76% | 90% | 92% | 96% | 0.275 → 0.948 (r3) → 0.971 |
| Lamarckian seed 2 | 68% | 86% | 86% | 90% | 96% | 0.275 → 0.972 (r3) → 0.957 |
| Lamarckian seed 3 | 50% | 74% | 84% | 88% | 90% | 0.275 → 0.865 (r3) → 0.972 |
| **mean (range)** | 55 (48–68) | 79 (74–86) | 87 (84–90) | 90 (88–92) | 94 (90–96) | r14: 0.967 (0.957–0.972) |

A round is ~20 s wall per arena on one core (box), so ≥ 80% took 3 rounds ≈ 77–86 s; the champion benchmark never dropped. Lifetime learning alone (one gen-0 brain vs a wall, 600 s): last 30 s 0.84–0.90 across 3 seeds. Darwinian: innate wiring stays near random; what evolves is learning speed (champion reaches 90% benchmark in a 60-s life vs 50% for gen 0).

## Rendering & robustness
- The WebGL view renders HDR + bloom into a **non-multisampled** half-float target. With a 4× MSAA half-float target, Safari/WebKit, and Chrome on some Macs, left large opaque black rectangles over the scene, so MSAA is now opt-in (`?msaa=1`).
- After startup, after each resize, and periodically, the renderer reads back a few pixel rows. If the frame is dark or has pure-black holes, it steps down: MSAA → no MSAA → no post-processing → **Canvas 2D renderer**. The 2D renderer is also used if WebGL is missing or the context is lost (`?r2d` forces it).
- If module Web Workers fail or don't respond, the simulation runs on the main thread (`?noworker` forces it).
- Errors show in an on-screen banner. Watch mode starts on load, with no click needed.
