/* GENESIS sandbox worker. Runs design code (offline-archive designs, built-in mutants and live-LLM proposals)
   away from the page: no DOM, no localStorage (so never the API key), network globals deleted, and the page
   kills the worker if it stops answering (timeout). */
import { compileLearner, makeStepper, evaluate, makeBattery, TASK } from './tasks.js';
const post = self.postMessage.bind(self);
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'Request', 'navigator']) {
  try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) { try { self[k] = undefined; } catch (_) { /* ignore */ } }
}
let live = null;
self.onmessage = ev => {
  const m = ev.data;
  try {
    if (m.cmd === 'live') {
      live = { id: m.id, st: m.designs.map(d => { try { return makeStepper(compileLearner(d.code), m.stream, { trials: m.trials, genome: d.genome }); } catch (e) { return { dead: true, err: String(e && e.message || e) }; } }) };
      const t = TASK[m.stream.family];
      post({ cmd: 'liveReady', id: m.id, answers: live.st.map(s => s.answers || null), errs: live.st.map(s => s.dead ? s.err : s.res.err) , inputLen: t.inputLen });
    } else if (m.cmd === 'step' && live && live.id === m.id) {
      const out = [];
      for (let k = 0; k < m.n; k++) {
        const row = live.st.map(s => s.dead || s.done ? null : s.step());
        if (row.every(x => x == null)) break;
        out.push(row.map(x => x && { i: x.i, input: x.input, answer: x.answer, pred: x.pred, v: x.v, why: x.why || null }));
      }
      const done = live.st.every(s => s.dead || s.done);
      post({ cmd: 'steps', id: m.id, rows: out, done, final: done ? live.st.map(s => s.dead ? null : s.finish()) : null });
    } else if (m.cmd === 'evaluate') {
      const streams = makeBattery(m.kind, m.seed);
      const r = evaluate({ code: m.code, genome: m.genome }, streams, { trials: m.trials || 240, budgetMs: m.budgetMs || 6000,
        onStream: (res, k, n) => post({ cmd: 'progress', id: m.id, k, n, family: res.family, scrambled: res.scrambled, solved: res.solved }) });
      post({ cmd: 'evaluated', id: m.id, result: r });
    } else if (m.cmd === 'smoke') {
      const f = compileLearner(m.code); const st = makeStepper(f, { family: 'add', seed: 5, scrambled: false }, { trials: 30, genome: m.genome });
      while (!st.done) st.step(); const r = st.finish();
      post({ cmd: 'smoked', id: m.id, ok: !r.err, err: r.err, acc: r.acc });
    }
  } catch (e) { post({ cmd: 'error', id: m.id, error: String(e && e.message || e) }); }
};
post({ cmd: 'hello' });
