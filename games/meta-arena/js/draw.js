/* GENESIS 2D drawing: glowing paradigm organisms and THE REAPER. Canvas 2D only (no WebGL, no float targets). */
import { PARADIGMS } from './genome.js';
const TAU = Math.PI * 2;
export const pinfo = p => PARADIGMS[p] || { name: p || 'LLM design', color: '#9dffea', glyph: 'spark' };
export function hexA(hex, a) {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function glyph(ctx, kind, col, R, t, seed) {
  ctx.strokeStyle = col; ctx.fillStyle = hexA(col, 0.18); ctx.lineWidth = Math.max(1, R * 0.06);
  switch (kind) {
    case 'crystal': {
      const n = 6, rot = t * 0.4 + seed;
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = rot + i * TAU / n; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.9); } ctx.fill(); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.9); } ctx.globalAlpha *= 0.55; ctx.stroke(); ctx.globalAlpha /= 0.55;
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = -rot * 1.6 + i * TAU / n; ctx.lineTo(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45); } ctx.stroke();
      break; }
    case 'orbs': {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 7; i++) { const rr = R * (0.55 + 0.4 * ((i * 37 % 10) / 10)), a = t * (0.6 + i * 0.17) + i * 2.1 + seed;
        ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, R * (0.08 + 0.05 * (i % 3)), 0, TAU); ctx.fillStyle = hexA(col, 0.7); ctx.fill(); }
      break; }
    case 'rings': {
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(t * (0.5 + i * 0.3) * (i % 2 ? -1 : 1) + i * 1.05 + seed); ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.36, 0, 0, TAU); ctx.stroke();
        const a = t * 2.4 + i * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R * 0.36, R * 0.08, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, TAU); ctx.fillStyle = col; ctx.fill();
      break; }
    case 'neuron': {
      ctx.beginPath(); ctx.arc(0, 0, R * 0.28, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + seed + Math.sin(t * 0.7 + i) * 0.1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28);
        const mx = Math.cos(a + 0.3) * R * 0.65, my = Math.sin(a + 0.3) * R * 0.65, ex = Math.cos(a) * R, ey = Math.sin(a) * R; ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
        const ph = (t * 1.3 + i * 0.37) % 1; if (ph < 0.7) { const u = ph / 0.7, bx = (1 - u) * (1 - u) * Math.cos(a) * R * 0.28 + 2 * u * (1 - u) * mx + u * u * ex, by = (1 - u) * (1 - u) * Math.sin(a) * R * 0.28 + 2 * u * (1 - u) * my + u * u * ey;
          ctx.beginPath(); ctx.arc(bx, by, R * 0.07, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.fillStyle = hexA(col, 0.18); } }
      break; }
    case 'cloud': {
      for (let i = 0; i < 8; i++) { const a = i * 0.8 + seed, rr = R * 0.45 * (0.6 + 0.4 * Math.sin(t * 0.8 + i)); ctx.beginPath(); ctx.arc(Math.cos(a + t * 0.2) * rr, Math.sin(a + t * 0.2) * rr * 0.75, R * (0.32 + 0.08 * Math.sin(t + i * 1.7)), 0, TAU); ctx.fillStyle = hexA(col, 0.16); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, TAU); ctx.globalAlpha *= 0.5; ctx.stroke(); ctx.globalAlpha /= 0.5;
      break; }
    case 'tree': {
      const br = (len, ang, d) => { if (d === 0) return; const sway = Math.sin(t * 1.1 + d + seed) * 0.12; ctx.rotate(ang + sway); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke(); ctx.translate(0, -len);
        if (d === 1) { ctx.beginPath(); ctx.arc(0, 0, R * 0.06, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
        ctx.save(); br(len * 0.68, -0.5, d - 1); ctx.restore(); ctx.save(); br(len * 0.68, 0.5, d - 1); ctx.restore(); };
      ctx.save(); ctx.translate(0, R * 0.85); br(R * 0.6, 0, 5); ctx.restore();
      break; }
    case 'lattice': {
      const pts = []; const ry = t * 0.5 + seed, rx = 0.5;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k += 2) { let x = i * 0.6, y = j * 0.6, z = k * 0.45; const x2 = x * Math.cos(ry) + z * Math.sin(ry), z2 = -x * Math.sin(ry) + z * Math.cos(ry); const y2 = y * Math.cos(rx) - z2 * Math.sin(rx); pts.push([x2 * R, y2 * R]); }
      ctx.beginPath(); for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) { const dx = pts[a][0] - pts[b][0], dy = pts[a][1] - pts[b][1]; if (dx * dx + dy * dy < R * R * 0.42) { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); } } ctx.globalAlpha *= 0.6; ctx.stroke(); ctx.globalAlpha /= 0.6;
      for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], R * 0.07, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
      break; }
    default: {
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + t * 0.3 + seed, l = R * (0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i * 1.3))); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, TAU); ctx.fillStyle = col; ctx.fill();
    }
  }
}
// draw an organism for a genome (hybrids: their parts fused, recursively)
export function drawOrganism(ctx, g, x, y, R, t, { alpha = 1, glow = 1, seed = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  const breathe = 1 + Math.sin(t * 1.6 + seed) * 0.035; R *= breathe;
  if (g.paradigm === 'hybrid' && g.parts) {
    const cols = g.parts.map(p => pinfo(p.paradigm === 'hybrid' ? 'hybrid' : p.paradigm).color);
    const grd = ctx.createLinearGradient(-R, 0, R, 0); grd.addColorStop(0, hexA(cols[0], 0.22)); grd.addColorStop(1, hexA(cols[1], 0.22));
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.05, R * 0.8, 0, 0, TAU); ctx.fillStyle = grd; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    const off = R * 0.45, r2 = R * 0.52;
    drawOrganism(ctx, g.parts[0], -off, 0, r2, t, { alpha: 1, glow, seed: seed + 1 });
    drawOrganism(ctx, g.parts[1], off, 0, r2, t, { alpha: 1, glow, seed: seed + 2 });
    ctx.fillStyle = '#fff'; ctx.font = `${Math.max(9, R * 0.28)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha * 0.85; ctx.fillText(g.mode === 'arbiter' ? '⚖' : '›', 0, R * 0.62);
  } else {
    const P = pinfo(g.paradigm), col = P.color;
    const halo = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.5); halo.addColorStop(0, hexA(col, 0.32 * glow)); halo.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, TAU); ctx.fill();
    ctx.shadowColor = col; ctx.shadowBlur = R * 0.35 * glow;
    glyph(ctx, P.glyph, col, R * 0.8, t, seed);
  }
  ctx.restore();
}
// THE REAPER: hooded figure, glowing eyes, scythe
export function drawReaper(ctx, x, y, s, t, { rage = 0 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const sway = Math.sin(t * 0.8) * 0.04; ctx.rotate(sway);
  // scythe
  ctx.strokeStyle = '#6b7385'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(34, 60); ctx.lineTo(42, -52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(42, -52); ctx.quadraticCurveTo(0, -78, -40, -40); ctx.quadraticCurveTo(-4, -58, 40, -44); ctx.closePath();
  const bl = ctx.createLinearGradient(-40, -60, 40, -40); bl.addColorStop(0, '#dfe6f0'); bl.addColorStop(1, '#5d6676'); ctx.fillStyle = bl; ctx.shadowColor = '#ff4d5e'; ctx.shadowBlur = 8 + rage * 20; ctx.fill(); ctx.shadowBlur = 0;
  // hood + robe
  const rb = ctx.createLinearGradient(0, -50, 0, 70); rb.addColorStop(0, '#1b1f2c'); rb.addColorStop(1, 'rgba(10,10,16,0)');
  ctx.fillStyle = rb; ctx.beginPath(); ctx.moveTo(0, -52); ctx.bezierCurveTo(34, -50, 36, -10, 40, 70); ctx.lineTo(-40, 70); ctx.bezierCurveTo(-36, -10, -34, -50, 0, -52); ctx.fill();
  ctx.strokeStyle = 'rgba(255,77,94,.25)'; ctx.lineWidth = 1.2; ctx.stroke();
  // skull
  ctx.fillStyle = '#d8dbe0'; ctx.beginPath(); ctx.ellipse(0, -18, 15, 17, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0b10'; ctx.beginPath(); ctx.ellipse(0, -2, 9, 6, 0, 0, TAU); ctx.fill();
  const eye = 0.6 + 0.4 * Math.sin(t * 3) + rage; ctx.fillStyle = '#05060a';
  for (const ex of [-6, 6]) { ctx.beginPath(); ctx.ellipse(ex, -20, 4.6, 5.2, 0, 0, TAU); ctx.fill(); }
  ctx.shadowColor = '#ff2a3d'; ctx.shadowBlur = 10 + 10 * eye; ctx.fillStyle = `rgba(255,${60 - rage * 40},${70 - rage * 40},${Math.min(1, 0.6 + eye * 0.4)})`;
  for (const ex of [-6, 6]) { ctx.beginPath(); ctx.arc(ex, -19.5, 1.9, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0; ctx.fillStyle = '#0a0b10'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-2, -8); ctx.lineTo(2, -8); ctx.fill();
  ctx.strokeStyle = '#0a0b10'; ctx.lineWidth = 1; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 2.2, -5); ctx.lineTo(i * 2.2, 0); ctx.stroke(); }
  ctx.restore();
}
