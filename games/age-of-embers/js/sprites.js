/* AGE OF EMBERS — procedural sprite factory. Every unit, tree, mine and building is drawn with
   canvas vector shapes into cached bitmaps (no image assets). Architecture changes with each age. */
(function (E) {
  'use strict';
  const U = E.U, D = E.D;
  const S = E.Sprites = {};
  const TW = 64, TH = 32;
  S.TW = TW; S.TH = TH;
  S.R = 2; // cache resolution multiplier
  const cache = new Map(); let cacheN = 0;
  S.clear = () => { cache.clear(); cacheN = 0; };
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * S.R); c.height = Math.ceil(h * S.R); const x = c.getContext('2d'); x.scale(S.R, S.R); return [c, x]; }
  function get(key, fn) { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); if (++cacheN > 5000) { cache.clear(); cacheN = 0; } } return v; }
  const shade = U.shade, mix = U.mix;
  S.playerCol = (o) => o < 0 ? { c: '#b08a5a', d: '#6e5232', l: '#e3c79c' } : D.COLORS[(E.colorOf ? E.colorOf(o) : o) % D.COLORS.length];

  /* ------------------------------------------------------------ units */
  // screen-space facing for 8 directions (0 = east on screen, clockwise)
  const DIRS = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; DIRS.push([Math.cos(a), Math.sin(a)]); }
  S.dirIndex = function (wa) { // world angle -> screen direction index
    const cx = Math.cos(wa), cy = Math.sin(wa); const sx = (cx - cy), sy = (cx + cy) * 0.5;
    let a = Math.atan2(sy, sx); if (a < 0) a += Math.PI * 2; return Math.round(a / (Math.PI / 4)) % 8;
  };
  const SKIN = ['#e9b98f', '#c98e62', '#a86c45', '#f0c9a0'];
  function limb(x, ax, ay, bx, by, w, col) { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); }
  function ell(x, cx, cy, rx, ry, col, rot) { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); x.fill(); }
  // weapon / gear presets per type, tier and age
  function gear(type, tier, age) {
    const metal = age >= 2 ? '#d7dde4' : age >= 1 ? '#d29b52' : '#8f8a80';
    switch (type) {
      case 'villager': return { tool: 'tool', hat: 'hood', metal: '#9aa0a6' };
      case 'infantry': return [{ tool: 'club', hat: 'none', shield: false }, { tool: 'axe', hat: 'cap', shield: 'round' }, { tool: 'sword', hat: 'helm', shield: 'round' }, { tool: 'sword', hat: 'crest', shield: 'tower' }][tier] || {};
      case 'spear': return [{ tool: 'spear', hat: 'cap', shield: 'round' }, { tool: 'pike', hat: 'helm', shield: 'round' }, { tool: 'halberd', hat: 'crest', shield: false }][tier] || {};
      case 'archer': return [{ tool: 'bow', hat: 'hood' }, { tool: 'xbow', hat: 'cap' }, { tool: 'xbow', hat: 'helm' }][tier] || {};
      default: return { tool: 'none', hat: 'none' };
    }
  }
  function drawHuman(x, o) {
    // o: f=[fx,fy] facing, ph walk/work phase 0..1, anim, col, tier, age, type, seed, riding
    const [fx, fy] = o.f, px = -fy, py = fx; // perpendicular (right hand side)
    const g = o.g, col = o.col, skin = SKIN[o.seed % SKIN.length];
    const metal = o.age >= 2 ? '#dfe4ea' : o.age >= 1 ? '#cf9a55' : '#9c968b';
    const darkCloth = shade(col.c, -0.35), cloth = col.c, trim = o.age >= 3 ? '#f2cf5b' : o.age >= 2 ? '#e8e2d0' : shade(col.c, 0.25);
    const h = o.riding ? 0 : 1, sw = Math.sin(o.ph * Math.PI * 2);
    const walking = o.anim === 'walk', working = o.anim === 'work' || o.anim === 'attack';
    const legSw = walking ? sw * 3.2 : 0, bob = walking ? Math.abs(sw) * 0.8 : (o.anim === 'idle' ? Math.sin(o.ph * Math.PI * 2) * 0.3 : 0);
    const hipY = -9 - bob, shY = -16 - bob, headY = -19.6 - bob;
    const toward = fy; // >0 : facing camera
    const side = (s) => s * py; // depth of right side
    const parts = [];
    // legs
    if (!o.riding) {
      for (const s of [-1, 1]) {
        const lx = px * s * 1.7, ly = py * s * 0.8, sw2 = legSw * s;
        parts.push({ d: side(s) - 0.5, f: () => { limb(x, lx, hipY + ly, lx + fx * sw2, -0.8 + ly + fy * sw2 * 0.4, 2.6, shade(darkCloth, -0.2)); ell(x, lx + fx * sw2 + fx * 0.8, -0.4 + ly + fy * sw2 * 0.4, 1.6, 0.9, '#3b2a1c'); } });
      }
    }
    // arms & tool
    let armA = 0; // swing angle for right (tool) arm
    if (working) { const t = o.ph; armA = t < 0.55 ? -1.9 * (t / 0.55) : -1.9 + 2.6 * Math.min(1, (t - 0.55) / 0.18); }
    else if (walking) armA = sw * 0.5;
    const shX = (s) => px * s * 3.0, shYY = (s) => shY + py * s * 1.2;
    const handPos = (s, a) => { // arm hanging down rotated forward by a
      const L = 6.2; const ca = Math.cos(a), sa = Math.sin(a);
      return [shX(s) + fx * (-sa) * L * 0.9, shYY(s) + L * ca - fy * (-sa) * L * 0.25 - (a < 0 ? (-sa) * 1.5 : 0)];
    };
    const tool = g.tool;
    const drawTool = (hx, hy, a) => {
      const dx = fx, dy = fy * 0.5; // tool direction mostly forward
      const up = working ? -Math.cos(armA) : 0;
      const tx = (ang, len) => [hx + (dx * Math.sin(ang) + 0) * len, hy - Math.cos(ang) * len];
      if (tool === 'none') return;
      const ang = working ? -armA + 0.4 : 0.5; // angle of shaft from vertical
      if (tool === 'bow') { x.strokeStyle = '#6b4423'; x.lineWidth = 1.3; x.beginPath(); const bx = hx + fx * 2.5, by = hy - 2; x.arc(bx, by, 5, -Math.PI / 2 - 1.1 + (fx < 0 ? Math.PI : 0), -Math.PI / 2 + 1.1 + (fx < 0 ? Math.PI : 0), fx < 0); x.stroke(); limb(x, bx - fx * 1, by - 5, bx - fx * (working ? 3.5 : 1), by, 0.5, '#eee'); limb(x, bx - fx * (working ? 3.5 : 1), by, bx - fx * 1, by + 5, 0.5, '#eee'); return; }
      if (tool === 'xbow') { limb(x, hx - fx * 2, hy, hx + fx * 6, hy - 1 - fy, 2, '#5a3a1e'); limb(x, hx + fx * 5 + px * 3, hy - 1 + py * 1.5, hx + fx * 5 - px * 3, hy - 1 - py * 1.5, 1.4, metal); return; }
      if (tool === 'spear' || tool === 'pike' || tool === 'halberd') {
        const L = tool === 'pike' ? 17 : 13, a2 = working ? 1.2 + armA * 0.25 : 0.15;
        const ex = hx + fx * Math.sin(a2) * L * 0.7, ey = hy - Math.cos(a2) * L * 0.8 + fy * Math.sin(a2) * 2;
        const sx = hx - fx * Math.sin(a2) * 4, sy = hy + Math.cos(a2) * 4;
        limb(x, sx, sy, ex, ey, 1.3, '#7a5530'); ell(x, ex, ey, 1.4, 1.4, metal);
        if (tool === 'halberd') { x.fillStyle = metal; x.beginPath(); x.moveTo(ex, ey + 1); x.lineTo(ex + fx * 3.5 + px, ey + 3); x.lineTo(ex, ey + 4); x.fill(); }
        return;
      }
      const len = tool === 'sword' ? 8 : tool === 'club' ? 7 : 6.5;
      const ca = working ? (armA + 1.2) : 0.6; const ex = hx + fx * Math.sin(ca) * len, ey = hy - Math.cos(ca) * len * 0.95;
      if (tool === 'sword') { limb(x, hx, hy, ex, ey, 1.6, metal); limb(x, hx - px * 1.5, hy - py, hx + px * 1.5, hy + py, 1.2, '#8a6b2a'); }
      else if (tool === 'club') { limb(x, hx, hy, ex, ey, 2.4, '#7b5531'); ell(x, ex, ey, 2, 2, '#6a4527'); }
      else if (tool === 'axe') { limb(x, hx, hy, ex, ey, 1.4, '#7a5530'); x.fillStyle = metal; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + fx * 3, ey - 2); x.lineTo(ex + fx * 3, ey + 2.5); x.closePath(); x.fill(); }
      else if (tool === 'tool') { // villager: axe / pick / hammer / hoe by work kind
        limb(x, hx, hy, ex, ey, 1.3, '#7a5530');
        const wk = o.wk; x.fillStyle = '#9aa0a6';
        if (wk === 'mine') { x.strokeStyle = '#9aa0a6'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(ex - fx * 3 + px, ey + 1.5); x.quadraticCurveTo(ex, ey - 1.2, ex + fx * 3 - px, ey + 1.5); x.stroke(); }
        else if (wk === 'build') { x.fillRect(ex - 1.5, ey - 1.5, 3, 3); }
        else if (wk === 'farm' || wk === 'forage') { limb(x, ex, ey, ex + fx * 2.5, ey + 2, 1.2, '#9aa0a6'); }
        else if (wk === 'fish') { }
        else { x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + fx * 2.6, ey - 1.6); x.lineTo(ex + fx * 2.6, ey + 2); x.closePath(); x.fill(); }
      }
    };
    for (const s of [-1, 1]) {
      const isTool = s === 1, a = isTool ? armA : (working ? 0.3 : -armA * 0.8);
      parts.push({ d: side(s) + (isTool && working ? 0.6 : 0) - 0.1, f: () => {
        const [hx, hy] = handPos(s, a); const ex = (shX(s) + hx) / 2 + fx * 0.6, ey = (shYY(s) + hy) / 2;
        limb(x, shX(s), shYY(s), ex, ey, 2.3, cloth); limb(x, ex, ey, hx, hy, 2.0, skin);
        if (isTool) drawTool(hx, hy, a);
        if (!isTool && g.shield) { const sx2 = hx + fx * 1.5, sy2 = hy - 2; const r = g.shield === 'tower' ? 4.2 : 3.4; ell(x, sx2, sy2, r * (0.45 + Math.abs(px) * 0.55), r * (g.shield === 'tower' ? 1.3 : 1), shade(col.c, -0.15)); ell(x, sx2, sy2, r * 0.35, r * 0.35, trim); }
        if (!isTool && o.carry && o.type === 'villager' && !working) { const cc = { w: '#8b5a2b', f: '#c94b3b', g: '#f4cf3a', s: '#b7b2a8' }[o.carry]; ell(x, hx + fx, hy - 1, 2.2, 1.8, cc); }
      } });
    }
    // torso + head
    parts.push({ d: 0, f: () => {
      x.fillStyle = cloth; x.beginPath(); x.moveTo(-3.6, shY); x.lineTo(3.6, shY); x.lineTo(3.2 + (o.type === 'villager' ? 0.6 : 0), hipY + 2.5); x.lineTo(-3.2 - (o.type === 'villager' ? 0.6 : 0), hipY + 2.5); x.closePath(); x.fill();
      x.fillStyle = shade(cloth, -0.25); x.fillRect(-3.3, hipY - 0.2, 6.6, 1.3); // belt
      if (o.type !== 'villager' && o.type !== 'archer' && (o.tier >= 1 || o.age >= 2)) { x.fillStyle = metal; x.globalAlpha = 0.85; x.fillRect(-3.2, shY + 0.6, 6.4, 4.2); x.globalAlpha = 1; }
      x.fillStyle = trim; x.fillRect(-3.6, shY, 7.2, 1);
      ell(x, fx * 0.5, headY, 2.7, 2.9, skin);
      if (toward > -0.3) { ell(x, fx * 1.6 + px * 0.9, headY - 0.2, 0.45, 0.5, '#2a1d12'); ell(x, fx * 1.6 - px * 0.9, headY - 0.2, 0.45, 0.5, '#2a1d12'); }
      const hat = g.hat;
      if (hat === 'hood') { x.fillStyle = o.type === 'villager' ? shade(col.c, -0.1) : '#5d6b3a'; x.beginPath(); x.arc(fx * 0.2, headY - 0.6, 3.0, Math.PI * 1.05, Math.PI * 1.95); x.fill(); }
      else if (hat === 'cap') { x.fillStyle = o.age >= 1 ? metal : '#6b4a2b'; x.beginPath(); x.arc(fx * 0.4, headY - 0.5, 3.0, Math.PI, 0); x.fill(); }
      else if (hat === 'helm' || hat === 'crest') { x.fillStyle = metal; x.beginPath(); x.arc(fx * 0.4, headY - 0.3, 3.1, Math.PI * 0.95, Math.PI * 2.05); x.fill(); x.fillRect(fx * 0.4 - 3.1, headY - 0.6, 6.2, 1.2); if (hat === 'crest') { x.fillStyle = col.c; x.beginPath(); x.ellipse(fx * 0.4 - fx * 1, headY - 3.6, 3.4, 1.4, fx * 0.3, 0, Math.PI * 2); x.fill(); } }
      else { x.fillStyle = '#3b2716'; x.beginPath(); x.arc(fx * 0.1, headY - 0.9, 2.7, Math.PI * 1.05, Math.PI * 1.95); x.fill(); }
    } });
    parts.sort((a, b) => a.d - b.d); for (const p of parts) p.f();
  }
  function drawHorse(x, o, barding) {
    const [fx, fy] = o.f, px = -fy, py = fx; const L = 7.5;
    const sw = Math.sin(o.ph * Math.PI * 2), walk = o.anim === 'walk', gallop = walk ? sw : 0;
    const coat = o.seed % 3 === 0 ? '#5b3b22' : o.seed % 3 === 1 ? '#8a5a32' : '#d9d2c3';
    const by = -10 - (walk ? Math.abs(sw) * 1 : 0);
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    legs.sort((a, b) => (a[1] * py) - (b[1] * py));
    const drawLeg = (fb, s) => { const ax = fx * fb * L * 0.55 + px * s * 1.6, ay = by + 2 + fy * fb * L * 0.25 + py * s * 0.7; const sw2 = gallop * 3 * fb * s; limb(x, ax, ay, ax + fx * sw2, -0.6 + fy * fb * L * 0.25 + py * s * 0.7 + fy * sw2 * 0.3, 1.9, shade(coat, -0.2)); };
    for (const [fb, s] of legs) if (s * py < 0) drawLeg(fb, s);
    // body
    ell(x, 0, by, L * (0.35 + Math.abs(fx) * 0.65), 4.2, coat, Math.atan2(fy * 0.5, fx) * (Math.abs(fx) > 0.3 ? 0.2 : 0));
    if (barding) { x.globalAlpha = 0.95; ell(x, 0, by + 0.5, L * (0.33 + Math.abs(fx) * 0.6), 3.8, barding); x.globalAlpha = 1; }
    // neck + head
    const nx = fx * L * 0.75, ny = by - 4 + fy * 2.2;
    limb(x, fx * L * 0.45, by - 1, nx, ny, 3.4, coat); ell(x, nx + fx * 2.2, ny + 1.2 + fy, 2.2 + Math.abs(fx) * 1.1, 1.7, shade(coat, -0.05));
    limb(x, nx - fx * 0.6, ny - 1.8, fx * L * 0.3, by - 3.2, 1.2, '#2a1a10'); // mane
    limb(x, -fx * L * 0.85, by - 1, -fx * L * 1.1, by + 4, 1.6, '#2a1a10'); // tail
    for (const [fb, s] of legs) if (s * py >= 0) drawLeg(fb, s);
  }
  function drawUnitBody(x, type, o) {
    const col = o.col;
    if (type === 'scout' || type === 'knight') {
      drawHorse(x, o, type === 'knight' ? (o.tier ? '#e8e8ee' : shade(col.c, -0.1)) : null);
      x.save(); x.translate(0, -7.5);
      drawHuman(x, Object.assign({}, o, { riding: true, g: { tool: type === 'knight' ? 'sword' : 'spear', hat: type === 'knight' ? 'crest' : 'cap', shield: type === 'knight' ? 'round' : false }, anim: o.anim === 'walk' ? 'idle' : o.anim }));
      x.restore(); return;
    }
    if (type === 'ram') {
      const [fx, fy] = o.f; const px = -fy, py = fx; const L = 9, Wd = 5;
      const wob = o.anim === 'walk' ? Math.sin(o.ph * Math.PI * 4) * 0.4 : 0;
      for (const fb of [-1, 1]) for (const s of [-1, 1]) ell(x, fx * fb * L * 0.6 + px * s * Wd, -2 + fy * fb * L * 0.3 + py * s * 2.2, 2.4, 2.6, '#4a3220');
      const wood = '#8a5a30', roof = o.age >= 2 ? '#7d2f22' : '#a67c47';
      x.fillStyle = wood; x.beginPath(); x.moveTo(-fx * L - px * Wd, -6 - fy * L * 0.5 - py * 2.5 + wob); x.lineTo(fx * L - px * Wd, -6 + fy * L * 0.5 - py * 2.5); x.lineTo(fx * L + px * Wd, -6 + fy * L * 0.5 + py * 2.5); x.lineTo(-fx * L + px * Wd, -6 - fy * L * 0.5 + py * 2.5); x.closePath(); x.fill();
      x.fillStyle = roof; x.beginPath(); x.moveTo(-fx * L - px * Wd, -6 - fy * L * 0.5 - py * 2.5); x.lineTo(-fx * L, -15 - fy * L * 0.5); x.lineTo(fx * L, -15 + fy * L * 0.5); x.lineTo(fx * L - px * Wd, -6 + fy * L * 0.5 - py * 2.5); x.closePath(); x.fill();
      x.fillStyle = shade(roof, -0.2); x.beginPath(); x.moveTo(-fx * L + px * Wd, -6 - fy * L * 0.5 + py * 2.5); x.lineTo(-fx * L, -15 - fy * L * 0.5); x.lineTo(fx * L, -15 + fy * L * 0.5); x.lineTo(fx * L + px * Wd, -6 + fy * L * 0.5 + py * 2.5); x.closePath(); x.fill();
      const ramX = (o.anim === 'attack' ? Math.sin(o.ph * Math.PI * 2) * 2 : 0);
      limb(x, fx * L * 0.5, -8 + fy * L * 0.3, fx * (L + 3 + ramX), -8 + fy * (L + 3 + ramX) * 0.5, 2.6, '#5b3a1f'); ell(x, fx * (L + 3 + ramX), -8 + fy * (L + 3 + ramX) * 0.5, 2, 2, o.age >= 2 ? '#c8ccd2' : '#a07a45');
      x.fillStyle = col.c; x.fillRect(-1.5, -17, 3, 3); return;
    }
    if (type === 'catapult') {
      const [fx, fy] = o.f; const px = -fy, py = fx; const L = 7;
      for (const fb of [-1, 1]) for (const s of [-1, 1]) ell(x, fx * fb * L * 0.6 + px * s * 4, -2 + fy * fb * L * 0.3 + py * s * 2, 2.2, 2.4, '#4a3220');
      const wood = '#93663a';
      limb(x, -fx * L - px * 4, -4 - fy * L * 0.5 - py * 2, fx * L - px * 4, -4 + fy * L * 0.5 - py * 2, 2.2, wood);
      limb(x, -fx * L + px * 4, -4 - fy * L * 0.5 + py * 2, fx * L + px * 4, -4 + fy * L * 0.5 + py * 2, 2.2, wood);
      limb(x, px * 4, -4 + py * 2, 0, -11, 1.8, wood); limb(x, -px * 4, -4 - py * 2, 0, -11, 1.8, wood);
      const arm = o.anim === 'attack' ? (o.ph < 0.2 ? -1.2 + o.ph * 10 : 0.9 - (o.ph - 0.2) * 2.6) : 0.9;
      const ax = -fx * Math.cos(arm) * 10, ay = -11 - Math.sin(arm) * 7;
      limb(x, fx * 3, -6 + fy * 1.5, ax, ay, 1.8, '#6b4423'); ell(x, ax, ay, 2.2, 1.5, '#555');
      x.fillStyle = col.c; x.fillRect(-1.5, -14, 3, 2.5); return;
    }
    if (type === 'fishboat' || type === 'galley') {
      const [fx, fy] = o.f; const px = -fy, py = fx; const L = type === 'galley' ? 14 : 9, Wd = type === 'galley' ? 4.5 : 3.5;
      const bob = Math.sin(o.ph * Math.PI * 2) * 0.6;
      const P = (a, b, z) => [fx * a + px * b, fy * a * 0.5 + py * b * 0.5 - z + bob];
      const hull = o.age >= 2 ? '#6e4424' : '#8a5a33';
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(0, bob + 1, L * (0.4 + Math.abs(fx) * 0.6) + 2, 3.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = shade(hull, -0.25); x.beginPath(); for (const [a, b] of [[-L, -Wd], [L * 0.7, -Wd], [L, 0], [L * 0.7, Wd], [-L, Wd]]) { const q = P(a, b, 0); x.lineTo(q[0], q[1]); } x.closePath(); x.fill();
      x.fillStyle = hull; x.beginPath(); for (const [a, b] of [[-L, -Wd], [L * 0.7, -Wd], [L + 1, 0], [L * 0.7, Wd], [-L, Wd]]) { const q = P(a, b, 3); x.lineTo(q[0], q[1]); } x.closePath(); x.fill();
      x.fillStyle = shade(hull, 0.2); x.beginPath(); for (const [a, b] of [[-L + 1.5, -Wd + 1.2], [L * 0.6, -Wd + 1.2], [L * 0.85, 0], [L * 0.6, Wd - 1.2], [-L + 1.5, Wd - 1.2]]) { const q = P(a, b, 3.2); x.lineTo(q[0], q[1]); } x.closePath(); x.fill();
      if (type === 'galley') { for (let k = -2; k <= 2; k++) { const q = P(k * 3, Wd + 1, 2), r = P(k * 3 - 2 + Math.sin(o.ph * Math.PI * 2) * 1.5, Wd + 4, -1); limb(x, q[0], q[1], r[0], r[1], 0.8, '#5a3a1e'); } }
      const m = P(0, 0, 3); limb(x, m[0], m[1], m[0], m[1] - (type === 'galley' ? 20 : 13), 1.3, '#5a3a1e');
      x.fillStyle = type === 'galley' ? col.c : '#efe6cf'; x.beginPath(); const sw2 = type === 'galley' ? 7 : 5; x.moveTo(m[0] - px * sw2, m[1] - 17 - py * 2); x.quadraticCurveTo(m[0] + fx * 3, m[1] - 10, m[0] - px * sw2 * 0.9, m[1] - 5); x.lineTo(m[0] + px * sw2 * 0.9, m[1] - 5 + py * 2); x.quadraticCurveTo(m[0] + fx * 3, m[1] - 10, m[0] + px * sw2, m[1] - 17 + py * 2); x.closePath(); if (type !== 'galley') x.fillStyle = '#efe6cf'; x.fill();
      if (type === 'fishboat') { x.fillStyle = col.c; x.fillRect(m[0] - 1.5, m[1] - 15, 3, 2); if (o.anim === 'work') { const q = P(L * 0.4, Wd, 3); limb(x, q[0], q[1], q[0] + px * 6, q[1] + 6, 0.5, 'rgba(240,240,240,0.8)'); } }
      return;
    }
    if (type === 'deer') {
      const [fx, fy] = o.f; const px = -fy, py = fx; const L = 5;
      const sw = Math.sin(o.ph * Math.PI * 2), walk = o.anim === 'walk';
      const by = -7 - (walk ? Math.abs(sw) * 1.2 : 0), coat = '#a8703f';
      for (const fb of [1, -1]) for (const s of [-1, 1]) { const ax = fx * fb * L * 0.55 + px * s * 1.1, ay = by + 1.5 + py * s * 0.5; const sw2 = walk ? sw * 2.4 * fb * s : 0; limb(x, ax, ay, ax + fx * sw2, -0.5 + py * s * 0.5, 1.2, '#6d4524'); }
      ell(x, 0, by, L * (0.4 + Math.abs(fx) * 0.6), 2.7, coat); ell(x, -fx * L * 0.8, by - 0.6, 1.2, 1.2, '#f4e9d8');
      const grazing = o.anim === 'idle' && (o.seed % 2) && Math.sin(o.ph * Math.PI * 2) > 0;
      const nx = fx * L * 0.8, ny = grazing ? by + 4 : by - 4;
      limb(x, fx * L * 0.5, by - 0.5, nx, ny, 2.2, coat); ell(x, nx + fx * 1.4, ny + (grazing ? 1 : 0.4), 1.8, 1.3, coat);
      if (o.seed % 3 === 0) { limb(x, nx, ny - 1, nx - 1.5 - fx, ny - 5, 0.7, '#e8dcc0'); limb(x, nx, ny - 1, nx + 1.5 - fx, ny - 5, 0.7, '#e8dcc0'); }
      return;
    }
    drawHuman(x, Object.assign({ g: gear(type, o.tier, o.age) }, o));
  }
  const FR = { walk: 8, work: 8, attack: 8, idle: 4 };
  S.unitFrames = (anim) => FR[anim] || 4;
  S.unit = function (type, owner, tier, age, dir, anim, frame, seed, wk, carry) {
    const col = S.playerCol(owner); const sd = seed % 6;
    const key = 'u' + type + '|' + col.c + '|' + tier + '|' + age + '|' + dir + '|' + anim + '|' + frame + '|' + sd + '|' + (type === 'villager' ? (wk || '') + (carry || '') : '');
    return get(key, () => {
      const big = type === 'ram' || type === 'catapult' || type === 'galley' || type === 'knight' || type === 'scout';
      const w = big ? 56 : 34, h = big ? 50 : 34; const [c, x] = mk(w, h);
      x.translate(w / 2, h - 6);
      drawUnitBody(x, type, { f: DIRS[dir], ph: frame / (FR[anim] || 4), anim, col, tier, age, type, seed: sd, wk, carry });
      return { c, w, h, ox: w / 2, oy: h - 6 };
    });
  };

  /* ------------------------------------------------------------ nature */
  S.tree = function (v, stage) {
    return get('t' + v + '|' + (stage || 0), () => {
      const rng = U.rng(v * 7919 + 13); const kind = v % 9 < 5 ? 'oak' : v % 9 < 8 ? 'pine' : 'birch';
      const w = 52, h = 78; const [c, x] = mk(w, h); x.translate(w / 2, h - 8);
      const sc = 0.85 + rng() * 0.3;
      x.scale(sc, sc);
      if (kind === 'pine') {
        limb(x, 0, 0, 0, -12, 3.4, '#5a3b22');
        const base = mix('#1f5a35', '#2c6e3f', rng()); const layers = 4;
        for (let i = 0; i < layers; i++) {
          const y0 = -8 - i * 11, wd = 17 - i * 3.6, hh = 20 - i * 2;
          x.fillStyle = shade(base, -0.18); x.beginPath(); x.moveTo(0, y0 - hh); x.lineTo(wd, y0); x.quadraticCurveTo(0, y0 + 5, -wd, y0); x.closePath(); x.fill();
          x.fillStyle = shade(base, 0.08); x.beginPath(); x.moveTo(0, y0 - hh); x.lineTo(-wd, y0); x.quadraticCurveTo(-wd * 0.3, y0 + 3, 0, y0 + 2); x.closePath(); x.fill();
        }
      } else {
        const trunk = kind === 'birch' ? '#e9e4da' : '#5d3d24';
        limb(x, 0, 0, 0, -18, kind === 'birch' ? 2.6 : 4, trunk); limb(x, 0, -12, 5, -21, 2, trunk); limb(x, 0, -14, -5, -22, 2, trunk);
        if (kind === 'birch') for (let i = 0; i < 4; i++) { x.fillStyle = '#333'; x.fillRect(-1, -3 - i * 4, 1.6, 0.8); }
        const base = kind === 'birch' ? mix('#6f9a3a', '#88aa44', rng()) : mix('#2f6b2e', '#447a2b', rng());
        const blobs = []; for (let i = 0; i < 9; i++) { const a = rng() * Math.PI * 2, r = rng() * 9; blobs.push([Math.cos(a) * r * 1.2, -27 + Math.sin(a) * r * 0.8 - rng() * 4, 7 + rng() * 5]); }
        blobs.sort((a, b) => a[1] - b[1]);
        for (const [bx, by, r] of blobs) { ell(x, bx + 1, by + 1.5, r, r * 0.9, shade(base, -0.32)); }
        for (const [bx, by, r] of blobs) { const g = x.createRadialGradient(bx - r * 0.4, by - r * 0.5, 1, bx, by, r); g.addColorStop(0, shade(base, 0.28)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.22)); x.fillStyle = g; x.beginPath(); x.arc(bx, by, r * 0.92, 0, Math.PI * 2); x.fill(); }
        for (let i = 0; i < 14; i++) { const a = rng() * Math.PI * 2, r = rng() * 12; ell(x, Math.cos(a) * r - 2, -30 + Math.sin(a) * r * 0.7, 1.4, 1, shade(base, 0.38)); }
      }
      return { c, w, h, ox: w / 2, oy: h - 8 };
    });
  };
  S.stump = function (v) { return get('st' + (v % 4), () => { const [c, x] = mk(20, 14); x.translate(10, 9); ell(x, 0, 0, 4.5, 2.4, '#5d3d24'); ell(x, 0, -1.6, 4.2, 2.1, '#c8a06a'); ell(x, 0, -1.6, 2, 1, '#a57d4c'); return { c, w: 20, h: 14, ox: 10, oy: 9 }; }); };
  S.mine = function (type, v, frac) {
    const st = frac > 0.66 ? 2 : frac > 0.33 ? 1 : 0;
    return get('m' + type + v % 5 + st, () => {
      const rng = U.rng(v * 31 + (type === 'gold' ? 5 : 9)); const w = 60, h = 44; const [c, x] = mk(w, h); x.translate(w / 2, h - 12);
      const rocks = 3 + st * 2; const base = type === 'gold' ? '#8b7a5a' : '#8c8b86';
      const list = []; for (let i = 0; i < rocks; i++) list.push([(rng() - 0.5) * 30, (rng() - 0.5) * 12, 5 + rng() * 5]);
      list.sort((a, b) => a[1] - b[1]);
      for (const [rx, ry, r] of list) {
        x.fillStyle = shade(base, -0.3); x.beginPath(); x.moveTo(rx - r, ry + 2); x.lineTo(rx - r * 0.7, ry - r * 0.8); x.lineTo(rx + r * 0.2, ry - r * 1.1); x.lineTo(rx + r, ry - r * 0.3); x.lineTo(rx + r * 0.9, ry + 2); x.closePath(); x.fill();
        x.fillStyle = shade(base, 0.1); x.beginPath(); x.moveTo(rx - r * 0.7, ry - r * 0.8); x.lineTo(rx + r * 0.2, ry - r * 1.1); x.lineTo(rx + r * 0.3, ry - r * 0.2); x.lineTo(rx - r * 0.6, ry); x.closePath(); x.fill();
        if (type === 'gold') for (let k = 0; k < 4; k++) { const gx = rx + (rng() - 0.5) * r * 1.4, gy = ry - rng() * r * 0.9; x.fillStyle = '#f7d046'; x.beginPath(); x.moveTo(gx, gy - 1.6); x.lineTo(gx + 1.4, gy); x.lineTo(gx, gy + 1.4); x.lineTo(gx - 1.4, gy); x.fill(); x.fillStyle = '#fff6b8'; x.fillRect(gx - 0.4, gy - 0.6, 0.8, 0.8); }
        else for (let k = 0; k < 3; k++) { limb(x, rx + (rng() - 0.5) * r, ry - rng() * r * 0.8, rx + (rng() - 0.5) * r, ry - rng() * r * 0.6, 0.5, shade(base, -0.45)); }
      }
      return { c, w, h, ox: w / 2, oy: h - 12 };
    });
  };
  S.berry = function (v, frac) {
    const st = frac > 0.5 ? 1 : 0;
    return get('b' + v % 4 + st, () => {
      const rng = U.rng(v * 17 + 3); const w = 36, h = 28; const [c, x] = mk(w, h); x.translate(w / 2, h - 7);
      for (let i = 0; i < 6; i++) { const bx = (rng() - 0.5) * 16, by = -4 - rng() * 6; ell(x, bx, by + 1, 6, 4.5, '#2b5a2a'); ell(x, bx - 0.8, by, 5.4, 4, i % 2 ? '#3f7a33' : '#4b8a3a'); }
      const n = st ? 16 : 6; for (let i = 0; i < n; i++) { const bx = (rng() - 0.5) * 18, by = -3 - rng() * 9; ell(x, bx, by, 1.3, 1.3, rng() < 0.5 ? '#c43a5a' : '#8b2a6a'); ell(x, bx - 0.4, by - 0.4, 0.4, 0.4, '#ffd0e0'); }
      return { c, w, h, ox: w / 2, oy: h - 7 };
    });
  };
  S.carcass = function (dir) {
    return get('car' + dir, () => { const [c, x] = mk(30, 20); x.translate(15, 13); x.globalAlpha = 0.95; ell(x, 0, 0, 7, 2.8, '#8f5d33'); ell(x, 6, -1, 2.2, 1.6, '#8f5d33'); ell(x, -2, -0.6, 3, 1.4, '#b27a49'); limb(x, -3, 1, -7, 3, 1, '#6d4524'); limb(x, 2, 1, 4, 3.5, 1, '#6d4524'); ell(x, 0, 0.5, 2.5, 1.2, '#7a1f1f'); return { c, w: 30, h: 20, ox: 15, oy: 13 }; });
  };

  /* ------------------------------------------------------------ buildings */
  // tiny iso-3D painter in tile units (z in pixels)
  const ZM = 1.75;
  function P3(x, ox, oy, zMul, noRoof) {
    zMul = (zMul || 1) * ZM;
    const p = (X, Y, Z) => [ox + (X - Y) * TW / 2, oy + (X + Y) * TH / 2 - (Z || 0) * zMul];
    const poly = (pts, col, stroke) => { x.fillStyle = col; x.beginPath(); for (const q of pts) { const r = p(q[0], q[1], q[2]); x.lineTo(r[0], r[1]); } x.closePath(); x.fill(); if (stroke) { x.strokeStyle = stroke; x.lineWidth = 0.6; x.stroke(); } };
    const api = { p, poly, x, noRoof };
    api.box = (x0, y0, x1, y1, z0, z1, col, o) => {
      o = o || {}; const top = o.top || shade(col, 0.18), lf = shade(col, -0.02), rt = shade(col, -0.24);
      poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], lf); // south-west face (left)
      poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], rt); // south-east face (right)
      if (!o.noTop) poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
      if (o.tex) api.tex(x0, y0, x1, y1, z0, z1, o.tex, col);
    };
    api.tex = (x0, y0, x1, y1, z0, z1, kind, col) => {
      x.save(); const lc = shade(col, -0.32); x.strokeStyle = lc; x.lineWidth = 0.5; x.globalAlpha = 0.55;
      if (kind === 'brick' || kind === 'stone' || kind === 'marble') {
        const rowH = kind === 'marble' ? 7 : kind === 'stone' ? 5 : 3.4; let r = 0;
        for (let z = z0 + rowH; z < z1; z += rowH, r++) {
          for (const face of [0, 1]) { const a = face ? p(x1, y0, z) : p(x0, y1, z), b = p(x1, y1, z); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
          if (kind !== 'marble') { const step = kind === 'stone' ? 0.45 : 0.3; for (let t = (r % 2) * step / 2; t < 1; t += step) { const q = p(x0 + (x1 - x0) * t, y1, z), q2 = p(x0 + (x1 - x0) * t, y1, z + rowH); x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(q2[0], q2[1]); x.stroke(); const s1 = p(x1, y0 + (y1 - y0) * t, z), s2 = p(x1, y0 + (y1 - y0) * t, z + rowH); x.beginPath(); x.moveTo(s1[0], s1[1]); x.lineTo(s2[0], s2[1]); x.stroke(); } }
        }
      } else if (kind === 'plank' || kind === 'wattle') {
        const n = kind === 'plank' ? 7 : 4;
        for (let i = 1; i < n; i++) { const t = i / n; const a = p(x0 + (x1 - x0) * t, y1, z0), b = p(x0 + (x1 - x0) * t, y1, z1); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); const c2 = p(x1, y0 + (y1 - y0) * t, z0), d2 = p(x1, y0 + (y1 - y0) * t, z1); x.beginPath(); x.moveTo(c2[0], c2[1]); x.lineTo(d2[0], d2[1]); x.stroke(); }
        if (kind === 'wattle') { x.globalAlpha = 0.9; x.lineWidth = 1.6; x.strokeStyle = '#5b3b20'; for (const [ax, ay, bx, by] of [[x0, y1, x1, y1], [x1, y0, x1, y1]]) { const a = p(ax, ay, z0), b = p(bx, by, z0); const a2 = p(ax, ay, z1), b2 = p(bx, by, z1); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.moveTo(a2[0], a2[1]); x.lineTo(b2[0], b2[1]); x.moveTo(a[0], a[1]); x.lineTo(a2[0], a2[1]); x.moveTo(b[0], b[1]); x.lineTo(b2[0], b2[1]); x.stroke(); } }
      }
      x.restore();
    };
    api.gable = (x0, y0, x1, y1, z0, h, col, alongX, o) => { if (noRoof) return; // ridge along X (or Y)
      o = o || {}; const ov = o.ov === undefined ? 0.12 : o.ov; x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
      const lt = shade(col, 0.12), dk = shade(col, -0.22);
      if (alongX) { const ym = (y0 + y1) / 2;
        poly([[x0, y0, z0], [x1, y0, z0], [x1, ym, z0 + h], [x0, ym, z0 + h]], shade(col, 0.2)); // back slope (visible from top)
        poly([[x0, y1, z0], [x1, y1, z0], [x1, ym, z0 + h], [x0, ym, z0 + h]], lt);
        poly([[x1, y0, z0], [x1, y1, z0], [x1, ym, z0 + h]], dk);
        if (o.lines) api.roofLines([[x0, y1, z0], [x1, y1, z0]], [[x0, ym, z0 + h], [x1, ym, z0 + h]], col);
      } else { const xm = (x0 + x1) / 2;
        poly([[x0, y0, z0], [x0, y1, z0], [xm, y1, z0 + h], [xm, y0, z0 + h]], shade(col, 0.2));
        poly([[x1, y0, z0], [x1, y1, z0], [xm, y1, z0 + h], [xm, y0, z0 + h]], dk);
        poly([[x0, y1, z0], [x1, y1, z0], [xm, y1, z0 + h]], shade(col, 0.02));
        if (o.lines) api.roofLines([[x1, y0, z0], [x1, y1, z0]], [[xm, y0, z0 + h], [xm, y1, z0 + h]], shade(col, -0.2));
      }
    };
    api.roofLines = (e0, e1, col) => { x.save(); x.strokeStyle = shade(col, -0.35); x.globalAlpha = 0.45; x.lineWidth = 0.6; for (let t = 0.08; t < 1; t += 0.12) { const a = p(e0[0][0] + (e0[1][0] - e0[0][0]) * t, e0[0][1] + (e0[1][1] - e0[0][1]) * t, e0[0][2]); const b = p(e1[0][0] + (e1[1][0] - e1[0][0]) * t, e1[0][1] + (e1[1][1] - e1[0][1]) * t, e1[0][2]); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); } x.restore(); };
    api.pyramid = (x0, y0, x1, y1, z0, h, col) => { if (noRoof) return; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ov = 0.12; x0 -= ov; y0 -= ov; x1 += ov; y1 += ov; poly([[x0, y1, z0], [x1, y1, z0], [cx, cy, z0 + h]], shade(col, 0.05)); poly([[x1, y0, z0], [x1, y1, z0], [cx, cy, z0 + h]], shade(col, -0.22)); };
    api.cone = (cx, cy, r, z0, h, col) => { if (noRoof) return; const c = p(cx, cy, z0), t = p(cx, cy, z0 + h); const rx = r * TW / 2 * 1.41, ry = rx / 2; const g = x.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, -0.3)); x.fillStyle = g; x.beginPath(); x.moveTo(c[0] - rx, c[1]); x.lineTo(t[0], t[1]); x.lineTo(c[0] + rx, c[1]); x.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); x.fill(); };
    api.cyl = (cx, cy, r, z0, z1, col, tex) => { const a = p(cx, cy, z0), b = p(cx, cy, z1); const rx = r * TW / 2 * 1.41, ry = rx / 2; const g = x.createLinearGradient(a[0] - rx, 0, a[0] + rx, 0); g.addColorStop(0, shade(col, 0.15)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.35)); x.fillStyle = g; x.beginPath(); x.ellipse(a[0], a[1], rx, ry, 0, 0, Math.PI); x.lineTo(b[0] - rx, b[1]); x.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); x.closePath(); x.fill(); ell(x, b[0], b[1], rx, ry, shade(col, 0.2)); if (tex) { x.save(); x.strokeStyle = shade(col, -0.35); x.globalAlpha = 0.4; x.lineWidth = 0.5; for (let z = z0 + 5; z < z1; z += 5) { x.beginPath(); x.ellipse(a[0], a[1] - (z - z0), rx, ry, 0, 0, Math.PI); x.stroke(); } x.restore(); } };
    api.dome = (cx, cy, r, z0, col) => { if (noRoof) return; const c = p(cx, cy, z0); const rx = r * TW / 2 * 1.41; const g = x.createRadialGradient(c[0] - rx * 0.35, c[1] - rx * 0.7, rx * 0.1, c[0], c[1] - rx * 0.2, rx * 1.1); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.4)); x.fillStyle = g; x.beginPath(); x.ellipse(c[0], c[1], rx, rx / 2, 0, 0, Math.PI); x.ellipse(c[0], c[1], rx, rx * 0.95, 0, Math.PI, 0); x.fill(); };
    api.flag = (X, Y, Z, h, col) => { if (noRoof) return; const a = p(X, Y, Z), b = [a[0], a[1] - h]; limb(x, a[0], a[1], b[0], b[1], 1, '#3a2a1a'); x.fillStyle = col; x.beginPath(); x.moveTo(b[0], b[1]); x.quadraticCurveTo(b[0] + 5, b[1] + 1, b[0] + 9, b[1] + 3); x.lineTo(b[0], b[1] + 6); x.closePath(); x.fill(); };
    api.door = (X0, X1, Y, z, h, col) => { poly([[X0, Y, z], [X1, Y, z], [X1, Y, z + h * 0.75], [(X0 + X1) / 2, Y, z + h], [X0, Y, z + h * 0.75]], col || '#2b1c10'); };
    api.doorR = (X, Y0, Y1, z, h, col) => { poly([[X, Y0, z], [X, Y1, z], [X, Y1, z + h * 0.75], [X, (Y0 + Y1) / 2, z + h], [X, Y0, z + h * 0.75]], col || '#22160c'); };
    api.win = (X0, X1, Y, z, h) => poly([[X0, Y, z], [X1, Y, z], [X1, Y, z + h], [X0, Y, z + h]], '#2a1e14');
    api.winR = (X, Y0, Y1, z, h) => poly([[X, Y0, z], [X, Y1, z], [X, Y1, z + h], [X, Y0, z + h]], '#1e150d');
    api.cols = (x0, x1, Y, z0, z1, n, col) => { for (let i = 0; i < n; i++) { const t = x0 + (x1 - x0) * (i / (n - 1)); const a = p(t, Y, z0), b = p(t, Y, z1); x.fillStyle = shade(col, -0.15); x.fillRect(a[0] - 1.6, b[1], 3.2, a[1] - b[1]); x.fillStyle = shade(col, 0.25); x.fillRect(a[0] - 1.6, b[1], 1.1, a[1] - b[1]); } };
    api.colsR = (X, y0, y1, z0, z1, n, col) => { for (let i = 0; i < n; i++) { const t = y0 + (y1 - y0) * (i / (n - 1)); const a = p(X, t, z0), b = p(X, t, z1); x.fillStyle = shade(col, -0.3); x.fillRect(a[0] - 1.6, b[1], 3.2, a[1] - b[1]); } };
    return api;
  }
  // per-age material palettes
  const STYLE = [
    { wall: '#b98f5c', wall2: '#9c7445', roof: '#d7b05a', roofT: 'thatch', tex: 'wattle', base: '#7d6a55', trim: '#5b3b20', wood: '#7a5230' },
    { wall: '#d3a86f', wall2: '#c28d55', roof: '#b4683c', roofT: 'flat', tex: 'brick', base: '#9a7a58', trim: '#8a4f2a', wood: '#7a5230' },
    { wall: '#a9a59b', wall2: '#8f8b82', roof: '#a8432f', roofT: 'tile', tex: 'stone', base: '#6f6b64', trim: '#5c5850', wood: '#6b4526' },
    { wall: '#ece6da', wall2: '#d9d1c0', roof: '#2f6f8c', roofT: 'dome', tex: 'marble', base: '#bdb4a2', trim: '#d4a83a', wood: '#6b4526' }
  ];
  S.STYLE = STYLE;
  function roof(A, st, x0, y0, x1, y1, z0, h, alongX, col) {
    col = col || st.roof;
    if (A.noRoof) return;
    if (st.roofT === 'flat') { A.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, z0, z0 + 3, st.wall2, { top: shade(st.wall, 0.12) }); A.box(x0 + 0.1, y0 + 0.1, x0 + 0.3, y1 - 0.1, z0 + 3, z0 + 5, st.wall2); return; }
    A.gable(x0, y0, x1, y1, z0, h, col, alongX, { lines: true, ov: st.roofT === 'thatch' ? 0.2 : 0.12 });
  }
  const BLD = {};
  BLD.house = (A, st, s, pc, age) => {
    if (age === 1) { A.box(0.3, 0.3, 1.7, 1.7, 0, 15, st.wall, { tex: st.tex }); A.door(0.8, 1.15, 1.7, 0, 9); A.winR(1.7, 0.6, 0.9, 7, 3); A.box(0.25, 0.25, 1.75, 1.75, 15, 17, st.wall2); A.box(0.25, 0.25, 0.55, 1.75, 17, 20, st.wall2); A.box(1.0, 0.4, 1.6, 0.9, 17, 19, pc.c); return; }
    if (age === 3) { A.box(0.25, 0.25, 1.75, 1.75, 0, 16, st.wall, { tex: st.tex }); A.door(0.75, 1.1, 1.75, 0, 10, '#3a2a1a'); A.cols(0.3, 1.7, 1.78, 0, 15, 4, st.wall); A.gable(0.25, 0.25, 1.75, 1.75, 16, 11, '#b5482f', true, { lines: true }); A.box(0.2, 1.72, 1.8, 1.8, 15, 16.5, st.trim); return; }
    A.box(0.3, 0.3, 1.7, 1.7, 0, age === 2 ? 15 : 13, st.wall, { tex: st.tex }); A.door(0.75, 1.1, 1.7, 0, 9); A.winR(1.7, 0.6, 0.95, 6, 4);
    roof(A, st, 0.3, 0.3, 1.7, 1.7, age === 2 ? 15 : 13, 14, true);
    A.box(0.95, 1.69, 1.25, 1.75, 11, 13, pc.c);
    if (age === 0) { const q = A.p(0.5, 0.6, 26); A.x.fillStyle = 'rgba(80,80,80,0.5)'; }
  };
  BLD.towncenter = (A, st, s, pc, age) => {
    const hz = [18, 20, 24, 26][age];
    A.box(0.15, 0.15, 2.85, 2.85, 0, 3, st.base, { tex: age >= 2 ? 'stone' : 0 });
    A.box(0.35, 0.35, 2.65, 2.65, 3, hz, st.wall, { tex: st.tex });
    A.door(1.2, 1.8, 2.65, 3, 13, '#2b1c10'); A.doorR(2.65, 1.2, 1.8, 3, 11);
    for (const t of [0.6, 2.2]) A.win(t, t + 0.3, 2.65, 12, 4); for (const t of [0.6, 2.1]) A.winR(2.65, t, t + 0.3, 12, 4);
    if (age === 3) { A.cols(0.4, 2.6, 2.7, 3, hz, 6, '#f6f1e6'); A.box(0.3, 0.3, 2.7, 2.7, hz, hz + 4, st.trim); A.box(0.8, 0.8, 2.2, 2.2, hz + 4, hz + 12, st.wall, { tex: 'marble' }); A.dome(1.5, 1.5, 0.75, hz + 12, '#3a8fb0'); A.flag(1.5, 1.5, hz + 30, 12, pc.c); return; }
    if (age === 1) { A.box(0.3, 0.3, 2.7, 2.7, hz, hz + 3, st.wall2); A.box(0.9, 0.9, 2.1, 2.1, hz + 3, hz + 13, st.wall, { tex: 'brick' }); A.box(0.85, 0.85, 2.15, 2.15, hz + 13, hz + 15, st.wall2); A.box(1.0, 1.0, 1.5, 2.0, hz + 15, hz + 17, pc.c); A.flag(2.0, 1.0, hz + 15, 12, pc.c); return; }
    if (age === 0) A.box(1.75, 0.7, 2.05, 1.0, hz - 2, hz + 27, '#7a746c', { tex: 'stone' });
    roof(A, st, 0.35, 0.35, 2.65, 2.65, hz, age === 0 ? 20 : 18, true);
    if (age === 2) { A.box(1.1, 1.1, 1.9, 1.9, hz + 10, hz + 22, st.wall, { tex: 'stone' }); A.pyramid(1.1, 1.1, 1.9, 1.9, hz + 22, 12, st.roof); A.flag(1.5, 1.5, hz + 34, 12, pc.c); }
    else { A.flag(1.5, 2.6, hz + 6, 14, pc.c); }
    A.box(1.35, 2.64, 1.65, 2.7, hz - 7, hz - 1, pc.c);
  };
  const MILH = [14, 15, 18, 20];
  BLD.barracks = (A, st, s, pc, age) => {
    const h = MILH[age]; A.box(0.25, 0.25, 2.75, 2.75, 0, 2, st.base);
    A.box(0.3, 0.5, 2.7, 2.7, 2, h, st.wall, { tex: st.tex }); A.door(1.1, 1.9, 2.7, 2, 10); roof(A, st, 0.3, 0.5, 2.7, 2.7, h, 13, true);
    if (age === 3) { A.cols(0.4, 2.6, 2.75, 2, h, 5, '#f4efe4'); A.box(0.25, 2.65, 2.75, 2.8, h, h + 2, st.trim); }
    for (const t of [0.6, 1.6]) A.box(t, 0.3, t + 0.15, 0.45, 0, 14, st.wood); // training posts
    A.box(2.4, 0.2, 2.6, 0.4, 0, 22, st.wood); A.flag(2.5, 0.3, 22, 1, pc.c);
    const q = A.p(2.1, 2.72, 10); A.x.fillStyle = pc.c; A.x.fillRect(q[0] - 3, q[1] - 2, 6, 8);
    // racks of spears
    for (let i = 0; i < 4; i++) { const a = A.p(2.72, 0.8 + i * 0.25, 2), b = A.p(2.72, 0.8 + i * 0.25, 16); limb(A.x, a[0] + 2, a[1], b[0] + 2, b[1], 0.8, '#6b4423'); }
  };
  BLD.archery = (A, st, s, pc, age) => {
    const h = MILH[age] - 1; A.box(0.3, 0.3, 1.8, 2.7, 0, h, st.wall, { tex: st.tex }); A.door(0.7, 1.4, 2.7, 0, 9); roof(A, st, 0.3, 0.3, 1.8, 2.7, h, 12, false);
    A.box(1.9, 0.5, 2.8, 2.6, 0, 1, '#8c7a52'); // range ground
    for (const t of [0.9, 1.7]) { const c = A.p(2.45, t, 0); limb(A.x, c[0], c[1], c[0], c[1] - 12, 1, st.wood); ell(A.x, c[0], c[1] - 14, 4, 4, '#e8dcc0'); ell(A.x, c[0], c[1] - 14, 2.6, 2.6, '#c33'); ell(A.x, c[0], c[1] - 14, 1, 1, '#eee'); }
    A.flag(1.6, 0.4, h + 8, 12, pc.c);
  };
  BLD.stable = (A, st, s, pc, age) => {
    const h = MILH[age] - 2; A.box(0.3, 0.3, 2.7, 1.9, 0, h, st.wall, { tex: st.tex }); for (const t of [0.5, 1.3, 2.1]) A.win(t, t + 0.4, 1.9, 0, 8); roof(A, st, 0.3, 0.3, 2.7, 1.9, h, 12, true);
    // paddock fence
    A.x.strokeStyle = st.wood; A.x.lineWidth = 1.2; for (const [a, b] of [[[0.2, 2.0], [0.2, 2.85]], [[0.2, 2.85], [2.8, 2.85]], [[2.8, 2.85], [2.8, 2.0]]]) for (const z of [3, 6]) { const p1 = A.p(a[0], a[1], z), p2 = A.p(b[0], b[1], z); A.x.beginPath(); A.x.moveTo(p1[0], p1[1]); A.x.lineTo(p2[0], p2[1]); A.x.stroke(); }
    const hay = A.p(2.2, 2.4, 0); ell(A.x, hay[0], hay[1] - 3, 6, 4, '#d9b85a'); ell(A.x, hay[0] - 1, hay[1] - 4, 4, 2.5, '#ecd27a');
    A.flag(2.5, 0.5, h + 9, 12, pc.c);
  };
  BLD.blacksmith = (A, st, s, pc, age) => {
    const h = MILH[age] - 2; A.box(0.3, 0.3, 2.7, 2.7, 0, h, st.wall, { tex: st.tex }); A.door(1.2, 1.8, 2.7, 0, 9); roof(A, st, 0.3, 0.3, 2.7, 2.7, h, 12, true);
    A.box(2.0, 0.5, 2.5, 1.0, h, h + 18, '#6d6a66', { tex: 'stone' }); // chimney
    const g = A.p(1.5, 2.72, 3); const gr = A.x.createRadialGradient(g[0], g[1] - 3, 0, g[0], g[1] - 3, 9); gr.addColorStop(0, 'rgba(255,170,60,0.9)'); gr.addColorStop(1, 'rgba(255,100,20,0)'); A.x.fillStyle = gr; A.x.fillRect(g[0] - 10, g[1] - 12, 20, 18);
    const an = A.p(2.85, 1.6, 0); A.x.fillStyle = '#3d3d42'; A.x.fillRect(an[0] - 4, an[1] - 6, 8, 3); A.x.fillRect(an[0] - 2, an[1] - 4, 4, 4);
  };
  BLD.market = (A, st, s, pc, age) => {
    const h = MILH[age] - 4; A.box(0.3, 0.3, 1.5, 1.5, 0, h + 6, st.wall, { tex: st.tex }); roof(A, st, 0.3, 0.3, 1.5, 1.5, h + 6, 10, true);
    const stall = (x0, y0, c) => { for (const [a, b] of [[x0, y0], [x0 + 0.9, y0], [x0, y0 + 0.9], [x0 + 0.9, y0 + 0.9]]) A.box(a, b, a + 0.08, b + 0.08, 0, 10, st.wood); A.gable(x0, y0, x0 + 1, y0 + 1, 10, 5, c, true, { ov: 0.05 }); A.box(x0 + 0.1, y0 + 0.5, x0 + 0.9, y0 + 0.9, 0, 4, '#8a5a30'); ell(A.x, A.p(x0 + 0.5, y0 + 0.7, 5)[0], A.p(x0 + 0.5, y0 + 0.7, 5)[1], 4, 1.6, c === pc.c ? '#e8b030' : '#c33'); };
    stall(1.7, 0.4, pc.c); stall(0.4, 1.7, '#e0d2a8'); stall(1.7, 1.7, '#c9543a');
  };
  BLD.tower = (A, st, s, pc, age) => {
    const H = [30, 34, 40, 44][age];
    if (age === 0) { for (const [a, b] of [[0.4, 0.4], [1.5, 0.4], [0.4, 1.5], [1.5, 1.5]]) A.box(a, b, a + 0.12, b + 0.12, 0, H, st.wood); A.box(0.3, 0.3, 1.7, 1.7, H - 6, H, st.wall, { tex: 'plank' }); A.pyramid(0.3, 0.3, 1.7, 1.7, H, 12, st.roof); A.flag(1, 1, H + 12, 10, pc.c); return; }
    if (age === 3) { A.cyl(1, 1, 0.62, 0, H, st.wall, true); A.cyl(1, 1, 0.75, H, H + 5, st.trim); A.cone(1, 1, 0.75, H + 5, 18, '#2f6f8c'); A.flag(1, 1, H + 23, 10, pc.c); return; }
    A.box(0.4, 0.4, 1.6, 1.6, 0, H, st.wall, { tex: st.tex }); A.win(0.85, 1.1, 1.6, H - 12, 5); A.winR(1.6, 0.85, 1.1, H - 12, 5);
    A.box(0.3, 0.3, 1.7, 1.7, H, H + 4, st.wall2);
    for (const [a, b] of [[0.3, 1.5], [0.8, 1.5], [1.3, 1.5], [1.5, 0.3], [1.5, 0.8]]) A.box(a, b, a + 0.2, b + 0.2, H + 4, H + 7, st.wall2);
    if (age === 2) { A.pyramid(0.35, 0.35, 1.65, 1.65, H + 7, 12, st.roof); }
    A.flag(1, 1, H + (age === 2 ? 19 : 7), 10, pc.c);
  };
  const campCol = { lumbercamp: '#8a5a30', miningcamp: '#7d7a72', mill: '#d8b25a' };
  BLD.lumbercamp = (A, st, s, pc, age) => {
    A.box(0.3, 0.3, 1.7, 1.2, 0, 11 + age, st.wall, { tex: age ? st.tex : 'plank' }); roof(A, st, 0.25, 0.25, 1.75, 1.25, 11 + age, 8, true);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) { const c = A.p(0.5 + j * 0.42 + i * 0.21, 1.6, 2 + i * 3.4); ell(A.x, c[0], c[1], 2.3, 1.9, '#8d5d31'); ell(A.x, c[0] - 0.4, c[1], 1.4, 1.4, '#d1a56b'); }
    A.flag(1.6, 0.3, 18 + age, 8, pc.c);
  };
  BLD.miningcamp = (A, st, s, pc, age) => {
    A.box(0.3, 0.3, 1.7, 1.2, 0, 11 + age, st.wall, { tex: age ? st.tex : 'plank' }); roof(A, st, 0.25, 0.25, 1.75, 1.25, 11 + age, 8, true);
    const c = A.p(1.2, 1.6, 0); A.x.fillStyle = '#6b4a2b'; A.x.fillRect(c[0] - 7, c[1] - 6, 14, 5); ell(A.x, c[0] - 5, c[1], 2, 2, '#333'); ell(A.x, c[0] + 5, c[1], 2, 2, '#333'); ell(A.x, c[0] - 2, c[1] - 7, 3, 2, '#f2cc3f'); ell(A.x, c[0] + 3, c[1] - 7, 3, 2, '#a9a49a');
    A.flag(1.6, 0.3, 18 + age, 8, pc.c);
  };
  BLD.mill = (A, st, s, pc, age, t) => {
    if (age >= 2) { A.cyl(1, 1, 0.6, 0, 22 + age * 2, st.wall, true); A.cone(1, 1, 0.66, 22 + age * 2, 12, st.roof); }
    else { A.box(0.4, 0.4, 1.6, 1.6, 0, 18, st.wall, { tex: st.tex }); roof(A, st, 0.4, 0.4, 1.6, 1.6, 18, 10, true); }
    A.door(0.85, 1.15, 1.6, 0, 8); A.flag(0.5, 0.5, age >= 2 ? 22 + age * 2 : 18, 10, pc.c);
    // sails are drawn live by the renderer (they turn)
  };
  BLD.dock = (A, st, s, pc, age) => {
    A.box(0.1, 0.1, 2.9, 2.9, -2, 1, '#7a5230', { tex: 'plank' });
    for (const [a, b] of [[0.1, 0.1], [2.8, 0.1], [0.1, 2.8], [2.8, 2.8], [1.45, 2.8], [2.8, 1.45]]) A.box(a, b, a + 0.12, b + 0.12, -6, 4, '#4f3420');
    A.box(0.3, 0.3, 1.6, 1.6, 1, 13 + age * 2, st.wall, { tex: st.tex }); roof(A, st, 0.3, 0.3, 1.6, 1.6, 13 + age * 2, 9, true);
    const c = A.p(2.2, 2.2, 1); ell(A.x, c[0], c[1] - 2, 4, 2, '#8a6b3a'); A.flag(2.7, 0.3, 4, 16, pc.c);
  };
  BLD.siegeworks = (A, st, s, pc, age) => {
    A.box(0.3, 0.3, 2.7, 2.0, 0, 20, st.wall, { tex: st.tex }); A.door(0.7, 2.2, 2.0, 0, 15, '#2a1d12'); roof(A, st, 0.3, 0.3, 2.7, 2.0, 20, 12, true);
    const c = A.p(1.6, 2.6, 0); limb(A.x, c[0] - 10, c[1] - 2, c[0] + 8, c[1] - 9, 2.4, '#6b4423'); ell(A.x, c[0] - 4, c[1], 3, 3, '#4a3220'); ell(A.x, c[0] + 4, c[1] - 1, 3, 3, '#4a3220');
    A.flag(2.5, 0.4, 32, 10, pc.c);
  };
  BLD.academy = (A, st, s, pc, age) => {
    A.box(0.2, 0.2, 2.8, 2.8, 0, 3, st.base); A.box(0.4, 0.4, 2.6, 2.6, 3, 20, st.wall, { tex: st.tex });
    A.cols(0.45, 2.55, 2.68, 3, 20, 6, age >= 3 ? '#f7f2e8' : '#c9c3b6'); A.colsR(2.68, 0.45, 2.55, 3, 20, 6, age >= 3 ? '#f7f2e8' : '#c9c3b6');
    A.box(0.3, 0.3, 2.7, 2.7, 20, 23, st.trim); if (age >= 3) A.dome(1.5, 1.5, 0.8, 23, '#c9a23a'); else A.pyramid(0.3, 0.3, 2.7, 2.7, 23, 13, st.roof);
    A.flag(1.5, 1.5, age >= 3 ? 44 : 36, 10, pc.c);
  };
  BLD.farm = (A, st, s, pc, age) => {
    A.poly([[0.1, 0.1, 0], [2.9, 0.1, 0], [2.9, 2.9, 0], [0.1, 2.9, 0]], '#7a5a34');
    for (let i = 0; i < 9; i++) { const t = 0.25 + i * 0.3; A.poly([[t, 0.2, 0.3], [t + 0.14, 0.2, 0.3], [t + 0.14, 2.8, 0.3], [t, 2.8, 0.3]], '#5f4426'); }
    A.x.strokeStyle = st.wood; A.x.lineWidth = 0.9; for (const [a, b] of [[[0.05, 0.05], [2.95, 0.05]], [[0.05, 0.05], [0.05, 2.95]], [[0.05, 2.95], [2.95, 2.95]], [[2.95, 0.05], [2.95, 2.95]]]) { const p1 = A.p(a[0], a[1], 3), p2 = A.p(b[0], b[1], 3); A.x.beginPath(); A.x.moveTo(p1[0], p1[1]); A.x.lineTo(p2[0], p2[1]); A.x.stroke(); }
  };
  BLD.palisade = (A, st, s, pc, age) => { for (const [a, b] of [[0.2, 0.2], [0.55, 0.45], [0.3, 0.7], [0.7, 0.75], [0.5, 0.15]]) A.cyl(a + 0.1, b + 0.1, 0.13, 0, 15, '#8b5d33'); };
  BLD.wall = (A, st, s, pc, age) => { const c = age >= 3 ? '#e2dccf' : age >= 2 ? '#a19d94' : '#bfa27a'; A.box(0.05, 0.05, 0.95, 0.95, 0, 17, c, { tex: age >= 3 ? 'marble' : 'stone' }); A.box(0.05, 0.05, 0.35, 0.35, 17, 21, c); A.box(0.65, 0.65, 0.95, 0.95, 17, 21, c); };
  BLD.wonder = (A, st, s, pc, age) => {
    A.box(0, 0, 5, 5, 0, 5, '#cfc6b2', { tex: 'stone' }); A.box(0.4, 0.4, 4.6, 4.6, 5, 10, '#ddd5c4', { tex: 'stone' });
    A.box(0.9, 0.9, 4.1, 4.1, 10, 40, '#efe9dd', { tex: 'marble' });
    A.cols(1.0, 4.0, 4.2, 10, 40, 8, '#fbf8f1'); A.colsR(4.2, 1.0, 4.0, 10, 40, 8, '#fbf8f1');
    A.box(0.8, 0.8, 4.2, 4.2, 40, 45, '#d6ab3c'); A.box(1.4, 1.4, 3.6, 3.6, 45, 62, '#f3eee4', { tex: 'marble' }); A.box(1.3, 1.3, 3.7, 3.7, 62, 65, '#d6ab3c');
    A.dome(2.5, 2.5, 1.0, 65, '#e0b13c');
    for (const [a, b] of [[0.2, 0.2], [4.3, 0.2], [0.2, 4.3], [4.3, 4.3]]) { A.cyl(a + 0.25, b + 0.25, 0.28, 5, 56, '#f1ebdf'); A.cone(a + 0.25, b + 0.25, 0.32, 56, 14, '#d6ab3c'); }
    A.door(2.1, 2.9, 4.1, 10, 18, '#3a2410');
    const q = A.p(2.5, 4.4, 2); A.x.fillStyle = pc.c; A.x.fillRect(q[0] - 10, q[1] - 32, 4, 20); A.x.fillRect(q[0] + 6, q[1] - 32, 4, 20);
  };
  S.BLD = BLD;
  S.bldHeight = (type) => Math.round((({ towncenter: 70, house: 38, wonder: 125, tower: 75, mill: 45, academy: 52, siegeworks: 40, dock: 28, farm: 4, palisade: 18, wall: 24 })[type] || 40) * ZM);
  S.building = function (type, owner, age, stage) {
    const pc = S.playerCol(owner); const st = STYLE[age];
    return get('B' + type + '|' + pc.c + '|' + age + '|' + stage, () => {
      const d = D.BUILD[type], s = d.size; const H = S.bldHeight(type); const w = s * TW + 8, h = s * TH + H + 8;
      const [c, x] = mk(w, h); const ox = s * TW / 2 + 4, oy = H + 4;
      const A = P3(x, ox, oy);
      if (stage === 0) { // foundation
        A.poly([[0.05, 0.05, 0], [s - 0.05, 0.05, 0], [s - 0.05, s - 0.05, 0], [0.05, s - 0.05, 0]], 'rgba(120,95,60,0.75)');
        x.strokeStyle = 'rgba(255,240,200,0.7)'; x.setLineDash([3, 3]); x.lineWidth = 1; x.beginPath(); for (const [a, b] of [[0.1, 0.1], [s - 0.1, 0.1], [s - 0.1, s - 0.1], [0.1, s - 0.1], [0.1, 0.1]]) { const q = A.p(a, b, 0); x.lineTo(q[0], q[1]); } x.stroke(); x.setLineDash([]);
        for (const [a, b] of [[0.1, 0.1], [s - 0.1, 0.1], [0.1, s - 0.1], [s - 0.1, s - 0.1]]) A.box(a - 0.05, b - 0.05, a + 0.05, b + 0.05, 0, 6, '#8a6a40');
      } else {
        const B = stage < 4 ? P3(x, ox, oy, stage === 1 ? 0.35 : stage === 2 ? 0.7 : 1, stage < 3) : A;
        BLD[type](B, st, s, pc, age);
        if (stage < 4 && type !== 'farm' && !d.wall) { // scaffolding
          x.strokeStyle = '#b48a52'; x.lineWidth = 1.2;
          const top = (stage === 1 ? 10 : stage === 2 ? 18 : 24);
          for (const [a, b] of [[-0.05, s + 0.05], [s + 0.05, s + 0.05], [s + 0.05, -0.05], [s / 2, s + 0.05], [s + 0.05, s / 2]]) { const q = A.p(a, b, 0), r = A.p(a, b, top); x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(r[0], r[1]); x.stroke(); }
          for (let z = 6; z <= top; z += 6) { x.beginPath(); const q1 = A.p(-0.05, s + 0.05, z), q2 = A.p(s + 0.05, s + 0.05, z), q3 = A.p(s + 0.05, -0.05, z); x.moveTo(q1[0], q1[1]); x.lineTo(q2[0], q2[1]); x.lineTo(q3[0], q3[1]); x.stroke(); }
          x.lineWidth = 0.7; x.beginPath(); const d1 = A.p(-0.05, s + 0.05, 0), d2 = A.p(s / 2, s + 0.05, top), d3 = A.p(s + 0.05, s / 2, 0), d4 = A.p(s + 0.05, -0.05, top); x.moveTo(d1[0], d1[1]); x.lineTo(d2[0], d2[1]); x.moveTo(d3[0], d3[1]); x.lineTo(d4[0], d4[1]); x.stroke();
        }
      }
      return { c, w, h, ox, oy, H };
    });
  };
  // building cast shadow polygon (screen offsets from footprint top corner), sun from the north-west
  S.shadowPoly = function (type, s) { const H = S.bldHeight(type) * 0.55; const L = H / TH * 0.9; return [[0, s], [s, s], [s, 0], [s + L, 0 + L * 0.2], [s + L, s + L * 0.6], [L * 0.2, s + L * 0.6]]; };
  S.icon = function (kind, key, size) {
    return get('I' + kind + key + size, () => {
      const [c, x] = mk(size, size);
      if (kind === 'u') { const sp = S.unit(key, 0, 0, key === 'knight' ? 2 : 1, 1, 'idle', 0, 1); const sc = Math.min(size / sp.w, size / sp.h) * 1.35; x.drawImage(sp.c, size / 2 - sp.ox * sc, size * 0.92 - sp.oy * sc, sp.w * sc, sp.h * sc); }
      else if (kind === 'b') { const sp = S.building(key, 0, 1, 4); const sc = Math.min(size / sp.w, size / sp.h) * 1.05; x.drawImage(sp.c, (size - sp.w * sc) / 2, (size - sp.h * sc) / 2, sp.w * sc, sp.h * sc); }
      return { c };
    });
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
