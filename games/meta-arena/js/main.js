/* GENESIS: meta-evolution arena. Replays the offline archive (designs + code + REAPER scores + rationales),
   re-runs any design live in a sandboxed worker, and keeps evolving in the browser (built-in operators, or a
   live LLM with the user's own key). THE REAPER's score is the only selection pressure everywhere. */
import { TASK, makeBattery, SEALED_SEED, selectionSeed, reaperRank, SELECT, SEALED, mulberry32 } from './tasks.js';
import { GENES, BIASES, MECHS, codeFor, paradigmsOf, describe, baseGenome } from './genome.js';
import { hybridCode } from './mutate.js';
import { drawOrganism, drawReaper, pinfo, hexA } from './draw.js';
import { breedBuiltIn } from './evolve.js';
import { llmCfg, saveCfg, hasKey, buildPrompt, callLLM, cleanGenome, FORBIDDEN } from './llm.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
const f3 = v => v == null ? '—' : (+v).toFixed(3);
const SLOTS = ['A1', 'A2', 'B1', 'B2', 'W'];
const BCOL = { A: '#ffb347', B: '#5ad1ff', W: '#ff5fa2' };
const SPEEDS = [[2, '½×'], [6, '1×'], [20, '3×'], [80, '12×'], [600, 'MAX']];
const LSG = 'genesis.gens.v1', LSP = 'genesis.prefs.v1';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(LSP)) || {}; } catch (e) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(LSP, JSON.stringify(prefs)); } catch (e) { /* private mode */ } };
const S = { arch: null, gens: [], gi: 0, ci: 0, scr: false, speedI: prefs.speedI ?? 1, auto: true, playing: false, view: 'arena', live: null, t: 0, flash: 0, verdictOpen: false, evolving: false, stop: false };
let LIB = {};

/* ---------------- audio (WebAudio synth, unlocked on the first gesture; iOS-safe) ---------------- */
const AU = { ctx: null, master: null, on: prefs.sound !== false, drone: null };
function unlockAudio() {
  if (!AU.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    AU.ctx = new AC(); AU.master = AU.ctx.createGain(); AU.master.gain.value = AU.on ? 0.55 : 0; AU.master.connect(AU.ctx.destination);
    const b = AU.ctx.createBuffer(1, 1, 22050), s = AU.ctx.createBufferSource(); s.buffer = b; s.connect(AU.master); s.start(0);
    startDrone();
  }
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
}
['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(e => window.addEventListener(e, unlockAudio, { passive: true }));
function tone(f, d, { type = 'sine', vol = 0.15, at = 0, slide = 0, attack = 0.005 } = {}) {
  if (!AU.ctx || !AU.on) return; const c = AU.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + d + 0.05);
}
function noise(d, { vol = 0.1, at = 0, f = 800 } = {}) {
  if (!AU.ctx || !AU.on) return; const c = AU.ctx, t = c.currentTime + at, n = c.sampleRate * d | 0, b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; fl.type = 'lowpass'; fl.frequency.value = f; g.gain.value = vol;
  s.connect(fl); fl.connect(g); g.connect(AU.master); s.start(t);
}
const SFX = {
  right: (k = 0) => { tone(660 + k * 40, 0.12, { vol: 0.05 }); tone(990 + k * 60, 0.16, { vol: 0.035, at: 0.04 }); },
  wrong: () => { tone(150, 0.2, { type: 'sawtooth', vol: 0.04, slide: 0.6 }); },
  tick: () => tone(1800, 0.03, { vol: 0.015, type: 'triangle' }),
  ui: () => tone(520, 0.06, { vol: 0.05, type: 'triangle' }),
  solved: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { vol: 0.05, at: i * 0.07 })),
  gong: () => { [55, 82.4, 110, 146.8, 233].forEach((f, i) => tone(f, 3.2, { vol: 0.12 / (i + 1), type: i ? 'sine' : 'triangle', attack: 0.01 })); noise(0.6, { vol: 0.08, f: 300 }); },
  pass: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { vol: 0.06, at: i * 0.09, type: 'triangle' })),
  supp: () => { tone(220, 0.7, { type: 'sawtooth', vol: 0.04, slide: 0.35 }); noise(0.3, { vol: 0.04, f: 500 }); },
  breed: () => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 600, 0.18, { vol: 0.03, at: i * 0.05, type: 'triangle' }); },
};
function startDrone() {
  if (!AU.ctx || AU.drone) return; const c = AU.ctx, g = c.createGain(), lp = c.createBiquadFilter(); g.gain.value = 0.035; lp.type = 'lowpass'; lp.frequency.value = 420;
  [55, 55.4, 82.5, 110.3].forEach(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); });
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  lp.connect(g); g.connect(AU.master); AU.drone = g;
}
function setSound(on) { AU.on = on; prefs.sound = on; savePrefs(); if (AU.master) AU.master.gain.value = on ? 0.55 : 0; $('bSnd').classList.toggle('off', !on); }

/* ---------------- data ---------------- */
function localGens() { try { return JSON.parse(localStorage.getItem(LSG)) || []; } catch (e) { return []; } }
function saveLocal() { try { localStorage.setItem(LSG, JSON.stringify(S.gens.filter(g => g.browser))); } catch (e) { logE('could not save to localStorage: ' + e.message); } }
const entryById = id => { for (const g of S.gens) for (const e of g.entries) if (e.id === id) return e; return null; };
const genOf = e => S.gens.find(g => g.gen === e.gen);
function contests(g) {
  const sel = makeBattery('selection', g.selectionSeed), sea = makeBattery('sealed', SEALED_SEED), out = [];
  for (const f of SELECT) out.push({ family: f, sealed: false, plain: sel.find(s => s.family === f && !s.scrambled), scr: sel.find(s => s.family === f && s.scrambled) });
  for (const f of SEALED) out.push({ family: f, sealed: true, plain: sea.find(s => s.family === f && !s.scrambled), scr: sea.find(s => s.family === f && s.scrambled) });
  return out;
}
function archived(e, c, scr) { const src = c.sealed ? e.sealed : e.sel; return src && src.per && src.per.find(p => p.family === c.family && p.scrambled === scr); }
const originClass = o => /live LLM/.test(o) ? 'o-live' : /offline LLM/.test(o) ? 'o-off' : 'o-op';

/* ---------------- views ---------------- */
function setView(v) {
  S.view = v; document.querySelectorAll('.view').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  for (const [k, id] of [['arena', 'vArena'], ['lineage', 'vLineage'], ['map', 'vMap'], ['evolve', 'vEvolve']]) $(id).classList.toggle('on', k === v);
  if (v === 'lineage') drawTree(); if (v === 'map') renderMap(); if (v === 'evolve') renderEvolve();
  resize();
}
document.querySelectorAll('.view').forEach(b => b.onclick = () => { SFX.ui(); setView(b.dataset.view); });

/* ---------------- ARENA ---------------- */
const lab = $('lab'), lx = lab.getContext('2d');
let DPR = 1, LW = 0, LH = 0, pods = [];
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [lab]) { const r = c.getBoundingClientRect(); if (!r.width) continue; c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR); }
  const r = lab.getBoundingClientRect(); LW = r.width; LH = r.height;
  if (S.view === 'lineage') drawTree(); if (S.view === 'map') drawMap();
}
window.addEventListener('resize', resize);
function setGen(i) {
  S.gi = Math.max(0, Math.min(S.gens.length - 1, i)); const g = S.gens[S.gi];
  $('gNum').textContent = `GEN ${g.gen}${g.browser ? ' · browser' : ''}`; $('gTitle').textContent = g.title || '';
  buildCarousel(); startLive();
}
function buildCarousel() {
  const g = S.gens[S.gi], cs = contests(g); S.cs = cs; S.ci = Math.min(S.ci, cs.length - 1);
  $('carousel').innerHTML = cs.map((c, i) => `<button class="fam${i === S.ci ? ' on' : ''}${c.sealed ? ' sealed' : ''}" data-i="${i}" title="${esc(TASK[c.family].blurb)}">${TASK[c.family].icon} ${esc(TASK[c.family].name)}${c.sealed ? ' · sealed' : ''}</button>`).join('');
  $('carousel').querySelectorAll('.fam').forEach(b => b.onclick = () => { SFX.ui(); setContest(+b.dataset.i); });
}
function setContest(i, scr = S.scr) {
  S.ci = (i + S.cs.length) % S.cs.length; S.scr = scr; $('bScr').classList.toggle('on', S.scr);
  $('carousel').querySelectorAll('.fam').forEach((b, k) => b.classList.toggle('on', k === S.ci));
  const on = $('carousel').querySelector('.fam.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  startLive();
}
function killWorker(L) { if (L && L.w) { try { L.w.terminate(); } catch (e) { /* gone */ } L.w = null; } }
function startLive() {
  killWorker(S.live); clearTimeout(S.autoT);
  const g = S.gens[S.gi], c = S.cs[S.ci], stream = S.scr ? c.scr : c.plain, id = Math.random();
  const ents = SLOTS.map(sl => g.entries.find(e => e.slot === sl)).filter(Boolean);
  const L = S.live = { id, g, c, stream, ents, pods: ents.map(e => ({ e, pts: 0, n: 0, right: 0, wrong: 0, abst: 0, win: [], hist: [], steps: null, last: null, flash: 0, err: null })), item: null, i: 0, done: false, pending: false, budget: 0, final: null, ready: false, sent: 0 };
  let designs; try { designs = ents.map(e => ({ code: codeFor(e.genome, LIB, hybridCode), genome: e.genome })); } catch (err) { L.err = err.message; return; }
  const w = L.w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ev => onLive(L, ev.data);
  w.onerror = ev => { L.err = 'sandbox worker failed: ' + (ev.message || 'error'); ev.preventDefault && ev.preventDefault(); };
  w.postMessage({ cmd: 'live', id, designs, stream, trials: 240 });
}
function onLive(L, m) {
  if (L !== S.live) return;
  if (m.cmd === 'liveReady') { L.ready = true; L.answers = m.answers; m.errs.forEach((e, k) => { if (e) L.pods[k].err = e; }); }
  if (m.cmd === 'steps') {
    L.pending = false;
    const quiet = SPEEDS[S.speedI][0] > 20;
    m.rows.forEach((row, ri) => {
      const lastRow = ri === m.rows.length - 1;
      row.forEach((x, k) => { if (!x) return; const p = L.pods[k]; p.n++; if (x.v === 1) p.right++; else if (x.v === -2) p.wrong++; else p.abst++; p.pts += x.v;
        p.win.push(x.v === 1 ? 1 : 0); if (p.win.length > 20) p.win.shift(); p.hist.push(p.win.reduce((a, b) => a + b, 0) / 20);
        if (p.steps == null && p.win.length === 20 && p.win.reduce((a, b) => a + b, 0) >= 16) { p.steps = p.n; if (!quiet || lastRow) SFX.solved(); }
        if (lastRow) { p.last = x; p.flash = 1; } });
      const any = row.find(Boolean); if (any) { L.item = any; L.i = any.i + 1; }
      if (lastRow && !quiet) { const v = row.filter(Boolean).map(x => x.v); if (v.includes(1)) SFX.right(v.filter(x => x === 1).length); if (v.includes(-2)) SFX.wrong(); if (!v.includes(1) && !v.includes(-2)) SFX.tick(); }
    });
    if (m.done) { L.done = true; L.final = m.final; killWorker(L); onLiveDone(L); }
  }
  if (m.cmd === 'error') L.err = m.error;
}
function onLiveDone(L) {
  // re-run vs archive: the browser re-executes the same code on the same seeded stream
  L.match = L.ents.map((e, k) => { const a = archived(e, L.c, S.scr), f = L.final && L.final[k]; return a && f ? Math.abs(a.solved - f.solved) < 1e-6 : null; });
  if (S.auto && S.playing && S.view === 'arena' && !S.verdictOpen) S.autoT = setTimeout(() => { if (!S.playing || S.live !== L) return; if (!S.scr) setContest(S.ci, true); else setContest(S.ci + 1, false); }, 2600);
}
function pumpLive(dt) {
  const L = S.live; if (!L || !L.w || !L.ready || L.done || !S.playing) return;
  if (L.pending) { if (performance.now() - L.sent > 10000) { L.err = 'sandbox timeout: worker stopped answering, terminated'; killWorker(L); L.done = true; } return; }
  L.budget += SPEEDS[S.speedI][0] * dt; const n = Math.min(240, Math.floor(L.budget)); if (n < 1) return;
  L.budget -= n; L.pending = true; L.sent = performance.now(); L.w.postMessage({ cmd: 'step', id: L.id, n });
}
function setPlaying(p) { S.playing = p; $('bPlay').textContent = p ? '❚❚ PAUSE' : '▶ RUN'; if (p && S.live && S.live.done) { if (S.auto) { if (!S.scr) setContest(S.ci, true); else setContest(S.ci + 1, false); } else startLive(); } }
function layoutPods(W, H) {
  const out = [], land = W > H * 1.05, gap = 10;
  if (land) {
    const cw = Math.min(W * 0.3, 360), ph = Math.min((H - gap * 3) / 2, 230), top = Math.max(gap, (H - (ph * 2 + gap)) / 2);
    out.push([gap, top, cw, ph], [gap, top + ph + gap, cw, ph], [W - cw - gap, top, cw, ph], [W - cw - gap, top + ph + gap, cw, ph]);
    const midW = W - 2 * cw - 4 * gap, ww = Math.min(midW, 340);
    if (H < 520) { const wh = Math.min(ph, H * 0.4); out.push([(W - ww) / 2, H - wh - gap, ww, wh]); return { pods: out, card: [cw + 2 * gap, gap, midW, H - wh - 3 * gap], reaper: null }; }
    const wh = Math.min(H * 0.32, 170); out.push([(W - ww) / 2, H - wh - gap, ww, wh]);
    return { pods: out, card: [cw + 2 * gap, H * 0.2, midW, H * 0.8 - wh - 2 * gap], reaper: [W / 2, H * 0.1, Math.min(H * 0.0016, 0.9)] };
  }
  const cardH = Math.min(H * 0.26, 190), ph = (H - cardH - gap * 4) / 3, pw = (W - gap * 3) / 2, y0 = cardH + gap * 2;
  out.push([gap, y0, pw, ph], [gap, y0 + ph + gap, pw, ph], [pw + 2 * gap, y0, pw, ph], [pw + 2 * gap, y0 + ph + gap, pw, ph], [W * 0.18, y0 + 2 * (ph + gap), W * 0.64, ph]);
  return { pods: out, card: [gap + 56, gap, W - 2 * gap - 56, cardH], reaper: [36, cardH * 0.5 + gap, Math.min(cardH / 190, 0.45)] };
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fitText(ctx, s, w) { s = String(s); if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
function drawArena(dt) {
  const ctx = lx, W = LW, H = LH; if (!W) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  // lab floor: grid + drifting motes
  ctx.strokeStyle = 'rgba(90,140,220,.06)'; ctx.lineWidth = 1; const gs = 36, off = (S.t * 6) % gs;
  ctx.beginPath(); for (let x = -off; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = -off; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  for (let i = 0; i < 40; i++) { const x = (i * 97.3 + S.t * (4 + i % 5)) % W, y = (i * 53.7 + Math.sin(S.t * 0.3 + i) * 20 + H) % H; ctx.fillStyle = `rgba(140,200,255,${0.05 + 0.05 * Math.sin(S.t + i)})`; ctx.fillRect(x, y, 2, 2); }
  const L = S.live, Lay = layoutPods(W, H); pods = [];
  // reaper + trial card
  if (Lay.reaper) { const [rx, ry, rs] = Lay.reaper; drawReaper(ctx, rx, ry, rs, S.t, { rage: S.flash }); }
  S.flash = Math.max(0, S.flash - dt * 1.5);
  const [cx, cy, cw, ch] = Lay.card;
  if (L) {
    const t = TASK[L.c.family];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#dfe8f5'; ctx.font = `600 ${Math.min(18, cw / 18)}px system-ui`;
    ctx.fillText(fitText(ctx, `${t.icon} ${t.name}${S.scr ? ' · SCRAMBLED' : ''}${L.c.sealed ? ' · SEALED' : ''}`, cw), cx + cw / 2, cy + 4);
    ctx.font = `${Math.min(12, cw / 34)}px system-ui`; ctx.fillStyle = '#8796ad';
    ctx.fillText(fitText(ctx, S.scr ? 'Same rule, new surface: every symbol relabelled to a glyph' + (t.varLen ? '' : ', positions permuted') : t.blurb, cw), cx + cw / 2, cy + 26);
    ctx.fillText(`trial ${L.i} / 240 · ${t.domain} · chance ${pct(S.arch.tasks.find(x => x.id === t.id).chance)}`, cx + cw / 2, cy + 42);
    if (L.item) {
      const toks = L.item.input, n = toks.length, maxW = cw - 20; let cell = Math.max(16, Math.min(40, maxW / Math.min(n + 2, 12))); const perRow = Math.max(1, Math.floor(maxW / cell) - 2); cell = Math.max(14, Math.min(cell, (ch - 70) / Math.ceil(n / perRow) - 4));
      const rows = Math.ceil(n / perRow), tokH = rows * (cell + 4), raceH = ch - 62 - tokH - 40, y0 = raceH > 70 ? cy + 70 : cy + 62 + Math.max(0, (ch - 62 - tokH - 10) / 2);
      if (raceH > 70) drawRace(ctx, L, cx + 10, y0 + tokH + 24, cw - 20, raceH);
      ctx.font = `600 ${cell * 0.5}px system-ui`; ctx.textBaseline = 'middle';
      for (let k = 0; k < n; k++) { const row = Math.floor(k / perRow), col = k % perRow, inRow = Math.min(perRow, n - row * perRow) + (row === rows - 1 ? 2 : 0);
        const x = cx + cw / 2 - inRow * cell / 2 + col * cell, y = y0 + row * (cell + 4); rr(ctx, x + 2, y, cell - 4, cell, 6); ctx.fillStyle = 'rgba(120,170,255,.1)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,200,255,.3)'; ctx.stroke();
        ctx.fillStyle = '#eaf2ff'; const s = String(toks[k]); ctx.font = `600 ${s.length > 2 ? cell * 0.3 : cell * 0.5}px system-ui`; ctx.fillText(s, x + cell / 2, y + cell / 2); }
      const k = n, row = rows - 1, col = (k - row * perRow), inRow = Math.min(perRow, n - row * perRow) + 2, x = cx + cw / 2 - inRow * cell / 2 + col * cell, y = y0 + row * (cell + 4);
      ctx.fillStyle = '#8796ad'; ctx.font = `${cell * 0.45}px system-ui`; ctx.fillText('→', x + cell / 2, y + cell / 2);
      rr(ctx, x + cell + 2, y, cell * 1.2, cell, 6); ctx.fillStyle = 'rgba(255,215,106,.14)'; ctx.fill(); ctx.strokeStyle = '#ffd76a'; ctx.stroke();
      ctx.fillStyle = '#ffd76a'; const as = String(L.item.answer); ctx.font = `700 ${as.length > 2 ? cell * 0.3 : cell * 0.5}px system-ui`; ctx.fillText(as, x + cell * 1.6 + 2, y + cell / 2);
    } else { ctx.font = '13px system-ui'; ctx.fillStyle = '#8796ad'; ctx.fillText(L.err ? L.err : S.playing ? 'spawning learners in the sandbox…' : 'press SPACE / RUN to watch them learn this task from nothing', cx + cw / 2, cy + ch / 2); }
  }
  // pods
  const fates = S.gens[S.gi].entries;
  Lay.pods.forEach(([x, y, w, h], k) => {
    const p = L && L.pods[k]; if (!p) return; const e = p.e; pods.push({ x, y, w, h, e });
    const col = BCOL[e.brain] || '#fff', fl = p.flash; p.flash = Math.max(0, p.flash - dt * 3);
    rr(ctx, x, y, w, h, 14); const bg = ctx.createLinearGradient(x, y, x, y + h); bg.addColorStop(0, 'rgba(16,24,40,.82)'); bg.addColorStop(1, 'rgba(8,12,22,.82)'); ctx.fillStyle = bg; ctx.fill();
    const lc = p.last && fl > 0 ? (p.last.v === 1 ? '109,255,156' : p.last.v === -2 ? '255,77,94' : '135,150,173') : null;
    ctx.lineWidth = 1.5; ctx.strokeStyle = lc ? `rgba(${lc},${0.3 + fl * 0.6})` : hexA(col, 0.4); ctx.stroke();
    if (lc) { ctx.save(); ctx.shadowColor = `rgba(${lc},1)`; ctx.shadowBlur = 16 * fl; ctx.stroke(); ctx.restore(); }
    const compact = h < 160, R = Math.min(h * (compact ? 0.26 : 0.3), w * 0.15), ox = x + R + 12, oy = y + (compact ? h * 0.4 : h * 0.42);
    const shake = p.last && p.last.v === -2 ? Math.sin(S.t * 60) * 3 * fl : 0;
    drawOrganism(ctx, e.genome, ox + shake, oy, R, S.t, { seed: k * 1.7, glow: 1 + fl });
    const tx = ox + R + 12, tw = x + w - tx - 8; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const fs1 = Math.max(9, Math.min(12, h * 0.07)), fs2 = Math.max(11, Math.min(16, h * 0.1, w / 15)), fs4 = Math.max(12, Math.min(22, h * 0.12)), fs5 = Math.max(9, Math.min(12, h * 0.07));
    let ty = y + 8;
    const fe = L.done ? fates.find(z => z.id === e.id) : null, pass = fe && /passed/.test(fe.fate || '');
    const stamp = fe && fe.fate ? (pass ? (fe.rank === 1 ? '★ SEED' : '★ PARTNER') : '✝ SUPPRESSED') : '';
    ctx.font = `800 ${fs1}px system-ui`; const sw = stamp ? ctx.measureText(stamp).width + 6 : 0;
    if (stamp) { ctx.textAlign = 'right'; ctx.fillStyle = pass ? '#ffd76a' : '#ff6b7a'; ctx.fillText(stamp, x + w - 8, ty); ctx.textAlign = 'left'; }
    ctx.fillStyle = col; ctx.font = `700 ${fs1}px system-ui`; ctx.fillText(fitText(ctx, `${e.slot} · ${e.brain === 'W' ? 'WILD CARD' : e.brain === 'A' ? 'PROMETHEUS' : 'SIBYL'}`, tw - sw), tx, ty); ty += fs1 + 4;
    ctx.fillStyle = '#fff'; ctx.font = `700 ${fs2}px system-ui`; ctx.fillText(fitText(ctx, e.name, tw), tx, ty); ty += fs2 + 4;
    if (!compact) { ctx.fillStyle = '#8796ad'; ctx.font = `${fs5}px system-ui`; ctx.fillText(fitText(ctx, e.paradigm, tw), tx, ty); ty += fs5 + 8; }
    ctx.font = `700 ${fs4}px system-ui`;
    if (p.err && !p.n) { ctx.fillStyle = '#ff4d5e'; ctx.font = `${fs5}px system-ui`; ctx.fillText(fitText(ctx, '⚠ ' + p.err, tw), tx, ty); }
    else if (p.last) { const v = p.last.v; ctx.fillStyle = v === 1 ? '#6dff9c' : v === -2 ? '#ff4d5e' : '#8796ad'; ctx.fillText(fitText(ctx, (p.last.pred == null ? '— abstain' : p.last.pred) + (v === 1 ? '  ✓' : v === -2 ? '  ✗' : ''), tw), tx, ty); }
    ty += fs4 + 4;
    ctx.font = `${fs5}px system-ui`; ctx.fillStyle = '#dfe8f5';
    const solved = p.n ? Math.max(0, p.pts / p.n) : 0, mt = L.done && L.match ? L.match[k] : null;
    ctx.fillText(fitText(ctx, `${p.pts >= 0 ? '+' : ''}${p.pts} pts · solved ${pct(solved)}${p.steps ? ' · ✔@' + p.steps : ''}`, tw), tx, ty);
    if (mt != null) { ctx.fillStyle = mt ? '#6dff9c' : '#ff4d5e'; ctx.font = `${Math.max(9, fs5 - 1)}px system-ui`; ctx.textAlign = 'right'; ctx.fillText(mt ? '✓ = archive' : '≠ archive', x + w - 8, y + h - fs5 - 6); ctx.textAlign = 'left'; }
    // learning curve (rolling 20-trial accuracy) along the bottom
    const gx = x + 12, gw = w - 24, gy = y + h - 8, gh = Math.max(14, h * (compact ? 0.18 : 0.24));
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.moveTo(gx, gy - gh * 0.8); ctx.lineTo(gx + gw, gy - gh * 0.8); ctx.stroke();
    if (p.hist.length > 1) { ctx.beginPath(); p.hist.forEach((v, i) => { const X = gx + gw * i / 239, Y = gy - gh * v; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.stroke(); ctx.restore(); ctx.lineWidth = 1; }
    if (p.steps) { const X = gx + gw * (p.steps - 1) / 239; ctx.strokeStyle = 'rgba(255,215,106,.7)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X, gy); ctx.lineTo(X, gy - gh); ctx.stroke(); ctx.setLineDash([]); }
  });
}
function drawRace(ctx, L, x, y, w, h) {
  rr(ctx, x, y, w, h, 12); ctx.fillStyle = 'rgba(10,16,30,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(120,160,220,.15)'; ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '700 10px system-ui'; ctx.fillStyle = '#8796ad'; ctx.fillText('LEARNING RACE · right answers in the last 20 trials', x + 10, y + 8);
  const gx = x + 34, gw = w - 44, gy = y + h - 16, gh = h - 44;
  ctx.font = '9px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of [0, 0.5, 0.8, 1]) { const Y = gy - gh * v; ctx.strokeStyle = v === 0.8 ? 'rgba(255,215,106,.3)' : 'rgba(255,255,255,.06)'; ctx.setLineDash(v === 0.8 ? [4, 4] : []); ctx.beginPath(); ctx.moveTo(gx, Y); ctx.lineTo(gx + gw, Y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#8796ad'; ctx.fillText(v === 0.8 ? 'solved' : Math.round(v * 100) + '%', gx - 4, Y); }
  L.pods.forEach(p => { if (p.hist.length < 2) return; const col = BCOL[p.e.brain]; ctx.beginPath(); p.hist.forEach((v, i) => { const X = gx + gw * i / 239, Y = gy - gh * v; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const v = p.hist[p.hist.length - 1], X = gx + gw * (p.hist.length - 1) / 239, Y = gy - gh * v; ctx.beginPath(); ctx.arc(X, Y, 3.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.font = '700 9px system-ui'; ctx.fillText(p.e.slot, Math.min(X + 6, gx + gw - 14), Y - 7); });
}
lab.addEventListener('click', ev => { const r = lab.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; const p = pods.find(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h); if (p) { SFX.ui(); openCard(p.e); } });

/* ---------------- design card ---------------- */
function genomeHTML(g, depth = 0) {
  if (g.paradigm === 'hybrid' && g.parts) return `<div class="sub">Hybrid · controller <b>${esc(g.mode)}</b> (gate ${g.genes.gate}) · ${g.mode === 'arbiter' ? 'the part with the better recent track record answers' : 'part 1 answers when sure, otherwise part 2'}</div>` + g.parts.map((p, i) => `<div class="part"><b style="color:${pinfo(p.paradigm).color}">part ${i + 1}: ${esc(describe(p))}</b>${genomeHTML(p, depth + 1)}</div>`).join('');
  const genes = Object.entries(GENES).map(([k, G]) => { const v = g.genes[k], u = (v - G.min) / (G.max - G.min); return `<div class="g" title="${esc(G.desc)}"><span>${esc(G.label)}</span><span class="gb"><i style="width:${u * 100}%;background:${pinfo(g.paradigm).color}"></i></span><span>${v}</span></div>`; }).join('');
  const fl = (grp, D) => Object.keys(D).map(k => `<span class="flag${g[grp] && g[grp][k] ? ' on' : ''}" title="${esc(D[k])}">${k}</span>`).join('');
  return `<div class="genes">${genes}</div><div>${fl('biases', BIASES)}</div><div>${fl('mech', MECHS)}</div>${g.code ? '<div class="note">carries its own code (live LLM design)</div>' : ''}`;
}
function openCard(e) {
  const g = genOf(e), P = pinfo(e.paradigms && e.paradigms.length === 1 ? e.paradigms[0] : e.genome.paradigm), sel = e.sel || {};
  const au = S.arch.audit && S.arch.audit[e.id];
  const heat = sel.per ? `<table class="hm"><tr><th></th>${SELECT.map(f => `<th title="${esc(TASK[f].name)}">${TASK[f].icon}</th>`).join('')}</tr>` + [false, true].map(sc => `<tr><td class="nm">${sc ? 'scrambled' : 'plain'}</td>${SELECT.map(f => { const q = sel.per.find(p => p.family === f && p.scrambled === sc); return heatCell(q); }).join('')}</tr>`).join('') + '</table>' : '';
  $('dBody').innerHTML = `<h2 style="color:${BCOL[e.brain]}">${esc(e.name)}</h2>
    <div class="sub">GEN ${e.gen} · ${e.slot} · ${e.brain === 'W' ? 'WILD CARD' : e.brain === 'A' ? 'Brain A · PROMETHEUS' : 'Brain B · SIBYL'} · ${esc(e.paradigm)}</div>
    <span class="badge ${originClass(e.origin)}">${esc(e.origin)}</span> ${e.fate ? `<span class="badge" style="color:${/passed/.test(e.fate) ? '#ffd76a' : '#ff4d5e'}">rank ${e.rank} · ${esc(e.fate)}</span>` : ''}
    <div class="sx"><div><b>${f3(sel.score)}</b><span>Reaper score</span></div><div><b>${pct(sel.S)}</b><span>S plain solved</span></div><div><b>${pct(sel.Q)}</b><span>Q speed</span></div><div><b>${pct(sel.X)}</b><span>X scrambled</span></div></div>
    <div class="note">${sel.solvedStreams ?? '—'}/${sel.streams ?? 24} streams solved (16 of the last 20 right) · median ${sel.medianSteps ?? '—'} trials · transfer ratio X/S ${sel.transferRatio ?? '—'} · dev (training families) ${f3(e.dev && e.dev.score)} · sealed ${f3(e.sealed && e.sealed.score)}${au ? ` · audit ${f3(au.mean)} ± ${f3(au.sd)} over 4 fresh batteries` : ''} · mean size ${sel.meanSize ?? '—'}</div>
    ${heat}
    ${e.rationale ? `<h4>Rationale <small class="note">(written before evaluation)</small></h4><blockquote>${esc(e.rationale)}</blockquote>` : ''}
    ${e.critique ? `<h4>Critique <small class="note">(after the verdict · log only, never used to select)</small></h4><blockquote class="crit">${esc(e.critique)}</blockquote>` : ''}
    ${e.ops && e.ops.length ? `<h4>Reprogramming applied</h4><div class="note">${e.ops.map(esc).join('<br>')}</div>` : ''}
    ${e.parents && e.parents.length ? `<div class="note">parents: ${e.parents.map(p => `<a href="#" data-id="${p}">${p}</a>`).join(', ')}</div>` : ''}
    <h4>Genome <small class="note">abstract blueprint, translated natively by each paradigm</small></h4>${genomeHTML(e.genome)}
    <div class="row"><button class="chip" id="cWatch">watch it live</button><button class="chip" id="cCode">show code</button></div><pre class="code hidden" id="cPre"></pre>`;
  $('drawer').classList.remove('hidden');
  $('dBody').querySelectorAll('a[data-id]').forEach(a => a.onclick = ev => { ev.preventDefault(); const p = entryById(a.dataset.id); if (p) openCard(p); });
  $('cCode').onclick = () => { const pre = $('cPre'); try { pre.textContent = codeFor(e.genome, LIB, hybridCode); } catch (err) { pre.textContent = err.message; } pre.classList.toggle('hidden'); };
  $('cWatch').onclick = () => { closeCard(); setView('arena'); const gi = S.gens.indexOf(g); if (gi !== S.gi) setGen(gi); setPlaying(true); };
}
function heatCell(q) { if (!q) return '<td></td>'; const v = q.solved; return `<td style="background:${heatCol(v)}" title="${esc(TASK[q.family].name)}${q.scrambled ? ' (scrambled)' : ''}: solved ${pct(v)}${q.steps ? ', at trial ' + q.steps : ''}${q.err ? ' · ' + esc(q.err) : ''}">${Math.round(v * 100)}</td>`; }
function heatCol(v) { const h = 0 + 140 * v; return `hsl(${h},${v < 0.02 ? 10 : 75}%,${v < 0.02 ? 18 : 30 + 25 * v}%)`; }
function closeCard() { $('drawer').classList.add('hidden'); }
$('dClose').onclick = closeCard;

/* ---------------- THE REAPER's verdict ---------------- */
let skullT = 0;
function openVerdict() {
  const g = S.gens[S.gi]; if (!g.verdict) return; S.verdictOpen = true; S.flash = 1; SFX.gong();
  const ranked = g.entries.slice().sort((a, b) => a.rank - b.rank), best = ranked[0].sel.score || 1;
  const au = S.arch.audit || {}, hasAudit = ranked.some(e => au[e.id]);
  $('vBody').innerHTML = `<h2>THE REAPER</h2><p>GEN ${g.gen} · battery seed ${g.selectionSeed} · 12 unseen families × plain + scrambled · score = (S + Q + X) / 3 and nothing else</p>` +
    ranked.map(e => { const pass = /passed/.test(e.fate || ''), s = e.sel; return `<div class="vrow ${pass ? 'pass' : 'supp'}" data-id="${e.id}"><div style="font-size:20px">${pass ? '★' : '✝'}</div>
      <div><div class="nm" style="color:${BCOL[e.brain]}">${e.rank}. ${esc(e.slot)} ${esc(e.name)} <span class="note">${esc(e.paradigm)}</span></div>
      <div class="fate" style="color:${pass ? '#ffd76a' : '#ff8d98'}">${esc((e.fate || '').toUpperCase())}${hasAudit && au[e.id] ? ` · audit ${f3(au[e.id].mean)}±${f3(au[e.id].sd)}` : ''}</div>
      <div class="bars"><span title="S plain solved ${pct(s.S)}"><i style="width:${s.S * 100}%;background:#6dff9c"></i></span><span title="Q speed ${pct(s.Q)}"><i style="width:${s.Q * 100}%;background:#5ad1ff"></i></span><span title="X scrambled ${pct(s.X)}"><i style="width:${(s.X || 0) * 100}%;background:#ff5fa2"></i></span></div></div>
      <div class="scr">${f3(s.score)}</div></div>`; }).join('') +
    `<p>${esc(g.verdict.text)}</p><p class="note">S <span style="color:#6dff9c">■</span> plain solved · Q <span style="color:#5ad1ff">■</span> speed · X <span style="color:#ff5fa2">■</span> scrambled transfer · ★ passed on (rank 1 seeds BOTH brains, rank 2 is the crossover partner) · ✝ suppressed${hasAudit ? ' · audit = mean ± sd on 4 more fresh batteries, after the fact (never used to select)' : ''}</p>` +
    (g.note ? `<p class="note">${esc(g.note)}</p>` : '');
  $('verdict').classList.remove('hidden');
  $('vBody').querySelectorAll('.vrow').forEach((r, i) => { r.onclick = () => { const e = entryById(r.dataset.id); if (e) { closeVerdict(); openCard(e); } };
    setTimeout(() => { r.classList.add('in'); if (S.verdictOpen) (r.classList.contains('pass') ? SFX.pass : SFX.supp)(); }, 700 + (ranked.length - 1 - i) * 380); });
}
function closeVerdict() { S.verdictOpen = false; $('verdict').classList.add('hidden'); }
$('vClose').onclick = closeVerdict;
function drawSkull() { if (!S.verdictOpen) return; const c = $('skull'), x = c.getContext('2d'); x.clearRect(0, 0, 160, 160); drawReaper(x, 80, 92, 1.05, skullT, { rage: 0.5 + 0.5 * Math.sin(skullT * 2) }); }

/* ---------------- LINEAGE ---------------- */
const tree = $('tree'); let treeNodes = [];
function drawTree() {
  const pane = $('vLineage'), lg = $('legend').offsetHeight + 8, W = pane.clientWidth, avail = pane.clientHeight - lg, rowH = Math.max(112, Math.min(170, (avail - 110) / Math.max(1, S.gens.length))), H = Math.max(avail, S.gens.length * rowH + 100);
  pane.style.overflowY = 'auto'; tree.style.position = 'relative'; tree.style.height = H + 'px'; tree.style.width = W + 'px';
  if (tree.width !== Math.round(W * DPR) || tree.height !== Math.round(H * DPR)) { tree.width = Math.round(W * DPR); tree.height = Math.round(H * DPR); } const ctx = tree.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const left = Math.min(130, W * 0.16), colW = (W - left - 20) / 5; treeNodes = [];
  const pos = {};
  S.gens.forEach((g, gi) => g.entries.forEach(e => { const k = SLOTS.indexOf(e.slot); pos[e.id] = { x: left + colW * (k + 0.5), y: 72 + gi * rowH, e }; }));
  // edges
  for (const id in pos) { const n = pos[id]; (n.e.parents || []).forEach((pid, j) => { const p = pos[pid]; if (!p) return; const pass = /passed/.test(p.e.fate || '');
    ctx.strokeStyle = j === 0 ? hexA(BCOL[n.e.brain] || '#ffffff', 0.45) : 'rgba(255,255,255,.22)'; ctx.lineWidth = j === 0 ? 2 : 1.2; ctx.setLineDash(j === 0 ? [] : [4, 4]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 20); ctx.bezierCurveTo(p.x, p.y + rowH * 0.6, n.x, n.y - rowH * 0.6, n.x, n.y - 22); ctx.stroke(); ctx.setLineDash([]); if (!pass) return; }); }
  S.gens.forEach((g, gi) => { const y = 72 + gi * rowH; ctx.fillStyle = gi === S.gi ? '#ffd76a' : '#8796ad'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '700 13px system-ui'; ctx.fillText(`GEN ${g.gen}`, 10, y - 8); ctx.font = '10px system-ui'; ctx.fillText(fitText(ctx, g.browser ? 'browser' : 'offline', left - 16), 10, y + 8); });
  for (const id in pos) { const { x, y, e } = pos[id], pass = /passed/.test(e.fate || ''), R = Math.min(colW * 0.22, rowH * 0.19) * (0.75 + 0.5 * (e.sel ? e.sel.score : 0));
    drawOrganism(ctx, e.genome, x, y, R, S.t, { alpha: pass || !e.fate ? 1 : 0.42, seed: x * 0.01 });
    if (e.rank === 1) { ctx.fillStyle = '#ffd76a'; ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♛', x, y - R - 8); }
    ctx.textAlign = 'center'; ctx.font = '600 11px system-ui'; ctx.fillStyle = pass ? '#fff' : '#8796ad'; ctx.fillText(fitText(ctx, `${e.slot} ${e.name}`, colW - 6), x, y + R + 8);
    ctx.font = '10px system-ui'; ctx.fillStyle = pass ? '#ffd76a' : '#ff8d98'; ctx.fillText(e.sel ? `${f3(e.sel.score)} ${pass ? '★' : '✝'}` : '', x, y + R + 22);
    treeNodes.push({ x, y, r: R + 10, e }); }
  // column headers
  ctx.font = '700 11px system-ui'; SLOTS.forEach((s, k) => { ctx.fillStyle = BCOL[s[0]] || '#fff'; ctx.textAlign = 'center'; ctx.fillText(colW < 120 ? (s === 'W' ? 'WILD' : s) : s === 'W' ? 'WILD CARD' : `${s} · ${s[0] === 'A' ? 'PROMETHEUS' : 'SIBYL'}`, left + colW * (k + 0.5), 14); });
}
tree.addEventListener('click', ev => { const r = tree.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; const n = treeNodes.find(n => (n.x - x) ** 2 + (n.y - y) ** 2 < n.r * n.r); if (n) { SFX.ui(); openCard(n.e); } });
function buildLegend() { const used = new Set(); S.gens.forEach(g => g.entries.forEach(e => paradigmsOf(e.genome).forEach(p => used.add(p)))); $('legend').innerHTML = [...used].map(p => `<span><i style="color:${pinfo(p).color};background:${pinfo(p).color}"></i>${esc(pinfo(p).name)}</span>`).join('') + '<span>♛ winner · ★ passed on · ✝ suppressed · solid line = first parent</span>'; }

/* ---------------- MAP ---------------- */
let mapPts = [];
function renderMap() { drawMap(); renderHeat(); renderAudit(); }
function drawMap() {
  const c = $('map'), r = c.getBoundingClientRect(); if (!r.width) return; if (c.width !== Math.round(r.width * DPR) || c.height !== Math.round(r.height * DPR)) { c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR); }
  const ctx = c.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); const W = r.width, H = r.height, m = 30; ctx.clearRect(0, 0, W, H);
  const X = v => m + v * (W - 2 * m), Y = v => H - m - v * (H - 2 * m);
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(X(i / 4), Y(0)); ctx.lineTo(X(i / 4), Y(1)); ctx.moveTo(X(0), Y(i / 4)); ctx.lineTo(X(1), Y(i / 4)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,215,106,.35)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8796ad'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('S: plain streams solved →', W / 2, H - 8); ctx.save(); ctx.translate(10, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('X: scrambled streams solved →', 0, 0); ctx.restore();
  mapPts = []; const win = [];
  S.gens.forEach((g, gi) => g.entries.forEach(e => { if (!e.sel || e.sel.X == null) return; const x = X(e.sel.S), y = Y(e.sel.X), R = 5 + 14 * e.sel.Q;
    const cur = gi === S.gi; drawOrganism(ctx, e.genome, x, y, R, S.t, { alpha: cur ? 1 : 0.35, glow: cur ? 1.2 : 0.5, seed: gi });
    if (cur) { ctx.fillStyle = BCOL[e.brain]; ctx.font = '700 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText(e.slot, x + R + 3, y + 3); } if (e.rank === 1) win.push([x, y, g.gen]); mapPts.push({ x, y, r: R + 4, e }); }));
  ctx.strokeStyle = 'rgba(255,215,106,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); win.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#ffd76a'; ctx.font = '700 10px system-ui'; win.forEach(([x, y, n]) => ctx.fillText('G' + n, x + 12, y - 10));
}
$('map').addEventListener('click', ev => { const r = $('map').getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; let best = null, bd = 1e9; for (const p of mapPts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < p.r * p.r && d < bd) { bd = d; best = p; } } if (best) openCard(best.e); });
function renderHeat() {
  const g = S.gens[S.gi]; $('hmGen').textContent = `GEN ${g.gen} · ‹ › or ↑/↓ to change`;
  const fams = SELECT.concat(SEALED);
  let h = `<table class="hm"><tr><th></th><th></th>${fams.map(f => `<th class="v" colspan="2"${SEALED.includes(f) ? ' style="color:#ffd76a"' : ''}>${esc(TASK[f].name)}${SEALED.includes(f) ? ' (sealed)' : ''}</th>`).join('')}</tr>`;
  for (const e of g.entries.slice().sort((a, b) => (a.rank || 9) - (b.rank || 9))) {
    h += `<tr><td class="nm" data-id="${e.id}" style="color:${BCOL[e.brain]}">${e.rank || ''}. ${esc(e.slot)} ${esc(e.name)}</td><td class="sc">${f3(e.sel && e.sel.score)}</td>`;
    for (const f of fams) for (const sc of [false, true]) { const src = SEALED.includes(f) ? e.sealed : e.sel; h += heatCell(src && src.per && src.per.find(p => p.family === f && p.scrambled === sc)); }
    h += '</tr>';
  }
  $('heat').innerHTML = h + '</table>';
  $('heat').querySelectorAll('td.nm').forEach(td => td.onclick = () => openCard(entryById(td.dataset.id)));
}
function renderAudit() {
  const A = S.arch.audit || {}, ids = Object.keys(A); if (!ids.length) { $('audit').textContent = 'No audit.'; return; }
  $('audit').innerHTML = `<table><tr><th>design</th><th>selection score</th><th>audit mean ± sd</th><th>4 fresh batteries</th><th>fate</th></tr>${ids.map(id => { const e = entryById(id); return e ? `<tr><td style="color:${BCOL[e.brain]}">${id} ${esc(e.name)}</td><td>${f3(e.sel.score)}</td><td><b>${f3(A[id].mean)}</b> ± ${f3(A[id].sd)}</td><td>${A[id].scores.map(f3).join(' · ')}</td><td>${esc(e.fate)}</td></tr>` : ''; }).join('')}</table>
  <p class="note">Gen 1's order holds on every fresh battery. In gen 4 THE REAPER passed on B2 over A1 by 0.001 on its one battery; on four more batteries A1 is ahead (0.608 vs 0.592). Selection stays as it happened: one fresh battery per generation, Reaper score only. Margins under ~0.02 are noise.</p>`;
}

/* ---------------- EVOLVE (browser) ---------------- */
function logE(s) { const el = $('elog'); el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; }
function renderEvolve() {
  const c = llmCfg(); $('lEnd').value = c.endpoint || 'https://api.x.ai/v1'; $('lModel').value = c.model || 'grok-4'; $('lKey').value = c.key ? '••••••••' : '';
  $('lStat').textContent = c.key ? 'key saved in this browser' : 'no key: built-in operators only'; $('useLLM').disabled = !hasKey(); if (!hasKey()) $('useLLM').checked = false;
  $('nextGen').textContent = S.gens[S.gens.length - 1].gen + 1;
}
$('lSave').onclick = () => { const c = llmCfg(); c.endpoint = $('lEnd').value.trim() || 'https://api.x.ai/v1'; c.model = $('lModel').value.trim() || 'grok-4'; const k = $('lKey').value.trim(); if (k && !/^•+$/.test(k)) c.key = k; saveCfg(c); renderEvolve(); SFX.ui(); };
$('lForget').onclick = () => { const c = llmCfg(); delete c.key; saveCfg(c); renderEvolve(); SFX.ui(); };
$('bReset').onclick = () => { if (S.evolving) return; S.gens = S.gens.filter(g => !g.browser); saveLocal(); setGen(Math.min(S.gi, S.gens.length - 1)); buildLegend(); renderEvolve(); logE('browser generations forgotten'); };
$('bStop').onclick = () => { S.stop = true; logE('stopping after this generation…'); };
$('bBreed').onclick = () => breedRuns(1);
$('bAuto5').onclick = () => breedRuns(5);
const zero = err => ({ score: 0, S: 0, Q: 0, X: 0, transferRatio: null, acc: 0, solvedStreams: 0, streams: 24, medianSteps: null, meanSize: 0, ms: 0, per: [], err });
function evalInWorker(design, kind, seed, onProg) {
  return new Promise(res => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); let dog;
    const pet = () => { clearTimeout(dog); dog = setTimeout(() => { w.terminate(); res(zero('sandbox timeout: no answer for 20 s, worker terminated')); }, 20000); };
    w.onmessage = ev => { const m = ev.data; pet(); if (m.cmd === 'progress' && onProg) onProg(m.k / m.n); if (m.cmd === 'evaluated') { clearTimeout(dog); w.terminate(); res(m.result); } if (m.cmd === 'error') { clearTimeout(dog); w.terminate(); res(zero(m.error)); } };
    w.onerror = ev => { ev.preventDefault && ev.preventDefault(); clearTimeout(dog); w.terminate(); res(zero('worker error: ' + (ev.message || ''))); };
    pet(); w.postMessage({ cmd: 'evaluate', id: 1, kind, seed, code: design.code, genome: design.genome });
  });
}
function smoke(code, genome) {
  return new Promise(res => { const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); const dog = setTimeout(() => { w.terminate(); res({ ok: false, err: 'timeout' }); }, 8000);
    w.onmessage = ev => { const m = ev.data; if (m.cmd === 'smoked' || m.cmd === 'error') { clearTimeout(dog); w.terminate(); res(m.cmd === 'smoked' ? m : { ok: false, err: m.error }); } };
    w.postMessage({ cmd: 'smoke', id: 1, code, genome }); });
}
async function llmDesign(slot, brain, seedEnt) {
  const hist = S.gens.slice(-4).map(g => `gen ${g.gen}: winner ${g.verdict.winner} (${entryById(g.verdict.winner).paradigm}, ${f3(entryById(g.verdict.winner).sel.score)})`).join('; ');
  const j = await callLLM(buildPrompt({ slot, brain }, seedEnt, hist));
  let genome;
  if (j.code) {
    if (typeof j.code !== 'string' || j.code.length > 30000 || FORBIDDEN.test(j.code)) throw new Error('code rejected by the static sandbox check');
    genome = cleanGenome(j.genome, baseGenome('x')); delete genome.parts; delete genome.mode;
    genome.paradigm = 'llm-' + String(j.paradigm || j.name || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24); genome.code = j.code;
    const sm = await smoke(j.code, genome); if (!sm.ok) throw new Error('code failed the sandbox smoke test: ' + sm.err);
  } else { if (slot === 'W') throw new Error('the wild card reply had no code'); genome = cleanGenome(j.genome, seedEnt.genome); }
  codeFor(genome, LIB, hybridCode);
  return { name: String(j.name || 'LLM design').slice(0, 40), rationale: String(j.rationale || '').slice(0, 800), genome, ops: Array.isArray(j.edits) ? j.edits.map(String).slice(0, 12) : [j.code ? 'new code' : 'genome edit'] };
}
async function breedRuns(n) {
  if (S.evolving) return; S.evolving = true; S.stop = false; $('bBreed').disabled = true;
  try { for (let i = 0; i < n && !S.stop; i++) await breedOne(); } catch (e) { logE('error: ' + e.message); }
  S.evolving = false; $('bBreed').disabled = false; renderEvolve();
}
async function breedOne() {
  const prev = S.gens[S.gens.length - 1], gen = prev.gen + 1, rseed = (Date.now() ^ (Math.random() * 1e9)) >>> 0, r = mulberry32(rseed);
  const seedEnt = entryById(prev.verdict.passed[0]), partEnt = entryById(prev.verdict.passed[1]);
  const useLLM = $('useLLM').checked && hasKey(), model = llmCfg().model;
  logE(`\n— GEN ${gen} — seed ${seedEnt.id} (${seedEnt.name}), partner ${partEnt.id} (${partEnt.name}) · rng ${rseed}`); SFX.breed();
  const specs = breedBuiltIn(seedEnt, partEnt, r);
  if (useLLM) for (const sp of specs.filter(s => s.slot === 'A1' || s.slot === 'B1' || s.slot === 'W')) {
    const brain = sp.slot === 'W' ? 'W' : sp.slot[0]; logE(`${sp.slot}: asking the live LLM (${model})…`);
    try { const d = await llmDesign(sp.slot, brain, seedEnt); Object.assign(sp, d, { origin: `live LLM (${model}) · ${brain === 'W' ? 'wild card' : 'Brain ' + brain}`, parents: sp.slot === 'W' ? [] : [seedEnt.id] }); logE(`${sp.slot}: ${d.name}: ${d.rationale}`); }
    catch (e) { sp.origin += ` (live LLM failed: ${e.message})`; logE(`${sp.slot}: LLM failed (${e.message}); built-in operator used instead`); }
  }
  const seed = selectionSeed(gen);
  $('prog').innerHTML = specs.map(sp => `<div class="p"><span style="width:110px;color:${BCOL[sp.slot[0]] || '#fff'}">${sp.slot} ${esc(sp.name)}</span><span class="bar"><i id="pb${sp.slot}"></i></span></div>`).join('');
  const entries = await Promise.all(specs.map(async (sp, order) => {
    let code; try { code = codeFor(sp.genome, LIB, hybridCode); } catch (e) { code = null; }
    const sel = code ? await evalInWorker({ code, genome: sp.genome }, 'selection', seed, f => { const b = $('pb' + sp.slot); if (b) b.style.width = (f * 80) + '%'; }) : zero('no implementation');
    const sealed = code ? await evalInWorker({ code, genome: sp.genome }, 'sealed', SEALED_SEED, f => { const b = $('pb' + sp.slot); if (b) b.style.width = (80 + f * 20) + '%'; }) : zero('no implementation');
    const ps = paradigmsOf(sp.genome);
    return { id: `g${gen}-${sp.slot}`, gen, slot: sp.slot, brain: sp.slot === 'W' ? 'W' : sp.slot[0], order, name: sp.name, paradigm: describe(sp.genome), paradigms: ps, genome: sp.genome, parents: sp.parents, ops: sp.ops, origin: sp.origin, rationale: sp.rationale || '', critique: '', sel, sealed };
  }));
  const ranked = reaperRank(entries);
  ranked.forEach((e, i) => { e.rank = i + 1; e.fate = i === 0 ? 'passed on: seed of both brains' : i === 1 ? 'passed on: crossover partner' : 'suppressed'; });
  const w = ranked[0], margin = +(w.sel.score - ranked[1].sel.score).toFixed(3);
  const verdict = { winner: w.id, winnerBrain: w.brain, passed: [ranked[0].id, ranked[1].id], suppressed: ranked.slice(2).map(e => e.id), margin,
    text: `${w.slot} ${w.paradigm} wins with REAPER ${f3(w.sel.score)} (S ${w.sel.S.toFixed(2)}, Q ${w.sel.Q.toFixed(2)}, X ${(w.sel.X || 0).toFixed(2)}), ${margin} ahead of ${ranked[1].slot}.${margin < 0.02 ? ' Margin is inside battery noise.' : ''}` };
  if (useLLM) { try { const j = await callLLM([{ role: 'system', content: 'You critique designs in a meta-evolution arena. Your words go to the log only; they never affect selection. Reply with JSON only.' },
    { role: 'user', content: `Generation ${gen} results (THE REAPER already decided): ` + ranked.map(e => `${e.slot} ${e.name} [${e.paradigm}] score ${f3(e.sel.score)} S ${f3(e.sel.S)} Q ${f3(e.sel.Q)} X ${f3(e.sel.X)}; ` + e.sel.per.map(p => `${p.family}${p.scrambled ? '*' : ''} ${Math.round(p.solved * 100)}`).join(' ')).join('\n') + '\nReturn {"A1": "...", "A2": "...", "B1": "...", "B2": "...", "W": "..."}, one or two sentences each.' }]);
    entries.forEach(e => { if (j[e.slot]) e.critique = `[live LLM critique · log only] ${String(j[e.slot]).slice(0, 500)}`; }); } catch (e) { logE('critique failed: ' + e.message); } }
  entries.forEach(e => { if (!e.critique) e.critique = `${e.sel.solvedStreams}/24 streams solved, S ${pct(e.sel.S)}, X ${pct(e.sel.X)}${e.sel.err ? ' · ' + e.sel.err : ''}. (automatic summary, no LLM)`; e.sel.per.forEach(p => delete p.curve); e.sealed.per.forEach(p => delete p.curve); });
  const G = { gen, title: useLLM ? `Browser evolution with live LLM (${model})` : 'Browser evolution: built-in operators', note: `Bred in this browser (rng ${rseed}) on a fresh battery (seed ${seed}).`, selectionSeed: seed, entries, verdict, browser: true };
  S.gens.push(G); saveLocal(); buildLegend();
  ranked.forEach(e => logE(`${e.rank}. ${e.slot} ${e.name.padEnd(18)} ${f3(e.sel.score)}  S ${f3(e.sel.S)} Q ${f3(e.sel.Q)} X ${f3(e.sel.X)}  ${e.fate}`));
  logE(verdict.text); S.flash = 1; SFX.gong(); renderEvolve();
}

/* ---------------- info ---------------- */
function renderInfo() {
  const a = S.arch;
  $('infoBody').innerHTML = `<button class="x" id="iClose" aria-label="Close">✕</button><h2>GENESIS · how it works</h2>
  <p>Two AI designers, <b style="color:#ffb347">PROMETHEUS</b> (Brain A, the structuralist) and <b style="color:#5ad1ff">SIBYL</b> (Brain B, the empiricist), plus a protected <b style="color:#ff5fa2">WILD CARD</b> slot, invent <i>learning methods</i>. Each design is born knowing nothing, then has to learn each task from its own trial and error.</p>
  <h3>Three roles</h3><p><b>PROBLEM GENERATOR</b>: every generation gets a freshly generated battery of 12 task families nobody trained on (arithmetic, pattern, logic, planning, games, memory, language-like). Each family is run plain and again with a fresh scramble: every symbol is relabelled to a random glyph and fixed layouts are permuted. Three more families are sealed and are never used for selection.<br>
  <b>SOLUTION GENERATOR</b>: rule induction, memory lookup, next-token prediction (a transformer-lite), spiking networks, and open-ended designs (Bayesian structure averaging, in-lifetime program evolution, a relational recoder), plus hybrids built by crossover.<br>
  <b>THE REAPER</b>: +1 per right answer, −2 per wrong one, 0 for an abstain. REAPER SCORE = (S + Q + X) / 3: S is the fraction of the plain streams solved, Q is speed (trials until 16 of the last 20 are right) and X is the fraction of the scrambled streams solved. <b>This is the only selection pressure</b>: no bonuses, no designer favouritism, no LLM opinion. Rank 1 seeds both brains, rank 2 is the crossover partner and the rest are suppressed.</p>
  <h3>Genome and reprogramming</h3><p>Every design carries a genome: memory capacity, abstraction depth, compositionality, search budget, learning rate, a confidence gate, inductive biases (numeric, positional, relational, temporal) and mechanisms (metacognition, replay, attention, Hebbian). Each paradigm translates the same genes into its own machinery. Reprogramming means editing that genome (an LLM edit), copying it with errors (mutation), or recombining two genomes (crossover, which can fuse two paradigms into a cascade or arbiter hybrid).</p>
  <h3>Honesty</h3><p>${esc(a.engine)}. In the offline run the agent acted as the LLM: it wrote the designs, the rationales (before results) and the critiques (after the verdict). Badges show each design's origin: <span class="o-off">offline LLM (agent)</span>, <span class="o-op">built-in operator</span> or <span class="o-live">live LLM</span>. The arena re-executes the archived code in a sandboxed worker and checks that it matches the archive. Caveats: the agent also wrote the task generator; batteries are small (240 trials per stream), so margins under about 0.02 are noise (see the audit on the Map tab); the tasks are toy domains.</p>
  <h3>Controls</h3><p>SPACE run/pause (main action) · ENTER THE REAPER's verdict (special action) · ←/→ contest · ↑/↓ generation · X scramble · F speed · A auto-advance · 1-4 views · I info · M sound · ESC close. Gamepad: A run/pause, Y or X verdict, d-pad contest and generation, LB/RB speed, B close. Touch: tap the buttons and the designs.</p>
  <p class="note">archive v${a.version} · built ${esc(a.built)} · ${S.gens.filter(g => !g.browser).length} offline generations${S.gens.some(g => g.browser) ? ` + ${S.gens.filter(g => g.browser).length} bred in this browser` : ''}</p>`;
  $('iClose').onclick = () => $('info').classList.add('hidden');
}
$('bInfo').onclick = () => { renderInfo(); $('info').classList.toggle('hidden'); };
$('info').addEventListener('click', ev => { if (ev.target === $('info')) $('info').classList.add('hidden'); });
$('bSnd').onclick = () => setSound(!AU.on);

/* ---------------- controls ---------------- */
function mainAction() { if (S.verdictOpen) return closeVerdict(); if (S.view === 'evolve') return breedRuns(1); if (S.view !== 'arena') setView('arena'); setPlaying(!S.playing); }
function specialAction() { if (S.verdictOpen) return closeVerdict(); openVerdict(); }
function speed(d) { S.speedI = Math.max(0, Math.min(SPEEDS.length - 1, S.speedI + d)); if (d === 0) S.speedI = (S.speedI + 1) % SPEEDS.length; prefs.speedI = S.speedI; savePrefs(); $('bSpeed').textContent = SPEEDS[S.speedI][1]; }
function genStep(d) { setGen(S.gi + d); if (S.view === 'map') renderMap(); if (S.view === 'lineage') drawTree(); }
$('bPlay').onclick = () => setPlaying(!S.playing);
$('bReap').onclick = specialAction;
$('bScr').onclick = () => setContest(S.ci, !S.scr);
$('bSpeed').onclick = () => speed(0);
$('bAuto').onclick = () => { S.auto = !S.auto; $('bAuto').classList.toggle('on', S.auto); };
$('gPrev').onclick = () => genStep(-1); $('gNext').onclick = () => genStep(1);
window.addEventListener('keydown', ev => {
  if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
  const k = ev.key;
  if (k === ' ' || k === 'Spacebar') { ev.preventDefault(); mainAction(); }
  else if (k === 'Enter') { ev.preventDefault(); specialAction(); }
  else if (k === 'Escape') { closeVerdict(); closeCard(); $('info').classList.add('hidden'); }
  else if (k === 'ArrowRight') { ev.preventDefault(); setContest(S.ci + 1, S.scr); } else if (k === 'ArrowLeft') { ev.preventDefault(); setContest(S.ci - 1, S.scr); }
  else if (k === 'ArrowUp') { ev.preventDefault(); genStep(-1); } else if (k === 'ArrowDown') { ev.preventDefault(); genStep(1); }
  else if (k === 'x' || k === 'X') setContest(S.ci, !S.scr);
  else if (k === 'f' || k === 'F') speed(0);
  else if (k === 'a' || k === 'A') $('bAuto').click();
  else if (k === 'm' || k === 'M') setSound(!AU.on);
  else if (k === 'i' || k === 'I') $('bInfo').click();
  else if ('1234'.includes(k)) setView(['arena', 'lineage', 'map', 'evolve'][+k - 1]);
});
const pad = { prev: [] };
function pollPad() {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!gp) return;
  const b = gp.buttons.map(x => x && x.pressed), was = pad.prev, hit = i => b[i] && !was[i]; pad.prev = b;
  if (hit(0) || hit(9)) { unlockAudio(); mainAction(); } if (hit(3) || hit(2)) specialAction(); if (hit(1)) { closeVerdict(); closeCard(); }
  if (hit(15)) setContest(S.ci + 1, S.scr); if (hit(14)) setContest(S.ci - 1, S.scr); if (hit(12)) genStep(-1); if (hit(13)) genStep(1);
  if (hit(4)) speed(-1); if (hit(5)) speed(1); if (hit(8)) setContest(S.ci, !S.scr);
}

/* ---------------- loop ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; S.t += dt; skullT += dt;
  try { pollPad(); pumpLive(dt); if (S.view === 'arena') drawArena(dt); if (S.view === 'lineage' && Math.floor(S.t * 20) % 2 === 0) drawTree(); if (S.view === 'map' && Math.floor(S.t * 20) % 3 === 0) drawMap(); drawSkull(); }
  catch (e) { window.__genesisErr && window.__genesisErr(e.message); console.error(e); return; }
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
async function boot() {
  const r = await fetch('data/archive.json'); if (!r.ok) throw new Error('could not load data/archive.json (' + r.status + ')');
  S.arch = await r.json(); LIB = S.arch.library;
  S.gens = S.arch.gens.concat(localGens());
  setSound(AU.on); $('bSpeed').textContent = SPEEDS[S.speedI][1];
  window.GENESIS = { S, breedRuns, openVerdict, setView, setContest, setGen, speed };
  resize(); buildLegend(); setGen(0); setPlaying(true);
  requestAnimationFrame(frame);
}
boot().catch(e => { window.__genesisErr && window.__genesisErr(e.message); console.error(e); });
