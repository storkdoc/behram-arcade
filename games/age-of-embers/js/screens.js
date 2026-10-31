/* AGE OF EMBERS — menu and overlay screens (title, campaign, skirmish setup, achievements,
   settings, how to play, mission brief, pause, end-of-game stats with timeline graphs). */
(function (E) {
  'use strict';
  const A = E.App, D = E.D, C = E.Campaign, UI = E.UI, $ = (q) => document.querySelector(q);
  const X = A._internals, P = X.P, ACH = X.ACH, DIFF = X.DIFF, MAPS = X.MAPS;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (t) => E.U.fmtTime(t);
  const SC = {};
  let focusI = 0;
  function mount(html, cls) {
    const s = $('#screens'); s.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`; focusI = 0; markFocus(false);
    s.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { E.Audio.sfx('click'); A.go(b.dataset.go); }));
    return s.firstChild;
  }
  function focusables() { const s = $('#screens .screen'); return s ? [...s.querySelectorAll('button:not(:disabled), input[type=range]')].filter(b => b.offsetParent !== null) : []; }
  function markFocus(show) { const f = focusables(); f.forEach((b, i) => b.classList.toggle('focus', show && i === focusI)); if (show && f[focusI]) f[focusI].scrollIntoView && f[focusI].scrollIntoView({ block: 'nearest' }); }
  A.menuNav = function (dy, dx, act) {
    const f = focusables(); if (!f.length) return;
    if (act === 'ok') { const b = f[focusI]; if (b && b.tagName === 'BUTTON') b.click(); return; }
    if (act === 'back' || act === 'start') { const b = $('#screens [data-back]'); if (b) b.click(); else if (act === 'start' && f[focusI]) f[focusI].click(); return; }
    const cur = f[focusI];
    if (dx && cur && cur.type === 'range') { cur.value = +cur.value + dx * 0.05; cur.dispatchEvent(new Event('input')); return; }
    focusI = (focusI + (dy || dx) + f.length) % f.length; markFocus(true); E.Audio.sfx('click');
  };
  A.menuKey = function (e) {
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight' && !(document.activeElement && document.activeElement.type === 'range')) { A.menuNav(1, 0); return true; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { A.menuNav(-1, 0); return true; }
    if (e.code === 'Enter' || e.code === 'Space') { const f = focusables(); if (f.some(b => b.classList.contains('focus'))) { A.menuNav(0, 0, 'ok'); return true; } return false; }
    if (e.code === 'Escape') { A.menuNav(0, 0, 'back'); return true; }
    return false;
  };
  A.go = function (name, arg) {
    A.screen = name; E.UI.hideTip && E.UI.hideTip();
    if (name === 'game') { X.clearScreens(); A.paused = false; $('#hud').classList.remove('hidden'); X.homeLink(false); try { window.MoodSticker && MoodSticker.screen && MoodSticker.screen('play'); } catch (e) { } return; }
    X.homeLink(!A.inGame);
    if (!A.inGame) $('#hud').classList.add('hidden');
    try { window.MoodSticker && MoodSticker.screen && MoodSticker.screen(name === 'end' ? 'gameover' : A.inGame ? 'pause' : 'menu'); } catch (e) { }
    (SC[name] || SC.title)(arg);
  };
  A.pauseMenu = function (tab) { if (!A.inGame || A.ended) return; A.paused = true; A.saveGame(); A.go(tab === 'help' ? 'help' : 'pause'); };
  const back = (to) => `<button class="mbtn small" data-back data-go="${to || (A.inGame ? 'pause' : 'title')}">‹ Back</button>`;

  SC.title = function () {
    if (A.inGame) return A.go('pause');
    const sv = X.ls.get('embers.save', null); const r = P.rank(); const done = C.list.filter(s => P.d.camp[s.id]).length;
    mount(`<div class="title"><h1>AGE OF <span class="em">EMBERS</span></h1><div class="tag">From hearth fire to empire</div>
      <div class="menu">
        ${sv ? `<button class="mbtn" id="m_cont">Continue<small>${esc(sv.label || '')}</small></button>` : ''}
        <button class="mbtn" data-go="campaign">Campaign<small>The First Flame · ${done}/${C.list.length} missions</small></button>
        <button class="mbtn" data-go="skirmish">Skirmish<small>Random map vs CPU</small></button>
        <button class="mbtn" data-go="ach">Achievements<small>${P.nAch()}/${ACH.length} earned</small></button>
        <button class="mbtn" data-go="settings">Settings</button>
        <button class="mbtn" data-go="help">How to Play</button>
      </div>
      <div class="rank">${r.name} · ${P.d.xp} XP${r.next ? ' · next rank at ' + r.next : ''}</div><div class="xpbar"><i style="width:${(r.frac * 100).toFixed(0)}%"></i></div></div>
      <div class="ver">v1.0 · all art &amp; music generated in your browser</div>`);
    const c = $('#m_cont'); if (c) c.onclick = () => { E.Audio.sfx('click'); A.resume(); };
  };
  SC.campaign = function () {
    const html = C.list.map((s, i) => { const lock = i > 0 && !P.d.camp[C.list[i - 1].id]; return `<button class="mission ${lock ? 'locked' : ''} ${P.d.camp[s.id] ? 'done' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}><b>${i + 1}. ${esc(s.name)}</b><small>${esc(s.sub)}</small><p>${lock ? '🔒 Complete the previous mission to unlock.' : esc(s.brief)}</p></button>`; }).join('');
    const el = mount(`<div class="panel card"><h2>THE FIRST FLAME</h2><p style="text-align:center;margin-top:-6px;color:#cdb68f">Six short scenarios that take you from your first hut to a Wonder of the world.</p><div class="missions">${html}</div><div class="row" style="justify-content:center">${back()}</div></div>`);
    el.querySelectorAll('.mission').forEach(b => b.onclick = () => { E.Audio.sfx('click'); A.startMission(C.list[+b.dataset.i]); });
  };
  SC.skirmish = function () {
    const st = A.settings.sk = Object.assign({ map: 'heartland', size: 96, opp: 1, diff: 1, color: A.settings.color || 0, pop: 150, res: 'std', reveal: 'normal', teams: false }, A.settings.sk || {});
    const opt = (k, v, label, lock) => { const locked = lock && !P.unlocked(lock); return `<button class="opt ${st[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}" ${locked ? 'disabled title="' + P.lockText(lock) + '"' : ''}>${label}${locked ? ' <span class="lock">🔒 ' + P.lockText(lock) + '</span>' : ''}</button>`; };
    const sw = D.COLORS.map((c, i) => { const lock = i === 4 ? 'color4' : i === 5 ? 'color5' : null; const locked = lock && !P.unlocked(lock); return `<button class="swatch ${st.color === i ? 'on' : ''}" data-k="color" data-v="${i}" style="background:${c.c}" ${locked ? 'disabled title="🔒 ' + P.lockText(lock) + '"' : ''}></button>`; }).join(' ');
    const el = mount(`<div class="panel card"><h2>SKIRMISH</h2>
      <div class="row"><label>Map</label>${MAPS.map(m => opt('map', m[0], m[1], m[0] === 'blackforest' || m[0] === 'highlands' ? m[0] : null)).join('')}</div>
      <div class="row"><label></label><small style="color:#bda57c">${esc((MAPS.find(m => m[0] === st.map) || MAPS[0])[2])}</small></div>
      <div class="row"><label>Size</label>${opt('size', 80, 'Small')}${opt('size', 96, 'Medium')}${opt('size', 120, 'Large', 'size120')}</div>
      <div class="row"><label>Opponents</label>${opt('opp', 1, '1')}${opt('opp', 2, '2')}${opt('opp', 3, '3')}${st.opp === 3 ? opt('teams', true, '2 v 2 (with ally)') + opt('teams', false, 'Free for all') : ''}</div>
      <div class="row"><label>Difficulty</label>${opt('diff', 0, 'Easy')}${opt('diff', 1, 'Normal')}${opt('diff', 2, 'Hard')}${opt('diff', 3, 'Legendary', 'diff3')}</div>
      <div class="row"><label>Your colour</label>${sw}</div>
      <div class="row"><label>Population</label>${opt('pop', 100, '100')}${opt('pop', 150, '150')}${opt('pop', 200, '200')}</div>
      <div class="row"><label>Resources</label>${opt('res', 'std', 'Standard')}${opt('res', 'high', 'High')}</div>
      <div class="row"><label>Map start</label>${opt('reveal', 'normal', 'Unexplored')}${opt('reveal', 'explored', 'Explored', 'explored')}</div>
      <div class="row" style="justify-content:center;margin-top:14px">${back()}<button class="mbtn" id="sk_go" style="min-width:200px">Start Game</button></div></div>`);
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { E.Audio.sfx('click'); let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; st[b.dataset.k] = v; if (b.dataset.k === 'color') A.settings.color = v; X.saveSettings(); const fi = focusI; SC.skirmish(); focusI = fi; markFocus(true); });
    $('#sk_go').onclick = () => { E.Audio.sfx('click'); X.saveSettings(); A.startSkirmish(st); };
  };
  SC.ach = function () {
    const r = P.rank();
    mount(`<div class="panel card"><h2>ACHIEVEMENTS</h2><div class="rank">Rank: <b style="color:#ffe3a6">${r.name}</b> · ${P.d.xp} XP · ${P.d.wins} skirmish wins · ${P.d.games} games</div><div class="xpbar"><i style="width:${(r.frac * 100).toFixed(0)}%"></i></div>
      <div class="achs" style="margin-top:12px">${ACH.map(a => `<div class="ach ${P.d.ach[a.id] ? '' : 'lock'}"><div class="medal">${a.i}</div><div><b>${esc(a.n)}</b><small>${esc(a.d)}</small></div></div>`).join('')}</div>
      <h3>Unlocks</h3><div class="help" style="columns:1"><p>🔓 Legendary difficulty — win on Hard. · Black Forest map — finish mission 4. · Highlands map — win on Normal. · Large maps — win any skirmish. · Violet / Teal banners — 4 / 8 achievements. · Explored-map start — finish the campaign.</p></div>
      <div class="row" style="justify-content:center">${back()}</div></div>`);
  };
  SC.settings = function () {
    const st = E.Audio.state, S = A.settings;
    const el = mount(`<div class="panel card" style="width:min(560px,96vw)"><h2>SETTINGS</h2>
      <div class="row"><label>Music</label><input class="slider" type="range" min="0" max="1" step="0.05" value="${st.music}" id="s_mus"></div>
      <div class="row"><label>Sound effects</label><input class="slider" type="range" min="0" max="1" step="0.05" value="${st.sfx}" id="s_sfx"></div>
      <div class="row"><label>Mute all</label><button class="opt ${st.muted ? 'on' : ''}" id="s_mute">${st.muted ? 'Muted' : 'Sound on'}</button></div>
      <div class="row"><label>Edge scrolling</label><button class="opt ${S.edge ? 'on' : ''}" id="s_edge">${S.edge ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Default zoom</label>${[0.9, 1.15, 1.4].map(z => `<button class="opt ${S.zoom === z ? 'on' : ''}" data-z="${z}">${z === 0.9 ? 'Far' : z === 1.15 ? 'Normal' : 'Close'}</button>`).join('')}</div>
      <div class="row"><label>Graphics</label><button class="opt ${S.quality === 1 ? 'on' : ''}" data-q="1">High (auto)</button><button class="opt ${S.quality === 0 ? 'on' : ''}" data-q="0">Fast</button></div>
      <div class="row"><label>Progress</label><button class="opt" id="s_reset">Reset profile…</button></div>
      <div class="row" style="justify-content:center">${back()}</div></div>`);
    $('#s_mus').oninput = (e) => E.Audio.setVol('music', +e.target.value);
    $('#s_sfx').oninput = (e) => { E.Audio.setVol('sfx', +e.target.value); E.Audio.sfx('click'); };
    $('#s_mute').onclick = () => { E.Audio.toggleMute(); SC.settings(); };
    $('#s_edge').onclick = () => { S.edge = !S.edge; X.saveSettings(); SC.settings(); };
    el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { S.zoom = +b.dataset.z; X.saveSettings(); SC.settings(); });
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { S.quality = +b.dataset.q; if (A.R) A.R.quality = S.quality; X.saveSettings(); SC.settings(); });
    let n = 0; $('#s_reset').onclick = (e) => { n++; if (n === 1) { e.target.textContent = 'Click again to erase XP, campaign and achievements'; return; } P.d = { xp: 0, camp: {}, ach: {}, games: 0, wins: 0 }; P.save(); X.ls.del('embers.save'); e.target.textContent = 'Profile reset'; };
  };
  SC.help = function () {
    mount(`<div class="panel card"><h2>HOW TO PLAY</h2><div class="help">
      <h3>Goal</h3><p>Grow a village into an empire. Win by <b>conquest</b> (destroy every enemy army and key building) or by building a <b>Wonder</b> and holding it for 3 minutes.</p>
      <h3>Economy</h3><p>Villagers gather <b>food</b> (berries, deer, fish, farms), <b>wood</b>, <b>gold</b> and <b>stone</b>. Build Lumber/Mining Camps and Mills near resources to shorten trips. Houses raise your population cap.</p>
      <h3>Ages</h3><p>Hearth → Bronze → Iron → Imperial. Each age costs resources and needs two buildings of the previous age. New ages unlock units, buildings and technologies, and change how your town looks.</p>
      <h3>Counters</h3><p>Spearmen beat cavalry · cavalry beat archers · archers beat infantry · infantry beat spearmen and siege · rams crush buildings · catapults break massed troops and towers.</p>
      <h3>Mouse &amp; keyboard</h3><p>Left-click select · drag a box · double-click selects all of a type · Shift adds. Right-click (or Ctrl-click on Mac) gathers, attacks, builds or moves. Wheel or pinch zooms; trackpad two-finger swipe, arrow keys or screen edges pan.</p>
      <p><kbd>Space</kbd> next idle villager · <kbd>Enter</kbd> select army / attack-move to cursor · <kbd>Q W E R T / A S D F G / Z X C V B</kbd> command card · <kbd>Ctrl/⌘ 1-9</kbd> set group, <kbd>1-9</kbd> recall (twice to jump) · <kbd>H</kbd> Town Center · <kbd>.</kbd> idle army · <kbd>Del</kbd> delete · <kbd>+ / -</kbd> speed · <kbd>Esc</kbd> cancel / menu.</p>
      <h3>Touch (iPad / iPhone)</h3><p>Tap a unit to select it, tap the map to send it. Drag one finger to box-select; two fingers pan, pinch to zoom. Double-tap or long-press selects all of a type. The bar on the right has Army, Idle, Attack-move and Deselect.</p>
      <h3>Gamepad</h3><p>Left stick cursor · right stick pans · <kbd>A</kbd> select (hold to box) · <kbd>X</kbd> command · <kbd>Y</kbd> idle villager · <kbd>B</kbd> cancel · <kbd>LT</kbd> army · <kbd>LB/RB</kbd> zoom · D-pad + <kbd>RT</kbd> command card · <kbd>L3</kbd> Town Center · <kbd>Start</kbd> menu.</p>
      </div><div class="row" style="justify-content:center">${back()}</div></div>`);
  };
  SC.brief = function () {
    const sc = A.scen;
    const el = mount(`<div class="panel card" style="width:min(620px,96vw)"><h2>${esc(sc.name.toUpperCase())}</h2><p style="text-align:center;color:#cdb68f;margin-top:-6px">${esc(sc.sub)}</p><p style="font-size:15px;line-height:1.5">${esc(sc.brief)}</p><h3>Objectives</h3>${sc.goals.map((g, i) => `<p>${i + 1}. ${esc(g.text)}</p>`).join('')}
      <div class="row" style="justify-content:center;margin-top:14px"><button class="mbtn" id="b_go">Begin</button></div></div>`, 'dim');
    $('#b_go').onclick = () => { E.Audio.sfx('click'); A.go('game'); };
  };
  SC.pause = function () {
    const G = A.G;
    const el = mount(`<div class="panel card" style="width:min(420px,94vw)"><h2>PAUSED</h2><p style="text-align:center;color:#cdb68f">${A.scen ? esc(A.scen.name) : 'Skirmish'} · ${fmt(G.time)} · ${D.AGES[G.players[A.me].age].name}</p>
      <div class="menu"><button class="mbtn" id="p_res" data-back>Resume</button><button class="mbtn" data-go="help">How to Play</button><button class="mbtn" data-go="settings">Settings</button>
      <button class="mbtn" id="p_quit">Save &amp; Quit to Menu<small>Continue it later from the main menu</small></button><button class="mbtn" id="p_resign">Resign</button></div></div>`, 'dim');
    $('#p_res').onclick = () => { E.Audio.sfx('click'); A.go('game'); };
    $('#p_quit').onclick = () => { E.Audio.sfx('click'); A.saveGame(); A.inGame = false; X.startDemo(); A.go('title'); };
    let n = 0; $('#p_resign').onclick = (e) => { n++; if (n === 1) { e.target.textContent = 'Click again to resign'; return; } A.go('game'); X.endGame(false, 'resign'); };
  };
  function graph(cv, key) {
    const G = A.G, dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const series = G.players.map(p => p.stats.timeline.map(s => [s.t, key === 'army' ? s.mil : key === 'pop' ? s.pop : key === 'gath' ? s.gath : s.score]));
    const T = Math.max(60, G.time), M = Math.max(10, ...series.flat().map(s => s[1])) * 1.08;
    const L = 44, B = 22, Rr = 10, Tp = 10; const sx = t => L + t / T * (w - L - Rr), sy = v => h - B - v / M * (h - B - Tp);
    x.strokeStyle = 'rgba(227,184,96,0.15)'; x.fillStyle = '#bda57c'; x.font = '11px sans-serif'; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = M / 4 * i; x.beginPath(); x.moveTo(L, sy(v)); x.lineTo(w - Rr, sy(v)); x.stroke(); x.fillText(Math.round(v), 6, sy(v) + 4); }
    const step = T > 1800 ? 600 : T > 600 ? 300 : 60; for (let t = 0; t <= T; t += step) x.fillText(fmt(t), sx(t) - 12, h - 6);
    // age bands for me
    const me = G.players[A.me]; me.stats.ageT.forEach((t, a) => { if (a && t >= 0) { x.strokeStyle = 'rgba(255,220,140,0.4)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(sx(t), Tp); x.lineTo(sx(t), h - B); x.stroke(); x.setLineDash([]); x.fillStyle = '#ffe3a6'; x.fillText(D.AGES[a].short, sx(t) + 3, Tp + 10); } });
    series.forEach((s, i) => { const col = E.Sprites.playerCol(i); x.strokeStyle = col.l; x.lineWidth = i === A.me ? 2.6 : 1.8; x.beginPath(); s.forEach(([t, v], k) => k ? x.lineTo(sx(t), sy(v)) : x.moveTo(sx(t), sy(v))); x.stroke(); });
  }
  SC.end = function () {
    const G = A.G, me = A.me, I = A.endInfo || { win: false, how: '', xp: 0, before: P.rank(), after: P.rank(), ach: [] };
    const how = { conquest: I.win ? 'Your enemies have been conquered' : 'Your civilization has fallen', wonder: I.win ? 'Your Wonder stood the test of time' : 'A rival Wonder has outlasted you', mission: I.win ? 'Mission accomplished' : (A.loseMsg || 'Mission failed'), resign: 'You resigned' }[I.how] || '';
    const cols = ['Score', 'Kills', 'Losses', 'Razed', 'Gathered', 'Techs'];
    const rows = G.players.filter(p => !(p.ai == null && !p.human)).map(p => { const s = p.stats, g = s.gathered; const col = E.Sprites.playerCol(p.id); return `<div style="color:${col.l};font-weight:700">${esc(p.name)}${p.alive ? '' : ' ✝'}</div><div>${G.score(p)}</div><div>${s.kills}</div><div>${s.losses}</div><div>${s.razed}</div><div>${Math.round(g.f + g.w + g.g + g.s)}</div><div>${s.techs}</div>`; }).join('');
    const ages = G.players.filter(p => !(p.ai == null && !p.human)).map(p => { const col = E.Sprites.playerCol(p.id); return `<div style="color:${col.l};font-weight:700">${esc(p.name)}</div>` + [1, 2, 3].map(a => `<div>${p.stats.ageT[a] >= 0 ? D.AGES[a].short + ' ' + fmt(p.stats.ageT[a]) : '—'}</div>`).join('') + `<div>${p.stats.maxArmy}</div><div>${p.stats.trained}</div><div>${Math.round(p.stats.tradeG)}</div>`; }).join('');
    const up = I.after.i > I.before.i;
    const idx = A.scen ? C.list.indexOf(A.scen) : -1; const next = I.win && idx >= 0 && idx + 1 < C.list.length ? C.list[idx + 1] : null;
    const el = mount(`<div class="panel card"><h1 class="verdict ${I.win ? 'win' : 'lose'}">${I.win ? 'VICTORY' : 'DEFEAT'}</h1><p style="text-align:center;margin:4px 0 8px;color:#e7cd98">${esc(how)} · ${fmt(G.time)}</p>
      <div class="rank">+${I.xp} XP · ${up ? '<b style="color:#ffe3a6">Promoted to ' + I.after.name + '!</b>' : I.after.name}</div><div class="xpbar"><i style="width:${(I.after.frac * 100).toFixed(0)}%"></i></div>
      ${I.ach.length ? `<div class="newach">${I.ach.map(id => { const a = ACH.find(q => q.id === id); return `<span>${a.i} ${esc(a.n)}</span>`; }).join('')}</div>` : ''}
      <div class="tabs"><button class="opt on" data-t="sum">Summary</button><button class="opt" data-t="score">Score</button><button class="opt" data-t="pop">Population</button><button class="opt" data-t="army">Army</button><button class="opt" data-t="gath">Gathering</button><button class="opt" data-t="ages">Ages</button></div>
      <div id="e_sum" class="statgrid"><div class="h">Player</div>${cols.map(c => `<div class="h">${c}</div>`).join('')}${rows}</div>
      <div id="e_ages" class="statgrid hidden"><div class="h">Player</div><div class="h">Bronze</div><div class="h">Iron</div><div class="h">Imperial</div><div class="h">Peak army</div><div class="h">Trained</div><div class="h">Trade gold</div>${ages}</div>
      <canvas id="e_graph" class="graph hidden"></canvas>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="mbtn small" id="e_menu">Main Menu</button>${next ? `<button class="mbtn small" id="e_next">Next: ${esc(next.name)}</button>` : ''}<button class="mbtn small" id="e_again">${A.scen ? 'Replay Mission' : 'Play Again'}</button><button class="mbtn small" id="e_look">View Map</button></div></div>`, 'dim');
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { el.querySelectorAll('[data-t]').forEach(q => q.classList.toggle('on', q === b)); const t = b.dataset.t; $('#e_sum').classList.toggle('hidden', t !== 'sum'); $('#e_ages').classList.toggle('hidden', t !== 'ages'); const g = $('#e_graph'); g.classList.toggle('hidden', t === 'sum' || t === 'ages'); if (t !== 'sum' && t !== 'ages') graph(g, t); });
    const toMenu = () => { A.inGame = false; X.startDemo(); A.go('title'); };
    $('#e_menu').onclick = () => { E.Audio.sfx('click'); toMenu(); };
    $('#e_again').onclick = () => { E.Audio.sfx('click'); A.inGame = false; if (A.scen) A.startMission(A.scen); else A.startSkirmish(A.settings.sk); };
    if (next) $('#e_next').onclick = () => { E.Audio.sfx('click'); A.inGame = false; A.startMission(next); };
    $('#e_look').onclick = () => { X.clearScreens(); A.screen = 'game'; const b = document.createElement('button'); b.className = 'mbtn small'; b.textContent = 'Back to results'; b.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:20'; b.onclick = () => { b.remove(); A.go('end'); }; document.body.appendChild(b); A.G.opts.reveal = 'all'; A.R.fogDirty = true; };
  };
  A.registerScreens({ init() { } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => A.boot()); else A.boot();
})(window.EMB = window.EMB || {});
