(api) => {
  // EVOLUTIONARY PROGRAM TREES (genetic programming inside one lifetime). A population of arithmetic
  // expression trees over the numeric values of the input tokens is evolved every few trials on a buffer of
  // recent episodes (tournament selection, subtree crossover and mutation). The fittest tree answers when its
  // buffer accuracy beats THE REAPER's 2/3 break-even; its output is rounded and mapped onto the answer alphabet.
  // GENOME → native form: search budget = population 20 … 120; abstraction depth = initial tree depth 2 / 3 / 4;
  //   memory capacity = episode buffer 20 … 140; learning rate = how often it evolves (every 16 … 2 trials);
  //   confidence gate = buffer accuracy the best tree needs before it answers.
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d);
  const P = { pop: Math.round(20 + g('search', 0.4) * 100), every: Math.max(2, Math.round(16 - g('lr', 0.5) * 14)), gens: 3, buf: Math.round(20 + g('memory', 0.33) * 120), depth: 1 + g('depth', 3), trust: Math.max(0.6, g('gate', 0.8)) };
  const R = api.rand; let ans, n, aval, M, pop = [], buf = [], x, best = null, bestAcc = 0, t = 0;
  const val = s => /^\d$/.test(s) ? +s : /^[A-Z]$/.test(s) ? s.charCodeAt(0) - 65 : /^#\d$/.test(s) ? +s.slice(1) : 0;
  const OPS = ['+', '-', '*', 'mod', 'max', 'min', 'gt'];
  const leaf = () => R() < 0.7 ? { v: Math.floor(R() * n) } : { c: Math.floor(R() * 7) - 2 };
  const grow = dp => dp <= 0 || R() < 0.3 ? leaf() : { op: OPS[Math.floor(R() * OPS.length)], a: grow(dp - 1), b: grow(dp - 1) };
  const ev = (nd, xs) => { if (nd.v !== undefined) return xs[nd.v] ?? 0; if (nd.c !== undefined) return nd.c; const a = ev(nd.a, xs), b = ev(nd.b, xs);
    switch (nd.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case 'mod': return b ? ((a % b) + b) % b : 0; case 'max': return Math.max(a, b); case 'min': return Math.min(a, b); default: return a > b ? 1 : 0; } };
  const nodes = nd => nd.op ? 1 + nodes(nd.a) + nodes(nd.b) : 1;
  const clone = nd => JSON.parse(JSON.stringify(nd));
  const pick = nd => { const all = []; (function w(z) { all.push(z); if (z.op) { w(z.a); w(z.b); } })(nd); return all[Math.floor(R() * all.length)]; };
  const out = (tr, xs) => { const v = Math.round(ev(tr, xs)); if (!isFinite(v)) return null; for (const a of ans) if (aval[a] === v) return a;
    if (M) { const w = ((v % M) + M) % M; return ans[w]; } return ans[((v % ans.length) + ans.length) % ans.length]; };
  const fit = tr => { let c = 0; for (const [xs, a] of buf) if (out(tr, xs) === a) c++; return buf.length ? c / buf.length - 0.002 * nodes(tr) : 0; };
  function evolve() { for (let g = 0; g < P.gens; g++) { const sc = pop.map(tr => [fit(tr), tr]).sort((a, b) => b[0] - a[0]);
      const el = sc.slice(0, 6).map(s => s[1]), tour = () => { let b = null; for (let i = 0; i < 3; i++) { const c = sc[Math.floor(R() * sc.length)]; if (!b || c[0] > b[0]) b = c; } return b[1]; };
      const nx = el.map(clone); while (nx.length < P.pop) { const c = clone(tour()); const r = R();
        if (r < 0.5) { const s = pick(c), d = pick(tour()); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, clone(d)); }
        else { const s = pick(c); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, grow(2)); }
        if (nodes(c) < 40) nx.push(c); }
      pop = nx; }
    let b = null, bs = -1; for (const tr of pop) { const f = fit(tr); if (f > bs) { bs = f; b = tr; } } best = b; bestAcc = bs; }
  return {
    init(spec) { ans = spec.answers; n = spec.inputLen; aval = {}; for (const a of ans) aval[a] = /^[A-Z]$/.test(a) || /^\d$/.test(a) ? val(a) : NaN;
      const vs = ans.map(a => aval[a]); M = vs.every((v, i) => v === i) ? ans.length : 0; pop = Array.from({ length: P.pop }, () => grow(P.depth)); buf = []; best = null; t = 0; },
    observe(input) { x = input.map(val); },
    predict() { return best && bestAcc >= P.trust && buf.length >= 12 ? out(best, x) : null; },
    learn(fb) { buf.push([x, fb.answer]); if (buf.length > P.buf) buf.shift(); if (++t % P.every === 0) evolve(); },
    size() { return pop.reduce((a, tr) => a + nodes(tr), 0); },
  };
}
