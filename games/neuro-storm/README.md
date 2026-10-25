# NEURO STORM — a balanced spiking virtual cortex

Live: https://storkdoc.github.io/behram-arcade/games/neuro-storm/

A real-time 3D brain with 4,000 spiking neurons (2,400 on phones/tablets, `?n=` to override) in the cortical shell of two folded hemispheres. Click or tap a neuron to stimulate it, and a chain reaction spreads through its neighbours, then dies out and the network returns to rest.

## Model (js/sim.js)
- Conductance-based leaky integrate-and-fire with an explicit spike waveform. Fixed dt = 0.05 ms, typed arrays, ring-buffer axonal delays.
- Rest −70 mV, threshold ≈ −55 mV (σ 1.2 mV), spike peak +35 mV (interneurons +28 mV, narrower), AHP via K⁺ conductance (E_K −90 mV), with a trough of about −79 mV (E cells) or −76 mV (I cells).
- Absolute refractory: 2.0 ms (E) / 1.2 ms (I). Inputs are ignored and the cell cannot fire.
- Relative refractory: the threshold jumps +22 mV (E) / +12 mV (I) and decays (τ 5 / 3 ms), together with the AHP. This lasts roughly 2–17 ms (E) and 1–9 ms (I). A slow adaptation current is present in E cells only.
- 80% excitatory (AMPA, E_rev 0 mV, τ 3 ms) / 20% inhibitory (GABA-A, E_rev −80 mV, τ 7 ms), following Dale's law. Each cell has ~56 E and ~9 I inputs with distance-dependent (Gaussian) connectivity, log-normal weights, distance-scaled delays and homotopic callosal fibres.
- Sparse Poisson background input plus membrane noise.

## Tests
```
node games/neuro-storm/tests/balance.test.mjs [N]      # headless physiology + balance (≈70 s for N=4000)
python3 -m http.server 8080 &                          # from the repo root
NODE_PATH=<playwright-core dir> node games/neuro-storm/tests/page.test.cjs
```
The balance test covers single-cell rest, threshold, AP, AHP, return to baseline, absolute and relative refractoriness, EPSP/IPSP, cascade recruitment, die-out time, repeated stimulation, the population recovery curve, an inhibition sweep (0% → endless seizure, 25% → runaway, 300% → blocked), seizure rescue and spontaneous rate.

URL params: `?n=3000`, `?gl=0` (Canvas2D fallback), `?seed=`, `?thumb` (hide UI).
