/* CHALICE — world.js : the kingdom map. Every room is a 20 x 12 tile screen laid on one global grid,
   so rooms line up edge to edge and one tile map (and one BFS) covers the whole kingdom.
   Works in the browser (window.ChaliceWorld) and in node (module.exports). */
(function (root) {
  'use strict';
  const RW = 20, RH = 12, GW = 6, GH = 5;
  // tile codes
  const T = { FLOOR: 0, WALL: 1, WATER: 2, CASTLE: 3, GATE: 4, BARRIER: 5, TREE: 6 };

  /* Maze rooms are written on a 9 x 5 coarse grid (each cell = 2 x 2 tiles inside a 1-tile border),
     like the thick-walled Atari labyrinth. Coarse row 2 lines up with side doorways, coarse col 4 with
     top/bottom doorways. */
  const MAZES = {
    lab_s: ['##.#.#..#', '...#...#.', '.#.....#.', '.#.###.#.', '...#.....'],
    lab_c: ['..#...#.#', '.##.#.#..', '....#....', '#.###.##.', '...#...#.'],
    lab_n: ['...#.....', '.#.#.###.', '.#...#...', '.####.#.#', '...#.....'],
    lab_e: ['#.#...#.#', '..#.#.#..', '....#....', '.##.#.##.', '.........'],
    black_deep: ['...#.#...', '.#.#.####', '.#...#...', '.###..#.#', '...#.....'],
    cat_d: ['.#..#..#.', '.#.##.##.', '...#.....', '##...#.#.', '...#..#..'],
    cat_b: ['.#.#.#...', '...#...#.', '.###.#.#.', '.....#.#.', '.#.#....#'],
    cat_a: ['...#.....', '.#.#.###.', '.#.....#.', '.#####.#.', '.....#...'],
    cat_c: ['.#.#.#...', '.#...#.#.', '...#...#.', '.#.#.#.##', '...#....#'],
    cat_e: ['.#..#..#.', '.#.##.##.', '......#..', '##.#.#.#.', '...#.....'],
  };
  const CASTLE = [
    '####################',
    '#..CCCCCC..CCCCCC..#',
    '#..CCCCCC..CCCCCC..#',
    '#..CCCCCC..CCCCCC..#',
    '#..CCCCCC..CCCCCC..#',
    '#..CCCCCC..CCCCCC..#',
    '#..CCCCCCGGCCCCCC..#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '####################'];
  const INNER = [
    '####################',
    '#..................#',
    '#..##..........##..#',
    '#..##..........##..#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..##..........##..#',
    '#..##..........##..#',
    '#..................#',
    '####################'];
  const ASCII = {
    kingsroad: [
      '####################',
      '#..TT..........TT..#',
      '#..T............T..#',
      '#..................#',
      '#.......T....T.....#',
      '#..................#',
      '#..................#',
      '#.......T....T.....#',
      '#..................#',
      '#..T............T..#',
      '#..TT..........TT..#',
      '####################'],
    southmeadow: [
      '####################',
      '#..................#',
      '#.TT............TT.#',
      '#.T.....TT.......T.#',
      '#.......TT.........#',
      '#..................#',
      '#..................#',
      '#....T........T....#',
      '#...TTT......TTT...#',
      '#..................#',
      '#..................#',
      '####################'],
    white_inner: [
      '####################',
      '#..................#',
      '#.######....######.#',
      '#.#..............#.#',
      '#.#..####..####..#.#',
      '#....#........#....#',
      '#....#........#....#',
      '#.#..####..####..#.#',
      '#.#..............#.#',
      '#.######....######.#',
      '#..................#',
      '####################'],
    mistwood: [
      '####################',
      '#.TT...TTT....TT...#',
      '#.T....T.....TTT.T.#',
      '#...T......T.....TT#',
      '#.TTT..TT..TTT.T...#',
      '#......T...........#',
      '#...T......T..T....#',
      '#.TT..TTT..TT...TT.#',
      '#.T.........T..TT..#',
      '#...TT..T.......T..#',
      '#.T....TTT..T......#',
      '####################'],
    riverbank: [
      '####################',
      '#.....T.....WW..T..#',
      '#..T........WW.....#',
      '#...........WW..T..#',
      '#.....T.....WW.....#',
      '#...........WW.....#',
      '#...........WW.....#',
      '#..T........WW..T..#',
      '#...........WW.....#',
      '#....T......WW.....#',
      '#...........WW..T..#',
      '####################'],
    lakeshore: [
      '####################',
      '#..................#',
      '#..T............T..#',
      '#..................#',
      '#.....WWWW.........#',
      '#....WWWWWW........#',
      '#....WWWWWW........#',
      '#.....WWWW.........#',
      '#..T...............#',
      '#..............T...#',
      '#..T...............#',
      '####################'],
    eastfield: [
      '####################',
      '#..................#',
      '#..T....###....T...#',
      '#.......#.#........#',
      '#..................#',
      '#..................#',
      '#..........T.......#',
      '#...##.............#',
      '#...##......##..T..#',
      '#..T.........#.....#',
      '#..................#',
      '####################'],
    makers: [
      '####################',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '####################'],
  };
  const L1 = [1], L2 = [2, 3, 4], ALL = [1, 2, 3, 4], L4 = [4];
  // id, grid x, y, kind, display name, levels, castle colour (castles / inner rooms)
  const ROOMS = [
    ['gold_castle', 2, 1, 'castle', 'The Gold Castle', ALL, 'gold'],
    ['gold_inner', 2, 0, 'inner', 'Gold Throne Hall', ALL, 'gold'],
    ['kingsroad', 2, 2, 'meadow', "King's Road", ALL],
    ['southmeadow', 2, 3, 'meadow', 'South Meadow', ALL],
    ['lab_s', 3, 2, 'maze', 'Blue Labyrinth', ALL],
    ['lab_c', 3, 1, 'maze', 'Blue Labyrinth', ALL],
    ['lab_n', 3, 0, 'maze', 'Labyrinth Heart', ALL],
    ['lab_e', 4, 2, 'maze', 'Blue Labyrinth', ALL],
    ['black_castle', 4, 1, 'castle', 'The Black Castle', ALL, 'black'],
    ['black_inner', 4, 0, 'inner', 'Black Keep', ALL, 'black'],
    ['black_deep', 5, 0, 'maze', 'Black Undercroft', L2, 'black'],
    ['makers', 5, 1, 'secret', 'The Makers\u2019 Hall', L2],
    ['cat_d', 1, 2, 'catacomb', 'Catacombs', L2],
    ['cat_b', 1, 1, 'catacomb', 'Catacombs', L2],
    ['cat_a', 1, 0, 'catacomb', 'Bone Gallery', L2],
    ['cat_c', 0, 2, 'catacomb', 'Catacombs', L2],
    ['cat_e', 0, 3, 'catacomb', 'Deep Catacombs', L2],
    ['mistwood', 1, 3, 'forest', 'Mistwood', L2],
    ['white_castle', 0, 1, 'castle', 'The White Castle', L2, 'white'],
    ['white_inner', 0, 0, 'inner', 'White Sanctum', L2, 'white'],
    ['riverbank', 3, 3, 'river', 'Riverbank', L2],
    ['lakeshore', 3, 4, 'meadow', 'Lakeshore', L2],
    ['eastfield', 5, 2, 'meadow', 'Eastfield Ruins', L2],
    ['jade_castle', 4, 4, 'castle', 'The Jade Castle', L4, 'jade'],
    ['jade_inner', 4, 3, 'inner', 'Jade Reliquary', L4, 'jade'],
  ];
  // links: [a, b, levels, kind]  kind 'gate' = castle gate passage, 'barrier' = the shimmering wall
  const LINKS = [
    ['gold_castle', 'gold_inner', ALL, 'gate'],
    ['gold_castle', 'kingsroad', ALL],
    ['kingsroad', 'southmeadow', ALL],
    ['kingsroad', 'lab_s', ALL],
    ['lab_s', 'lab_c', ALL],
    ['lab_c', 'lab_n', ALL],
    ['lab_s', 'lab_e', ALL],
    ['lab_c', 'black_castle', ALL],
    ['lab_e', 'black_castle', ALL],
    ['black_castle', 'black_inner', ALL, 'gate'],
    ['black_inner', 'black_deep', L2],
    ['black_deep', 'makers', L2, 'barrier'],
    ['kingsroad', 'cat_d', L2],
    ['cat_d', 'cat_b', L2], ['cat_b', 'cat_a', L2], ['cat_d', 'cat_c', L2], ['cat_c', 'cat_e', L2],
    ['cat_e', 'mistwood', L2], ['mistwood', 'southmeadow', L2],
    ['cat_b', 'white_castle', L2], ['cat_c', 'white_castle', L2],
    ['white_castle', 'white_inner', L2, 'gate'],
    ['southmeadow', 'riverbank', L2], ['riverbank', 'lakeshore', L2],
    ['lab_e', 'eastfield', L2],
    ['lakeshore', 'jade_castle', L4],
    ['jade_castle', 'jade_inner', L4, 'gate'],
  ];
  const LEVELS = {
    1: { name: 'The Gold Road', blurb: 'A small kingdom: two castles, two dragons and the Blue Labyrinth.' },
    2: { name: 'The Three Castles', blurb: 'The whole kingdom: catacombs, the White Castle, the red dragon and the thieving bat.' },
    3: { name: 'The Shifting Kingdom', blurb: 'As Level 2, but every treasure is hidden somewhere new each game.' },
    4: { name: 'The Jade Kingdom', blurb: 'A fourth castle. Lay the three keys on its pedestals to free the Chalice.' },
  };
  // jade castle pedestals (room-local tile coords)
  const PEDESTALS = [[4.5, 9.2], [10, 9.8], [15.5, 9.2]];
  // braziers / torches (room-local): lights in the dark
  const TORCHES = {
    inner: [[1.5, 1.5], [18.5, 1.5], [1.5, 10.5], [18.5, 10.5]],
    catacomb: [], secret: [[3, 3], [17, 3], [3, 9], [17, 9]],
  };

  function expandMaze(rows) {
    const out = []; for (let y = 0; y < RH; y++) out.push(new Array(RW).fill('#'));
    for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 9; cx++) {
      const ch = rows[cy][cx]; if (ch === '#') continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out[1 + cy * 2 + dy][1 + cx * 2 + dx] = '.';
    }
    // the 18th column (x=19 is border) : 9 cells x 2 = 18 tiles -> x 1..18, perfect
    return out.map(r => r.join(''));
  }

  function asciiFor(id, kind) {
    if (MAZES[id]) return expandMaze(MAZES[id]);
    if (ASCII[id]) return ASCII[id];
    if (kind === 'castle') return CASTLE;
    if (kind === 'inner') return INNER;
    throw new Error('no ascii for ' + id);
  }

  function build(level) {
    level = level || 1;
    const W = GW * RW, H = GH * RH;
    const tiles = new Uint8Array(W * H).fill(T.WALL);
    const roomGrid = new Array(GW * GH).fill(null);
    const rooms = {};
    for (const [id, gx, gy, kind, name, lv, castle] of ROOMS) {
      if (!lv.includes(level)) continue;
      const a = asciiFor(id, kind);
      if (a.length !== RH || a.some(r => r.length !== RW)) throw new Error('bad room size ' + id);
      const r = { id, gx, gy, kind, name, castle: castle || null, x0: gx * RW, y0: gy * RH, links: {} };
      rooms[id] = r; roomGrid[gy * GW + gx] = r;
      for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
        const c = a[y][x];
        tiles[(r.y0 + y) * W + r.x0 + x] = c === '.' ? T.FLOOR : c === 'W' ? T.WATER : c === 'C' ? T.CASTLE : c === 'G' ? T.GATE : c === 'T' ? T.TREE : T.WALL;
      }
    }
    const gates = [], barriers = [];
    for (const [a, b, lv, kind] of LINKS) {
      if (!lv.includes(level)) continue;
      const A = rooms[a], B = rooms[b]; if (!A || !B) throw new Error('link to missing room ' + a + '-' + b);
      let cells = [];
      if (A.gy === B.gy && Math.abs(A.gx - B.gx) === 1) {
        const L = A.gx < B.gx ? A : B, Rr = A.gx < B.gx ? B : A;
        for (const y of [5, 6]) cells.push([L.x0 + RW - 1, L.y0 + y], [Rr.x0, Rr.y0 + y]);
        L.links.right = Rr.id; Rr.links.left = L.id;
      } else if (A.gx === B.gx && Math.abs(A.gy - B.gy) === 1) {
        const U = A.gy < B.gy ? A : B, D = A.gy < B.gy ? B : A;
        for (const x of [9, 10]) cells.push([U.x0 + x, U.y0 + RH - 1], [D.x0 + x, D.y0]);
        U.links.down = D.id; D.links.up = U.id;
      } else throw new Error('rooms not adjacent ' + a + '-' + b);
      for (const [x, y] of cells) tiles[y * W + x] = kind === 'barrier' ? T.BARRIER : T.FLOOR;
      if (kind === 'barrier') barriers.push({ rooms: [a, b], cells });
    }
    // gates: the G tiles inside each castle exterior room
    for (const id in rooms) {
      const r = rooms[id]; if (r.kind !== 'castle') continue;
      const cells = []; for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const i = (r.y0 + y) * W + r.x0 + x; if (tiles[i] === T.GATE) cells.push(i); }
      gates.push({ key: r.castle, room: id, inner: r.castle + '_inner', cells, x: r.x0 + 10, y: r.y0 + 6.5, open: false, t: 0 });
    }
    const roomAt = (tx, ty) => { const gx = Math.floor(tx / RW), gy = Math.floor(ty / RH); if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return null; return roomGrid[gy * GW + gx]; };
    const pedestals = rooms.jade_castle ? PEDESTALS.map(([x, y]) => ({ x: rooms.jade_castle.x0 + x, y: rooms.jade_castle.y0 + y })) : [];
    const torches = [];
    for (const id in rooms) { const r = rooms[id]; for (const [x, y] of (TORCHES[r.kind] || [])) torches.push({ x: r.x0 + x, y: r.y0 + y, room: id }); }
    return { level, W, H, RW, RH, GW, GH, T, tiles, rooms, roomGrid, roomAt, gates, barriers, pedestals, torches };
  }

  const api = { RW, RH, GW, GH, T, ROOMS, LINKS, LEVELS, MAZES, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChaliceWorld = api;
})(this);
