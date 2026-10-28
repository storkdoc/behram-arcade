(api) => {
  // BAYESIAN STRUCTURE AVERAGING. Every subset of up to two input positions defines a Dirichlet-multinomial
  // model p(answer | those tokens); the full context is one more model. Models are weighted by their
  // prequential marginal likelihood (Bayesian model averaging), and the posterior predictive is used with
  // the Bayes-optimal decision rule for THE REAPER: answer iff p(best) > 2/3.
  // GENOME → native form: confidence gate = decision threshold (≥ 2/3 is Bayes-optimal under THE REAPER);
  //   compositionality ≥ 0.3 adds the two-position models; learning rate sets the prior strength alpha
  //   (fast learner = weak prior); relational bias adds a model keyed by the sameness pattern.
  const G = api.genome || {}, g = (k, d) => (G.genes && G.genes[k] != null ? G.genes[k] : d), B = k => !!(G.biases && G.biases[k]);
  const P = { alpha: 1.5 - g('lr', 0.5) * 1.4, thresh: Math.max(0.5, g('gate', 0.67)), pairs: g('compose', 0.5) >= 0.3, rel: B('relational') };
  const sig = x => { const m = new Map(); return x.map(t => { if (!m.has(t)) m.set(t, m.size); return m.get(t); }).join(''); };
  let ans, K, models, x, keys;
  return {
    init(spec) { ans = spec.answers; K = ans.length; const n = spec.inputLen; models = [{ pos: [] }];
      for (let i = 0; i < n; i++) models.push({ pos: [i] });
      if (P.pairs) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) models.push({ pos: [i, j] });
      models.push({ pos: 'all' }); if (P.rel) models.push({ pos: 'sig' });
      for (const m of models) { m.t = new Map(); m.logev = 0; } },
    observe(input) { x = input; keys = models.map(m => m.pos === 'all' ? x.join('|') : m.pos === 'sig' ? sig(x) : m.pos.map(i => x[i] ?? '∅').join('|')); },
    dist(mi) { const c = models[mi].t.get(keys[mi]); const tot = c ? c.tot : 0; return ans.map(a => ((c && c[a]) || 0) + P.alpha).map(v => v / (tot + P.alpha * K)); },
    predict() {
      const mx = Math.max(...models.map(m => m.logev)); let wsum = 0; const p = new Array(K).fill(0);
      models.forEach((m, i) => { const w = Math.exp(m.logev - mx); wsum += w; const d = this.dist(i); for (let k = 0; k < K; k++) p[k] += w * d[k]; });
      let b = 0; for (let k = 1; k < K; k++) if (p[k] > p[b]) b = k;
      return p[b] / wsum > P.thresh ? ans[b] : null;
    },
    learn(fb) { const k = ans.indexOf(fb.answer);
      models.forEach((m, i) => { const d = this.dist(i); m.logev += Math.log(d[k] || 1e-9);
        let c = m.t.get(keys[i]); if (!c) { c = { tot: 0 }; m.t.set(keys[i], c); } c[fb.answer] = (c[fb.answer] || 0) + 1; c.tot++; }); },
    size() { let s = 0; for (const m of models) s += m.t.size * 2; return s; },
  };
}
