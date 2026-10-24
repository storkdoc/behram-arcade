/* ==========================================================================
   ATARI FOOTBALL — net.js
   Online play over WebRTC using PeerJS (vendored, ../peerjs.min.js) and the
   free PeerJS cloud signalling server. Host-authoritative:
     host  -> guest : {t:'s', s:snapshot}  ~30x per second, {t:'ping'}
     guest -> host  : {t:'i', x, y, a, b, ac, bc}  stick + buttons (+press counters)
                      {t:'pick', id}  play call (hidden until both lock)
                      {t:'rematch'}
   The room code is 5 letters; the host's peer id is 'atarifb-' + CODE.
   ========================================================================== */
const Net = (() => {
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const PREFIX = 'atarifb-';
  const OPTS = { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  const st = { role: null, code: '', status: 'idle', error: '', ping: null, lastRx: 0 };
  let peer = null, conn = null, onMsg = null, hb = null, joinTimer = null;

  const genCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
  const now = () => performance.now();

  function friendly(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'NO GAME FOUND WITH CODE ' + st.code + '. CHECK THE CODE AND TRY AGAIN.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return "CAN'T REACH THE MATCHMAKING SERVER. CHECK YOUR INTERNET CONNECTION.";
    if (t === 'browser-incompatible') return "THIS BROWSER CAN'T DO PEER-TO-PEER. TRY CHROME OR SAFARI.";
    if (t === 'unavailable-id') return 'COULD NOT RESERVE A ROOM CODE. TRY AGAIN.';
    if (t === 'webrtc') return 'THE DIRECT CONNECTION FAILED (FIREWALL?). TRY ANOTHER NETWORK.';
    if (t === 'timeout') return 'CONNECTION TIMED OUT. IS YOUR BUDDY STILL HOSTING?';
    return 'NETWORK ERROR: ' + String(t || e || 'UNKNOWN').toUpperCase();
  }
  function fail(e) {
    if (st.status === 'error') return;
    st.status = 'error'; st.error = friendly(e);
    console.warn('[net]', e && e.type, e && e.message);
    cleanup(true);
  }
  function cleanup(keepStatus) {
    clearInterval(hb); hb = null; clearTimeout(joinTimer); joinTimer = null;
    try { conn && conn.close(); } catch (_) { }
    try { peer && peer.destroy(); } catch (_) { }
    conn = null; peer = null;
    if (!keepStatus) { st.status = 'idle'; st.error = ''; }
  }

  function wire(c) {
    conn = c;
    c.on('open', () => { st.status = 'connected'; st.lastRx = now(); clearTimeout(joinTimer); startHeartbeat(); onMsg && onMsg({ t: 'hello' }); });
    c.on('data', d => {
      st.lastRx = now();
      if (!d || typeof d !== 'object') return;
      if (d.t === 'ping') { c.send({ t: 'pong', ts: d.ts }); return; }
      if (d.t === 'pong') { st.ping = Math.round(now() - d.ts); return; }
      if (d.t === 'full') { st.status = 'error'; st.error = 'THAT GAME ALREADY HAS TWO PLAYERS.'; cleanup(true); return; }
      onMsg && onMsg(d);
    });
    c.on('close', () => { if (st.status === 'connected') { st.status = 'error'; st.error = 'YOUR BUDDY DISCONNECTED.'; cleanup(true); } });
    c.on('error', e => fail(e));
  }
  function startHeartbeat() {
    clearInterval(hb);
    hb = setInterval(() => {
      if (!conn || !conn.open) return;
      conn.send({ t: 'ping', ts: now() });
      if (now() - st.lastRx > 8000) { st.status = 'error'; st.error = 'CONNECTION LOST.'; cleanup(true); }
    }, 1000);
  }

  /** become host: reserve a room code (retry on collision) */
  function host() {
    cleanup(); st.role = 'host'; st.status = 'opening'; st.ping = null;
    if (typeof Peer === 'undefined') return fail({ type: 'browser-incompatible' });
    let tries = 0;
    const attempt = () => {
      st.code = genCode();
      peer = new Peer(PREFIX + st.code, OPTS);
      peer.on('open', () => { st.status = 'waiting'; });
      peer.on('connection', c => {
        if (conn && conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 400); }); return; }
        wire(c);
      });
      peer.on('disconnected', () => { if (st.status === 'waiting') { try { peer.reconnect(); } catch (_) { } } });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && tries++ < 5) { try { peer.destroy(); } catch (_) { } attempt(); return; }
        if (st.status === 'connected' && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')) return; // signalling lost, data channel still fine
        fail(e);
      });
    };
    attempt();
  }
  /** join a host by room code */
  function join(code) {
    cleanup(); st.role = 'guest'; st.code = code.toUpperCase(); st.status = 'connecting'; st.ping = null;
    if (typeof Peer === 'undefined') return fail({ type: 'browser-incompatible' });
    peer = new Peer(OPTS);
    peer.on('open', () => { wire(peer.connect(PREFIX + st.code, { reliable: true, serialization: 'json' })); });
    peer.on('error', e => { if (st.status === 'connected' && e.type !== 'peer-unavailable') return; fail(e); });
    joinTimer = setTimeout(() => { if (st.status !== 'connected') fail({ type: 'timeout' }); }, 15000);
  }
  function send(o) { if (conn && conn.open) { try { conn.send(o); } catch (e) { console.warn(e); } } }
  function leave() { cleanup(); st.role = null; st.code = ''; }
  return { st, host, join, send, leave, set onMessage(f) { onMsg = f; }, ALPH };
})();
