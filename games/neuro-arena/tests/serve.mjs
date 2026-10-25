// Serve rule: after a point against one side, the next serve travels toward the other side.
// node tests/serve.mjs
import { Pong } from '../js/pong.js';
import { Match } from '../js/arena.js';
import { mulberry32 } from '../js/brain.js';
let checked = 0, bad = 0, first = [0, 0];
function check(pg, ev) {
  if (ev.t !== 'miss') return;
  const want = 1 - ev.p, dir = pg.vx > 0 ? 1 : 0;
  checked++; if (pg.serveTo !== want || dir !== want) { bad++; console.log('BAD serve after miss by', ev.p, 'serveTo', pg.serveTo, 'vx', pg.vx); }
}
// 1) raw court with jittery paddles
for (let s = 1; s <= 40; s++) {
  const pg = new Pong(mulberry32(s)); first[pg.serveTo]++;
  const r = mulberry32(s * 7);
  for (let t = 0; t < 60000; t++) { pg.events.length = 0; pg.step([r() * 2 - 1, r() * 2 - 1], 1); for (const e of pg.events) check(pg, e); }
}
// 2) the real match loop (as used by turbo, watch and play) with a random player vs a tracker
for (let s = 1; s <= 4; s++) {
  const m = new Match([{ random: true }, { track: true }], mulberry32(100 + s));
  m.onEvent = e => check(m.pong, e);
  m.stepMs(60000);
}
console.log(`serve rule: ${checked} serves checked, ${bad} wrong; first serve went left ${first[0]}x / right ${first[1]}x`);
if (bad || checked < 50 || !first[0] || !first[1]) { console.log('FAIL'); process.exit(1); } else console.log('PASS');
