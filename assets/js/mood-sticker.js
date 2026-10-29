/* ==========================================================================
   BEHRAM ARCADE — MoodSticker
   A small animated smiley sticker in a corner of every page. It reacts to
   gameplay (perks up on big moves, droops on stalls, celebrates wins, pouts on
   losses, dozes when idle). Tap / click it, press ` (backquote), or hold the
   gamepad SELECT/BACK button to open a tiny rating card:
       Fun · Okay · Skip  +  "Suggest an improvement (optional)"
   Nothing is required and nothing blocks the game. See FEEDBACK.md.

   Drop-in:   <script src="../../assets/js/mood-sticker.js"></script>   (in <head>,
              before the game's own scripts so its key guard registers first)

   Hooks for games (all optional, all safe to call before the sticker is built):
     MoodSticker.event('big' | 'stall' | 'win' | 'lose' | 'hit' | 'start')
     MoodSticker.screen('title' | 'play' | 'game-over' | ...)   last screen / state
     MoodSticker.game('slug')                                   override game name
     MoodSticker.bindPause({ pause() {}, resume() {} })        pause while open
   Window events: 'moodsticker:open', 'moodsticker:close', 'moodsticker:submit'.

   Storage: every submission is kept in localStorage ('moodSticker.log') and sent to
   the sinks in CONFIG (textdb.dev daily document + ntfy.sh mirror). No secrets, no PII.
   ========================================================================== */
(function () {
  'use strict';
  if (window.MoodSticker) return;

  /* ---------------- config (override with window.MOOD_STICKER_CONFIG before load) ---------------- */
  var CONFIG = {
    // Primary durable sink: one JSON document per UTC day at  <textdbBase><textdbKey>-YYYY-MM-DD
    textdbBase: 'https://textdb.dev/api/data/',
    textdbKey: 'behram-arcade-feedback-576d3eaa35c97915ac7d2c64',
    // Append-only mirror (ntfy.sh keeps messages ~12 h): https://ntfy.sh/<topic>/json?poll=1&since=all
    ntfyUrl: 'https://ntfy.sh/behram-arcade-fb-816a8d80e0b671e8c39b',
    // Optional generic endpoint: each record is POSTed as JSON text (e.g. your own form backend).
    endpoint: null,
    maxText: 500,
    corner: null            // 'bl' | 'br' | 'tl' | 'tr' (default per page, user can drag it)
  };
  var ext = window.MOOD_STICKER_CONFIG;
  if (ext && typeof ext === 'object') for (var ck in ext) if (Object.prototype.hasOwnProperty.call(ext, ck)) CONFIG[ck] = ext[ck];

  /* ---------------- tiny helpers ---------------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / full */ } }
  };
  var SS = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  var now = function () { return Date.now(); };
  var rid = function (n) {
    var a = new Uint8Array(n || 8);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; }
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  var reduced = false; try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }

  /* ---------------- session / page facts ---------------- */
  var T0 = now();
  var sid = SS.get('moodSticker.sid'); if (!sid) { sid = rid(8); SS.set('moodSticker.sid', sid); }
  var hiddenMs = 0, hiddenAt = document.hidden ? T0 : 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hiddenAt = now(); else if (hiddenAt) { hiddenMs += now() - hiddenAt; hiddenAt = 0; }
  });
  var slugFromPath = function () {
    var m = /\/games\/([^/]+)\//.exec(location.pathname);
    return m ? decodeURIComponent(m[1]) : 'arcade-home';
  };
  var gameName = slugFromPath();
  var gameTitle = function () {
    var reg = window.ARCADE_GAMES, t = '';
    if (Array.isArray(reg)) for (var i = 0; i < reg.length; i++) if (reg[i] && reg[i].slug === gameName) t = reg[i].title;
    if (!t) t = String(document.title || '').split(/\s+[—–|-]\s+/)[0];
    if (gameName === 'arcade-home') t = 'Behram Arcade';
    return String(t || gameName).trim().slice(0, 60);
  };
  var testMode = function () {
    try { if (/[?&](msTest|test)=1\b/.test(location.search) || localStorage.getItem('moodSticker.test') === '1') return true; } catch (e) { /* ignore */ }
    return !!navigator.webdriver;
  };
  var deviceClass = function () {
    var w = Math.min(screen.width || innerWidth, screen.height || innerHeight), coarse = false;
    try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    if (coarse && w < 600) return 'phone';
    if (coarse) return 'tablet';
    return 'desktop';
  };

  /* ---------------- screen tracking ---------------- */
  var explicitScreen = null, sniffScreen = null, screenTrail = [];
  var noteScreen = function (s) {
    s = String(s || '').slice(0, 40); if (!s) return;
    if (screenTrail[screenTrail.length - 1] !== s) { screenTrail.push(s); if (screenTrail.length > 8) screenTrail.shift(); }
  };
  var lastScreen = function () {
    if (explicitScreen) return explicitScreen;
    var el = document.querySelector('.screen.show[id], .screen.active[id], [data-screen].show');
    var dom = el ? (el.getAttribute('data-screen') || el.id) : (document.body && (document.body.dataset.screen || document.body.dataset.mode));
    if (sniffScreen && now() - sniffScreen.t < 15000) return sniffScreen.s;
    if (dom) return String(dom).replace(/^s-/, '');
    if (location.hash.length > 1) return location.hash.slice(1, 41);
    return String(document.title || 'page').slice(0, 40);
  };

  /* ---------------- mood engine ---------------- */
  var lastInput = T0, inputs = [], counts = { big: 0, stall: 0, win: 0, lose: 0 };
  var mood = 'happy', moodUntil = 0, ui = null, lastBurst = 0;
  var REACT = { big: ['perky', 2200], win: ['party', 3600], lose: ['sad', 3000], stall: ['droopy', 3200], hit: ['ouch', 1200], start: ['perky', 1500], love: ['love', 2600], thanks: ['love', 2600] };
  var setMood = function (m, ms) {
    mood = m; moodUntil = ms ? now() + ms : 0;
    if (ui) ui.render(m, true);
  };
  var baseMood = function () {
    if (ui && ui.isOpen()) return 'curious';
    var idle = now() - lastInput;
    if (document.hidden) return mood;
    if (idle > 75000) return 'sleepy';
    if (idle > 22000) return 'droopy';
    return 'happy';
  };
  var lastEv = {};
  var fire = function (type, generic) {
    type = String(type || '').toLowerCase();
    if (generic && lastEv[type] && now() - lastEv[type] < 4000) return;   // de-dupe sniffed signals
    lastEv[type] = now();
    if (counts[type] != null) counts[type]++;
    if (type === 'start') noteScreen('play');
    if (type === 'win' || type === 'lose') noteScreen(type === 'win' ? 'win' : 'game-over');
    var r = REACT[type] || ['wiggle', 900];
    if (ui && ui.isOpen() && type !== 'love') return;
    setMood(r[0], reduced ? Math.min(r[1], 1500) : r[1]);
  };
  setInterval(function () {
    if (moodUntil && now() < moodUntil) return;
    var b = baseMood();
    if (b !== mood || moodUntil) { if (b === 'droopy' && mood !== 'droopy') counts.stall++; mood = b; moodUntil = 0; if (ui) ui.render(mood); }
  }, 700);
  var onInput = function () {
    var t = now(); lastInput = t; inputs.push(t);
    while (inputs.length && t - inputs[0] > 2500) inputs.shift();
    if (inputs.length > 18 && t - lastBurst > 25000 && !(ui && ui.isOpen())) { lastBurst = t; fire('big', true); }
    if ((mood === 'droopy' || mood === 'sleepy') && !moodUntil) { mood = 'happy'; if (ui) ui.render(mood, true); }
  };

  /* ---------------- generic gameplay sniffing (canvas text + DOM text) ---------------- */
  var RX = {
    win: /\b(YOU WIN|YOU WON|VICTORY|WINNER|CHAMPION|(LEVEL|STAGE|WAVE|SECTOR|MISSION|ROUND|SHIFT|DAY) (CLEAR(ED)?|COMPLETE(D)?)|NEW (HIGH ?SCORE|RECORD|BEST)|YOU SURVIVED|CONGRATULATIONS|PERFECT VISIT|RACE WON|1ST PLACE)\b/,
    lose: /\b(GAME OVER|YOU LOSE|YOU LOST|DEFEAT(ED)?|YOU DIED|WASTED|MISSION FAILED|TRY AGAIN|CONTINUE\?|OUT OF (LIVES|TIME))\b/,
    big: /(\bCOMBO\b|\bBONUS\b|EXTRA (LIFE|MAN|SHIP)|\b1UP\b|POWER[- ]?UP|PACK CLEAR|\bSTREAK\b ?[X×]?\d|\bDOUBLE\b|\bTRIPLE\b|TOUCHDOWN|FIRST DOWN|INTERCEPT|\bGOAL\b|CHECKMATE|\bJACKPOT\b|\bSMART BOMB\b|^\+\d{3,})/,
    paused: /^(PAUSED?|GAME PAUSED)\b/,
    title: /\b(PRESS START|INSERT COIN|TAP TO (START|PLAY)|PRESS (ENTER|SPACE)|CLICK TO START)\b/
  };
  var cache = new Map(), seen = {};
  var classify = function (s) {
    var c = cache.get(s); if (c !== undefined) return c;
    var u = s.toUpperCase(); c = '';
    if (RX.lose.test(u)) c = 'lose'; else if (RX.win.test(u)) c = 'win'; else if (RX.big.test(u)) c = 'big';
    else if (RX.paused.test(u)) c = 'paused'; else if (RX.title.test(u)) c = 'title';
    if (cache.size > 800) cache.clear();
    cache.set(s, c); return c;
  };
  var sniff = function (s) {
    if (typeof s !== 'string' || s.length < 3 || s.length > 48) return;
    var c = classify(s); if (!c) return;
    var t = now(), prev = seen[c] || 0; seen[c] = t;
    if (t - prev < 1500) return;               // still on screen from last frame: not a new appearance
    if (c === 'paused' || c === 'title') { sniffScreen = { s: c, t: t }; noteScreen(c); return; }
    sniffScreen = { s: c === 'lose' ? 'game-over' : c === 'win' ? 'win' : sniffScreen ? sniffScreen.s : 'play', t: t };
    if (t - T0 < 2500) return;                 // ignore whatever the page draws while booting
    fire(c, true);
  };
  try {
    var CP = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (CP) ['fillText', 'strokeText'].forEach(function (fn) {
      var orig = CP[fn]; if (typeof orig !== 'function' || orig.__ms) return;
      var wrapped = function (text) { if (typeof text === 'string') { try { sniff(text); } catch (e) { /* never break drawing */ } } return orig.apply(this, arguments); };
      wrapped.__ms = true; CP[fn] = wrapped;
    });
  } catch (e) { /* ignore */ }
  var domQueue = [], domBusy = false;
  var drainDom = function () {
    domBusy = false;
    var q = domQueue; domQueue = [];
    for (var i = 0; i < q.length; i++) {
      var n = q[i]; if (!n || (ui && ui.host.contains(n))) continue;
      var t = n.nodeType === 3 ? n.nodeValue : (n.textContent || '');
      if (t && t.length <= 160) sniff(t.trim().slice(0, 48));
    }
  };
  var startObserver = function () {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length && domQueue.length < 60; i++) {
        var m = list[i];
        if (m.type === 'characterData') domQueue.push(m.target);
        else for (var j = 0; j < m.addedNodes.length && domQueue.length < 60; j++) domQueue.push(m.addedNodes[j]);
      }
      if (!domBusy && domQueue.length) { domBusy = true; setTimeout(drainDom, 250); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };

  /* ---------------- submissions: localStorage + remote sinks ---------------- */
  var LOG_KEY = 'moodSticker.log';
  var scrub = function (s) {
    return String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
      .replace(/(\+?\d[\d\s().-]{8,}\d)/g, '[number removed]')
      .trim().slice(0, CONFIG.maxText);
  };
  var dayKey = function (iso) { return iso.slice(0, 10); };   // UTC day
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var parseDoc = function (txt) {
    var d = null;
    try { d = JSON.parse(txt); } catch (e) { d = null; }
    if (Array.isArray(d)) d = { v: 1, items: d };
    if (!d || typeof d !== 'object' || !Array.isArray(d.items)) d = { v: 1, items: [] };
    return d;
  };
  var has = function (doc, id) { for (var i = 0; i < doc.items.length; i++) if (doc.items[i] && doc.items[i].id === id) return true; return false; };
  var textdbUrl = function (rec) { return CONFIG.textdbBase + encodeURIComponent(CONFIG.textdbKey + '-' + dayKey(rec.ts)); };
  var getDoc = function (url) {
    return fetch(url + '?_=' + now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('get ' + r.status); return r.text(); }).then(parseDoc);
  };
  // Optimistic read-modify-write with verification; safe to repeat (idempotent on rec.id).
  var sendTextdb = function (rec) {
    if (!CONFIG.textdbBase || !CONFIG.textdbKey || !window.fetch) return Promise.resolve(false);
    var url = textdbUrl(rec), attempt = 0;
    var step = function () {
      attempt++;
      return getDoc(url).then(function (doc) {
        if (has(doc, rec.id)) return true;
        doc.items.push(rec); doc.updated = new Date().toISOString();
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(doc) })
          .then(function (r) { if (!r.ok) throw new Error('post ' + r.status); return sleep(500 + Math.random() * 700); })
          .then(function () { return getDoc(url); })
          .then(function (d2) { return has(d2, rec.id) || (attempt < 4 ? sleep(400 + Math.random() * 1200).then(step) : false); });
      });
    };
    return step().catch(function () { return false; });
  };
  var sendNtfy = function (rec) {
    if (!CONFIG.ntfyUrl || !window.fetch) return Promise.resolve(false);
    return fetch(CONFIG.ntfyUrl, { method: 'POST', body: JSON.stringify(rec) }).then(function (r) { return r.ok; }).catch(function () { return false; });
  };
  var sendEndpoint = function (rec) {
    if (!CONFIG.endpoint || !window.fetch) return Promise.resolve(false);
    return fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(rec) }).then(function (r) { return r.ok; }).catch(function () { return false; });
  };
  var readLog = function () { var l = LS.get(LOG_KEY, []); return Array.isArray(l) ? l : []; };
  var writeLog = function (l) { if (l.length > 150) l = l.slice(-150); LS.set(LOG_KEY, l); };
  var markSent = function (id, field, ok) {
    var l = readLog();
    for (var i = 0; i < l.length; i++) if (l[i].rec && l[i].rec.id === id) { l[i][field] = ok ? 'ok' : 'pending'; l[i].tries = (l[i].tries || 0) + (ok ? 0 : 1); }
    writeLog(l);
  };
  var deliver = function (rec) {
    var jobs = [
      sendTextdb(rec).then(function (ok) { markSent(rec.id, 'textdb', ok); return ok; }),
      sendNtfy(rec).then(function (ok) { markSent(rec.id, 'ntfy', ok); return ok; })
    ];
    if (CONFIG.endpoint) jobs.push(sendEndpoint(rec).then(function (ok) { markSent(rec.id, 'endpoint', ok); return ok; }));
    return Promise.all(jobs).then(function (r) { return { textdb: r[0], ntfy: r[1], endpoint: r[2] }; });
  };
  // Re-check recent submissions later (a racing writer could have overwritten the day's doc).
  var flush = function () {
    var l = readLog(), cutoff = now() - 6 * 864e5, jobs = [];
    l.forEach(function (e) {
      if (!e.rec || e.at < cutoff || (e.tries || 0) > 12) return;
      if (e.textdb !== 'ok' || (!e.rechecked && now() - e.at > 8000)) {
        jobs.push(sendTextdb(e.rec).then(function (ok) {
          var l2 = readLog();
          l2.forEach(function (x) { if (x.rec && x.rec.id === e.rec.id) { x.textdb = ok ? 'ok' : 'pending'; if (ok) x.rechecked = true; else x.tries = (x.tries || 0) + 1; } });
          writeLog(l2); return ok;
        }));
      }
    });
    return Promise.all(jobs);
  };
  var buildRecord = function (rating, text) {
    var t = now(), vis = hiddenMs + (hiddenAt ? t - hiddenAt : 0);
    return {
      v: 1, id: rid(8), sid: sid, test: testMode(),
      game: gameName, gameTitle: gameTitle(),
      rating: rating || null, text: scrub(text),
      sessionStart: new Date(T0).toISOString(), durationSec: Math.round((t - T0) / 1000), activeSec: Math.round((t - T0 - vis) / 1000),
      lastScreen: lastScreen(), screens: screenTrail.slice(-6),
      ts: new Date(t).toISOString(),
      url: location.origin + location.pathname + location.search.slice(0, 80) + location.hash.slice(0, 40),
      viewport: { w: innerWidth, h: innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100 },
      device: deviceClass(), input: lastInputKind, mood: mood, events: { big: counts.big, stall: counts.stall, win: counts.win, lose: counts.lose },
      lang: String(navigator.language || '').slice(0, 12)
    };
  };
  var submit = function (rating, text) {
    var rec = buildRecord(rating, text), l = readLog();
    l.push({ at: now(), rec: rec, textdb: 'sending', ntfy: 'sending' }); writeLog(l);
    var p = deliver(rec);
    setTimeout(function () { flush(); }, 9000 + Math.random() * 3000);
    try { window.dispatchEvent(new CustomEvent('moodsticker:submit', { detail: rec })); } catch (e) { /* ignore */ }
    return { record: rec, delivered: p };
  };

  /* ---------------- input kind + key guard (registered before game scripts) ---------------- */
  var lastInputKind = 'unknown';
  var EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;
  var inSticker = function (e) { return ui && e.composedPath && e.composedPath().indexOf(ui.host) >= 0; };
  window.addEventListener('keydown', function (e) {
    lastInputKind = 'keyboard';
    if (ui && ui.isOpen()) {
      if (inSticker(e)) { e.stopImmediatePropagation(); ui.panelKey(e); return; }
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); ui.close(); return; }
      return;
    }
    if (inSticker(e)) { e.stopImmediatePropagation(); return; }   // e.g. Enter on the focused sticker button
    onInput();
    var t = e.target, typing = t && (EDITABLE.test(t.tagName) || t.isContentEditable);
    if (!typing && e.code === 'Backquote' && !e.ctrlKey && !e.metaKey && !e.altKey && ui) { e.preventDefault(); e.stopImmediatePropagation(); ui.open('key'); }
  }, true);
  ['keyup', 'keypress'].forEach(function (ty) {
    window.addEventListener(ty, function (e) {
      if (ui && (inSticker(e) || (ui.isOpen() && e.key === 'Escape'))) e.stopImmediatePropagation();
      else if (ty === 'keyup' && e.code === 'Backquote' && ui && ui.isOpen()) e.stopImmediatePropagation();
    }, true);
  });
  window.addEventListener('pointerdown', function (e) {
    lastInputKind = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
    if (inSticker(e)) return;
    onInput();
    if (ui && ui.isOpen()) ui.close('outside');
  }, true);
  window.addEventListener('pointermove', function (e) { if (ui) ui.look(e.clientX, e.clientY); }, { passive: true, capture: true });
  window.addEventListener('wheel', onInput, { passive: true, capture: true });

  /* ---------------- gamepad ---------------- */
  var padHeld = 0, padPrev = {}, padRaf = 0;
  var pollPads = function () {
    padRaf = 0;
    var pads = []; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    var any = false, t = now();
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i]; if (!p || !p.connected) continue; any = true;
      var b = function (k) { return !!(p.buttons[k] && p.buttons[k].pressed); };
      var prev = padPrev[i] || {}, cur = {};
      for (var k = 0; k < Math.min(p.buttons.length, 17); k++) cur[k] = b(k);
      var ax = p.axes || [], moved = Math.abs(ax[0] || 0) > 0.5 || Math.abs(ax[1] || 0) > 0.5;
      cur.l = (ax[0] || 0) < -0.6; cur.r = (ax[0] || 0) > 0.6;
      var pressedAny = false; for (k in cur) if (cur[k] && !prev[k]) pressedAny = true;
      if (pressedAny || moved) { lastInputKind = 'gamepad'; onInput(); }
      if (ui) {
        if (!ui.isOpen()) {
          if (cur[8]) { if (!padHeld) padHeld = t; else if (t - padHeld > 650) { padHeld = 0; ui.open('gamepad'); } } else padHeld = 0;
        } else {
          var edge = function (k) { return cur[k] && !prev[k]; };
          if (edge(14) || edge('l')) ui.move(-1);
          if (edge(15) || edge('r')) ui.move(1);
          if (edge(12)) ui.move(-1);
          if (edge(13)) ui.move(1);
          if (edge(0)) ui.activate();
          if (edge(1) || edge(8) || edge(9)) ui.close('gamepad');
        }
      }
      padPrev[i] = cur;
    }
    if (any) padRaf = requestAnimationFrame(pollPads);
  };
  window.addEventListener('gamepadconnected', function () { if (!padRaf) padRaf = requestAnimationFrame(pollPads); });
  if (navigator.getGamepads) setTimeout(function () { if (!padRaf) pollPads(); }, 1500);

  /* ---------------- pause / resume ---------------- */
  var pauseHooks = null;
  var pauseGame = function () {
    try { if (pauseHooks && pauseHooks.pause) pauseHooks.pause(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('blur')); } catch (e) { /* most games auto-pause + release held keys on blur */ }
    try { window.dispatchEvent(new CustomEvent('moodsticker:open')); } catch (e) { /* ignore */ }
  };
  var resumeGame = function () {
    try { if (pauseHooks && pauseHooks.resume) pauseHooks.resume(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('moodsticker:close')); } catch (e) { /* ignore */ }
  };

  /* ---------------- UI ---------------- */
  var MOUTH = {
    happy: 'M20 38 Q32 48 44 38', perky: 'M18 36 Q32 54 46 36 Z', party: 'M18 35 Q32 56 46 35 Z', love: 'M19 37 Q32 51 45 37',
    droopy: 'M22 44 Q32 39 42 44', sad: 'M21 46 Q32 36 43 46', sleepy: 'M27 43 Q32 45 37 43', curious: 'M27 41 Q32 46 37 41 Q32 36 27 41 Z',
    ouch: 'M24 43 Q28 39 32 43 Q36 47 40 43', wiggle: 'M20 39 Q32 47 44 39'
  };
  var FACE = function (kind) {   // small faces for the rating buttons
    var m = kind === 'fun' ? '<path d="M7 13.5 Q12 19 17 13.5 Z" fill="#5a2a00"/>' : kind === 'okay' ? '<path d="M8 15 H16" stroke="#5a2a00" stroke-width="1.8" stroke-linecap="round"/>' : '';
    if (kind === 'skip') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#d9dde8"/><path d="M8 7.5 L13 12 L8 16.5 M12.5 7.5 L17.5 12 L12.5 16.5" fill="none" stroke="#3b4256" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="' + (kind === 'fun' ? '#ffd53d' : '#ffe58a') + '" stroke="#e0a400" stroke-width="1"/>' +
      (kind === 'fun' ? '<path d="M7.2 10 Q8.6 8 10 10 M14 10 Q15.4 8 16.8 10" fill="none" stroke="#5a2a00" stroke-width="1.6" stroke-linecap="round"/>' : '<circle cx="8.6" cy="10" r="1.3" fill="#5a2a00"/><circle cx="15.4" cy="10" r="1.3" fill="#5a2a00"/>') + m + '</svg>';
  };
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
    '.wrap{position:fixed;z-index:2147483000;font:500 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2233;pointer-events:none}',
    '.wrap.bl{left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px))}',
    '.wrap.br{right:calc(10px + env(safe-area-inset-right,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px))}',
    '.wrap.tl{left:calc(10px + env(safe-area-inset-left,0px));top:calc(48px + env(safe-area-inset-top,0px))}',
    '.wrap.tr{right:calc(10px + env(safe-area-inset-right,0px));top:calc(10px + env(safe-area-inset-top,0px))}',
    '.stk{pointer-events:auto;position:relative;width:var(--sz,46px);height:var(--sz,46px);padding:0;margin:0;border:0;background:none;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;opacity:.82;transition:opacity .25s,transform .25s;outline:none;display:block}',
    '.stk:hover,.stk.react,.open .stk{opacity:1}',
    '.stk:hover .face{transform:scale(1.08) rotate(-4deg)}',
    '.stk:focus-visible{outline:3px solid #5cc8ff;outline-offset:3px;border-radius:50%}',
    '.face{width:100%;height:100%;display:block;overflow:visible;transform-origin:50% 60%;transition:transform .3s cubic-bezier(.3,1.6,.5,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}',
    '.dragging .face{transform:scale(1.15) rotate(8deg)}',
    '.idle .face{animation:bob 3.6s ease-in-out infinite}',
    '.m-perky .face{animation:hop .55s cubic-bezier(.3,1.6,.5,1) 2}',
    '.m-party .face{animation:spin .9s cubic-bezier(.3,1.4,.5,1) 1,hop .5s .9s 3}',
    '.m-love .face{animation:hop .5s 2}',
    '.m-droopy .face{transform:translateY(3px) rotate(-10deg) scale(.95);animation:none}',
    '.m-sleepy .face{transform:translateY(3px) rotate(8deg) scale(.94);animation:breathe 4s ease-in-out infinite}',
    '.m-sad .face{transform:translateY(2px) scale(.94);animation:shake .4s 2}',
    '.m-ouch .face{animation:shake .25s 3}',
    '.m-wiggle .face{animation:shake .3s 2}',
    '.m-curious .face{transform:rotate(-8deg) scale(1.06)}',
    '.eye{transition:transform .12s}',
    '.lid{transform-origin:50% 50%;transform:scaleY(0);transition:transform .2s}',
    '.blink .lid{transform:scaleY(1);transition:transform .07s}',
    '.m-sleepy .lid{transform:scaleY(.9)}',
    '.m-droopy .lid{transform:scaleY(.45)}',
    '.extra{opacity:0;transition:opacity .3s}',
    '.m-droopy .sweat,.m-sleepy .zz,.m-sad .tear,.m-perky .spark,.m-party .spark,.m-love .heart,.m-party .hat{opacity:1}',
    '.m-sleepy .zz{animation:zz 2.4s ease-in-out infinite}',
    '.m-sad .tear{animation:tear 1.4s ease-in infinite}',
    '.m-perky .spark,.m-party .spark{animation:twinkle .6s ease-in-out infinite alternate}',
    '.m-love .heart{animation:float 1.3s ease-out infinite}',
    '.conf{position:absolute;left:50%;top:40%;width:6px;height:9px;border-radius:1px;pointer-events:none;animation:conf 1.2s cubic-bezier(.2,.7,.4,1) forwards}',
    '@keyframes bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}',
    '@keyframes hop{0%,100%{transform:translateY(0) scale(1)}35%{transform:translateY(-9px) scale(1.12,0.92)}60%{transform:translateY(0) scale(.94,1.06)}}',
    '@keyframes spin{from{transform:rotate(0) scale(1)}50%{transform:rotate(200deg) scale(1.25)}to{transform:rotate(360deg) scale(1)}}',
    '@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px) rotate(-6deg)}75%{transform:translateX(3px) rotate(6deg)}}',
    '@keyframes breathe{0%,100%{transform:translateY(3px) rotate(8deg) scale(.94)}50%{transform:translateY(4px) rotate(8deg) scale(.97)}}',
    '@keyframes zz{0%{transform:translate(0,0);opacity:0}30%{opacity:1}100%{transform:translate(6px,-10px);opacity:0}}',
    '@keyframes tear{0%{transform:translateY(0);opacity:1}100%{transform:translateY(9px);opacity:0}}',
    '@keyframes twinkle{from{transform:scale(.6);opacity:.4}to{transform:scale(1.15);opacity:1}}',
    '@keyframes float{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-12px);opacity:0}}',
    '@keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) rotate(var(--rot));opacity:0}}',
    '.pop{pointer-events:auto;position:absolute;width:min(320px,calc(100vw - 20px));background:linear-gradient(180deg,#ffffff,#f3f5fb);border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.6) inset,0 0 0 1px rgba(10,14,30,.25);padding:12px 12px 10px;transform-origin:var(--ox) var(--oy);animation:popin .22s cubic-bezier(.3,1.4,.5,1)}',
    '.bl .pop{left:0;bottom:calc(var(--sz,46px) + 10px);--ox:12%;--oy:100%}.br .pop{right:0;bottom:calc(var(--sz,46px) + 10px);--ox:88%;--oy:100%}',
    '.tl .pop{left:0;top:calc(var(--sz,46px) + 10px);--ox:12%;--oy:0}.tr .pop{right:0;top:calc(var(--sz,46px) + 10px);--ox:88%;--oy:0}',
    '.pop[hidden]{display:none}',
    '@keyframes popin{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}',
    '.hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px}',
    '.hd b{font-size:14.5px;font-weight:700;letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.x{all:unset;cursor:pointer;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#59607a;font-size:18px;line-height:1;flex:none}',
    '.x:hover,.x:focus-visible{background:#e6e9f2;color:#1d2233}',
    '.row{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}',
    '.rate{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px 7px;border-radius:12px;background:#fff;box-shadow:0 0 0 1.5px #d9deea inset,0 2px 0 #d9deea;font-weight:650;font-size:13px;color:#2a3046;transition:transform .12s,box-shadow .12s,background .12s;touch-action:manipulation}',
    '.rate svg{width:30px;height:30px;transition:transform .15s}',
    '.rate:hover{background:#fffbe8;transform:translateY(-1px)}.rate:hover svg{transform:scale(1.12) rotate(-6deg)}',
    '.rate:active{transform:translateY(1px);box-shadow:0 0 0 1.5px #c9cfdd inset}',
    '.rate:focus-visible{box-shadow:0 0 0 3px #5cc8ff inset,0 2px 0 #d9deea;background:#f2faff}',
    '.rate.fun:hover{box-shadow:0 0 0 1.5px #ffcb2e inset,0 2px 0 #f0b400}',
    '.sug{margin-top:9px;position:relative}',
    'textarea{display:block;width:100%;resize:none;height:38px;min-height:38px;max-height:120px;border:1.5px solid #d9deea;border-radius:10px;padding:8px 10px;font:400 13.5px/1.35 inherit;font-family:inherit;color:#1d2233;background:#fff;outline:none;transition:height .18s,border-color .15s;-webkit-user-select:text;user-select:text}',
    'textarea::placeholder{color:#8a91a8}',
    'textarea:focus,textarea.has{height:78px;border-color:#5cc8ff}',
    '.ft{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 2px 0;font-size:11.5px;color:#7a8199;min-height:24px}',
    '.send{all:unset;cursor:pointer;font-weight:700;font-size:12.5px;color:#fff;background:#2e7cf6;border-radius:999px;padding:4px 11px;box-shadow:0 2px 0 #1f5fc4}',
    '.send[hidden]{display:none}.send:focus-visible{outline:3px solid #5cc8ff;outline-offset:2px}',
    '.thanks{display:flex;align-items:center;gap:10px;padding:6px 4px;font-weight:700;font-size:15px}',
    '.thanks small{display:block;font-weight:500;font-size:12px;color:#6a7190}',
    '@media (pointer:coarse){textarea{font-size:16px}}',
    '@media (max-width:420px){.rate{padding:7px 2px 6px;font-size:12.5px}.rate svg{width:27px;height:27px}}',
    '@media (prefers-reduced-motion:reduce){.face,.pop,.zz,.tear,.spark,.heart{animation:none!important;transition:none!important}}'
  ].join('\n');

  var SVG = '<svg class="face" viewBox="0 0 64 64" aria-hidden="true">' +
    '<defs><radialGradient id="msg" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff59a"/><stop offset=".55" stop-color="#ffd53d"/><stop offset="1" stop-color="#f2a900"/></radialGradient></defs>' +
    '<g class="extra hat"><path d="M22 10 L32 -8 L42 10 Z" fill="#ff47e6" stroke="#fff" stroke-width="2"/><circle cx="32" cy="-8" r="3.2" fill="#36e6ff"/></g>' +
    '<circle cx="32" cy="32" r="29" fill="#fff"/>' +
    '<circle cx="32" cy="32" r="25.5" fill="url(#msg)" stroke="#d99600" stroke-width="1.2"/>' +
    '<ellipse cx="24" cy="18" rx="8" ry="4" fill="#fff" opacity=".55" transform="rotate(-25 24 18)"/>' +
    '<circle cx="17" cy="37" r="4" fill="#ff7a7a" opacity=".45"/><circle cx="47" cy="37" r="4" fill="#ff7a7a" opacity=".45"/>' +
    '<g class="eye el"><ellipse cx="23.5" cy="27" rx="3.3" ry="4.4" fill="#3a1d00"/><circle cx="24.6" cy="25.4" r="1.2" fill="#fff"/></g>' +
    '<g class="eye er"><ellipse cx="40.5" cy="27" rx="3.3" ry="4.4" fill="#3a1d00"/><circle cx="41.6" cy="25.4" r="1.2" fill="#fff"/></g>' +
    '<rect class="lid" x="18.5" y="21.5" width="10" height="11" rx="5" fill="#ffd53d"/><rect class="lid" x="35.5" y="21.5" width="10" height="11" rx="5" fill="#ffd53d"/>' +
    '<path class="mouth" d="' + MOUTH.happy + '" fill="#5a2a00" stroke="#5a2a00" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path class="extra sweat" d="M52 14 Q56 21 52 23 Q48 21 52 14 Z" fill="#7fd3ff" stroke="#fff" stroke-width="1"/>' +
    '<text class="extra zz" x="47" y="12" font-size="11" font-weight="900" fill="#fff" stroke="#3b4256" stroke-width=".6" font-family="system-ui,sans-serif">z</text>' +
    '<path class="extra tear" d="M22 33 Q24.5 38 22 40 Q19.5 38 22 33 Z" fill="#7fd3ff"/>' +
    '<g class="extra spark" fill="#fff" stroke="#ffb800" stroke-width=".8"><path d="M5 8 L7 13 L12 15 L7 17 L5 22 L3 17 L-2 15 L3 13 Z"/><path d="M58 40 L59.4 43.6 L63 45 L59.4 46.4 L58 50 L56.6 46.4 L53 45 L56.6 43.6 Z"/></g>' +
    '<path class="extra heart" d="M52 6 C52 2 57 2 57 6 C57 2 62 2 62 6 C62 10 57 12 57 15 C57 12 52 10 52 6 Z" fill="#ff4d6d" stroke="#fff" stroke-width="1"/>' +
    '</svg>';

  // Default corner: bottom-left on desktop. On touch screens the bottom corners hold joysticks / fire
  // buttons in most games, so the sticker sits top-left just under the "← ARCADE" link instead
  // (except pages with no on-screen controls). Players can drag it to any corner; it is remembered.
  var TOUCH_BOTTOM_OK = { 'arcade-home': 1, 'congressional-obgyn': 1, 'living-chess': 1 };
  var defaultCorner = function () {
    var coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    return coarse && !TOUCH_BOTTOM_OK[gameName] ? 'tl' : 'bl';
  };

  var build = function () {
    if (ui || !document.body) return;
    var host = document.createElement('mood-sticker');
    host.id = 'mood-sticker'; host.setAttribute('data-mood-sticker', '');
    host.style.cssText = 'position:fixed;inset:auto;z-index:2147483000;width:0;height:0;';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var cornerKey = 'moodSticker.corner.' + gameName;
    var corner = LS.get(cornerKey, null) || CONFIG.corner || defaultCorner();
    var small = Math.min(innerWidth, innerHeight) < 500;
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="wrap ' + corner + '" style="--sz:' + (small ? 38 : 46) + 'px">' +
      '<button class="stk idle m-happy" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Rate this game (optional)" title="How\'s the game? Tap to rate ( ` )">' + SVG + '</button>' +
      '<div class="pop" role="dialog" aria-label="Rate this game" hidden>' +
      '<div class="body"><div class="hd"><b class="ttl"></b><button class="x" type="button" aria-label="Close">×</button></div>' +
      '<div class="row" role="group" aria-label="Rating">' +
      '<button class="rate fun" type="button" data-r="fun">' + FACE('fun') + '<span>Fun</span></button>' +
      '<button class="rate okay" type="button" data-r="okay">' + FACE('okay') + '<span>Okay</span></button>' +
      '<button class="rate skip" type="button" data-r="skip">' + FACE('skip') + '<span>Skip</span></button></div>' +
      '<div class="sug"><textarea rows="2" maxlength="' + CONFIG.maxText + '" placeholder="Suggest an improvement (optional)" aria-label="Suggest an improvement (optional)" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" spellcheck="true"></textarea></div>' +
      '<div class="ft"><span class="hint">Pick one to send · your note goes with it</span><button class="send" type="button" hidden>Send note</button></div></div>' +
      '<div class="done" hidden><div class="thanks"><span class="big"></span><span>Thanks!<small>Your feedback helps Dr. Behram tune the arcade.</small></span></div></div>' +
      '</div></div>';
    var $ = function (s) { return root.querySelector(s); };
    var wrap = $('.wrap'), stk = $('.stk'), pop = $('.pop'), ta = $('textarea'), send = $('.send'), hint = $('.hint');
    var mouth = $('.mouth'), eyes = root.querySelectorAll('.eye');
    var open = false, prevFocus = null, closeTimer = 0, rendered = '';

    var render = function (m, kick) {
      if (m === rendered && !kick) return; rendered = m;
      stk.className = 'stk m-' + m + (m === 'happy' || m === 'curious' ? ' idle' : '') + (kick ? ' react' : '');
      if (kick && !reduced) { void stk.offsetWidth; }
      mouth.setAttribute('d', MOUTH[m] || MOUTH.happy);
      mouth.setAttribute('fill', /perky|party|curious/.test(m) ? '#5a2a00' : 'none');
      if (m === 'party' && !reduced) confetti();
    };
    var confetti = function () {
      var cols = ['#ff47e6', '#36e6ff', '#ffe81a', '#7dff5a', '#ff8a3d', '#a06bff'];
      for (var i = 0; i < 16; i++) {
        var c = document.createElement('i'); c.className = 'conf';
        var a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
        c.style.cssText = 'background:' + cols[i % cols.length] + ';--dx:' + Math.round(Math.cos(a) * d) + 'px;--dy:' + Math.round(Math.sin(a) * d - 18) + 'px;--rot:' + Math.round(Math.random() * 720 - 360) + 'deg';
        stk.appendChild(c); setTimeout(function (n) { return function () { n.remove(); }; }(c), 1300);
      }
    };
    // blink + look
    (function blink() {
      setTimeout(function () { if (!document.hidden) { stk.classList.add('blink'); setTimeout(function () { stk.classList.remove('blink'); }, 140); } blink(); }, 2400 + Math.random() * 3200);
    })();
    var lookRaf = 0, lx = 0, ly = 0;
    var look = function (x, y) {
      lx = x; ly = y; if (lookRaf) return;
      lookRaf = requestAnimationFrame(function () {
        lookRaf = 0; var r = stk.getBoundingClientRect(); if (!r.width) return;
        var dx = lx - (r.left + r.width / 2), dy = ly - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 200) * 2.2;
        var tr = 'translate(' + (dx / d * k).toFixed(2) + 'px,' + (dy / d * k).toFixed(2) + 'px)';
        for (var i = 0; i < eyes.length; i++) eyes[i].style.transform = tr;
      });
    };

    var buttons = function () { return [].slice.call(root.querySelectorAll('.pop:not([hidden]) .rate, .pop:not([hidden]) textarea, .pop:not([hidden]) .send:not([hidden]), .pop:not([hidden]) .x')).filter(function (b) { return b.offsetParent !== null || b === ta; }); };
    var syncText = function () {
      var has = ta.value.trim().length > 0;
      ta.classList.toggle('has', has); send.hidden = !has;
      hint.textContent = has ? ta.value.length + '/' + CONFIG.maxText + ' · pick a face or Send' : 'Pick one to send · your note goes with it';
    };
    var doOpen = function (how) {
      if (open) return; open = true; clearTimeout(closeTimer);
      prevFocus = document.activeElement && document.activeElement !== host ? document.activeElement : null;
      $('.ttl').textContent = 'How\u2019s ' + gameTitle() + '?';
      $('.body').hidden = false; $('.done').hidden = true; pop.hidden = false;
      wrap.classList.add('open'); stk.setAttribute('aria-expanded', 'true');
      setMood('curious'); pauseGame();
      // keyboard / gamepad users get focus on the first choice; touch users are not forced into the keyboard
      if (how === 'key' || how === 'gamepad' || how === 'enter') setTimeout(function () { var b = $('.rate.fun'); if (b) b.focus({ preventScroll: true }); }, 30);
    };
    var doClose = function () {
      if (!open) return; open = false; clearTimeout(closeTimer);
      pop.hidden = true; wrap.classList.remove('open'); stk.setAttribute('aria-expanded', 'false');
      var a = root.activeElement || (document.activeElement === host ? host : null);
      if (a && a.blur) a.blur();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      else if (document.activeElement === host) host.blur && host.blur();
      prevFocus = null;
      if (mood === 'curious') { mood = 'happy'; moodUntil = 0; render('happy'); }
      resumeGame();
    };
    var doSubmit = function (rating) {
      var out = submit(rating, ta.value);
      ta.value = ''; syncText();
      $('.body').hidden = true; $('.done').hidden = false;
      $('.done .big').innerHTML = FACE(rating === 'skip' ? 'okay' : 'fun').replace('<svg', '<svg width="34" height="34"');
      setMood(rating === 'fun' ? 'party' : 'love', 2600);
      closeTimer = setTimeout(doClose, 1500);
      return out;
    };

    stk.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dragMoved) { dragMoved = false; return; }
      if (open) doClose(); else doOpen(e.detail === 0 ? 'enter' : 'tap');
    });
    $('.x').addEventListener('click', function (e) { e.stopPropagation(); doClose(); });
    root.querySelectorAll('.rate').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); doSubmit(b.getAttribute('data-r')); }); });
    send.addEventListener('click', function (e) { e.stopPropagation(); doSubmit(null); });
    ta.addEventListener('input', syncText);
    // keep every interaction inside the sticker away from the game's own (bubbling) listeners
    ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress', 'input'].forEach(function (ty) {
      host.addEventListener(ty, function (e) { e.stopPropagation(); }, { passive: true });
    });

    // drag the sticker to any corner (remembered per game)
    var drag = null, dragMoved = false;
    stk.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    stk.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on && Math.hypot(dx, dy) > 10) { drag.on = true; try { stk.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } wrap.classList.add('dragging'); if (open) doClose(); }
      if (drag.on) stk.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    var endDrag = function (e) {
      if (!drag) return;
      if (drag.on) {
        dragMoved = true; stk.style.transform = ''; wrap.classList.remove('dragging');
        var c = (e.clientY < innerHeight / 2 ? 't' : 'b') + (e.clientX < innerWidth / 2 ? 'l' : 'r');
        wrap.className = 'wrap ' + c; LS.set(cornerKey, c);
        setTimeout(function () { dragMoved = false; }, 50);
      }
      drag = null;
    };
    stk.addEventListener('pointerup', endDrag); stk.addEventListener('pointercancel', endDrag);

    var panelKey = function (e) {
      var inTa = e.target === host && root.activeElement === ta;
      if (e.key === 'Escape') { e.preventDefault(); doClose(); return; }
      if (inTa) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ta.value.trim()) { e.preventDefault(); doSubmit(null); }
        return;   // normal typing (incl. Space / Enter / arrows) stays in the text box
      }
      if (e.key === 'Tab') {
        var list = buttons(), i = list.indexOf(root.activeElement); if (!list.length) return;
        e.preventDefault(); list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') { e.preventDefault(); doSubmit(['fun', 'okay', 'skip'][+e.key - 1]); }
      else if (e.code === 'Backquote') { e.preventDefault(); doClose(); }
    };
    var move = function (d) {
      var list = buttons(); if (!list.length) return;
      var i = list.indexOf(root.activeElement);
      list[i < 0 ? 0 : (i + d + list.length) % list.length].focus();
    };
    var activate = function () { var a = root.activeElement; if (a && a !== ta && a.click) a.click(); else if (a === ta) { ta.blur(); move(1); } else move(0); };

    document.body.appendChild(host);
    ui = {
      host: host, isOpen: function () { return open; }, open: doOpen, close: doClose, render: render, look: look,
      panelKey: panelKey, move: move, activate: activate, submit: doSubmit,
      corner: function (c) { if (/^(t|b)(l|r)$/.test(c)) { wrap.className = 'wrap ' + c + (open ? ' open' : ''); LS.set(cornerKey, c); } return wrap.className.split(' ')[1]; }
    };
    render(mood);
    startObserver();
    setTimeout(flush, 4000);
  };

  /* ---------------- public API ---------------- */
  window.MoodSticker = {
    version: 1,
    config: CONFIG,
    event: function (type) { fire(type, false); },
    screen: function (name) { explicitScreen = String(name || '').slice(0, 40) || null; noteScreen(explicitScreen); if (explicitScreen && /^(play|game|race|level|enc|match)/i.test(explicitScreen)) lastInput = now(); },
    game: function (name) { if (name) gameName = String(name).slice(0, 40); },
    bindPause: function (h) { pauseHooks = h || null; },
    open: function () { if (ui) ui.open('api'); },
    close: function () { if (ui) ui.close(); },
    isOpen: function () { return !!(ui && ui.isOpen()); },
    corner: function (c) { return ui ? ui.corner(c) : null; },
    mood: function () { return mood; },
    submissions: function () { return readLog(); },
    flush: flush,
    // test helpers (used by tests/mood-sticker.test.js)
    _submit: function (rating, text) { return submit(rating, text); },
    _record: function (rating, text) { return buildRecord(rating, text); },
    _sniff: function (s) { sniff(s); }
  };
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
