(api) => {
  // BASELINE: answer the most frequent answer seen so far, only when it has been right more than 2/3 of the time.
  let c = {}, t = 0;
  return { init() { c = {}; t = 0; }, observe() {},
    predict() { let b = null, bc = 0; for (const a in c) if (c[a] > bc) { bc = c[a]; b = a; } return t && bc / t > 0.67 ? b : null; },
    learn(fb) { c[fb.answer] = (c[fb.answer] || 0) + 1; t++; }, size() { return Object.keys(c).length; } };
}
