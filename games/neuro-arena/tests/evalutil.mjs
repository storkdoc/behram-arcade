import { Brain, mulberry32 } from '../js/brain.js';
import { Match } from '../js/arena.js';
import { gen0Genome } from '../js/genome.js';
// held-out test (not the selection benchmark): real rallies against a perfect tracking wall, plasticity frozen,
// so it measures what the brain has learned rather than what it learns during the test. Fraction of balls returned.
export function evalVsWall({ g, w, seed, sec, random, learn }) {
  const g2 = { ...(g || gen0Genome()) }; if (!learn) { g2.eta = 0; g2.homeo = 0; }
  const P0 = random ? { random: true } : { brain: new Brain(g2, w || null) };
  const m = new Match([P0, { track: true }], mulberry32(seed));
  m.stepMs(sec * 1000); const p = m.pong;
  return { hit: p.hits[0] / Math.max(1, p.hits[0] + p.miss[0]), n: p.hits[0] + p.miss[0], rally: m.stats().rally };
}
