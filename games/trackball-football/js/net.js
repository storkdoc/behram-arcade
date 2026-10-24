/* ==========================================================================
   TRACKBALL FOOTBALL — net.js
   Online two-player over WebRTC using PeerJS (vendored, ../peerjs.min.js)
   and the free PeerJS cloud signalling server. No server of our own:

   MATCHMAKING ("slots")
     A host registers the first free well-known peer id
         behram-tbf-v1-slot-1 ... behram-tbf-v1-slot-20
     (the server answers 'unavailable-id' when one is taken -> try the next)
     plus a backup room-code id  behram-tbf-v1-code-XXXXX.
     A joiner dials every slot at once. Empty slots fail fast with
     'peer-unavailable'; a live host answers {t:'avail'} once the data channel
     opens. The joiner claims ONE host ({t:'claim'}); the host accepts exactly
     one claim ({t:'welcome'}) and answers everybody else {t:'busy'}, so a
     loser simply claims the next host it heard from. As soon as a host is
     paired it drops off the signalling server, which frees its slot and code
     for the next pair (the direct WebRTC link keeps running). Closing the tab
     frees the ids too.

   GAME PROTOCOL (host-authoritative)
     Two data channels per pair: a reliable one (lock / need / pick / rematch
     / ping) and an unordered 'fast' one (reliable:false) for state and stick
     input. Fast messages carry a sequence number n; older ones are dropped.
     host  -> guest : {t:'s', n, s:snapshot}  ~60x per second (built for GOLD's
                      eyes: the host's play call is never in it before the snap)
                      {t:'need'}   "both locked - send me your call now"
                      {t:'ping'}
     guest -> host  : {t:'i', n, x, y, a, b, ac, bc}  stick + buttons, sent the
                      moment they change (not sent while picking, so cursor moves never leave the guest)
                      {t:'lock'}   guest has locked in (no play id!)
                      {t:'pick', id}  only after the host asked with 'need'
                      {t:'rematch'}
   ========================================================================== */
const Net = (() => {
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const NS = 'behram-tbf-v1-', SLOTS = 20;
  const SLOT = n => NS + 'slot-' + n, CODEID = c => NS + 'code-' + c;
  const OPTS = { debug: 0, // empty slots are expected while scanning; keep the console quiet
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  // status: idle | opening | waiting | scanning | connecting | connected | nogame | error
  const st = { role: null, code: '', slot: 0, status: 'idle', error: '', ping: null, lastRx: 0, incoming: 0, dead: 0, live: 0, busy: 0, via: '', fast: false };
  let peers = [], conn = null, fast = null, sigT = null, gatherT = null, onMsg = null, hb = null, timer = null, pending = [], claimed = null, queue = [];

  const genCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
  const now = () => performance.now();
  const safe = f => { try { f(); } catch (_) { } };

  function friendly(e) {
    const t = e && e.type;
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return "CAN'T REACH THE MATCHMAKING SERVER. CHECK YOUR INTERNET CONNECTION.";
    if (t === 'browser-incompatible') return "THIS BROWSER CAN'T DO PEER-TO-PEER. TRY CHROME OR SAFARI.";
    if (t === 'unavailable-id') return 'COULD NOT RESERVE A GAME ON THE SERVER. TRY AGAIN.';
    if (t === 'webrtc') return 'THE DIRECT CONNECTION FAILED (FIREWALL?). TRY ANOTHER NETWORK.';
    return 'NETWORK ERROR: ' + String(t || e || 'UNKNOWN').toUpperCase();
  }
  function fail(e, msg) {
    if (st.status === 'error') return;
    st.status = 'error'; st.error = msg || friendly(e);
    console.warn('[net]', e && e.type, e && e.message);
    cleanup(true);
  }
  function cleanup(keepStatus) {
    clearInterval(hb); hb = null; clearTimeout(timer); timer = null; clearTimeout(sigT); sigT = null; clearTimeout(gatherT); gatherT = null;
    for (const c of pending) safe(() => c.close());
    safe(() => fast && fast.close()); fast = null;
    safe(() => conn && conn.close());
    for (const p of peers) safe(() => p.destroy());
    peers = []; pending = []; queue = []; claimed = null; conn = null; st.fast = false;
    if (!keepStatus) { st.status = 'idle'; st.error = ''; }
  }

  /* ---------- the one paired connection ---------- */
  function paired(c) {
    conn = c; st.status = 'connected'; st.lastRx = now(); clearTimeout(timer); timer = null;
    for (const o of pending) if (o !== c) safe(() => o.close());
    pending = []; queue = [];
    // host: drop off the signalling server (frees our slot / code id for other players) as soon as the
    // guest's second, low-latency channel is up (or after 6 s without it)
    if (st.role === 'host') sigT = setTimeout(releaseIds, 6000);
    // guest: open the low-latency channel (unordered, so a late packet never holds up newer state)
    if (st.role === 'guest') safe(() => {
      const p = peers[0], f = p.connect(c.peer, { reliable: false, serialization: 'json', label: 'fast', metadata: { fast: 1 } });
      f.on('open', () => { fast = f; st.fast = true; });
      f.on('data', d => d && typeof d === 'object' && mainData(f, d));
      f.on('close', () => { if (fast === f) { fast = null; st.fast = false; } });
      f.on('error', () => { });
    });
    startHeartbeat(); onMsg && onMsg({ t: 'hello' });
  }
  function releaseIds() { clearTimeout(sigT); sigT = null; if (st.role === 'host') for (const p of peers) safe(() => p.disconnect()); }
  function mainData(c, d) {
    st.lastRx = now();
    if (d.t === 'ping') { c.send({ t: 'pong', ts: d.ts }); return; }
    if (d.t === 'pong') { st.ping = Math.round(now() - d.ts); return; }
    if (d.t === 'avail' || d.t === 'claim' || d.t === 'welcome' || d.t === 'busy') return;
    onMsg && onMsg(d);
  }
  function mainClose() { if (st.status === 'connected') { st.status = 'error'; st.error = 'YOUR BUDDY DISCONNECTED.'; cleanup(true); } }
  function startHeartbeat() {
    clearInterval(hb);
    hb = setInterval(() => {
      if (!conn || !conn.open) return;
      safe(() => conn.send({ t: 'ping', ts: now() }));
      if (now() - st.lastRx > 8000) { st.status = 'error'; st.error = 'CONNECTION LOST.'; cleanup(true); }
    }, 1000);
  }

  /* ---------- HOST ---------- */
  function hostIncoming(c) {
    if (c.metadata && c.metadata.fast) { // the paired guest's low-latency channel
      if (!conn || c.peer !== conn.peer) { safe(() => c.close()); return; }
      c.on('open', () => { fast = c; st.fast = true; releaseIds(); });
      c.on('data', d => d && typeof d === 'object' && mainData(c, d));
      c.on('close', () => { if (fast === c) { fast = null; st.fast = false; } });
      c.on('error', () => { });
      return;
    }
    st.incoming++;
    pending.push(c);
    const drop = () => { pending = pending.filter(o => o !== c); };
    c.on('open', () => {
      if (conn) { safe(() => c.send({ t: 'busy' })); setTimeout(() => safe(() => c.close()), 400); return; }
      safe(() => c.send({ t: 'avail', v: 1 }));
      setTimeout(() => { if (c !== conn) { safe(() => c.close()); drop(); } }, 15000); // never claimed -> let it go
    });
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (c === conn) return mainData(c, d);
      if (d.t === 'claim') {
        if (!conn && st.role === 'host' && st.status !== 'error') { safe(() => c.send({ t: 'welcome', code: st.code })); paired(c); }
        else { safe(() => c.send({ t: 'busy' })); setTimeout(() => safe(() => c.close()), 400); }
      }
    });
    c.on('close', () => { if (c === conn) mainClose(); else drop(); });
    c.on('error', e => { if (c === conn) fail(e); else drop(); });
  }
  function hostPeer(id, onOpen, onTaken) {
    const p = new Peer(id, OPTS); peers.push(p);
    p.on('open', () => onOpen(p));
    p.on('connection', hostIncoming);
    p.on('disconnected', () => { if (st.status === 'waiting' || st.status === 'opening') safe(() => p.reconnect()); });
    p.on('error', e => {
      if (e.type === 'unavailable-id') { peers = peers.filter(o => o !== p); safe(() => p.destroy()); onTaken(); return; }
      if (e.type === 'peer-unavailable') return;
      if (st.status === 'connected') return; // signalling hiccup; the data channel is what matters now
      fail(e);
    });
    return p;
  }
  /** host a two-player game: grab a backup room code, then the first free slot */
  function host() {
    cleanup(); st.role = 'host'; st.status = 'opening'; st.ping = null; st.slot = 0; st.code = ''; st.incoming = 0; st.via = '';
    if (typeof Peer === 'undefined') return fail({ type: 'browser-incompatible' });
    let codeTries = 0, n = 1, codeOk = false, slotDone = false;
    const ready = () => { if (codeOk && slotDone && st.status === 'opening') st.status = 'waiting'; };
    const tryCode = () => {
      const code = genCode();
      hostPeer(CODEID(code), () => { st.code = code; codeOk = true; ready(); }, () => { if (codeTries++ < 5) tryCode(); else fail({ type: 'unavailable-id' }); });
    };
    const trySlot = () => {
      if (st.role !== 'host' || conn) return;
      if (n > SLOTS) { st.slot = 0; slotDone = true; ready(); return; } // all slots busy: room code only
      const k = n;
      hostPeer(SLOT(k), () => { st.slot = k; slotDone = true; ready(); }, () => { n++; trySlot(); });
    };
    tryCode(); trySlot();
  }

  /* ---------- GUEST ---------- */
  const slotOf = id => { const m = /slot-(\d+)$/.exec(id || ''); return m ? +m[1] : 0; };
  function tryClaim() {
    if (claimed || conn || gatherT) return;
    const c = queue.shift(); if (!c) return maybeNone();
    claimed = c; safe(() => c.send({ t: 'claim' }));
  }
  function maybeNone() {
    if (gatherT) return;
    // every target answered "nobody here" (or turned us away) and nothing is still dialing
    if (conn || claimed || queue.length) return;
    if (st.status !== 'scanning' && st.status !== 'connecting') return;
    if (pending.length === 0) noGame();
  }
  function noGame() {
    if (conn || st.status === 'nogame' || st.status === 'error') return;
    const sawHost = pending.length > 0; // a host exists but the direct link never opened
    cleanup(true);
    if (st.via === 'code') { st.status = 'error'; st.error = st.busy ? 'THAT GAME ALREADY HAS TWO PLAYERS.' : sawHost ? 'FOUND THE GAME BUT COULD NOT CONNECT TO IT (FIREWALL?). TRY ANOTHER NETWORK.' : 'NO GAME FOUND WITH CODE ' + st.code + '. CHECK THE CODE AND TRY AGAIN.'; }
    else { st.status = 'nogame'; st.error = sawHost ? 'FOUND A GAME BUT COULD NOT CONNECT TO IT (FIREWALL?). TRY AGAIN OR USE ANOTHER NETWORK.' : ''; }
  }
  function dial(p, id) {
    const c = p.connect(id, { reliable: true, serialization: 'json' });
    c.__id = id; pending.push(c);
    const drop = () => { pending = pending.filter(o => o !== c); queue = queue.filter(o => o !== c); if (claimed === c) claimed = null; };
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (c === conn) return mainData(c, d);
      if (d.t === 'avail') { st.live++; queue.push(c); queue.sort((a, b) => slotOf(a.__id) - slotOf(b.__id)); if (!gatherT) gatherT = setTimeout(() => { gatherT = null; tryClaim(); }, 150); } // gather briefly, then claim the longest-waiting (lowest) slot
      else if (d.t === 'busy') { st.busy++; drop(); safe(() => c.close()); tryClaim(); maybeNone(); }
      else if (d.t === 'welcome' && claimed === c) { claimed = null; if (d.code) st.code = d.code; const m = /slot-(\d+)$/.exec(id); st.slot = m ? +m[1] : 0; paired(c); }
    });
    c.on('close', () => { if (c === conn) return mainClose(); drop(); tryClaim(); maybeNone(); });
    c.on('error', () => { if (c === conn) return; drop(); tryClaim(); maybeNone(); });
    return c;
  }
  function seek(ids, via, code) {
    cleanup(); st.role = 'guest'; st.via = via; st.code = code || ''; st.slot = 0; st.ping = null; st.dead = 0; st.live = 0; st.busy = 0;
    st.status = via === 'code' ? 'connecting' : 'scanning';
    if (typeof Peer === 'undefined') return fail({ type: 'browser-incompatible' });
    const p = new Peer(OPTS); peers.push(p);
    p.on('open', () => { for (const id of ids) dial(p, id); });
    p.on('error', e => {
      if (e.type === 'peer-unavailable') { // an empty slot / unknown code: fails fast
        st.dead++;
        const m = /peer (\S+)/.exec(e.message || ''), id = m && m[1];
        const c = pending.find(o => o.__id === id);
        if (c) { pending = pending.filter(o => o !== c); safe(() => c.close()); }
        maybeNone(); return;
      }
      if (st.status === 'connected') return;
      fail(e);
    });
    timer = setTimeout(noGame, 12000); // live hosts that never answer (NAT / zombie)
  }
  /** join whichever two-player game is waiting (no code needed) */
  function joinAny() { const ids = []; for (let n = 1; n <= SLOTS; n++) ids.push(SLOT(n)); seek(ids, 'scan'); }
  /** backup path: join by the host's room code */
  function join(code) { code = code.toUpperCase(); seek([CODEID(code)], 'code', code); }

  /** reliable, ordered: play calls, rematch, heartbeat */
  function send(o) { if (conn && conn.open) { try { conn.send(o); } catch (e) { console.warn(e); } } }
  /** low-latency (unordered) when available: state snapshots and stick input. Every message carries a sequence number. */
  function sendFast(o) { if (fast && fast.open) { try { fast.send(o); return; } catch (e) { } } send(o); }
  function leave() { cleanup(); st.role = null; st.code = ''; st.slot = 0; }
  return { st, host, join, joinAny, send, sendFast, leave, set onMessage(f) { onMsg = f; }, ALPH, SLOTS, SLOT, CODEID };
})();
