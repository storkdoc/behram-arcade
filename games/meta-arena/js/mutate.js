/* GENESIS: the generic HYBRID controller (used by crossover between paradigms). It is real code that embeds
   both parts' code verbatim; each part receives its own sub-genome (api.genome.parts[i]). */
export function hybridCode(codeA, codeB, mode = 'cascade') {
  return `(api) => {
  // HYBRID (${mode}). Each part keeps a shadow record of what THE REAPER would have given its own answers.
  // ${mode === 'cascade' ? 'Cascade: the first part (in order) that answers AND has a trusted record answers.' : 'Arbiter: of the parts that answer with a trusted record, the best record answers.'}
  const G = api.genome || {}, gate = (G.genes && G.genes.gate) || 0.7, win = 30;
  const parts = [(${codeA}), (${codeB})].map((f, i) => f({ genome: (G.parts || [])[i] || {}, params: {}, rand: api.rand }));
  const rec = parts.map(() => []), pr = parts.map(() => null); let who = -1;
  const score = i => rec[i].length < 6 ? 0 : rec[i].reduce((s, v) => s + v, 0) / rec[i].length;
  return {
    init(spec) { parts.forEach(p => p.init({ answers: spec.answers.slice(), inputLen: spec.inputLen })); rec.forEach(r => r.length = 0); },
    observe(x) { parts.forEach((p, i) => { p.observe(x.slice()); try { pr[i] = p.predict(); } catch (e) { pr[i] = null; } }); },
    predict() { who = -1;
      ${mode === 'cascade'
        ? 'for (let i = 0; i < parts.length; i++) if (pr[i] != null && score(i) >= gate) { who = i; break; }'
        : 'let bs = -1e9; for (let i = 0; i < parts.length; i++) if (pr[i] != null && score(i) >= gate && score(i) > bs) { bs = score(i); who = i; }'}
      return who < 0 ? null : pr[who]; },
    learn(fb) { parts.forEach((p, i) => { const ok = pr[i] != null && (pr[i] === fb.answer || (fb.correct && pr[i] === fb.pred));
      if (pr[i] != null) { rec[i].push(ok ? 1 : 0); if (rec[i].length > win) rec[i].shift(); }
      p.learn({ answer: fb.answer, pred: pr[i], correct: ok }); }); },
    size() { return parts.reduce((s, p) => s + ((p.size && p.size()) || 0), 0); },
  };
}`;
}
