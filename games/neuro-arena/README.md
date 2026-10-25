# NEURO ARENA

Two spiking brains play Pong against each other. The winner spawns a copy of itself, with small copy errors, and the copy replaces the loser. Over the generations the champion lineage gets better at returning the ball. You can watch it live, run turbo evolution in Web Workers, or play the champion yourself.

## Brain (per player, 2,800 conductance-based integrate-and-fire neurons, 80/20 E/I, Dale's law)
| area | E | I |
|---|---|---|
| Thalamus (relay + TRN) | 320 | 80 |
| Sensory cortex (ball x/y, paddle y population codes) | 640 | 160 |
| Association cortex (gain-field ball-y × paddle-y cells + ball-y × vy context cells) | 960 | 240 |
| Motor L5 UP / DOWN | 160 / 160 | 80 |

- Physiology matches NEURO STORM: rest −70 mV, threshold ≈ −55 mV, spike peak +35 mV, AHP ≈ −79 mV, 2 ms absolute refractory period plus relative refractoriness (a threshold and K⁺ conductance that decay), EPSP reversal 0 mV, IPSP reversal −80 mV, 0.5 ms time step, axonal delays.
- About 190k fixed synapses and 77k plastic synapses (association→motor).
- The paddle velocity is decoded from the rate competition between the UP and DOWN populations.
- **Learning:** reward-modulated STDP, a three-factor rule. STDP pre/post traces (τ 20 ms) feed eligibility traces (gene τ), which are multiplied by a dopamine reward-prediction error. Hits give a burst and misses a dip, and an approach critic adds a small shaping reward. Homeostatic synaptic scaling holds the motor rates near a target.

## Genome (49 genes) and copy errors
- **The genes:** sensory gain and receptive-field width, motion anticipation, connection probabilities and weights per pathway, E/I balance, 16 innate axon-guidance genes (bias association bands toward UP or DOWN), motor WTA, background and exploration drive, decoder gain, learning rate, LTD/LTP, eligibility and dopamine τ, reward sizes, wMax, homeostasis, noise, and 5 structural genes (velocity-context pathway, TRN, recurrence, motor self-excitation, wiring seed).
- **Copy errors:** each spawn copies each gene with probability = **copy-error rate** (default 2%). Of the errors, ~85% are small (Gaussian, 12% of range), ~13% are point errors (40% of range), and ~2% are structural (a pathway flips on or off, or the wiring is re-rolled).
- **Inheritance:**
  - In **Lamarckian** mode (default), learned weights are inherited too, with per-synapse copy errors at the same rate.
  - In **Darwinian** mode, each spawn starts from innate wiring and must learn from scratch.
- **Selection:**
  - The champion duels its spawn for a 30 s match.
  - The spawn takes the throne only on a *clear* win: lead ≥ 2, or lead 1 with a clearly better hit rate (a 1–0 fluke keeps the incumbent).
  - A Hall of Fame of 5 keeps the best champions, and every 25 generations the best HoF member gets a rematch if the reigning champion's record is well below it (elitism).

## Controls
- **Mac:** W/S or ↑/↓ moves your paddle in Play mode. Space serves. A gamepad works too.
- **iPhone/iPad:** drag on the court to move, and tap to serve. Use the ☰ drawer for controls and the tabs for panels.
- **Modes:** Watch (live duel per generation), Turbo (parallel workers), Play (you vs the champion, first to 11).
- **Saving:** progress auto-saves to localStorage. You can export or import the champion as JSON.

## Tests
- `node tests/evolve.mjs [gens] [K] [rate] [lamarck] [matchSec] [tag]` runs headless evolution and evaluates against a wall-serving tracker.
- `tests/page.test.cjs` runs Playwright on desktop, iPhone and iPad.

## Measured (headless, tests/evolve.mjs, eval = hit rate vs a wall-serving tracker, 6 seeds × 60 s; random paddle ≈ 0.26)
| run | gen 0 | ~gen 32 | ~gen 64 | ~gen 96 | later |
|---|---|---|---|---|---|
| Lamarckian, 2% (shipped rules), K=4 | 0.26 | 0.46 | 0.51 | **0.56** | 0.41 (gen 120) |
| Lamarckian, 2%, variant selection rules (2 runs) | 0.26 | 0.30–0.40 | 0.32–0.38 | 0.31–0.33 | 0.32–0.33 (gen 150) |
| Lamarckian, 0% copy errors, K=2 | 0.26 | 0.34 | 0.32 | 0.40 (gen 90) | |
| Lamarckian, 20% copy errors, K=2 | 0.26 | 0.39 | 0.41 | 0.41 (gen 90) | |
| Darwinian, 2% | 0.26 | 0.36 | 0.36 | | |

About 100 generations take roughly 5 minutes (4 cores, Node). The results are noisy from run to run, and a champion can also be dethroned by a lucky spawn.
