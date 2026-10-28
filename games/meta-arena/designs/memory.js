(api) => {
  // MEMORY LOOKUP (episodic, nearest neighbour). Stores every episode verbatim. An exact match answers by the
  // vote of the stored answers; otherwise the k most similar episodes vote, and it answers only when the vote
  // clears its confidence gate.
  // GENOME → native form:
  //   memory capacity    episodes kept (16 … 4,096, oldest forgotten first)
  //   search budget      neighbours polled k (1 … 15)
  //   abstraction depth  1: raw positional overlap  2: + numeric closeness of digits (numeric bias)
  //                      3: + bag-of-tokens overlap (ignores layout)
  //   confidence gate    vote share needed to answer
  //   biases             relational: also recall by the sameness pattern, storing answers as "the token at
  //                      position j" so a recalled answer transfers to new tokens
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]);
  const cap = Math.round(16 * Math.pow(256, g('memory', 0.6))), K = 1 + Math.round(g('search', 0.3) * 14), depth = g('depth', 1), conf = g('gate', 0.7), rel = B('relational'), num = B('numeric');
  let mem = [], exact = new Map(), sigm = new Map(), x, key, sk;
  const sig = x => { const m = new Map(); return x.map(t => { if (!m.has(t)) m.set(t, m.size); return m.get(t); }).join(''); };
  const sim = (a, b) => { let s = 0; const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { if (a[i] === b[i]) s++; else if (depth >= 2 && num && /^\d$/.test(a[i]) && /^\d$/.test(b[i])) s += Math.max(0, 1 - Math.abs(a[i] - b[i]) / 3) * 0.5; }
    if (depth >= 3) { const ca = {}; for (const t of a) ca[t] = (ca[t] || 0) + 1; let o = 0; for (const t of b) if (ca[t] > 0) { ca[t]--; o++; } s = 0.5 * s + 0.5 * o; }
    return s / n; };
  const vote = e => { let b = null, bc = 0, t = 0; for (const a in e) { t += e[a]; if (e[a] > bc) { bc = e[a]; b = a; } } return [b, t ? bc / t : 0, t]; };
  return {
    init() { mem = []; exact = new Map(); sigm = new Map(); },
    observe(input) { x = input; key = input.join('\u0001'); sk = rel ? sig(input) : null; },
    predict() {
      const e = exact.get(key);
      if (e) { const [b, c] = vote(e); if (c >= conf) return b; }
      if (rel) { const s = sigm.get(sk); if (s) { const [j, c, t] = vote(s); if (c >= conf && t >= 3) return j === 'none' ? null : x[+j]; } }
      if (mem.length < K) return null;
      const sc = mem.map(m => [sim(m.x, x), m.a]).sort((p, q) => q[0] - p[0]).slice(0, K);
      if (sc[0][0] < 0.5) return null;
      const v = {}; let tot = 0; for (const [s, a] of sc) { v[a] = (v[a] || 0) + s; tot += s; }
      const [b, c] = vote(v); return c >= conf ? b : null;
    },
    learn(fb) { const e = exact.get(key) || {}; e[fb.answer] = (e[fb.answer] || 0) + 1; exact.set(key, e);
      if (rel) { const j = x.indexOf(fb.answer), s = sigm.get(sk) || {}; const jj = j < 0 ? 'none' : String(j); s[jj] = (s[jj] || 0) + 1; sigm.set(sk, s); }
      mem.push({ x, a: fb.answer }); if (mem.length > cap) { const o = mem.shift(); const ok = o.x.join('\u0001'); const oe = exact.get(ok); if (oe && --oe[o.a] <= 0) { delete oe[o.a]; if (!Object.keys(oe).length) exact.delete(ok); } } },
    size() { return mem.length * (x ? x.length + 1 : 1) + sigm.size; },
  };
}
