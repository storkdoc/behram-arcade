/* Orbital mechanics and climate. Run: node games/exo-odyssey/tests/physics.test.js */
import {
  AU, YEAR, GM_SUN, stepShip, period, kepler, climate, approach,
  planetRadius, planetGM, starGM, aFromPeriod, deltaV, gravity
} from '../js/sim.js';
import { SYSTEMS, beaconStrength, getSystem } from '../js/data.js';

let fails = 0;
const check = (ok, msg, extra) => {
  if (!ok) fails++;
  console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
};

const earthT = period(AU, GM_SUN);
check(Math.abs(earthT - YEAR) / YEAR < 0.002, 'an Earth-year orbit lasts one game year', { earthT, YEAR });

const prox = getSystem('proxima');
const pb = prox.planets.find((p) => p.id === 'proxima-b');
const aB = pb.aAU * AU;
const tB = period(aB, starGM(prox.star.mass));
check(pb.aAU > 0.047 && pb.aAU < 0.051, 'Proxima b sits near 0.049 AU', pb.aAU);
check(Math.abs(tB - (11.186 / 365.25) * YEAR) / tB < 0.03, 'Proxima b period matches 11.2 days', tB);

const trap = getSystem('trappist');
check(trap.planets.length === 7, 'TRAPPIST-1 has seven worlds');
const radii = trap.planets.map((p) => planetRadius(p.radius));
for (let i = 0; i < trap.planets.length - 1; i++) {
  const gap = (trap.planets[i + 1].aAU - trap.planets[i].aAU) * AU;
  const sum = radii[i] + radii[i + 1];
  check(gap > sum * 1.15, trap.planets[i].name + ' does not overlap the next orbit', { gap, sum });
}
const order = trap.planets.map((p) => p.aAU);
check(order.every((a, i) => i === 0 || a > order[i - 1]), 'TRAPPIST orbits are in period order');

const ship = { x: aB, y: 0, vx: 0, vy: Math.sqrt(starGM(prox.star.mass) / aB) };
const star = [{ x: 0, y: 0, gm: starGM(prox.star.mass), soft: 0.05 }];
const steps = Math.round(tB / 0.04);
for (let i = 0; i < steps; i++) stepShip(ship, star, 0.04, 0, 0);
const rEnd = Math.hypot(ship.x, ship.y);
check(Math.abs(rEnd - aB) / aB < 0.06, 'a circular orbit stays near its radius for one period', { rEnd, aB, err: Math.abs(rEnd - aB) / aB });

const home = climate({ L: 1, aAU: 1, albedo: 0.3, pressure: 1, greenhouse: 1, water: 0.7, atmosphere: 'n2o2' });
check(home.habitable && home.Tsurf > 275 && home.Tsurf < 300, 'Earth-like inputs are habitable and near 288 K', home);
const venus = climate({ L: 1.91, aAU: 0.72, albedo: 0.75, pressure: 92, greenhouse: 1.5, water: 0, atmosphere: 'co2' });
check(!venus.habitable && venus.Tsurf > 500, 'a Venus-like air is a runaway, not a garden', { T: venus.Tsurf });
const bare = climate({ L: 1, aAU: 1, albedo: 0.1, pressure: 0, greenhouse: 0, water: 0, atmosphere: 'none' });
check(!bare.habitable && bare.Tsurf < 320, 'an airless world is not habitable', bare.verdict);
const proxClimate = climate({ L: prox.star.L, aAU: pb.aAU, albedo: 0.3, pressure: 0.6, greenhouse: 0.7, water: 0.3, atmosphere: 'co2' });
check(proxClimate.S > 0.5 && proxClimate.S < 0.9, 'Proxima b receives a fraction of Earth\'s light', proxClimate.S);

const k452 = getSystem('kepler452');
const cousin = k452.planets[0];
const flux = k452.star.L / (cousin.aAU * cousin.aAU);
check(flux > 0.9 && flux < 1.4, 'Kepler-452 b gets roughly Earth\'s sunlight', flux);

check(beaconStrength('trappist-e') === 1, 'the distress beacon peaks on TRAPPIST-1 e');
check(beaconStrength('trappist-b') < 0.2, 'the inner worlds barely hear it');

const body = {
  x: 0, y: 0, vx: 0.42, vy: 0, gm: 0.01, soft: 0.04, radius: 0.1
};
const flyer = { x: -2.4, y: -0.14, vx: 0.63, vy: 0 };
const v0 = Math.hypot(flyer.vx, flyer.vy);
let min = 99;
for (let i = 0; i < 700; i++) {
  body.x += body.vx * 0.015;
  body.y += body.vy * 0.015;
  stepShip(flyer, [body], 0.015, 0, 0);
  min = Math.min(min, Math.hypot(flyer.x - body.x, flyer.y - body.y));
}
const v1 = Math.hypot(flyer.vx, flyer.vy);
check(min > 0.06 && min < 0.4, 'a slingshot pass stays outside the world', min);
check(v1 > v0 * 1.08, 'a flyby behind a moving world adds speed', { v0, v1, min });

const e = climate({ L: 1, aAU: 1, albedo: 0.3, pressure: 1, greenhouse: 1, water: 0.7, atmosphere: 'n2o2' });
check(e.aIn < 1 && e.aOut > 1, 'Earth\'s orbit sits inside the computed habitable zone', { aIn: e.aIn, aOut: e.aOut });

const dv = deltaV({ fuel: 0.85, xe: 0, cargo: {} }, 1.75);
check(dv > 0.7 && dv < 1.4, 'a full chemical tank is about one kilometre per second of game delta-v', dv);

const st = kepler(aB, 0, 0, starGM(prox.star.mass));
check(Math.abs(st.x - aB) < 1e-6 && Math.abs(st.vy - Math.sqrt(starGM(prox.star.mass) / aB)) < 1e-4, 'Kepler at periapsis of a circle is the circular state');

const near = approach(
  { x: body.x + 0.2, y: 0, vx: body.vx, vy: 0.05 },
  body
);
check(near.canLand, 'a slow, close approach may land', near);
const hot = approach(
  { x: body.x + 0.2, y: 0, vx: body.vx + 1.2, vy: 0 },
  body
);
check(hot.tooFast && !hot.canLand, 'a fast approach is refused', hot);

check(SYSTEMS.filter((s) => s.gate).map((s) => s.gate).join() === 'sail,ion,shield,ramjet', 'later systems are gated by sail, ion, shield, ramjet');
check(gravity(1, 0, [{ x: 0, y: 0, gm: planetGM(1), soft: 0.01 }])[0] < 0, 'planet wells pull inward');

console.log(fails ? `\n${fails} FAILED` : '\nall physics checks passed');
process.exit(fails ? 1 : 0);
