# NEURO ARENA learning audit — progress notes (kept current in case of interruption)

## Bugs found (old live version, before this work)
1. **Capacity bug (sensing):** association cells were a ball-y × paddle-y grid, so "ball above my paddle" was a diagonal the
   brain had to learn cell by cell; a hand-wired ideal brain only reached 0.64–0.73. **Fix:** foveal channel
   fovea(ball−paddle) = 0.5+0.5·tanh(Δ/0.22); ideal brain now 94% on the benchmark, 32/32 and 29/30 live rallies.
2. **Common-mode eligibility drift:** pre×post STDP traces were almost all positive, so every reward moved all synapses together.
   **Fix:** covariance baseline (pre × (post − expected rate)); cuts common-mode eligibility ~55% (partial; causal co-firing remains).
3. **Weak gen-0 learning genes:** explore 1.5 → 2.2, critic 0.5 → 1. Lifetime learning 180 s: 0.36–0.41 → 0.83–0.90 at 600 s.
4. **Selection on a noisy duel:** identical twins "clearly won" 8/16 30-s duels (hit-rate difference SD 0.25). Selection was a coin flip.
   **Fix:** 50-serve fixed benchmark (common random numbers, plasticity frozen, vs a tracker), elitism, ≥2 serves + paired sign test.
5. **Terminal hit/miss dopamine arrives outside the 80 ms eligibility window** (300–800 ms later, <2.4% of trace left); the dense
   approach critic carries the credit. Verified: without the critic the brain barely learns.
6. **Hall of Fame weights not saved** and the rematch condition (gen % 25 === 0) almost never fired with K kids per round. **Fixed.**
7. **Old saves from the buggy learner:** storage key bumped to neuroArena.v2; v1 restores are rejected.
8. **Pool messaging mixups** between watch-mode benchmarks and Turbo — fixed with request ids.

## Findings (not bugs)
- The spiking net is deterministic but chaotic: ±0.05% weight jitter moves the 50-serve benchmark by ±3–4 serves.
  8-bit storage is within that range.
- Darwinian mode: innate wiring stays near random (held-out frozen 0.24–0.28) but evolution improves *learning*: champion D1
  learns to 90% benchmark in a 60-s life vs 50% for gen 0 (Baldwin effect).

## Evolution results (headless, K=6, 2% copy errors, 30-s duels; held-out = 4 seeds × 45 s vs a wall, frozen)
| run | round 1 | 2 | 3 | 6 | 14 (≈330 s wall) | held-out r3 → r14 |
|---|---|---|---|---|---|---|
| L1 | 48% | 76 | 90 | 92 | 96 | 0.948 → 0.971 |
| L2 | 68 | 86 | 86 | 90 | 96 | 0.972 → 0.957 |
| L3 | 50 | 74 | 84 | 88 | 90 | 0.865 → 0.972 |
| D1 (Darwinian) | 46 | 54 | 66 | 92 | 96 | innate 0.37 → 0.25 |
Champion benchmark never dropped in Lamarckian runs. Start: held-out 0.275 (random ≈ 0.24–0.27).

## Darwinian mode (genes only) — weaker, honest numbers
- Old-rule runs D1–D3 (seeds 1–3): reported champion score was inflated by a winner's curse (best of 6 stochastic lifetimes,
  e.g. D3 92% → 62% next rounds). Real ability of the final champions, measured as fresh 30-s lives → benchmark:
  D1 0.84/0.58, D2 0.72/0.58 vs gen 0 0.36/0.40. So genes do evolve better *learners*, but slowly and noisily.
- Fix: Darwinian challengers must also beat the champion's running mean by ≥3 serves. Re-run Dm1–Dm3 pending.
- Bug 9: **Darwinian winner's curse** (above).

## Next steps
- [x] audit.mjs --quick ALL PASS; full run: 2 storage tests too strict (jitter scale) → fixed, re-run pending
- [x] pushed 974e814 (live, verified 200 + new code served)
- [ ] audit.mjs all green (fixed tests: sensory centroid mid-range, covariance %, tonic dopamine, chaos-aware quantization)
- [ ] page tests + WebKit/Chromium render checks, README, push, verify live 200
