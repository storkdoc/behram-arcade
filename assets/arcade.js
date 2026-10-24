/* ==========================================================================
   BEHRAM ARCADE — landing page: a rotating 3D carousel of arcade cabinets.
   Reads window.ARCADE_GAMES (games.js). Fields used per entry:
     slug, title, thumb, added            (as before)
     accent        cabinet colour (optional)
     color         optional override for the cabinet / side-art colour
     marquee       optional marquee style 0-3 or 'neon' | 'chrome' | 'sunset' | 'block'
     path | url    optional launch URL (default games/<slug>/index.html)
   Anything missing falls back to sensible defaults. Newest first (by "added").
   Deep link: index.html?game=<slug>
   ========================================================================== */
(() => {
  'use strict';
  const KEY = { sel: 'arcade.selected', newest: 'arcade.newestSeen', mute: 'arcade.muted' };
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchy = matchMedia('(hover: none), (pointer: coarse)').matches;

  // ---------- data ----------
  const raw = Array.isArray(window.ARCADE_GAMES) ? window.ARCADE_GAMES : [];
  const games = raw.filter(g => g && g.slug)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => String(b.g.added || '').localeCompare(String(a.g.added || '')) || a.i - b.i)
    .map(x => x.g);
  const PALETTE = ['#ff47e6', '#36e6ff', '#ffe81a', '#7dff5a', '#ff8a3d', '#a06bff', '#ff4d6d', '#3e8bff'];
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const hex = c => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x);
    return [0, 2, 4].map(k => parseInt(h.substr(k, 2), 16));
  };
  const mix = (a, b, t) => '#' + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('');
  const rgba = (a, al) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;
  const colors = (c) => {
    const ac = hex(c) || hex(PALETTE[0]);
    const K = [0, 0, 0], Wt = [255, 255, 255], body = [12, 9, 18];
    return {
      ac: mix(ac, ac, 0), l: mix(ac, Wt, 0.45), d: mix(ac, K, 0.55), dd: mix(ac, body, 0.8),
      body1: mix(ac, body, 0.84), body2: mix(ac, body, 0.95), cp1: mix(ac, body, 0.6), cp2: mix(ac, body, 0.82),
      lip: mix(ac, body, 0.9), glow: rgba(ac, 0.55), glow2: rgba(ac, 0.28)
    };
  };
  const STYLES = { neon: 0, chrome: 1, sunset: 2, block: 3 };
  const items = games.map((g, i) => {
    const slug = String(g.slug);
    const style = g.marquee in STYLES ? STYLES[g.marquee] : (Number.isInteger(g.marquee) ? ((g.marquee % 4) + 4) % 4 : hash(slug) % 4);
    return {
      slug, title: String(g.title || slug).toUpperCase(), soon: false, style,
      url: g.path || g.url || `games/${encodeURIComponent(slug)}/index.html`,
      thumb: g.thumb || `games/${slug}/thumb.png`,
      c: colors(g.color || g.cabinet || g.accent || PALETTE[hash(slug) % PALETTE.length]),
      isNew: i === 0 && g.added && (Date.now() - new Date(g.added + 'T00:00:00')) / 864e5 < 2
    };
  });
  items.push({ slug: '__soon', title: 'COMING SOON', soon: true, style: 0, c: colors('#3a3846') });
  const n = items.length;

  // ---------- DOM ----------
  const track = document.getElementById('track');
  const carousel = document.getElementById('carousel');
  const press = document.getElementById('press');
  const live = document.getElementById('live');
  const aura = document.getElementById('aura');
  const muteBtn = document.getElementById('mute');
  document.getElementById('count').textContent = `${games.length} GAME${games.length === 1 ? '' : 'S'}`;
  const hintEl = document.getElementById('hint');
  const setHint = pad => {
    hintEl.textContent = pad ? 'D-PAD SELECT · Ⓐ PLAY' : touchy ? 'SWIPE TO BROWSE · TAP TO PLAY' : '◀ ▶ SELECT · ENTER PLAY';
  };
  setHint(false);

  const splitTitle = t => {
    if (t.length <= 11 || t.indexOf(' ') < 0) return t;
    const words = t.split(' '); let best = t, bestScore = 1e9;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const s = Math.max(a.length, b.length); if (s < bestScore) { bestScore = s; best = a + '\n' + b; }
    }
    return best;
  };
  const button = (x, y, col, rx = 9, ry = 4) => {
    const dk = mix(hex(col), [0, 0, 0], 0.5);
    return `<ellipse cx="${x}" cy="${y + 2.8}" rx="${rx + 0.8}" ry="${ry + 0.4}" fill="#000" opacity=".6"/>` +
      `<ellipse cx="${x}" cy="${y + 1.6}" rx="${rx}" ry="${ry}" fill="${dk}"/>` +
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${col}"/>` +
      `<ellipse cx="${x - rx * 0.28}" cy="${y - ry * 0.32}" rx="${rx * 0.38}" ry="${ry * 0.3}" fill="#fff" opacity=".55"/>`;
  };
  const cabSVG = (id, it) => {
    const c = it.c, off = it.soon;
    const tm = off ? '#4a4856' : c.ac;
    const btns = off ? ['#55525f', '#55525f', '#55525f', '#55525f'] : [c.ac, '#ff3b3b', '#ffd23c', '#3e8bff'];
    const coin = off ? '#2a1214' : '#ff2a2a';
    let slots = '';
    for (const x of [118, 154]) {
      slots += `<rect x="${x}" y="382" width="28" height="40" rx="2" fill="#0b0b10"/>` +
        (off ? '' : `<rect x="${x + 1.5}" y="384.5" width="25" height="15" rx="2" fill="#ff2a2a" opacity=".35"/>`) +
        `<rect x="${x + 3}" y="386" width="22" height="12" rx="1.5" fill="${coin}"/>` +
        `<rect x="${x + 4}" y="387" width="20" height="3" rx="1" fill="#fff" opacity="${off ? 0.05 : 0.35}"/>` +
        `<rect x="${x + 12.5}" y="403" width="3" height="14" rx="1" fill="#000"/>`;
    }
    return `<svg class="body" viewBox="0 0 300 560" preserveAspectRatio="none" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.body1}"/><stop offset="1" stop-color="${c.body2}"/></linearGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.dd}"/><stop offset=".55" stop-color="${c.d}"/><stop offset="1" stop-color="${c.dd}"/></linearGradient>
<linearGradient id="${id}cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cp2}"/><stop offset="1" stop-color="${c.cp1}"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b7080"/><stop offset=".45" stop-color="#2c2f38"/><stop offset=".55" stop-color="#3a3e49"/><stop offset="1" stop-color="#14151b"/></linearGradient>
<linearGradient id="${id}sv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3c3f48"/><stop offset=".4" stop-color="#d9dce6"/><stop offset="1" stop-color="#4a4d57"/></linearGradient>
<linearGradient id="${id}z" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16131d"/><stop offset="1" stop-color="#060508"/></linearGradient>
<radialGradient id="${id}ball" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#ffd6d6"/><stop offset=".22" stop-color="#ff3434"/><stop offset=".8" stop-color="#7a0010"/><stop offset="1" stop-color="#3a0008"/></radialGradient>
<radialGradient id="${id}spill" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${off ? '#000' : c.ac}" stop-opacity=".28"/><stop offset="1" stop-color="${c.ac}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="300" height="560" fill="url(#${id}b)"/>
<path d="M14 338 L92 338 L14 452Z" fill="${tm}" opacity=".16"/><path d="M14 352 L58 352 L14 416Z" fill="${tm}" opacity=".22"/>
<path d="M286 338 L208 338 L286 452Z" fill="${tm}" opacity=".16"/><path d="M286 352 L242 352 L286 416Z" fill="${tm}" opacity=".22"/>
<rect x="0" width="14" height="560" fill="url(#${id}r)"/><rect x="286" width="14" height="560" fill="url(#${id}r)"/>
<rect x="5.6" width="2.8" height="560" fill="${tm}"/><rect x="291.6" width="2.8" height="560" fill="${tm}"/>
<rect x="6.2" width=".9" height="560" fill="#fff" opacity="${off ? 0.1 : 0.55}"/><rect x="292.2" width=".9" height="560" fill="#fff" opacity="${off ? 0.1 : 0.55}"/>
<rect width="300" height="9" fill="#0b0a10"/><rect y="8" width="300" height="1.2" fill="#fff" opacity=".12"/>
<rect x="14" y="9" width="272" height="68" fill="#07060a"/>
<rect x="17.5" y="11.5" width="265" height="63" rx="1.5" fill="none" stroke="url(#${id}s)" stroke-width="2.2"/>
<rect x="14" y="76" width="272" height="5" fill="url(#${id}s)"/>
<rect x="20" y="86" width="260" height="178" rx="5" fill="url(#${id}z)"/>
<ellipse cx="150" cy="174" rx="150" ry="104" fill="url(#${id}spill)"/>
<rect x="24.5" y="90.5" width="251" height="169" rx="4" fill="none" stroke="${tm}" stroke-opacity=".5" stroke-width="1.2"/>
<rect x="28" y="96" width="244" height="156" rx="12" fill="#000"/>
<path d="M36 256 l7 -3.2 v6.4z M47 256 l7 -3.2 v6.4z M58 256 l7 -3.2 v6.4z M264 256 l-7 -3.2 v6.4z M253 256 l-7 -3.2 v6.4z M242 256 l-7 -3.2 v6.4z" fill="${tm}" opacity=".8"/>
<path d="M14 266 H286 L300 318 H0 Z" fill="url(#${id}cp)"/>
<path d="M44 266 H66 L50 318 H24Z M74 266 H82 L68 318 H58Z" fill="${tm}" opacity=".28"/>
<path d="M256 266 H234 L250 318 H276Z M226 266 H218 L232 318 H242Z" fill="${tm}" opacity=".28"/>
<rect x="14" y="266" width="272" height="1.2" fill="#fff" opacity=".22"/>
<rect y="318" width="300" height="20" fill="${c.lip}"/><rect y="318" width="300" height="1.6" fill="#fff" opacity=".3"/>
<rect y="327" width="300" height="2" fill="${tm}" opacity=".75"/>
<ellipse cx="76" cy="301" rx="19" ry="6.4" fill="#050507"/><ellipse cx="76" cy="300" rx="12.5" ry="4.2" fill="#24232c"/>
<rect x="73.4" y="278" width="5.2" height="22" rx="2" fill="url(#${id}sv)"/>
<circle cx="76" cy="276" r="11" fill="url(#${id}ball)"/>
${button(140, 303, btns[0])}${button(168, 297, btns[1])}${button(196, 297, btns[2])}${button(224, 303, btns[3])}
${button(116, 280, '#f2f2f6', 5, 2.4)}${button(258, 280, '#f2f2f6', 5, 2.4)}
<rect x="108" y="370" width="84" height="104" rx="3" fill="url(#${id}s)"/>
<rect x="110.5" y="372.5" width="79" height="99" rx="2" fill="none" stroke="#fff" stroke-opacity=".12"/>
${slots}
<circle cx="150" cy="452" r="4.2" fill="#a3a8b5"/><rect x="149.2" y="449" width="1.6" height="6" fill="#33343c"/>
<rect x="14" y="532" width="272" height="28" fill="#060509"/><rect x="14" y="532" width="272" height="1.6" fill="url(#${id}s)"/>
</svg>`;
  };

  track.innerHTML = items.map((it, i) => {
    const c = it.c;
    const vars = `--ac:${c.ac};--ac-l:${c.l};--ac-d:${c.d};--ac-dd:${c.dd};--glow:${c.glow};--glow2:${c.glow2}`;
    const t = splitTitle(it.title);
    const tag = it.soon ? 'div' : 'a';
    const attrs = it.soon
      ? `role="group" aria-disabled="true" aria-label="Coming soon: a new game every day"`
      : `href="${esc(it.url)}" draggable="false" aria-label="${esc(it.title)} — game ${i + 1} of ${n - 1}. Press Enter to play."`;
    return `<${tag} class="cab${it.soon ? ' soon' : ''}" data-i="${i}" data-slug="${esc(it.slug)}" tabindex="-1" style="${vars}" ${attrs}>
  <div class="face side l"><div class="art"></div><div class="shade"></div></div>
  <div class="face side r"><div class="art"></div><div class="shade"></div></div>
  <div class="face front">
    ${cabSVG('c' + i, it)}
    <div class="mq mq-${it.style}"><span class="mq-t" data-t="${esc(t)}">${esc(t)}</span></div>
    ${it.isNew ? '<span class="badge">NEW</span>' : ''}
    <div class="scr">${it.soon ? '<div class="note">A NEW GAME\nEVERY DAY</div>'
      : `<img src="${esc(it.thumb)}" alt="" draggable="false" decoding="async"><span class="ns">NO SIGNAL</span>`}</div>
    <div class="shade"></div>
  </div>
</${tag}>`;
  }).join('');
  const cabs = [...track.querySelectorAll('.cab')];
  const refs = cabs.map(el => ({ el, front: el.querySelector('.front'), shades: [...el.querySelectorAll('.shade')], title: el.querySelector('.mq-t'), mq: el.querySelector('.mq') }));
  track.querySelectorAll('.scr img').forEach(img => img.addEventListener('error', () => img.parentNode.classList.add('nosig')));

  // ---------- initial selection ----------
  const mod = (a, m) => ((a % m) + m) % m;
  const indexOf = slug => items.findIndex(it => !it.soon && it.slug === slug);
  let start = 0;
  const q = new URLSearchParams(location.search).get('game');
  const newest = games[0] ? String(games[0].slug) : '';
  if (q && indexOf(q) >= 0) start = indexOf(q);
  else if (newest && store.get(KEY.newest) !== newest) start = 0;       // a new game arrived: show it first
  else { const s = store.get(KEY.sel); if (s && (s === '__soon' || indexOf(s) >= 0)) start = s === '__soon' ? n - 1 : indexOf(s); }
  if (newest) store.set(KEY.newest, newest);

  // ---------- geometry ----------
  let W = 260, H = 486, D = 156, P = 1100, S1 = 260, S2 = 160, trackW = 0, eyeY = 0, floorY = 0;
  let pos = start, target = start, tween = null, raf = 0, dragging = false, centerShown = -1;

  function fitTitles() {
    const mqH = H * 58 / 560;
    refs.forEach(r => {
      const two = r.title.textContent.indexOf('\n') >= 0;
      let fs = mqH * (two ? 0.4 : 0.58);
      r.title.style.fontSize = fs.toFixed(2) + 'px';
      const avail = r.mq.clientWidth * 0.92, w = r.title.scrollWidth;
      if (w > avail) { fs *= avail / w; r.title.style.fontSize = fs.toFixed(2) + 'px'; }
    });
  }

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const head = document.querySelector('.marquee').getBoundingClientRect();
    const cap = document.getElementById('caption').getBoundingClientRect();
    const top0 = head.bottom + Math.max(8, vh * 0.025), bot0 = cap.top - 6;
    const avail = Math.max(120, bot0 - top0);
    const narrow = vw < 640;
    const ratio = 560 / 300;
    const portrait = vh > vw * 1.15;
    let w = Math.min(avail / (ratio * 1.07), vw * (narrow ? 0.62 : portrait ? 0.44 : vw < 1100 ? 0.33 : 0.25), 420);
    W = Math.max(96, Math.floor(w / 2) * 2);
    H = Math.round(W * ratio);
    D = Math.round(W * 0.58);
    trackW = vw;
    const top = Math.round(top0 + Math.max(0, (avail - H * 1.07) * 0.5));
    floorY = top + H;
    eyeY = Math.round(floorY - H * 0.64);
    P = Math.round(W * 4.6);
    S1 = W * (narrow ? 0.86 : vw / W < 3.4 ? 0.92 : 1.02);
    S2 = W * (narrow ? 0.52 : 0.6);
    const left = Math.round(vw / 2 - W / 2);
    track.style.perspective = P + 'px';
    track.style.perspectiveOrigin = `${Math.round(vw / 2)}px ${eyeY}px`;
    const st = document.documentElement.style;
    st.setProperty('--cw', W + 'px'); st.setProperty('--ch', H + 'px'); st.setProperty('--cd', D + 'px');
    cabs.forEach(el => { el.style.left = left + 'px'; el.style.top = top + 'px'; });
    aura.style.setProperty('--aura-y', Math.round(top + H * 0.36) + 'px');
    fitTitles();
    drawFloor(vw, vh);
    render();
  }

  // ---------- floor: neon arcade carpet in true perspective (matches the CSS camera) ----------
  const floorCv = document.getElementById('floor');
  let carpet = null;
  function makeCarpet() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#0a0617'; g.fillRect(0, 0, S, S);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cols = ['#ff47e6', '#36e6ff', '#ffe81a', '#7dff5a', '#a06bff', '#ff8a3d'];
    const shapes = [];
    for (let k = 0; k < 46; k++) shapes.push({ t: k % 6, x: rnd() * S, y: rnd() * S, r: 10 + rnd() * 22, a: rnd() * 6.28, c: cols[Math.floor(rnd() * cols.length)] });
    for (let k = 0; k < 140; k++) shapes.push({ t: 9, x: rnd() * S, y: rnd() * S, r: 1.5 + rnd() * 2.5, c: cols[Math.floor(rnd() * cols.length)] });
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of shapes) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x = s.x + ox, y = s.y + oy; if (x < -60 || x > S + 60 || y < -60 || y > S + 60) continue;
      g.save(); g.translate(x, y); g.rotate(s.a || 0); g.strokeStyle = g.fillStyle = s.c; g.lineWidth = 4.5; g.globalAlpha = 0.9;
      g.beginPath();
      if (s.t === 0) { g.moveTo(0, -s.r); g.lineTo(s.r * 0.87, s.r * 0.5); g.lineTo(-s.r * 0.87, s.r * 0.5); g.closePath(); g.stroke(); }
      else if (s.t === 1) { g.arc(0, 0, s.r * 0.7, 0, 6.283); g.stroke(); }
      else if (s.t === 2) { g.moveTo(-s.r, 0); for (let j = 1; j <= 4; j++) g.lineTo(-s.r + j * s.r / 2, j % 2 ? -s.r * 0.35 : s.r * 0.35); g.stroke(); }
      else if (s.t === 3) { g.moveTo(-s.r, 0); g.bezierCurveTo(-s.r * 0.4, -s.r, s.r * 0.4, s.r, s.r, 0); g.stroke(); }
      else if (s.t === 4) { for (let j = 0; j < 8; j++) { const rr = j % 2 ? s.r * 0.25 : s.r * 0.6, an = j * Math.PI / 4; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.closePath(); g.fill(); }
      else if (s.t === 5) { g.rect(-s.r * 0.45, -s.r * 0.45, s.r * 0.9, s.r * 0.9); g.stroke(); }
      else { g.arc(0, 0, s.r, 0, 6.283); g.fill(); }
      g.restore();
    }
    return cv;
  }
  function drawFloor(vw, vh) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    floorCv.width = Math.round(vw * dpr); floorCv.height = Math.round(vh * dpr);
    const g = floorCv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, floorCv.width, floorCv.height);
    if (!carpet) carpet = makeCarpet();
    const pat = g.createPattern(carpet, 'repeat');
    const OX = vw / 2 * dpr, OY = eyeY * dpr, FY = floorY * dpr, p = P * dpr;
    const zWall = -2.3 * p;                              // where the floor meets the back wall
    const yWall = OY + (FY - OY) * p / (p - zWall);
    const tile = W * 1.15 * dpr;                         // world size of one carpet tile
    const canSet = pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function';
    const y0 = Math.max(0, Math.floor(yWall));
    for (let y = y0; y < floorCv.height; y++) {
      const yc = y + 0.5;
      const sc = (yc - OY) / (FY - OY);                  // = p / (p - z)
      const z = p - p / sc;
      if (canSet) {
        const k = sc * tile / 512;
        const v = (((z / tile) % 1) + 1) % 1 * 512;
        pat.setTransform(new DOMMatrix([k, 0, 0, 1, OX - OX * sc, y - v]));
        g.fillStyle = pat;
      } else g.fillStyle = '#120a22';
      g.fillRect(0, y, floorCv.width, 1);
    }
    // darkness, distance fog and a glossy sheen
    const fog = g.createLinearGradient(0, yWall, 0, floorCv.height);
    fog.addColorStop(0, 'rgba(5,1,15,1)');
    fog.addColorStop(Math.min(0.99, Math.max(0.01, (FY - yWall) / (floorCv.height - yWall) * 0.75)), 'rgba(5,1,15,.86)');
    fog.addColorStop(Math.min(1, Math.max(0.02, (FY - yWall) / (floorCv.height - yWall))), 'rgba(5,1,15,.74)');
    fog.addColorStop(1, 'rgba(5,1,15,.8)');
    g.fillStyle = fog; g.fillRect(0, yWall, floorCv.width, floorCv.height - yWall);
    const side = g.createLinearGradient(0, 0, floorCv.width, 0);
    side.addColorStop(0, 'rgba(5,1,15,.75)'); side.addColorStop(0.3, 'rgba(5,1,15,0)'); side.addColorStop(0.7, 'rgba(5,1,15,0)'); side.addColorStop(1, 'rgba(5,1,15,.75)');
    g.fillStyle = side; g.fillRect(0, yWall, floorCv.width, floorCv.height - yWall);
    // pool of light under the centre cabinet
    const pool = g.createRadialGradient(OX, FY + W * 0.12 * dpr, 0, OX, FY + W * 0.12 * dpr, W * 1.5 * dpr);
    pool.addColorStop(0, 'rgba(255,255,255,.10)'); pool.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.translate(OX, FY); g.scale(1, 0.28); g.translate(-OX, -FY);
    g.fillStyle = pool; g.fillRect(0, FY - W * 3 * dpr, floorCv.width, W * 6 * dpr); g.restore();
    // baseboard neon where the wall meets the floor
    g.fillStyle = 'rgba(255,71,230,.35)'; g.fillRect(0, Math.round(yWall) - 1, floorCv.width, Math.max(1, Math.round(dpr)));
  }

  // ---------- rendering ----------
  const wrapD = (i, p) => { let d = mod(i - p, n); if (d >= n / 2) d -= n; return d; };
  const limit = Math.min(3.15, n / 2 - 0.3);
  function render() {
    for (let i = 0; i < n; i++) {
      const r = refs[i], d = wrapD(i, pos), a = Math.abs(d), s = Math.sign(d);
      if (a > limit + 0.01) { if (r.vis !== false) { r.el.style.visibility = 'hidden'; r.vis = false; } continue; }
      if (r.vis === false) { r.el.style.visibility = ''; r.vis = true; }
      const a1 = Math.min(a, 1), a2 = Math.max(0, a - 1);
      const dz = P * (0.27 * a1 + 0.2 * a2);
      const xs = s * (a1 * S1 + a2 * S2);
      const xw = xs * (P + dz) / P;
      const rot = -s * (a1 * 30 + a2 * 9);
      r.el.style.transform = a < 1e-4
        ? `translate3d(0px,0px,${-D}px)`
        : `translate3d(${xw.toFixed(2)}px,0px,${(-dz - D).toFixed(2)}px) rotateY(${rot.toFixed(3)}deg)`;
      r.el.style.zIndex = String(1000 - Math.round(a * 100));
      const edge = Math.max(0, Math.min(1, (a - (limit - 0.9)) / 0.9));   // darken toward the far edges
      const shade = Math.min(0.97, a1 * 0.44 + a2 * 0.2 + edge * 0.5);
      const vis = Math.max(0, Math.min(1, (limit - a) / 0.22));
      r.shades[r.shades.length - 1].style.opacity = shade.toFixed(3);
      r.shades[0].style.opacity = r.shades[1].style.opacity = (0.35 + shade * 0.6).toFixed(3);
      r.el.style.setProperty('--vis', vis.toFixed(3));
    }
    const c = mod(Math.round(pos), n);
    if (c !== centerShown) { if (centerShown >= 0 && started) sfx.tick(); centerShown = c; }
  }
  let started = false;

  const easeOutBack = t => { const s = 0.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    raf = 0;
    if (tween) {
      const k = (now - tween.t0) / tween.dur;
      if (k >= 1) { pos = tween.to; tween = null; }
      else pos = tween.from + (tween.to - tween.from) * tween.ease(k);
    }
    render();
    if (tween) raf = requestAnimationFrame(frame);
    else if (!dragging) settle();
  }
  function animateTo(t, opts = {}) {
    target = t;
    const dist = Math.abs(t - pos);
    if (reduced || dist < 1e-4) { pos = t; tween = null; render(); settle(); return; }
    tween = { from: pos, to: t, t0: performance.now(), dur: Math.min(720, 400 + 110 * Math.max(0, dist - 1)), ease: opts.flick ? easeOutCubic : easeOutBack };
    markMoving();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const selected = () => mod(Math.round(target), n);
  function markMoving() {
    refs.forEach(r => r.el.classList.remove('is-center'));
    updateCaption(selected());
  }
  function settle() {
    const i = mod(Math.round(target), n);
    pos = target = i; render();
    refs.forEach((r, k) => { r.el.classList.toggle('is-center', k === i); r.el.tabIndex = k === i ? 0 : -1; });
    updateCaption(i);
    store.set(KEY.sel, items[i].slug);
    if (document.activeElement && document.activeElement.classList.contains('cab') && document.activeElement !== cabs[i]) cabs[i].focus({ preventScroll: true });
  }
  let lastCap = -1;
  function updateCaption(i) {
    if (i === lastCap) return; lastCap = i;
    const it = items[i];
    press.textContent = it.soon ? 'A NEW GAME EVERY DAY' : (touchy ? 'TAP TO PLAY' : 'PRESS START');
    press.classList.toggle('soon', it.soon);
    live.textContent = it.soon ? 'Coming soon. A new game every day.' : `${it.title}, game ${i + 1} of ${n - 1}`;
    aura.style.setProperty('--aura', it.soon ? '#3a3846' : it.c.ac);
  }
  function step(dir) {
    started = true;
    let t = Math.round(target) + dir;
    if (Math.abs(t - pos) > n) t = Math.round(pos) + Math.sign(dir) * n;
    sfx.whoosh(dir);
    animateTo(t);
  }
  function goTo(i) {
    started = true;
    const d = Math.round(wrapD(i, target));
    if (!d) return;
    sfx.whoosh(Math.sign(d));
    animateTo(Math.round(target) + d);
  }
  let launching = false;
  function launch(i) {
    const it = items[i];
    if (it.soon) { sfx.buzz(); return; }
    if (launching) return; launching = true;
    store.set(KEY.sel, it.slug);
    sfx.coin();
    cabs[i].classList.add('launching');
    document.getElementById('fade').classList.add('on');
    setTimeout(() => { location.href = it.url; }, reduced ? 60 : 300);
  }
  window.addEventListener('pageshow', e => {
    launching = false;
    document.getElementById('fade').classList.remove('on');
    cabs.forEach(c => c.classList.remove('launching'));
    if (e.persisted) layout();
  });

  // ---------- sound (Web Audio, created on the first user gesture) ----------
  const sfx = (() => {
    let ac = null, master = null, noise = null, muted = store.get(KEY.mute) === '1';
    const ensure = () => {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      try { ac = new C(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noise.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      return ac;
    };
    const ok = () => ac && !muted && ac.state === 'running';
    const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    const pan = (node, v) => { if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = v; node.connect(p); return p; } return node; };
    const api = {
      unlock: ensure,
      get muted() { return muted; },
      setMuted(m) { muted = m; store.set(KEY.mute, m ? '1' : '0'); if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.02); },
      tick() {
        if (!ok()) return; const t = ac.currentTime;
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square';
        o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
        env(g, t, 0.002, 0.09, 0.035); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g2 = ac.createGain(); s.buffer = noise;
        f.type = 'highpass'; f.frequency.value = 3200; env(g2, t, 0.001, 0.12, 0.02);
        s.connect(f); f.connect(g2); g2.connect(master); s.start(t, Math.random() * 0.4, 0.05);
      },
      whoosh(dir) {
        if (!ok()) return; const t = ac.currentTime;
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise;
        f.type = 'bandpass'; f.Q.value = 1.4;
        f.frequency.setValueAtTime(dir > 0 ? 500 : 1700, t); f.frequency.exponentialRampToValueAtTime(dir > 0 ? 1900 : 450, t + 0.32);
        env(g, t, 0.07, 0.16, 0.28);
        s.connect(f); const out = pan(f, 0); out.connect(g); g.connect(master);
        if (out.pan) { out.pan.setValueAtTime(-0.5 * dir, t); out.pan.linearRampToValueAtTime(0.5 * dir, t + 0.35); }
        s.start(t, Math.random() * 0.2, 0.4);
      },
      coin() {
        if (!ok()) return; const t = ac.currentTime;
        [[988, 0, 0.07], [1319, 0.075, 0.45]].forEach(([fq, dt, len]) => {
          const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = fq;
          env(g, t + dt, 0.004, 0.1, len); o.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + len + 0.05);
        });
      },
      buzz() {
        if (!ok()) return; const t = ac.currentTime;
        const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 92;
        f.type = 'lowpass'; f.frequency.value = 700; env(g, t, 0.01, 0.14, 0.2); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
      }
    };
    return api;
  })();
  const unlock = () => { started = true; sfx.unlock(); };
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  const syncMute = () => { muteBtn.setAttribute('aria-pressed', String(sfx.muted)); muteBtn.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on'); };
  syncMute();
  muteBtn.addEventListener('click', e => { e.stopPropagation(); sfx.setMuted(!sfx.muted); syncMute(); });
  muteBtn.addEventListener('pointerdown', e => e.stopPropagation());

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'd' || k === 'a' || k === 'D' || k === 'A') {
      e.preventDefault(); step(k === 'ArrowRight' || k === 'd' || k === 'D' ? 1 : -1);
    } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (e.target === muteBtn) return;
      e.preventDefault(); if (!e.repeat) launch(selected());
    } else if (k === 'Home') { e.preventDefault(); goTo(0); }
    else if (k === 'm' || k === 'M') { sfx.setMuted(!sfx.muted); syncMute(); }
  });

  // ---------- trackpad swipe / mouse wheel ----------
  let wAcc = 0, wLast = 0, wLocked = false, wLockT = 0;
  window.addEventListener('wheel', e => {
    if (e.ctrlKey) return;                                  // pinch-zoom gesture
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
    const horiz = Math.abs(e.deltaX) >= Math.abs(e.deltaY);
    const v = (horiz ? e.deltaX : e.deltaY) * unit;
    const now = performance.now();
    const notch = !horiz && e.deltaX === 0 && Math.abs(v) >= 50 && Number.isInteger(e.deltaY); // classic mouse wheel
    if (now - wLast > 170) { wLocked = false; wAcc = 0; }      // a fresh gesture
    wLast = now;
    if (notch) { if (now - wLockT > 140) { wLockT = now; step(Math.sign(v)); } return; }
    if (wLocked) { if (now - wLockT > 520 && Math.abs(v) > 30) { wLocked = false; wAcc = 0; } else return; }
    wAcc += v;
    if (Math.abs(wAcc) >= 36) { step(Math.sign(wAcc)); wLocked = true; wLockT = now; wAcc = 0; }
  }, { passive: false });

  // ---------- pointer: drag / swipe with momentum, tap to select or play ----------
  let pd = null, moved = false, lastFlick = 0;
  carousel.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pd = { id: e.pointerId, x: e.clientX, y: e.clientY, startPos: pos, hist: [{ x: e.clientX, t: e.timeStamp }], type: e.pointerType };
    moved = false;
  });
  carousel.addEventListener('pointermove', e => {
    if (!pd || e.pointerId !== pd.id) return;
    const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
    if (!dragging) {
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy)) return;
      dragging = moved = true; started = true; tween = null; pd.startPos = pos; pd.x = e.clientX;
      carousel.classList.add('dragging'); markMoving();
      try { carousel.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    pos = pd.startPos - (e.clientX - pd.x) / S1;
    pd.hist.push({ x: e.clientX, t: e.timeStamp }); if (pd.hist.length > 8) pd.hist.shift();
    updateCaption(mod(Math.round(pos), n));
    if (!raf) raf = requestAnimationFrame(frame);
  });
  const endDrag = e => {
    if (!pd || e.pointerId !== pd.id) return;
    const wasDragging = dragging; dragging = false; carousel.classList.remove('dragging');
    if (wasDragging) {
      const last = pd.hist[pd.hist.length - 1];
      const h = pd.hist.filter(s => last.t - s.t < 130);
      let v = 0;
      if (h.length > 1 && e.timeStamp - last.t < 160) { const a = h[0]; v = (last.x - a.x) / Math.max(16, last.t - a.t) * 1000; }
      const itemsPerSec = -v / S1; lastFlick = itemsPerSec;
      let t = Math.round(pos + itemsPerSec * 0.2);
      const s0 = Math.round(pd.startPos), moved0 = pos - pd.startPos;
      if (t === s0 && Math.abs(moved0) > 0.2) t = s0 + Math.sign(moved0);   // a deliberate short swipe still turns one cabinet
      t = Math.max(Math.round(pos) - 4, Math.min(Math.round(pos) + 4, t));
      if (t !== Math.round(pos)) sfx.whoosh(Math.sign(t - pos));
      animateTo(t, { flick: true });
    }
    pd = null;
  };
  carousel.addEventListener('pointerup', endDrag);
  carousel.addEventListener('pointercancel', endDrag);
  carousel.addEventListener('dragstart', e => e.preventDefault());
  carousel.addEventListener('click', e => {
    const cab = e.target.closest('.cab');
    if (moved) { e.preventDefault(); moved = false; return; }
    if (!cab) return;
    const i = +cab.dataset.i;
    if (i !== selected()) { e.preventDefault(); goTo(i); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;  // let the browser open a new tab
    e.preventDefault(); launch(i);
  });

  // ---------- gamepad ----------
  let gpRaf = 0; const gp = { dir: 0, next: 0, a: false, l: false, r: false };
  function pollPad(t) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) { gpRaf = 0; setHint(false); return; }
    let dir = 0, a = false;
    for (const p of pads) {
      const b = p.buttons, ax = p.axes[0] || 0, pr = k => b[k] && b[k].pressed;
      if (pr(14) || pr(4) || ax < -0.55) dir = -1;
      if (pr(15) || pr(5) || ax > 0.55) dir = 1;
      if (pr(0) || pr(9)) a = true;
    }
    if (dir) { if (dir !== gp.dir) { step(dir); gp.next = t + 380; } else if (t >= gp.next) { step(dir); gp.next = t + 170; } }
    gp.dir = dir;
    if (a && !gp.a) launch(selected());
    gp.a = a;
    gpRaf = requestAnimationFrame(pollPad);
  }
  window.addEventListener('gamepadconnected', () => { setHint(true); if (!gpRaf) gpRaf = requestAnimationFrame(pollPad); });

  // ---------- go ----------
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(layout); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTitles());
  layout();
  settle();
  window.ARCADE = { get index() { return selected(); }, get pos() { return pos; }, get flick() { return lastFlick; }, items: items.map(i => ({ slug: i.slug, title: i.title, url: i.url, soon: i.soon })) };
})();
