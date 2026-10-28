/* NEURO ARENA Lab: instruments for studying self-learning in one contest. Everything is drawn from data the app
   already has (evolution history, the champion's synapses, live frames), at native device-pixel ratio. */
import { GENE, fmtGene } from './genome.js';
import { REFLEX, SUNTZU, unitName, unitClass, classCounts } from './understand.js';
const CA = '#2ee6ff', CBc = '#ff4fd8', GOLD = '#ffd25a', DIM = '#7f93b8', OK = '#5cff9d', BAD = '#ff5a5a';
export const AREA_NAMES = ['Thal E', 'Thal I', 'Sens E', 'Sens I', 'Assoc E', 'Assoc I', 'Motor A', 'Motor B', 'Motor I'];
export const RASTER_ROWS = 24, RASTER_COLS = 240;

function cv(c) {
  const dpr = Math.min(3, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return null;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); x.font = '10px -apple-system, system-ui, sans-serif'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  return { x, w, h };
}
function axes(x, w, h, pl, pr, pt, pb, ymin, ymax, fmt) {
  x.strokeStyle = 'rgba(120,160,255,.12)'; x.fillStyle = DIM; x.lineWidth = 1;
  for (let k = 0; k <= 4; k++) { const v = ymin + (ymax - ymin) * k / 4, y = pt + (1 - k / 4) * (h - pt - pb); x.beginPath(); x.moveTo(pl, y); x.lineTo(w - pr, y); x.stroke(); x.fillText(fmt(v), 2, y + 3); }
}
const pct = v => Math.round(v * 100) + '%';

// learning curve over generations: champion benchmark accuracy (step), challengers (dots), best ever, chance
export function drawCurve(c, H, chance, isPong) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, pl = 30, pr = 6, pt = 14, pb = 14, iw = w - pl - pr, ih = h - pt - pb;
  // the understanding lines can go below zero (beyond-reflex < 0 = worse than the reflex's guess)
  const lo = H.some(e => e.beyond != null && e.beyond < 0) ? -0.5 : 0;
  const G = Math.max(10, H.length ? H[H.length - 1].gen : 10), X = v => pl + v / G * iw, Y = v => pt + (1 - (Math.max(lo, Math.min(1, v)) - lo) / (1 - lo)) * ih;
  axes(x, w, h, pl, pr, pt, pb, lo, 1, pct); if (lo < 0) { x.strokeStyle = 'rgba(200,210,230,.35)'; x.beginPath(); x.moveTo(pl, Y(0)); x.lineTo(w - pr, Y(0)); x.stroke(); }
  x.fillStyle = '#b9c8ea'; x.fillText(isPong ? 'benchmark hit rate vs generation' : 'benchmark accuracy (all characters right) vs generation', pl, 10);
  x.setLineDash([4, 3]); x.strokeStyle = 'rgba(180,190,200,.8)'; x.beginPath(); x.moveTo(pl, Y(chance)); x.lineTo(w - pr, Y(chance)); x.stroke(); x.setLineDash([]);
  x.fillStyle = DIM; x.fillText('chance ' + pct(chance), w - pr - 64, Y(chance) - 3);
  x.fillStyle = 'rgba(185,139,255,.55)'; for (const e of H) { x.beginPath(); x.arc(X(e.gen), Y(e.childAcc ?? e.childBench), 1.5, 0, 7); x.fill(); }
  let prev = null; x.lineWidth = 2;
  H.forEach(e => { const v = e.champAccNow ?? e.champFit; x.strokeStyle = e.lam === false ? CA : GOLD; x.beginPath(); x.moveTo(X(e.gen - 1), Y(prev ?? v)); x.lineTo(X(e.gen), Y(prev ?? v)); x.lineTo(X(e.gen), Y(v)); x.stroke(); prev = v; });
  // the Understanding probe (cyan, dashed) and beyond-reflex (orange): full-task accuracy minus the reflex's guess
  const line = (key, col, dash) => { let on = false; x.strokeStyle = col; x.setLineDash(dash); x.lineWidth = 1.5; x.beginPath();
    for (const e of H) { const v = e[key]; if (v == null) continue; if (!on) { x.moveTo(X(e.gen), Y(v)); on = true; } else x.lineTo(X(e.gen), Y(v)); } x.stroke(); x.setLineDash([]); return on; };
  const hasU = line('uAcc', '#7ff6ff', [5, 3]), hasB = line('beyond', '#ff9f43', []);
  if (hasU || hasB) { x.fillStyle = '#7ff6ff'; x.fillText('- - understanding probe', pl + 4, pt + 10); x.fillStyle = '#ff9f43'; x.fillText('— beyond-reflex', pl + 130, pt + 10); }
  x.lineWidth = 1; x.fillStyle = DIM; x.fillText('0', pl, h - 3); x.fillText(String(G), w - pr - 18, h - 3);
  // curriculum level-ups (the benchmark gets harder there, so the curve steps down and climbs again)
  x.strokeStyle = 'rgba(92,255,157,.55)'; x.setLineDash([2, 3]);
  for (const e of H) if (e.levelUp) { x.beginPath(); x.moveTo(X(e.gen), pt); x.lineTo(X(e.gen), pt + ih); x.stroke(); x.fillStyle = '#5cff9d'; x.fillText('L' + (e.levelUp + 1), X(e.gen) + 2, pt + 9); }
  x.setLineDash([]);
}
// rolling accuracy of both brains in the running duel
export function drawLive(c, hist, chance) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, pl = 30, pr = 6, pt = 14, pb = 12, iw = w - pl - pr, ih = h - pt - pb, Y = v => pt + (1 - v) * ih;
  axes(x, w, h, pl, pr, pt, pb, 0, 1, pct); x.fillStyle = '#b9c8ea'; x.fillText('this duel: rolling accuracy over trials (20-trial window)', pl, 10);
  x.setLineDash([4, 3]); x.strokeStyle = 'rgba(180,190,200,.8)'; x.beginPath(); x.moveTo(pl, Y(chance)); x.lineTo(w - pr, Y(chance)); x.stroke(); x.setLineDash([]);
  [CA, CBc].forEach((col, k) => { const hs = hist[k] || []; if (hs.length < 2) return; const N = hs.length; x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath(); let s = 0; const q = [];
    hs.forEach((v, i) => { q.push(v); s += v; if (q.length > 20) s -= q.shift(); const px = pl + i / (N - 1) * iw; if (i === 0) x.moveTo(px, Y(s / q.length)); else x.lineTo(px, Y(s / q.length)); }); x.stroke(); x.lineWidth = 1; });
}
// dopamine: the tonic level (line) and reward pulses (bars), last ~20 s
export function drawDA(c, tr) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, pl = 30, pr = 6, pt = 14, pb = 4, iw = w - pl - pr, ih = h - pt - pb;
  if (!tr) return; const N = Math.min(tr.n, tr.cap); let mx = 0.5; for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(tr.lvl[k][i]), Math.abs(tr.pul[k][i]));
  axes(x, w, h, pl, pr, pt, pb, -mx, mx, v => v.toFixed(1)); x.fillStyle = '#b9c8ea'; x.fillText('dopamine = reward prediction error (bars: reward pulses, line: level), A cyan / B magenta', pl, 10);
  const Y = v => pt + (0.5 - v / (2 * mx)) * ih, cnt = Math.min(N, tr.cap);
  for (let k = 0; k < 2; k++) {
    const col = k ? CBc : CA; x.strokeStyle = col; x.beginPath(); let first = true;
    for (let j = 0; j < cnt; j++) { const i = (tr.i - cnt + j + tr.cap) % tr.cap, px = pl + j / Math.max(1, tr.cap - 1) * iw, v = tr.lvl[k][i]; if (first) { x.moveTo(px, Y(v)); first = false; } else x.lineTo(px, Y(v)); const p = tr.pul[k][i]; if (p) { x.fillStyle = p > 0 ? OK : BAD; x.fillRect(px - 1 + k, Math.min(Y(0), Y(p)), 2, Math.abs(Y(p) - Y(0))); } }
    x.stroke();
  }
}
// histogram of the champion's plastic synapses + mean drift per generation
export function drawWeights(c, W, wMax, lab) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, half = Math.floor(w * 0.5);
  x.fillStyle = '#b9c8ea'; x.fillText('champion synapses (Assoc → choice): histogram', 4, 10);
  if (W && W.length) {
    const B = 40, hb = new Float64Array(B); let n = 0, s = 0, s2 = 0; for (let i = 0; i < W.length; i++) { const v = W[i]; if (v < 0) continue; hb[Math.min(B - 1, Math.floor(v / wMax * B))]++; n++; s += v; s2 += v * v; }
    let mx = 1; for (const v of hb) mx = Math.max(mx, Math.log1p(v));
    const bw = (half - 12) / B; for (let b = 0; b < B; b++) { const v = Math.log1p(hb[b]) / mx; x.fillStyle = `hsl(${260 - b * 4},80%,65%)`; x.fillRect(6 + b * bw, h - 14 - v * (h - 32), bw - 1, v * (h - 32)); }
    const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)); x.fillStyle = DIM; x.fillText(`0`, 6, h - 3); x.fillText(`wMax ${wMax.toFixed(3)} mS`, half - 80, h - 3); x.fillText(`${n.toLocaleString()} synapses · mean ${m.toFixed(4)} · sd ${sd.toFixed(4)} (log counts)`, 6, 22);
  } else { x.fillStyle = DIM; x.fillText('no learned synapses yet (Darwinian, or not benchmarked)', 6, h / 2); }
  // drift
  const L = (lab || []).filter(e => e.drift != null), ox = half + 10, iw = w - ox - 6, ih = h - 30;
  x.fillStyle = '#b9c8ea'; x.fillText('drift: mean |Δw| between champion snapshots', ox, 10);
  if (L.length < 2) { x.fillStyle = DIM; x.fillText('needs two generations', ox, h / 2); return; }
  let mx = 1e-6; for (const e of L) mx = Math.max(mx, e.drift); const G0 = L[0].gen, G1 = Math.max(G0 + 1, L[L.length - 1].gen);
  x.strokeStyle = GOLD; x.beginPath(); L.forEach((e, i) => { const px = ox + (e.gen - G0) / (G1 - G0) * iw, py = 16 + (1 - e.drift / mx) * ih; if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); }); x.stroke();
  for (const e of L) if (e.newChamp) { const px = ox + (e.gen - G0) / (G1 - G0) * iw; x.fillStyle = OK; x.fillRect(px - 1, 16 + ih - 4, 2, 4); }
  x.fillStyle = DIM; x.fillText(mx.toExponential(1), ox, 22); x.fillText(`gen ${G0}–${G1} · green tick = new champion`, ox, h - 3);
}
// raster (RASTER_ROWS sampled cells per population, newest on the right) + firing rate per population
export function drawRaster(c, ras, rates) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, nA = AREA_NAMES.length, rows = nA * RASTER_ROWS, lw = 52, rw = Math.min(150, w * 0.28), iw = w - lw - rw - 10, ih = h - 16;
  x.fillStyle = '#b9c8ea'; x.fillText('spike raster (24 sampled cells per population) · firing rate per cell', 4, 10);
  const rh = ih / rows, cw = iw / RASTER_COLS;
  x.fillStyle = 'rgba(255,255,255,.03)'; x.fillRect(lw, 14, iw, ih);
  for (let a = 0; a < nA; a++) { x.fillStyle = DIM; x.fillText(AREA_NAMES[a], 2, 14 + (a + 0.6) * RASTER_ROWS * rh); x.strokeStyle = 'rgba(120,160,255,.15)'; x.beginPath(); x.moveTo(lw, 14 + a * RASTER_ROWS * rh); x.lineTo(lw + iw, 14 + a * RASTER_ROWS * rh); x.stroke(); }
  for (let j = 0; j < RASTER_COLS; j++) { const col = (ras.i + j) % RASTER_COLS; for (let r = 0; r < rows; r++) if (ras.d[col * rows + r]) { const a = Math.floor(r / RASTER_ROWS); x.fillStyle = a % 2 ? '#ff9de6' : '#9df0ff'; x.fillRect(lw + j * cw, 14 + r * rh, Math.max(1, cw), Math.max(1, rh)); } }
  const ox = lw + iw + 8; let mx = 5; for (const v of rates) mx = Math.max(mx, v);
  for (let a = 0; a < nA; a++) { const v = rates[a] || 0, y = 14 + a * RASTER_ROWS * rh + 2, bh = Math.max(3, RASTER_ROWS * rh - 4); x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(ox, y, rw - 40, bh); x.fillStyle = a === 4 ? '#b38bff' : a >= 6 ? OK : '#6fd3ff'; x.fillRect(ox, y, (rw - 40) * v / mx, bh); x.fillStyle = '#d8e6ff'; x.fillText(v.toFixed(1) + ' Hz', ox + rw - 38, y + bh / 2 + 3); }
}
// tables
export function lineageHTML(evo, isPong) {
  const H = evo.history, champs = H.filter(e => e.newChamp).slice(-14).reverse();
  const acc = e => e.childAcc ?? e.childBench, pre = e => e.champAcc ?? e.champBench;
  const rows = champs.map(e => `<tr><td>G${e.gen}</td><td>#${e.childId} ← #${e.champId}</td><td>${(e.errors || []).map(x => `${GENE[x.key]?.label || x.key} ${fmtGene(x.key, x.from)}→${fmtGene(x.key, x.to)}`).join(', ') || (e.hof ? 'Hall of Fame rematch' : 'synapse copy errors only')}${e.wErrors ? ` +${e.wErrors} syn.` : ''}</td><td>${pct(pre(e))} → <b>${pct(acc(e))}</b></td></tr>`).join('');
  // effect of each gene's copy errors: mean change in benchmark accuracy of the spawn relative to its parent
  const eff = {}; for (const e of H) { if (e.hof) continue; const d = acc(e) - pre(e); for (const x of e.errors || []) { const q = eff[x.key] || (eff[x.key] = { n: 0, s: 0, w: 0 }); q.n++; q.s += d; if (e.newChamp) q.w++; } }
  const er = Object.entries(eff).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, q]) => `<tr><td>${GENE[k]?.label || k}</td><td>${q.n}</td><td class="${q.s / q.n >= 0 ? 'ok' : 'bad'}">${q.s / q.n >= 0 ? '+' : ''}${(100 * q.s / q.n).toFixed(1)} pts</td><td>${q.w}</td></tr>`).join('');
  return `<table><thead><tr><th>gen</th><th>champion ← parent</th><th>copy errors</th><th>benchmark</th></tr></thead><tbody>${rows || '<tr><td colspan=4>no throne changes yet</td></tr>'}</tbody></table>
    <div class="lt">Copy-error effects (spawn vs its parent, ${isPong ? 'hit rate' : 'accuracy'})</div>
    <table><thead><tr><th>gene</th><th>errors</th><th>mean effect</th><th>won throne</th></tr></thead><tbody>${er || '<tr><td colspan=4>no data yet</td></tr>'}</tbody></table>`;
}
export function lamDarHTML(evo, chance) {
  const by = m => evo.history.filter(e => (e.lam !== false) === m);
  const row = (name, H) => {
    if (!H.length) return `<tr><td>${name}</td><td colspan=5>not run yet (switch inheritance in ☰)</td></tr>`;
    const a = H.map(e => e.childAcc ?? e.childBench), m = a.reduce((s, v) => s + v, 0) / a.length, best = Math.max(...H.map(e => e.champAccNow ?? e.champFit));
    const first = H[0].champAccNow ?? H[0].champFit, last = H[H.length - 1].champAccNow ?? H[H.length - 1].champFit;
    return `<tr><td>${name}</td><td>${H.length}</td><td>${H.filter(e => e.newChamp).length}</td><td>${pct(m)}</td><td>${pct(first)} → ${pct(last)}</td><td>${pct(best)}</td></tr>`;
  };
  return `<table><thead><tr><th>inheritance</th><th>generations</th><th>throne changes</th><th>mean spawn</th><th>champion first → now</th><th>best</th></tr></thead><tbody>${row('Lamarckian (synapses inherited)', by(true))}${row('Darwinian (genes only)', by(false))}</tbody></table><p class="ln">Chance ${pct(chance)}. Lamarckian children start from the parent's learned synapses; Darwinian children relearn within one duel, so they show how much a single lifetime can learn.</p>`;
}
export function reaperHTML(evo) {
  const R = evo.history.filter(e => e.reaper).slice(-30).reverse();
  return `<table><thead><tr><th>gen</th><th>champion</th><th>challenger</th><th>margin (need)</th><th>sign test</th><th>verdict</th></tr></thead><tbody>${R.map(e => { const v = e.reaper;
    return `<tr><td>G${e.gen}</td><td>#${v.champId} ${v.score[0]} pts (✓${v.ok[0]} ✗${v.bad[0]} –${v.abst[0]})</td><td>#${v.childId} ${v.score[1]} pts (✓${v.ok[1]} ✗${v.bad[1]} –${v.abst[1]})</td><td>${v.margin >= 0 ? '+' : ''}${v.margin} (${v.need})</td><td>${v.b}:${v.c} ${v.sig ? '✓' : '✗'}</td><td class="${v.reaped ? 'ok' : ''}">${v.reaped ? 'REAPED → new champion' : 'champion stays'}</td></tr>`; }).join('') || '<tr><td colspan=6>no verdicts yet</td></tr>'}</tbody></table>`;
}
export function toCSV(evo, contest) {
  const head = ['contest', 'gen', 'inheritance', 'champ_id', 'child_id', 'champ_acc_now', 'child_acc', 'champ_acc_before', 'champ_fit', 'child_fit', 'reaper_score_champ', 'reaper_score_child', 'ok_champ', 'ok_child', 'bad_champ', 'bad_child', 'abst_champ', 'abst_child', 'margin', 'need', 'sign_b', 'sign_c', 'reaped', 'new_champ', 'gene_errors', 'synapse_errors', 'duel_score_champ', 'duel_score_child', 'level', 'full_acc', 'probe_acc', 'beyond_reflex', 'units_neighbor', 'units_bigram', 'units_reflex', 'units_self', 'units_enemy', 'units_other', 'pong_open_side', 'pong_duel_winners', 'lex_active', 'lex_seen', 'lex_retired', 'lex_new', 'lex_repeat_share', 'new_word_acc', 'familiar_word_acc', 'first_sight_acc', 'familiar_live_acc'];
  const rows = evo.history.map(e => { const v = e.reaper || { score: [], ok: [], bad: [], abst: [] };
    return [contest, e.gen, e.lam === false ? 'darwin' : 'lamarck', e.champId, e.childId, (e.champAccNow ?? '').toString(), e.childAcc ?? e.childBench, e.champAcc ?? e.champBench, e.champFit, e.childBench, v.score[0], v.score[1], v.ok[0], v.ok[1], v.bad[0], v.bad[1], v.abst[0], v.abst[1], v.margin, v.need, v.b, v.c, v.reaped ? 1 : 0, e.newChamp ? 1 : 0,
      '"' + (e.errors || []).map(x => `${x.key}:${x.from}>${x.to}`).join(' ') + '"', e.wErrors || 0, e.score?.[0], e.score?.[1], e.level, e.fullAcc, e.uAcc, e.beyond,
      ...(c => c ? [c.neighbor || 0, c.bigram || 0, c.reflex || 0, c.self || 0, c.enemy || 0, Object.entries(c).filter(([k]) => !['neighbor', 'bigram', 'reflex', 'self', 'enemy', 'empty'].includes(k)).reduce((s, [, v]) => s + v, 0)] : ['', '', '', '', '', ''])(e.cls), e.openSide, e.duelWinners, e.lexAct, e.lexSeen, e.lexRet, e.lexNew, e.lexRep, e.newAcc, e.famAcc, e.freshAcc, e.famLive].map(x => x == null ? '' : typeof x === 'number' ? +x.toFixed(4) : x).join(','); });
  return head.join(',') + '\n' + rows.join('\n') + '\n';
}

// ----------------------------------------------------------------- the UNDERSTANDING layer
const UCOL = { 'tracking+': '#2ee6ff', clash: '#55607a', neighbor: '#5cff9d', bigram: '#2ee6ff', reflex: '#ff5a5a', self: '#ffd25a', enemy: '#ff4fd8', far: '#7f93b8', task: '#7f93b8' };
// unit-class census over generations (neighbour detectors, reflex, self, enemy)
export function drawUC(c, H, C) {
  const g = cv(c); if (!g) return; const { x, w, h } = g, pl = 30, pr = 6, pt = 14, pb = 14, iw = w - pl - pr, ih = h - pt - pb;
  const R = H.filter(e => e.cls); x.fillStyle = '#b9c8ea'; x.fillText('evolved units by kind vs generation (champion)', pl, 10);
  if (!R.length) { x.fillStyle = DIM; x.fillText('no evolved layer yet (Wiring: Designed, or no generations)', pl, 40); return; }
  const keys = [...new Set(['self', 'enemy', 'reflex', ...(C.nbrClasses || []), ...R.flatMap(e => Object.keys(e.cls))])].filter(k => k !== 'empty');
  const mx = Math.max(4, ...R.flatMap(e => keys.map(k => e.cls[k] || 0))), G = Math.max(10, R[R.length - 1].gen), X = v => pl + v / G * iw, Y = v => pt + (1 - v / mx) * ih;
  axes(x, w, h, pl, pr, pt, pb, 0, mx, v => String(Math.round(v)));
  let lx = pl + 4; keys.forEach(k => { x.strokeStyle = UCOL[k] || '#9aa'; x.lineWidth = (C.nbrClasses || []).includes(k) ? 2 : 1; x.beginPath(); R.forEach((e, i) => { const y = Y(e.cls[k] || 0); if (i) x.lineTo(X(e.gen), y); else x.moveTo(X(e.gen), y); }); x.stroke();
    x.fillStyle = UCOL[k] || '#9aa'; x.fillText(k, lx, pt + 10); lx += x.measureText(k).width + 10; });
  x.lineWidth = 1;
}
const pp = v => v == null ? '–' : (v >= 0 ? '' : '−') + Math.abs(Math.round(v * 1000) / 10) + '%';
const p1 = v => v == null ? '–' : Math.round(v * 1000) / 10 + '%';
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// plain-words hypothesis + the numbers that test it
export function hypothesisHTML(C, evo) {
  const g = evo.champ.genome, ux = g.ux, rf = ux ? REFLEX[ux.reflex ?? 1] : 'designed wiring';
  return `<p class="hyp"><i>“${esc(SUNTZU.replace(' (Sun Tzu)', ''))}”</i> (Sun Tzu)</p>
<p class="ln"><b>Hypothesis.</b> Intelligence evolves when the reflex is limited. ${esc(C.reflexText || 'The reflex is the cheapest shortcut: answering from one cue alone.')} If that shortcut is weak, a brain can only beat it by <b>understanding</b> the puzzle: evolution has to wire hidden units that detect how the inputs go together (${esc(C.understandText || 'combinations of cues')}), and that <b>know itself</b> (${esc(C.selfText || 'its own last answers, mistakes and streaks')}) and <b>know its enemy</b> (${esc(C.enemyText || 'the opponent\'s last answer and speed')}).</p>
${C.id === 'pong' ? `<p class="ln"><b>Test.</b> The <b>Understanding probe</b> is ${C._probe ? C._probe.length : 40} frozen serves (${esc(C.probeName)}); a perfect tracker wins ${p1(C._probePrior)} of them by luck of the bounce. ${esc(C.beyondText)} (${p1(C._fullPrior)}). If understanding emerges, the probe and beyond-reflex rise, enemy detectors multiply, and knocking them out hurts. This run: reflex <b>${rf}</b>.</p>` : `<p class="ln"><b>Test.</b> The <b>Understanding probe</b> is ${C._probe ? C._probe.length : 'a set of'} frozen puzzles (${esc(C.probeName || 'held-out items')}) where the reflex's guess scores ${p1(C._probePrior)}. <b>Beyond-reflex</b> = full-task accuracy minus the reflex's own score on the same items (${p1(C._fullPrior)}). If understanding emerges, the probe and beyond-reflex rise, neighbour / self / enemy detectors multiply, and knocking them out hurts. This run: reflex <b>${rf}</b>.</p>`}`;
}
export function understandHTML(C, evo) {
  const H = evo.history, last = [...H].reverse().find(e => e.uAcc != null || e.beyond != null) || {}, ux = evo.champ.genome.ux;
  const cnt = ux ? classCounts(C, ux) : {}, a = evo.uAbl;
  if (C.id === 'pong') {   // Pong: winners against the statue, returns to the open side, enemy detectors
    let t = `<table><tbody><tr><td>Understanding probe: serves won outright vs the statue</td><td><b>${p1(last.uAcc)}</b> (a perfect tracker ${p1(C._probePrior)})</td></tr><tr><td>Returns to the open side (probe)</td><td>${p1(last.openSide)} of returns beat the statue (tracker ${p1(C._fullPrior)}) · hit rate ${p1(last.uHit)}</td></tr><tr><td>Beyond-reflex (aim)</td><td><b>${pp(last.beyond)}</b></td></tr><tr><td>Points won on aimed shots (duels)</td><td>${p1(last.duelWinners)} of the champion's returns were winners</td></tr><tr><td>Serves returned (benchmark vs tracker)</td><td>${p1(last.champFit ?? (evo.champ.bench && evo.champ.bench.hit))}</td></tr>`;
    if (ux) t += `<tr><td>Evolved units</td><td>${Object.entries(cnt).filter(([k]) => k !== 'empty').sort((p, q) => q[1] - p[1]).map(([k, v]) => `<span style="color:${UCOL[k] || '#ccd'}">${k} ${v}</span>`).join(' · ')}${cnt.empty ? ` · empty ${cnt.empty}` : ''} · ${ux.rec.length} hidden-to-hidden links</td></tr>`;
    t += '</tbody></table>';
    if (a) t += `<div class="lt" style="margin-top:6px">Ablation (generation ${a.gen}): silence a kind of unit, re-measure (frozen synapses)</div><table><thead><tr><th>knocked out</th><th>probe winners</th><th>Δ</th><th>serves returned</th><th>Δ</th></tr></thead><tbody>${Object.entries(a).filter(([k]) => k !== 'gen').map(([k, v]) => `<tr><td>${k}</td><td>${p1(v.probe)}</td><td class="${k !== 'none' && v.probe < a.none.probe - 0.05 ? 'bad' : ''}">${k === 'none' ? '' : pp(v.probe - a.none.probe)}</td><td>${p1(v.full)}</td><td class="${k !== 'none' && v.full < a.none.full - 0.05 ? 'bad' : ''}">${k === 'none' ? '' : pp(v.full - a.none.full)}</td></tr>`).join('')}</tbody></table>`;
    else t += '<p class="ln">No ablation yet: it runs every 100 generations, or press “Run ablation”.</p>';
    return t;
  }
  let t = `<table><tbody><tr><td>Understanding probe (champion)</td><td><b>${p1(last.uAcc)}</b> (reflex guess ${p1(C._probePrior)})</td></tr><tr><td>Full task accuracy</td><td>${p1(last.fullAcc ?? last.champAccNow)} (reflex guess ${p1(C._fullPrior)}, chance ${p1(C.chance)})</td></tr><tr><td>Beyond-reflex</td><td><b>${pp(last.beyond)}</b></td></tr>`;
  if (ux) t += `<tr><td>Evolved units</td><td>${Object.entries(cnt).filter(([k]) => k !== 'empty').sort((p, q) => q[1] - p[1]).map(([k, v]) => `<span style="color:${UCOL[k] || '#ccd'}">${k} ${v}</span>`).join(' · ')}${cnt.empty ? ` · empty ${cnt.empty}` : ''} · ${ux.rec.length} hidden-to-hidden links</td></tr>`;
  t += '</tbody></table>';
  if (a) t += `<div class="lt" style="margin-top:6px">Ablation (generation ${a.gen}): silence a kind of unit, re-measure (frozen synapses)</div><table><thead><tr><th>knocked out</th><th>probe</th><th>Δ probe</th><th>full task</th><th>Δ full</th></tr></thead><tbody>${Object.entries(a).filter(([k]) => k !== 'gen').map(([k, v]) => `<tr><td>${k}</td><td>${p1(v.probe)}</td><td class="${k !== 'none' && v.probe < a.none.probe - 0.03 ? 'bad' : ''}">${k === 'none' ? '' : pp(v.probe - a.none.probe)}</td><td>${p1(v.full)}</td><td class="${k !== 'none' && v.full < a.none.full - 0.03 ? 'bad' : ''}">${k === 'none' ? '' : pp(v.full - a.none.full)}</td></tr>`).join('')}</tbody></table>`;
  else t += '<p class="ln">No ablation yet: it runs every 100 generations, or press “Run ablation”.</p>';
  return t;
}
// the evolved units: what each detects (its inputs) and, once read out, which answer its learned synapses favour
export function unitsHTML(C, evo) {
  const ux = evo.champ.genome.ux; if (!ux) return '<p class="ln">Designed wiring: no evolved units. Switch Wiring to Evolved.</p>';
  const rd = evo.uRead && evo.uRead.units && evo.uRead.units.length === ux.units.length ? evo.uRead : null;
  let rows = ux.units.map((u, i) => ({ u, i, cls: unitClass(C, u), r: rd && rd.readout[i] })).filter(o => o.cls !== 'empty');
  if (rd) rows.sort((p, q) => (q.r ? q.r[1] - q.r[2] : 0) - (p.r ? p.r[1] - p.r[2] : 0));
  else { const ord = ['neighbor', 'bigram', 'self', 'enemy', 'reflex']; rows.sort((p, q) => (ord.indexOf(p.cls) + 1 || 9) - (ord.indexOf(q.cls) + 1 || 9)); }
  const ex = {}; for (const o of rows) (ex[o.cls] = ex[o.cls] || []).length < 3 && ex[o.cls].push(o);
  const head = `<p class="ln">${rd ? `Read out at generation ${evo.uRead.gen}: sorted by how selective each unit's learned synapses are.` : 'Not read out yet (press “Run ablation”): showing wiring only.'} Examples: ${Object.entries(ex).map(([k, v]) => `<b style="color:${UCOL[k] || '#ccd'}">${k}</b> ${v.map(o => '“detects ' + esc(unitName(C, o.u)) + '”').join(', ')}`).join(' · ')}</p>`;
  return head + `<table><thead><tr><th>#</th><th>detects</th><th>kind</th><th>→ favours</th><th>selectivity</th></tr></thead><tbody>${rows.slice(0, 40).map(o => `<tr><td>${o.i}</td><td>${esc(unitName(C, o.u))}${o.u.o ? '' : ' (output off)'}</td><td style="color:${UCOL[o.cls] || '#ccd'}">${o.cls}</td><td>${o.r ? esc(C.labels[o.r[0]]) : '–'}</td><td>${o.r ? (o.r[1] - o.r[2]).toFixed(3) : '–'}</td></tr>`).join('')}</tbody></table>`;
}
