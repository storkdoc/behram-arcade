(() => {
  const games = (window.ARCADE_GAMES || []).slice().sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  const grid = document.getElementById('grid');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = new Date(); const daysAgo = d => (today - new Date(d + 'T00:00:00')) / 864e5;
  grid.innerHTML = games.map(g => `
    <a class="card" href="games/${esc(g.slug)}/index.html" style="--accent:${esc(g.accent || '#ff47e6')}" data-slug="${esc(g.slug)}">
      ${g.added && daysAgo(g.added) < 2 ? '<span class="badge">NEW</span>' : ''}
      <div class="screen"><img src="${esc(g.thumb || 'games/' + g.slug + '/thumb.png')}" alt="${esc(g.title)} screenshot" loading="lazy"></div>
      <div class="meta">
        <div class="title-row"><span class="title">${esc(g.title)}</span><span class="genre">${esc(g.genre || '')}${g.year ? ' · ' + esc(g.year) : ''}</span></div>
        <p class="desc">${esc(g.description)}</p>
        ${g.controls ? `<div class="controls">${esc(g.controls)}</div>` : ''}
        <span class="play">PLAY &#9654;</span>
      </div>
    </a>`).join('') + `
    <div class="card soon" aria-hidden="true">
      <div class="screen"><div class="q">?</div><div>NEXT GAME LOADING</div></div>
      <div class="meta"><div class="title-row"><span class="title" style="--accent:#36e6ff">COMING SOON</span><span class="genre">DAY ${games.length + 1}</span></div>
      <p class="desc">A new cabinet is added to the arcade every day. Check back tomorrow.</p></div>
    </div>`;
  document.getElementById('count').textContent = `${games.length} GAME${games.length === 1 ? '' : 'S'} IN THE ARCADE`;
  document.getElementById('ticker').textContent =
    ['WELCOME TO THE BEHRAM ARCADE', ...games.map(g => `NOW PLAYING: ${g.title} — ${g.tagline || g.genre || ''}`), 'HIGH SCORES SAVED ON THIS DEVICE', 'NEW GAME EVERY DAY'].join('   ★   ');
  // keyboard selection
  const cards = [...grid.querySelectorAll('a.card')];
  let sel = -1;
  const setSel = i => { cards.forEach(c => c.classList.remove('sel')); sel = (i + cards.length) % cards.length; cards[sel].classList.add('sel'); cards[sel].focus({ preventScroll: false }); };
  const cols = () => { if (cards.length < 2) return 1; const t = cards[0].offsetTop; return Math.max(1, cards.filter(c => c.offsetTop === t).length); };
  addEventListener('keydown', e => {
    if (!cards.length) return;
    const k = e.key;
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      if (sel < 0) return setSel(0);
      const c = cols();
      setSel(sel + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? c : -c));
    } else if ((k === 'Enter' || k === ' ') && sel >= 0) { e.preventDefault(); location.href = cards[sel].href; }
  });
  cards.forEach((c, i) => c.addEventListener('mouseenter', () => { cards.forEach(x => x.classList.remove('sel')); sel = i; }));
})();
