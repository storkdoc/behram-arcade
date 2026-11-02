// Music recovery test (headless Chrome): the recorded score must keep playing, or come back by itself / via M, ♪ or N,
// after OS interruptions, stalls, stream errors, stuck gains, finished playlists and a broken media path.
// Usage: node games/heliopause/tests/music.test.js [baseUrl]   (serve the repo root; the server must support Range)
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/workspace/tools/node_modules/playwright-core')); }
const BASE = process.argv[2] || 'http://localhost:8091/games/heliopause/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let fail = 0;
  const S = () => page.evaluate(() => { const A = HP.AU, c = A.cur; return { ctx: A.ctx.state, mode: A.mode, recOK: A.recOK, cur: c && c.id, paused: c ? c.el.paused : null, t: c ? c.el.currentTime : 0, g: c ? c.g.gain.value : 0, duck: A.duckG.gain.value, bus: A.recBus.gain.value, muted: A.musicMuted, log: A.log.slice(-4) }; });
  // "playing" = context running, a deck audible and its currentTime advancing
  const playing = async (ms = 1200) => { const a = await S(); await sleep(ms); const b = await S(); return b.ctx === 'running' && b.cur && !b.paused && b.t > a.t + 0.3 && b.g > 0.8 && b.duck > 0.9 && b.bus > 0.3 ? b : null; };
  const until = async (name, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await playing(); if (p) { console.log('ok  ', name.padEnd(46), ((Date.now() - t0) / 1000).toFixed(1) + 's', p.cur); return p; } } const s = await S(); console.log('FAIL', name, JSON.stringify(s)); fail++; return null; };
  await page.goto(BASE); await sleep(400); await page.click('#beginBtn'); await sleep(800);
  await page.evaluate(() => { HP.AU.setVol('sfx', 0); HP.startGame(0, 'commander'); });
  await until('build music starts', 8000);
  // 1. OS interruption (call / lock screen): context suspended + element paused behind our back
  await page.evaluate(() => { HP.AU.ctx.suspend(); HP.AU.cur.el.pause(); }); await sleep(300);
  await until('recovers from an OS interruption', 6000);
  // 2. the browser refuses resume() without a gesture (iOS): a tap brings it back, and the player is told
  await page.evaluate(() => { const c = HP.AU.ctx; window._res = c.resume.bind(c); c.resume = () => Promise.reject(new Error('needs gesture')); window._toast = 0; const o = HP.AU.onBlocked; HP.AU.onBlocked = () => { window._toast++; o(); }; c.suspend(); });
  await sleep(5500); const blk = await page.evaluate(() => ({ st: HP.AU.ctx.state, toast: window._toast }));
  if (blk.st === 'running' || !blk.toast) { console.log('FAIL blocked-context hint', JSON.stringify(blk)); fail++; } else console.log('ok   blocked context -> "tap to resume" hint shown');
  await page.evaluate(() => { HP.AU.ctx.resume = window._res; }); await page.mouse.click(640, 790);
  await until('a tap resumes the blocked context', 4000);
  // 3. crossfade / deck gain stuck at 0, duck never released, music bus at 0
  await page.evaluate(() => { const A = HP.AU, t = A.ctx.currentTime; A.cur.g.gain.cancelScheduledValues(t); A.cur.g.gain.setValueAtTime(0, t); A.cur.started -= 10000; A.duckG.gain.cancelScheduledValues(t); A.duckG.gain.setValueAtTime(0, t); A.duckAt = 0; A.recBus.gain.cancelScheduledValues(t); A.recBus.gain.setValueAtTime(0, t); A.volAt = 0; });
  await until('repairs stuck crossfade / duck / bus gains', 6000);
  // 4. heavy explosions duck and release; output never clips
  await page.evaluate(() => { HP.AU.setVol('sfx', 1); HP.AU.peak(); for (let i = 0; i < 40; i++) setTimeout(() => HP.AU.sfxEvent({ k: i % 2 ? 'super' : 'kill', type: Object.keys(HP.R ? window.HPD.ALIENS : {})[0], boss: true }), i * 45); });
  let pk = 0; for (let i = 0; i < 12; i++) { await sleep(250); pk = Math.max(pk, (await page.evaluate(() => HP.AU.peak().post))); }
  await page.evaluate(() => HP.AU.setVol('sfx', 0));
  if (pk >= 1) { console.log('FAIL clipping', pk); fail++; } else console.log('ok   40 big explosions: peak', pk.toFixed(3), '< 1.0');
  await until('music back to full level after the ducks', 6000);
  // 5. playlists loop: run off the end of several pieces in a row
  let ids = []; for (let i = 0; i < 4; i++) { await page.evaluate(() => { const e = HP.AU.cur.el; e.currentTime = e.duration - 1; }); await sleep(2500); const p = await until('next piece after end #' + (i + 1), 6000); ids.push(p && p.cur); }
  // 6. boss -> wave -> build switching mid-crossfade
  for (const m of ['wave', 'boss', 'build', 'boss', 'wave', 'boss']) { await page.evaluate(m => HP.AU.setMode(m, 0.6), m); await sleep(400); }
  await until('rapid mode switches settle on boss music', 6000);
  await page.evaluate(() => HP.AU.setMode('build')); await until('back to build after the boss', 6000);
  // 7. victory piece ends -> the menu playlist continues (no silence)
  await page.evaluate(() => HP.AU.setMode('victory')); await sleep(3000);
  await page.evaluate(() => { const e = HP.AU.cur.el; e.currentTime = e.duration - 1; }); await sleep(2500);
  await until('after the victory piece, music continues', 6000);
  await page.evaluate(() => HP.startGame(0, 'commander')); await until('new game music', 8000);
  // 8. state lost (nothing current) -> watchdog restarts the playlist
  await page.evaluate(() => { const A = HP.AU; A.decks.forEach(d => d.el.pause()); A.cur = null; });
  await until('watchdog restarts a lost playlist', 6000);
  // 9. paused element the watchdog may not touch (blocked autoplay): M off/on restarts it, N skips to a new piece
  await page.evaluate(() => { HP.AU.blocked = true; HP.AU.cur.el.pause(); });
  await page.keyboard.press('m'); await sleep(400); await page.keyboard.press('m');
  await until('M off / on restarts stopped music', 5000);
  if (await page.evaluate(() => HP.AU.musicMuted)) { console.log('FAIL music left muted'); fail++; }
  await page.evaluate(() => { HP.AU.blocked = true; HP.AU.cur.el.pause(); }); await sleep(2000); await page.evaluate(() => { HP.AU.blocked = true; });
  await page.click('#bMus'); await sleep(400); await page.evaluate(() => { HP.AU.blocked = true; }); await page.click('#bMus');
  await until('♪ off / on restarts stopped music', 5000);
  if (await page.evaluate(() => HP.AU.musicMuted)) { console.log('FAIL ♪ left music muted'); fail++; }
  const before = (await S()).cur; await page.keyboard.press('n'); const pn = await until('N plays the next piece', 6000);
  if (pn && pn.cur === before) { console.log('FAIL N did not change piece', before); fail++; }
  // 10. pause menu + settings carry a restart button
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await sleep(300);
  const hasBtn = await page.evaluate(() => [...document.querySelectorAll('#plist button')].some(b => /NEXT MUSIC PIECE/.test(b.textContent)));
  if (!hasBtn) { console.log('FAIL pause menu restart button'); fail++; } else console.log('ok   pause menu has NEXT MUSIC PIECE');
  await page.evaluate(() => [...document.querySelectorAll('#plist button')].find(b => /NEXT MUSIC PIECE/.test(b.textContent)).click());
  await until('pause-menu button keeps music playing', 6000);
  await page.evaluate(() => [...document.querySelectorAll('#plist button')].find(b => /RESUME/.test(b.textContent)).click());
  // 11. a stream that stalls (server never answers): reload, then skip to another piece
  await page.route('**/music/*.mp3', r => { if (/clairdelune/.test(r.request().url())) return; /* hang */ r.continue(); });
  await page.evaluate(() => { const A = HP.AU; A.listIdx.build = 0; A.restartMusic(true); });
  await until('stalled stream -> reload -> another piece', 45000);
  await page.unroute('**/music/*.mp3');
  // 12. a network error mid-stream: retried, piece continues
  await page.evaluate(() => { const d = HP.AU.cur; window._at = d.el.currentTime; d.el.dispatchEvent(new Event('error')); });
  await until('stream error -> retried', 8000);
  // 13. Safari: the media-element source goes silent while the element "plays" -> fresh element
  await page.evaluate(() => { const d = HP.AU.cur; d.src.disconnect(); });
  await sleep(3000); const sil = await S(); await sleep(9000);
  const fixed = await page.evaluate(() => { const d = HP.AU.cur, b = new Float32Array(1024); d.an.getFloatTimeDomainData(b); return { pk: Math.max(...b.map(Math.abs)), log: HP.AU.log.slice(-3) }; });
  if (fixed.pk < 1e-4 || !fixed.log.some(l => /silent source|reload/.test(l))) { console.log('FAIL silent media source', JSON.stringify(fixed)); fail++; } else console.log('ok   silent media source rebuilt', fixed.log.join(' | '));
  // 14. all recordings unavailable -> synthesized score (music bus alive)
  await page.route('**/music/*.mp3', r => r.abort());
  await page.evaluate(() => HP.AU.restartMusic(true)); await sleep(12000);
  const syn = await page.evaluate(() => ({ cur: HP.AU.cur && HP.AU.cur.id, mus: HP.AU.music.gain.value, log: HP.AU.log.slice(-2) }));
  if (syn.cur || syn.mus < 0.2) { console.log('FAIL synth fallback', JSON.stringify(syn)); fail++; } else console.log('ok   recordings blocked -> synthesized score', syn.log.join(' | '));
  await page.unroute('**/music/*.mp3');
  await page.keyboard.press('n'); await until('N brings the recordings back once reachable', 10000);
  if (errs.length) { console.log('page errors', errs); fail++; }
  await browser.close();
  console.log(fail ? 'MUSIC FAIL ' + fail : 'MUSIC OK'); process.exit(fail ? 1 : 0);
})();
