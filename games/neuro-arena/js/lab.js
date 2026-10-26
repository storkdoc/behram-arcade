/* NEURO ARENA Lab: instruments for studying self-learning in one contest. Everything is drawn from data the app
   already has (evolution history, the champion's synapses, live frames), at native device-pixel ratio. */
import { GENE, fmtGene } from './genome.js';
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
  const G = Math.max(10, H.length ? H[H.length - 1].gen : 10), X = v => pl + v / G * iw, Y = v => pt + (1 - Math.max(0, Math.min(1, v))) * ih;
  axes(x, w, h, pl, pr, pt, pb, 0, 1, pct);
  x.fillStyle = '#b9c8ea'; x.fillText(isPong ? 'benchmark hit rate vs generation' : 'benchmark accuracy (all characters right) vs generation', pl, 10);
  x.setLineDash([4, 3]); x.strokeStyle = 'rgba(180,190,200,.8)'; x.beginPath(); x.moveTo(pl, Y(chance)); x.lineTo(w - pr, Y(chance)); x.stroke(); x.setLineDash([]);
  x.fillStyle = DIM; x.fillText('chance ' + pct(chance), w - pr - 64, Y(chance) - 3);
  x.fillStyle = 'rgba(185,139,255,.55)'; for (const e of H) { x.beginPath(); x.arc(X(e.gen), Y(e.childAcc ?? e.childBench), 1.5, 0, 7); x.fill(); }
  let prev = null; x.lineWidth = 2;
  H.forEach(e => { const v = e.champAccNow ?? e.champFit; x.strokeStyle = e.lam === false ? CA : GOLD; x.beginPath(); x.moveTo(X(e.gen - 1), Y(prev ?? v)); x.lineTo(X(e.gen), Y(prev ?? v)); x.lineTo(X(e.gen), Y(v)); x.stroke(); prev = v; });
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
  const head = ['contest', 'gen', 'inheritance', 'champ_id', 'child_id', 'champ_acc_now', 'child_acc', 'champ_acc_before', 'champ_fit', 'child_fit', 'reaper_score_champ', 'reaper_score_child', 'ok_champ', 'ok_child', 'bad_champ', 'bad_child', 'abst_champ', 'abst_child', 'margin', 'need', 'sign_b', 'sign_c', 'reaped', 'new_champ', 'gene_errors', 'synapse_errors', 'duel_score_champ', 'duel_score_child'];
  const rows = evo.history.map(e => { const v = e.reaper || { score: [], ok: [], bad: [], abst: [] };
    return [contest, e.gen, e.lam === false ? 'darwin' : 'lamarck', e.champId, e.childId, (e.champAccNow ?? '').toString(), e.childAcc ?? e.childBench, e.champAcc ?? e.champBench, e.champFit, e.childBench, v.score[0], v.score[1], v.ok[0], v.ok[1], v.bad[0], v.bad[1], v.abst[0], v.abst[1], v.margin, v.need, v.b, v.c, v.reaped ? 1 : 0, e.newChamp ? 1 : 0,
      '"' + (e.errors || []).map(x => `${x.key}:${x.from}>${x.to}`).join(' ') + '"', e.wErrors || 0, e.score?.[0], e.score?.[1]].map(x => x == null ? '' : typeof x === 'number' ? +x.toFixed(4) : x).join(','); });
  return head.join(',') + '\n' + rows.join('\n') + '\n';
}
