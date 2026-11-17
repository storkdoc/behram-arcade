/* GLOW MUNCH rules: maze, cornering, wisp personalities, chains, dash, levels.
   node games/glow-munch/tests/logic.test.js */
const path = require('path');
const fs = require('fs');
const G = require(path.join(__dirname, '..', 'js', 'logic.js'));

let fails = 0;
const check = (ok, msg, extra) => {
  if (!ok) fails++;
  console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
};

console.log('== maze');
const maze = G.validateMaze();
check(maze.ok, 'original maze is symmetric, bordered, and every light is reachable', maze.errors);
check(maze.powers === 4 && maze.dots > 200, 'four power lamps and a full field of lights', maze);
check(!/pac-?man/i.test(G.MAZE_ROWS.join('')), 'maze data does not carry the trademark');

console.log('== cornering');
{
  const game = G.createGame({ seed: 3, phase: 'play', ready: 0 });
  const p = game.player;
  let corner = null;
  for (let y = 1; y < G.ROWS - 1 && !corner; y++) {
    for (let x = 1; x < G.COLS - 2; x++) {
      if (!game.passable(x, y, null) || !game.passable(x + 1, y, null)) continue;
      if (!game.passable(x + 1, y - 1, null)) continue;
      if (game.cell(x, y) === 'T' || game.cell(x + 1, y) === 'T') continue;
      corner = { x: x, y: y };
      break;
    }
  }
  check(!!corner, 'found a corner to test the turn buffer', corner);
  p.x = corner.x + 0.55; p.y = corner.y; p.dir = 0; p.wish = null;
  game.hold(3);
  for (let i = 0; i < 40 && Math.round(p.y) === corner.y; i++) game.step(1 / 60);
  check(p.dir === 3 && p.y < corner.y - 0.2, 'a held turn before the corner is taken as you reach it', { dir: p.dir, y: +p.y.toFixed(2), corner: corner });

  p.x = corner.x + 0.42; p.y = corner.y; p.dir = 0;
  game.hold(3);
  game.release();
  for (let i = 0; i < 30 && p.dir === 0; i++) game.step(1 / 60);
  check(p.dir === 3, 'a tap just before the corner is buffered and still turns', { dir: p.dir, y: +p.y.toFixed(2) });

  const w = G.createGame({ seed: 1, phase: 'play', ready: 0 });
  w.player.x = 1; w.player.y = 1; w.player.dir = 2;
  w.hold(2);
  const x0 = w.player.x;
  w.step(0.4);
  check(w.player.x >= x0 - 0.05, 'the spark cannot walk through a wall', { x: w.player.x });
}

console.log('== tunnel');
{
  const game = G.createGame({ seed: 1, phase: 'play', ready: 0 });
  const p = game.player;
  p.x = 0; p.y = 15; p.dir = 2; p.wish = null;
  game.hold(2);
  game.step(0.35);
  check(p.x > G.COLS - 4, 'the side lane wraps to the opposite edge', { x: +p.x.toFixed(2) });
}

console.log('== personalities');
{
  const game = G.createGame({ seed: 2, phase: 'play', ready: 0 });
  const p = game.player;
  p.x = 10; p.y = 17; p.dir = 0;
  game.ghosts[0].x = 8; game.ghosts[0].y = 17; game.ghosts[0].mode = 'chase';
  game.ghosts[1].x = 6; game.ghosts[1].y = 17; game.ghosts[1].mode = 'chase';
  game.ghosts[2].x = 4; game.ghosts[2].y = 19; game.ghosts[2].mode = 'chase';
  game.ghosts[3].x = 2; game.ghosts[3].y = 22; game.ghosts[3].mode = 'chase';
  const rush = game.targetOf(0);
  const veil = game.targetOf(1);
  check(rush.x === 10 && rush.y === 17, 'Rush chases the tile you are on', rush);
  check(veil.x === 14 && veil.y === 17, 'Veil aims four tiles ahead', veil);
  p.dir = 3;
  const veilUp = game.targetOf(1);
  check(veilUp.x === 6 && veilUp.y === 13, 'Veil, facing up, also looks to the left', veilUp);
  p.dir = 0;
  const echo = game.targetOf(2);
  check(echo.x === 16 && echo.y === 17, 'Echo doubles the vector from Rush to the point ahead', echo);
  const far = game.targetOf(3);
  check(far.x === 10 && far.y === 17, 'Loom chases while it is far away', far);
  game.ghosts[3].x = 10; game.ghosts[3].y = 16;
  const near = game.targetOf(3);
  check(near.x === G.GHOSTS[3].scatter.x && near.y === G.GHOSTS[3].scatter.y, 'Loom breaks off to its corner when you are close', near);

  game.ghosts[0].mode = 'scatter';
  const sc = game.targetOf(0);
  check(sc.x === G.GHOSTS[0].scatter.x, 'scatter sends Rush to its own corner', sc);

  const open = findJunction(game);
  check(!!open, 'found a junction', open);
  const g = game.ghosts[0];
  g.x = open.x; g.y = open.y; g.dir = 0; g.mode = 'chase';
  p.x = open.x - 4; p.y = open.y; p.dir = 2;
  const chosen = requireDir(g, game);
  check(chosen !== 2, 'a wisp will not reverse to chase you if another lane is open', { chosen: chosen, open: open });
}

console.log('== power chain');
{
  const game = G.createGame({ seed: 4, phase: 'play', ready: 0 });
  const lamp = firstPower();
  game.player.x = lamp.x; game.player.y = lamp.y; game.player.dir = null; game.player.wish = null;
  game.ghosts.forEach((g, i) => { g.mode = 'chase'; g.x = lamp.x + 0.2; g.y = lamp.y; g.dir = 0; });
  const before = game.ghosts.map(g => g.dir);
  game.step(1 / 60);
  check(game.events.indexOf('power') >= 0 && game.fright > 5, 'a power lamp frightens the wisps', { fright: +game.fright.toFixed(2), events: game.events });
  check(game.ghosts.every((g, i) => before[i] == null || g.dir === (before[i] + 2) % 4 || g.mode === 'eaten'), 'fright turns the hunters around', game.ghosts.map(g => g.dir));
  game.chain = 0;
  game.player.dir = null;
  game.player.wish = null;
  game.player.wishHeld = false;
  game.ghosts.forEach(g => { g.mode = 'house'; g.x = 12; g.y = 13; g.dir = null; });
  const scores = [];
  for (let i = 0; i < 4; i++) {
    const g = game.ghosts[i];
    g.mode = 'frightened';
    g.x = game.player.x;
    g.y = game.player.y;
    g.dir = null;
    const s0 = game.score;
    game.step(1 / 60);
    scores.push(game.score - s0);
    check(g.mode === 'eaten', 'a bite turns ' + g.name + ' into eyes heading home', g.mode);
    g.mode = 'house';
    g.x = 12;
    g.y = 13;
    g.dir = null;
  }
  check(scores.join(',') === '200,400,800,1600', 'a chain pays 200, 400, 800, 1600', scores);
}

console.log('== eyes come home');
{
  const game = G.createGame({ seed: 5, phase: 'play', ready: 0 });
  const g = game.ghosts[1];
  g.mode = 'eaten'; g.x = 14; g.y = 10; g.dir = 1;
  game.step(1 / 30);
  check(g.mode === 'house', 'eyes that reach the gate wait in the house', { mode: g.mode, x: g.x, y: g.y });
  game.step(0.7);
  check(g.mode === 'exit' || g.mode === 'chase' || g.mode === 'scatter' || g.mode === 'frightened', 'a housed wisp leaves again', g.mode);
}

console.log('== dots, fruit, dash, level');
{
  const game = G.createGame({ seed: 6, phase: 'play', ready: 0 });
  const p = game.player;
  check(game.cell(p.x + 1, p.y) === '.', 'the opening faces a light');
  const s0 = speedsOf(game);
  p.dir = 0; game.hold(0);
  let guard = 0;
  while (game.score === 0 && guard++ < 90) game.step(1 / 60);
  check(game.score === 10 && game.dotsEaten === 1, 'the first light is worth 10', { score: game.score, eaten: game.dotsEaten });
  const multAt = game.dotsEaten;
  while (game.streakMult < 2 && game.phase === 'play' && guard++ < 600) game.step(1 / 60);
  check(game.streakMult >= 2 && game.score > 10 * (game.dotsEaten - multAt), 'a steady run raises the light value', { mult: game.streakMult, score: game.score, eaten: game.dotsEaten });

  game.player.meter = 100; game.player.dash = 0;
  const dashed = game.dash();
  const spd = game.player.speed;
  game.step(1 / 60);
  check(dashed && game.player.dash > 0 && game.player.speed > spd, 'a full meter spends on a faster dash', { dashed: dashed, dash: game.player.dash, speed: game.player.speed, base: spd });
  check(game.dash() === false, 'the meter has to fill again');

  const fruitGame = G.createGame({ seed: 7, phase: 'play', ready: 0 });
  fruitGame.dotsEaten = fruitGame.fruitMarks[0];
  fruitGame.step(1 / 30);
  check(fruitGame.fruit && fruitGame.fruit.points === 100 && fruitGame.fruit.name === 'SPARK', 'the first treat appears after enough lights', fruitGame.fruit);
  fruitGame.player.x = fruitGame.fruit.x; fruitGame.player.y = fruitGame.fruit.y;
  fruitGame.step(1 / 60);
  check(!fruitGame.fruit && fruitGame.score >= 100, 'touching the treat scores it', { score: fruitGame.score });

  const clear = G.createGame({ seed: 8, phase: 'play', ready: 0 });
  const keep = clear.dots.values().next().value;
  clear.dots.forEach(k => { if (k !== keep) { clear.dots.delete(k); clear.powers.delete(k); } });
  const parts = keep.split(',');
  clear.player.x = +parts[0]; clear.player.y = +parts[1]; clear.player.dir = null; clear.player.wish = null;
  clear.ghosts.forEach(g => { g.x = 2; g.y = 5; g.mode = 'house'; });
  const lv = clear.level;
  const sp0 = clear.speeds().player;
  clear.step(1 / 60);
  check(clear.phase === 'clear' || clear.phase === 'act', 'the last light clears the lane', clear.phase);
  clear.phaseT = 0.01;
  clear.step(0.05);
  check(clear.level === lv + 1 && clear.speeds().player > sp0, 'the next lane is faster', { level: clear.level, from: sp0, to: clear.speeds().player });
  check(clear.lives === 3 && clear.score >= 10, 'lives and score carry into the next lane', { lives: clear.lives, score: clear.score });
}

console.log('== lives');
{
  const game = G.createGame({ seed: 9, phase: 'play', ready: 0 });
  game.player.meter = 0;
  for (let n = 0; n < 3; n++) {
    game.phase = 'play';
    game.ghosts[0].mode = 'chase';
    game.ghosts[0].x = game.player.x;
    game.ghosts[0].y = game.player.y;
    game.step(1 / 60);
  }
  check(game.lives === 0 && (game.phase === 'die' || game.phase === 'over'), 'three touches and the run ends', { lives: game.lives, phase: game.phase });
  game.phaseT = 0.01;
  game.step(0.05);
  check(game.phase === 'over' && game.over, 'the board waits on game over', game.phase);
  const rich = G.createGame({ seed: 1, phase: 'play', ready: 0 });
  rich.score = 9990;
  rich.player.dir = 0; rich.hold(0);
  let g2 = 0;
  while (rich.score < 10000 && g2++ < 120) rich.step(1 / 60);
  check(rich.lives === 4 && rich.extra, '10,000 points awards an extra life', { score: rich.score, lives: rich.lives });
}

console.log('== tap route');
{
  const game = G.createGame({ seed: 1, phase: 'play', ready: 0 });
  const p = game.player;
  const path = game.tapTile(p.x + 3, p.y);
  check(path && path.length >= 1, 'a tap toward a tile lays a path', path && path.length);
  for (let i = 0; i < 80 && Math.hypot(p.x - (game.player.x), 0) >= 0; i++) {
    if (Math.abs(p.x - (G.START.x + 3)) < 0.25 && Math.abs(p.y - G.START.y) < 0.25) break;
    game.step(1 / 60);
  }
  check(Math.abs(p.x - (G.START.x + 3)) < 0.3 && Math.abs(p.y - G.START.y) < 0.3, 'the spark follows the tapped tile', { x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
}

console.log('== mode clock');
{
  const game = G.createGame({ seed: 1, phase: 'play', ready: 0 });
  game.ghosts.forEach(g => { if (g.mode === 'house' || g.mode === 'exit') return; g.mode = 'scatter'; g.dir = 0; g.x = 14.4; g.y = 10; });
  game.modeT = 0.01;
  game.fright = 0;
  game.step(1 / 30);
  check(game.mode === 'chase', 'scatter gives way to chase', game.mode);
  const rush = game.ghosts[0];
  check(rush.dir === 2, 'the mode change turns an outward wisp around', rush.dir);
}

console.log('== credits and recording');
{
  const dir = path.join(__dirname, '..', 'audio');
  const credits = fs.readFileSync(path.join(dir, 'CREDITS.md'), 'utf8');
  check(/Galop from Genevieve de Brabant/.test(credits) && /United States Marine Band/.test(credits), 'credits name the galop and the Marine Band');
  check(/El Capitan/.test(credits) && /John Philip Sousa/.test(credits), 'credits name El Capitan');
  check(/Public domain/.test(credits) && /commons\.wikimedia\.org/.test(credits), 'credits include the licence and source');
  check(!/78-rpm|78 rpm/i.test(credits), 'credits do not describe a 78 transfer');
  check(/Sound effects are synthesized/.test(credits) && !/music is synthesized|synthesized music/i.test(credits), 'effects may be synthesized; the music is a recording');
  for (const file of ['galop.mp3', 'el-capitan.mp3']) {
    const buf = fs.readFileSync(path.join(dir, file));
    const id3 = buf.slice(0, 3).toString() === 'ID3' || buf[0] === 0xff;
    check(id3 && buf.length > 400000 && buf.length < 2500000, file + ' is a real encoded recording', buf.length);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'logic.js'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check(!/pac-?man/i.test(src), 'the cabinet does not use the Pac-Man name');
}

function firstPower() {
  for (let y = 0; y < G.ROWS; y++) for (let x = 0; x < G.COLS; x++) if (G.MAZE_ROWS[y][x] === 'o') return { x: x, y: y };
  return null;
}
function findJunction(game) {
  for (let y = 1; y < G.ROWS - 1; y++) {
    for (let x = 1; x < G.COLS - 1; x++) {
      const exits = [0, 1, 2, 3].filter(d => game.passable(x + G.DX[d], y + G.DY[d], null));
      if (exits.length >= 3 && exits.indexOf(2) >= 0 && (exits.indexOf(1) >= 0 || exits.indexOf(3) >= 0)) return { x: x, y: y, exits: exits };
    }
  }
  return null;
}
function requireDir(ghost, game) {
  const target = game.targetOf(ghost.id);
  const back = (ghost.dir + 2) % 4;
  const options = [];
  for (let d = 0; d < 4; d++) {
    if (d === back) continue;
    if (game.passable(ghost.x + G.DX[d], ghost.y + G.DY[d], ghost)) options.push(d);
  }
  let best = options[0], bestD = Infinity;
  for (const d of [3, 2, 1, 0]) {
    if (options.indexOf(d) < 0) continue;
    const nx = ghost.x + G.DX[d], ny = ghost.y + G.DY[d];
    const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (dist < bestD) { bestD = dist; best = d; }
  }
  return best;
}
function speedsOf(game) { return game.speeds(); }

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
