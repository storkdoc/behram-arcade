import { Brain, mulberry32 } from '../js/brain.js';
import { Match } from '../js/arena.js';
import { gen0Genome } from '../js/genome.js';
// champion (or a baseline) vs a perfect tracking wall: fraction of balls returned
export function evalVsWall({ g, w, seed, sec, random }) {
  const P0 = random ? { random: true } : { brain: new Brain(g || gen0Genome(), w || null) };
  const m = new Match([P0, { track: true }], mulberry32(seed));
  m.stepMs(sec * 1000); const p = m.pong;
  return { hit: p.hits[0] / Math.max(1, p.hits[0] + p.miss[0]), n: p.hits[0] + p.miss[0], rally: m.stats().rally };
}
