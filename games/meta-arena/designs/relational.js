(api) => {
  // RELATIONAL RECODER (open-ended design, proposed by the offline LLM designer as a wild card).
  // It never learns about tokens directly. Every trial is recoded into ROLES: which positions hold the same
  // token, and (with the numeric bias) which are in order or successors. The answer is recoded too, as an
  // EXPRESSION over the input ("copy the token at j", "token at j plus c", or a literal token). It learns,
  // for each relational signature, which expression has been right, backing off from the full signature to
  // coarser ones (sameness only, then nothing) by evidence. Because roles are blind to what the symbols look
  // like, what it learns survives a relabelling of the alphabet.
  // GENOME → native form: abstraction depth = how many signature levels it backs off through (1 … 3);
  //   memory capacity = max distinct signatures kept (32 … 8,192); confidence gate = vote share to answer;
  //   numeric bias = order/successor relations and "+c" expressions; compositionality ≥ 0.5 = also key by
  //   the last token's identity (a mixed role + content key); learning rate = how fast old counts decay.
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]);
  const depth = g('depth', 3), cap = Math.round(32 * Math.pow(256, g('memory', 0.6))), gate = g('gate', 0.7), num = B('numeric'), mix = g('compose', 0.5) >= 0.5, decay = 1 - 0.02 * g('lr', 0.5);
  let ans, x, keys, tabs, aval, nkeys = 0;
  const val = t => /^\d$/.test(t) ? +t : /^[A-Z]$/.test(t) ? t.charCodeAt(0) - 65 : null;
  const same = x => { const m = new Map(); return x.map(t => { if (!m.has(t)) m.set(t, m.size); return m.get(t); }).join(''); };
  const order = x => { if (!num) return ''; const v = x.map(val); if (v.some(z => z == null)) return 'x'; let s = ''; for (let i = 0; i + 1 < v.length; i++) s += v[i + 1] === v[i] + 1 ? 's' : v[i + 1] > v[i] ? '<' : v[i + 1] < v[i] ? '>' : '='; return s; };
  // all expressions that reproduce the answer from this input
  const exprs = (x, a) => { const out = []; x.forEach((t, j) => { if (t === a) out.push('c' + j); });
    if (num && val(a) != null) x.forEach((t, j) => { const v = val(t); if (v != null && v !== val(a)) { const c = val(a) - v; if (Math.abs(c) <= 3) out.push('p' + j + ':' + c); } });
    out.push('L' + a); return out; };
  const apply = (e, x) => { if (e[0] === 'c') return x[+e.slice(1)] ?? null; if (e[0] === 'L') return e.slice(1);
    const [j, c] = e.slice(1).split(':').map(Number), v = val(x[j]); if (v == null) return null; const w = v + c; for (const a of ans) if (aval[a] === w) return a; return null; };
  const keysOf = x => { const k = [same(x) + '/' + order(x) + (mix ? '/' + x[x.length - 1] : ''), same(x) + '/' + order(x), same(x)]; return k.slice(0, depth).concat(['*']); };
  return {
    init(spec) { ans = spec.answers; aval = {}; for (const a of ans) aval[a] = val(a); tabs = new Map(); nkeys = 0; },
    observe(input) { x = input; keys = keysOf(x); },
    predict() {
      for (const k of keys) { const t = tabs.get(k); if (!t || t.n < 3) continue;
        // score each expression by how often it was right under this signature; answer with the best one
        let best = null, bv = 0; for (const e in t.c) if (t.c[e] > bv) { bv = t.c[e]; best = e; }
        if (best && bv / t.n >= gate) { const a = apply(best, x); if (a != null && ans.includes(a)) return a; } }
      return null;
    },
    learn(fb) { const es = exprs(x, fb.answer);
      for (const k of keys) { let t = tabs.get(k); if (!t) { if (nkeys >= cap) continue; t = { n: 0, c: {} }; tabs.set(k, t); nkeys++; }
        t.n = t.n * decay + 1; for (const e in t.c) t.c[e] *= decay; for (const e of es) t.c[e] = (t.c[e] || 0) + 1; } },
    size() { let s = 0; for (const t of tabs.values()) s += 1 + Object.keys(t.c).length; return s; },
  };
}
