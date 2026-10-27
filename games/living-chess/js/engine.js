/* ==========================================================================
   LIVING CHESS — engine.js : one promise-based front end for a UCI engine.
   Browser: Stockfish 19 lite single-threaded WASM in a Worker
   (vendor/stockfish, GPL-3.0), falling back to jsengine.js in a Worker if
   WebAssembly or the download fails. Node tests pass their own transport.
   Requests are queued: one search at a time, newest analysis wins.
     analyse(fen, {multipv, depth, movetime}) -> {lines:[{uci, score, mate, pv:[uci]}], depth}
       score is centipawns from the side to move (mate -> +/-(20000 - 100*n))
     bestMove(fen, level) -> uci
   ========================================================================== */
(function () {
  'use strict';
  const LEVELS = [ // name, Stockfish Skill Level, movetime ms, depth cap
    { name: 'SQUIRE', skill: 0, ms: 150, depth: 3 },
    { name: 'KNIGHT', skill: 5, ms: 300, depth: 6 },
    { name: 'CASTELLAN', skill: 10, ms: 600, depth: 10 },
    { name: 'WARLORD', skill: 15, ms: 1000, depth: 14 },
    { name: 'GRANDMASTER', skill: 20, ms: 1600, depth: 22 },
  ];
  function parseInfo(line) {
    if (!line.startsWith('info ') || line.indexOf(' pv ') < 0) return null;
    if (/ (lowerbound|upperbound)/.test(line)) return null;
    const d = /\bdepth (\d+)/.exec(line), mp = /\bmultipv (\d+)/.exec(line), sc = /\bscore (cp|mate) (-?\d+)/.exec(line), pv = / pv (.+)$/.exec(line);
    if (!d || !sc || !pv) return null;
    const mate = sc[1] === 'mate' ? +sc[2] : null;
    const score = mate != null ? (mate > 0 ? 20000 - 100 * mate : -20000 - 100 * mate) : +sc[2];
    const moves = pv[1].trim().split(/\s+/);
    return { depth: +d[1], k: mp ? +mp[1] : 1, score, mate, pv: moves, uci: moves[0] };
  }
  class Engine {
    /** transport: { post(cmd), set onLine(fn), kind } */
    constructor(transport) {
      this.t = transport; this.kind = transport.kind; this.q = Promise.resolve(); this.cur = null; this.ready = false; this.busy = false; this.gen = 0;
      transport.onLine = line => this._line(line);
    }
    static browser(base) {
      base = base || '';
      const mk = (url, kind) => { const w = new Worker(url); const t = { kind, w, post: c => w.postMessage(c), onLine: null }; w.onmessage = e => t.onLine && t.onLine(String(e.data)); w.onerror = e => { t.failed = true; t.onErr && t.onErr(e); }; return t; };
      const wasmOK = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function' && !/[?&]engine=js/.test(location.search);
      const t = wasmOK ? mk(base + 'vendor/stockfish/stockfish-19-lite-single.js', 'stockfish') : mk(base + 'js/jsengine-worker.js', 'js');
      const e = new Engine(t); e.base = base; return e;
    }
    /** wait for uciok/readyok; switch to the JS engine if Stockfish doesn't come up in time */
    async init(timeoutMs = 20000) {
      const ok = await new Promise(res => {
        const to = setTimeout(() => res(false), timeoutMs);
        this._await = l => { if (l === 'readyok') { clearTimeout(to); res(true); return true; } };
        this.t.onErr = () => { clearTimeout(to); res(false); };
        this.t.post('uci'); this.t.post('isready');
      });
      if (!ok && this.kind === 'stockfish' && typeof Worker !== 'undefined') {
        console.warn('[living-chess] Stockfish failed to start; using the built-in engine');
        try { this.t.w.terminate(); } catch (_) { }
        const w = new Worker(this.base + 'js/jsengine-worker.js'); const t = { kind: 'js', w, post: c => w.postMessage(c), onLine: null }; w.onmessage = e => t.onLine && t.onLine(String(e.data));
        this.t = t; this.kind = 'js'; t.onLine = l => this._line(l);
        return this.init(8000);
      }
      this.ready = ok; return ok;
    }
    _line(line) {
      if (this._await && this._await(line)) { this._await = null; return; }
      const c = this.cur; if (!c) return;
      if (line.startsWith('info')) { const i = parseInfo(line); if (i) { if (i.depth > c.depth) { c.depth = i.depth; } c.byK[i.k] = i; c.lastDepth[i.k] = i.depth; } return; }
      if (line.startsWith('bestmove')) { const bm = line.split(/\s+/)[1]; this.cur = null; c.done({ bestmove: bm === '(none)' ? null : bm, byK: c.byK, depth: c.depth }); }
    }
    _run(setup, goCmd) {
      const job = () => new Promise(res => {
        this.cur = { byK: {}, lastDepth: {}, depth: 0, done: res };
        for (const s of setup) this.t.post(s);
        this.t.post(goCmd);
      });
      const p = this.q.then(job); this.q = p.catch(() => { }); return p;
    }
    async analyse(fen, o = {}) {
      const mpv = o.multipv || 1;
      const r = await this._run([`setoption name MultiPV value ${mpv}`, 'setoption name Skill Level value 20', `position fen ${fen}`], `go depth ${o.depth || 10}` + (o.movetime ? ` movetime ${o.movetime}` : ''));
      const lines = Object.keys(r.byK).map(k => r.byK[k]).sort((a, b) => b.score - a.score);
      return { lines, bestmove: r.bestmove, depth: r.depth, engine: this.kind };
    }
    async bestMove(fen, level) {
      const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
      const r = await this._run(['setoption name MultiPV value 1', `setoption name Skill Level value ${L.skill}`, `position fen ${fen}`], `go depth ${this.kind === 'js' ? Math.min(L.depth, 5) : L.depth} movetime ${L.ms}`);
      return r.bestmove;
    }
    stop() { this.t.post('stop'); }
  }
  Engine.LEVELS = LEVELS; Engine.parseInfo = parseInfo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else window.LCEngine = Engine;
})();
