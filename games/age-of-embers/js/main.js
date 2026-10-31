/* AGE OF EMBERS — application: menus, campaign/skirmish setup, game loop, selection & commands,
   audio/alert routing, save/resume, profile (XP, ranks, achievements, unlocks) and end-of-game stats. */
(function (E) {
  'use strict';
  const D = E.D, U = E.U, S = E.Sprites, C = E.Campaign, UI = E.UI, IC = E.Icons;
  const $ = (q) => document.querySelector(q);
  const MS = () => window.MoodSticker;
  const mood = (k) => { try { MS() && MS().event(k); } catch (e) { } };
  const moodScreen = (k) => { try { MS() && MS().screen && MS().screen(k); } catch (e) { } };
  const isMil = (t) => t !== 'villager' && t !== 'fishboat' && t !== 'deer';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };

  /* ------------------------------------------------------------ profile */
  const RANKS = [[0, 'Villager'], [300, 'Militia'], [800, 'Captain'], [1600, 'Warlord'], [3000, 'Chieftain'], [5000, 'King'], [8000, 'Emperor']];
  const ACH = [
    { id: 'first', n: 'First Flame', d: 'Finish the first campaign mission.', i: '🔥' },
    { id: 'campaign', n: 'Keeper of the Flame', d: 'Complete the whole campaign.', i: '👑' },
    { id: 'win', n: 'Conqueror', d: 'Win a skirmish.', i: '⚔' },
    { id: 'winN', n: 'Steady Hand', d: 'Win a skirmish on Normal or harder.', i: '🛡' },
    { id: 'winH', n: 'Iron Will', d: 'Win a skirmish on Hard or harder.', i: '⚒' },
    { id: 'winL', n: 'Legend', d: 'Win a skirmish on Legendary.', i: '🐉' },
    { id: 'ffa', n: 'Last One Standing', d: 'Win against 3 CPU opponents.', i: '🏰' },
    { id: 'wonder', n: 'Wonder of the World', d: 'Win by Wonder.', i: '◆' },
    { id: 'bronze', n: 'Bronze Smith', d: 'Reach the Bronze Age before 9:00.', i: '🥉' },
    { id: 'imperial', n: 'Imperial Majesty', d: 'Reach the Imperial Age.', i: '🏛' },
    { id: 'fast', n: 'Blitz', d: 'Win a skirmish in under 20 minutes.', i: '⚡' },
    { id: 'army', n: 'Grand Army', d: 'Field 50 military units at once.', i: '🎖' },
    { id: 'pop', n: 'Thriving Realm', d: 'Reach 100 population.', i: '🏘' },
    { id: 'hunter', n: 'Great Hunt', d: 'Hunt 8 deer in one game.', i: '🦌' },
    { id: 'razer', n: 'Firebrand', d: 'Raze 25 enemy buildings in one game.', i: '🔥' },
    { id: 'flawless', n: 'Untouchable', d: 'Win a skirmish losing no buildings.', i: '✨' },
    { id: 'trader', n: 'Merchant Prince', d: 'Earn 1000 gold by trading in one game.', i: '⚖' },
    { id: 'scholar', n: 'Scholar', d: 'Research 20 technologies in one game.', i: '📜' }
  ];
  const DIFF = ['Easy', 'Normal', 'Hard', 'Legendary'];
  const MAPS = [['heartland', 'Heartland', 'Rolling meadows and woods'], ['riverlands', 'Riverlands', 'A river splits the land; docks matter'], ['inland', 'Inland Sea', 'A great lake in the middle'], ['blackforest', 'Black Forest', 'Dense woods, narrow paths'], ['highlands', 'Highlands', 'Hills, cliffs and rich mines']];
  const P = {
    d: null,
    load() { this.d = Object.assign({ xp: 0, camp: {}, ach: {}, games: 0, wins: 0, last: null }, ls.get('embers.profile', {})); },
    save() { ls.set('embers.profile', this.d); },
    rank(xp) { xp = xp === undefined ? this.d.xp : xp; let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++; const a = RANKS[i][0], b = RANKS[i + 1] ? RANKS[i + 1][0] : a + 1; return { i, name: RANKS[i][1], frac: RANKS[i + 1] ? (xp - a) / (b - a) : 1, next: RANKS[i + 1] ? b : null }; },
    give(id) { if (this.d.ach[id]) return false; this.d.ach[id] = Date.now(); this.save(); return true; },
    nAch() { return Object.keys(this.d.ach).length; },
    unlocked(what) {
      const a = this.d.ach, c = this.d.camp;
      switch (what) {
        case 'diff3': return !!a.winH;
        case 'blackforest': return !!c.raiders;
        case 'highlands': return !!a.winN || !!c.flame;
        case 'size120': return !!a.win;
        case 'color4': return this.nAch() >= 4;
        case 'color5': return this.nAch() >= 8;
        case 'explored': return !!a.campaign;
      }
      return true;
    },
    lockText(what) { return { diff3: 'Win on Hard', blackforest: 'Finish mission 4', highlands: 'Win on Normal', size120: 'Win a skirmish', color4: '4 achievements', color5: '8 achievements', explored: 'Finish the campaign' }[what] || ''; }
  };

  /* ------------------------------------------------------------ app */
  const A = E.App = {
    G: null, R: null, me: 0, sel: [], mode: null, cardPage: 0, paused: false, speed: 1, touchUI: false, box: null,
    screen: 'title', inGame: false, scen: null, S: null, groups: {}, settings: null, P, ACH
  };
  A.settings = Object.assign({ edge: true, quality: 1, zoom: 1.15, tips: true }, ls.get('embers.settings', {}));
  const saveSettings = () => ls.set('embers.settings', A.settings);

  /* ---------- game creation ---------- */
  function attachGame(G, me, demo) {
    A.G = G; A.me = me; E.colorOf = (o) => G.players[o].color; S.clear(); IC.clear && IC.clear();
    A.R = new E.Render($('#view'), G, me); A.R.quality = A.settings.quality; resize();
    A.sel = []; A.mode = null; A.groups = {}; A.box = null; A.cardPage = 0; A.paused = false; A.acc = 0; A.ended = false;
    A.demo = !!demo; A.lastSave = G.time; A.tens = 0; A.lastBell = -99; A.idleI = 0;
    const p = G.players[me]; A.R.centerOn(p.startX, p.startY); A.R.cam.z = demo ? 0.95 : defaultZoom(); A.R.updateFog();
    A.notes = { bronzeT: false, army: false, pop: false };
  }
  function defaultZoom() { return document.body.classList.contains('compact') ? 0.85 : A.settings.zoom; }
  function addAIs(G, optPlayers) {
    G.ais = [];
    G.players.forEach((p, i) => { if (p.ai !== null && p.ai !== undefined && p.alive) { const po = (optPlayers && optPlayers[i]) || {}; G.ais.push(new E.AI(G, i, p.ai, po.aiOpts)); } });
  }
  A.startSkirmish = function (cfg) {
    const n = cfg.opp + 1; const cols = [cfg.color]; for (let c = 0; cols.length < n; c++) if (cols.indexOf(c) < 0) cols.push(c);
    const names = ['Crimson Clan', 'Azure Throne', 'Saffron League', 'Verdant Horde', 'Violet Dominion', 'Teal Covenant'];
    const players = [{ name: 'You', color: cfg.color, team: 0 }];
    for (let i = 1; i < n; i++) players.push({ name: names[cols[i] % names.length], ai: cfg.diff, color: cols[i], team: cfg.teams && n === 4 ? (i === 1 ? 0 : 1) : i });
    const opts = { seed: (Math.random() * 1e9) >>> 0, mapType: cfg.map, size: cfg.size, players, popLimit: cfg.pop, reveal: cfg.reveal === 'explored' ? 'explored' : undefined, startRes: cfg.res === 'high' ? { f: 600, w: 600, g: 400, s: 300 } : undefined, skirmish: { diff: cfg.diff, opp: cfg.opp, teams: !!cfg.teams } };
    loading(() => {
      const G = new E.Game(opts); addAIs(G, players); attachGame(G, 0); A.scen = null; A.S = null; begin();
      UI.banner(MAPS.find(m => m[0] === cfg.map)[1], `${DIFF[cfg.diff]} · ${cfg.opp} opponent${cfg.opp > 1 ? 's' : ''} · Hearth Age`, 3800);
    });
  };
  A.startMission = function (sc) {
    const opts = C.makeOpts(sc, A.settings.color || 0);
    loading(() => {
      const G = new E.Game(opts); const St = {}; G.scenState = St;
      if (sc.setup) sc.setup(G, St);
      addAIs(G, opts.players); attachGame(G, 0); A.scen = sc; A.S = St; begin();
      showBrief(sc);
    });
  };
  A.resume = function () {
    const sv = ls.get('embers.save', null); if (!sv) return;
    loading(() => {
      let G; try { G = E.Game.load(sv.g); } catch (e) { console.warn('save corrupt', e); ls.del('embers.save'); A.go('title'); return; }
      const op = (sv.g.opts && sv.g.opts.players) || [];
      G.ais = []; let k = 0; G.players.forEach((p, i) => { if (p.ai !== null && p.ai !== undefined) { const ai = new E.AI(G, i, p.ai, (op[i] || {}).aiOpts); ai.restore && ai.restore((G._aiSaves || [])[k++]); G.ais.push(ai); } });
      attachGame(G, 0); A.scen = G.opts.scenario ? C.byId(G.opts.scenario) : null; A.S = G.scenState || {}; G.scenState = A.S;
      if (sv.cam) { A.R.cam.x = sv.cam.x; A.R.cam.y = sv.cam.y; A.R.cam.z = sv.cam.z; }
      begin(); UI.banner('Resumed', E.U.fmtTime(G.time) + ' · ' + D.AGES[G.players[0].age].name, 2200);
    });
  };
  function loading(fn) {
    let l = $('#loading'); if (!l) { l = document.createElement('div'); l.id = 'loading'; document.body.appendChild(l); }
    l.textContent = 'KINDLING THE FIRE…'; l.classList.remove('hidden'); clearScreens();
    setTimeout(() => { try { fn(); } finally { l.classList.add('hidden'); } }, 30);
  }
  function begin() {
    A.inGame = true; A.screen = 'game'; $('#hud').classList.remove('hidden'); UI.build(A); clearScreens(); homeLink(false);
    UI.goals(A.scen, A.S || {}); E.Audio.setMenu(false); E.Audio.setAge(A.G.players[A.me].age);
    P.d.games++; P.save(); mood('start'); moodScreen('play');
  }
  A.quit = function () { if (A.inGame && !A.ended && !A.demo) A.saveGame(); A.inGame = false; startDemo(); A.go('title'); };

  /* ---------- save ---------- */
  A.saveGame = function () {
    if (!A.G || A.demo || A.ended || A.G.over) return false;
    try { A.G.scenState = A.S; const g = A.G.serialize(); const ok = ls.set('embers.save', { g, cam: Object.assign({}, A.R.cam), t: Date.now(), label: (A.scen ? A.scen.name : 'Skirmish · ' + (MAPS.find(m => m[0] === A.G.opts.mapType) || ['', 'Map'])[1]) + ' · ' + E.U.fmtTime(A.G.time) }); A.lastSave = A.G.time; return ok; } catch (e) { console.warn('save failed', e); return false; }
  };

  /* ---------- demo (menu background) ---------- */
  function startDemo() {
    const G = new E.Game({ seed: 1000 + ((Math.random() * 9000) | 0), mapType: ['heartland', 'riverlands', 'inland'][(Math.random() * 3) | 0], size: 80, reveal: 'all', players: [{ name: 'A', ai: 1, color: 0 }, { name: 'B', ai: 1, color: 1 }] });
    G.players[0].human = true; addAIs(G); G.run(240); attachGame(G, 0, true); A.R.onEvents(G.events.splice(0)); A.demoT = 0;
    $('#hud').classList.add('hidden'); E.Audio.setMenu(true);
  }

  /* ---------- camera ---------- */
  A.pan = function (dx, dy) { if (!A.R) return; A.R.cam.x += dx / A.R.cam.z; A.R.cam.y += dy / A.R.cam.z; A.R.clampCam(); };
  A.zoomTo = function (z, sx, sy) { const R = A.R; if (!R) return; z = U.clamp(z, 0.5, 2.2); const [wx, wy] = R.toWorld(sx, sy); R.cam.z = z; const [nx, ny] = R.toScreen(wx, wy); R.cam.x += (nx - sx) / z; R.cam.y += (ny - sy) / z; R.clampCam(); };
  A.centerSel = function () { const es = A.sel.map(i => A.G.get(i)).filter(Boolean); if (!es.length) return; let x = 0, y = 0; for (const e of es) { x += e.x; y += e.y; } A.R.centerOn(x / es.length, y / es.length); };

  /* ---------- picking ---------- */
  function visibleEnt(e) { if (e.owner === A.me) return true; return A.R.seen(e.x, e.y); }
  A.pick = function (sx, sy) {
    const G = A.G, R = A.R, z = R.cam.z, me = A.me, p = G.players[me];
    let best = null, bd = 1e9;
    for (const u of G.units) {
      if (!visibleEnt(u)) continue; const [X, Y] = R.toScreen(u.x, u.y);
      const big = u.type === 'knight' || u.type === 'scout' || u.type === 'ram' || u.type === 'catapult' || u.type === 'galley' || u.type === 'fishboat';
      const hw = (big ? 20 : 13) * z, hh = (big ? 40 : u.type === 'deer' ? 26 : 34) * z;
      if (sx < X - hw || sx > X + hw || sy < Y - hh || sy > Y + 7 * z) continue;
      const d = Math.hypot(sx - X, sy - (Y - hh * 0.45)) - (u.owner === me ? 5 : 0);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    for (let k = 0; k <= 7; k++) {
      const [wx, wy] = R.toWorld(sx, sy + k * 11 * z); const tx = Math.floor(wx), ty = Math.floor(wy);
      if (tx < 0 || ty < 0 || tx >= G.w || ty >= G.h) continue; const i = ty * G.w + tx;
      const id = G.occ[i]; if (!id) continue; const e = G.get(id); if (!e) continue;
      if (e.owner !== me && !p.exp[i] && G.opts.reveal !== 'all') continue;
      if (k >= 2 && e.k === 'r' && e.type !== 'tree') continue;
      if (k >= 4 && e.k === 'b' && e.size < 2 && e.type !== 'tower') continue;
      return e;
    }
    for (const r of G.res) if (r.type === 'carcass') { const [X, Y] = R.toScreen(r.x, r.y); if (Math.hypot(sx - X, sy - Y) < 16 * z && R.seen(r.x, r.y)) return r; }
    return null;
  };
  A.hoverAt = function (sx, sy) {
    if (!A.G || !A.R) return; A._hx = sx; A._hy = sy;
    const m = A.mode;
    if (m && m.build) {
      const d = D.BUILD[m.build]; const [wx, wy] = A.R.toWorld(sx, sy); const tx = Math.round(wx - d.size / 2), ty = Math.round(wy - d.size / 2);
      if (m.wall && m.start) {
        const tiles = wallTiles(m.start[0], m.start[1], Math.floor(wx), Math.floor(wy)); const ok = tiles.every(t => !A.G.placeBlock(A.me, m.build, t[0], t[1]));
        A.R.ghost = { type: m.build, tx: tiles[0][0], ty: tiles[0][1], tiles, ok };
      } else A.R.ghost = { type: m.build, tx: m.wall ? Math.floor(wx) : tx, ty: m.wall ? Math.floor(wy) : ty, ok: !A.G.placeBlock(A.me, m.build, m.wall ? Math.floor(wx) : tx, m.wall ? Math.floor(wy) : ty) };
      A.R.hover = 0; $('#view').style.cursor = 'crosshair'; return;
    }
    const e = A.pick(sx, sy); A.R.hover = e ? e.id : 0;
    $('#view').style.cursor = (m && (m.am || m.rally)) ? 'crosshair' : e ? 'pointer' : 'default';
  };
  function wallTiles(x0, y0, x1, y1) {
    const tiles = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) { const tx = Math.round(x0 + (x1 - x0) * (n ? k / n : 0)), ty = Math.round(y0 + (y1 - y0) * (n ? k / n : 0)); if (!tiles.length || tiles[tiles.length - 1][0] !== tx || tiles[tiles.length - 1][1] !== ty) { if (tiles.length) { const l = tiles[tiles.length - 1]; if (l[0] !== tx && l[1] !== ty) tiles.push([tx, l[1]]); } tiles.push([tx, ty]); } }
    return tiles.slice(0, 40);
  }

  /* ---------- selection ---------- */
  const voiceKind = (t) => t;
  A.select = function (ids, quiet) {
    const G = A.G; ids = (ids || []).filter(i => { const e = G.get(i); return e && !e.dead; });
    A.sel = ids; A.R.sel = new Set(ids); UI.page = 0; A.cardPage = 0; if (A.mode && !A.mode.build) A.mode = null;
    const f = G.get(ids[0]);
    if (f && f.owner === A.me && !quiet) { if (f.k === 'u') E.Audio.sfx('select', { ut: voiceKind(f.type) }); else E.Audio.sfx('click'); }
    if (A.S && ids.some(i => { const e = G.get(i); return e && e.type === 'villager' && e.owner === A.me; })) A.S.selVil = true;
    UI.lastSig = ''; UI.focus = UI.focus >= 0 ? 0 : UI.focus;
  };
  function onScreen(e) { const [X, Y] = A.R.toScreen(e.x, e.y); return X > 0 && Y > 0 && X < A.R.W && Y < A.R.H; }
  A.clickSelect = function (sx, sy, add, dbl) {
    const e = A.pick(sx, sy), me = A.me;
    if (!e) { if (!add) A.select([]); return; }
    if (dbl && e.owner === me) { const ids = (e.k === 'u' ? A.G.units : A.G.blds).filter(u => u.owner === me && u.type === e.type && onScreen(u)).map(u => u.id); A.select(ids); return; }
    if (add && e.owner === me && e.k === 'u') { const cur = A.sel.filter(i => { const x = A.G.get(i); return x && x.k === 'u' && x.owner === me; }); const j = cur.indexOf(e.id); if (j >= 0) cur.splice(j, 1); else cur.push(e.id); A.select(cur); return; }
    A.select([e.id]);
  };
  A.boxSelect = function (x0, y0, x1, y1, add) {
    const R = A.R, me = A.me; const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    const inside = (e, off) => { const [X, Y] = R.toScreen(e.x, e.y); return X >= l && X <= r && Y - off >= t && Y - (off ? 0 : 0) <= b + off; };
    let ids = A.G.units.filter(u => u.owner === me && inside(u, 10 * R.cam.z)).map(u => u.id);
    // prefer military if box contains both? AoE keeps all; keep all
    if (!ids.length) ids = A.G.blds.filter(bd => bd.owner === me && inside(bd, 0)).map(bd => bd.id);
    if (add) ids = [...new Set(A.sel.concat(ids))];
    A.select(ids);
  };
  A.tap = function (sx, sy, dbl) {
    const G = A.G, me = A.me; const e = A.pick(sx, sy);
    const mine = A.sel.map(i => G.get(i)).filter(x => x && x.owner === me);
    if (e && e.owner === me && e.k === 'u') { if (dbl) A.clickSelect(sx, sy, false, true); else A.select([e.id]); return; }
    if (e && e.owner === me && e.k === 'b') {
      const vil = mine.some(u => u.k === 'u' && u.type === 'villager');
      const useful = vil && (!e.done || e.hp < G.bstat(me, e.type).hp || e.type === 'farm' || (D.BUILD[e.type].drop && mine.some(u => u.carry > 0)));
      if (useful) { A.command(sx, sy); return; }
      if (dbl) A.clickSelect(sx, sy, false, true); else A.select([e.id]); return;
    }
    if (mine.length && (mine.some(u => u.k === 'u') || mine.some(b => b.k === 'b' && D.BUILD[b.type].trains))) { A.command(sx, sy); return; }
    if (e) A.select([e.id]); else A.select([]);
  };
  A.idleVillager = function () {
    if (!A.G) return; const v = A.G.units.filter(u => u.owner === A.me && (u.type === 'villager' || u.type === 'fishboat') && u.st === 'idle');
    if (!v.length) { UI.alert('No idle villagers'); E.Audio.sfx('deny'); return; }
    A.idleI = (A.idleI + 1) % v.length; const u = v[A.idleI]; A.select([u.id]); A.R.centerOn(u.x, u.y);
  };
  A.idleMilitary = function () { const v = A.G.units.filter(u => u.owner === A.me && isMil(u.type) && u.st === 'idle'); if (!v.length) { UI.alert('No idle military'); return; } A.select(v.map(u => u.id)); A.centerSel(); };
  A.selectArmy = function () {
    const ids = A.G.units.filter(u => u.owner === A.me && isMil(u.type)).map(u => u.id);
    if (!ids.length) { UI.alert('You have no army yet'); E.Audio.sfx('deny'); return false; }
    A.select(ids); UI.alert(`Army selected (${ids.length}) — ${A.touchUI ? 'tap ⚔ then the map' : 'Enter again: attack-move to cursor'}`); return true;
  };
  A.special = function () {
    const sel = A.sel.map(i => A.G.get(i)).filter(Boolean);
    const allMil = sel.length && sel.every(u => u.k === 'u' && u.owner === A.me && isMil(u.type));
    if (allMil) { const [sx, sy] = cursorPos(); A.modeClick(sx, sy, false, true); return; }
    A.selectArmy();
  };
  function cursorPos() { const g = E.Input.gp.cursor; if (g && !A.touchUI && performance.now() - E.Input.mouse.t > 1500) return [g.x, g.y]; if (A.touchUI) return [A.R.W / 2, A.R.H / 2]; return [E.Input.mouse.x, E.Input.mouse.y]; }
  A.goTC = function () { const tcs = A.G.blds.filter(b => b.owner === A.me && b.type === 'towncenter'); if (!tcs.length) return; A.tcI = ((A.tcI || 0) + 1) % tcs.length; const t = tcs[A.tcI]; A.select([t.id]); A.R.centerOn(t.x, t.y); };
  A.setGroup = function (n) { A.groups[n] = A.sel.slice(); UI.alert('Group ' + n + ' set (' + A.sel.length + ')'); };
  A.addGroup = function (n) { A.groups[n] = [...new Set((A.groups[n] || []).concat(A.sel))]; };
  A.recallGroup = function (n) { const g = (A.groups[n] || []).filter(i => A.G.get(i)); if (!g.length) return; const now = performance.now(); const dbl = A._lg === n && now - A._lgt < 400; A._lg = n; A._lgt = now; A.select(g); if (dbl) A.centerSel(); };

  /* ---------- commands ---------- */
  function mark(x, y, c) { A.R.marks.push({ x, y, t: 0, c: c || '#9cff8a' }); }
  function mineSel() { return A.sel.map(i => A.G.get(i)).filter(e => e && e.owner === A.me); }
  A.command = function (sx, sy, am) {
    const [wx, wy] = A.R.toWorld(sx, sy); const t = A.pick(sx, sy); A.commandWorld(wx, wy, am, t);
  };
  A.commandWorld = function (wx, wy, am, t) {
    const G = A.G, me = A.me, es = mineSel(); if (!es.length) return;
    const us = es.filter(e => e.k === 'u'), bs = es.filter(e => e.k === 'b');
    if (us.length) {
      const ids = us.map(u => u.id), form = G.players[me].formation;
      if (am) { G.cmdMove(ids, wx, wy, { owner: me, attackMove: true, formation: form }); mark(wx, wy, '#ff7a5a'); return; }
      if (t && t.k !== 'r' && !(t.k === 'u' && t.type === 'deer') && G.enemy(me, t.owner)) mark(t.x, t.y, '#ff5a4a'); else if (t && (t.k === 'r' || t.type === 'deer')) mark(t.x, t.y, '#ffe07a'); else mark(wx, wy);
      G.cmdSmart(ids, wx, wy, t ? t.id : 0, { owner: me, formation: form });
    } else if (bs.length) {
      for (const b of bs) if (D.BUILD[b.type].trains || b.type === 'towncenter') G.cmdRally(b.id, wx, wy, t ? t.id : 0, { owner: me });
      mark(wx, wy, '#7ad7ff'); E.Audio.sfx('click');
    }
  };
  A.rightClick = function (sx, sy) {
    if (A.mode) { A.setMode(null); return; }
    A.command(sx, sy);
  };
  A.modeClick = function (sx, sy, shift, fromKey) {
    const m = A.mode || {};
    if (m.rally) { A.command(sx, sy); if (!shift) A.setMode(null); return; }
    A.command(sx, sy, true); if (!shift && !fromKey) A.setMode(null); E.Audio.sfx('ack', { ut: (A.G.get(A.sel[0]) || {}).type, kind: 'attack' });
  };
  A.setMode = function (m) {
    A.mode = m; A.R.ghost = null; UI.lastSig = '';
    if (m && m.build) { if (D.BUILD[m.build].wall || m.build === 'wall' || m.build === 'palisade') m.wall = true; if (A._hx !== undefined) A.hoverAt(A._hx, A._hy); if (A.touchUI) UI.alert('Tap the map to place the ' + D.BUILD[m.build].name + (m.wall ? ' — drag to draw a line' : '')); }
    if (m && m.am) UI.alert(A.touchUI ? 'Tap where to attack-move' : 'Click where to attack-move');
    if (m && m.rally) UI.alert('Pick a rally point');
    if (!m) $('#view').style.cursor = 'default';
  };
  A.placeAt = function (sx, sy, shift) {
    A.hoverAt(sx, sy); const g = A.R.ghost, m = A.mode; if (!g || !m) return;
    const blk = A.G.placeBlock(A.me, m.build, g.tx, g.ty) || A.G.buildBlock(A.me, m.build);
    if (blk) { UI.alert(blk, 'red'); E.Audio.sfx('deny'); return; }
    const ids = (m.ids || A.sel).filter(i => A.G.get(i)); const b = A.G.cmdBuild(ids, m.build, g.tx, g.ty, { owner: A.me });
    if (b === false || b === null) { E.Audio.sfx('deny'); return; }
    E.Audio.sfx('place'); if (!shift) A.setMode(null);
  };
  A.wallStart = function (sx, sy) { const [wx, wy] = A.R.toWorld(sx, sy); A.mode.start = [Math.floor(wx), Math.floor(wy)]; A.hoverAt(sx, sy); };
  A.wallEnd = function (sx, sy, shift) {
    const m = A.mode; if (!m || !m.start) return; const [wx, wy] = A.R.toWorld(sx, sy);
    const made = A.G.cmdWall((m.ids || A.sel), m.build, m.start[0], m.start[1], Math.floor(wx), Math.floor(wy), { owner: A.me });
    if (made && made.length) E.Audio.sfx('place'); else { E.Audio.sfx('deny'); UI.alert('Cannot build there', 'red'); }
    m.start = null; A.R.ghost = null; if (!shift) A.setMode(null);
  };
  A.stop = function () { A.G.cmdStop(mineSel().filter(e => e.k === 'u').map(u => u.id)); };
  A.del = function () { const ids = mineSel().map(e => e.id); if (!ids.length) return; A.G.cmdDelete(ids, A.me); A.select([]); };
  A.train = function (type, n) {
    const bs = mineSel().filter(b => b.k === 'b' && b.done && (D.BUILD[b.type].trains || []).indexOf(type) >= 0); if (!bs.length) return;
    const blk = A.G.trainBlock(A.me, type); if (blk) { UI.alert(blk, 'red'); E.Audio.sfx('deny'); return; }
    for (let k = 0; k < (n || 1); k++) { const b = bs.slice().sort((a, c) => a.queue.length - c.queue.length)[0]; A.G.cmdTrain(b.id, type, { owner: A.me }); }
    E.Audio.sfx('click');
  };
  A.research = function (key) {
    const b = mineSel().find(b => b.k === 'b' && b.done); if (!b) return; const blk = A.G.techBlock(A.me, key);
    if (blk) { UI.alert(blk, 'red'); E.Audio.sfx('deny'); return; } A.G.cmdResearch(b.id, key, { owner: A.me }); E.Audio.sfx('click');
  };
  A.trade = function (res, buy) { A.G.cmdTrade(A.me, res, buy); };
  A.cancelQueue = function (bid, qi) { A.G.cmdCancel(bid, qi, { owner: A.me }); E.Audio.sfx('click'); };
  A.cycleSpeed = function (dir) { const sp = [1, 1.5, 2]; let i = sp.indexOf(A.speed); i = dir === -1 ? Math.max(0, i - 1) : dir === 1 ? Math.min(2, i + 1) : (i + 1) % 3; A.speed = sp[i]; UI.alert('Game speed ' + A.speed + '×'); };
  A.togglePause = function () { A.paused = !A.paused; UI.banner(A.paused ? 'PAUSED' : '', A.paused ? 'press Pause / P to continue' : '', A.paused ? 600000 : 1); if (!A.paused) $('#banner').classList.remove('show'); };
  A.escape = function (pad) {
    if (A.mode) { A.setMode(null); return; }
    if (UI.page) { UI.page = 0; UI.lastSig = ''; return; }
    if (A.sel.length) { A.select([]); return; }
    if (!pad) A.pauseMenu();
  };
  A.cursorHidden = function () { const c = $('#cursor'); if (c) c.classList.add('hidden'); };
  A.showCursor = function (x, y) { let c = $('#cursor'); if (!c) { c = document.createElement('div'); c.id = 'cursor'; document.body.appendChild(c); } c.classList.remove('hidden'); c.style.left = x + 'px'; c.style.top = y + 'px'; };

  /* ---------- events: audio, alerts, stats ---------- */
  function spot(x, y) {
    const [sx, sy] = A.R.toScreen(x, y); const W = A.R.W, H = A.R.H;
    const dx = sx < 0 ? -sx : sx > W ? sx - W : 0, dy = sy < 0 ? -sy : sy > H ? sy - H : 0; const d = Math.hypot(dx, dy);
    return { v: Math.max(0, 1 - d / 500) * Math.min(1, 0.55 + A.R.cam.z * 0.4), pan: U.clamp((sx / W - 0.5) * 1.4, -0.9, 0.9) };
  }
  function handleEvents(evs) {
    const G = A.G, me = A.me, R = A.R, Au = E.Audio;
    for (const e of evs) {
      const mine = e.owner === me;
      const vis = e.x === undefined || R.seen(e.x, e.y);
      switch (e.type) {
        case 'work': if (vis) { const s = spot(e.x, e.y); if (s.v > 0.05) Au.sfx(e.wk === 'farm' ? 'farm' : e.wk, Object.assign(s, { v: s.v * 0.7 })); } break;
        case 'shoot': if (vis) { const s = spot(e.x, e.y); Au.sfx(e.kind === 'stone' || e.ut === 'catapult' ? 'thwack' : 'bow', s); } break;
        case 'arrowHit': if (vis) Au.sfx('arrowHit', spot(e.x, e.y)); break;
        case 'melee': if (vis) Au.sfx('melee', spot(e.x, e.y)); break;
        case 'boom': if (vis) Au.sfx('boom', spot(e.x, e.y)); break;
        case 'die': if (vis) Au.sfx(e.ut === 'deer' ? 'deer' : 'die', Object.assign(spot(e.x, e.y), { low: e.ut !== 'villager' })); if (mine && isMil(e.ut) && Math.random() < 0.3) mood('hit'); break;
        case 'bldDie': if (vis) Au.sfx('collapse', spot(e.x, e.y)); if (mine) { UI.alert(D.BUILD[e.bt].name + ' destroyed!', 'red'); mood('hit'); } else if (e.owner >= 0 && G.enemy(me, e.owner) && e.bt === 'towncenter') { UI.alert('Enemy Town Center razed!', 'gold'); mood('big'); } break;
        case 'ack': if (mine && !A.demo) Au.sfx('ack', { ut: e.ut, kind: e.kind }); break;
        case 'built': if (mine) { Au.sfx('built'); if (e.bt !== 'farm' && e.bt !== 'wall' && e.bt !== 'palisade' && e.bt !== 'house') UI.alert(D.BUILD[e.bt].name + ' complete'); } break;
        case 'trained': if (mine) Au.sfx('trained', { v: 0.7 }); break;
        case 'researched': if (mine) { Au.sfx('research'); const t = D.TECH[e.key]; if (t && !t.ageUp) UI.alert(t.name + ' researched', 'gold'); } break;
        case 'ageStart': if (mine) UI.alert('Advancing to the ' + D.AGES[e.age].name + '…'); else if (e.owner >= 0 && G.enemy(me, e.owner) && !A.demo) UI.alert(G.players[e.owner].name + ' is advancing to the ' + D.AGES[e.age].name, 'red'); break;
        case 'ageUp': if (mine) { Au.sfx('ageUp'); Au.setAge(e.age); UI.banner(D.AGES[e.age].name.toUpperCase(), 'Your people enter a new age', 4200); mood('big'); S.clear(); IC.clear && IC.clear(); UI.lastSig = ''; if (e.age === 1 && G.time < 540) achieve('bronze'); if (e.age === 3) achieve('imperial'); } else if (!A.demo && e.owner >= 0) { Au.sfx('horn', { v: 0.5 }); UI.alert(G.players[e.owner].name + ' reached the ' + D.AGES[e.age].name, G.enemy(me, e.owner) ? 'red' : ''); } break;
        case 'underAttack': if (mine && !A.demo) { const p = G.players[me]; if (G.time - A.lastBell > 18 || Math.hypot(e.x - A.bellX, e.y - A.bellY) > 14) { A.lastBell = G.time; A.bellX = e.x; A.bellY = e.y; Au.sfx('bell'); UI.alert((e.bld ? 'Your buildings are' : 'You are') + ' under attack! (' + C.dirName(e.x - p.startX, e.y - p.startY) + ')', 'red'); R.pings = R.pings || []; R.pings.push({ x: e.x, y: e.y, t: R.time }); mood('stall'); } A.tens = 1; } break;
        case 'noRes': if (mine && !A.demo) { Au.sfx('deny'); const need = Object.keys(e.cost || {}).filter(k => G.players[me].res[k] < e.cost[k]).map(k => D.RESNAME[k]).join(', '); UI.alert('Not enough ' + (need || 'resources'), 'red'); } break;
        case 'housed': if (mine && !A.demo) { Au.sfx('housed'); UI.alert('Need more houses!', 'red'); } break;
        case 'resGone': break;
        case 'farmDone': if (mine && !A.demo) UI.alert('A farm has been exhausted'); break;
        case 'trade': if (mine) Au.sfx('trade'); break;
        case 'wonderBuilt': Au.sfx('wonder'); if (!A.demo) { UI.banner(mine ? 'YOUR WONDER STANDS' : G.players[e.owner].name.toUpperCase() + ' BUILT A WONDER', mine ? 'Defend it until the timer runs out' : 'Destroy it before the timer runs out!', 5000); mood('big'); } break;
        case 'wonderLost': if (!A.demo) UI.alert(G.players[e.owner].name + "'s Wonder has fallen", 'gold'); break;
        case 'defeated': if (!A.demo && e.owner !== me) { UI.alert(G.players[e.owner].name + ' has been defeated', 'gold'); Au.sfx('horn'); mood('big'); } break;
        case 'gameOver': if (!A.demo && !A.ended) { const win = e.team === G.players[me].team; setTimeout(() => endGame(win, e.how), 1800); A.ended = 'pending'; } break;
      }
    }
  }
  function achieve(id) { if (A.demo) return; if (P.give(id)) { const a = ACH.find(x => x.id === id); UI.alert('🏆 Achievement: ' + a.n, 'gold'); (A.newAch = A.newAch || []).push(id); } }
  function tension() {
    const G = A.G, me = A.me, p = G.players[me]; let n = 0;
    for (const u of G.units) if (u.owner >= 0 && G.enemy(me, u.owner) && isMil(u.type) && Math.hypot(u.x - p.startX, u.y - p.startY) < 20) n++;
    let fight = 0; for (const u of G.units) if (u.owner === me && u.st === 'attack') fight++;
    A.tens = Math.max(A.tens * 0.995, Math.min(1, n / 10 + fight / 25)); return A.tens;
  }
  function midChecks() {
    const G = A.G, p = G.players[A.me];
    if (G.armyOf(A.me) >= 50) achieve('army');
    if (p.pop >= 100) achieve('pop');
    if (p.stats.deer >= 8) achieve('hunter');
    if (p.stats.razed >= 25) achieve('razer');
    if (p.stats.tradeG >= 1000) achieve('trader');
    if (p.stats.techs >= 20) achieve('scholar');
  }

  /* ---------- scenario api ---------- */
  const scenApi = {
    alert: (msg, x, y) => { UI.alert(msg, 'red'); E.Audio.sfx('horn'); if (x !== undefined) { A.R.pings = A.R.pings || []; A.R.pings.push({ x, y, t: A.R.time }); } },
    dirName: C.dirName,
    goalDone: (n) => { E.Audio.sfx('research'); if (A.scen && n < A.scen.goals.length) UI.alert('✔ ' + A.scen.goals[n - 1].text.split(/[.(—]/)[0], 'gold'); UI.goals(A.scen, A.S); mood('big'); },
    win: () => { if (!A.ended) { A.ended = 'pending'; setTimeout(() => endGame(true, 'mission'), 1500); } },
    lose: (msg) => { if (!A.ended) { A.ended = 'pending'; A.loseMsg = msg; setTimeout(() => endGame(false, 'mission'), 1200); } }
  };

  /* ---------- end of game ---------- */
  function endGame(win, how) {
    if (A.ended === true) return; A.ended = true; A.paused = true; const G = A.G, me = A.me, p = G.players[me];
    G._sample(); ls.del('embers.save');
    E.Audio.sfx(win ? 'victory' : 'defeat'); mood(win ? 'win' : 'lose');
    const sk = G.opts.skirmish; A.newAch = A.newAch || [];
    let xp = Math.round(G.score(p) / 8) + (win ? 150 : 40);
    if (A.scen && win) { const first = !P.d.camp[A.scen.id]; P.d.camp[A.scen.id] = true; if (first) xp += 200; achieve('first'); if (C.list.every(s => P.d.camp[s.id])) achieve('campaign'); }
    if (sk && win) {
      xp += sk.diff * 120 + (sk.opp - 1) * 80; P.d.wins++; achieve('win'); if (sk.diff >= 1) achieve('winN'); if (sk.diff >= 2) achieve('winH'); if (sk.diff >= 3) achieve('winL');
      if (sk.opp >= 3 && !sk.teams) achieve('ffa'); if (G.time < 1200) achieve('fast'); if (p.stats.bldLost === 0) achieve('flawless');
    }
    if (win && how === 'wonder') achieve('wonder'); midChecks();
    const before = P.rank(); P.d.xp += xp; P.save(); const after = P.rank();
    A.endInfo = { win, how, xp, before, after, ach: A.newAch.slice() }; A.newAch = [];
    A.go('end');
  }

  /* ---------- main loop ---------- */
  let last = performance.now(), mmT = 0, uiT = 0, frames = 0, fpsT = 0, slow = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    E.Input.poll(dt);
    const G = A.G, R = A.R; if (!G || !R) return;
    const running = A.demo ? true : (A.inGame && !A.paused && A.screen === 'game');
    if (running) {
      A.acc += dt * (A.demo ? 1 : A.speed); let n = 0;
      while (A.acc >= G.DT && n < 8) {
        A.acc -= G.DT; n++; G.step();
        if (A.scen && A.S && !A.ended) C.update(G, A.scen, A.S, scenApi);
        const evs = G.events.splice(0); R.onEvents(evs); handleEvents(evs);
      }
      if (n >= 8) A.acc = 0;
      if (!A.demo && A.inGame) {
        if (G.tick % 40 === 0) { E.Audio.setTension(tension()); midChecks(); if (A.scen) UI.goals(A.scen, A.S); }
        if (G.time - A.lastSave > 60) A.saveGame();
        if (A.sel.length && G.tick % 10 === 0) { const s = A.sel.filter(i => { const e = G.get(i); return e && !e.dead; }); if (s.length !== A.sel.length) { A.sel = s; R.sel = new Set(s); } }
      }
    }
    if (A.demo) { A.demoT += dt; R.cam.x += Math.cos(A.demoT * 0.05) * 14 * dt; R.cam.y += Math.sin(A.demoT * 0.037) * 8 * dt; R.clampCam(); if (G.over || G.time > 2400) startDemo(); }
    R.frame(running ? U.clamp(A.acc / G.DT, 0, 1) : 1, dt);
    if (A.box) { const x = R.ctx; x.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); const b = A.box; x.strokeStyle = '#f4f1d0'; x.lineWidth = 1; x.fillStyle = 'rgba(255,240,200,0.08)'; x.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); x.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); }
    if (A.inGame && !A.demo) {
      mmT += dt; if (mmT > 0.25) { mmT = 0; const mm = $('#mm'); if (mm) R.minimap(mm); }
      uiT += dt; if (uiT > 0.1) { uiT = 0; UI.update(); }
    }
    // adaptive quality
    frames++; fpsT += dt; if (fpsT > 2) { const fps = frames / fpsT; frames = 0; fpsT = 0; if (A.settings.quality === 'auto' || A.settings.quality === 1) { if (fps < 38) slow++; else slow = Math.max(0, slow - 1); R.quality = slow > 2 ? 0 : 1; } A.fps = fps; }
  }

  /* ---------- layout ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight; const b = document.body;
    b.classList.toggle('compact', h < 560 || w < 760);
    $('#rotate').classList.toggle('hidden', !(h > w && w < 700));
    if (A.R) { A.R.resize(w, h, Math.min(2, devicePixelRatio || 1)); A.R.clampCam(); }
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.inGame && !A.demo) A.saveGame(); });
  addEventListener('pagehide', () => { if (A.inGame && !A.demo) A.saveGame(); });

  A.boot = function () {
    P.load(); UI_SCREENS.init(A); E.Input.init(A);
    if (/Mac|iPhone|iPad/.test(navigator.platform) && 'ontouchend' in document) { A.touchUI = true; document.body.classList.add('touch'); }
    if (matchMedia && matchMedia('(pointer: coarse)').matches) { A.touchUI = true; document.body.classList.add('touch'); }
    resize(); startDemo(); A.go('title');
    try { MS() && MS().bindPause && MS().bindPause({ pause: () => { if (A.inGame && A.screen === 'game') A.pauseMenu(); }, resume: () => { } }); } catch (e) { }
    requestAnimationFrame(loop); window.__embersReady = true;
  };
  let UI_SCREENS = null;
  A.registerScreens = (s) => { UI_SCREENS = s; };
  A._internals = { P, ACH, DIFF, MAPS, RANKS, ls, saveSettings, attachGame, startDemo, endGame, handleEvents, scenApi, clearScreens: () => clearScreens(), homeLink: (v) => homeLink(v) };
  function clearScreens() { $('#screens').innerHTML = ''; }
  function homeLink(show) { let h = $('#home'); if (!h) { h = document.createElement('a'); h.id = 'home'; h.href = '../../index.html'; h.innerHTML = '&larr; ARCADE'; document.body.appendChild(h); } h.classList.toggle('hidden', !show); }
  function showBrief(sc) { A.paused = true; A.go('brief'); }
  A.showBrief = showBrief;
})(window.EMB = window.EMB || {});
