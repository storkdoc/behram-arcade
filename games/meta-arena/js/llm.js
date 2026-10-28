/* GENESIS live LLM mode (optional). The user's own key for an OpenAI-compatible endpoint (xAI, OpenAI, …) is
   kept in this browser's localStorage only and sent only to the endpoint the user typed. The LLM may only
   PROPOSE designs (a genome edit, or open-ended code) and write rationales; THE REAPER alone selects. */
import { GENES, BIASES, MECHS, PARADIGMS } from './genome.js';
const LS = 'genesis.llm.v1';
export const llmCfg = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
export const saveCfg = c => localStorage.setItem(LS, JSON.stringify(c));
export const hasKey = () => { const c = llmCfg(); return !!(c.key && c.endpoint && c.model); };
export const FORBIDDEN = /\bimport\b|\bfetch\b|XMLHttpRequest|WebSocket|postMessage|\bself\b|globalThis|constructor|__proto__|prototype|\beval\b|Function\s*\(|\bwindow\b|\bdocument\b|localStorage|setTimeout|setInterval|while\s*\(\s*true\s*\)/;
const INTERFACE = `A design is ONE JavaScript expression: a factory (api) => ({ init(spec), observe(input), predict(), learn(fb), size() }).
- api.genome = { genes:{memory 0..1, depth 1..3, compose 0..1, search 0..1, lr 0..1, gate 0.5..0.95}, biases:{numeric,positional,relational,temporal}, mech:{metacog,replay,attention,hebbian} }, api.rand() = seeded uniform RNG. Translate the genome into your own native form.
- init({answers, inputLen}): a new task begins; answers = the list of legal answer tokens (strings). You are never told what the task is.
- observe(input): input = array of string tokens (digits, letters, words, or arbitrary glyphs when scrambled).
- predict(): return one of answers, or null to abstain.
- learn({answer, pred, correct}): the right answer for the trial just played.
- size(): number of stored numbers/entries (for statistics only).
Scoring by THE REAPER: +1 right, -2 wrong, 0 abstain. Score = mean of S (fraction solved on fresh unseen task families), Q (speed: trials until 16 of the last 20 are right), X (fraction solved when every token is relabelled to random glyphs and positions are permuted).
Hard rules: pure computation only, no import, fetch, eval, Function, self, globalThis, window, document, timers, constructor, prototype or infinite loops. Each task runs 240 trials and must finish in about 6 s.`;
export function buildPrompt(slot, seed, history) {
  const sys = `You are ${slot.brain === 'A' ? 'PROMETHEUS, Brain A, a structuralist AI designer' : slot.brain === 'B' ? 'SIBYL, Brain B, an empiricist AI designer' : 'the WILD CARD designer, who must invent a radically new learning paradigm'} in GENESIS, a meta-evolution arena that searches for learning METHODS that generalize to unseen tasks. Reply with JSON only.`;
  const seedTxt = JSON.stringify(seed.genome);
  const perf = seed.sel ? seed.sel.per.map(p => `${p.family}${p.scrambled ? '(scrambled)' : ''}: solved ${(p.solved * 100).toFixed(0)}%${p.steps ? ' in ' + p.steps + ' trials' : ''}`).join('; ') : 'n/a';
  const known = Object.keys(PARADIGMS).filter(p => p !== 'hybrid').join(', ');
  let ask;
  if (slot.slot === 'W') ask = `Invent ONE new learning paradigm that is not any of: ${known}. Write its full code.
Return {"name": short evocative name, "paradigm": short id, "rationale": 2-4 sentences, "code": the factory expression as a string, "genome": a genome object}.`;
  else ask = `The seed genome THE REAPER passed on: ${seedTxt}
Its last results per stream: ${perf}
Either EDIT the genome (genes, biases, mechanisms; for hybrids also parts and mode "cascade"|"arbiter"), or write NEW CODE that reinterprets it.
Return {"name": short name, "rationale": 2-4 sentences, "genome": the full edited genome, "edits": [short strings], "code": optional factory expression string}.`;
  return [{ role: 'system', content: sys + '\n\n' + INTERFACE + `\nGenes: ${JSON.stringify(Object.fromEntries(Object.entries(GENES).map(([k, v]) => [k, v.desc])))}\nBiases: ${JSON.stringify(BIASES)}\nMechanisms: ${JSON.stringify(MECHS)}` },
    { role: 'user', content: (history ? 'Lineage so far: ' + history + '\n\n' : '') + ask }];
}
export async function callLLM(messages, { timeoutMs = 90000 } = {}) {
  const c = llmCfg(); if (!c.key) throw new Error('no API key set');
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(c.endpoint.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, messages, temperature: 0.8 }) });
    if (!r.ok) throw new Error(`LLM endpoint answered ${r.status}`);
    const j = await r.json(); const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('LLM reply had no JSON');
    return JSON.parse(m[0]);
  } finally { clearTimeout(to); }
}
// sanitize an LLM genome: clamp genes, keep known keys, recurse into hybrid parts
export function cleanGenome(g, fallback) {
  const out = JSON.parse(JSON.stringify(fallback));
  if (!g || typeof g !== 'object') return out;
  if (typeof g.paradigm === 'string') out.paradigm = g.paradigm.slice(0, 40);
  for (const k in GENES) { const v = +((g.genes || {})[k]); if (isFinite(v)) { const G = GENES[k]; out.genes[k] = G.int ? Math.round(Math.min(G.max, Math.max(G.min, v))) : +Math.min(G.max, Math.max(G.min, v)).toFixed(3); } }
  for (const grp of ['biases', 'mech']) for (const k in out[grp] || {}) if (g[grp] && typeof g[grp][k] === 'boolean') out[grp][k] = g[grp][k];
  if (out.paradigm === 'hybrid' && Array.isArray(g.parts) && g.parts.length === 2) { out.parts = g.parts.map((p, i) => cleanGenome(p, (fallback.parts || [])[i] || fallback)); out.mode = g.mode === 'arbiter' ? 'arbiter' : 'cascade'; }
  return out;
}
