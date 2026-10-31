/* Headless balance sweep: node games/heliopause/tests/balance.js [bot,...] [diff,...] */
const { play } = require('../js/bot.js');
const D = require('../js/data.js');
const bots = (process.argv[2] || 'smart,turtle,noresearch,naive').split(',');
const diffs = (process.argv[3] || 'cadet,commander,odyssey').split(',');
const secs = process.argv[4] ? process.argv[4].split(',').map(Number) : D.SECTORS.map((_, i) => i);
const t0 = Date.now(); const table = {};
for (const bot of bots) for (const diff of diffs) {
  const row = secs.map(i => { const r = play({ sector: i, diff, bot }); return r.mode === 'won' ? `W${r.stars}(${r.earth})` : `L@${r.w + 1}/${D.SECTORS[i].waves}`; });
  console.log(bot.padEnd(10), diff.padEnd(9), row.join(' '));
}
console.log('endless smart commander:', play({ sector: 'endless', diff: 'commander', bot: 'smart', maxWaves: 80 }).w, 'waves');
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');
