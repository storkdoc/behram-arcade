// Node side of fakepeer.js. latency: one-way ms (+ uniform jitter); unordered ("reliable:false") channels may reorder.
module.exports = function makeBroker({ lat = 40, jit = 10 } = {}) {
  const ids = new Map(), keys = new Map(), conns = new Map(), pages = new Map(); const log = [];
  const to = (page, m, delay = 0) => setTimeout(() => { if (!page.isClosed()) page.evaluate(s => window.__fromBroker(s), JSON.stringify(m)).catch(() => {}); }, delay);
  const d1 = () => lat + Math.random() * jit;
  function handle(page, s) {
    const m = JSON.parse(s);
    if (m.op === 'reg') {
      if (ids.has(m.id) && ids.get(m.id).key !== m.key) { to(page, { op: 'error', key: m.key, type: 'unavailable-id', message: 'ID "' + m.id + '" is taken' }, 30); return; }
      ids.set(m.id, { key: m.key, page }); keys.set(m.key, { id: m.id, page }); log.push(['reg', m.id]); to(page, { op: 'open', key: m.key }, 30);
    } else if (m.op === 'unreg') { const k = keys.get(m.key); if (k && ids.get(k.id) && ids.get(k.id).key === m.key) ids.delete(k.id); keys.delete(m.key); log.push(['unreg', k && k.id]); }
    else if (m.op === 'connect') {
      const t = ids.get(m.to);
      if (!t) { to(page, { op: 'error', key: m.key, type: 'peer-unavailable', message: 'Could not connect to peer ' + m.to }, 60); return; }
      const rcid = m.cid + '~'; conns.set(m.cid, { page: t.page, src: page, cid: rcid, rel: m.rel, last: 0 }); conns.set(rcid, { page, src: t.page, cid: m.cid, rel: m.rel, last: 0 });
      log.push(['connect', m.from, m.to, m.label]);
      to(t.page, { op: 'conn', key: t.key, cid: rcid, from: m.from, label: m.label, metadata: m.metadata, rel: m.rel }, 60);
      setTimeout(() => { to(t.page, { op: 'copen', cid: rcid }); to(page, { op: 'copen', cid: m.cid }); }, 60 + 2 * lat); // ICE + DTLS ~ a round trip
    } else if (m.op === 'send') {
      const c = conns.get(m.cid); if (!c) return;
      let at = Date.now() + d1();
      if (m.rel) { at = Math.max(at, c.last + 0.1); c.last = at; }
      to(c.page, { op: 'data', cid: c.cid, d: m.d }, at - Date.now());
    } else if (m.op === 'close') { const c = conns.get(m.cid); if (!c) return; conns.delete(m.cid); conns.delete(c.cid); to(c.page, { op: 'cclose', cid: c.cid }, lat); }
  }
  function attach(page) {
    pages.set(page, true);
    page.on('close', () => {
      for (const [id, v] of [...ids]) if (v.page === page) ids.delete(id);
      for (const [cid, c] of [...conns]) if (c.page === page) { conns.delete(cid); conns.delete(c.cid); to(c.src, { op: 'cclose', cid }, lat); }
    });
    return s => handle(page, s);
  }
  return { attach, ids, log };
};
