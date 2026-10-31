const match = require('./botmatch.js');
const [la, lb, n, map, mins] = [+(process.argv[2] || 1), +(process.argv[3] || 1), +(process.argv[4] || 6), process.argv[5] || 'heartland', +(process.argv[6] || 50)];
const res = [];
for (let i = 0; i < n; i++) { const r = match(la, lb, 100 + i * 17, map, mins); res.push(r); console.log(`seed ${100 + i * 17}: winner ${r.winner} ${r.how || ''} ${r.min}m ages A[${r.ages[0]}] B[${r.ages[1]}] score ${r.score} (${r.ms}ms)`); }
console.log('wins A', res.filter(r => r.winner === 0).length, 'B', res.filter(r => r.winner === 1).length, 'draw', res.filter(r => r.winner < 0).length, 'avg min', (res.reduce((a, r) => a + r.min, 0) / n).toFixed(1));
