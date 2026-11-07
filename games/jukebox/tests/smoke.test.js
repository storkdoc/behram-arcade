/* JUKEBOX browser smoke: desktop, iPhone portrait, landscape, gamepad, reduced motion,
   queue persistence, unavailable videos, and the real YouTube player lifecycle
   (first Play vs a later song vs a full reload).
   Game flow uses ?yt=mock. The real-YouTube section needs a network; YouTube often
   refuses the default HeadlessChrome user agent, so that section uses a desktop UA.
   Run from the repo root:  python3 -m http.server 18971 &
     NODE_PATH=... node games/jukebox/tests/smoke.test.js   (env: BASE, CHROME, NO_REAL_YT=1) */
const { chromium, devices } = require('playwright-core');
const ROOT = process.env.BASE || 'http://localhost:18971/';
const BASE = ROOT + 'games/jukebox/index.html';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const THIRD = /youtube\.com|youtu\.be|ggpht|ytimg|googlevideo|doubleclick|googlesyndication|googleads|google\.com|gstatic|googleapis|textdb|ntfy/;
let fails = 0, warns = 0;
const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const warn = (msg, extra) => { warns++; console.log('  WARN', msg, extra === undefined ? '' : JSON.stringify(extra)); };

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const open = async (opts, q = '') => {
    const c = await b.newContext(opts);
    const p = await c.newPage();
    p.errs = [];
    p.ads = [];
    p.on('console', m => {
      const where = ((m.location() || {}).url || '');
      if (m.type() === 'error' && !THIRD.test(m.text() + ' ' + where) && !/Failed to load resource/.test(m.text())) p.errs.push(m.text());
    });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('requestfailed', r => { if (!THIRD.test(r.url())) p.errs.push('REQFAIL ' + r.url()); });
    p.on('response', r => { if (r.status() >= 400 && !THIRD.test(r.url())) p.errs.push(r.status() + ' ' + r.url()); });
    p.on('request', r => {
      if (/doubleclick|googlesyndication|googleads|\/pagead\/|\/ptracking/.test(r.url())) {
        try { const u = new URL(r.url()); p.ads.push(u.host + u.pathname.slice(0, 40)); } catch (e) { /* ignore */ }
      }
    });
    await p.goto(BASE + q);
    await p.waitForTimeout(250);
    return p;
  };
  const snap = p => p.evaluate(() => ({
    mode: JUKE.S.mode,
    screen: document.body.dataset.screen,
    queue: JUKE.Q.queue.slice(),
    index: JUKE.Q.index,
    repeat: JUKE.Q.repeat,
    shuffle: JUKE.Q.shuffle,
    fav: JUKE.favorites(),
    constructs: JUKE.player.stats.constructs,
    loads: JUKE.player.stats.loads.slice(),
    replays: JUKE.player.stats.replays,
    hosts: JUKE.player.stats.hosts.slice(),
    destroys: JUKE.player.stats.destroys,
    status: document.getElementById('status').textContent,
    idleHidden: document.getElementById('ytIdle').hidden,
    iframes: document.querySelectorAll('iframe').length
  }));
  const overflow = p => p.evaluate(() => {
    if (document.documentElement.scrollWidth > innerWidth + 1) return true;
    return [...document.body.querySelectorAll('button, a, p, h1, h2, li, .np-title, .fine')].some(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      return r.left < -1 || r.right > innerWidth + 1;
    });
  });
  const clearOfCover = p => p.evaluate(() => {
    const well = document.getElementById('ytWell');
    const idle = document.getElementById('ytIdle');
    well.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = well.getBoundingClientRect();
    const samples = [[0.5, 0.5], [0.28, 0.35], [0.72, 0.4], [0.5, 0.72]];
    const hits = samples.map(([px, py]) => {
      const x = r.left + r.width * px, y = r.top + r.height * py;
      const top = document.elementFromPoint(x, y);
      const ok = !!(top && well.contains(top) && !(top.closest && top.closest('#ytIdle')));
      return ok;
    });
    let hidden = false;
    for (let n = well; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) hidden = true;
    }
    const frame = well.querySelector('iframe, .mock-player');
    const fs = frame ? getComputedStyle(frame) : null;
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      hits, hidden,
      idleHidden: idle.hidden || getComputedStyle(idle).display === 'none',
      frameDisplay: fs && fs.display,
      frameOpacity: fs && fs.opacity,
      frameVis: fs && fs.visibility
    };
  });

  console.log('== DESKTOP 1280x800, keyboard (test player)');
  const D = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock');
  await D.evaluate(() => localStorage.clear());
  await D.reload();
  await D.waitForTimeout(200);
  let s = await snap(D);
  check(s.mode === 'idle' && s.constructs === 0 && s.iframes === 0 && s.loads.length === 0, 'page load does not create a player or start music', s);
  check(/YouTube chooses whether an ad plays/.test(await D.textContent('#premiumNote')), 'premium note is on the cabinet');
  check(/7437519/.test(await D.locator('#premiumNote a').getAttribute('href')), 'note links to YouTube\'s Premium article');
  check(!/ad-free|ad free|skip the ad|block ads/i.test(await D.textContent('body')), 'no ad-free or ad-blocking promise');
  const links = await D.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')));
  check(links.every(h => !/youtube\.com\/watch|youtu\.be/i.test(h || '')), 'no Watch-on-YouTube links', links);
  check(!(await overflow(D)), 'desktop: no horizontal overflow');
  check(await D.evaluate(() => document.querySelectorAll('.song').length) >= 60, 'song strips are listed');

  await D.evaluate(() => {
    localStorage.setItem('jukebox.prefs', JSON.stringify({
      queue: ['abc', 'rocket-man'], index: 0, shuffle: false, repeat: 'off',
      favorites: ['abc'], volume: 40, muted: false, decade: '70s', playing: true, host: 'https://www.youtube-nocookie.com'
    }));
  });
  await D.reload();
  await D.waitForTimeout(200);
  s = await snap(D);
  check(s.queue.join() === 'abc,rocket-man' && s.index === 0 && s.fav.join() === 'abc' && s.mode === 'idle' && s.constructs === 0,
    'saved queue and favorites return, but a stored "playing" flag does not autoplay or switch host', s);
  check(await D.evaluate(() => document.querySelector('[data-tab="70s"]').getAttribute('aria-selected')) === 'true', 'saved decade tab is selected');
  check(await D.inputValue('#vol') === '40', 'saved volume is restored');

  await D.evaluate(() => localStorage.clear());
  await D.reload();
  await D.waitForTimeout(200);
  await D.keyboard.press('Enter');
  s = await snap(D);
  check(s.queue.length === 1 && s.mode === 'idle' && s.constructs === 0, 'Enter adds the highlighted song and does not play it', s);
  await D.keyboard.press('Space');
  await D.waitForTimeout(80);
  s = await snap(D);
  check(s.mode === 'playing' && s.constructs === 1 && s.loads.length === 1 && s.idleHidden, 'Space plays on the one player and hides the idle caption', s);
  const viz = await D.evaluate(() => {
    const panel = document.getElementById('vizPanel').getBoundingClientRect();
    const well = document.getElementById('ytWell').getBoundingClientRect();
    const overlap = !(panel.bottom <= well.top + 1 || panel.top >= well.bottom - 1 || panel.right <= well.left + 1 || panel.left >= well.right - 1);
    const spin = getComputedStyle(document.getElementById('vinyl'));
    const inside = document.getElementById('vizPanel').querySelector('#ytWell, iframe');
    return {
      overlap, inside: !!inside, note: document.getElementById('vizNote').textContent,
      mode: document.body.dataset.mode, decade: document.body.dataset.decade,
      anim: spin.animationName, play: spin.animationPlayState,
      wellH: Math.round(well.height), panelH: Math.round(panel.height)
    };
  });
  check(!viz.overlap && !viz.inside && viz.wellH >= 160 && viz.panelH >= 120, 'visualizer sits beside the player and does not cover it', viz);
  check(/not the song/.test(viz.note) && viz.mode === 'playing' && viz.anim === 'spin-record' && viz.play === 'running' && viz.decade === '70s', 'playing spins the record for the song decade; copy does not claim a waveform', viz);
  await D.click('[data-viz="spectrum"]');
  const bars = await D.evaluate(() => {
    const look = document.getElementById('vizPanel').dataset.look;
    const platter = getComputedStyle(document.querySelector('.platter')).display;
    const well = document.getElementById('ytWell').getBoundingClientRect();
    return { look, platter, wellH: Math.round(well.height), mode: JUKE.S.mode };
  });
  check(bars.look === 'spectrum' && bars.platter === 'none' && bars.wellH >= 160 && bars.mode === 'playing', 'BARS changes only the light show; the player stays up', bars);
  await D.click('[data-viz="vinyl"]');
  check(await D.evaluate(() => getComputedStyle(document.getElementById('vizCanvas')).display === 'none' && document.getElementById('ytWell').getBoundingClientRect().height >= 160), 'VINYL hides the bars, not the YouTube well');
  await D.click('[data-viz="cabinet"]');
  const box = await clearOfCover(D);
  check(box.w >= 280 && box.h >= 160 && box.hits.every(Boolean) && box.idleHidden && !box.hidden && box.frameDisplay !== 'none' && Number(box.frameOpacity) > 0.9,
    'player is large, visible, and not covered', box);
  await D.keyboard.press('Space');
  s = await snap(D);
  check(s.mode === 'paused' && s.constructs === 1, 'Space pauses without building another player', s);
  await D.keyboard.press('Space');
  await D.waitForTimeout(40);
  s = await snap(D);
  check(s.mode === 'playing' && s.constructs === 1 && s.loads.length === 1, 'Space resumes the same player', s);

  await D.click('.song >> nth=1');
  await D.click('#btnNext');
  await D.waitForTimeout(80);
  s = await snap(D);
  check(s.constructs === 1 && s.loads.length === 2 && s.loads[0] !== s.loads[1] && s.destroys === 0 && s.hosts.every(h => h === 'https://www.youtube.com'),
    'next song reuses www.youtube.com player', s);
  const beforeMove = s.queue.slice();
  await D.locator('#queue [data-act="up"]').nth(1).click();
  s = await snap(D);
  check(s.queue[0] === beforeMove[1] && s.queue[1] === beforeMove[0], 'move up reorders the queue', { before: beforeMove, after: s.queue });
  await D.click('#btnShuffle');
  check((await snap(D)).shuffle === true, 'shuffle toggles on');
  await D.click('#btnRepeat');
  check((await snap(D)).repeat === 'all', 'repeat cycles to all');
  await D.click('#btnRepeat');
  check((await snap(D)).repeat === 'one', 'repeat cycles to one');
  await D.evaluate(() => JUKE.player.finish());
  await D.waitForTimeout(40);
  s = await snap(D);
  check(s.replays === 1 && s.constructs === 1 && s.loads.length === 2, 'repeat one replays by seeking, same player', s);

  await D.click('.heart >> nth=0');
  check((await snap(D)).fav.length === 1, 'heart saves a favorite');
  await D.reload();
  await D.waitForTimeout(200);
  s = await snap(D);
  check(s.mode === 'idle' && s.constructs === 0 && s.iframes === 0 && s.queue.length === 2 && s.fav.length === 1,
    'reload restores queue and favorites and does not recreate the player until Play', s);
  check(await D.evaluate(() => JUKE.player.report().configuredHost) === 'https://www.youtube.com', 'reloaded page is still configured for www.youtube.com');

  console.log('== second Play retries when YouTube has not started');
  const N = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&ytnoauto=1');
  await N.click('.song');
  await N.click('#btnPlay');
  await N.waitForTimeout(60);
  let stuck = await N.evaluate(() => ({ mode: JUKE.S.mode, state: JUKE.player.state(), hold: JUKE.player.hold, loads: JUKE.player.stats.loads.length }));
  check(stuck.mode === 'loading' && stuck.state === -1 && stuck.hold === false && stuck.loads === 1, 'first Play loads the video and leaves it unstarted', stuck);
  await N.click('#btnPlay');
  await N.waitForTimeout(40);
  stuck = await N.evaluate(() => ({ mode: JUKE.S.mode, state: JUKE.player.state(), hold: JUKE.player.hold, constructs: JUKE.player.stats.constructs }));
  check(stuck.mode === 'playing' && stuck.state === 1 && stuck.hold === false && stuck.constructs === 1, 'second Play starts the song instead of pausing', stuck);

  console.log('== unavailable video (test player)');
  const U = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock');
  const ids = await U.evaluate(() => [0, 1].map(i => document.querySelectorAll('.song')[i].dataset.id));
  const yts = await U.evaluate(ids => ids.map(id => JukeCatalog.byId(id).yt), ids);
  await U.goto(BASE + '?yt=mock&ytfail=' + encodeURIComponent(yts[0]));
  await U.waitForTimeout(200);
  await U.click('.song >> nth=0');
  await U.click('.song >> nth=1');
  await U.click('#btnPlay');
  await U.waitForTimeout(200);
  s = await snap(U);
  check(s.loads[0] === yts[0] && s.loads[1] === yts[1] && s.mode === 'playing' && /won't play here/.test(s.status) && s.constructs === 1,
    'an embed error is announced and the next song plays on the same player', s);
  check(U.errs.length === 0, 'desktop: no console errors', U.errs);

  console.log('== iPhone 13 portrait');
  const M = await open({ ...devices['iPhone 13'] }, '?yt=mock');
  check(!(await overflow(M)), 'phone: no horizontal overflow');
  const target = await M.evaluate(() => {
    const song = document.querySelector('.song').getBoundingClientRect();
    const heart = document.querySelector('.heart').getBoundingClientRect();
    return { sh: song.height, sw: song.width, hh: heart.height, hw: heart.width };
  });
  check(target.sh >= 44 && target.hh >= 44 && target.hw >= 44, 'phone: song and heart targets are at least 44px', target);
  await M.tap('.song');
  await M.tap('#btnPlay');
  await M.waitForTimeout(80);
  s = await snap(M);
  const mb = await clearOfCover(M);
  check(s.mode === 'playing' && mb.h >= 140 && mb.w >= 200 && mb.hits.every(Boolean) && mb.idleHidden && !mb.hidden, 'phone: tap plays a visible uncovered player', { s, mb });
  check(await M.evaluate(() => { const a = document.getElementById('vizPanel').getBoundingClientRect(), b = document.getElementById('ytWell').getBoundingClientRect(); return a.bottom <= b.top + 1; }), 'phone: visualizer is above the player, not on top of it');
  check(!(await overflow(M)), 'phone playing: no horizontal overflow');
  await M.tap('#btnHelp');
  check(await M.locator('#help').isVisible() && /SPACE/.test(await M.textContent('#help')), 'help opens');
  check(/Premium/.test(await M.textContent('#helpPremium')), 'help includes the premium note');
  await M.tap('#btnCloseHelp');
  check(await M.locator('#help').isHidden(), 'help closes');
  const afterHelp = await clearOfCover(M);
  check(afterHelp.hits.every(Boolean) && afterHelp.idleHidden, 'closing help leaves the player uncovered', afterHelp);
  check(M.errs.length === 0, 'phone: no console errors', M.errs);

  console.log('== iPhone landscape');
  const L = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent }, '?yt=mock');
  check(!(await overflow(L)), 'landscape: no horizontal overflow');
  await L.tap('.song');
  await L.tap('#btnPlay');
  await L.waitForTimeout(80);
  const lb = await clearOfCover(L);
  check((await snap(L)).mode === 'playing' && lb.h >= 100 && lb.hits.every(Boolean), 'landscape play stays inside a visible player', lb);

  console.log('== gamepad + reduced motion');
  const G = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?yt=mock');
  check(await G.evaluate(() => getComputedStyle(document.querySelector('.logo')).animationName === 'none' && getComputedStyle(document.getElementById('vinyl')).animationName === 'none'), 'reduced motion turns the neon flicker and the record spin off');
  await G.evaluate(() => {
    const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    window.__pad = { id: 'test', connected: true, buttons: btns, axes: [0, 0, 0, 0], mapping: 'standard' };
    navigator.getGamepads = () => [window.__pad];
  });
  const press = async i => {
    await G.evaluate(i => { __pad.buttons[i].pressed = true; __pad.buttons[i].value = 1; }, i);
    await G.waitForTimeout(90);
    await G.evaluate(i => { __pad.buttons[i].pressed = false; __pad.buttons[i].value = 0; }, i);
    await G.waitForTimeout(90);
  };
  await press(2);
  check((await snap(G)).queue.length === 1, 'gamepad X adds the highlighted song');
  await press(0);
  await G.waitForTimeout(40);
  check((await snap(G)).mode === 'playing', 'gamepad A plays');
  await press(9);
  check(await G.locator('#pause').isVisible() && (await snap(G)).mode === 'paused', 'gamepad Start opens the pause menu and pauses');
  await press(1);
  await G.waitForTimeout(40);
  check(await G.locator('#pause').isHidden() && (await snap(G)).mode === 'playing', 'gamepad B closes the menu and resumes');
  await press(15);
  check(G.errs.length === 0, 'gamepad: no console errors', G.errs);

  if (!process.env.NO_REAL_YT) {
    console.log('== REAL YouTube player, first load vs reload');
    const R = await open({ viewport: { width: 1280, height: 800 }, userAgent: UA });
    const playability = [];
    R.on('response', r => {
      if (!r.url().includes('/youtubei/v1/player')) return;
      r.text().then(t => {
        playability.push({
          status: (t.match(/"playabilityStatus":\{"status":"([A-Z_]+)"/) || [])[1] || '',
          reason: (t.match(/"reason":"((?:\\.|[^"\\]){0,160})"/) || [])[1] || ''
        });
      }).catch(() => {});
    });
    const before = await R.evaluate(() => ({ iframes: document.querySelectorAll('iframe').length, loads: JUKE.player.stats.loads.slice(), mode: JUKE.S.mode }));
    check(before.mode === 'idle' && before.loads.length === 0, 'no video plays on load', before);
    await R.click('#btnPlay');
    let frame = false;
    try { await R.waitForSelector('#ytWell iframe', { timeout: 20000 }); frame = true; } catch (e) { frame = false; }
    if (!frame) {
      warn('TEST ENVIRONMENT: YouTube iframe did not appear; first-vs-reload ad behavior was not observed', await R.evaluate(() => JUKE.player.status));
    } else {
      await R.waitForTimeout(1500);
      const first = await R.evaluate(() => {
        window.__frame = document.querySelector('#ytWell iframe');
        const rep = JUKE.player.report();
        const r = window.__frame.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { rep, covered: !(top && (top === window.__frame || window.__frame.contains(top))), w: r.width, h: r.height, ads: null };
      });
      check(first.rep.configuredHost === 'https://www.youtube.com' && /^www\.youtube\.com/.test(first.rep.src || ''), 'first Play embed host is www.youtube.com', first.rep.src);
      check(!/nocookie/.test(first.rep.src || '') && first.rep.sandbox == null && first.rep.credentialless !== true, 'first Play is not nocookie, sandboxed, or credentialless', { sandbox: first.rep.sandbox, credentialless: first.rep.credentialless, query: first.rep.query });
      check(first.rep.constructs === 1 && first.w >= 280 && first.h >= 160 && !first.covered, 'first Play is one visible uncovered player', { constructs: first.rep.constructs, w: first.w, h: first.h, covered: first.covered });
      let heard = false; let lastPlay = null;
      for (let i = 0; i < 6 && !heard; i++) {
        lastPlay = await R.evaluate(() => ({ state: JUKE.player.state(), time: JUKE.player.time(), mode: JUKE.S.mode, status: document.getElementById('status').textContent, loads: JUKE.player.stats.loads.slice() }));
        if (lastPlay.state === 1 && lastPlay.time > 0.4) heard = true;
        else if (lastPlay.mode === 'error') break;
        else await R.waitForTimeout(1000);
      }
      if (heard) check(true, 'real player reached playing with the clock moving', lastPlay);
      else warn('YouTube did not start playback in this environment', { lastPlay, playability });
      const adsFirst = R.ads.slice();
      await R.click('.song >> nth=1');
      await R.evaluate(() => { window.__frame = document.querySelector('#ytWell iframe'); });
      await R.click('#btnNext');
      await R.waitForTimeout(2000);
      const second = await R.evaluate(() => {
        const frame = document.querySelector('#ytWell iframe');
        return { same: frame === window.__frame, rep: JUKE.player.report(), n: document.querySelectorAll('iframe').length };
      });
      check(second.rep.constructs === 1 && second.n === 1 && second.same, 'second song keeps the same iframe', { constructs: second.rep.constructs, n: second.n, same: second.same, src: second.rep.src });
      check(second.rep.configuredHost === 'https://www.youtube.com' && !/nocookie/.test(second.rep.src || ''), 'second song stays on www.youtube.com', second.rep.src);

      await R.reload({ waitUntil: 'load' });
      await R.waitForTimeout(400);
      const idle = await R.evaluate(() => ({ loads: JUKE.player.stats.loads.slice(), mode: JUKE.S.mode, constructs: JUKE.player.stats.constructs }));
      check(idle.mode === 'idle' && idle.loads.length === 0, 'reload does not start a video', idle);
      const adsBeforeReplay = R.ads.length;
      await R.click('#btnPlay');
      let again = false;
      try { await R.waitForSelector('#ytWell iframe', { timeout: 20000 }); again = true; } catch (e) { again = false; }
      if (!again) warn('reload Play did not create an iframe');
      else {
        await R.waitForTimeout(1500);
        const third = await R.evaluate(() => JUKE.player.report());
        const sameConfig = third.configuredHost === first.rep.configuredHost
          && third.sandbox == first.rep.sandbox
          && third.credentialless === first.rep.credentialless
          && JSON.stringify(Object.keys(third.query || {}).sort()) === JSON.stringify(Object.keys(first.rep.query || {}).sort());
        check(third.constructs === 1 && /^www\.youtube\.com/.test(third.src || '') && !/nocookie/.test(third.src || ''), 'reload Play uses the same www.youtube.com host', third.src);
        check(sameConfig, 'reload does not change embed host, sandbox, credentialless, or player query keys', { first: first.rep.query, reload: third.query, sandbox: [first.rep.sandbox, third.sandbox] });
        const box = await clearOfCover(R);
        check(box.hits.every(Boolean) && box.idleHidden && !box.hidden && box.h >= 160, 'reloaded player is visible and uncovered', box);
        console.log('  AD-PROBE first-play requests', [...new Set(adsFirst)]);
        console.log('  AD-PROBE after-reload requests', [...new Set(R.ads.slice(adsBeforeReplay))]);
        console.log('  AD-PROBE query first', JSON.stringify(first.rep.query), 'reload', JSON.stringify(third.query));
        console.log('  AD-PROBE referrer', first.rep.referrerPolicy, third.referrerPolicy, 'allow', first.rep.allow);
        console.log('  PLAYABILITY', JSON.stringify(playability));
      }
    }
    check(R.errs.length === 0, 'real player: no console errors from the cabinet', R.errs);
  }

  await b.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED' + (warns ? ' (' + warns + ' environment warnings)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
