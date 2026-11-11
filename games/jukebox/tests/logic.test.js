/* JUKEBOX logic tests. node games/jukebox/tests/logic.test.js */
const path = require('path');
const fs = require('fs');
const Cat = require(path.join(__dirname, '..', 'js', 'catalog.js'));
const Queue = require(path.join(__dirname, '..', 'js', 'queue.js'));
const Viz = require(path.join(__dirname, '..', 'js', 'viz.js'));

let fails = 0;
const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };

console.log('== catalog from iTunes metadata');
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog.json'), 'utf8'));
const songs = Cat.prepare(doc.songs);
check(songs.length >= 300 && songs.length <= 500, 'the shelf is a few hundred hits', songs.length);
const catalogBytes = fs.statSync(path.join(__dirname, '..', 'data', 'catalog.json')).size;
check(catalogBytes < 800000, 'catalog file stays small enough to load quickly', catalogBytes);
check(songs.length === doc.songs.length, 'every built row passes validation', [songs.length, doc.songs.length]);
const counts = { '70s': 0, '80s': 0, '90s': 0 };
const ids = new Set();
let years = true, hosts = true, dupes = 0;
songs.forEach(s => {
  counts[s.decade] = (counts[s.decade] || 0) + 1;
  if (ids.has(s.id)) dupes++;
  ids.add(s.id);
  if (Cat.decadeOf(s.year) !== s.decade) years = false;
  if (!Cat.accept(s)) hosts = false;
});
check(years && hosts && dupes === 0, 'years match decades, hosts are Apple, ids are unique', { dupes, counts });
check(counts['70s'] >= 100 && counts['70s'] <= 170 && counts['80s'] >= 100 && counts['80s'] <= 170 && counts['90s'] >= 100 && counts['90s'] <= 170, 'each decade stays near a hundred-plus hits', counts);
const byChart = {};
songs.forEach(s => { byChart[s.chartYear] = (byChart[s.chartYear] || 0) + 1; });
let thin = [];
for (let y = 1970; y <= 1999; y++) if ((byChart[y] || 0) < 8) thin.push(y + ':' + (byChart[y] || 0));
check(thin.length === 0, 'every chart year has several hits', thin);
const byYear = {};
songs.forEach(s => { byYear[s.year] = (byYear[s.year] || 0) + 1; });
check(Math.max(...Object.values(byYear)) <= 25, 'no single release year crowds the shelf', byYear);
check(/courtesy of iTunes/.test(doc.courtesy), 'attribution is the iTunes courtesy line');
const q = Cat.query(songs, { decade: '80s', q: 'billie jean' });
check(q.length >= 1 && q.every(s => s.decade === '80s'), 'search stays inside the decade', q.map(s => s.title + ' ' + s.year).slice(0, 3));
const t0 = Date.now();
for (let i = 0; i < 50; i++) Cat.query(songs, { decade: 'all', q: 'love' });
check(Date.now() - t0 < 500, 'fifty full-catalog searches stay quick', Date.now() - t0);

console.log('== visualizer uses real frequency bytes');
const silent = Viz.barsFromFreq(new Uint8Array(128), 32);
const loud = Viz.barsFromFreq(new Uint8Array(128).fill(200), 32);
check(silent.every(v => v === 0), 'silence draws flat bars');
check(loud.every(v => v > 0.5), 'loud bins draw tall bars', loud[0]);
check(Viz.sumFreq(loud) > Viz.sumFreq(silent), 'sum follows the analyser bytes');
const vizSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'viz.js'), 'utf8');
check(!/captureStream|getUserMedia/.test(vizSrc), 'visualizer does not capture the microphone or a stream');

console.log('== queue');
{
  const qstate = Queue.create();
  Queue.add(qstate, 'a'); Queue.add(qstate, 'b'); Queue.add(qstate, 'c');
  check(Queue.start(qstate) === 'a' && Queue.next(qstate) === 'b' && Queue.next(qstate) === 'c' && Queue.next(qstate) === null, 'queue walks and stops');
  qstate.repeat = 'all';
  check(Queue.next(qstate) === 'a', 'repeat all wraps');
  qstate.repeat = 'one';
  check(Queue.next(qstate) === 'a' && Queue.next(qstate, { force: true }) === 'b', 'repeat one holds until forced');
}

console.log('== no leftover player embed in the jukebox sources');
const files = ['index.html', 'style.css', 'js/main.js', 'js/audio.js', 'js/viz.js', 'js/catalog.js', 'js/queue.js', 'js/sfx.js'];
const blob = files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
check(!/youtube|youtu\.be|iframe_api|googlevideo/i.test(blob), 'jukebox sources do not reference a video host');
check(!fs.existsSync(path.join(__dirname, '..', 'js', 'player.js')), 'old player file is gone');
check(/courtesy of iTunes/.test(blob), 'the page copy credits iTunes');

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
process.exit(fails ? 1 : 0);
