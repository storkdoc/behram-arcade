(api) => {
  // SPIKING HEBBIAN NETWORK (Neuro Arena's paradigm, distilled). Tokens drive one-hot input lines
  // (position x token) into a fixed, sparse, random reservoir of leaky integrate-and-fire neurons simulated
  // for T steps; answer populations integrate reservoir spikes through PLASTIC synapses and the first to win
  // the spike count race answers. Learning is a three-factor rule: Hebbian eligibility (pre x post spikes)
  // gated by dopamine (+ when THE REAPER rewards, - when it punishes), plus a teacher-driven Hebbian pulse
  // onto the correct answer population. No backprop, no symbols.
  // GENOME → native form:
  //   memory capacity    reservoir size 60 … 400 neurons      abstraction depth  simulation steps 8 / 12 / 16
  //   learning rate      Hebbian rate 0.002 … 0.2 (log)       search budget      input fan-out 3 … 12 synapses
  //   confidence gate    starting spike-margin threshold      hebbian (mech)     off: dopamine-gated term only
  //   relational (bias)  extra input lines for "token i is the same as token j"
  //   positional (bias)  off: only position-free token lines
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]), Mc = k => !(G.mech && G.mech[k] === false);
  const P = { N: Math.round(60 + g('memory', 0.3) * 340), T: [8, 12, 16][g('depth', 2) - 1], fan: 3 + Math.round(g('search', 0.33) * 9), eta: 0.002 * Math.pow(100, g('lr', 0.5)), tau: 0.8, th: 1.0,
    teach: Mc('hebbian'), rel: B('relational'), pos: G.biases ? B('positional') : true };
  const R = api.rand; let th = Math.max(0.05, (g('gate', 0.7) - 0.5) * 1.2), ans, K, lines = new Map(), inW = [], W, x, spk, out;
  const line = k => { if (!lines.has(k)) { lines.set(k, inW.length); const c = []; for (let f = 0; f < P.fan; f++) c.push([Math.floor(R() * P.N), 0.6 + R() * 0.8]); inW.push(c); } return lines.get(k); };
  function run(input) {
    const act = (P.pos ? input.map((t, i) => line(i + ':' + t)) : []).concat(input.map(t => line('*:' + t)));
    if (P.rel) for (let i = 0; i < input.length; i++) for (let j = i + 1; j < input.length; j++) if (input[i] === input[j]) act.push(line('=' + i + ',' + j));
    const v = new Float32Array(P.N), cnt = new Float32Array(P.N), o = new Float32Array(K);
    for (let s = 0; s < P.T; s++) {
      for (const l of act) for (const [j, w] of inW[l]) v[j] += w * (0.7 + 0.3 * R());
      for (let j = 0; j < P.N; j++) { if (v[j] >= P.th) { cnt[j]++; v[j] = -0.2; for (let k = 0; k < K; k++) o[k] += W[k][j]; } v[j] *= P.tau; }
    }
    return { cnt, o };
  }
  return {
    init(spec) { ans = spec.answers; K = ans.length; lines = new Map(); inW = []; W = Array.from({ length: K }, () => Array.from({ length: P.N }, () => R() * 0.02)); },
    observe(input) { x = input; const r = run(x); spk = r.cnt; out = r.o; },
    predict() { let b = 0, s = -1; for (let k = 0; k < K; k++) if (out[k] > out[b]) b = k; for (let k = 0; k < K; k++) if (k !== b) s = Math.max(s, out[k]);
      this.m = (out[b] - s) / (out[b] + 1e-6); return this.m > th ? ans[b] : null; },
    learn(fb) { // homeostatic confidence threshold: a wrong answer raises it a lot, a right one lowers it a little
      if (fb.pred != null) th = Math.min(0.95, Math.max(0.02, th + (fb.correct ? -0.01 : 0.04))); else if (fb.answer === ans[out.indexOf(Math.max(...out))]) th = Math.max(0.02, th - 0.004);
      const y = ans.indexOf(fb.answer), pk = fb.pred == null ? -1 : ans.indexOf(fb.pred), da = fb.pred == null ? 0 : fb.correct ? 1 : -1;
      const tot = spk.reduce((a, b) => a + b, 0) || 1;
      for (let j = 0; j < P.N; j++) { if (!spk[j]) continue; const pre = spk[j] / tot * 10;
        if (pk >= 0) W[pk][j] = Math.max(0, W[pk][j] + P.eta * da * pre);           // dopamine-gated eligibility
        if (P.teach) W[y][j] += P.eta * pre;                                       // teacher Hebbian pulse
        for (let k = 0; k < K; k++) if (k !== y) W[k][j] = Math.max(0, W[k][j] - P.eta * pre / K); } },  // heterosynaptic depression
    size() { return K * P.N + inW.length * P.fan; },
  };
}
