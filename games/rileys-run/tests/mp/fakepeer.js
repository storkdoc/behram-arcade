// Test-only stand-in for peerjs.min.js: same Peer / DataConnection API the game uses, transport = a
// Node "broker" (Playwright exposeFunction) that emulates the PeerJS cloud server (id registry,
// unavailable-id, peer-unavailable) plus a WebRTC data channel with configurable latency / jitter.
(() => {
  class Em { constructor() { this._h = {}; } on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; } emit(e, ...a) { (this._h[e] || []).slice().forEach(f => { try { f(...a); } catch (x) { console.error('fakepeer handler', e, x && x.message); } }); } }
  const peers = {}, conns = {}; let seq = 0;
  window.__rx = []; // every data message this page received (secrecy test)
  const B = o => window.__broker(JSON.stringify(o));
  class Conn extends Em {
    constructor(cid, peer, remote, o) { super(); this.cid = cid; this._p = peer; this.peer = remote; this.label = o.label || 'c'; this.metadata = o.metadata; this.reliable = !!o.reliable; this.open = false; conns[cid] = this; }
    send(d) { if (!this.open) throw new Error('not open'); B({ op: 'send', cid: this.cid, d, rel: this.reliable }); }
    close() { if (this._closed) return; this._closed = true; const was = this.open; this.open = false; B({ op: 'close', cid: this.cid }); delete conns[this.cid]; this.emit('close'); }
  }
  class Peer extends Em {
    constructor(id, opts) {
      super(); if (typeof id !== 'string') id = 'rnd-' + Math.random().toString(36).slice(2, 10);
      this.id = id; this.key = 'k' + (++seq) + '-' + Math.random().toString(36).slice(2, 6); this.open = false; this.destroyed = false; this.disconnected = false; peers[this.key] = this;
      B({ op: 'reg', key: this.key, id });
    }
    connect(id, o = {}) { const cid = this.key + '-c' + (++seq); const c = new Conn(cid, this, id, o); B({ op: 'connect', key: this.key, cid, to: id, from: this.id, label: c.label, metadata: o.metadata || null, rel: !!o.reliable }); return c; }
    disconnect() { if (this.disconnected) return; this.disconnected = true; this.open = false; B({ op: 'unreg', key: this.key }); setTimeout(() => this.emit('disconnected', this.id), 0); }
    reconnect() { if (this.destroyed || !this.disconnected) return; this.disconnected = false; B({ op: 'reg', key: this.key, id: this.id }); }
    destroy() { if (this.destroyed) return; this.destroyed = true; for (const c of Object.values(conns)) if (c._p === this) c.close(); this.disconnect(); delete peers[this.key]; }
  }
  window.__fromBroker = s => {
    const m = JSON.parse(s);
    if (m.op === 'open') { const p = peers[m.key]; if (p && !p.destroyed) { p.open = true; p.emit('open', p.id); } }
    else if (m.op === 'error') { const p = peers[m.key]; if (p && !p.destroyed) p.emit('error', Object.assign(new Error(m.message), { type: m.type })); }
    else if (m.op === 'conn') { const p = peers[m.key]; if (!p || p.destroyed) return B({ op: 'close', cid: m.cid }); const c = new Conn(m.cid, p, m.from, { label: m.label, metadata: m.metadata, reliable: m.rel }); p.emit('connection', c); }
    else if (m.op === 'copen') { const c = conns[m.cid]; if (c && !c._closed) { c.open = true; c.emit('open'); } }
    else if (m.op === 'data') { const c = conns[m.cid]; if (c && c.open) { window.__rx.push({ at: performance.now(), raw: JSON.stringify(m.d), label: c.label }); c.emit('data', m.d); } }
    else if (m.op === 'cclose') { const c = conns[m.cid]; if (c && !c._closed) { c._closed = true; c.open = false; delete conns[m.cid]; c.emit('close'); } }
  };
  window.Peer = Peer;
})();
