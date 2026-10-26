/* NEURO ARENA: the 2D stage for the choice contests (drawn at native device-pixel ratio over the court area).
   Shows the stimulus, both brains' answers character by character (green = right, red = wrong, grey = abstain),
   the race of their choice populations, the running Reaper score bars, and live accuracy curves with the chance line. */
const CA = '#2ee6ff', CB_ = '#ff4fd8', OK = '#5cff9d', BAD = '#ff5a5a', DIM = '#7f93b8';
export class Stage {
  constructor(canvas) { this.c = canvas; this.x = canvas.getContext('2d'); this.r = { x: 0, y: 0, w: 1, h: 1 }; this.f = null; this.C = null; this.hist = [[], []]; this.last = null; this.names = ['A', 'B']; this.verdict = null; this.vT = 0; this.flash = [0, 0]; }
  place(r) {
    this.r = r; const s = this.c.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    const dpr = Math.min(3, devicePixelRatio || 1), W = Math.round(r.w * dpr), H = Math.round(r.h * dpr);
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    this.dpr = dpr;
  }
  setContest(C) { this.C = C; this.hist = [[], []]; this.last = null; this.f = null; this.rope = 0; }
  setFrame(f) {
    this.f = f;
    for (const e of f.ev || []) {
      this.last = e; e.at = performance.now();
      e.res.forEach((o, k) => { const right = !o.bad && !o.abst; this.hist[k].push(o.abst ? 0.5 * 0 : right ? 1 : 0); if (this.hist[k].length > 400) this.hist[k].shift(); if (this.C.race && e.first === k) this.rope += k ? 1 : -1; });
      if (e.first >= 0) this.flash[e.first] = 1;
    }
  }
  draw(dt) {
    const { x, r, C, f } = this; if (!C || !f) return;
    const w = r.w, h = r.h, dpr = this.dpr || 1, big = Math.min(w, h * 1.6);
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    // panel
    x.fillStyle = 'rgba(4,8,22,.86)'; rr(x, 0.5, 0.5, w - 1, h - 1, 12); x.fill(); x.strokeStyle = 'rgba(110,160,255,.55)'; x.lineWidth = 1; x.stroke();
    const live = f.phase === 'present' || f.phase === 'think' || f.phase === 'answer', item = live ? f.item : (this.last ? this.last.item : f.item);
    const want = (item && C.labels[item[2]]) || '';
    // stimulus
    const fs = Math.max(16, Math.min(54, big * 0.085));
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `600 ${Math.max(10, fs * 0.3)}px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM;
    const chance = f.chance ?? C.chance;
    x.fillText(`${C.icon} ${C.name.toUpperCase()}${C.levels ? ' · level ' + ((f.level || 0) + 1) + '/' + C.levels.length + ': ' + f.levelName : ''} · chance ${Math.round(chance * 100)}%`, w / 2, fs * 0.36);
    this.timeline(f, w, fs);
    x.font = `800 ${fs}px ui-monospace, "SF Mono", Menlo, monospace`; x.fillStyle = live ? '#fff' : 'rgba(255,255,255,.45)';
    const prompt = item ? (C.race ? item[3] : item[3]) : '…';
    x.fillText(prompt, w / 2, fs * 1.42);
    if (!live && this.last && item) { x.font = `600 ${fs * 0.34}px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText(`answer: ${want}${item[4] ? '  (' + item[4] + ')' : ''}`, w / 2, fs * 2.08); }
    // two answer columns
    const top = fs * 2.38, colW = w / 2, st = f.stats;
    const tiny = h < 220, pl = 10, ph = Math.max(28, Math.min(54, h * 0.13)), py = h - ph - 8, pw = w - 2 * pl, floorY = C.race ? h - 80 : tiny ? h - 2 : py - 4;
    for (let k = 0; k < 2; k++) {
      const cx = colW * k + colW / 2, col = k ? CB_ : CA, br = f.br[k];
      this.flash[k] *= Math.exp(-dt / 0.35);
      // answer (current trial while it runs, the last trial in the gap)
      let given = null, judged = null, tms = null;
      if (live && f.out && f.out[k] && f.out[k].c >= 0) { given = C.labels[f.out[k].c] ?? null; tms = f.out[k].t; judged = f.out[k].j; }
      else if (!live && this.last) { const o = this.last.res[k]; if (o) { given = o.c >= 0 ? (C.labels[o.c] ?? null) : null; judged = o; tms = o.t; } }
      const af = Math.max(18, Math.min(64, big * 0.1));
      x.font = `700 ${Math.max(9, af * 0.22)}px -apple-system, system-ui, sans-serif`; x.fillStyle = col; x.fillText(this.names[k], cx, top + af * 0.15);
      x.font = `800 ${af}px ui-monospace, "SF Mono", Menlo, monospace`;
      const ay = top + af * 0.85;
      const thinking = f.phase === 'present' || f.phase === 'think';
      if (given == null) { x.fillStyle = 'rgba(160,170,200,.55)'; x.fillText(live ? (k === 1 && !br ? '?' : thinking ? 'thinking…' : '…') : 'abstain', cx, ay); }
      else if (live) { x.fillStyle = '#fff'; x.fillText(given, cx, ay); }
      else {
        const showJ = true; const cw = x.measureText('0').width; const sx = cx - (given.length - 1) * cw / 2;
        for (let i = 0; i < given.length; i++) { const okc = given[i] === want[i]; x.fillStyle = okc ? OK : BAD; x.fillText(given[i], sx + i * cw, ay); }
        if (showJ && judged) { x.font = `600 ${Math.max(9, af * 0.2)}px -apple-system, system-ui, sans-serif`; x.fillStyle = judged.s > 0 ? OK : judged.s < 0 ? BAD : DIM; x.fillText(`${judged.s > 0 ? '+' : ''}${judged.s} Reaper pts${judged.da != null ? ' · dopamine ' + (judged.da > 0 ? '+' : '') + judged.da.toFixed(2) : ''}`, cx, ay + af * 0.62); }
      }
      // the race: spike counts of each choice population this trial (bar = population; the margin line = the answer threshold)
      const by = ay + af * 0.95, bh = Math.max(12, Math.min(90, floorY - by - 50)), bw = Math.min(colW * 0.86, C.K * 30), bx = cx - bw / 2, gw = bw / C.K;
      if (br) {
        const gc = br.gc, mx = Math.max(br.margin * 2, ...gc); let i1 = 0; gc.forEach((v, i) => { if (v > gc[i1]) i1 = i; });
        for (let q = 0; q < C.K; q++) {
          const v = gc[q] / mx, isW = item && q === item[2] && !live;
          x.fillStyle = q === i1 && gc[q] > 0 ? col : 'rgba(150,170,220,.35)'; x.fillRect(bx + q * gw + 1, by + bh * (1 - v), gw - 2, bh * v);
          x.font = `600 ${Math.max(8, Math.min(13, gw * 0.5))}px ui-monospace, Menlo, monospace`; x.fillStyle = isW ? OK : DIM; x.fillText(C.labels[q], bx + q * gw + gw / 2, by + bh + 8);
        }
        // threshold: the leader must be this many spikes ahead of the runner-up
        const sorted = [...gc].sort((a, b) => b - a), thr = (sorted[1] || 0) + Math.max(br.margin, (br.kconf || 0) * Math.sqrt((sorted[0] || 0) + (sorted[1] || 0)));
        x.strokeStyle = 'rgba(255,210,90,.7)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(bx, by + bh * (1 - Math.min(1, thr / mx))); x.lineTo(bx + bw, by + bh * (1 - Math.min(1, thr / mx))); x.stroke(); x.setLineDash([]);
      } else if (k === 1) { x.font = `600 12px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText('tap or type your answer', cx, by + bh / 2); }
      // running Reaper score this duel
      const sy = by + bh + 20, sc = st.score[k], n = Math.max(1, st.trials), maxS = Math.max(4, n * Math.max(1, (want || 'x').length));
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(cx - colW * 0.42, sy, colW * 0.84, 8);
      const fr = Math.max(-1, Math.min(1, sc / maxS)), mid = cx;
      x.fillStyle = fr >= 0 ? OK : BAD; x.fillRect(fr >= 0 ? mid : mid + fr * colW * 0.42, sy, Math.abs(fr) * colW * 0.42, 8);
      x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(mid - 0.5, sy - 2, 1, 12);
      x.font = `600 ${Math.max(9, Math.min(12, w * 0.018))}px -apple-system, system-ui, sans-serif`; x.fillStyle = '#d8e6ff';
      x.fillText(`score ${sc} · ✓${st.ok[k]} ✗${st.bad[k]} · abstain ${st.abst[k]} · ${Math.round(100 * st.right[k] / n)}% right`, cx, sy + 20);
      if (this.flash[k] > 0.05) { x.strokeStyle = `rgba(92,255,157,${this.flash[k]})`; x.lineWidth = 2; rr(x, colW * k + 6, top - 4, colW - 12, sy + 26 - top, 10); x.stroke(); x.lineWidth = 1; }
    }
    // tug-of-war rope
    if (C.race) {
      const ry = h - 64, rx = w / 2 + Math.max(-1, Math.min(1, this.rope / 20)) * w * 0.38;
      x.strokeStyle = '#c9a26b'; x.lineWidth = 3; x.beginPath(); x.moveTo(w * 0.08, ry); x.lineTo(w * 0.92, ry); x.stroke(); x.lineWidth = 1;
      x.fillStyle = '#ffd25a'; x.beginPath(); x.arc(rx, ry, 6, 0, 7); x.fill();
      x.fillStyle = DIM; x.font = '600 10px -apple-system, system-ui, sans-serif'; x.fillText('first correct pull moves the rope', w / 2, ry - 12);
    }
    // live accuracy (last 40 trials, rolling) with the chance line
    if (!C.race && !tiny) {
      x.strokeStyle = 'rgba(120,160,255,.15)'; x.strokeRect(pl, py, pw, ph);
      const Y = v => py + (1 - v) * ph;
      x.setLineDash([4, 3]); x.strokeStyle = 'rgba(180,190,200,.75)'; x.beginPath(); x.moveTo(pl, Y(chance)); x.lineTo(pl + pw, Y(chance)); x.stroke(); x.setLineDash([]);
      x.textAlign = 'left'; x.font = '600 9.5px -apple-system, system-ui, sans-serif'; x.fillStyle = DIM; x.fillText(`live accuracy (rolling 20 trials) · dashed = chance ${Math.round(chance * 100)}%`, pl + 4, py + 8);
      [CA, CB_].forEach((col, k) => {
        const hs = this.hist[k]; if (hs.length < 2) return; const N = Math.min(hs.length, 200), s0 = hs.length - N;
        x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath(); let acc = 0; const q = [];
        for (let i = 0; i < N; i++) { const v = hs[s0 + i]; q.push(v); acc += v; if (q.length > 20) acc -= q.shift(); const px = pl + (N > 1 ? i / (N - 1) : 0) * pw, yy = Y(acc / q.length); if (i === 0) x.moveTo(px, yy); else x.lineTo(px, yy); }
        x.stroke(); x.lineWidth = 1;
      });
      x.textAlign = 'center';
    }
  }
}
// PRESENT → THINKING → ANSWER → JUDGED: the fixed trial loop every brain runs, with a cursor at the current moment
Stage.prototype.timeline = function (f, w, fs) {
  const x = this.x, T = f.T; if (!T) return;
  const seg = [['PRESENT', T.presentMs, 'present'], ['THINKING', T.thinkMs, 'think'], ['ANSWER', Math.max(T.commitMs, 1), 'answer'], ['JUDGED', Math.max(60, T.iti), 'iti']];
  const tot = seg.reduce((a, s) => a + s[1], 0), bw = Math.min(w * 0.8, 520), bx = (w - bw) / 2, by = fs * 0.36 + Math.max(7, fs * 0.2), bh = Math.max(9, Math.min(14, fs * 0.24));
  let ox = bx, pos = 0, acc = 0;
  for (const [name, d, ph] of seg) {
    const sw = bw * Math.max(0.14, d / tot) / seg.reduce((a, s) => a + Math.max(0.14, s[1] / tot), 0), on = f.phase === ph;
    x.fillStyle = on ? (ph === 'iti' ? 'rgba(92,255,157,.55)' : ph === 'answer' ? 'rgba(255,210,90,.6)' : 'rgba(46,230,255,.5)') : 'rgba(255,255,255,.08)'; x.fillRect(ox + 1, by, sw - 2, bh);
    x.font = `700 ${Math.max(7, bh * 0.62)}px -apple-system, system-ui, sans-serif`; x.fillStyle = on ? '#fff' : DIM; x.textAlign = 'center'; x.fillText(name + (ph === 'think' ? ' ' + T.thinkMs + 'ms' : ''), ox + sw / 2, by + bh / 2 + 0.5);
    if (on) { const p = ph === 'iti' ? Math.min(1, f.pt / Math.max(1, T.iti)) : Math.min(1, Math.max(0, (f.pt - acc) / Math.max(1, d))); pos = ox + p * sw; }
    ox += sw; acc += d;
  }
  if (pos) { x.fillStyle = '#fff'; x.fillRect(pos - 1, by - 2, 2, bh + 4); }
};
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
