(api) => {
  // RULE INDUCTION / PROGRAM SEARCH. Enumerates a grammar of symbolic programs over the input tokens, keeps a
  // running record for each (a soft version space) and answers with the best-supported simplest program.
  // GENOME → native form:
  //   abstraction depth  1: unary programs (copy, shift, constant)  2: + binary (sum, difference, compare,
  //                      extrapolate, pointer)  3: + ternary (a + b − c, analogical differences)
  //   compositionality   ≥ 0.5 adds pair lookup tables (rules over two positions at once)
  //   memory capacity    > 0.1 adds single-position lookup tables (finite rules "if x1 = R then P")
  //   search budget      caps how many programs are kept (40 … 2,000)
  //   confidence gate    the hit rate a program needs before it may answer
  //   biases             numeric: arithmetic on digit values · temporal: periodicity and extrapolation ·
  //                      relational: rules keyed by the sameness pattern of the input (survive relabelling)
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]);
  const depth = g('depth', 2), comp = g('compose', 0.5), mem = g('memory', 0.5), cap = Math.round(40 + g('search', 0.5) * 1960), gate = g('gate', 0.8);
  let ans, n, hyps, x, M, aval;
  const val = t => /^\d$/.test(t) ? +t : /^[A-Z]$/.test(t) ? t.charCodeAt(0) - 65 : /^#\d$/.test(t) ? +t.slice(1) : null;
  const toAns = v => { if (v == null || !isFinite(v)) return null; for (const a of ans) if (aval[a] === v) return a;
    if (M && v === Math.round(v)) { const w = ((v % M) + M) % M; for (const a of ans) if (aval[a] === w) return a; } return null; };
  const spf = k => { for (const p of [2, 3, 5, 7]) if (k % p === 0) return String(p); return 'P'; };
  const sig = x => { const m = new Map(); return x.map(t => { if (!m.has(t)) m.set(t, m.size); return m.get(t); }).join(''); };
  const table = (s, key, c) => ({ s, c, tab: new Map(), f(x) { const k = key(x); return k == null ? null : this.tab.get(k) ?? null; }, up(x, a) { const k = key(x); if (k != null) this.tab.set(k, a); } });
  function build() {
    const H = [], I = [...Array(n).keys()], num = B('numeric');
    for (const a of ans) H.push({ s: `always ${a}`, c: 1, f: () => a });
    for (const i of I) H.push({ s: `copy x${i}`, c: 2, f: x => x[i] ?? null });
    if (num) for (const i of I) for (let c = -3; c <= 3; c++) if (c) H.push({ s: `x${i}${c > 0 ? '+' : ''}${c}`, c: 3, f: x => toAns(val(x[i]) + c) });
    if (mem > 0.1) for (const i of I) H.push(table(`table(x${i})`, x => x[i] ?? null, 5));
    if (B('temporal')) H.push({ s: 'repeat with the shortest period', c: 4, f: x => { for (let p = 1; p <= 3; p++) { let ok = x.length > p; for (let i = p; i < x.length; i++) if (x[i] !== x[i - p]) ok = false; if (ok) return x[x.length - p]; } return null; } });
    if (B('relational')) { H.push(table('table(sameness pattern)', x => sig(x), 4));
      H.push({ s: 'copy the token at the position the sameness pattern points to', c: 5, pt: new Map(), f(x) { const j = this.pt.get(sig(x)); return j == null ? null : x[j]; }, up(x, a) { const j = x.indexOf(a); if (j >= 0) this.pt.set(sig(x), j); } }); }
    if (depth >= 2) {
      if (num) {
        for (const i of I) for (const j of I) if (i !== j) { if (i < j) H.push({ s: `x${i}+x${j}`, c: 3, f: x => toAns(val(x[i]) + val(x[j])) }); H.push({ s: `x${i}−x${j}`, c: 3, f: x => toAns(val(x[i]) - val(x[j])) }); }
        for (const i of I) for (const j of I) if (i < j) H.push({ s: `${ans[0]} if x${i}>x${j} else ${ans[1]}`, c: 4, f: x => val(x[i]) == null || val(x[j]) == null || x[i] === x[j] ? null : val(x[i]) > val(x[j]) ? ans[0] : ans[1] });
        if (B('temporal')) H.push({ s: 'extrapolate 2·x[−1]−x[−2]', c: 4, f: x => x.length < 2 ? null : toAns(2 * val(x[x.length - 1]) - val(x[x.length - 2])) });
        H.push({ s: 'smallest prime factor', c: 5, f: x => { if (!x.every(t => /^\d$/.test(t))) return null; const k = +x.join(''); return k > 1 ? (ans.includes(spf(k)) ? spf(k) : null) : null; } });
      }
      H.push({ s: 'x[k] where the last token #k points', c: 4, f: x => { const k = val(x[x.length - 1]); return /^#/.test(x[x.length - 1]) && k >= 1 && k < x.length ? x[k - 1] : null; } });
      if (comp >= 0.5 && mem > 0.1) for (const i of I) for (const j of I) if (i < j) H.push(table(`table(x${i},x${j})`, x => x[i] == null || x[j] == null ? null : x[i] + '|' + x[j], 6));
    }
    if (depth >= 3 && num) for (const i of I) for (const j of I) for (const k of I) if (i !== j && j !== k && i !== k) H.push({ s: `x${k}+(x${j}−x${i})`, c: 6, f: x => toAns(val(x[k]) + val(x[j]) - val(x[i])) });
    for (const h of H) { h.hit = 0; h.err = 0; h.last = null; }
    return H.slice(0, cap);
  }
  return {
    init(spec) { ans = spec.answers; n = spec.inputLen; aval = {}; for (const a of ans) aval[a] = val(a);
      const vs = ans.map(a => aval[a]); M = vs.every((v, i) => v === i) ? ans.length : 0; hyps = build(); },
    observe(input) { x = input; for (const h of hyps) { try { h.last = h.f(x); } catch (e) { h.last = null; } } },
    predict() {
      let best = null, bs = -1e9;
      for (const h of hyps) { if (h.last == null || h.hit < 3) continue; if (h.hit / (h.hit + h.err) < gate) continue;
        const sc = h.hit - 3 * h.err - h.c * 0.5; if (sc > bs) { bs = sc; best = h; } }
      this.why = best ? best.s : 'no trusted program';
      return best ? best.last : null;
    },
    learn(fb) { for (const h of hyps) { if (h.last != null) { if (h.last === fb.answer) h.hit++; else h.err++; } if (h.up) h.up(x, fb.answer); } },
    size() { return hyps.reduce((s, h) => s + 1 + (h.tab ? h.tab.size : 0) + (h.pt ? h.pt.size : 0), 0); },
  };
}
