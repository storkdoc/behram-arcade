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
  setContest(C) { this.C = C; this.hist = [[], []]; this.tally = [[0, 0], [0, 0]]; this.last = null; this.f = null; this.rope = 0; }
  setFrame(f) {
    this.f = f;
    for (const e of f.ev || []) {
      this.last = e; e.at = performance.now();
      e.res.forEach((o, k) => { const right = !o.bad && !o.abst; if (right) this.tally[k][o.alt ? 1 : 0]++; this.hist[k].push(o.abst ? 0.5 * 0 : right ? 1 : 0); if (this.hist[k].length > 400) this.hist[k].shift(); if (this.C.race && e.first === k) this.rope += k ? 1 : -1; });
      if (e.first >= 0) this.flash[e.first] = 1;
      // Simon: the answers given so far in the current sequence (both players), shown under the lights
      if (this.C.seq && e.item) { const it = e.item; if (it[0] === 0 || !this.sq || this.sq.idx !== it[7] - it[0]) this.sq = { idx: it[7] - it[0], a: [[], []] };
        e.res.forEach((o, k) => { this.sq.a[k][it[0]] = { c: o.c, ok: !o.bad && !o.abst }; }); }
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
    const base = C.baseOf && item ? f.base : null;
    x.fillText(`${C.icon} ${C.name.toUpperCase()}${C.levels ? ' · ' + f.levelName : ''} · chance ${Math.round(chance * 100)}%${base ? ` · always “${C.labels[0]}” ${Math.round(base * 100)}%` : ''}`, w / 2, fs * 0.36, w - 8);
    this.timeline(f, w, fs);
    x.font = `800 ${fs}px ui-monospace, "SF Mono", Menlo, monospace`; x.fillStyle = live ? '#fff' : 'rgba(255,255,255,.45)';
    const prompt = item ? (C.race ? item[3] : item[3]) : '…';
    let wb = fs * 1.9; if (C.valid && item) wb = this.word(item, live, w, fs); else if (C.seq && item) wb = this.lights(item, live, w, fs);
    else x.fillText(prompt, w / 2, fs * 1.42);
    if (C.seq && !live && this.last && item) { x.font = `600 ${Math.max(10, fs * 0.3)}px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText(`light ${item[0] + 1} of ${item[6]} was ${SMN[want] || want}`, w / 2, Math.max(fs * 2.12, wb + Math.max(8, fs * 0.22)), w - 16); }
    else if (C.valid && !live && this.last && item) { const alts = item[C.valid].split('').filter(l => l !== want); x.font = `600 ${Math.max(10, fs * 0.3)}px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText(`answer: ${item[4]}${alts.length ? ' · also valid: ' + alts.join(' ') : ''}`, w / 2, Math.max(fs * 2.12, wb + Math.max(7, fs * 0.2)), w - 16); }
    else if (!live && this.last && item) { x.font = `600 ${Math.max(10, fs * 0.34)}px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText(C.explain ? `answer: ${want} · ${C.explain(item)}` : `answer: ${want}${item[4] ? '  (' + item[4] + ')' : ''}`, w / 2, fs * 2.08, w - 12); }
    // two answer columns
    const top = C.seq ? Math.max(fs * 2.38, wb + Math.max(8, fs * 0.22) + Math.max(12, fs * 0.45)) : fs * 2.38, colW = w / 2, st = f.stats;
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
      if (given == null) { x.fillStyle = 'rgba(160,170,200,.55)'; const tl = live ? (k === 1 && !br ? '?' : thinking ? 'thinking…' : '…') : 'abstain'; if (tl.length > 1) x.font = `700 ${Math.max(11, Math.min(af * 0.42, colW * 0.8 / tl.length * 1.6))}px ui-monospace, "SF Mono", Menlo, monospace`; x.fillText(tl, cx, ay); }
      else if (live) { x.fillStyle = '#fff'; x.fillText(given, cx, ay); }
      else if (C.valid) {   // Word completion: the guessed letter, the word it makes and the Reaper's verdict (an alternate valid word counts)
        const good = judged && judged.s > 0, wd = item ? item[4].slice(0, item[0]) + given + item[4].slice(item[0] + 1) : '';
        x.fillStyle = good ? OK : BAD; x.fillText(given, cx, ay);
        if (judged) { x.font = `700 ${Math.max(9, Math.min(af * 0.22, colW / 15))}px -apple-system, system-ui, sans-serif`;
          x.fillText(judged.alt ? `VALID ALT: ${item[4]}→${wd} ✓` : good ? `${wd} ✓` : `${wd} ✗`, cx, ay + af * 0.6, colW - 8);
          x.font = `600 ${Math.max(8, Math.min(af * 0.18, colW / 18))}px -apple-system, system-ui, sans-serif`; x.fillStyle = good ? OK : judged.s < 0 ? BAD : DIM;
          x.fillText(`${judged.s > 0 ? '+' : ''}${judged.s} Reaper pts${judged.da != null ? ' · dopamine ' + (judged.da > 0 ? '+' : '') + judged.da.toFixed(2) : ''}`, cx, ay + af * 0.86, colW - 8); }
      }
      else if (C.whole) {   // one answer token (e.g. Smallest divisor "37+"): right or wrong as a whole
        const good = judged && judged.s > 0; x.fillStyle = good ? OK : BAD;
        if (given.length > 2) x.font = `800 ${Math.min(af, colW * 0.9 / given.length * 1.6)}px ui-monospace, "SF Mono", Menlo, monospace`; x.fillText(given, cx, ay);
        if (judged) { x.font = `600 ${Math.max(9, Math.min(af * 0.2, colW / 16))}px -apple-system, system-ui, sans-serif`; x.fillStyle = good ? OK : judged.s < 0 ? BAD : DIM;
          x.fillText(`${good ? '✓' : '✗ it is ' + want} · ${judged.s > 0 ? '+' : ''}${judged.s} Reaper pts${judged.da != null ? ' · dopamine ' + (judged.da > 0 ? '+' : '') + judged.da.toFixed(2) : ''}`, cx, ay + af * 0.62, colW - 8); }
      }
      else {
        const showJ = true; const cw = x.measureText('0').width; const sx = cx - (given.length - 1) * cw / 2;
        for (let i = 0; i < given.length; i++) { const okc = given[i] === want[i]; x.fillStyle = okc ? OK : BAD; x.fillText(given[i], sx + i * cw, ay); }
        if (showJ && judged) { x.font = `600 ${Math.max(9, af * 0.2)}px -apple-system, system-ui, sans-serif`; x.fillStyle = judged.s > 0 ? OK : judged.s < 0 ? BAD : DIM; x.fillText(`${judged.s > 0 ? '+' : ''}${judged.s} Reaper pts${judged.da != null ? ' · dopamine ' + (judged.da > 0 ? '+' : '') + judged.da.toFixed(2) : ''}`, cx, ay + af * 0.62); }
      }
      // the race: spike counts of each choice population this trial (bar = population; the margin line = the answer threshold)
      const by = ay + af * (C.valid || C.whole ? 1.08 : 0.95), bh = Math.max(12, Math.min(90, floorY - by - 50)), bw = Math.min(colW * 0.86, C.K * 30), bx = cx - bw / 2, gw = bw / C.K;
      if (br) {
        const gc = br.gc, mx = Math.max(br.margin * 2, ...gc); let i1 = 0; gc.forEach((v, i) => { if (v > gc[i1]) i1 = i; });
        for (let q = 0; q < C.K; q++) {
          const v = gc[q] / mx, isW = item && q === item[2] && !live;
          x.fillStyle = q === i1 && gc[q] > 0 ? col : 'rgba(150,170,220,.35)'; x.fillRect(bx + q * gw + 1, by + bh * (1 - v), gw - 2, bh * v);
          const lb = C.labels[q], stg = lb.length > 1 && gw * 1.7 < 8 * lb.length ? (q % 2) * 9 : 0; x.font = `600 ${Math.max(8, Math.min(13, gw * 0.5))}px ui-monospace, Menlo, monospace`; x.fillStyle = isW ? OK : DIM; if (gw >= 9 || q === i1 || isW) x.fillText(lb, bx + q * gw + gw / 2, by + bh + 8 + stg);
        }
        // confidence threshold (Play only): the leader must be this many spikes ahead of the runner-up or the brain abstains
        const sorted = [...gc].sort((a, b) => b - a), thr = (sorted[1] || 0) + Math.max(br.margin, (br.kconf || 0) * Math.sqrt((sorted[0] || 0) + (sorted[1] || 0)));
        if (!f.br[1]) { x.strokeStyle = 'rgba(255,210,90,.7)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(bx, by + bh * (1 - Math.min(1, thr / mx))); x.lineTo(bx + bw, by + bh * (1 - Math.min(1, thr / mx))); x.stroke(); x.setLineDash([]); }
      } else if (k === 1) { x.font = `600 12px -apple-system, system-ui, sans-serif`; x.fillStyle = DIM; x.fillText('tap or type your answer', cx, by + bh / 2); }
      // running Reaper score this duel
      const sy = by + bh + 20 + (C.K > 8 && C.labels.some(l => l.length > 1) ? 8 : 0), sc = st.score[k], n = Math.max(1, st.trials), maxS = Math.max(4, n * (C.whole ? 1 : Math.max(1, (want || 'x').length)));
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(cx - colW * 0.42, sy, colW * 0.84, 8);
      const fr = Math.max(-1, Math.min(1, sc / maxS)), mid = cx;
      x.fillStyle = fr >= 0 ? OK : BAD; x.fillRect(fr >= 0 ? mid : mid + fr * colW * 0.42, sy, Math.abs(fr) * colW * 0.42, 8);
      x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(mid - 0.5, sy - 2, 1, 12);
      x.font = `600 ${Math.max(9, Math.min(12, w * 0.018))}px -apple-system, system-ui, sans-serif`; x.fillStyle = '#d8e6ff';
      x.fillText(`score ${sc} · ✓${st.ok[k]} ✗${st.bad[k]} · abstain ${st.abst[k]} · ${Math.round(100 * st.right[k] / n)}% right`, cx, sy + 20, colW - 6);
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
// Word completion: the five letters in boxes, the missing one as a highlighted gap (filled in with the intended
// letter once the trial is judged)
Stage.prototype.word = function (item, live, w, fs) {
  const x = this.x, s = item[3], n = s.length, tl = fs * 0.36 + Math.max(7, fs * 0.2) + Math.max(9, Math.min(14, fs * 0.24)) + 4, cw = Math.min(fs * 0.85, (w - 24) / (n + 0.6), (fs * 1.95 - tl) / 1.1), gap = cw * 0.12, tw = n * cw + (n - 1) * gap, x0 = (w - tw) / 2, bh = cw * 1.1, y = tl + bh / 2;
  x.font = `800 ${cw * 0.72}px ui-monospace, "SF Mono", Menlo, monospace`;
  for (let i = 0; i < n; i++) { const bx = x0 + i * (cw + gap), blank = s[i] === '_';
    x.fillStyle = blank ? (live ? 'rgba(46,230,255,.18)' : 'rgba(92,255,157,.12)') : 'rgba(255,255,255,.06)'; rr(x, bx, y - bh / 2, cw, bh, 6); x.fill();
    x.strokeStyle = blank ? (live ? '#2ee6ff' : 'rgba(92,255,157,.8)') : 'rgba(150,170,220,.35)'; x.lineWidth = blank ? 2 : 1; if (blank) x.setLineDash([4, 3]); x.stroke(); x.setLineDash([]); x.lineWidth = 1;
    x.fillStyle = blank ? (live ? '#2ee6ff' : 'rgba(92,255,157,.9)') : (live ? '#fff' : 'rgba(255,255,255,.55)');
    x.fillText(blank ? (live ? '?' : item[4][i]) : s[i], bx + cw / 2, y + 1); }
  return y + bh / 2;
};
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

// Simon: the L lights of the sequence (the working-memory buffer), the step being played back outlined, and under
// each light the colours each brain has played so far in this sequence (✓/✗)
const SMC = { R: '#ff4d5e', G: '#3ee07a', B: '#4d8dff', Y: '#ffd23e' }, SMN = { R: 'red', G: 'green', B: 'blue', Y: 'yellow' };
Stage.prototype.lights = function (item, live, w, fs) {
  const x = this.x, L = item[6], str = item[4], p = item[0], tl = fs * 0.36 + Math.max(7, fs * 0.2) + Math.max(9, Math.min(14, fs * 0.24)) + 4;
  const cw = Math.min(fs * 1.35, 64, (w - 40) / (L + 0.5)), gap = cw * 0.14, tw = L * cw + (L - 1) * gap, x0 = (w - tw) / 2, bh = cw * 0.62, y = tl + bh / 2;
  const sq = this.sq && this.sq.idx === item[7] - p ? this.sq : null, mr = Math.max(4.5, cw * 0.12);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < L; i++) { const bx = x0 + i * (cw + gap), cur = i === p, col = SMC[str[i]];
    x.globalAlpha = cur ? 1 : 0.55; x.fillStyle = col; rr(x, bx, y - bh / 2, cw, bh, 6); x.fill(); x.globalAlpha = 1;
    if (cur) { x.strokeStyle = live ? '#2ee6ff' : '#fff'; x.lineWidth = 3; rr(x, bx - 2, y - bh / 2 - 2, cw + 4, bh + 4, 8); x.stroke(); x.lineWidth = 1; }
    x.font = `800 ${cw * 0.42}px ui-monospace, "SF Mono", Menlo, monospace`; x.fillStyle = 'rgba(0,0,0,.6)'; x.fillText(String(i + 1), bx + cw / 2, y + 1);
    // the two players' answers for this light (once judged)
    for (let k = 0; k < 2; k++) { const a = sq && sq.a[k][i]; const cy = y + bh / 2 + mr * 1.6 + k * mr * 2.5, cx = bx + cw / 2 - mr * 1.2;
      if (!a) { x.fillStyle = 'rgba(150,170,220,.25)'; x.beginPath(); x.arc(cx, cy, mr * 0.6, 0, 7); x.fill(); continue; }
      x.fillStyle = a.c >= 0 ? SMC[this.C.labels[a.c]] : '#555'; x.beginPath(); x.arc(cx, cy, mr, 0, 7); x.fill();
      x.font = `800 ${mr * 2}px -apple-system, system-ui, sans-serif`; x.fillStyle = a.ok ? '#5cff9d' : '#ff5c7a'; x.fillText(a.ok ? '✓' : '✗', cx + mr * 2.3, cy + 1); } }
  x.font = `700 ${Math.max(8, mr * 1.5)}px -apple-system, system-ui, sans-serif`; x.fillStyle = '#7f93b8'; x.textAlign = 'right';
  x.fillText('A', x0 - 4, y + bh / 2 + mr * 1.6); x.fillText('B', x0 - 4, y + bh / 2 + mr * 4.1); x.textAlign = 'center';
  return y + bh / 2 + mr * 5.2;
};
