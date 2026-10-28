(api) => {
  // NEXT-TOKEN PREDICTOR (transformer-lite). The trial is a token sequence plus a query slot; a learned query
  // attends over token+position embeddings (one head), the attended vector and the flattened context feed a
  // tanh layer, and the next token is read out by a softmax whose output embeddings are TIED to the input
  // embeddings (attending to a token makes it easy to say it: the copy/induction trick of LLMs). Trained
  // online by backprop (cross-entropy) with rehearsal.
  // GENOME → native form:
  //   learning rate      SGD step 0.003 … 0.3 (log)       abstraction depth  hidden width 16 / 32 / 48
  //   memory capacity    rehearsal buffer 16 … 4,096       search budget      rehearsal steps per trial 0 … 8
  //   attention (mech)   off: the attended vector is replaced by the mean embedding
  //   relational (bias)  adds sameness bits (is token i the same as token j) to the input features
  //   metacog (mech)     answers only when p > gate AND its shadow record over the last 30 confident trials ≥ gate
  const G = api.genome || {}, gn = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]), Mc = k => !(G.mech && G.mech[k] === false);
  const P = { d: 16, H: [16, 32, 48][gn('depth', 2) - 1], lr: 0.003 * Math.pow(100, gn('lr', 0.75)), replay: Math.round(gn('search', 0.5) * 8), buf: Math.round(16 * Math.pow(256, gn('memory', 0.5))),
    thresh: Math.max(0.5, gn('gate', 0.7)), gate: Math.max(0.5, gn('gate', 0.7)), win: 30, att: Mc('attention'), rel: B('relational'), meta: Mc('metacog') };
  const R = api.rand, d = P.d, H = P.H;
  let ans, K, n, V = new Map(), E = [], Pos, q, W1, b1, W2, b2, g = 1, buf = [], cur, nparam = 0, shadow = [], guess = null, conf = 0;
  const rnd = s => (R() * 2 - 1) * s, vec = (k, s) => Array.from({ length: k }, () => rnd(s));
  const emb = t => { if (!V.has(t)) { V.set(t, E.length); E.push(vec(d, 0.5)); } return V.get(t); };
  function fwd(toks) {
    const ids = toks.map(emb), m = ids.length, e = ids.map((id, i) => E[id].map((v, k) => v + Pos[i][k]));
    const s = e.map(ei => ei.reduce((a, v, k) => a + v * q[k], 0) / Math.sqrt(d)); const mx = Math.max(...s);
    const ex = s.map(v => Math.exp(v - mx)), Z = ex.reduce((a, b) => a + b, 0), at = ex.map(v => v / Z);
    const c = new Array(d).fill(0); e.forEach((ei, i) => { for (let k = 0; k < d; k++) c[k] += at[i] * ei[k]; });
    if (!P.att) { at.fill(1 / m); c.fill(0); e.forEach(ei => { for (let k = 0; k < d; k++) c[k] += ei[k] / m; }); }
    const u = c.slice(); for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) u.push(i < m ? e[i][k] : 0);
    if (P.rel) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) u.push(i < m && j < m && toks[i] === toks[j] ? 1 : 0);
    const h = W1.map((row, j) => Math.tanh(row.reduce((a, w, k) => a + w * u[k], b1[j])));
    const aid = ans.map(emb);
    const lg = ans.map((_, o) => W2[o].reduce((a, w, j) => a + w * h[j], b2[o]) + g * E[aid[o]].reduce((a, v, k) => a + v * c[k], 0));
    const lm = Math.max(...lg), pe = lg.map(v => Math.exp(v - lm)), pz = pe.reduce((a, b) => a + b, 0);
    return { ids, e, at, c, u, h, aid, p: pe.map(v => v / pz), m };
  }
  function train(toks, target) {
    const f = fwd(toks), lr = P.lr, y = ans.indexOf(target); if (y < 0) return;
    const dl = f.p.map((v, o) => v - (o === y ? 1 : 0));
    const dc = new Array(d).fill(0), dh = new Array(H).fill(0);
    for (let o = 0; o < K; o++) { const Eo = E[f.aid[o]], gdl = g * dl[o];
      for (let j = 0; j < H; j++) { dh[j] += W2[o][j] * dl[o]; W2[o][j] -= lr * dl[o] * f.h[j]; } b2[o] -= lr * dl[o];
      let dot = 0; for (let k = 0; k < d; k++) { dot += Eo[k] * f.c[k]; dc[k] += gdl * Eo[k]; } g -= lr * 0.1 * dl[o] * dot;
      for (let k = 0; k < d; k++) Eo[k] -= lr * gdl * f.c[k]; }
    const du = new Array(f.u.length).fill(0);
    for (let j = 0; j < H; j++) { const dp = dh[j] * (1 - f.h[j] * f.h[j]); if (!dp) continue; const row = W1[j];
      for (let k = 0; k < du.length; k++) { du[k] += row[k] * dp; row[k] -= lr * dp * f.u[k]; } b1[j] -= lr * dp; }
    for (let k = 0; k < d; k++) dc[k] += du[k];
    const de = f.e.map((_, i) => du.slice(d + i * d, d + i * d + d));
    const da = f.e.map(ei => ei.reduce((a, v, k) => a + v * dc[k], 0)), sa = da.reduce((a, v, i) => a + v * f.at[i], 0);
    if (!P.att) f.e.forEach((ei, i) => { for (let k = 0; k < d; k++) de[i][k] += f.at[i] * dc[k]; });
    else f.e.forEach((ei, i) => { const ds = f.at[i] * (da[i] - sa) / Math.sqrt(d); for (let k = 0; k < d; k++) { de[i][k] += f.at[i] * dc[k] + ds * q[k]; q[k] -= lr * ds * ei[k]; } });
    f.ids.forEach((id, i) => { for (let k = 0; k < d; k++) { E[id][k] -= lr * de[i][k]; Pos[i][k] -= lr * de[i][k]; } });
  }
  return {
    init(spec) { ans = spec.answers; K = ans.length; n = spec.inputLen + 1; V = new Map(); E = []; buf = []; shadow = [];
      Pos = Array.from({ length: n }, () => vec(d, 0.5)); q = vec(d, 0.3); g = 1;
      const U = d + n * d + (P.rel ? n * (n - 1) / 2 : 0); W1 = Array.from({ length: H }, () => vec(U, 1 / Math.sqrt(U))); b1 = new Array(H).fill(0);
      W2 = Array.from({ length: K }, () => vec(H, 1 / Math.sqrt(H))); b2 = new Array(K).fill(0);
      ans.forEach(emb); nparam = H * (U + 1) + K * (H + 1) + n * d + d; },
    observe(input) { cur = input.concat(['?']); },
    predict() { const p = fwd(cur).p; let b = 0; for (let k = 1; k < K; k++) if (p[k] > p[b]) b = k; guess = ans[b]; conf = p[b];
      const rec = shadow.length >= 8 ? shadow.reduce((a, v) => a + v, 0) / shadow.length : 0;
      return conf > P.thresh && (!P.meta || rec >= P.gate) ? guess : null; },
    learn(fb) { if (conf > P.thresh) { shadow.push(guess === fb.answer ? 1 : 0); if (shadow.length > P.win) shadow.shift(); }
      train(cur, fb.answer); for (let r = 0; r < P.replay && buf.length; r++) { const ex = buf[Math.floor(R() * buf.length)]; train(ex[0], ex[1]); }
      buf.push([cur, fb.answer]); if (buf.length > P.buf) buf.splice(Math.floor(R() * buf.length), 1); },
    size() { return nparam + E.length * d; },
  };
}
