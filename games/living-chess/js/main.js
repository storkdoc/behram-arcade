/* ==========================================================================
   THE LIVING BOARD (games/living-chess) — main.js
   Menus, game flow, the minds of your pieces, hover/tap dialogue, live
   move previews, speech, keyboard / gamepad / touch, clocks, online play.
   Privacy: each side computes only its OWN pieces' thoughts locally; the
   wire carries moves (UCI), clocks and game control only.
   ========================================================================== */
import { Board3D, sqPos } from './render.js';
import { Face, EMO_COLORS, EMO_LABEL } from './faces.js';

const LC = window.LC, Mind = window.LCMind, A = window.LCAudio, V = window.LCVoice, Net = window.Net, LCEngine = window.LCEngine;
const QS = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ICON = [null, ['♙', '♟'], ['♘', '♞'], ['♗', '♝'], ['♖', '♜'], ['♕', '♛'], ['♔', '♚']];
const TNAME = Mind.TNAME;
const isTouchDev = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const FAST = QS.has('fast'); // test hook: shallow analysis

/* ---------- settings ---------- */
const DEF = { vol: { master: 0.9, music: 0.45, sfx: 0.9, voice: 0.9 }, voiceOn: true, muted: false, honest: true, ghost: true, confirm: isTouchDev, level: 2, color: '0', clock: 0 };
let S; try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem('lc-settings') || '{}')); S.vol = Object.assign({}, DEF.vol, S.vol); } catch (e) { S = JSON.parse(JSON.stringify(DEF)); }
if (QS.has('mute')) { S.muted = true; S.voiceOn = false; }
const save = () => { try { localStorage.setItem('lc-settings', JSON.stringify(S)); } catch (e) { } };
const CLOCKS = [{ n: 'NONE', b: 0, i: 0 }, { n: '3+2', b: 180, i: 2 }, { n: '5+0', b: 300, i: 0 }, { n: '10+0', b: 600, i: 0 }, { n: '15+10', b: 900, i: 10 }];
const LEVEL_DESC = ['A nervous squire. Leaves pieces hanging. Your army will feel brave.', 'A young knight. Sees one-move tricks.', 'A seasoned castellan. Punishes loose pieces.', 'A warlord. Plays sharp, practical chess.', 'The machine at full strength. Your pieces will need all their courage.'];

/* ---------- state ---------- */
const G = window.LCG = {
  booted: false, netQ: [], mode: null, me: 0, level: S.level, chess: new LC.Chess(), startFen: LC.START, history: [], mem: new Mind.Memory(),
  an: null, thr: null, th: null, gen: 0, busy: false, over: null, sel: null, cursor: 28, hoverId: null, shownId: null, pv: null, confirmUci: null,
  clock: null, clk: [0, 0], lastTick: 0, againMe: false, againThem: false, netLost: false, errors: 0, analysing: false, speakingId: null, events: [],
};
let R, engine, portraitFace;

/* ---------- boot ---------- */
async function boot() {
  const prog = f => { $('lprog').style.width = Math.round(f * 100) + '%'; };
  R = new Board3D($('gl'), { msaa: QS.has('msaa'), q: QS.get('q'), onFatal: m => window.LCFatal(m), onLost: () => toast('Graphics were reset — restoring…') });
  await R.init(f => prog(f * 0.6));
  R.hooks({ sfx: sfxHook }); G.R = R; G.Net = Net;
  G.chess = new LC.Chess(); R.sync(G.chess);
  $('lmsg').textContent = 'THE PIECES ARE STIRRING…';
  engine = LCEngine.browser('');
  const ok = await engine.init(QS.get('engine') === 'js' ? 8000 : 20000); prog(0.95);
  if (!ok) toast('The engine could not start; analysis is unavailable.');
  portraitFace = new Face(220, 0, { aspect: 0.8 }); const pc = $('portrait'); pc.width = portraitFace.c.width; pc.height = portraitFace.c.height; G.pctx = pc.getContext('2d');
  applySettings(); buildMenus(); bindInput();
  addEventListener('resize', onResize); onResize();
  prog(1); G.booted = true;
  titleScene(); show('title');
  let last = performance.now();
  const loop = now => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { frame(dt); } catch (e) { console.error(e); if (++G.errors > 8) window.LCFatal('render loop: ' + (e.message || e)); }
  };
  requestAnimationFrame(loop);
}
function sfxHook(n, o = {}) {
  if (n === 'step') A.step(o.type); else if (n === 'gasp') A.gasp(o.type); else if (n === 'cry') A.cry(o.type);
  else if (n === 'clash') A.clash(o.i); else if (n === 'death') A.death(); else if (n === 'promo') A.fanfare(false);
  else if (n === 'check') A.check(); else if (n === 'mate') A.mate(o.win === G.me);
}

/* ---------- screens ---------- */
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id); G.screen = id; const hud = id === null; $('hud').classList.toggle('hidden', !hud); onResize(); if (id) focusFirst(id); }
function focusFirst(id) { const b = document.querySelector('#' + id + ' .btn'); if (b && !isTouchDev) b.focus({ preventScroll: true }); }
function toast(t, ms = 2600) { const e = $('toast'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.add('hidden'), ms); }
function onResize() {
  if (!R) return; R._sized = false; R.resize();
  const hud = !$('hud').classList.contains('hidden'), W = innerWidth, H = innerHeight;
  if (!hud) { R.setInsets({ top: 0, bottom: 0, left: 0, right: 0 }); return; }
  const side = $('side').getBoundingClientRect(), narrow = W <= 760 || W <= H;
  R.setInsets(narrow ? { top: 46, bottom: H - side.top + 4, left: 0, right: 0 } : { top: 44, bottom: 8, left: 8, right: W - side.left + 8 });
}
function titleScene() { G.mode = null; G.gen++; G.chess = new LC.Chess(); R.resetReactions(); R.sync(G.chess); R.setLast(null); R.setSel(null); R.setDots([]); R.setGhost(null); R.setOrientation(0, false); R.shot(new THREE_V(0, 0, 0), { dist: 10.5, el: 0.62, hold: 999, k: 0.8, orbit: 0.06, focus: 0 }); idleMoods(); }
function THREE_V(x, y, z) { return sqPos(0, 0).set(x, y, z); }
function idleMoods() { // menus: pieces fidget with gentle, believable moods
  const emos = ['calm', 'calm', 'longing', 'pride', 'anxiety', 'joy'];
  for (const c of R.chars.values()) { const e = emos[(c.id * 7 + (Date.now() >> 12)) % emos.length]; c.setState(e, 0.4, e === 'longing' ? 'gaze' : e === 'pride' ? 'chest' : e === 'anxiety' ? 'glance' : 'idle', null); }
}

/* ---------- menus ---------- */
function chips(el, items, get, set) {
  el.innerHTML = ''; items.forEach((it, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = it; b.onclick = () => { set(i); refresh(); }; el.appendChild(b); });
  const refresh = () => [...el.children].forEach((b, i) => b.classList.toggle('on', get() === i)); refresh(); return refresh;
}
function buildMenus() {
  document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; act(b.dataset.act); });
  const rl = chips($('levels'), LCEngine.LEVELS.map(l => l.name), () => S.level, i => { S.level = i; save(); $('leveldesc').textContent = LEVEL_DESC[i]; }); $('leveldesc').textContent = LEVEL_DESC[S.level]; void rl;
  chips($('clocks'), CLOCKS.map(c => c.n), () => S.clock, i => { S.clock = i; save(); });
  chips($('hclocks'), CLOCKS.map(c => c.n), () => S.clock, i => { S.clock = i; save(); });
  const cs = [...$('colors').children]; const rc = () => cs.forEach(b => b.classList.toggle('on', b.dataset.c === String(S.color))); cs.forEach(b => b.onclick = () => { S.color = b.dataset.c; save(); rc(); }); rc();
  $('bAgain').onclick = rematch; $('bQuit').onclick = quitToMenu; $('bReview').onclick = () => $('over').classList.add('hidden');
  $('bCounsel').onclick = counsel; $('bUndo').onclick = undo; $('bHon').onclick = toggleHonest; $('bMenu').onclick = () => $('gmenu').classList.toggle('hidden');
  $('gmenu').onclick = e => { const g = e.target.dataset.g; if (!g) return; $('gmenu').classList.add('hidden'); if (g === 'settings') { G.settingsFrom = null; show('settings'); } else if (g === 'resign') resign(); else if (g === 'quit') quitToMenu(); };
  $('bSpeak').onclick = () => { S.voiceOn = !S.voiceOn; save(); applySettings(); toast(S.voiceOn ? 'Voices on' : 'Voices off'); };
  for (const [id, k] of [['vMaster', 'master'], ['vMusic', 'music'], ['vSfx', 'sfx'], ['vVoice', 'voice']]) { const el = $(id); el.value = S.vol[k]; el.oninput = () => { S.vol[k] = +el.value; save(); applySettings(); }; }
  $('bVoice').onclick = () => { S.voiceOn = !S.voiceOn; save(); applySettings(); if (S.voiceOn) V.say('My liege. We are listening.', { voice: 'king', emo: 'calm', interrupt: true }); };
  $('bMute').onclick = () => { S.muted = !S.muted; save(); applySettings(); };
  $('bHonest').onclick = toggleHonest; $('bGhost').onclick = () => { S.ghost = !S.ghost; save(); applySettings(); if (!S.ghost) R.setGhost(null); };
  $('bConfirm').onclick = () => { S.confirm = !S.confirm; save(); applySettings(); };
  $('jcode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') joinCode(); });
  document.querySelector('[data-j="code"]').onclick = joinCode; document.querySelector('[data-j="scan"]').onclick = () => { Net.joinAny(); };
}
function applySettings() {
  A.setMuted(S.muted); A.setVol('master', S.vol.master); A.setVol('music', S.vol.music); A.setVol('sfx', S.vol.sfx);
  V.setOn(S.voiceOn && !S.muted); V.setVol(S.vol.voice);
  $('bVoice').textContent = 'VOICES: ' + (S.voiceOn ? 'ON' : 'OFF'); $('bMute').textContent = 'SOUND: ' + (S.muted ? 'OFF' : 'ON');
  $('bHonest').textContent = S.honest ? 'HONEST COUNSEL' : 'RAW EMOTIONS'; $('bHon').textContent = S.honest ? '⚖ HONEST' : '❤ RAW'; $('bHon').classList.toggle('on', S.honest);
  $('bGhost').textContent = 'GHOST PATHS: ' + (S.ghost ? 'ON' : 'OFF'); $('bConfirm').textContent = 'TAP TWICE TO MOVE: ' + (S.confirm ? 'ON' : 'OFF');
  $('bSpeak').textContent = S.voiceOn && !S.muted ? '🔊' : '🔇';
  $('vlist').innerHTML = V.supported ? 'Voices: ' + ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].map(k => `<b>${k[0].toUpperCase() + k.slice(1)}</b> ${V.voiceName(k)}`).join(' · ') : 'Speech is not available in this browser; captions only.';
}
function act(a) {
  A.unlock(); V.unlock(); A.tick();
  if (a === 'solo') show('solo');
  else if (a === 'how') show('how');
  else if (a === 'settings') { G.settingsFrom = G.screen; applySettings(); show('settings'); }
  else if (a === 'closeSettings') { if (G.mode) show(null); else show(G.settingsFrom || 'title'); }
  else if (a === 'back') { show('title'); }
  else if (a === 'startSolo') { const c = S.color === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +S.color; newGame({ mode: 'solo', me: c, level: S.level, clock: CLOCKS[S.clock] }); }
  else if (a === 'host') { hostGame(); }
  else if (a === 'join') { joinGame(); }
  else if (a === 'leaveNet') { Net.leave(); G.mode = null; show('title'); }
  else if (a === 'practice') { newGame({ mode: 'practice', me: 0, level: Math.min(S.level, 2), clock: CLOCKS[0] }); toast('Practise while you wait. When your buddy arrives they take over Black.', 4000); }
}

/* ---------- game setup ---------- */
function newGame(o) {
  G.gen++; V.stop(); engine && engine.stop();
  G.mode = o.mode; G.me = o.me; G.level = o.level != null ? o.level : G.level; G.startFen = o.fen || LC.START;
  G.chess = new LC.Chess(G.startFen); G.history = []; G.mem = new Mind.Memory(); G.mem.init(G.chess);
  for (const u of o.moves || []) { const before = G.chess.clone(); const rec = G.chess.play(u); if (!rec) break; G.history.push(rec); G.mem.observe(before, rec); }
  G.netQ = []; G.an = G.thr = G.th = null; G.over = null; G.sel = null; G.pv = null; G.confirmUci = null; G.againMe = G.againThem = false; G.netLost = false;
  const ck = o.clock || CLOCKS[0]; G.clock = ck.b ? { b: ck.b, i: ck.i, n: ck.n } : null; G.clk = o.clk ? o.clk.slice() : [ck.b * 1000, ck.b * 1000]; G.lastTick = performance.now();
  G.cursor = G.me ? 52 : 12;
  R.endShot(); R.resetReactions(); R.setOrientation(G.me, R.orient !== G.me); R.sync(G.chess); R.setLast(G.history[G.history.length - 1] || null); R.setSel(null); R.setDots([]); R.setGhost(null); R.setGhost(null, 'counsel'); R.setCursor(isTouchDev ? null : G.cursor); R.clearThoughts();
  $('over').classList.add('hidden'); $('promo').classList.add('hidden'); $('gmenu').classList.add('hidden'); $('pv').classList.add('hidden');
  $('nMe').textContent = 'YOU · ' + (G.me ? 'BLACK' : 'WHITE'); $('nOpp').textContent = (G.mode === 'solo' || G.mode === 'practice' ? LCEngine.LEVELS[G.level].name : 'BUDDY') + ' · ' + (G.me ? 'WHITE' : 'BLACK');
  $('bUndo').disabled = !(G.mode === 'solo' || G.mode === 'practice');
  setDialog(null);
  show(null); A.music(true); updateMoves(); updateClocks();
  nextTurn();
}
function quitToMenu() { if (G.mode === 'host' || G.mode === 'guest' || G.mode === 'practice') { safeSend({ t: 'bye' }); Net.leave(); } V.stop(); $('over').classList.add('hidden'); titleScene(); show('title'); }
function safeSend(o) { try { Net.send(o); } catch (e) { } }

/* ---------- the turn loop ---------- */
const myTurn = () => !G.over && G.chess.turn === G.me && (G.mode !== null);
const aiSide = () => G.mode === 'solo' || G.mode === 'practice' || (G.mode === 'host' && G.netLost);
async function nextTurn() {
  const g = ++G.gen;
  updateHud(); updateMoves();
  const st = G.chess.status();
  if (st.over) return gameOver(st);
  if (st.check) R.checkAlarm(G.chess.kings[G.chess.turn], G.chess.turn); else R.setCheck(null);
  publicBody();
  if (G.chess.turn === G.me) await analyseMine(g);
  else if (aiSide()) await aiMove(g);
  else { setStatus('YOUR BUDDY IS THINKING…'); }
}
function analysisCfg(legal) {
  const js = engine.kind === 'js';
  if (FAST) return { multipv: Math.min(legal, 30), depth: js ? 3 : 7, movetime: 600 };
  if (js) return { multipv: Math.min(legal, 24), depth: 4, movetime: 1400 };
  return R.mobile ? { multipv: Math.min(legal, 40), depth: 10, movetime: 1500 } : { multipv: Math.min(legal, 60), depth: 12, movetime: 1900 };
}
async function analyseMine(g) {
  G.analysing = true; setStatus(G.chess.inCheck() ? 'CHECK! YOUR ARMY IS LOOKING AHEAD…' : 'YOUR MOVE · YOUR ARMY IS LOOKING AHEAD…');
  const fen = G.chess.fen(), legal = G.chess.moves().length;
  try {
    const an = await engine.analyse(fen, analysisCfg(legal)); if (g !== G.gen) return;
    let thr = null; const nc = Mind.nullMove(G.chess);
    if (nc && nc.moves().length) thr = await engine.analyse(nc.fen(), { multipv: 2, depth: FAST ? 5 : engine.kind === 'js' ? 3 : 8, movetime: 500 });
    if (g !== G.gen) return;
    G.an = an; G.thr = thr;
  } catch (e) { console.warn(e); if (g !== G.gen) return; G.an = { lines: [] }; G.thr = null; }
  G.analysing = false; computeThoughts(true);
  setStatus(G.chess.inCheck() ? 'CHECK! YOUR MOVE' : 'YOUR MOVE');
}
function computeThoughts(callouts) {
  if (!G.an || G.chess.turn !== G.me) return;
  G.th = Mind.think(G.chess, G.an, G.thr, G.mem, { honest: S.honest });
  for (const id in G.th.pieces) R.applyThought(+id, G.th.pieces[id]);
  if (G.shownId != null && G.th.pieces[G.shownId]) setDialog(G.th.pieces[G.shownId]);
  if (!callouts) return;
  // the most desperate / excited pieces call out before you move
  const list = Object.values(G.th.pieces).filter(t => t.urgency >= 0.5).sort((a, b) => b.urgency - a.urgency).slice(0, 2);
  list.forEach((t, i) => { const c = R.chars.get(t.id); if (c) c.callout = 3 + i; });
  if (list.length) {
    const top = list[0];
    if (G.hoverId == null) { setDialog(top); speak(top, false); G.bubble = { id: top.id, text: firstSentence(top.text), t: 4.5, emo: top.emotion }; }
    if (list[1] && list[1].urgency > 0.7) setTimeout(() => { if (G.th && G.th.pieces[list[1].id] === list[1] && G.hoverId == null) speak(list[1], false); }, 600);
  } else if (G.hoverId == null && G.shownId == null) setDialog(null);
}
const firstSentence = t => { t = t.replace(/\s*\(Counsel:[^)]*\)/, ''); const m = /^(.{12,}?[.!?])(\s|$)/.exec(t); return (m ? m[1] : t).slice(0, 110); };

async function aiMove(g) {
  const name = G.mode === 'host' ? 'YOUR BUDDY LEFT · THE MACHINE PLAYS ON…' : 'THE MACHINE IS THINKING…';
  setStatus(name);
  const t0 = performance.now(); let uci = null;
  try { uci = await engine.bestMove(G.chess.fen(), G.level); } catch (e) { console.warn(e); }
  if (g !== G.gen) return;
  if (!uci || !G.chess.parse(uci)) { const ms = G.chess.moves(); if (!ms.length) return; uci = LC.uci(ms[Math.floor(Math.random() * ms.length)]); }
  const wait = (FAST ? 150 : 650) - (performance.now() - t0); if (wait > 0) await sleep(wait);
  if (g !== G.gen) return;
  await doMove(uci, 'ai');
}

/* public body language of the opponent (attacked pieces flinch, otherwise calm). No private thoughts. */
function publicBody() {
  const opp = 1 - G.me, c = G.chess;
  for (const pc of c.pieceList(opp)) { const at = c.attackers(pc.sq, G.me); if (at.length && pc.t !== LC.P) R.applyPublic(pc.id, 'anxiety', 0.6, at[0]); else R.applyPublic(pc.id, 'calm', 0.3, null); }
  if (G.chess.turn !== G.me) for (const pc of c.pieceList(G.me)) { const ch = R.chars.get(pc.id); if (ch && ch.gesture === 'point') ch.gesture = 'glance'; }
}

/* ---------- making moves ---------- */
async function doMove(uci, src) {
  if (G.busy) return false;
  const before = G.chess.clone(), rec = G.chess.play(uci); if (!rec) return false;
  G.busy = true; G.gen++;
  const mover = LC.colOf(rec.piece);
  G.history.push(rec); G.mem.observe(before, rec);
  if (G.clock && (G.mode === 'solo' || G.mode === 'host' || G.mode === 'practice')) G.clk[mover] += G.clock.i * 1000;
  // network: the host relays every accepted move; the guest only sends its own
  if (G.mode === 'host' && !G.netLost) safeSend({ t: 'mv', uci: rec.uci, ply: G.history.length - 1, clk: G.clk });
  if (G.mode === 'guest' && src === 'me') safeSend({ t: 'mv', uci: rec.uci, ply: G.history.length - 1 });
  clearSelection(); R.setGhost(null, 'counsel'); R.setCounsel(null); $('pv').classList.add('hidden');
  if (src === 'me' || mover !== G.me) V.stop(); G.bubble = null;
  G.th = null; G.an = null;
  if (mover === G.me) for (const c of R.chars.values()) if (c.side === G.me) c.callout = 0;
  updateMoves(); updateHud();
  try { await R.playMove(rec, G.chess, { cinematic: !FAST }); } catch (e) { console.error(e); R.sync(G.chess); }
  afterMoveWords(rec, mover);
  G.busy = false;
  nextTurn(); drainNet();
  return true;
}
const LOSS = ['No… not the {v}!', 'The {v} on {sq} is gone. Make it mean something.', 'They took our {v}. I saw it coming.', 'Our {v}… I will remember this.'];
const KILL = ['For the army!', 'One less {v} in the world.', 'Their {v} falls!', 'That is for our fallen.'];
function afterMoveWords(rec, mover) {
  if (!rec.captured) return;
  const vt = rec.captured & 7, sq = LC.sqName(rec.capSq);
  if (mover === G.me) { const t = KILL[(G.history.length) % KILL.length].replace('{v}', TNAME[vt]); const c = R.chars.get(rec.id); G.bubble = { id: rec.id, text: t, t: 2.5, emo: 'joy' }; sayAs(rec.id, LC.typeOf(rec.piece), t, 'joy', false); void c; }
  else {
    // a nearby friend of the fallen grieves (it is our piece, so we may hear it)
    let best = null, bd = 99; for (const pc of G.chess.pieceList(G.me)) { const d = Math.max(Math.abs((pc.sq & 7) - (rec.capSq & 7)), Math.abs((pc.sq >> 3) - (rec.capSq >> 3))); if (d < bd) { bd = d; best = pc; } }
    if (best) { const t = LOSS[G.history.length % LOSS.length].replace('{v}', TNAME[vt]).replace('{sq}', sq); G.bubble = { id: best.id, text: t, t: 2.5, emo: 'grief' }; sayAs(best.id, best.t, t, 'grief', false); }
  }
}
function legalFrom(sq) { return G.chess.moves({ from: sq }); }
function clearSelection() { G.sel = null; G.pv = null; G.confirmUci = null; R.setSel(null); R.setDots([]); if (S.ghost) R.setGhost(null); $('pv').classList.add('hidden'); }
function select(sq) {
  if (!myTurn() || G.busy) return;
  const p = G.chess.board[sq]; if (!p || LC.colOf(p) !== G.me) { clearSelection(); return; }
  G.sel = sq; G.confirmUci = null; R.setSel(sq); A.select();
  const ms = legalFrom(sq); R.setDots([...new Set(ms.map(m => m.to))], s => !!G.chess.board[s] || ms.some(m => m.to === s && m.flags === 'e'));
  const id = G.chess.ids[sq]; showPiece(id, true);
}
async function tryMove(to, viaTouch) {
  if (G.sel == null || !myTurn() || G.busy) return false;
  const ms = legalFrom(G.sel).filter(m => m.to === to); if (!ms.length) return false;
  let m = ms.find(x => !x.promo || x.promo === LC.Q) || ms[0], u = LC.uci(m);
  if (viaTouch && S.confirm && G.confirmUci !== u) { G.confirmUci = u; previewMove(u, true); return false; }
  if (ms.length > 1 && ms[0].promo) { const pick = await askPromo(); if (!pick) return false; m = ms.find(x => x.promo === pick) || ms[0]; u = LC.uci(m); }
  return doMove(u, 'me');
}
function askPromo() {
  return new Promise(res => {
    const box = $('promo'), btns = box.querySelector('.pbtns'); btns.innerHTML = '';
    for (const t of [LC.Q, LC.R, LC.B, LC.N]) { const b = document.createElement('button'); b.textContent = ICON[t][G.me]; b.title = TNAME[t]; b.onclick = () => { box.classList.add('hidden'); G.promoRes = null; res(t); }; btns.appendChild(b); }
    box.classList.remove('hidden'); G.promoRes = v => { box.classList.add('hidden'); G.promoRes = null; res(v); };
  });
}

/* ---------- previews: the army reacts to a move you are considering ---------- */
let pvSpeakAt = 0;
function previewMove(u, sticky) {
  if (!G.an || !myTurn()) return;
  if (G.pv && G.pv.uci === u && !sticky) return;
  const p = Mind.preview(G.chess, G.an, u, G.th); if (!p) return; G.pv = p;
  const target = sqPos(LC.sqIdx(u.slice(2, 4)), 0.4);
  for (const id in p.pieces) { const c = R.chars.get(+id); if (c) c.doReact(p.pieces[id].react, 2.6, p.pieces[id].react === 'watch' ? null : target); }
  if (S.ghost) R.setGhost(p.line, 'preview', G.me);
  const selId = G.chess.ids[LC.sqIdx(u.slice(0, 2))], mine = p.pieces[selId];
  const cnt = k => Object.values(p.pieces).filter(x => x.react === k).length;
  const horror = cnt('horror'), cheer = cnt('cheer');
  const V_TXT = { mate: 'LEADS TO MATE', best: 'THE ARMY APPROVES', ok: 'PLAYABLE', dubious: 'DOUBTFUL', blunder: 'BLUNDER' };
  const loudest = Object.entries(p.pieces).find(([, x]) => x.react === 'horror') || Object.entries(p.pieces).find(([, x]) => x.react === 'cheer');
  $('pv').innerHTML = `<b>${p.san}</b> — <span class="v ${p.verdict}">${S.honest ? V_TXT[p.verdict] : (horror ? 'THEY ARE AFRAID' : cheer ? 'THEY ARE EXCITED' : 'THEY WATCH')}</span>` +
    (S.honest && p.sans.length > 1 ? `<div>Foreseen: ${p.sans.slice(0, 6).join(' ')}</div>` : '') +
    (mine && mine.txt ? `<div>${TNAME[G.chess.board[LC.sqIdx(u.slice(0, 2))] & 7]}: “${esc(mine.txt)}”</div>` : '') +
    (horror ? `<div>${horror} of your pieces recoil in horror.</div>` : cheer ? `<div>${cheer} of your pieces cheer.</div>` : '') +
    (G.confirmUci === u ? '<div class="tap">TAP AGAIN TO PLAY</div>' : '');
  $('pv').classList.remove('hidden');
  // the loudest reaction speaks (rate-limited, interrupts the old line)
  const now = performance.now();
  if (loudest && (p.verdict === 'blunder' || p.verdict === 'mate' || loudest[1].react === 'horror') && now - pvSpeakAt > 1400) {
    pvSpeakAt = now; const id = +loudest[0], c = R.chars.get(id);
    if (c) { sayAs(id, c.type, loudest[1].txt, loudest[1].react === 'horror' ? 'terror' : 'thrill', true); G.bubble = { id, text: loudest[1].txt, t: 2.4, emo: loudest[1].react === 'horror' ? 'horror' : 'joy' }; }
  }
}
function unpreview() { if (!G.pv) return; G.pv = null; if (S.ghost) R.setGhost(null); $('pv').classList.add('hidden'); for (const c of R.chars.values()) if (c.side === G.me && c.reactT > 0 && c.reactT < 2.7) { c.react = null; c.reactT = 0; } }

/* ---------- dialogue window ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TONE = { honest: 'HONEST', selfish: 'SELFISH · THINKING OF ITSELF', reckless: 'RECKLESS · WANTS GLORY', selfless: 'SELFLESS', doomed: 'DOOMED · ACCEPTS IT' };
function setDialog(th, enemy) {
  const dlg = $('dlg');
  if (!th) {
    G.shownId = null; portraitFace.side = G.me; G.portraitEmo = 'calm';
    $('dname').textContent = 'YOUR ARMY'; $('demo').textContent = G.analysing ? 'LOOKING AHEAD…' : 'LISTENING'; $('dtone').textContent = ''; $('picon').textContent = ICON[6][G.me];
    $('dtext').textContent = isTouchDev ? 'Tap one of your pieces to hear what it sees coming.' : 'Hover over one of your pieces to hear what it sees coming.'; $('dfore').innerHTML = ''; $('dadv').innerHTML = '';
    dlg.style.setProperty('--emo', '#e8c27a'); return;
  }
  if (enemy) {
    G.shownId = null; portraitFace.side = 1 - G.me; G.portraitEmo = th.emo; G.portraitInt = th.inten;
    $('dname').textContent = 'ENEMY ' + TNAME[th.type].toUpperCase() + ' · ' + LC.sqName(th.sq); $('demo').textContent = th.emo === 'anxiety' ? 'LOOKS NERVOUS' : 'GIVES NOTHING AWAY'; $('dtone').textContent = ''; $('picon').textContent = ICON[th.type][1 - G.me];
    $('dtext').textContent = th.note; $('dfore').innerHTML = ''; $('dadv').innerHTML = ''; dlg.style.setProperty('--emo', '#888'); return;
  }
  G.shownId = th.id; portraitFace.side = th.side; G.portraitEmo = th.emotion; G.portraitInt = th.intensity;
  $('dname').textContent = th.name.toUpperCase() + ' · ' + LC.sqName(th.sq);
  $('demo').textContent = EMO_LABEL[th.emotion] || th.emotion.toUpperCase();
  const tone = S.honest && th.tone ? th.tone : ''; $('dtone').textContent = tone ? TONE[tone] || tone.toUpperCase() : ''; $('dtone').className = 'dtone ' + tone;
  $('picon').textContent = ICON[th.type][th.side];
  const m = /^(.*?)\s*\((Counsel:[^)]*)\)\s*$/.exec(th.text);
  $('dtext').innerHTML = m ? `“${esc(m[1])}”<span class="note">${esc(m[2])}</span>` : `“${esc(th.text)}”`;
  $('dfore').innerHTML = S.honest ? (th.foresee || []).slice(0, 3).map(f => `<li class="${/die|threat/.test(f.kind) ? 'bad' : 'good'}">${esc(f.txt)}</li>`).join('') : '';
  $('dadv').innerHTML = th.advice ? `<span>${S.honest ? 'Advises' : 'Begs for'}: <b>${esc(th.advice.san)}</b></span><button id="bShow">SHOW ME</button>` : '';
  const bs = $('bShow'); if (bs) bs.onclick = () => showAdvice(th);
  dlg.style.setProperty('--emo', EMO_COLORS[th.emotion] || '#e8c27a');
}
function showAdvice(th) {
  if (!th.advice) return; const u = th.advice.uci; R.setCounsel(u); A.counsel();
  const p = G.an && Mind.preview(G.chess, G.an, u, G.th); if (p && S.ghost) R.setGhost(p.line, 'counsel', G.me);
}
function showPiece(id, speakIt, interrupt = true) {
  if (G.over) return;
  const sq = G.chess.ids.indexOf(id); if (sq < 0) return;
  const p = G.chess.board[sq], side = LC.colOf(p);
  if (side === G.me) {
    const th = G.th && G.th.pieces[id];
    if (th) { setDialog(th); if (speakIt) speak(th, interrupt); }
    else { const c = R.chars.get(id); setDialog({ id, sq, type: p & 7, side, name: TNAME[p & 7], emotion: c ? c.emo : 'calm', intensity: 0.4, text: G.chess.turn === G.me ? 'Let me think… I am looking ahead.' : 'Shh. Watch what they do.', foresee: [], tone: null }); }
  } else {
    const at = G.chess.attackers(sq, G.me);
    const note = at.length ? `Your ${TNAME[G.chess.board[at[0]] & 7]} on ${LC.sqName(at[0])} has it in sight. It is sweating. Its thoughts are its own.` : 'Its thoughts belong to the other side of the board. You can only read its body.';
    setDialog({ type: p & 7, sq, emo: at.length ? 'anxiety' : 'calm', inten: 0.5, note }, true);
  }
}
function speak(th, interrupt) { sayAs(th.id, th.type, th.text, th.emotion, interrupt, th.voice); }
function sayAs(id, type, text, emo, interrupt, voiceKey) {
  const key = voiceKey || ({ 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' })[type];
  const c = () => R.chars.get(id);
  G.events.push({ t: 'say', id, text: text.slice(0, 60) });
  V.say(text, { voice: key, emo, interrupt,
    onstart: () => { G.speakingId = id; $('dlg').classList.toggle('speaking', G.shownId === id); },
    onword: k => { const ch = c(); if (ch) { ch.face.talk(k); ch.talk = 0.35; } if (G.shownId === id) portraitFace.talk(k); },
    onend: () => { if (G.speakingId === id) { G.speakingId = null; $('dlg').classList.remove('speaking'); } } });
  if (!V.supported || !S.voiceOn || S.muted) A.murmur(type, emo);
}

/* ---------- counsel / undo / honest ---------- */
function counsel() {
  if (!myTurn() || !G.th || !G.th.army) { toast(G.analysing ? 'The army is still looking ahead…' : 'No counsel right now.'); return; }
  const a = G.th.army; R.setCounsel(a.uci); A.counsel(); if (S.ghost) R.setGhost(a.steps, 'counsel', G.me);
  const from = LC.sqIdx(a.uci.slice(0, 2)), c = R.chars.get(G.chess.ids[from]); if (c) c.doReact('brave', 3);
  $('pv').innerHTML = `<b>THE ARMY'S COUNSEL: ${a.san}</b>${S.honest ? ` <span class="v best">${G.th.evalTxt}</span><div>Foreseen: ${a.line.join(' ')}</div>` : ''}`; $('pv').classList.remove('hidden');
  const kingSq = G.chess.kings[G.me], kingId = G.chess.ids[kingSq], kt = G.th.pieces[kingId];
  const rest = a.line.slice(1, 4);
  const sc = a.score, mood = sc > 300 ? 'joy' : sc < -150 ? 'anxiety' : 'calm';
  const words = S.honest
    ? `Hear me: ${a.san}.` + (rest.length ? ` I see ${rest.join(', ')} after it.` : '') + (sc >= 10000 ? ' It ends in their mate.' : sc > 150 ? ' We will stand ahead.' : sc < -150 ? ' It is the least bad road we have.' : ' It keeps us whole.')
    : `My heart says ${a.san}. Do not ask me why.`;
  setDialog({ id: kingId, sq: kingSq, type: 6, side: G.me, name: 'King', emotion: mood, intensity: 0.6, text: words, foresee: kt ? kt.foresee : [], tone: 'honest', advice: { uci: a.uci, san: a.san } });
  sayAs(kingId, 6, words, mood, true, kt && kt.voice);
  G.events.push({ t: 'counsel', uci: a.uci });
}
function undo() {
  if (!(G.mode === 'solo' || G.mode === 'practice') || G.busy || G.history.length === 0) return;
  let n = G.chess.turn === G.me ? 2 : 1; if (G.over && G.chess.turn !== G.me) n = 1;
  if (G.history.length < n) return toast('Nothing to undo.');
  G.gen++; engine.stop(); V.stop();
  for (let i = 0; i < n; i++) { G.chess.undo(); G.history.pop(); G.mem.unobserve(); }
  G.over = null; $('over').classList.add('hidden');
  R.resetReactions(); R.sync(G.chess); R.setLast(G.history[G.history.length - 1] || null); clearSelection(); R.clearThoughts(); R.setCounsel(null);
  A.tick(); toast('Undone.'); nextTurn();
}
function toggleHonest() { S.honest = !S.honest; save(); applySettings(); computeThoughts(false); toast(S.honest ? 'Honest counsel: selfish advice is labelled and costed.' : 'Raw emotions: only what they feel.'); }
function resign() {
  if (!G.mode || G.over) return;
  if (G.mode === 'guest') safeSend({ t: 'resign' }); else if (G.mode === 'host') safeSend({ t: 'over', result: G.me ? '1-0' : '0-1', reason: 'resignation', winner: 1 - G.me });
  gameOver({ over: true, result: G.me ? '1-0' : '0-1', reason: 'resignation', winner: 1 - G.me });
}

/* ---------- game over ---------- */
function gameOver(st) {
  if (G.over) return; G.over = st; G.gen++; G.busy = false; clearSelection(); R.setCounsel(null);
  const win = st.winner === G.me, draw = st.winner === -1;
  updateHud();
  const loserK = st.winner >= 0 ? G.chess.kings[1 - st.winner] : -1;
  if (st.reason === 'checkmate') R.mateSeq(loserK, 1 - st.winner, st.winner); else if (draw) { R.drawSeq(); A.death(); } else { for (const c of R.chars.values()) c.doReact(c.side === st.winner ? 'cheer' : 'mourn', 9999); A.mate(win); }
  const kId = G.chess.ids[G.chess.kings[G.me]];
  const last = draw ? 'Peace. We all live to see another game.' : win ? 'Victory! Every one of us who fell, fell for this.' : st.reason === 'checkmate' ? 'It is over. Forgive me… I could not escape.' : 'We lay down our arms.';
  setTimeout(() => sayAs(kId, 6, last, draw ? 'calm' : win ? 'joy' : 'grief', true), 900);
  A.setMood(win ? 1 : -1);
  const title = st.reason === 'checkmate' ? (win ? 'CHECKMATE — YOU WIN' : 'CHECKMATE') : draw ? 'DRAW' : win ? 'YOU WIN' : 'DEFEAT';
  const sub = (draw ? `By ${st.reason}.` : st.reason === 'checkmate' ? (win ? 'The enemy King has fallen. Your army is cheering.' : 'Your King falls. The army mourns.') : `By ${st.reason}.`) + ` (${st.result})`;
  setTimeout(() => { if (G.over !== st) return; $('otitle').textContent = title; $('osub').textContent = sub; $('over').classList.remove('hidden'); $('bAgain').textContent = G.mode === 'host' || G.mode === 'guest' ? 'REMATCH (SWAP SIDES)' : 'PLAY AGAIN'; }, st.reason === 'checkmate' ? 3600 : 1200);
  setStatus(title); G.events.push({ t: 'over', st: { result: st.result, reason: st.reason, winner: st.winner } });
}
function rematch() {
  if (G.mode === 'solo' || G.mode === 'practice' || (G.mode === 'host' && G.netLost)) { newGame({ mode: G.mode === 'host' ? 'solo' : G.mode, me: G.me, level: G.level, clock: G.clock ? CLOCKS.find(c => c.n === G.clock.n) : CLOCKS[0] }); return; }
  G.againMe = true; safeSend({ t: 'again' }); $('bAgain').textContent = 'WAITING FOR YOUR BUDDY…';
  if (G.mode === 'host' && G.againThem) hostStart(1 - G.hostSide);
}

/* ---------- online ---------- */
function hostGame() {
  show('online'); $('ocode').textContent = ''; $('ostat').textContent = 'OPENING THE LINE…'; G.netWatch = 'host';
  Net.onMessage = onNet; Net.host();
}
function joinGame() { show('join'); $('jstat').textContent = 'LOOKING FOR A GAME IN PROGRESS…'; G.netWatch = 'join'; Net.onMessage = onNet; Net.joinAny(); }
function joinCode() { const c = $('jcode').value.trim().toUpperCase(); if (c.length !== 5) { $('jstat').textContent = 'THE BACKUP CODE HAS 5 LETTERS.'; return; } Net.join(c); }
function hostStart(hostSide, keep) {
  G.hostSide = hostSide; G.againMe = G.againThem = false;
  if (keep && G.mode === 'practice') { // the guest takes over the machine's side, mid-game
    G.mode = 'host'; G.gen++; engine.stop();
    $('nOpp').textContent = 'BUDDY · ' + (G.me ? 'WHITE' : 'BLACK'); $('bUndo').disabled = true;
    safeSend({ t: 'go', fen: G.startFen, moves: G.history.map(r => r.uci), clock: G.clock ? CLOCKS.findIndex(c => c.n === G.clock.n) : 0, clk: G.clk, hostSide: G.me });
    toast('Your buddy has arrived and takes command of the ' + (G.me ? 'white' : 'black') + ' army!', 4000);
    nextTurn(); return;
  }
  const ck = CLOCKS[S.clock] || CLOCKS[0];
  newGame({ mode: 'host', me: hostSide, clock: ck });
  safeSend({ t: 'go', fen: LC.START, moves: [], clock: S.clock, clk: G.clk, hostSide });
}
function onNet(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') { if (Net.st.role === 'host') { if (G.mode === 'practice') hostStart(0, true); else if (G.mode !== 'host') hostStart(0); } return; }
  if (Net.st.role === 'host') {
    if (d.t === 'mv') {
      const guestSide = 1 - G.me;
      if (G.over || G.chess.turn !== guestSide || d.ply !== G.history.length || !G.chess.parse(d.uci) || !legalUci(d.uci)) { safeSend({ t: 'rej', ply: d.ply }); safeSend({ t: 'go', fen: G.startFen, moves: G.history.map(r => r.uci), clock: S.clock, clk: G.clk, hostSide: G.me, resync: 1 }); return; }
      netMove(d.uci);
    } else if (d.t === 'resign') { gameOver({ over: true, result: G.me ? '0-1' : '1-0', reason: 'resignation', winner: G.me }); }
    else if (d.t === 'again') { G.againThem = true; toast('Your buddy wants a rematch.'); if (G.againMe) hostStart(1 - G.hostSide); }
    else if (d.t === 'bye') { netGone('YOUR BUDDY LEFT THE GAME.'); }
  } else {
    if (d.t === 'go') {
      if (d.resync && G.mode === 'guest') { const hist = d.moves || []; if (hist.length === G.history.length && hist.every((u, i) => u === G.history[i].uci)) return; }
      newGame({ mode: 'guest', me: 1 - (d.hostSide || 0), fen: d.fen, moves: d.moves, clock: CLOCKS[d.clock || 0], clk: d.clk });
      toast(d.moves && d.moves.length && !d.resync ? 'You take command of the ' + (G.me ? 'black' : 'white') + ' army, mid-battle!' : 'Your buddy is here. To arms!', 3500);
    } else if (d.t === 'mv') {
      if (d.clk) { G.clk = d.clk.slice(); G.lastTick = performance.now(); }
      if (d.ply === G.history.length + G.netQ.length) netMove(d.uci);
    } else if (d.t === 'over') { gameOver({ over: true, result: d.result, reason: d.reason, winner: d.winner }); }
    else if (d.t === 'again') { G.againThem = true; toast('Your buddy wants a rematch.'); }
    else if (d.t === 'bye') { netGone('YOUR BUDDY LEFT THE GAME.'); }
  }
}
/* remote moves wait their turn while a local animation is still playing */
function netMove(u) { G.netQ.push(u); drainNet(); }
function drainNet() { if (G.busy || !G.netQ.length) return; const u = G.netQ.shift(); if (legalUci(u)) doMove(u, 'remote'); else drainNet(); }
function legalUci(u) { const m = G.chess.parse(u); return !!m && G.chess.moves().some(x => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0)); }
function netGone(msg) {
  if (G.netLost) return; G.netLost = true; toast(msg, 5000);
  if (G.mode === 'host' && !G.over) { setStatus('YOUR BUDDY LEFT · THE MACHINE TAKES OVER'); $('nOpp').textContent = 'MACHINE'; if (G.chess.turn !== G.me) { G.gen++; aiMove(G.gen); } }
  else if (G.mode === 'guest' && !G.over) { G.over = { over: true, reason: 'disconnect', winner: -1, result: '*' }; $('otitle').textContent = 'CONNECTION LOST'; $('osub').textContent = msg; $('over').classList.remove('hidden'); $('bAgain').classList.add('hidden'); }
}
function netFrame() {
  if (G.netWatch === 'host' && G.screen === 'online') {
    const s = Net.st.status;
    $('ostat').textContent = s === 'waiting' ? 'WAITING FOR YOUR BUDDY…' : s === 'opening' ? 'OPENING THE LINE…' : s === 'connected' ? 'CONNECTED!' : s === 'error' ? Net.st.error : s.toUpperCase();
    $('ocode').textContent = Net.st.code ? 'BACKUP CODE: ' + Net.st.code : '';
  }
  if (G.netWatch === 'join' && G.screen === 'join') {
    const s = Net.st.status;
    $('jstat').textContent = s === 'scanning' ? 'LOOKING FOR A GAME IN PROGRESS…' : s === 'connecting' ? 'DIALING ' + Net.st.code + '…' : s === 'connected' ? 'CONNECTED! WAITING FOR THE BOARD…' : s === 'nogame' ? (Net.st.error || 'NO GAME IS WAITING. ASK YOUR BUDDY TO HOST, OR ENTER THEIR BACKUP CODE.') : s === 'error' ? Net.st.error : s.toUpperCase();
  }
  const online = G.mode === 'host' || G.mode === 'guest';
  if (online && !G.netLost && Net.st.status === 'error') netGone(Net.st.error || 'YOUR BUDDY DISCONNECTED.');
  $('link').textContent = online && !G.netLost ? 'LINK ' + (Net.st.ping == null ? '—' : Net.st.ping) + ' ms' : G.mode === 'practice' ? (Net.st.status === 'waiting' ? 'WAITING FOR BUDDY · CODE ' + Net.st.code : '') : '';
}

/* ---------- HUD ---------- */
function setStatus(t) { $('status').textContent = t; }
function updateHud() {
  const turnMe = G.chess.turn === G.me && !G.over;
  $('clkMe').classList.toggle('active', turnMe); $('clkOpp').classList.toggle('active', !turnMe && !G.over);
  $('bCounsel').disabled = !turnMe; $('bUndo').disabled = !(G.mode === 'solo' || G.mode === 'practice') || G.history.length === 0;
}
function updateMoves() {
  const el = $('moves'), h = G.history; let s = '';
  const startBlack = new LC.Chess(G.startFen).turn === 1;
  let num = 1; const list = startBlack ? [null].concat(h) : h;
  for (let i = 0; i < list.length; i += 2) { s += `<span class="n">${num++}.</span><span class="m${list[i] === h[h.length - 1] ? ' last' : ''}">${list[i] ? list[i].san : '…'}</span><span class="m${list[i + 1] && list[i + 1] === h[h.length - 1] ? ' last' : ''}">${list[i + 1] ? list[i + 1].san : ''}</span>`; }
  el.innerHTML = s; el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth;
}
const fmt = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : (ms < 10000 ? (ms / 1000).toFixed(1) : '0:' + String(s).padStart(2, '0')); };
function updateClocks() {
  if (!G.clock) { $('tMe').textContent = ''; $('tOpp').textContent = ''; return; }
  $('tMe').textContent = fmt(G.clk[G.me]); $('tOpp').textContent = fmt(G.clk[1 - G.me]);
  $('clkMe').classList.toggle('low', G.clk[G.me] < 20000); $('clkOpp').classList.toggle('low', G.clk[1 - G.me] < 20000);
}
function clockFrame() {
  const now = performance.now(), dt = now - G.lastTick; G.lastTick = now;
  if (!G.clock || G.over || !G.mode || G.history.length < (G.chess.turn === 0 ? 0 : 0)) return;
  if (G.history.length === 0 && G.chess.turn === 0 && G.mode !== 'guest') { /* white's clock starts with the first move */ updateClocks(); return; }
  G.clk[G.chess.turn] -= dt; updateClocks();
  if (G.clk[G.chess.turn] <= 0 && G.mode !== 'guest') { const loser = G.chess.turn; G.clk[loser] = 0; const st = { over: true, result: loser ? '1-0' : '0-1', reason: 'time', winner: 1 - loser }; if (G.mode === 'host') safeSend({ t: 'over', result: st.result, reason: st.reason, winner: st.winner }); gameOver(st); }
}

/* ---------- input ---------- */
let ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, drag: false, fromSq: null, type: 'mouse', hoverT: 0 };
function bindInput() {
  const cv = $('gl');
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); cv.addEventListener('pointerleave', () => { if (!ptr.down) setHover(null); });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); clearSelection(); });
  addEventListener('keydown', onKey);
  addEventListener('gamepadconnected', () => toast('Gamepad connected'));
}
function setHover(id) {
  if (G.hoverId === id) return; G.hoverId = id; R.hoverId = id; ptr.hoverT = performance.now(); G.hoverSpoken = false;
  const c = id != null ? R.chars.get(id) : null; R.focusChar = c && c.side === G.me && G.mode ? c : null;
  if (id != null && G.mode) { showPiece(id, false); A.tick(); }
}
function onDown(e) {
  A.unlock(); V.unlock();
  ptr.down = true; ptr.type = e.pointerType; ptr.x = ptr.sx = e.clientX; ptr.y = ptr.sy = e.clientY; ptr.drag = false; ptr.fromSq = null;
  if (!G.mode || G.busy) return;
  const p = R.pick(e.clientX, e.clientY); const sq = p.sq;
  if (sq == null) { clearSelection(); return; }
  const pc = G.chess.board[sq];
  if (G.sel != null && G.sel !== sq && legalFrom(G.sel).some(m => m.to === sq)) { ptr.pendingTarget = sq; return; }
  // a target square seen behind a standing piece: the square under the pointer wins
  if (G.sel != null && p.boardSq != null && p.boardSq !== sq && legalFrom(G.sel).some(m => m.to === p.boardSq)) { ptr.pendingTarget = p.boardSq; return; }
  ptr.pendingTarget = null;
  if (pc && LC.colOf(pc) === G.me) {
    if (G.sel === sq && myTurn()) { ptr.fromSq = sq; ptr.reselect = true; return; }
    if (myTurn()) { select(sq); ptr.fromSq = sq; ptr.reselect = false; }
    else { showPiece(G.chess.ids[sq], true); setHover(G.chess.ids[sq]); }
  } else if (pc) { showPiece(G.chess.ids[sq], false); clearSelection(); }
  else clearSelection();
}
function onMove(e) {
  ptr.x = e.clientX; ptr.y = e.clientY;
  if (!G.mode || !R.ready) return;
  const p = R.pick(e.clientX, e.clientY);
  if (ptr.down && ptr.fromSq != null && !ptr.drag && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 9) { ptr.drag = true; }
  if (ptr.drag) {
    const c = R.charAt(ptr.fromSq); const v = dragPoint(e.clientX, e.clientY); if (c && v) { c.root.position.set(v.x, 0, v.z); c.hopY = 0.35; }
    const tsq = p.boardSq; if (tsq != null && legalFrom(ptr.fromSq).some(m => m.to === tsq)) previewMove(LC.uci(legalFrom(ptr.fromSq).find(m => m.to === tsq))); else unpreview();
    return;
  }
  if (e.pointerType === 'touch') return; // touch has no hover
  // hover: a piece -> its thoughts; with a piece selected, hovering a target previews the move
  if (G.sel != null && p.boardSq != null && p.boardSq !== G.sel) {
    const ms = legalFrom(G.sel).filter(m => m.to === p.boardSq); if (ms.length) { previewMove(LC.uci(ms.find(m => !m.promo || m.promo === LC.Q) || ms[0])); setHover(p.id); return; }
  }
  if (G.pv && !G.confirmUci) unpreview();
  setHover(p.id);
}
const _plane = { n: null };
function dragPoint(x, y) { const r = R.ray; r.setFromCamera({ x: x / R.W * 2 - 1, y: -(y / R.H) * 2 + 1 }, R.cam); const o = r.ray.origin, d = r.ray.direction; if (Math.abs(d.y) < 1e-4) return null; const t = (0.0 - o.y) / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t }; }
async function onUp(e) {
  if (!ptr.down) return; ptr.down = false;
  if (!G.mode || G.busy) return;
  const touch = ptr.type === 'touch';
  if (ptr.drag) {
    ptr.drag = false; const p = R.pick(e.clientX, e.clientY), from = ptr.fromSq; ptr.fromSq = null;
    const c = R.charAt(from); const back = () => { if (c) { sqPos(from, 0, c.root.position); c.hopY = 0; } };
    if (p.boardSq != null && p.boardSq !== from && legalFrom(from).some(m => m.to === p.boardSq)) { const ok = await tryMove(p.boardSq, false); if (!ok) back(); } else { back(); unpreview(); }
    return;
  }
  if (ptr.pendingTarget != null) { const t = ptr.pendingTarget; ptr.pendingTarget = null; await tryMove(t, touch); return; }
  if (ptr.reselect && ptr.fromSq != null) { const id = G.chess.ids[ptr.fromSq]; ptr.reselect = false; ptr.fromSq = null; if (touch) { showPiece(id, true); return; } clearSelection(); return; }
  ptr.fromSq = null;
}
function onKey(e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  A.unlock(); V.unlock();
  const k = e.key;
  if (G.promoRes) { const map = { q: LC.Q, r: LC.R, b: LC.B, n: LC.N, '1': LC.Q, '2': LC.R, '3': LC.B, '4': LC.N, Enter: LC.Q }; if (map[k] || map[k.toLowerCase && k.toLowerCase()]) { G.promoRes(map[k] || map[k.toLowerCase()]); e.preventDefault(); } else if (k === 'Escape') G.promoRes(null); return; }
  if (G.screen) { // menus
    if (k === 'Escape') { if (G.screen === 'settings') act('closeSettings'); else if (G.screen !== 'title' && G.screen !== 'loading') act(G.screen === 'online' || G.screen === 'join' ? 'leaveNet' : 'back'); }
    if (k === 'Enter' && G.screen === 'solo' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) act('startSolo');
    if (k === 'ArrowDown' || k === 'ArrowUp') { const bs = [...document.querySelectorAll('#' + G.screen + ' .btn, #' + G.screen + ' .chip')].filter(b => b.offsetParent); const i = bs.indexOf(document.activeElement); const n = bs[(i + (k === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; if (n) { n.focus(); e.preventDefault(); } }
    return;
  }
  if (!G.mode) return;
  const flip = G.me ? -1 : 1; let d = null;
  if (k === 'ArrowUp') d = [0, 1]; else if (k === 'ArrowDown') d = [0, -1]; else if (k === 'ArrowLeft') d = [-1, 0]; else if (k === 'ArrowRight') d = [1, 0];
  if (d) { e.preventDefault(); moveCursor(d[0] * flip, d[1] * flip); return; }
  if (k === ' ' || k === 'Spacebar') { e.preventDefault(); cursorAct(); return; }
  if (k === 'Enter') { e.preventDefault(); counsel(); return; }
  if (k === 'Escape') { if (!$('gmenu').classList.contains('hidden')) $('gmenu').classList.add('hidden'); else if (G.sel != null) clearSelection(); else $('gmenu').classList.remove('hidden'); return; }
  if (k === 'u' || k === 'U') undo(); else if (k === 'h' || k === 'H') toggleHonest(); else if (k === 'v' || k === 'V') $('bSpeak').click();
}
function moveCursor(dx, dy) {
  const f = Math.max(0, Math.min(7, (G.cursor & 7) + dx)), r = Math.max(0, Math.min(7, (G.cursor >> 3) + dy)); G.cursor = r * 8 + f; R.setCursor(G.cursor); A.tick();
  const pc = G.chess.board[G.cursor];
  if (G.sel != null && G.cursor !== G.sel) { const ms = legalFrom(G.sel).filter(m => m.to === G.cursor); if (ms.length) { previewMove(LC.uci(ms.find(m => !m.promo || m.promo === LC.Q) || ms[0])); return; } else unpreview(); }
  if (pc) { setHover(G.chess.ids[G.cursor]); if (LC.colOf(pc) === G.me) { const th = G.th && G.th.pieces[G.chess.ids[G.cursor]]; if (th) speak(th, true); } } else setHover(null);
}
async function cursorAct() {
  const sq = G.cursor, pc = G.chess.board[sq];
  if (G.sel != null && sq !== G.sel && legalFrom(G.sel).some(m => m.to === sq)) { await tryMove(sq, false); return; }
  if (pc && LC.colOf(pc) === G.me) { if (G.sel === sq) clearSelection(); else select(sq); }
  else clearSelection();
}
const padPrev = {};
function gamepadFrame(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = [...pads].find(p => p && p.connected); if (!gp) return;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = (i, k) => { const v = b(i); const was = padPrev[k]; padPrev[k] = v; return v && !was; };
  G.padRep = (G.padRep || 0) - dt; const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (ax > 0.6 ? 1 : ax < -0.6 ? -1 : 0), dy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0) + (ay < -0.6 ? 1 : ay > 0.6 ? -1 : 0);
  if ((dx || dy) && G.padRep <= 0) { G.padRep = G.padHeld ? 0.12 : 0.28; G.padHeld = true; if (G.screen) { onKey({ key: dy > 0 ? 'ArrowUp' : 'ArrowDown', target: document.body, preventDefault() { } }); } else if (G.mode) { const f = G.me ? -1 : 1; moveCursor(Math.sign(dx) * f, Math.sign(dy) * f); } }
  if (!dx && !dy) { G.padHeld = false; G.padRep = 0; }
  if (edge(0, 'a')) { A.unlock(); V.unlock(); if (G.screen) { const a = document.activeElement; if (a && a.click) a.click(); } else if (G.mode) cursorAct(); }
  if (edge(1, 'b')) { if (G.screen) onKey({ key: 'Escape', target: document.body, preventDefault() { } }); else clearSelection(); }
  if (edge(3, 'y') || edge(2, 'x')) counsel();
  if (edge(9, 'start')) $('gmenu').classList.toggle('hidden');
}

/* ---------- per-frame ---------- */
function frame(dt) {
  clockFrame(); gamepadFrame(dt); netFrame();
  // speak the hovered piece after a short dwell (so sweeping the mouse doesn't babble)
  if (G.hoverId != null && !G.hoverSpoken && G.mode && performance.now() - ptr.hoverT > 380) { G.hoverSpoken = true; const th = G.th && G.th.pieces[G.hoverId]; if (th && !G.pv) speak(th, true); }
  R.frame(dt);
  // portrait
  if (G.pctx && !$('hud').classList.contains('hidden')) {
    const c = G.shownId != null ? R.chars.get(G.shownId) : null; portraitFace.set(c ? c.emo === 'dead' ? 'dead' : (c.react ? reactEmo(c.react) : c.emo) : (G.portraitEmo || 'calm'), c ? Math.max(0.5, c.inten) : (G.portraitInt || 0.4));
    portraitFace.lookAt(Math.sin(performance.now() / 900) * 0.4, 0.1); portraitFace.update(dt); G._pAcc = (G._pAcc || 0) + dt;
    if (G._pAcc > 1 / 30) { G._pAcc = 0; portraitFace.draw(); const pc = G.pctx; pc.clearRect(0, 0, pc.canvas.width, pc.canvas.height); pc.drawImage(portraitFace.c, 0, 0); }
  }
  // speech bubble above a calling piece
  const bb = $('bubble');
  if (G.bubble && G.mode) {
    G.bubble.t -= dt; const c = R.chars.get(G.bubble.id);
    if (G.bubble.t <= 0 || !c || !c.alive) { G.bubble = null; bb.classList.add('hidden'); }
    else { const p = R.project(c.root.position.clone().setY((c.height || 1) * 1.25 + 0.15)); bb.style.left = p.x + 'px'; bb.style.top = p.y + 'px'; if (bb._id !== G.bubble.id || bb._t !== G.bubble.text) { bb._id = G.bubble.id; bb._t = G.bubble.text; bb.innerHTML = `<b>${TNAME[c.type].toUpperCase()}</b>${esc(G.bubble.text)}`; bb.style.setProperty('--emo', EMO_COLORS[G.bubble.emo] || '#e8c27a'); } bb.classList.remove('hidden'); }
  } else bb.classList.add('hidden');
  if (!G.mode && R.camShot == null) titleScene();
}
const reactEmo = r => ({ horror: 'horror', cheer: 'cheer', headshake: 'anxiety', doubt: 'anxiety', nod: 'pride', brave: 'resolve', mourn: 'grief', alarm: 'terror', joy: 'joy', flinch: 'pain', duel: 'resolve', defy: 'resolve' })[r] || 'calm';

/* ---------- test hooks ---------- */
G.api = {
  state: () => ({ mode: G.mode, me: G.me, fen: G.chess.fen(), turn: G.chess.turn, ply: G.history.length, over: G.over, busy: G.busy, analysing: G.analysing, hasThoughts: !!G.th, engine: engine && engine.kind, screen: G.screen, sel: G.sel, render: R && R.stats() }),
  thoughts: () => G.th ? Object.values(G.th.pieces).map(t => ({ id: t.id, sq: LC.sqName(t.sq), name: t.name, emotion: t.emotion, gesture: t.gesture, text: t.text, tone: t.tone, advice: t.advice && t.advice.uci, urgency: t.urgency })) : null,
  army: () => G.th && G.th.army,
  newSolo: (me = 0, level = 0, clock = 0, moves = [], fen = null) => newGame({ mode: 'solo', me, level, clock: CLOCKS[clock], moves, fen: fen || undefined }),
  move: u => doMove(u, 'me'),
  screenOf: sq => { const p = R.sqScreen(typeof sq === 'string' ? LC.sqIdx(sq) : sq, 0.02); return { x: p.x, y: p.y }; },
  pieceScreen: sq => { const c = R.charAt(typeof sq === 'string' ? LC.sqIdx(sq) : sq); if (!c) return null; const p = R.project(c.root.position.clone().setY(c.height * 0.8)); return { x: p.x, y: p.y }; },
  charState: sq => { const c = R.charAt(typeof sq === 'string' ? LC.sqIdx(sq) : sq); return c ? { emo: c.emo, gesture: c.gesture, react: c.react, inten: c.inten, callout: c.callout } : null; },
  dialog: () => ({ name: $('dname').textContent, emo: $('demo').textContent, text: $('dtext').textContent, tone: $('dtone').textContent, pv: $('pv').classList.contains('hidden') ? '' : $('pv').textContent }),
  preview: () => G.pv && { uci: G.pv.uci, verdict: G.pv.verdict, reacts: Object.values(G.pv.pieces).map(p => p.react) },
  speed: k => { R.speed = k; },
  events: () => G.events.slice(-50),
  voice: () => ({ supported: V.supported, on: V.st.on, picks: Object.fromEntries(Object.entries(V.st.pick).map(([k, v]) => [k, v && v.name])) }),
};

boot().catch(e => { console.error(e); window.LCFatal('startup: ' + (e && e.message || e)); });
