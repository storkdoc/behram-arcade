/* JUKEBOX logic tests: catalog years, queue, and one-player lifecycle.
   Run from the repo root:  node games/jukebox/tests/logic.test.js */
const path = require('path');
const fs = require('fs');
const NTG = require(path.join(__dirname, '..', '..', 'name-that-groove', 'js', 'catalog.js'));
const C = require(path.join(__dirname, '..', 'js', 'catalog.js'));
const Queue = require(path.join(__dirname, '..', 'js', 'queue.js'));
const Player = require(path.join(__dirname, '..', 'js', 'player.js'));

let fails = 0;
const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('== catalog (official originals, by decade)');
check(C.SONGS.length === NTG.SONGS.length && C.SONGS.length >= 60, 'every Name That Groove song is on the jukebox', C.SONGS.length);
for (const d of C.DECADES) {
  const songs = C.songsFor(d);
  const lo = +('19' + d.slice(0, 2));
  check(songs.length >= 20 && songs.every(s => s.year >= lo && s.year <= lo + 9 && s.decade === d),
    d + ': ' + songs.length + ' songs, years ' + lo + '-' + (lo + 9), songs.length);
}
check(new Set(C.SONGS.map(s => s.id)).size === C.SONGS.length, 'song ids are unique');
check(new Set(C.SONGS.map(s => s.yt)).size === C.SONGS.length, 'video ids are unique');
let facts = true, originals = true;
C.SONGS.forEach(s => {
  const n = NTG.byId(s.id);
  if (!n || n.yt !== s.yt || n.title !== s.title || n.artist !== s.artist || n.year !== s.year || n.decade !== s.decade || n.genre !== s.genre) facts = false;
  if (!n || s.yt === n.iyt || !/^[A-Za-z0-9_-]{11}$/.test(s.yt)) originals = false;
});
check(facts, 'title, artist, year, decade and video id match the verified Name That Groove originals');
check(originals, 'every video id is the original upload, not the instrumental or karaoke id');
check(C.SONGS.every(s => s.title && s.artist && s.genre), 'every song has a title, artist and genre');
check(/YouTube/.test(C.SOURCE_NOTE) && /ads/.test(C.SOURCE_NOTE), 'source note says YouTube controls ads');
check(/Premium/.test(C.PREMIUM_NOTE) && /Music Premium/.test(C.PREMIUM_NOTE) && !/ad-free|ad free/i.test(C.PREMIUM_NOTE), 'premium note is honest and does not promise ad-free');
check(C.PREMIUM_URL === 'https://support.google.com/youtube/answer/7437519', 'premium note points at YouTube\'s own help page');

console.log('== queue');
{
  const q = Queue.create();
  check(Queue.start(q) === null && Queue.current(q) === null, 'empty queue does not invent a song');
  Queue.add(q, 'a'); Queue.add(q, 'b'); Queue.add(q, 'c');
  check(q.index === -1 && Queue.current(q) === null, 'adding does not start playback or select a row');
  check(Queue.start(q) === 'a' && q.index === 0, 'start lands on the first song');
  check(Queue.next(q) === 'b' && Queue.next(q) === 'c' && Queue.next(q) === null && q.index === 2, 'next walks the queue and stops at the end');
  check(Queue.prev(q) === 'b' && Queue.prev(q) === 'a' && Queue.prev(q) === 'a', 'previous stops on the first song when repeat is off');
  q.repeat = 'all';
  check(Queue.prev(q) === 'c', 'repeat all wraps previous to the end');
  q.index = 2;
  check(Queue.next(q) === 'a' && q.index === 0, 'repeat all wraps next to the start');
  q.repeat = 'one';
  check(Queue.next(q) === 'a' && Queue.next(q) === 'a', 'repeat one stays on the current song');
  check(Queue.next(q, { force: true }) === 'b', 'forced next leaves repeat one');
  check(Queue.move(q, 0, -1) === false, 'cannot move the first song up');
  q.repeat = 'off';
  check(Queue.move(q, 1, -1) === true && q.queue.join() === 'b,a,c' && Queue.current(q) === 'b', 'moving the current song keeps it selected', q.queue);
  const removed = Queue.removeAt(q, q.index);
  check(removed.removedCurrent && Queue.current(q) === 'a' && q.queue.join() === 'a,c', 'removing the current song selects the following one', q.queue);
  check(Queue.jump(q, 1) === 'c' && q.index === 1, 'jump selects a queued song');
  Queue.removeAt(q, 0); Queue.removeAt(q, 0);
  check(q.queue.length === 0 && q.index === -1, 'removing the last song clears the cursor');
}
{
  const q = Queue.create({ rng: mulberry(3) });
  ['a', 'b', 'c', 'd'].forEach(id => Queue.add(q, id));
  q.shuffle = true;
  q.repeat = 'off';
  const seen = [Queue.start(q)];
  for (let i = 0; i < 6; i++) {
    const n = Queue.next(q);
    if (!n) break;
    seen.push(n);
  }
  check(seen.length === 4 && new Set(seen).size === 4, 'shuffle plays each queued song once, then stops', seen);
  q.repeat = 'all';
  const more = [];
  for (let i = 0; i < 4; i++) more.push(Queue.next(q));
  check(more.every(id => q.queue.indexOf(id) >= 0) && new Set(more).size >= 2, 'repeat all keeps shuffling through the same songs', more);
}
{
  const fav = [];
  Queue.toggleFav(fav, 'a'); Queue.toggleFav(fav, 'b'); Queue.toggleFav(fav, 'a');
  check(fav.join() === 'b', 'favorite toggles on and off', fav);
  const raw = Queue.serialize(Queue.create(), { favorites: ['nope', 'abc'], volume: 140, muted: 1, decade: 'nope' });
  raw.queue = ['abc', 'missing']; raw.index = 5; raw.repeat = 'one'; raw.shuffle = true; raw.playing = true; raw.host = 'https://www.youtube-nocookie.com';
  const back = Queue.restore(raw, new Set(['abc']));
  check(back.state.queue.join() === 'abc' && back.state.index === 0 && back.state.repeat === 'one' && back.state.shuffle === true, 'restore keeps a valid queue and clamps the cursor', back.state);
  check(back.favorites.join() === 'abc' && back.volume === 100 && back.muted === true && back.decade === 'all', 'restore drops unknown favorites and clamps volume', back);
  check(!('playing' in back) && !back.state.host, 'saved preferences have no playback or host switch');
  const dumped = Queue.serialize(back.state, back);
  check(!('playing' in dumped) && !('host' in dumped) && !('cookie' in dumped), 'serialize stores queue preferences only', Object.keys(dumped));
}

console.log('== player lifecycle (fake YouTube API)');
function fakeEnv() {
  const scripts = [];
  const env = {
    location: { origin: 'http://localhost:18971' },
    document: {
      head: { appendChild(s) { scripts.push(s); } },
      querySelector(sel) { return sel.indexOf('data-jukebox-yt') >= 0 ? (scripts[0] || null) : null; },
      querySelectorAll() { return []; },
      getElementById() { return { id: 'ytHost' }; },
      createElement() {
        return { setAttribute() {}, async: false };
      }
    },
    YT: null
  };
  env.document.createElement = () => ({ setAttribute() {}, set src(v) { this._src = v; } });
  return { env, scripts };
}

function FakePlayer(id, opts) {
  this.id = id;
  this.opts = opts;
  this.loads = [];
  this.seeks = [];
  this.plays = 0;
  this.destroyed = false;
  this.frame = { src: 'https://www.youtube.com/embed/' };
  FakePlayer.instances.push(this);
  if (opts.events && opts.events.onReady) opts.events.onReady();
}
FakePlayer.instances = [];
FakePlayer.prototype.loadVideoById = function (o) { this.loads.push(o); this.frame.src = 'https://www.youtube.com/embed/' + o.videoId + '?controls=1&rel=0'; };
FakePlayer.prototype.seekTo = function (t) { this.seeks.push(t); };
FakePlayer.prototype.playVideo = function () { this.plays++; };
FakePlayer.prototype.pauseVideo = function () {};
FakePlayer.prototype.setVolume = function () {};
FakePlayer.prototype.mute = function () {};
FakePlayer.prototype.unMute = function () {};
FakePlayer.prototype.getCurrentTime = function () { return 12; };
FakePlayer.prototype.getPlayerState = function () { return 1; };
FakePlayer.prototype.getIframe = function () { return this.frame; };
FakePlayer.prototype.destroy = function () { this.destroyed = true; };

(async () => {
  const { env, scripts } = fakeEnv();
  const events = { ready: 0, states: [], errors: [] };
  const p = new Player.Real('ytHost', {
    onReady() { events.ready++; },
    onState(s) { events.states.push(s); },
    onError(c) { events.errors.push(c); }
  }, env);
  p.play('aaaaaaaaaaa');
  check(p.stats.constructs === 0 && scripts.length === 1 && scripts[0]._src === Player.API, 'first Play asks for the official iframe_api once, and does not build a player early', scripts.map(s => s._src));
  check(p.stats.scripts[0] === 'https://www.youtube.com/iframe_api', 'api script is www.youtube.com');
  p.play('bbbbbbbbbbb');
  check(scripts.length === 1 && p.stats.constructs === 0, 'a second Play before the API arrives does not add another script');
  env.YT = { Player: FakePlayer };
  env.onYouTubeIframeAPIReady();
  await Promise.resolve();
  const inst = FakePlayer.instances[0];
  check(p.stats.constructs === 1 && inst && inst.opts.host === 'https://www.youtube.com', 'one player, host www.youtube.com', inst && inst.opts.host);
  const keys = Object.keys(inst.opts.playerVars).sort();
  check(keys.join() === 'controls,fs,origin,playsinline,rel', 'player vars are controls, fullscreen, origin, playsinline, rel', keys);
  check(inst.opts.playerVars.controls === 1 && inst.opts.playerVars.autoplay === undefined && inst.opts.playerVars.origin === 'http://localhost:18971', 'no autoplay param; origin is this page');
  check(!inst.opts.playerVars.host && inst.opts.host.indexOf('nocookie') < 0, 'not the nocookie host');
  check(p.stats.loads.join() === 'bbbbbbbbbbb' && inst.loads.length === 1 && !inst.loads[0].endSeconds, 'the video requested last is loaded once, as a full video', inst.loads);
  check(events.ready === 1, 'onReady once');
  p.play('ccccccccccc');
  check(p.stats.constructs === 1 && p.stats.loads.join() === 'bbbbbbbbbbb,ccccccccccc' && FakePlayer.instances.length === 1, 'the next song reuses the same player');
  check(inst.destroyed === false && p.stats.destroys === 0, 'the player is not destroyed between songs');
  const before = p.iframe();
  p.replay();
  check(p.stats.replays === 1 && inst.seeks[0] === 0 && inst.plays === 1 && p.iframe() === before, 'replay seeks to the start on the same iframe');
  const report = p.report();
  check(report.configuredHost === 'https://www.youtube.com' && report.sameIframe === true && report.sandbox == null && report.credentialless !== true, 'report: same iframe, no sandbox, no credentialless', report);
  check(p.time() === 12, 'time comes from the official player');

  const root = path.join(__dirname, '..');
  const src = ['js/player.js', 'js/main.js', 'js/queue.js', 'js/catalog.js', 'index.html', 'style.css'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  check(!/youtube-nocookie/.test(src), 'source never names the privacy-enhanced host');
  check(!/document\.cookie|skipAd|cancelAd|\badblock\b|googlevideo|\.mp3|\.m4a/i.test(src), 'no cookie access, ad tampering, or rehosted audio');
  check(!/\.destroy\s*\(/.test(src), 'cabinet code never destroys the player');
  check(!/youtube\.com\/watch|WATCH ON YOUTUBE/i.test(src), 'no Watch-on-YouTube links added by the cabinet');
  check(/iframe_api/.test(src) && /https:\/\/www\.youtube\.com/.test(src), 'official IFrame API on www.youtube.com');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  check(/#ytHost,\s*#ytWell iframe[\s\S]*display:\s*block/.test(css), 'the iframe is displayed, not collapsed');
  check(!/#ytWell iframe[^}]*opacity\s*:\s*0/.test(css) && !/#ytHost[^}]*display\s*:\s*none/.test(css), 'player is not faded out or hidden');
  check(!/<iframe/i.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')), 'the page HTML does not ship a hidden iframe; the API creates the visible one');
  check(/7437519/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8') + C.PREMIUM_URL), 'help points at the Premium embed article');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
