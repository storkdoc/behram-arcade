/* Newtonian flight, Keplerian planets, and a teaching-grade climate model.
   Distances keep their real ratios. One Earth year is YEAR game-seconds, so
   Proxima b's 11-day orbit lasts about a minute. Planetary gravity is
   strengthened by PLANET_GM_BOOST so a flyby you can see is a flyby that bends
   the ship. World radii are drawn large enough to land on, still smaller than
   the gaps between the TRAPPIST-1 orbits. */
export const AU = 70;
export const YEAR = 1632;
export const GM_SUN = 4 * Math.PI * Math.PI * AU * AU * AU / (YEAR * YEAR);
export const ME_MSUN = 3.003e-6;
export const PLANET_GM_BOOST = 240;
export const RADIUS_EXAG = 22;
export const RE_AU = 4.263e-5;
export const DRY_MASS = 1;

export function starGM(solarMasses) {
  return GM_SUN * solarMasses;
}

export function planetGM(earthMasses) {
  return GM_SUN * earthMasses * ME_MSUN * PLANET_GM_BOOST;
}

export function planetRadius(earthRadii) {
  return earthRadii * RE_AU * AU * RADIUS_EXAG;
}

export function meanMotion(a, gm) {
  return Math.sqrt(gm / (a * a * a));
}

export function period(a, gm) {
  return 2 * Math.PI / meanMotion(a, gm);
}

/* a in world units, e eccentricity, M mean anomaly in radians, gm of the star. */
export function kepler(a, e, M, gm) {
  const ee = Math.max(0, Math.min(0.8, e || 0));
  let E = M;
  for (let i = 0; i < 8; i++) {
    const f = E - ee * Math.sin(E) - M;
    const fp = 1 - ee * Math.cos(E);
    E -= f / fp;
  }
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const denom = 1 - ee * cosE;
  const n = meanMotion(a, gm);
  const s = Math.sqrt(Math.max(0, 1 - ee * ee));
  return {
    x: a * (cosE - ee),
    y: a * s * sinE,
    vx: -a * n * sinE / denom,
    vy: a * n * s * cosE / denom
  };
}

export function aFromPeriod(starMass, periodDays) {
  const yr = periodDays / 365.25;
  return Math.cbrt(starMass * yr * yr);
}

export function gravity(x, y, bodies) {
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = b.x - x;
    const dy = b.y - y;
    const r2 = dx * dx + dy * dy;
    const soft = b.soft || 0.05;
    const r = Math.sqrt(r2);
    const use = r < soft ? soft : r;
    const inv = b.gm / (use * use * use);
    ax += dx * inv;
    ay += dy * inv;
  }
  return [ax, ay];
}

/* Semi-implicit Euler with an RK2 gravity sample. Thrust is constant over dt. */
export function stepShip(ship, bodies, dt, extraAx, extraAy) {
  const ax0 = gravity(ship.x, ship.y, bodies);
  const mx = ship.x + ship.vx * dt * 0.5;
  const my = ship.y + ship.vy * dt * 0.5;
  const ax1 = gravity(mx, my, bodies);
  const ax = ax1[0] + (extraAx || 0);
  const ay = ax1[1] + (extraAy || 0);
  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  return ax0;
}

export function shipMass(ship) {
  const c = ship.cargo || {};
  return DRY_MASS + ship.fuel + ship.xe + ((c.ice || 0) + (c.iron || 0) + (c.si || 0) + (c.carbon || 0) + (c.xe || 0)) * 0.008;
}

export function deltaV(ship, ve) {
  const m = shipMass(ship);
  const dry = Math.max(0.2, m - (ve > 3 ? ship.xe : ship.fuel));
  if (m <= dry + 1e-6) return 0;
  return ve * Math.log(m / dry);
}

export function predict(ship, bodies, step, count) {
  const s = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
  const pts = new Array(count);
  for (let i = 0; i < count; i++) {
    stepShip(s, bodies, step, 0, 0);
    pts[i] = [s.x, s.y];
  }
  return pts;
}

export function approach(ship, body) {
  const dx = ship.x - body.x;
  const dy = ship.y - body.y;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const alt = dist - body.radius;
  const rvx = ship.vx - (body.vx || 0);
  const rvy = ship.vy - (body.vy || 0);
  const rel = Math.hypot(rvx, rvy);
  return {
    dist, alt, rel, dx, dy,
    nx: dx / dist, ny: dy / dist,
    canLand: alt < body.radius * 2.4 && alt > -body.radius * 0.35 && rel < 0.55,
    tooFast: alt < body.radius * 2.4 && rel >= 0.55
  };
}

/* Equilibrium and surface temperature. Earth (S=1, A=0.3, 1 bar, greenhouse 1)
   lands near 255 K equilibrium and 288 K at the surface. */
export function climate(spec) {
  const a = Math.max(0.002, spec.aAU);
  const S = spec.L / (a * a);
  const albedo = Math.min(0.85, Math.max(0.05, spec.albedo));
  const Teq = 278 * Math.pow(Math.max(1e-4, S * (1 - albedo)), 0.25);
  const air = spec.atmosphere || 'none';
  const bare = air === 'none' || air === 'hhe';
  const pressure = bare ? 0 : Math.max(0, spec.pressure);
  const gh = bare ? 0 : Math.max(0, spec.greenhouse);
  const Tsurf = Teq + (bare ? 0 : 33 * Math.sqrt(pressure) * gh);
  const aIn = Math.sqrt(spec.L / 1.1);
  const aOut = Math.sqrt(spec.L / 0.36);
  const inHZ = a >= aIn && a <= aOut;
  const water = spec.water || 0;
  const liquid = !bare && water > 0.15 && pressure >= 0.05 && pressure <= 10 && Tsurf >= 273 && Tsurf <= 340;
  const habitable = liquid && (air === 'n2o2' || air === 'co2') && Tsurf <= 318;
  let verdict = 'A cold rock. Liquid water would freeze out.';
  if (air === 'none') verdict = 'No atmosphere to hold a climate. The surface answers only to the star.';
  else if (air === 'hhe') verdict = 'A hydrogen envelope. This is a small giant, not a garden.';
  else if (Tsurf >= 373 || (S > 1.6 && gh > 1.15)) verdict = 'Too much sunlight. A runaway greenhouse is the likely end.';
  else if (habitable) verdict = 'Inside the liquid-water zone, with air mild enough to stand in.';
  else if (inHZ && Tsurf < 273) verdict = 'The orbit is kind, but the air is too thin or too bright. Warm it, or darken the clouds.';
  else if (inHZ && Tsurf > 318) verdict = 'The orbit is kind, and the air is holding too much heat.';
  else if (Tsurf >= 273 && Tsurf <= 318 && water <= 0.15) verdict = 'Warm enough. There is not enough water for an ocean.';
  else if (a < aIn) verdict = 'Inside the inner edge. Expect steam, or a baked surface.';
  else if (a > aOut && Tsurf < 273) verdict = 'Beyond the outer edge. Ice, unless the air is very heavy.';
  else if (liquid) verdict = 'Liquid water is possible. The air is not one a person could breathe.';
  return { S, Teq, Tsurf, aIn, aOut, inHZ, liquid, habitable, verdict, albedo, pressure, water };
}

export function lookFromClimate(c, life) {
  const t = c.Tsurf;
  const ocean = (t > 268 && t < 370) ? Math.min(1, c.water) : (t >= 370 ? Math.min(0.25, c.water * 0.3) : Math.min(0.2, c.water * 0.25));
  const ice = t < 250 ? 1 : t < 275 ? (275 - t) / 25 : (t < 285 ? 0.15 : 0);
  const cloud = Math.min(1, (c.water || 0) * (t > 255 && t < 330 ? 0.95 : 0.35));
  const alive = life || 0;
  const veg = alive * (c.habitable || (t > 273 && t < 320 && c.water > 0.2) ? 1 : 0.15);
  const lava = t > 520 ? Math.min(1, (t - 520) / 500) : 0;
  const cities = alive > 0.82 ? (alive - 0.82) / 0.18 : 0;
  return { ocean, ice, cloud, veg, lava, cities };
}

export function starRGB(teff) {
  const t = Math.max(10, teff) / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = Math.max(0, Math.min(255, 99.4708025861 * Math.log(t) - 161.1195681661));
    b = t <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177312231 * Math.log(t - 10) - 305.0447927307));
  } else {
    r = Math.max(0, Math.min(255, 329.698727446 * Math.pow(t - 60, -0.1332047592)));
    g = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(t - 60, -0.0755148492)));
    b = 255;
  }
  return [r / 255, g / 255, b / 255];
}
