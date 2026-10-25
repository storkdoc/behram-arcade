# NEURO STORM — a balanced spiking virtual cortex

Live: https://storkdoc.github.io/behram-arcade/games/neuro-storm/

A real-time 3D brain with 4,000 spiking neurons (2,400 on phones/tablets, `?n=` to override) in the cortical shell of two folded hemispheres. Click or tap a neuron to stimulate it, and a chain reaction spreads through its neighbours, then dies out and the network returns to rest.

## Neuron count: classic 4K (CPU) or GPU cortex tiers (55K / 147K / 276K / 1M / 10M experimental)
The **Neuron count** selector (or `?tier=4k|55k|147k|276k|1m|10m`) switches models. Without a parameter, `js/boot.js` picks a tier: software GL gets 55K, phones get 55K, tablets get 147K, Apple GPUs get 1M and other desktops get 276K. If the frame rate is poor in the first seconds it steps down one tier. Without WebGL2 + `EXT_color_buffer_float` it falls back to the classic 4K model.

GPU cortex (`js/dense.js`, `js/gpunet.js`, `js/dmain.js`, `js/renderdense.js`, `js/column.js`):
- A folded two-hemisphere grey-matter sheet 2.5 mm thick (procedural gyri and sulci, central sulcus, Sylvian and longitudinal fissures, corpus callosum mesh, optional lobe tint).
- Six layers (I, II/III merged, IV, V, VI) with laminar densities. Seven cell classes: L2/3, L4 stellate, L5 and L6 pyramidal cells, plus PV, SST and VIP interneurons, each with its own spiking parameters.
- Canonical microcircuit in-degree matrix (thalamus→IV→II/III→V→VI→IV, horizontal II/III, callosal), with ~700–2,200 effective synapses per neuron.
- The same conductance LIF and spike template as the classic model, in a WebGL2 fragment shader (float ping-pong, 0.05 ms steps, 0.2 ms blocks).
- Synaptic input is drawn per neuron from distance-weighted Gaussian population fields with axonal delays (96-block ring), so synapses are implicit rather than stored.
- Only a 1,536-neuron sample plus totals are read back each frame (raster, inspector trace, layer column view).

Dense balance tuning and checks: `tests/dense_harness.html` and `tests/dense_page.test.cjs`.

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

URL params: `?tier=`, `?n=3000` (classic for n ≤ 6000), `?gl=0` (Canvas2D fallback), `?seed=`, `?thumb` (hide UI).
