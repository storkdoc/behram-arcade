/* NEURO STORM headless physiology + balance test (no browser).
   Run:  node games/neuro-storm/tests/balance.test.mjs   [N]   (default: runs N=4000 and N=2400)
   Verifies the single-cell action potential, absolute/relative refractoriness and return to
   rest, then the network: a point stimulus gives a cascade that spreads and dies out, repeated
   stimulation works, refractoriness shows up, low inhibition runs away and high inhibition blocks. */
import { Net, DT, NET, PHYS, relEnd } from '../js/sim.js';

let fails = 0;
const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const run = (net, ms) => { let s = 0; for (let k = 0, n = Math.round(ms / DT); k < n; k++) s += net.step(); return s; };
const inject = (net, i, amp, ms) => { net.Iext[i] += amp; net.pulses.push({ idx: [i], amps: [amp], end: net.step_ + Math.round(ms / DT) }); };

// ---------- 1. single neuron ----------
function singleCell(type) {
  const net = new Net(400, 3);
  net.p.noise = 0; net.p.wE = 0; net.p.wI = 0;
  const i = net.type.indexOf(type); const T = type ? PHYS.I : PHYS.E;
  run(net, 300);
  const rest = net.V[i];
  // rheobase-ish 1 ms pulse that just fires the cell at rest
  let lo = 0, hi = 60;
  for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2; const s0 = net.nSpk[i]; inject(net, i, m, 1); run(net, 5); const fired = net.nSpk[i] > s0; run(net, 300); if (fired) hi = m; else lo = m; }
  const rheo = hi * 1.1;
  // spike waveform
  net.select(i); inject(net, i, rheo, 1);
  const tr = []; let crossV = null; for (let k = 0; k < 60 / DT; k++) { net.step(); tr.push(net.V[i]); if (crossV === null && net.last[i] === net.step_ - 1) crossV = net.V0[i]; }
  const pk = Math.max(...tr), kp = tr.indexOf(pk), mn = Math.min(...tr.slice(kp)), km = tr.indexOf(mn, kp);
  const half = (pk + crossV) / 2; let w0 = -1, w1 = -1; tr.forEach((v, k) => { if (v >= half) { if (w0 < 0) w0 = k; w1 = k; } });
    const r = { rest: +rest.toFixed(1), thresholdAtSpike: +crossV.toFixed(1), peak: +pk.toFixed(1), halfWidthMs: +((w1 - w0) * DT).toFixed(2), AHPmin: +mn.toFixed(1), AHPminAtMs: +((km - kp) * DT).toFixed(1), rheobase_uA: +rheo.toFixed(1) };
  // refractoriness probes, timed from the actual spike
  const probe = (delay, amp, dur = 1) => {
    run(net, 500); const s0 = net.nSpk[i]; inject(net, i, 60, 0.5);
    let k = 0; while (net.nSpk[i] === s0 && k++ < 40) net.step();
    const tSpk = net.last[i] * DT; run(net, Math.max(0, delay - (net.t - tSpk)));
    const s1 = net.nSpk[i]; inject(net, i, amp, dur); run(net, dur + 3); return { first: s1 > s0, second: net.nSpk[i] > s1 };
  };
  r.absHuge = probe(T.tAbs - 0.35, 2000, 0.3);      // 2000 uA/cm2 for 0.3 ms, ending inside the absolute refractory period
  r.rel_rheo = probe(T.tAbs + 1.5, rheo);           // relative refractory: the rheobase pulse fails...
  r.rel_strong = probe(T.tAbs + 1.5, rheo * 2.5);   // ...but a much stronger one fires
  r.late_rheo = probe(400, rheo);                   // recovered: rheobase fires again
  const t2 = []; run(net, 500); inject(net, i, 60, 0.5); for (let k = 0; k < 400 / DT; k++) { net.step(); t2.push(net.V[i]); }
  r.backWithin1mVms = +(t2.findIndex((v, k) => k > 200 && Math.abs(v - rest) < 1.0) * DT).toFixed(1);
  return r;
}
for (const type of [0, 1]) {
  const nm = type ? 'Inhibitory (fast-spiking)' : 'Excitatory (pyramidal)';
  console.log(`== Single ${nm} neuron`);
  const r = singleCell(type);
  console.log('   ', JSON.stringify(r));
  check(Math.abs(r.rest + 70) < 1, 'rests at about -70 mV', r.rest);
  check(r.thresholdAtSpike > -58 && r.thresholdAtSpike < -50, 'fires when V crosses ~-55 mV', r.thresholdAtSpike);
  check(r.peak >= 25 && r.peak <= 40, 'overshoot peak +25..+40 mV', r.peak);
  check(r.halfWidthMs > 0.2 && r.halfWidthMs < 1.5, 'spike half-width 0.2-1.5 ms', r.halfWidthMs);
  check(r.AHPmin <= -74 && r.AHPmin >= -82, 'afterhyperpolarisation undershoot -74..-82 mV', r.AHPmin);
  check(r.backWithin1mVms > 0 && r.backWithin1mVms < 250, 'membrane returns to within 1 mV of rest (ms after spike)', r.backWithin1mVms);
  check(r.absHuge.first && !r.absHuge.second, `absolute refractory (${type ? PHYS.I.tAbs : PHYS.E.tAbs} ms): even a 2000 uA/cm2 pulse cannot fire it`, r.absHuge);
  check(r.rel_rheo.first && !r.rel_rheo.second && r.rel_strong.second, 'relative refractory (1.5 ms after it ends): rheobase pulse fails, 2.5x stronger pulse fires', { rheo: r.rel_rheo, strong: r.rel_strong });
  check(r.late_rheo.second, 'after recovery the rheobase pulse fires again', r.late_rheo);
}
console.log('   EPSP/IPSP (pyramidal at rest):');
{
  const net = new Net(400, 3); net.p.noise = 0; run(net, 200); const i = net.type.indexOf(0);
  net.ringE[net.slot * net.N + i] += NET.gEE; let mx = -99; for (let k = 0; k < 30 / DT; k++) { net.step(); mx = Math.max(mx, net.V[i]); } run(net, 100);
  net.ringI[net.slot * net.N + i] += NET.gIE; let mn = 0; for (let k = 0; k < 40 / DT; k++) { net.step(); mn = Math.min(mn, net.V[i]); } run(net, 100);
  net.V[i] = -60; for (let k = 0; k < 4; k++) { net.Iext[i] = 0.1 * (-70 - -60) * -1; }
  console.log('    unitary EPSP', (mx + 70).toFixed(2), 'mV; unitary IPSP at rest', (mn + 70).toFixed(2), 'mV (E_GABA = -80 mV)');
  check(mx + 70 > 0.5 && mn + 70 < -0.3, 'EPSP depolarises, IPSP hyperpolarises');
}

// ---------- 2. network ----------
function cascade(net, i, ms = 800) {
  net.spikeLog.length = 0;
  net.stimulate(i, 1);
  const bins = []; let b = 0; const bin = Math.round(5 / DT);
  for (let k = 0, n = Math.round(ms / DT); k < n; k++) { b += net.step(); if ((k + 1) % bin === 0) { bins.push(b); b = 0; } }
  const L = net.spikeLog, uniq = new Set(); for (let k = 1; k < L.length; k += 2) uniq.add(L[k]);
  const thr = Math.max(4, 0.003 * net.N);
  // back to baseline: first 5 ms bin after which 100 ms stay below thr
  let back = -1; for (let k = 0; k < bins.length; k++) { let quiet = true; for (let q = k; q < Math.min(bins.length, k + 20); q++) if (bins[q] > thr) { quiet = false; break; } if (quiet && k + 20 <= bins.length) { back = k * 5; break; } }
  const rec = [...uniq];
  const res = { recruited: uniq.size, frac: +(uniq.size / net.N).toFixed(3), peakFrac5ms: +(Math.max(...bins) / net.N).toFixed(3), spikesPerCell: +(L.length / 2 / Math.max(1, uniq.size)).toFixed(2), backMs: back, set: uniq };
  // membrane potential back near rest (mean |V-EL| over recruited cells < 1 mV)
  res.meanVrecruited = +(rec.reduce((a, j) => a + net.V[j], 0) / Math.max(1, rec.length)).toFixed(2);
  net.spikeLog.length = 0;
  return res;
}
function pickSites(net, n, seed) { const out = []; let s = seed; while (out.length < n) { s = (s * 16807) % 2147483647; const i = s % net.N; if (!net.type[i]) out.push(i); } return out; }
const fmt = r => `recruited ${r.recruited} (${(r.frac * 100).toFixed(1)}%), peak ${(r.peakFrac5ms * 100).toFixed(1)}%/5ms, ${r.spikesPerCell} spikes/cell, quiet after ${r.backMs} ms`;

const Ns = process.argv[2] ? [+process.argv[2]] : [4000, 2400];
for (const N of Ns) {
  console.log(`== Network N=${N} (${Math.round(N * 0.8)} E / ${Math.round(N * 0.2)} I)`);
  const net = new Net(N, 7);
  console.log(`    synapses ${net.M} (${(net.M / N).toFixed(1)}/cell)`);
  const sites = pickSites(net, 10, 12345);
  const R = [];
  for (const i of sites) { net.reset(); run(net, 300); const r = cascade(net, i); R.push(r); console.log('    site', i, fmt(r), 'meanV(recruited) after', r.meanVrecruited); }
  const fr = R.map(r => r.frac), med = median(fr);
  check(med >= 0.05 && med <= 0.5, `default: median cascade recruits 5-50% of neurons (got ${(med * 100).toFixed(1)}%)`);
  check(R.filter(r => r.frac > 0.02).length >= 7, 'default: at least 7/10 stimuli spread beyond the stimulated patch', R.map(r => r.recruited));
  check(Math.max(...fr) < 0.75, 'default: no runaway (every cascade < 75% of the brain)', Math.max(...fr));
  check(R.every(r => r.backMs >= 0 && r.backMs <= 400), 'default: every cascade dies out and the network is quiet again within 400 ms', R.map(r => r.backMs));
  check(R.every(r => r.spikesPerCell < 2.2), 'default: cells fire ~once per wave (no reverberation)', R.map(r => r.spikesPerCell));
  check(median(R.map(r => r.peakFrac5ms)) < 0.12, 'default: peak firing fraction stays modest', median(R.map(r => r.peakFrac5ms)));
  // membrane potentials of recruited cells back to rest after 1 s
  { net.reset(); run(net, 300); const r = cascade(net, sites[0], 1500); check(Math.abs(r.meanVrecruited - PHYS.EL) < 1.5, 'recruited cells are back within 1.5 mV of rest 1.5 s later', r.meanVrecruited); }

  // refractoriness of the population: synapses off, the same 1 ms pulse (20 uA/cm2, ~1.2x rheobase) to every cell twice
  const big = sites[R.indexOf(R.reduce((a, b) => (b.frac > a.frac ? b : a)))];
  const patchTest = gap => {
    net.reset(); net.p.wE = 0; net.p.wI = 0; run(net, 300);
    const all = { idx: [...Array(N).keys()], amps: new Array(N).fill(20) };
    const pulse = () => { for (let j = 0; j < N; j++) net.Iext[j] += 20; net.pulses.push({ ...all, end: net.step_ + Math.round(1 / DT) }); };
    net.spikeLog.length = 0; pulse(); run(net, 2.5);
    const patch = new Set(); for (let k = 1; k < net.spikeLog.length; k += 2) patch.add(net.spikeLog[k]);
    run(net, gap - 2.5); net.spikeLog.length = 0; pulse(); run(net, 2.5);
    const re = new Set(); for (let k = 1; k < net.spikeLog.length; k += 2) if (patch.has(net.spikeLog[k])) re.add(net.spikeLog[k]);
    net.spikeLog.length = 0; net.p.wE = 1; net.p.wI = 1; return { patch: patch.size, refired: re.size };
  };
  const gaps = [1.5, 2.5, 4, 6, 8, 12, 20, 40, 100, 400], curve = gaps.map(g => { const r = patchTest(g); return +(r.refired / Math.max(1, r.patch)).toFixed(2); });
  console.log(`    recovery curve, synapses off (${patchTest(1000).patch}/${N} cells fire to the 1st pulse; fraction re-firing to an identical 2nd pulse after gap):`);
  console.log('     ', gaps.map((g, k) => `${g}ms:${curve[k]}`).join('  '));
  check(curve[0] === 0, 'absolute refractory: an identical pulse 1.5 ms later fires none of them', curve[0]);
  check(curve[2] < 0.3 && curve[5] > curve[2] && curve[curve.length - 1] >= 0.95, 'relative refractory: little recovery at 4 ms, partial at 12 ms, full by 400 ms', curve);
  net.reset(); run(net, 300);
  const reps = []; for (let k = 0; k < 4; k++) { reps.push(cascade(net, big, 700).recruited); run(net, 300); }
  console.log('    same site stimulated 4x, 1 s apart: recruited', reps.join(', '));
  check(reps.every(x => x > 0.04 * N), 'repeated stimulation works: every one of 4 stimuli 1 s apart starts a cascade', reps);
  // a 2nd full stimulus 10 ms into a cascade adds little (the stimulated region is refractory)
  net.reset(); run(net, 300); const solo = cascade(net, big, 700).recruited;
  net.reset(); run(net, 300); net.spikeLog.length = 0; net.stimulate(big, 1); run(net, 10); const dbl = cascade(net, big, 690);
  console.log(`    one stimulus ${solo} cells; a second stimulus 10 ms into the cascade -> ${dbl.recruited} cells responded after it`);
  // inhibition sweep
  const sweep = {};
  // directly driven patch (synapses off): what the electrode recruits by itself, with no chain reaction
  const patchFr = []; for (const i of sites.slice(0, 5)) { net.reset(); net.p.wE = 0; net.p.wI = 0; run(net, 300); patchFr.push(cascade(net, i, 100).frac); }
  net.p.wE = 1; net.p.wI = 1;
  console.log(`    electrode alone (synapses off) fires ${patchFr.map(f => Math.round(f * N)).join(', ')} cells at the 5 sweep sites`);
  for (const wI of [0, 0.25, 0.5, 1, 2, 3]) {
    const rs = []; for (const i of sites.slice(0, 5)) { net.reset(); net.p.wI = wI; run(net, 300); rs.push(cascade(net, i, 600)); }
    const spread = median(rs.map((r, k) => Math.max(0, r.frac - patchFr[k])));
    sweep[wI] = { spread, medFrac: median(rs.map(r => r.frac)), medSpikes: median(rs.map(r => r.spikesPerCell)), medPeak: median(rs.map(r => r.peakFrac5ms)), quiet: rs.filter(r => r.backMs >= 0).length };
    console.log(`    inhibition ${Math.round(wI * 100)}%: median recruited ${(sweep[wI].medFrac * 100).toFixed(1)}% (chain-reaction spread beyond the electrode patch ${(sweep[wI].spread * 100).toFixed(1)}%), ${sweep[wI].medSpikes} spikes/cell, peak ${(sweep[wI].medPeak * 100).toFixed(1)}%/5ms, died out ${sweep[wI].quiet}/5`);
  }
  check(sweep[0.25].medFrac > 0.85 && sweep[0.25].medSpikes > 3, 'low inhibition (25%): runaway, nearly every neuron fires repeatedly');
  check(sweep[0].quiet === 0, 'no inhibition: seizure-like activity that does not stop on its own');
  check(sweep[3].spread < sweep[1].spread * 0.4, 'high inhibition (300%): chain-reaction spread is blocked (< 40% of default spread beyond the electrode patch)', `${(sweep[3].spread * 100).toFixed(1)}% vs ${(sweep[1].spread * 100).toFixed(1)}%`);
  net.p.wI = 1;
  // rescue: seizure at 0% inhibition, then restore 100% -> back to quiet
  net.reset(); net.p.wI = 0; run(net, 100); net.stimulate(sites[0], 1); run(net, 300);
  net.p.wI = 1; const bins = []; for (let k = 0; k < 40; k++) bins.push(run(net, 10));
  const quietAt = bins.findIndex((b, k) => bins.slice(k).every(x => x <= Math.max(6, N * 0.006)));
  console.log('    seizure (inhibition 0%) then restore 100%: 10 ms spike counts', bins.slice(0, 15).join(' '), '... quiet after', quietAt * 10, 'ms');
  check(quietAt >= 0 && quietAt * 10 <= 300, 'restoring inhibition terminates the seizure and the network returns to baseline', quietAt * 10);
  net.p.wI = 1;
  // spontaneous activity at default noise
  net.reset(); net.spikeLog.length = 0; run(net, 6000); const spont = net.spikeLog.length / 2 / N / 6; net.spikeLog.length = 0;
  console.log(`    spontaneous rate at default noise: ${spont.toFixed(3)} Hz/neuron`);
  check(spont < 0.2, 'very low spontaneous background firing', spont);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
