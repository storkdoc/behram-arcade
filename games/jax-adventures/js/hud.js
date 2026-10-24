// Jax's Adventures - HUD & menus on a device-pixel 2D canvas (pixel-crisp text)
import * as S from './sim.js';
import * as W from './world.js';
import { ITEMS, FISH, FISH_BY_ID, SPECIES, RARITY, RARITY_COL, SHOP, SHOP_BY_ID, RODS, RECIPES, CHAPTERS, SIDE_QUESTS, NPCS, TIPS } from './data.js';
import { clamp, lerp } from './util.js';

const FONT = '"SF Pro Rounded", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const C = { panel: 'rgba(22,30,26,0.92)', panel2: 'rgba(40,54,44,0.95)', line: 'rgba(255,240,200,0.18)', text: '#fff8ea', dim: '#c8c0a8', gold: '#ffd25a', green: '#8fe07a', red: '#ff6a5a', blue: '#8ccfff', btn: '#3f6b46', btnHi: '#57905f', btnDis: '#3a3f3a', wood: '#7a5232' };
const fmtTime = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; const ap = hh >= 12 ? 'PM' : 'AM'; const h12 = (hh % 12) || 12; return `${h12}:${String(mm).padStart(2, '0')} ${ap}`; };
const WICON = { clear: '☀️', cloudy: '⛅', rain: '🌧️' };
const itemIcon = it => it.fish ? (FISH_BY_ID[it.fish.sp].junk ? (ITEMS[it.fish.sp] || {}).icon || '👢' : '🐟') : (ITEMS[it.id] ? ITEMS[it.id].icon : '❔');

export class HUD {
  constructor(canvas, opt = {}) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.dpr = 1; this.w = 1; this.h = 1; this.hits = []; this.btns = []; this.mx = -1; this.my = -1; this.t = 0;
    this.mode = 'loading'; this.load = 0; this.ui = null; this.sel = 0; this.scroll = 0; this.tab = 0; this.introI = 0; this.touch = !!opt.touch; this.title = { hasSave: false };
    this.cb = opt.cb || {}; this.mapImg = null; this.confirm = null; this.pressed = null; this.loadMsg = 'Building the park…';
  }
  resize(w, h, dpr) { this.w = w; this.h = h; this.dpr = dpr; this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr); this.c.style.width = w + 'px'; this.c.style.height = h + 'px'; this.s = clamp(Math.min(w / 900, h / 620), 0.72, 1.35); }
  get small() { return this.w < 700 || this.h < 500; }
  // ---------- primitives
  font(sz, wt = 600, fam = FONT) { this.g.font = `${wt} ${Math.round(sz * 2) / 2}px ${fam}`; }
  rr(x, y, w, h, r, fill, stroke, lw = 1) { const g = this.g; g.beginPath(); g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
  text(s, x, y, o = {}) { const g = this.g; this.font(o.size || 15, o.weight || 600, o.fam); g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'middle';
    if (o.shadow !== false) { g.fillStyle = o.shadowCol || 'rgba(0,0,0,0.55)'; g.fillText(s, Math.round(x) + 0, Math.round(y) + Math.max(1, (o.size || 15) / 12)); }
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.stroke; g.strokeStyle = o.strokeCol || '#1a120a'; g.strokeText(s, Math.round(x), Math.round(y)); }
    g.fillStyle = o.col || C.text; g.fillText(s, Math.round(x), Math.round(y)); return g.measureText(s).width; }
  emoji(s, x, y, sz) { const g = this.g; g.font = `${sz}px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(s, Math.round(x), Math.round(y + sz * 0.05)); }
  wrap(s, maxW, sz, wt = 500) { this.font(sz, wt); const out = []; for (const para of String(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (this.g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; }
  hit(x, y, w, h, fn, o = {}) { if (this.skipDraw) return false; if (this.clip) { const [cx, cy, cw, ch] = this.clip; const x2 = Math.min(x + w, cx + cw), y2 = Math.min(y + h, cy + ch); x = Math.max(x, cx); y = Math.max(y, cy); w = x2 - x; h = y2 - y; if (w <= 0 || h <= 0) return false; }
    this.hits.push({ x, y, w, h, fn, ...o }); return this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h && !this.touch; }
  button(x, y, w, h, label, fn, o = {}) { let navSel = false; if (o.nav !== false && fn) { navSel = this.navKbd && this.navList.length === this.sel; this.navList.push(o.dis ? () => { } : fn); } if (this.skipDraw) return false;
    const hov = this.hit(x, y, w, h, o.dis ? null : fn, o); const sel = o.sel || navSel; const col = o.dis ? C.btnDis : hov ? (o.hi || C.btnHi) : (o.col || C.btn);
    this.rr(x, y + 2, w, h, o.r || 10, 'rgba(0,0,0,0.35)'); this.rr(x, y, w, h, o.r || 10, col, sel ? '#ffe9a8' : 'rgba(255,255,255,0.14)', sel ? 2.5 : 1);
    if (this.pressed && this.pressed.fn === fn && fn) this.rr(x, y, w, h, o.r || 10, 'rgba(255,255,255,0.18)');
    const tc = o.dis ? '#9a9a90' : C.text;
    if (o.icon) { this.emoji(o.icon, x + h * 0.55, y + h / 2, h * 0.5); this.text(label, x + h * 1.05, y + h / 2, { size: o.size || 15, col: tc }); }
    else if (o.coin) { this.font(o.size || 15, 800); const tw = this.g.measureText(label).width; const cx = x + w / 2 - (tw + 22) / 2; this.coin(cx + 8, y + h / 2, 8); this.text(label, cx + 22, y + h / 2, { size: o.size || 15, col: o.dis ? '#9a9a90' : C.gold, weight: 800 }); }
    else if (o.left) this.text(label, x + 16, y + h / 2, { size: o.size || 15, col: tc, weight: 700 });
    else this.text(label, x + w / 2, y + h / 2, { size: o.size || 15, align: 'center', col: tc, weight: 700 }); return hov; }
  panel(x, y, w, h, title, o = {}) { this.rr(x + 3, y + 5, w, h, 18, 'rgba(0,0,0,0.35)'); this.rr(x, y, w, h, 18, C.panel, 'rgba(255,236,190,0.28)', 1.5);
    if (title) { this.rr(x, y, w, 46, 18, o.head || 'rgba(95,70,40,0.95)'); this.g.fillStyle = o.head || 'rgba(95,70,40,0.95)'; this.g.fillRect(x, y + 28, w, 18); this.text(title, x + 18, y + 24, { size: 19, weight: 800, col: '#fff1cf' });
      if (o.close !== false) this.button(x + w - 44, y + 8, 32, 30, '✕', () => this.closeMenu(), { r: 8, col: 'rgba(0,0,0,0.25)', size: 15 }); } }
  bar(x, y, w, h, k, col, bg = 'rgba(0,0,0,0.5)') { this.rr(x, y, w, h, h / 2, bg); if (k > 0.001) this.rr(x, y, Math.max(h, w * clamp(k, 0, 1)), h, h / 2, col); }
  // ---------- input from Input
  click(x, y, phase) { if (phase === 'down') { this.mx = x; this.my = y; this.down = true; this.dragLast = y; this.dragLastX = x; this.navKbd = false; for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { if (h.block && !h.fn) return true; if (!h.fn) continue; this.pressed = h; if (h.instant) { h.fn(); this.cb.sfx && this.cb.sfx('click'); } return true; } } return this.blocking(); }
    if (phase === 'up') { this.down = false; const h = this.pressed; this.pressed = null; if (h && !h.instant && x >= h.x - 8 && x <= h.x + h.w + 8 && y >= h.y - 8 && y <= h.y + h.h + 8) { h.fn(); this.cb.sfx && this.cb.sfx('click'); } return true; } return false; }
  hover(x, y) { this.mx = x; this.my = y; if (this.down && !this.touch) this.drag(x, y); }
  wheel(x, y, dy) { if (this.ui || (S.G && S.G.menu) || this.mode !== 'play') { this.scroll = Math.max(0, this.scroll + dy * 0.5); return true; } return false; }
  drag(x, y) { if (this.dragLast !== undefined) { if (this.ui === 'map') this.panMap(x - this.dragLastX, y - this.dragLast); else this.scroll = Math.max(0, this.scroll - (y - this.dragLast)); if (Math.abs(y - this.dragLast) > 0 && this.pressed && Math.hypot(x - this.mx, y - this.my) > 12) this.pressed = null; } this.dragLast = y; this.dragLastX = x; }
  blocking() { return this.mode !== 'play' || !!this.ui || !!(S.G && S.G.menu); }
  stickAllowed() { return !this.blocking(); }
  touchButton(x, y) { if (this.blocking()) return null; for (const b of this.btns) { const d = Math.hypot(x - b.x, y - b.y); if (d <= b.r * 1.12) return b.id; } return null; }
  openUI(k) { this.ui = k; this.sel = 0; this.scroll = 0; this.tab = 0; this.dragLast = undefined; this.cb.sfx && this.cb.sfx('open'); }
  closeMenu() { if (this.confirm) { this.confirm = null; return; } if (this.ui) { this.ui = null; return; } if (S.G && S.G.menu) { S.act('close'); } this.scroll = 0; }
  // ---------- main draw
  draw(dt, R) {
    this.t += dt; this.dt = dt; this.narrow = this.w < 640; const g = this.g; this.R = R; this.navList = []; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.w, this.h); this.hits = []; this.btns = [];
    if (this.mode === 'loading') return this.drawLoading();
    if (this.mode === 'title') return this.drawTitle();
    if (this.mode === 'intro') return this.drawIntro();
    const G = S.G; if (!G) return;
    this.drawWorldLabels(R);
    if (G.p.hidden) this.vignette('rgba(30,70,25,0.75)', 0.55);
    if (G.caught) this.vignette('rgba(160,20,10,0.6)', 0.5);
    this.drawTop(); this.drawQuest(); this.drawToasts();
    if (G.fish) this.drawFishing(); else if (G.skip) this.drawSkip(); else if (!G.menu && !this.ui) this.drawPrompt();
    if (!this.small && !this.touch) this.drawMinimap();
    if (this.touch && !G.menu && !this.ui) this.drawTouch();
    if (G.banner) this.drawBanner(G.banner);
    if (G.caught) this.drawCaught();
    if (G.menu) this.drawSimMenu(G.menu); else if (this.ui) this.drawUI();
    if (this.confirm) this.drawConfirm();
    if (G.sleepFade > 0) { g.fillStyle = `rgba(4,6,14,${clamp(G.sleepFade > 0.8 ? (1.6 - G.sleepFade) / 0.8 : G.sleepFade / 0.8, 0, 1)})`; g.fillRect(0, 0, this.w, this.h); if (G.sleepFade > 0.5) this.text('Zzz…', this.w / 2, this.h / 2, { size: 34, align: 'center', weight: 800 }); }
    if (G.paused && !this.ui) this.ui = 'pause';
  }
  vignette(col, k) { const g = this.g; const gr = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col); g.globalAlpha = k + 0.1 * Math.sin(this.t * 3); g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h); g.globalAlpha = 1; }
  drawTop() {
    const G = S.G, g = this.g; const x = 12, y = 10 + (this.safeTop || 0); const sm = this.small;
    const w = sm ? 196 : 232; this.rr(x, y, w, sm ? 44 : 52, 14, 'rgba(18,24,20,0.72)', 'rgba(255,240,200,0.18)');
    this.emoji(WICON[G.weather.kind] || '☀️', x + 22, y + (sm ? 22 : 26), sm ? 20 : 24);
    this.text(fmtTime(G.clock), x + 42, y + (sm ? 15 : 18), { size: sm ? 15 : 17, weight: 800 }); this.text(`Day ${G.day} · ${S.timeOfDay().replace(/^./, c => c.toUpperCase())}`, x + 42, y + (sm ? 32 : 38), { size: sm ? 11.5 : 13, col: C.dim, weight: 600 });
    const cx = x + w + 8; const cw = sm ? 92 : 108; this.rr(cx, y, cw, sm ? 44 : 52, 14, 'rgba(18,24,20,0.72)', 'rgba(255,240,200,0.18)'); this.coin(cx + 20, y + (sm ? 22 : 26), sm ? 10 : 12); this.text(String(G.coins), cx + 38, y + (sm ? 22 : 26), { size: sm ? 17 : 20, weight: 800, col: C.gold });
    // backpack count
    const bx = cx + cw + 8; if (!sm) { this.rr(bx, y, 84, 52, 14, 'rgba(18,24,20,0.72)', 'rgba(255,240,200,0.18)'); this.emoji('🎒', bx + 22, y + 26, 22); this.text(`${G.inv.length}/${G.slots}`, bx + 40, y + 26, { size: 15, weight: 800, col: G.inv.length >= G.slots ? C.red : C.text }); }
    // top-right buttons (all platforms; tap targets on touch)
    const bs = this.touch ? 44 : 38; let rx = this.w - 12 - bs - (this.safeRight || 0); const ty = this.narrow ? y + (sm ? 52 : 60) : y;
    const tb = (icon, fn, key) => { this.button(rx, ty, bs, bs, '', fn, { r: 12, col: 'rgba(18,24,20,0.72)', hi: 'rgba(60,80,60,0.9)', instant: false }); this.emoji(icon, rx + bs / 2, ty + bs / 2, bs * 0.5); if (key && !this.touch && !sm) this.text(key, rx + bs / 2, ty + bs + 9, { size: 10.5, align: 'center', col: C.dim, weight: 700 }); rx -= bs + 8; };
    tb('⏸️', () => this.openUI('pause'), 'P'); tb('🗺️', () => this.openUI('map'), 'M'); tb('📜', () => this.openUI('quests'), 'Q'); tb('🐟', () => this.openUI('journal'), 'J'); tb('🎒', () => this.openUI('inv'), 'I');
    if (this.cb.muted) tb(this.cb.muted() ? '🔇' : '🔊', () => this.cb.toggleMute(), 'N');
  }
  coin(x, y, r) { const g = this.g; const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.6, '#f4c430'); gr.addColorStop(1, '#b07a10'); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = gr; g.fill(); g.strokeStyle = '#8a5a08'; g.lineWidth = 1.2; g.stroke(); this.text('J', x, y + 0.5, { size: r * 1.15, align: 'center', weight: 900, col: '#8a5a08', shadow: false }); }
  drawQuest() {
    const G = S.G; const st = S.questStep && S.questStep(); const y0 = (this.small ? 62 : 72) + (this.safeTop || 0) + (this.narrow ? (this.touch ? 52 : 46) : 0);
    if (!st && !G.quest.done) return; const ch = CHAPTERS[G.quest.ch]; const w = this.small ? Math.min(250, this.w * 0.5) : 300;
    if (G.quest.done) { this.rr(12, y0, w, 34, 12, 'rgba(18,24,20,0.6)'); this.text('🏆 Main story complete! Explore freely.', 22, y0 + 17, { size: 12.5, col: C.gold }); return; }
    const lines = this.wrap(st.t, w - 24, this.small ? 13 : 14, 700); const hl = this.wrap(st.hint || '', w - 24, 12, 500).slice(0, 2); const h = 34 + lines.length * 18 + (this.small ? 0 : hl.length * 15) + 8;
    this.rr(12, y0, w, h, 12, 'rgba(18,24,20,0.66)', 'rgba(255,240,200,0.15)'); this.text(ch ? ch.title.split(':')[0].toUpperCase() + ' · ' + (G.quest.step + 1) + '/' + ch.steps.length : '', 24, y0 + 15, { size: 11, col: C.gold, weight: 800 });
    lines.forEach((l, i) => this.text(l, 24, y0 + 34 + i * 18, { size: this.small ? 13 : 14, weight: 700 })); if (!this.small) hl.forEach((l, i) => this.text(l, 24, y0 + 34 + lines.length * 18 + i * 15, { size: 12, col: C.dim, weight: 500 }));
    // direction arrow to target
    const qt = S.questTarget(); if (qt && this.R) { const p = G.p; const d = Math.hypot(qt.x - p.x, qt.z - p.z); this.text(`${Math.round(d)} m`, 12 + w - 12, y0 + 15, { size: 11.5, align: 'right', col: C.dim }); }
  }
  drawToasts() { const G = S.G; let y = (this.small ? 62 : 74) + (this.safeTop || 0); const x = this.w / 2;
    for (const t of G.toasts) { const a = clamp(Math.min(t.t * 6, (t.dur - t.t) * 3), 0, 1); this.g.globalAlpha = a; const lines = this.wrap(t.text, Math.min(520, this.w - 40), 15, 700); let w = 0; this.font(15, 700); for (const l of lines) w = Math.max(w, this.g.measureText(l).width);
      const hh = 14 + lines.length * 20; const xx = this.small ? Math.max(x - w / 2 - 16, this.w - w - 44) : x - w / 2 - 16; this.rr(xx, y, w + 32, hh, 12, 'rgba(14,18,16,0.82)', t.col, 1.5); lines.forEach((l, i) => this.text(l, xx + 16 + w / 2, y + 17 + i * 20, { size: 15, align: 'center', col: t.col, weight: 700 })); y += hh + 6; }
    this.g.globalAlpha = 1; }
  drawPrompt() { const G = S.G; const ctx = S.getCtx(); this.ctxLabel = ctx ? ctx.label : null; if (!ctx || this.touch) return; const key = G.p.hidden ? 'SPACE' : 'E';
    this.font(16, 700); const w = this.g.measureText(ctx.label).width + 76; const x = this.w / 2 - w / 2, y = this.h - 92; this.rr(x, y, w, 40, 20, 'rgba(14,18,16,0.82)', 'rgba(255,230,160,0.4)');
    this.rr(x + 7, y + 7, 44, 26, 8, '#f4ead0'); this.text(key === 'SPACE' ? 'SPC' : key, x + 29, y + 20.5, { size: 13, align: 'center', col: '#2a2016', weight: 900, shadow: false }); this.text(ctx.label, x + 62, y + 20, { size: 16, weight: 700 });
    if (this.pad) this.text('Ⓐ', x + w - 8, y + 20, { size: 14, align: 'right', col: C.green }); }
  drawBanner(b) { const k = clamp(Math.min(b.t * 3, (b.dur - b.t) * 2), 0, 1); const g = this.g; g.globalAlpha = k; const y = this.h * 0.32; const s = 1 + (1 - clamp(b.t * 4, 0, 1)) * 0.4;
    g.save(); g.translate(this.w / 2, y); g.scale(s, s); this.text(b.text, 0, 0, { size: Math.min(54, this.w / 12), align: 'center', weight: 900, col: b.col || C.gold, stroke: 6, strokeCol: '#2a1a08' }); if (b.sub) this.text(b.sub, 0, Math.min(46, this.w / 15), { size: Math.min(20, this.w / 30), align: 'center', weight: 700, stroke: 4, strokeCol: '#1a1208' }); g.restore(); g.globalAlpha = 1; }
  drawCaught() { const G = S.G; const by = S.npc(G.caught.by); this.text('CAUGHT!', this.w / 2, this.h * 0.4, { size: Math.min(64, this.w / 9), align: 'center', weight: 900, col: '#ff5a46', stroke: 7, strokeCol: '#2a0a04' }); this.text(`${by ? by.name : 'The ranger'} is walking you home…`, this.w / 2, this.h * 0.4 + 48, { size: 18, align: 'center', weight: 700, stroke: 4, strokeCol: '#1a0a04' }); }
  drawWorldLabels(R) {
    const G = S.G, g = this.g; if (!R) return; const p = G.p;
    for (const n of G.npcs) { if (n.visible === false) continue; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d > 45) continue;
      const pr = R.project(n.x, n.y + (n.kind === 'ranger' ? 2.25 : n.kidc ? 1.55 : 2.05), n.z); if (!pr) continue;
      if (n.say && d < 26) { const lines = this.wrap(n.say, 200, 13.5, 600).slice(0, 3); this.font(13.5, 600); let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width); const bh = 10 + lines.length * 17, bx = pr.x - w / 2 - 10, by = pr.y - bh - (n.aware > 0.03 || n.alert ? 40 : 14);
        this.rr(bx, by, w + 20, bh, 10, 'rgba(255,252,240,0.95)'); g.beginPath(); g.moveTo(pr.x - 6, by + bh); g.lineTo(pr.x + 6, by + bh); g.lineTo(pr.x, by + bh + 7); g.fill(); lines.forEach((l, i) => this.text(l, pr.x, by + 14 + i * 17, { size: 13.5, align: 'center', col: '#2a2418', shadow: false })); }
      if (n.kind === 'ranger' || n.kind === 'camper') { const a = n.aware || 0; const al = n.alert || (a > 0.04 ? '?' : null); if (!al) continue; const red = al === '!'; const r = 15;
        const cy = pr.y - 22; g.beginPath(); g.arc(pr.x, cy, r, 0, 7); g.fillStyle = 'rgba(15,15,15,0.7)'; g.fill(); g.beginPath(); g.moveTo(pr.x, cy); g.arc(pr.x, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(red ? 1 : a, 0, 1)); g.closePath(); g.fillStyle = red ? '#ff3b2f' : a > 0.6 ? '#ff9a2a' : '#ffd23a'; g.fill();
        const s = red ? 1 + 0.15 * Math.sin(this.t * 14) : 1; this.text(al, pr.x, cy + 1, { size: 19 * s, align: 'center', weight: 900, col: '#fff', stroke: 3, strokeCol: '#201008', shadow: false }); }
    }
    // offscreen ranger chase arrows
    for (const n of G.npcs) if (n.kind === 'ranger' && n.state === 'chase' && n.visible !== false) { const pr = R.project(n.x, n.y + 1, n.z); if (pr && pr.x > 0 && pr.x < this.w && pr.y > 0 && pr.y < this.h) continue; this.edgeArrow(n.x, n.z, '#ff3b2f', '!'); }
    // quest marker label
    const qt = S.questTarget(); if (qt) { const pr = R.project(qt.x, (qt.y != null ? qt.y : W.ground(qt.x, qt.z)) + 3.4, qt.z); const d = Math.hypot(qt.x - p.x, qt.z - p.z);
      if (pr && pr.x > 20 && pr.x < this.w - 20 && pr.y > 20 && pr.y < this.h - 20) { if (d > 6) this.text(`${qt.label || ''} · ${Math.round(d)} m`, pr.x, pr.y - 18, { size: 13, align: 'center', col: C.gold, weight: 800, stroke: 3, strokeCol: '#2a1a08', shadow: false }); }
      else if (d > 6) this.edgeArrow(qt.x, qt.z, C.gold, '★'); }
  }
  edgeArrow(x, z, col, sym) { const R = this.R; if (!R) return; const p = S.G.p; const yaw = R.camYaw(); const dx = x - p.x, dz = z - p.z; const f = dx * Math.cos(yaw) + dz * Math.sin(yaw), rgt = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const a = Math.atan2(rgt, f); const cx = this.w / 2, cy = this.h / 2; const tch = this.touch && !this.ui; const rx = Math.max(90, this.w / 2 - (tch ? 235 : 46)); const cy2 = tch ? this.h * 0.44 : cy; const ry = tch ? cy2 - (this.h > this.w ? 140 : 75) : this.h / 2 - 70; const ex = cx + Math.sin(a) * rx, ey = cy2 - Math.cos(a) * ry; const g = this.g;
    g.save(); g.translate(ex, ey); g.rotate(a); g.beginPath(); g.moveTo(0, -18); g.lineTo(13, 6); g.lineTo(-13, 6); g.closePath(); g.fillStyle = col; g.strokeStyle = '#1a1208'; g.lineWidth = 2.5; g.stroke(); g.fill(); g.restore(); this.text(sym, ex, ey + 22, { size: 14, align: 'center', weight: 900, col, stroke: 3, shadow: false }); }
  drawFishing() {
    const F = S.G.fish; const cx = this.w / 2, y = this.h - (this.touch ? 200 : 150); const w = Math.min(360, this.w - 60); const tap = this.touch ? 'FISH' : 'F / Space';
    if (F.st === 'aim') { this.rr(cx - w / 2 - 14, y - 34, w + 28, 70, 14, 'rgba(14,18,16,0.8)'); this.text(F.charging ? 'Release to cast!' : `Hold ${tap} to charge your cast`, cx, y - 16, { size: 15, align: 'center', weight: 700 });
      const gr = this.g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); gr.addColorStop(0, '#5fc26a'); gr.addColorStop(0.7, '#f5d742'); gr.addColorStop(1, '#ff7a3a'); this.bar(cx - w / 2, y + 6, w, 16, F.power, gr); }
    else if (F.st === 'cast' || F.st === 'wait') { const t = F.nibble > 0 ? 'Nibble… wait for it…' : 'Waiting for a bite…'; this.rr(cx - 140, y - 20, 280, 40, 20, 'rgba(14,18,16,0.72)'); this.text(t, cx, y, { size: 15, align: 'center', weight: 700, col: F.nibble > 0 ? C.gold : C.text }); this.text(`Esc / B to reel in · 🪱 ${S.G.bait}`, cx, y + 34, { size: 12, align: 'center', col: C.dim }); }
    else if (F.st === 'bite') { const s = 1 + 0.12 * Math.sin(this.t * 30); this.g.save(); this.g.translate(cx, y - 20); this.g.scale(s, s); this.text(this.touch ? 'TAP FISH NOW!' : 'BITE! PRESS NOW!', 0, 0, { size: 34, align: 'center', weight: 900, col: '#ffdf3a', stroke: 6, strokeCol: '#3a1a04', shadow: false }); this.g.restore(); }
    else if (F.st === 'reel') { this.rr(cx - w / 2 - 16, y - 50, w + 32, 100, 16, 'rgba(14,18,16,0.85)', 'rgba(255,240,200,0.2)');
      this.text(`Hold ${tap} to reel · let go when it's red`, cx, y - 32, { size: 13.5, align: 'center', weight: 700 });
      const tcol = F.tension > 0.85 ? '#ff4a3a' : F.tension > 0.6 ? '#ffb43a' : '#6ad06a'; this.text('Line', cx - w / 2, y - 6, { size: 12, col: C.dim }); this.bar(cx - w / 2 + 40, y - 13, w - 40, 14, F.tension / 1.0, tcol);
      this.g.fillStyle = 'rgba(255,255,255,0.6)'; this.g.fillRect(cx - w / 2 + 40 + (w - 40) * 0.85, y - 15, 2, 18);
      this.text('Catch', cx - w / 2, y + 22, { size: 12, col: C.dim }); this.bar(cx - w / 2 + 40, y + 15, w - 40, 14, F.prog, '#5ab8ff'); if (F.surging > 0) this.text('It\'s fighting!', cx, y + 44, { size: 12.5, align: 'center', col: '#ffb43a', weight: 800 }); }
    else if (F.st === 'caught' && F.sp) { const f = FISH_BY_ID[F.sp]; if (!f) return; const ww = Math.min(380, this.w - 40), hh = 150, x = cx - ww / 2, yy = Math.max(112, this.h * 0.2); const k = clamp(F.t * 5, 0, 1);
      this.g.globalAlpha = k; this.panel(x, yy, ww, hh, null); this.drawFishIcon(f, x + 74, yy + 70, 100);
      this.text(f.junk ? 'Hmm… junk!' : F.isNew ? 'NEW SPECIES!' : 'You caught a', x + 140, yy + 34, { size: 13, col: F.isNew ? C.gold : C.dim, weight: 800 }); this.text(f.name, x + 140, yy + 62, { size: 22, weight: 900 });
      if (!f.junk) { this.text(`${F.size} cm · ${RARITY[f.r]}`, x + 140, yy + 90, { size: 14, col: RARITY_COL[f.r] }); this.text(`Worth ~${f.value} coins`, x + 140, yy + 114, { size: 13, col: C.gold }); }
      this.g.globalAlpha = 1; }
  }
  drawFishIcon(f, x, y, w) { const g = this.g; const h = w * 0.42; const col = f.col || ['#888', '#aaa', '#555']; g.save(); g.translate(x, y);
    if (f.junk) { this.emoji((ITEMS[f.id] || {}).icon || '👢', 0, 0, w * 0.5); g.restore(); return; }
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, col[2] || col[0]); gr.addColorStop(0.45, col[0]); gr.addColorStop(1, col[1] || col[0]);
    g.beginPath(); g.moveTo(-w * 0.45, 0); g.quadraticCurveTo(-w * 0.1, -h * 0.75, w * 0.3, -h * 0.12); g.lineTo(w * 0.48, -h * 0.45); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.48, h * 0.45); g.lineTo(w * 0.3, h * 0.12); g.quadraticCurveTo(-w * 0.1, h * 0.75, -w * 0.45, 0); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.stroke();
    if (f.pat === 'bars') { g.globalAlpha = 0.35; g.fillStyle = '#111'; for (let i = 0; i < 5; i++) g.fillRect(-w * 0.25 + i * w * 0.1, -h * 0.35, w * 0.035, h * 0.7); g.globalAlpha = 1; }
    if (f.pat === 'spots') { g.fillStyle = 'rgba(20,20,20,0.5)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(-w * 0.25 + (i * 37 % 50) / 100 * w, -h * 0.25 + (i * 23 % 40) / 100 * h, w * 0.015, 0, 7); g.fill(); } }
    if (f.pat === 'stripe') { g.fillStyle = 'rgba(255,90,120,0.55)'; g.fillRect(-w * 0.35, -h * 0.05, w * 0.62, h * 0.1); }
    g.beginPath(); g.arc(-w * 0.32, -h * 0.08, w * 0.03, 0, 7); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.arc(-w * 0.32, -h * 0.08, w * 0.016, 0, 7); g.fillStyle = '#111'; g.fill(); g.restore(); }
  drawSkip() { const K = S.G.skip; const cx = this.w / 2, y = this.h - (this.touch ? 200 : 140), w = Math.min(320, this.w - 60);
    if (K.st === 'aim') { this.rr(cx - w / 2 - 14, y - 36, w + 28, 74, 14, 'rgba(14,18,16,0.8)'); this.text(this.touch ? 'Tap GRAB when the needle is in the gold!' : 'Press E / Space when the needle is in the gold!', cx, y - 18, { size: 13.5, align: 'center', weight: 700 });
      this.bar(cx - w / 2, y + 4, w, 16, 1, 'rgba(255,255,255,0.15)'); this.g.fillStyle = 'rgba(255,210,60,0.85)'; this.g.fillRect(cx - w / 2 + w * 0.62, y + 4, w * 0.2, 16); this.g.fillStyle = '#fff'; this.g.fillRect(cx - w / 2 + w * K.needle - 2, y, 4, 24); }
    else this.text(`${K.hop || 0} skip${K.hop === 1 ? '' : 's'}!`, cx, y, { size: 30, align: 'center', weight: 900, col: C.gold, stroke: 5 }); }
  // ---------- map
  buildMap() { const N = 320, E = 160, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const im = g.createImageData(N, N); const d = im.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -E + (i + 0.5) / N * 2 * E, z = -E + (j + 0.5) / N * 2 * E; const h = W.H(x, z); let r, gg, b;
      if (h < -0.25 && W.waterRegion(x, z)) { const k = clamp(-h / 5, 0, 1); r = lerp(110, 40, k); gg = lerp(185, 105, k); b = lerp(205, 160, k); }
      else { const sh = clamp((W.H(x + 2, z - 2) - h) * 0.12, -0.25, 0.25); if (h > W.SNOW_Y) { r = 235; gg = 238; b = 240; } else if (h > 14) { const k = clamp((h - 14) / 20, 0, 1); r = lerp(110, 150, k); gg = lerp(120, 140, k); b = lerp(85, 125, k); } else if (h < 0.6) { r = 214; gg = 196; b = 150; } else { r = 104 + h * 2; gg = 148 + h; b = 74; }
        if (W.roadDist(x, z) < 2.6) { r = 196; gg = 176; b = 132; } else if (W.trailDist(x, z) < 1.3) { r = 170; gg = 140; b = 96; } r *= 1 - sh; gg *= 1 - sh; b *= 1 - sh; }
      if (W.deckAt(x, z)) { r = 150; gg = 106; b = 64; } const o = (j * N + i) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255; }
    g.putImageData(im, 0, 0); g.fillStyle = 'rgba(30,70,35,0.55)'; for (const t of W.TREES) { if (Math.abs(t.x) > E || Math.abs(t.z) > E) continue; g.beginPath(); g.arc((t.x + E) / (2 * E) * N, (t.z + E) / (2 * E) * N, (0.9 * t.s + 0.3) * N / 170, 0, 7); g.fill(); } const k = N / (2 * E); g.fillStyle = '#8a5a3a'; for (const b of W.COLS) if (b.k === 'b' && b.h >= 1.8) { g.save(); g.translate((b.x + E) * k, (b.z + E) * k); g.transform(b.c, b.s, -b.s, b.c, 0, 0); g.fillRect(-b.hw * k, -b.hd * k, 2 * b.hw * k, 2 * b.hd * k); g.restore(); }
    this.mapImg = c; this.mapE = E; }
  mapLabels() { const L = W.LOC; return [[L.storeDoor, '🏪', 'Store', 1], [L.tradeDoor, '🔄', 'Trading Post', -1], [L.rangerDoor, '🏕️', 'Ranger Station', -1], [L.camp, '⛺', 'Campground'], [L.home, '🌲', 'Tree Fort'], [L.dockEnd, '⚓', 'Dock'], [L.beach, '🏖️', 'Beach'], [{ x: W.LAKE.x - 6, z: W.LAKE.z - 12 }, '', 'Lake Pinecrest']].filter(a => a[0]); }
  drawMapView(x, y, w, h, full, across) { const G = S.G, g = this.g; if (!this.mapImg) this.buildMap(); const E = this.mapE; const s = Math.min(w, h) / (across || 2 * E / (this.mapZoom || 1)); const cx = x + w / 2, cy = y + h / 2; const ox = full ? (this.mapCx || 0) : G.p.x, oz = full ? (this.mapCz || 0) : G.p.z;
    const P = (wx, wz) => [cx + (wx - ox) * s, cy + (wz - oz) * s]; g.save(); g.beginPath(); g.roundRect(x, y, w, h, full ? 12 : w / 2); g.clip(); g.fillStyle = '#4a6a4a'; g.fillRect(x, y, w, h); g.imageSmoothingEnabled = true; const [ix, iy] = P(-E, -E); g.drawImage(this.mapImg, ix, iy, 2 * E * s, 2 * E * s);
    if (full || s > 0) { for (const [p, ic, name, up] of this.mapLabels()) { const [px, py] = P(p.x, p.z); if (ic) this.emoji(ic, px, py, full ? 20 : 14); if (full) this.text(name, px, py + (up === -1 ? -20 : 18), { size: 12.5, align: 'center', weight: 800, stroke: 3, strokeCol: '#20180c', shadow: false }); } }
    const qt = S.questTarget(); if (qt) { const [qx, qy] = P(qt.x, qt.z); g.beginPath(); g.arc(qx, qy, 7 + Math.sin(this.t * 5) * 2, 0, 7); g.strokeStyle = C.gold; g.lineWidth = 3; g.stroke(); this.text('★', qx, qy, { size: 13, align: 'center', col: C.gold, shadow: false }); }
    for (const n of G.npcs) if (n.kind === 'ranger' && n.visible !== false) { const [nx, ny] = P(n.x, n.z); g.beginPath(); g.arc(nx, ny, 5, 0, 7); g.fillStyle = n.state === 'chase' ? '#ff3b2f' : '#2f7a3a'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    const [px, py] = P(G.p.x, G.p.z); g.save(); g.translate(px, py); g.rotate(G.p.rot + Math.PI / 2); g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fillStyle = '#ff5a3a'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.restore();
    g.restore(); }
  drawMinimap() { const r = 70, x = this.w - 12 - r * 2, y = 10 + 38 + 22 + (this.safeTop || 0); this.rr(x - 4, y - 4, r * 2 + 8, r * 2 + 8, r + 4, 'rgba(18,24,20,0.7)', 'rgba(255,240,200,0.25)');
    this.drawMapView(x, y, r * 2, r * 2, false, 90); this.hit(x, y, r * 2, r * 2, () => this.openUI('map'), { nav: false }); this.text('N', x + r, y + 9, { size: 11, align: 'center', weight: 900, col: '#fff', stroke: 3, shadow: false }); }
  // ---------- touch controls
  drawTouch() { const G = S.G, g = this.g; const sr = this.safeRight || 0, sb = this.safeBottom || 0; const bx = this.w - 92 - sr, by = this.h - 96 - sb; const ctx = S.getCtx(); this.ctxLabel = ctx ? ctx.label : null;
    const B = (id, x, y, r, label, icon, on) => { this.btns.push({ id, x, y, r }); const pr = this.pressedBtns && this.pressedBtns.has(id); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = on ? 'rgba(255,214,90,0.55)' : pr ? 'rgba(255,255,255,0.45)' : 'rgba(20,26,22,0.45)'; g.fill(); g.strokeStyle = on ? '#ffe08a' : 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.stroke();
      if (icon) this.emoji(icon, x, y - (label ? r * 0.18 : 0), r * 0.62); if (label) this.text(label, x, y + (icon ? r * 0.48 : 0), { size: icon ? 10.5 : 13, align: 'center', weight: 900, col: '#fff', stroke: 3, strokeCol: 'rgba(0,0,0,0.6)', shadow: false }); };
    const actLabel = G.fish ? (G.fish.st === 'reel' ? 'REEL' : G.fish.st === 'aim' ? 'CAST' : 'HOOK') : G.skip ? 'THROW' : ctx ? ctx.short || (ctx.k === 'npc' ? 'TALK' : ctx.k === 'hide' ? 'HIDE' : ctx.k === 'food' ? 'GRAB' : 'USE') : null;
    B('act', bx, by, 44, actLabel || 'GRAB', ctx ? (ctx.icon || '✋') : '✋', !!ctx); B('jump', bx - 96, by + 22, 32, 'JUMP', '⤴️'); B('sneak', bx - 74, by - 70, 32, 'SNEAK', '🤫', G.p.crouch); B('fish', bx + 6, by - 100, 32, 'FISH', '🎣', !!G.fish);
    if (G.owned.bike) B('bike', bx - 140, by - 34, 28, 'BIKE', '🚲', G.p.bike);
    if (ctx && !G.fish) { this.font(14, 700); const w = g.measureText(ctx.label).width + 28; const x = Math.min(this.w - w - 10, bx - w / 2), y = by - 170; this.rr(x, y, w, 30, 15, 'rgba(14,18,16,0.82)', 'rgba(255,230,160,0.4)'); this.text(ctx.label, x + w / 2, y + 15, { size: 14, align: 'center', weight: 700 }); }
    // joystick
    const st = this.stick; const sx = st && st.active ? st.ox : 100 + (this.safeLeft || 0), sy = st && st.active ? st.oy : this.h - 110 - sb; g.globalAlpha = st && st.active ? 0.9 : 0.45; g.beginPath(); g.arc(sx, sy, 58, 0, 7); g.fillStyle = 'rgba(20,26,22,0.35)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.stroke();
    const kx = st && st.active ? sx + st.dx * 58 : sx, ky = st && st.active ? sy + st.dy * 58 : sy; g.beginPath(); g.arc(kx, ky, 26, 0, 7); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill(); g.globalAlpha = 1;
    if (!st || !st.active) this.text('MOVE', sx, sy + 76, { size: 10.5, align: 'center', weight: 800, col: 'rgba(255,255,255,0.7)' }); }
  // ---------- lists & nav
  list(x, y, w, h, n, rh, rowFn) { const g = this.g; const max = Math.max(0, n * rh - h); const key = 'L' + Math.round(x) + ':' + Math.round(y); if (this.listKey !== key) { this.listKey = key; } this.scroll = clamp(this.scroll, 0, max);
    const base = this.navList.length; if (this.navKbd && this.sel >= base) { const ri = this.rowOfSel ? this.rowOfSel(this.sel - base) : this.sel - base; if (ri < n) { const top = ri * rh, bot = top + rh; if (top < this.scroll) this.scroll = top; if (bot > this.scroll + h) this.scroll = bot - h; } }
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); this.clip = [x, y, w, h]; for (let i = 0; i < n; i++) { const ry = y + i * rh - this.scroll; if (ry + rh < y - rh || ry > y + h + rh) { this.navSkip(i, rowFn); continue; } rowFn(i, x, ry, w, rh); } this.clip = null; g.restore();
    if (max > 0) { const th = Math.max(30, h * h / (n * rh)); const ty = y + (h - th) * (this.scroll / max); this.rr(x + w - 5, y, 4, h, 2, 'rgba(255,255,255,0.08)'); this.rr(x + w - 5, ty, 4, th, 2, 'rgba(255,255,255,0.45)'); }
    this.hit(x, y, w, h, null, { block: true, scrollArea: true }); }
  navSkip(i, rowFn) { const g = this.g; const sv = g.globalAlpha; this.skipDraw = true; g.globalAlpha = 0; rowFn(i, -9999, -9999, 10, 10); g.globalAlpha = sv; this.skipDraw = false; }
  nav(ui) { const L = this.navList || []; if (!L.length) return; if (ui.up || ui.left) { this.sel = (this.sel - 1 + L.length) % L.length; this.navKbd = true; } if (ui.down || ui.right) { this.sel = (this.sel + 1) % L.length; this.navKbd = true; } if (ui.ok && L[this.sel]) { L[this.sel](); this.cb.sfx && this.cb.sfx('click'); } }
  tabs(x, y, names, cur, fn) { let xx = x; for (let i = 0; i < names.length; i++) { this.font(13.5, 800); const w = this.g.measureText(names[i]).width + 24; this.button(xx, y, w, 30, names[i], () => { fn(i); this.scroll = 0; }, { r: 15, size: 13.5, col: i === cur ? '#b8862c' : 'rgba(255,255,255,0.08)', hi: i === cur ? '#c8963c' : 'rgba(255,255,255,0.16)', nav: false }); xx += w + 6; } return xx; }
  menuBox(wMax, hMax) { const w = Math.min(wMax, this.w - 20), h = Math.min(hMax, this.h - 20 - (this.safeTop || 0)); return [Math.round(this.w / 2 - w / 2), Math.round((this.h - h) / 2 + (this.safeTop || 0) / 2), w, h]; }
  // ---------- sim menus
  drawSimMenu(m) { const G = S.G; this.g.fillStyle = 'rgba(0,0,0,0.35)'; this.g.fillRect(0, 0, this.w, this.h); this.hit(0, 0, this.w, this.h, null, { block: true });
    if (m.k === 'dialog') return this.drawDialog(m.d);
    if (m.k === 'shop') return this.drawShop(m); if (m.k === 'sell') return this.drawSell(m); if (m.k === 'trade') return this.drawTrade(m); if (m.k === 'chest') return this.drawChest(m); if (m.k === 'cook') return this.drawCook(m); }
  drawDialog(d) { const w = Math.min(640, this.w - 20); const textL = this.wrap(d.text, w - 150, 16, 500); const oh = d.opts.length * 46; const h = 70 + textL.length * 22 + oh + 18; const x = this.w / 2 - w / 2, y = this.h - h - 14 - (this.safeBottom || 0);
    this.panel(x, y, w, h, null); const nd = NPCS[d.npc]; const col = nd && nd.shirt != null ? '#' + nd.shirt.toString(16).padStart(6, '0') : '#5a7a4a'; this.g.beginPath(); this.g.arc(x + 54, y + 52, 36, 0, 7); this.g.fillStyle = col; this.g.fill(); this.g.lineWidth = 3; this.g.strokeStyle = '#fff1cf'; this.g.stroke(); this.emoji(PORTRAIT[d.npc] || (nd ? (nd.kid ? '🧒' : '🏕️') : '🌲'), x + 54, y + 52, 36);
    this.text(d.name, x + 106, y + 26, { size: 19, weight: 900, col: '#fff1cf' }); if (d.role) this.text(d.role, x + 106 + this.g.measureText(d.name).width + 10, y + 27, { size: 13, col: C.dim, weight: 600 });
    textL.forEach((l, i) => this.text(l, x + 106, y + 54 + i * 22, { size: 16, weight: 500 })); let yy = y + 66 + textL.length * 22;
    d.opts.forEach((o, i) => { this.button(x + 106, yy, w - 122, 38, `${this.touch ? '' : (i + 1) + '.  '}${o.label}`, () => S.act(o.a, o.arg, o), { col: o.a === 'close' ? 'rgba(255,255,255,0.08)' : C.btn, size: 15, left: true }); yy += 46; }); }
  drawShop(m) { const G = S.G; const [x, y, w, h] = this.menuBox(720, 560); this.panel(x, y, w, h, "🏪 Hollis's General Store"); const cats = [...new Set(SHOP.map(s => s.cat))]; const ti = clamp(m.tab | 0, 0, cats.length - 1);
    this.coin(x + w - 110, y + 23, 9); this.text(String(G.coins), x + w - 96, y + 23, { size: 16, weight: 900, col: C.gold });
    this.tabs(x + 14, y + 56, cats, ti, i => { m.tab = i; }); const items = SHOP.filter(s => s.cat === cats[ti]); const top = y + 98;
    this.list(x + 10, top, w - 20, y + h - top - 12, items.length, 70, (i, rx, ry, rw, rh) => { const s = items[i]; const own = S.owns(s.id); const can = S.canBuy(s.id); if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 12, 'rgba(255,255,255,0.05)'); this.emoji(s.icon, rx + 36, ry + rh / 2, 30); this.text(s.name, rx + 66, ry + 23, { size: 16, weight: 800 }); this.text(s.desc, rx + 66, ry + 46, { size: 13, col: C.dim, weight: 500 }); }
      const bw = 112, bx = rx + rw - bw - 16, by = ry + 15; const eq = (s.kind === 'disguise' || s.kind === 'lure') && own;
      if (eq) this.button(bx, by, bw, 40, (G.equip.disguise === s.id || G.equip.lure === s.id) ? 'Unequip' : 'Equip', () => S.equip(s.id), { size: 14, col: '#2f5a7a', hi: '#3f7aa0' });
      else if (own) { this.navStub(); if (!this.skipDraw) this.text('✓ Owned', bx + bw / 2, by + 20, { size: 14, align: 'center', col: C.green, weight: 800 }); }
      else this.button(bx, by, bw, 40, `${s.price}`, () => S.buy(s.id), { dis: !can, size: 15, coin: true }); }); }
  navStub() { this.navList.push(() => { }); }
  drawSell(m) { const G = S.G; const who = m.who || 'hollis'; const [x, y, w, h] = this.menuBox(640, 560); this.panel(x, y, w, h, who === 'willa' ? "🔄 Sell to Willa" : '🏪 Sell to Mr. Hollis'); let top = y + 56;
    if (who === 'willa' && G.willaRates) { const r = G.willaRates; const hot = r.hot ? (ITEMS[r.hot] ? ITEMS[r.hot].name : FISH_BY_ID[r.hot] ? FISH_BY_ID[r.hot].name : r.hot) : ''; this.text(`Today: fish ×${r.fish} · snacks ×${r.food} · treasures ×${r.collectible} · 🔥 HOT: ${hot} ×2.5`, x + 18, top + 10, { size: 13, col: C.gold, weight: 700 }); top += 26; }
    const sellable = G.inv.map((it, i) => [it, i]).filter(([it]) => S.sellPrice(it, who) > 0 && ['fish', 'junk'].includes(S.itemCat(it))); const tot = sellable.reduce((a, [it]) => a + S.sellPrice(it, who), 0);
    this.button(x + 14, top, 240, 36, `Sell all fish & junk (${tot})`, () => { for (const [, i] of sellable.slice().reverse()) S.sell(i, who); }, { dis: !sellable.length, size: 14 }); this.text(`🎒 ${G.inv.length}/${G.slots}`, x + w - 20, top + 18, { size: 14, align: 'right', col: C.dim }); top += 46;
    if (!G.inv.length) { this.text('Your backpack is empty. Go fishing or find treasures!', x + w / 2, top + 40, { size: 15, align: 'center', col: C.dim }); this.navStub(); return; }
    this.list(x + 10, top, w - 20, y + h - top - 12, G.inv.length, 56, (i, rx, ry, rw, rh) => { const it = G.inv[i]; if (!it) return; const pr = S.sellPrice(it, who); if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 10, 'rgba(255,255,255,0.05)'); this.emoji(itemIcon(it), rx + 30, ry + rh / 2, 26); this.text(S.itemName(it) + (it.fish ? `  ${it.fish.size} cm` : ''), rx + 58, ry + rh / 2, { size: 15, weight: 700 }); }
      this.button(rx + rw - 128, ry + 9, 110, 38, pr ? `Sell ${pr}` : 'Keep', () => S.sell(i, who), { dis: !pr, size: 14 }); }); }
  drawTrade(m) { const G = S.G; const [x, y, w, h] = this.menuBox(680, 520); this.panel(x, y, w, h, "🔄 Willa's Trading Post"); this.text('Trades change every day. Bring what she asks for!', x + 18, y + 66, { size: 13.5, col: C.dim }); this.button(x + w - 170, y + 52, 156, 32, 'Sell to Willa →', () => { G.menu = { k: 'sell', who: 'willa' }; this.scroll = 0; }, { size: 13.5, col: '#6a4a2a', hi: '#8a6a3a' });
    const top = y + 94; this.list(x + 10, top, w - 20, y + h - top - 12, G.trades.length, 70, (i, rx, ry, rw, rh) => { const o = G.trades[i]; const can = S.canTrade(i); if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 12, o.used ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)'); this.text('Give: ' + S.tradeGiveLabel(o), rx + 18, ry + 23, { size: 14.5, weight: 700, col: o.used ? C.dim : C.text }); this.text('Get:  ' + S.tradeGetLabel(o), rx + 18, ry + 47, { size: 14.5, weight: 800, col: o.used ? C.dim : C.gold }); }
      if (o.used) { this.navStub(); if (!this.skipDraw) this.text('Done ✓', rx + rw - 80, ry + rh / 2, { size: 14, align: 'center', col: C.green, weight: 800 }); } else this.button(rx + rw - 134, ry + 15, 112, 40, 'Trade', () => S.trade(i), { dis: !can, size: 15 }); }); }
  drawChest(m) { const G = S.G; const [x, y, w, h] = this.menuBox(760, 540); this.panel(x, y, w, h, '🧰 Hideout Chest'); const cw = (w - 36) / 2, top = y + 86;
    this.text(`Backpack ${G.inv.length}/${G.slots} — tap to store`, x + 14, y + 66, { size: 13.5, col: C.dim, weight: 700 }); this.text(`Chest ${G.chest.length}/40 — tap to take`, x + 22 + cw, y + 66, { size: 13.5, col: C.dim, weight: 700 });
    const row = (arr, fn) => (i, rx, ry, rw, rh) => { const it = arr[i]; if (!it) return; this.button(rx + 2, ry + 3, rw - 12, rh - 6, S.itemName(it) + (it.fish ? ` ${it.fish.size}cm` : ''), () => fn(i), { icon: itemIcon(it), size: 14, col: 'rgba(255,255,255,0.07)', hi: 'rgba(255,255,255,0.16)' }); };
    this.list(x + 10, top, cw, y + h - top - 12, G.inv.length, 50, row(G.inv, S.chestPut)); this.list(x + 22 + cw, top, cw, y + h - top - 12, G.chest.length, 50, row(G.chest, S.chestTake)); }
  drawCook(m) { const G = S.G; const [x, y, w, h] = this.menuBox(600, 500); this.panel(x, y, w, h, '🔥 Campfire Cooking'); const top = y + 60;
    this.list(x + 10, top, w - 20, y + h - top - 12, RECIPES.length, 66, (i, rx, ry, rw, rh) => { const r = RECIPES[i]; const can = S.canCook(r); if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 12, 'rgba(255,255,255,0.05)'); this.emoji((ITEMS[r.id] || {}).icon || '🍳', rx + 34, ry + rh / 2, 28); this.text(r.name, rx + 62, ry + 22, { size: 16, weight: 800 }); this.text(r.desc, rx + 62, ry + 45, { size: 13, col: C.dim }); }
      this.button(rx + rw - 128, ry + 13, 110, 40, 'Cook', () => S.cook(r.id), { dis: !can, size: 15 }); }); }
  // ---------- HUD-owned screens
  drawUI() { this.g.fillStyle = 'rgba(0,0,0,0.4)'; this.g.fillRect(0, 0, this.w, this.h); this.hit(0, 0, this.w, this.h, null, { block: true }); const k = this.ui;
    if (k === 'inv') this.drawInv(); else if (k === 'map') this.drawMap(); else if (k === 'quests') this.drawQuests(); else if (k === 'journal') this.drawJournal(); else if (k === 'pause') this.drawPause(); else if (k === 'help') this.drawHelp(); }
  drawInv() { const G = S.G; const [x, y, w, h] = this.menuBox(720, 560); this.panel(x, y, w, h, `🎒 Backpack  ${G.inv.length}/${G.slots}`); const tabs = ['Items', 'Gear']; this.tabs(x + 14, y + 56, tabs, this.tab, i => this.tab = i); const top = y + 98;
    if (this.tab === 0) { if (!G.inv.length) { this.text('Empty! Grab snacks, catch fish, find treasures.', x + w / 2, top + 50, { size: 15, align: 'center', col: C.dim }); this.navStub(); return; }
      this.list(x + 10, top, w - 20, y + h - top - 12, G.inv.length, 56, (i, rx, ry, rw, rh) => { const it = G.inv[i]; if (!it) return; const cat = S.itemCat(it); if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 10, 'rgba(255,255,255,0.05)'); this.emoji(itemIcon(it), rx + 30, ry + rh / 2, 26); this.text(S.itemName(it), rx + 58, ry + 20, { size: 15, weight: 800, col: it.fish ? RARITY_COL[FISH_BY_ID[it.fish.sp].r] : C.text }); this.text(`${cat}${it.fish ? ' · ' + it.fish.size + ' cm' : ''} · worth ${S.itemValue(it)}`, rx + 58, ry + 39, { size: 12.5, col: C.dim }); }
        const keep = ITEMS[it.id] && ITEMS[it.id].keep; this.button(rx + rw - 110, ry + 9, 92, 38, keep ? 'Keep' : 'Drop', () => { this.confirm = { text: `Drop ${S.itemName(it)}?`, yes: () => S.drop(G.inv.indexOf(it)) }; }, { dis: !!keep, size: 14, col: '#6a3a2a', hi: '#8a4a34' }); }); return; }
    const gear = [{ icon: '🎣', name: G.owned.rod ? RODS[G.owned.rod].name : 'No rod yet', sub: G.owned.rod ? `Tier ${G.owned.rod}` : 'Talk to Old Gus on the dock' }, { icon: '🪱', name: `Bait: ${G.bait} worms`, sub: 'Bites come faster with bait' }];
    for (const s of SHOP) if ((s.kind === 'lure' || s.kind === 'disguise' || s.kind === 'travel' || s.id === 'bike' || s.id === 'canoe') && S.owns(s.id)) gear.push({ icon: s.icon, name: s.name, sub: s.desc, id: s.id, eq: s.kind === 'lure' || s.kind === 'disguise', on: G.equip.lure === s.id || G.equip.disguise === s.id || (s.id === 'bike' && G.p.bike) });
    this.list(x + 10, top, w - 20, y + h - top - 12, gear.length, 62, (i, rx, ry, rw, rh) => { const o = gear[i]; if (!this.skipDraw) { this.rr(rx + 2, ry + 3, rw - 12, rh - 6, 10, o.on ? 'rgba(255,210,90,0.16)' : 'rgba(255,255,255,0.05)'); this.emoji(o.icon, rx + 32, ry + rh / 2, 28); this.text(o.name, rx + 62, ry + 21, { size: 15.5, weight: 800 }); this.text(o.sub, rx + 62, ry + 42, { size: 12.5, col: C.dim }); }
      if (o.eq) this.button(rx + rw - 124, ry + 11, 106, 40, o.on ? 'Unequip' : 'Equip', () => S.equip(o.id), { size: 14, col: '#2f5a7a', hi: '#3f7aa0' }); else if (o.id === 'bike') this.button(rx + rw - 124, ry + 11, 106, 40, G.p.bike ? 'Hop off' : 'Ride (R)', () => { S.toggleBike(); this.ui = null; }, { size: 14 }); else this.navStub(); }); }
  drawMap() { const [x, y, w, h] = this.menuBox(900, 700); this.panel(x, y, w, h, '🗺️ Pinecrest National Park'); const mx = x + 12, my = y + 54, mw = w - 24, mh = h - 66; if (this.mapCx === undefined) { const sm = mh < 460; this.mapCx = sm ? clamp(S.G.p.x, -90, 90) : 0; this.mapCz = sm ? clamp(S.G.p.z, -90, 90) : 10; this.mapZoom = sm ? 2 : 1.15; }
    this.drawMapView(mx, my, mw, mh, true); this.hit(mx, my, mw, mh, null, { block: true });
    this.button(x + w - 92, y + h - 56, 36, 36, '+', () => this.mapZoom = Math.min(4, this.mapZoom * 1.4), { size: 20, nav: false }); this.button(x + w - 50, y + h - 56, 36, 36, '−', () => this.mapZoom = Math.max(1, this.mapZoom / 1.4), { size: 20, nav: false });
    this.button(x + 22, y + h - 56, 100, 36, 'Center', () => { this.mapCx = S.G.p.x; this.mapCz = S.G.p.z; }, { size: 14 }); this.text('Drag to pan', x + 134, y + h - 38, { size: 12, col: C.dim }); }
  panMap(dx, dy) { const E = this.mapE || 160; const [, , w, h] = this.menuBox(900, 700); const s = Math.min(w - 24, h - 66) / (2 * E) * (this.mapZoom || 1); this.mapCx = clamp((this.mapCx || 0) - dx / s, -E, E); this.mapCz = clamp((this.mapCz || 0) - dy / s, -E, E); }
  drawQuests() { const G = S.G; const [x, y, w, h] = this.menuBox(700, 580); this.panel(x, y, w, h, '📜 Adventure Log'); this.tabs(x + 14, y + 56, ['Story', 'Side Quests', 'Stats'], this.tab, i => this.tab = i); const top = y + 98; const rows = [];
    if (this.tab === 0) { CHAPTERS.forEach((ch, ci) => { if (ci > G.quest.ch && !G.quest.done) { rows.push({ h: 34, t: `🔒 ${ch.title}`, col: C.dim, size: 15 }); return; } rows.push({ h: 38, t: ch.title, col: C.gold, size: 17, w: 900 }); ch.steps.forEach((s, si) => { const done = G.quest.done || ci < G.quest.ch || si < G.quest.step; const cur = !G.quest.done && ci === G.quest.ch && si === G.quest.step; if (!done && !cur) return; rows.push({ h: cur ? 50 : 28, t: (done ? '✅ ' : '➡️ ') + s.t, sub: cur ? s.hint : null, col: done ? C.dim : C.text, size: 14.5 }); }); }); }
    else if (this.tab === 1) { for (const [id, q] of Object.entries(SIDE_QUESTS)) { const st = G.side[id]; const giver = NPCS[q.giver] ? NPCS[q.giver].name : q.giver; rows.push({ h: 52, t: (st === 'done' ? '✅ ' : st === 'active' ? '➡️ ' : '❔ ') + q.title, sub: st ? q.t + (st === 'active' ? '' : '') : `Talk to ${giver} to start`, col: st === 'done' ? C.dim : C.text, size: 15 }); } }
    else { const s = G.stats; const caught = Object.keys(G.journal).length; const ac = Object.keys(G.acorns).length; for (const [k, v] of [['Day', G.day], ['Coins', G.coins], ['Snacks grabbed', s.grabs], ['Fish caught', s.fishCaught], ['Species found', `${caught}/${SPECIES.length}`], ['Golden Acorns', `${ac}/${W.ACORNS.length}`], ['Treasures found', Object.keys(G.finds).length + '/' + W.FINDS.length], ['Best stone skip', s.skipBest], ['Trades made', s.trades], ['Meals cooked', s.cooked], ['Times spotted', s.spotted], ['Times caught', s.caught]]) rows.push({ h: 32, t: k, r: String(v), size: 15 }); }
    let acc = 0; const offs = rows.map(r => (acc += r.h) - r.h); this.listVar(x + 10, top, w - 20, y + h - top - 12, rows, offs, acc, (r, rx, ry, rw) => { this.text(r.t, rx + 16, ry + (r.sub ? 16 : r.h / 2), { size: r.size, weight: r.w || 700, col: r.col || C.text }); if (r.sub) this.text(r.sub, rx + 44, ry + 36, { size: 12.5, col: C.dim }); if (r.r) this.text(r.r, rx + rw - 24, ry + r.h / 2, { size: 15, align: 'right', weight: 800, col: C.gold }); }); this.navStub(); }
  listVar(x, y, w, h, rows, offs, total, fn) { const g = this.g; const max = Math.max(0, total - h); this.scroll = clamp(this.scroll, 0, max); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); rows.forEach((r, i) => { const ry = y + offs[i] - this.scroll; if (ry > y + h || ry + r.h < y) return; fn(r, x, ry, w); }); g.restore(); if (max > 0) { const th = Math.max(30, h * h / total); this.rr(x + w - 5, y + (h - th) * this.scroll / max, 4, th, 2, 'rgba(255,255,255,0.45)'); } this.hit(x, y, w, h, null, { block: true }); }
  hintLines(t, x, y, w, col) { const L = this.wrap(t, w, 11, 500); const two = L.length > 1; L.slice(0, 2).forEach((l, i) => this.text(l, x, y + (two ? i * 12 - 1 : 0), { size: 11, align: 'center', col })); }
  drawJournal() { const G = S.G; const [x, y, w, h] = this.menuBox(780, 600); const n = Object.keys(G.journal).length; this.panel(x, y, w, h, `🐟 Fish Journal  ${n}/${SPECIES.length}`); const top = y + 58; const cols = Math.max(1, Math.floor((w - 20) / 180)); const cw = (w - 30) / cols; const rowsN = Math.ceil(SPECIES.length / cols);
    this.list(x + 10, top, w - 20, y + h - top - 12, rowsN, 132, (ri, rx, ry, rw, rh) => { if (this.skipDraw) { this.navStub(); return; } for (let c = 0; c < cols; c++) { const f = SPECIES[ri * cols + c]; if (!f) continue; const j = G.journal[f.id]; const cx = rx + c * cw; this.rr(cx + 3, ry + 4, cw - 8, rh - 8, 12, j ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.25)', j ? RARITY_COL[f.r] + '66' : null);
        if (j) { this.drawFishIcon(f, cx + cw / 2, ry + 40, Math.min(110, cw - 30)); this.text(f.name, cx + cw / 2, ry + 78, { size: 14, align: 'center', weight: 800, col: RARITY_COL[f.r] }); this.text(`Best ${j.best} cm · ×${j.n}`, cx + cw / 2, ry + 97, { size: 12, align: 'center', col: C.dim }); this.hintLines(f.hint, cx + cw / 2, ry + 112, cw - 20, '#a8b8a0'); }
        else { this.g.globalAlpha = 0.5; this.text('?', cx + cw / 2, ry + 40, { size: 34, align: 'center', weight: 900, col: '#667' }); this.g.globalAlpha = 1; this.text('???', cx + cw / 2, ry + 78, { size: 14, align: 'center', weight: 800, col: C.dim }); this.text(RARITY[f.r], cx + cw / 2, ry + 97, { size: 11.5, align: 'center', col: RARITY_COL[f.r] }); this.hintLines(f.hint, cx + cw / 2, ry + 112, cw - 20, '#8a9488'); } } this.navStub(); }); }
  drawPause() { const [x, y, w, h] = this.menuBox(440, 452); this.panel(x, y, w, h, '⏸️ Paused', { close: true }); const cb = this.cb; let yy = y + 62; const bw = w - 40, bx = x + 20;
    const row = (label, val, dec, inc) => { this.text(label, bx, yy + 20, { size: 15, weight: 700 }); this.button(bx + bw - 170, yy + 2, 40, 36, '−', dec, { size: 18 }); this.text(val, bx + bw - 85, yy + 20, { size: 15, align: 'center', weight: 800, col: C.gold }); this.button(bx + bw - 40, yy + 2, 40, 36, '+', inc, { size: 18 }); yy += 46; };
    this.button(bx, yy, bw, 42, '▶  Resume', () => this.closeMenu(), { size: 16, col: '#3f7a46' }); yy += 54;
    this.button(bx, yy, bw, 38, cb.muted && cb.muted() ? '🔇  Sound: OFF' : '🔊  Sound: ON', () => cb.toggleMute(), { size: 15 }); yy += 48;
    const vol = cb.vol ? cb.vol() : { music: 0.6, sfx: 0.8 }; row('Music', Math.round(vol.music * 10) + '/10', () => cb.setVol('music', -0.1), () => cb.setVol('music', 0.1)); row('Sound FX', Math.round(vol.sfx * 10) + '/10', () => cb.setVol('sfx', -0.1), () => cb.setVol('sfx', 0.1));
    const ql = ['Low', 'Medium', 'High', 'Ultra']; const q = cb.quality ? cb.quality() : 2; row('Graphics', ql[q] || q, () => cb.setQuality(q - 1), () => cb.setQuality(q + 1));
    this.button(bx, yy, (bw - 10) / 2, 38, '🎮  Controls', () => { this.ui = 'help'; this.scroll = 0; }, { size: 14.5 }); this.button(bx + (bw + 10) / 2, yy, (bw - 10) / 2, 38, '💾  Save', () => { if (S.save()) S.toast('Game saved!', '#bff59a', 2); }, { size: 14.5 }); yy += 48;
    this.button(bx, yy, (bw - 10) / 2, 38, '🏠  Title', () => { S.save(); this.ui = null; cb.toTitle && cb.toTitle(); }, { size: 14.5 }); this.button(bx + (bw + 10) / 2, yy, (bw - 10) / 2, 38, '↩  Arcade', () => { S.save(); location.href = '../../index.html'; }, { size: 14.5 }); yy += 50;
    this.text('Progress auto-saves often and when you sleep.', x + w / 2, yy + 8, { size: 12, align: 'center', col: C.dim }); }
  drawHelp() { const [x, y, w, h] = this.menuBox(640, 600); this.panel(x, y, w, h, '🎮 Controls'); const touch = this.touch;
    const rows = touch ? [['Left stick', 'Move (push far to run)'], ['Drag right side', 'Look around · pinch to zoom'], ['GRAB / TALK', 'Context action: grab, talk, hide, sell'], ['SNEAK', 'Toggle sneaking'], ['FISH', 'Cast · hold to reel'], ['JUMP', 'Jump · climb out of water'], ['🎒 📜 🗺️ ⏸️', 'Backpack · quests · map · pause']]
      : [['WASD / Arrows', 'Move'], ['Shift', 'Run'], ['C / Ctrl', 'Sneak (toggle C, hold Ctrl)'], ['E', 'Grab · talk · hide · sell'], ['Space', 'Jump / interact'], ['F', 'Fish (hold to reel)'], ['R', 'Bike on/off'], ['I / Tab', 'Backpack'], ['J', 'Fish journal'], ['M', 'Map'], ['Q', 'Quests'], ['N', 'Mute'], ['P / Esc', 'Pause / close'], ['Mouse drag / wheel', 'Orbit camera / zoom'], ['Gamepad', 'A act · B sneak · X fish · Y bag · Start pause']];
    rows.forEach((r, i) => { const yy = y + 66 + i * 32; if (yy > y + h - 20) return; this.rr(x + 18, yy, 170, 26, 7, 'rgba(255,240,200,0.12)'); this.text(r[0], x + 103, yy + 13, { size: 13.5, align: 'center', weight: 800, col: C.gold }); this.text(r[1], x + 204, yy + 13, { size: 14.5 }); }); this.navStub(); }
  drawConfirm() { const c = this.confirm; const w = Math.min(360, this.w - 30), h = 140, x = this.w / 2 - w / 2, y = this.h / 2 - h / 2; this.hit(0, 0, this.w, this.h, null, { block: true }); this.panel(x, y, w, h, null); this.text(c.text, x + w / 2, y + 42, { size: 17, align: 'center', weight: 800 });
    this.navList = []; this.button(x + 20, y + 80, (w - 50) / 2, 40, 'Yes', () => { this.confirm = null; c.yes(); }, { col: '#8a3a2a', hi: '#a84a34' }); this.button(x + 30 + (w - 50) / 2, y + 80, (w - 50) / 2, 40, 'No', () => this.confirm = null); }
  // ---------- title / loading / intro
  logo(cx, cy, s) { const g = this.g; g.save(); g.translate(cx, cy); g.scale(s, s);
    // wooden plank sign
    g.save(); g.rotate(-0.025); const pw = 470, ph = 150; g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(-pw / 2 + 6, -ph / 2 + 10, pw, ph, 22); g.fill();
    const wood = g.createLinearGradient(0, -ph / 2, 0, ph / 2); wood.addColorStop(0, '#a8743e'); wood.addColorStop(0.5, '#8a5a2c'); wood.addColorStop(1, '#6a4220'); g.fillStyle = wood; g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph, 22); g.fill(); g.strokeStyle = '#3e2410'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(60,32,12,0.35)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); const yy = -ph / 2 + 22 + i * 27; g.moveTo(-pw / 2 + 14, yy); g.bezierCurveTo(-80, yy + 6, 60, yy - 6, pw / 2 - 14, yy + 2); g.stroke(); }
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * (pw / 2 - 20), -ph / 2 + 20, 6, 0, 7); g.fillStyle = '#c8b090'; g.fill(); g.strokeStyle = '#3e2410'; g.lineWidth = 2; g.stroke(); }
    // leaves on corners
    const leaf = (x, y, r, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke(); g.restore(); };
    leaf(-pw / 2 + 6, -ph / 2 + 4, 26, -0.6, '#4f9a3a'); leaf(-pw / 2 + 30, -ph / 2 - 8, 22, -1.2, '#6ab84a'); leaf(pw / 2 - 4, ph / 2 - 6, 26, 0.5, '#4f9a3a'); leaf(pw / 2 - 30, ph / 2 + 6, 20, 1.1, '#79c255');
    g.restore();
    // title text
    const gold = g.createLinearGradient(0, -60, 0, 10); gold.addColorStop(0, '#fff6b0'); gold.addColorStop(0.5, '#ffd040'); gold.addColorStop(1, '#f08a1a');
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `900 78px ${FONT}`; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#2a1606'; g.strokeText("Jax's", 0, 6); g.fillStyle = gold; g.fillText("Jax's", 0, 6); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.strokeText("Jax's", 0, 4);
    g.font = `900 40px ${FONT}`; g.save(); if (g.letterSpacing !== undefined) g.letterSpacing = '4px'; g.lineWidth = 10; g.strokeStyle = '#163a14'; g.strokeText('ADVENTURES', 0, 54); const grn = g.createLinearGradient(0, 22, 0, 56); grn.addColorStop(0, '#e8ffd0'); grn.addColorStop(1, '#7ad05a'); g.fillStyle = grn; g.fillText('ADVENTURES', 0, 54); g.restore();
    g.restore(); }
  drawLoading() { const g = this.g; const gr = g.createLinearGradient(0, 0, 0, this.h); gr.addColorStop(0, '#16302a'); gr.addColorStop(1, '#0b1a14'); g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h); const s = clamp(Math.min(this.w / 560, this.h / 480), 0.5, 1.2);
    this.logo(this.w / 2, this.h * 0.4, s); const bw = Math.min(360, this.w - 80); this.bar(this.w / 2 - bw / 2, this.h * 0.4 + 120 * s, bw, 12, this.load, '#ffd040'); this.text(this.loadMsg, this.w / 2, this.h * 0.4 + 120 * s + 34, { size: 14, align: 'center', col: C.dim }); }
  drawTitle() { const g = this.g; const gr = g.createLinearGradient(0, 0, 0, this.h); gr.addColorStop(0, 'rgba(0,0,0,0.0)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h);
    const s = clamp(Math.min(this.w / 560, this.h / 560), 0.5, 1.25); const ly = this.h * (this.h < 500 ? 0.27 : 0.3); this.logo(this.w / 2, ly + Math.sin(this.t * 1.4) * 3, s);
    const tg = 'A summer of sneaking, fishing & trading in Pinecrest National Park'; let tsz = clamp(15 * s, 12, 18); this.font(tsz, 700); const tmw = this.g.measureText(tg).width; if (tmw > this.w - 24) tsz = Math.max(9, tsz * (this.w - 24) / tmw); this.text(tg, this.w / 2, ly + 104 * s, { size: tsz, align: 'center', weight: 700, stroke: 4, strokeCol: 'rgba(0,0,0,0.55)', shadow: false });
    const bw = Math.min(300, this.w - 60), bh = this.h < 500 ? 42 : 50; let yy = Math.max(ly + 130 * s, this.h * 0.56); const bx = this.w / 2 - bw / 2; const sp = bh + 12;
    if (this.title.hasSave) { this.button(bx, yy, bw, bh, '▶  Continue', () => this.cb.start(false), { size: 19, col: '#3f8a46', hi: '#4fa858' }); yy += sp; }
    this.button(bx, yy, bw, bh, this.title.hasSave ? '✨  New Adventure' : '▶  Start Adventure', () => { if (this.title.hasSave) this.confirm = { text: 'Start over? Your saved game will be replaced.', yes: () => this.cb.start(true) }; else this.cb.start(true); }, { size: 19, col: this.title.hasSave ? '#5a6a3a' : '#3f8a46', hi: '#4fa858' }); yy += sp;
    this.button(bx, yy, (bw - 10) / 2, bh - 6, '🎮 Controls', () => { this.ui = 'help'; }, { size: 15.5, col: 'rgba(30,40,30,0.85)' }); this.button(bx + (bw + 10) / 2, yy, (bw - 10) / 2, bh - 6, this.cb.muted && this.cb.muted() ? '🔇 Sound' : '🔊 Sound', () => this.cb.toggleMute(), { size: 15.5, col: 'rgba(30,40,30,0.85)' });
    this.text(this.touch ? 'Left stick to move · drag right side to look' : 'WASD move · Shift run · C sneak · E grab · F fish', this.w / 2, this.h - 22 - (this.safeBottom || 0), { size: 13, align: 'center', col: 'rgba(255,255,255,0.85)' });
    if (this.ui === 'help') { this.g.fillStyle = 'rgba(0,0,0,0.5)'; this.g.fillRect(0, 0, this.w, this.h); this.hit(0, 0, this.w, this.h, null, { block: true }); this.navList = []; this.drawHelp(); }
    if (this.confirm) this.drawConfirm(); }
  drawIntro() { const g = this.g; const slides = INTRO; const i = clamp(this.introI, 0, slides.length - 1); const sl = slides[i]; this.introT = (this.introT || 0) + Math.min(this.dt || 0.016, 0.1); const k = clamp(this.introT * 2.5, 0, 1);
    const bar = this.h * 0.11; g.fillStyle = '#000'; g.fillRect(0, 0, this.w, bar); g.fillRect(0, this.h - bar, this.w, bar);
    const w = Math.min(620, this.w - 30); const lines = this.wrap(sl.body, w - 48, this.small ? 15 : 17, 500); const h = 80 + lines.length * (this.small ? 21 : 24) + 34; const x = this.w / 2 - w / 2, y = this.h - bar - h - 16;
    g.globalAlpha = k; this.panel(x, y, w, h, null); this.emoji(sl.icon, x + 40, y + 38, 32); this.text(sl.title, x + 70, y + 38, { size: this.small ? 20 : 24, weight: 900, col: C.gold });
    lines.forEach((l, j) => this.text(l, x + 24, y + 78 + j * (this.small ? 21 : 24), { size: this.small ? 15 : 17, weight: 500 })); this.text(`${this.touch ? 'Tap' : 'Click / Space'} to continue  ·  ${i + 1}/${slides.length}`, x + w - 20, y + h - 18, { size: 12.5, align: 'right', col: C.dim }); g.globalAlpha = 1;
    this.hit(0, 0, this.w, this.h, () => this.nextIntro(), { instant: true }); this.button(this.w - 96 - (this.safeRight || 0), bar + 12, 82, 34, 'Skip ⏭', () => { this.introI = 99; this.nextIntro(); }, { size: 14, col: 'rgba(20,26,22,0.75)', instant: true }); }
  nextIntro() { this.introI++; this.introT = 0; if (this.introI >= INTRO.length) { this.mode = 'play'; this.cb.introDone && this.cb.introDone(); } }
  // keyboard / pad for UI; returns true if UI consumed input this frame
  input(ui) { const G = S.G;
    if (this.mode === 'intro') { if (ui.nav.ok || ui.nav.back || ui.anyKey) this.nextIntro(); return true; }
    if (this.confirm) { if (ui.nav.back) this.confirm = null; else this.nav(ui.nav); return true; }
    if (this.mode === 'title') { if (this.ui === 'help') { if (ui.nav.back || ui.nav.ok) this.ui = null; return true; } this.nav(ui.nav); return true; }
    if (this.mode !== 'play' || !G) return false;
    const open = k => { if (this.ui === k) this.ui = null; else if (!G.menu && !G.fish && !G.caught) this.openUI(k); };
    if (G.menu) { if (ui.nav.back || ui.inv) { this.closeMenu(); return true; } if (G.menu.k === 'dialog' && ui.digits != null) { const o = G.menu.d.opts[ui.digits - 1]; if (o) S.act(o.a, o.arg, o); return true; }
      if (G.menu.k === 'shop' && (ui.nav.tabL || ui.nav.tabR)) { const n = new Set(SHOP.map(s => s.cat)).size; G.menu.tab = ((G.menu.tab | 0) + (ui.nav.tabR ? 1 : -1) + n) % n; this.scroll = 0; } this.nav(ui.nav); return true; }
    if (this.ui) { if (ui.nav.back || ui.pause && this.ui !== 'pause') { this.ui = this.ui === 'help' ? 'pause' : null; return true; } if (ui.pause && this.ui === 'pause') { this.ui = null; return true; }
      if (ui.inv) return open('inv'), true; if (ui.map) return open('map'), true; if (ui.quests) return open('quests'), true; if (ui.journal) return open('journal'), true;
      if (ui.nav.tabL || ui.nav.tabR) { this.tab = Math.max(0, this.tab + (ui.nav.tabR ? 1 : -1)); if (this.tab > (this.ui === 'quests' ? 2 : 1)) this.tab = 0; this.scroll = 0; }
      if (this.ui === 'map') { const p = 6; if (ui.nav.left) this.mapCx -= p * 3; if (ui.nav.right) this.mapCx += p * 3; if (ui.nav.up) this.mapCz -= p * 3; if (ui.nav.down) this.mapCz += p * 3; return true; }
      this.nav(ui.nav); return true; }
    if (ui.pause) { this.openUI('pause'); return true; } if (ui.inv) { open('inv'); return true; } if (ui.map) { open('map'); return true; } if (ui.quests) { open('quests'); return true; } if (ui.journal) { open('journal'); return true; }
    return false; }
}
const PORTRAIT = { gus: '🎣', hollis: '🏪', willa: '🤠', ranger: '🎖️', deputy: '🎖️' };
const INTRO = [
  { icon: '🌲', title: 'Summer at Pinecrest!', body: "Jax's family is camping at Pinecrest National Park for the whole summer. Deep in the woods, Jax found the perfect secret spot: an old tree fort nobody uses." },
  { icon: '🎖️', title: 'One small problem…', body: "Ranger Bramble runs a tight ship. No snack-sneaking, no wandering where you shouldn't, and definitely no raiding other campers' picnics. If he catches you, he'll walk you home and keep what's in your backpack!" },
  { icon: '🎣', title: 'Jax has a plan', body: 'Sneak snacks, catch fish, trade with Willa and buy cool gear at Mr. Hollis\'s store. Fix up the tree fort and throw the greatest campfire party Pinecrest has ever seen.' },
  { icon: '👀', title: 'Stay out of sight', body: 'A yellow ? means someone is getting suspicious. A red ! means RUN! Sneak to stay quiet, and duck into bushes, logs and tents to hide.' },
];
