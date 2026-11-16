/* Campaign state: ship, tech, missions, rescue, terraforming. No DOM. */
import {
  SYSTEMS, getSystem, DRIVES, TECH, TIPS, beaconStrength
} from './data.js';
import {
  AU, starGM, planetRadius, kepler, meanMotion, stepShip, shipMass,
  approach, climate, lookFromClimate, deltaV
} from './sim.js';

const SAVE = 'exo-odyssey.save';
const MAYDAY = 420;

function freshShip() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, heading: 0,
    fuel: 0.85, xe: 0.4,
    cargo: { ice: 0, iron: 0, si: 0, carbon: 0, xe: 0 },
    drive: 'chem',
    throttle: 0,
    hull: 1
  };
}

function naturalClimate(planet, star) {
  const S = star.L / (planet.aAU * planet.aAU);
  let atmosphere = 'co2';
  let pressure = 0.7;
  let greenhouse = 0.75;
  let water = 0.25;
  let albedo = 0.32;
  if (S > 2.2) { pressure = 6; greenhouse = 1.45; water = 0.04; albedo = 0.55; }
  else if (S > 1.25) { pressure = 1.4; greenhouse = 1.15; water = 0.08; albedo = 0.4; }
  else if (S < 0.35) { pressure = 0.25; greenhouse = 0.45; water = planet.ores.ice > 0.4 ? 0.55 : 0.12; albedo = 0.5; }
  else { water = 0.2 + planet.ores.ice * 0.45; }
  if (planet.ores.ice > 0.5) { albedo = 0.58; greenhouse = 0.4; water = 0.72; atmosphere = 'co2'; }
  return { L: star.L, aAU: planet.aAU, albedo, pressure, greenhouse, water, atmosphere };
}

export function createGame(saved) {
  const g = {
    v: 1,
    systemId: 'proxima',
    t: 18,
    ship: freshShip(),
    docked: true,
    landed: null,
    surface: null,
    tech: { chem: true, sail: false, ion: false, shield: false, nano: false, ramjet: false, dark: false },
    research: 0,
    surveyed: {},
    surveyPaid: {},
    mined: { ice: 0, iron: 0, si: 0, carbon: 0, xe: 0 },
    landedOnce: {},
    rescued: false,
    mayday: null,
    maydayLost: false,
    overrides: {},
    life: {},
    bestLife: 0,
    nurture: null,
    miner: false,
    warp: 1,
    target: 1,
    sailOn: false,
    shieldOn: false,
    cinematic: null,
    line: 'Infinity Command. The charts are loaded, and the tanks are full.',
    lineT: 8,
    slingArm: null,
    hullFlash: 0,
    drone: { x: 0, y: 0 },
    rescueHold: 0,
    seen: {}
  };

  if (saved && saved.v === 1 && saved.ship) {
    const ship = { ...freshShip(), ...saved.ship, cargo: { ...freshShip().cargo, ...(saved.ship.cargo || {}) } };
    Object.assign(g, saved, { ship, cinematic: null, lineT: 0, drone: saved.drone || { x: 0, y: 0 } });
  }

  function sys() { return getSystem(g.systemId); }

  function bodies() {
    const s = sys();
    const gm = starGM(s.star.mass);
    const list = [{
      id: 'star', kind: 'star', name: s.name,
      x: 0, y: 0, vx: 0, vy: 0, gm, soft: 0.42, radius: s.star.mass > 0.8 ? 0.85 : 0.5,
      teff: s.star.teff, L: s.star.L, spectral: s.star.spectral
    }];
    for (const p of s.planets) {
      const a = p.aAU * AU;
      const st = kepler(a, p.e, (p.M0 || 0) + meanMotion(a, gm) * g.t, gm);
      const radius = planetRadius(p.radius);
      list.push({
        ...p, kind: 'planet', a, radius,
        x: st.x, y: st.y, vx: st.vx, vy: st.vy,
        gm: p.well, soft: radius * 0.8
      });
    }
    return list;
  }

  function station(list) {
    const listUse = list || bodies();
    const p = listUse.find((b) => b.id === 'proxima-b');
    if (!p || g.systemId !== 'proxima') return null;
    const r = p.radius * 5.6;
    const w = Math.sqrt(p.gm / (r * r * r));
    const ang = g.t * w + 0.4;
    return {
      x: p.x + Math.cos(ang) * r,
      y: p.y + Math.sin(ang) * r,
      vx: p.vx - Math.sin(ang) * w * r,
      vy: p.vy + Math.cos(ang) * w * r,
      radius: 0.16
    };
  }

  function targetBody(list) {
    const listUse = list || bodies();
    const planets = listUse.filter((b) => b.kind === 'planet');
    if (!planets.length) return listUse[0];
    g.target = ((g.target % planets.length) + planets.length) % planets.length;
    return planets[g.target];
  }

  function say(text, sec) {
    g.line = text;
    g.lineT = sec || 7.5;
  }

  function climateFor(id) {
    const found = findPlanet(id);
    if (!found) return climate({ L: 1, aAU: 1, albedo: 0.3, pressure: 1, greenhouse: 1, water: 0.7, atmosphere: 'n2o2' });
    const base = naturalClimate(found.planet, found.system.star);
    const over = g.overrides[id] || {};
    return climate({ ...base, ...over, L: found.system.star.L, aAU: found.planet.aAU });
  }

  function findPlanet(id) {
    for (const s of SYSTEMS) {
      const p = s.planets.find((q) => q.id === id);
      if (p) return { system: s, planet: p };
    }
    return null;
  }

  function look(id) {
    return lookFromClimate(climateFor(id), g.life[id] || 0);
  }

  function thrustAccel(h) {
    const d = DRIVES[g.ship.drive] || DRIVES.chem;
    const mass = shipMass(g.ship);
    let ax = 0;
    let ay = 0;
    const th = g.ship.throttle || 0;
    if (Math.abs(th) > 0.01 && d.fuel !== 'none' && g.ship.drive !== 'sail') {
      const tank = d.fuel === 'xe' ? g.ship.xe : g.ship.fuel;
      if (tank > 0.0008) {
        const acc = (d.thrust * Math.abs(th)) / mass;
        const dir = g.ship.heading + (th < 0 ? Math.PI : 0);
        ax += Math.cos(dir) * acc;
        ay += Math.sin(dir) * acc;
        const mdot = (d.thrust * Math.abs(th)) / d.ve * h;
        if (d.fuel === 'xe') g.ship.xe = Math.max(0, g.ship.xe - mdot);
        else g.ship.fuel = Math.max(0, g.ship.fuel - mdot);
      }
    }
    if ((g.sailOn || g.ship.drive === 'sail') && g.tech.sail) {
      const r = Math.hypot(g.ship.x, g.ship.y) || 0.2;
      const push = sys().star.L * 2.4 / (r * r);
      ax += (g.ship.x / r) * push;
      ay += (g.ship.y / r) * push;
    }
    if (g.tech.ramjet && g.ship.drive === 'ramjet') {
      const sp = Math.hypot(g.ship.vx, g.ship.vy);
      if (sp > 0.55) g.ship.fuel = Math.min(1.5, g.ship.fuel + 0.012 * h);
    }
    if (g.tech.dark && !g.docked && !g.landed) g.research += 0.02 * h;
    return [ax, ay];
  }

  function finishCinematic() {
    const c = g.cinematic;
    if (!c) return;
    if (c.kind === 'entry') {
      const list = bodies();
      const p = list.find((b) => b.id === c.planetId);
      if (p) {
        g.ship.vx = p.vx;
        g.ship.vy = p.vy;
        g.ship.x = p.x + p.radius * 1.02;
        g.ship.y = p.y;
        g.landed = p.id;
        g.landedOnce[p.id] = true;
        g.miner = false;
        const rescueHere = g.mayday != null && p.id === 'trappist-e' && !g.rescued;
        if (rescueHere) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 18 + Math.random() * 16;
          g.surface = { kind: 'rescue', x: Math.cos(ang + Math.PI) * 10, y: Math.sin(ang + Math.PI) * 10, wreckX: Math.cos(ang) * rad, wreckY: Math.sin(ang) * rad, progress: 0 };
          say('The beacon is on the surface. Follow the scanner. The cells are still counting down.');
        } else {
          g.surface = { kind: 'field' };
          say(p.note);
        }
      }
    } else if (c.kind === 'depart') {
      g.systemId = c.to;
      g.docked = false;
      g.landed = null;
      g.surface = null;
      g.t = 5;
      const list = bodies();
      const outer = list.filter((b) => b.kind === 'planet').slice(-1)[0];
      const r = outer ? outer.a * 1.35 : 8;
      const gm = list[0].gm;
      const v = Math.sqrt(gm / r);
      g.ship.x = r;
      g.ship.y = 0;
      g.ship.vx = 0;
      g.ship.vy = v;
      g.ship.heading = Math.PI / 2;
      g.target = 0;
      if (c.to === 'trappist' && !g.rescued) {
        g.mayday = MAYDAY;
        g.maydayLost = false;
        say('TRAPPIST-1. Seven worlds, one distress call. Scan them. The cells will not wait.');
      } else {
        say(TIPS[c.to] || sys().blurb);
      }
    }
    g.cinematic = null;
  }

  function bounce(p, ap) {
    const nx = ap.nx;
    const ny = ap.ny;
    g.ship.x = p.x + nx * (p.radius * 1.04);
    g.ship.y = p.y + ny * (p.radius * 1.04);
    const rvx = g.ship.vx - p.vx;
    const rvy = g.ship.vy - p.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      g.ship.vx -= 1.35 * vn * nx;
      g.ship.vy -= 1.35 * vn * ny;
    }
    g.ship.fuel = Math.max(0, g.ship.fuel - 0.02);
    g.hullFlash = 1;
  }

  function step(realDt) {
    const dt = Math.max(0, Math.min(0.05, realDt || 0));
    if (g.lineT > 0) g.lineT -= dt;
    if (g.hullFlash > 0) g.hullFlash -= dt;
    if (g.cinematic) {
      g.cinematic.t += dt;
      if (g.cinematic.kind === 'launch' && g.cinematic.t < 2.4) g.ship.throttle = 0.85;
      if (g.cinematic.t >= g.cinematic.dur) finishCinematic();
    }
    if (g.mayday != null && !g.docked && !g.cinematic) {
      g.mayday -= dt;
      if (g.mayday <= 0) {
        g.mayday = null;
        g.maydayLost = true;
        say('The cells went quiet. Backup power may bring the beacon back. You can make the crossing again.');
      }
    }
    if (g.cinematic && (g.cinematic.kind === 'depart' || g.cinematic.kind === 'entry')) return;
    if (g.docked) {
      g.t += dt;
      return;
    }
    if (g.landed) {
      g.t += dt;
      if (g.miner && g.surface && g.surface.kind === 'field') {
        const found = findPlanet(g.landed);
        if (found) {
          const rate = (g.tech.nano ? 1.15 : 0.62) * dt;
          for (const k of Object.keys(found.planet.ores)) {
            const add = found.planet.ores[k] * rate;
            g.ship.cargo[k] = (g.ship.cargo[k] || 0) + add;
            g.mined[k] = (g.mined[k] || 0) + add;
          }
        }
      }
      if (g.nurture && g.surface && g.surface.kind === 'field') {
        const n = g.nurture;
        n.heat += (0.5 - n.heat) * 0.15 * dt + (Math.random() - 0.5) * 0.08 * dt;
        n.wet += (0.48 - n.wet) * 0.12 * dt + (Math.random() - 0.5) * 0.08 * dt;
        n.light += (0.62 - n.light) * 0.2 * dt;
        const ok = n.heat > 0.32 && n.heat < 0.72 && n.wet > 0.3 && n.wet < 0.75 && n.light < 0.82;
        n.stable = Math.max(0, n.stable + (ok ? dt : -dt * 0.65));
        if (n.stable >= 20) {
          g.life[g.landed] = Math.max(g.life[g.landed] || 0, 0.9);
          g.bestLife = Math.max(g.bestLife, g.life[g.landed]);
          g.nurture = null;
          g.research += 12;
          say('It held. The world kept the light, the water, and the warmth. Something is growing.');
        }
      }
      if (g.surface && g.surface.kind === 'rescue') {
        const s = g.surface;
        const dx = g.drone.x;
        const dy = g.drone.y;
        const sp = Math.hypot(dx, dy) || 1;
        const cap = 14;
        s.x += (dx / sp) * Math.min(sp, 1) * cap * dt;
        s.y += (dy / sp) * Math.min(sp, 1) * cap * dt;
        const dist = Math.hypot(s.x - s.wreckX, s.y - s.wreckY);
        s.dist = dist;
        if (dist < 4.2 && g.rescueHold > 0) {
          s.progress += dt;
          if (s.progress >= 1.5) {
            g.rescued = true;
            g.mayday = null;
            g.ship.cargo.xe = (g.ship.cargo.xe || 0) + 4;
            g.ship.xe += 1.2;
            g.research += 20;
            g.surface = { kind: 'field' };
            say('The pilot is aboard. The kit in the cutter can change an atmosphere. The cells can rest.');
          }
        } else if (g.rescueHold <= 0) s.progress = Math.max(0, (s.progress || 0) - dt);
      }
      return;
    }

    let scale = g.warp;
    if (g.cinematic || Math.abs(g.ship.throttle) > 0.04) scale = 1;
    const list0 = bodies();
    const near = list0.some((b) => b.kind === 'planet' && Math.hypot(g.ship.x - b.x, g.ship.y - b.y) < b.radius * 8);
    if (near) scale = 1;
    const total = dt * scale;
    const h = 0.02;
    const n = Math.max(1, Math.min(80, Math.round(total / h)));
    const stepDt = total / n;
    for (let i = 0; i < n; i++) {
      g.t += stepDt;
      const list = bodies();
      const acc = thrustAccel(stepDt);
      stepShip(g.ship, list, stepDt, acc[0], acc[1]);
      if (g.cinematic && g.cinematic.kind === 'entry') continue;
      for (const p of list) {
        if (p.kind !== 'planet' && p.kind !== 'star') continue;
        const ap = approach(g.ship, p);
        if (p.kind === 'star' && ap.dist < p.radius) {
          bounce(p, ap);
          g.ship.hull = Math.max(0.2, g.ship.hull - 0.15);
          say('That is the star. The heat shield will not forgive a second pass.');
          scale = 1;
          break;
        }
        if (p.kind === 'planet' && ap.alt < 0) {
          bounce(p, ap);
          say(ap.rel < 0.55 ? 'You are in the corridor. Call the entry burn.' : 'Too fast. Shed speed against the world\'s motion, then call the entry.');
          break;
        }
      }
      if (sys().flare && !g.shieldOn && g.ship.hull > 0) {
        const r = Math.hypot(g.ship.x, g.ship.y);
        if (r < 1.15) {
          g.ship.hull = Math.max(0, g.ship.hull - stepDt * 0.12);
          g.hullFlash = 0.4;
          if (g.ship.hull <= 0.05 && !g.seen.flare) {
            g.seen.flare = true;
            say('A flare. Charged particles are in the hull. The magnetic shield is what turns them aside.');
          }
        }
      } else if (g.ship.hull < 1) g.ship.hull = Math.min(1, g.ship.hull + stepDt * 0.01);
    }

    const after = bodies();
    let closest = null;
    let closestD = 1e9;
    for (const p of after) {
      if (p.kind !== 'planet') continue;
      const d = Math.hypot(g.ship.x - p.x, g.ship.y - p.y) / p.radius;
      if (d < closestD) { closestD = d; closest = p; }
    }
    const speed = Math.hypot(g.ship.vx, g.ship.vy);
    if (closest && closestD < 3.2) {
      if (!g.slingArm || g.slingArm.id !== closest.id) g.slingArm = { id: closest.id, v: speed, used: false };
    } else if (g.slingArm && !g.slingArm.used && closestD > 4.5) {
      if (speed > g.slingArm.v * 1.08 && g.slingArm.v > 0.05) {
        g.slingArm.used = true;
        g.cinematic = { kind: 'sling', t: 0, dur: 3.2 };
        say(TIPS.sling);
      } else g.slingArm = null;
    }
  }

  function launch() {
    if (!g.docked || g.systemId !== 'proxima') return { ok: false, reason: 'The mast is at Infinity Command, in the Proxima system.' };
    const list = bodies();
    const st = station(list);
    const home = list.find((b) => b.id === 'proxima-b');
    g.ship.x = st.x;
    g.ship.y = st.y;
    g.ship.vx = st.vx;
    g.ship.vy = st.vy;
    g.ship.heading = Math.atan2(st.y - home.y, st.x - home.x);
    g.docked = false;
    g.landed = null;
    g.cinematic = { kind: 'launch', t: 0, dur: 6.2 };
    say(TIPS.orbit);
    return { ok: true };
  }

  function tryDock() {
    if (g.docked || g.landed || g.systemId !== 'proxima') return { ok: false, reason: 'Infinity Command orbits Proxima b.' };
    const st = station(bodies());
    const d = Math.hypot(g.ship.x - st.x, g.ship.y - st.y);
    const rel = Math.hypot(g.ship.vx - st.vx, g.ship.vy - st.vy);
    if (d > 0.55 || rel > 0.18) return { ok: false, reason: 'Match the station\'s speed, and come in close.' };
    g.docked = true;
    g.ship.throttle = 0;
    say('Docked at Infinity Command. The foundry and the lab are open.');
    return { ok: true };
  }

  function tryLand() {
    if (g.docked || g.landed || g.cinematic) return { ok: false, reason: 'You are not in free flight.' };
    const b = targetBody();
    if (!b || b.kind !== 'planet') return { ok: false, reason: 'Select a world.' };
    const ap = approach(g.ship, b);
    if (!ap.canLand) {
      return { ok: false, reason: ap.tooFast ? 'Too fast for the heat shield. Burn retrograde until the relative speed falls.' : 'Closer. The corridor is a low, slow pass.' };
    }
    g.cinematic = { kind: 'entry', t: 0, dur: 7.2, planetId: b.id };
    g.ship.throttle = 0;
    say('Entry. The plasma will take the speed. Hold through it.');
    return { ok: true };
  }

  function takeoff() {
    if (!g.landed) return { ok: false, reason: 'You are not on a surface.' };
    if (g.ship.fuel < 0.08) return { ok: false, reason: 'Not enough propellant to climb. Refine ice into fuel.' };
    g.ship.fuel -= 0.08;
    const list = bodies();
    const p = list.find((b) => b.id === g.landed);
    const ang = Math.atan2(g.ship.y - p.y, g.ship.x - p.x) || 0.3;
    const r = p.radius * 2.8;
    const v = Math.sqrt(p.gm / r);
    g.ship.x = p.x + Math.cos(ang) * r;
    g.ship.y = p.y + Math.sin(ang) * r;
    g.ship.vx = p.vx - Math.sin(ang) * v;
    g.ship.vy = p.vy + Math.cos(ang) * v;
    g.ship.heading = Math.atan2(g.ship.vy - p.vy, g.ship.vx - p.vx);
    g.landed = null;
    g.surface = null;
    g.miner = false;
    g.nurture = null;
    g.cinematic = { kind: 'ascent', t: 0, dur: 4.8 };
    say('Climbing back to orbit.');
    return { ok: true };
  }

  function scan() {
    if (g.landed || g.docked) return { ok: false, reason: 'Probes launch from free flight.' };
    const b = targetBody();
    if (!b || b.kind !== 'planet') return { ok: false, reason: 'Select a world.' };
    const d = Math.hypot(g.ship.x - b.x, g.ship.y - b.y);
    if (d > Math.max(1.35, b.radius * 16)) return { ok: false, reason: 'Too far. Close the range and send the probe.' };
    if (!g.surveyPaid[b.id]) {
      g.surveyPaid[b.id] = true;
      g.research += 6;
    }
    g.surveyed[b.id] = true;
    const sig = beaconStrength(b.id);
    if (g.systemId === 'trappist' && !g.rescued) {
      if (sig >= 1) say('Probe down. The cutter is on this surface.');
      else if (sig > 0.2) say('A faint echo. Not this world, but a neighbour.');
      else say('No beacon on this world.');
    } else say(b.note);
    return { ok: true, signal: sig };
  }

  function cycleTarget(dir) {
    const n = sys().planets.length;
    g.target = (g.target + (dir || 1) + n) % n;
    const b = targetBody();
    say(b.name + '. ' + b.note, 5);
  }

  function cycleWarp() {
    const steps = [1, 8, 40, 200];
    const i = steps.indexOf(g.warp);
    g.warp = steps[(i + 1) % steps.length];
  }

  function canAfford(cost) {
    if ((g.research || 0) < (cost.research || 0)) return 'Need more survey data.';
    for (const k of ['iron', 'ice', 'si', 'carbon', 'xe']) {
      if ((cost[k] || 0) > (g.ship.cargo[k] || 0)) {
        return k === 'xe' ? 'Need xenon. Cold worlds keep it, and so did the cutter.' : 'Need more ' + k + '. Mine it.';
      }
    }
    return '';
  }

  function pay(cost) {
    g.research -= cost.research || 0;
    for (const k of ['iron', 'ice', 'si', 'carbon', 'xe']) {
      if (cost[k]) g.ship.cargo[k] -= cost[k];
    }
  }

  function research(id) {
    const spec = TECH.find((t) => t.id === id);
    if (!spec) return { ok: false, reason: 'Unknown foundry pattern.' };
    if (g.tech[id]) return { ok: false, reason: 'Already on the ship.' };
    for (const need of spec.needs) {
      if (need === 'rescued' && !g.rescued) return { ok: false, reason: 'The pilot\'s notes are still on the surface.' };
      if (need !== 'rescued' && !g.tech[need]) return { ok: false, reason: 'Build ' + need + ' first.' };
    }
    const why = canAfford(spec.cost);
    if (why) return { ok: false, reason: why };
    pay(spec.cost);
    g.tech[id] = true;
    if (id === 'ion') g.ship.xe = Math.max(g.ship.xe, 1.2);
    say(spec.about);
    return { ok: true };
  }

  function refine() {
    const ice = g.ship.cargo.ice || 0;
    if (ice < 0.5) return { ok: false, reason: 'No ice to split into fuel.' };
    const take = Math.min(ice, 6);
    g.ship.cargo.ice -= take;
    g.ship.fuel = Math.min(1.6, g.ship.fuel + take * 0.07);
    say(TIPS.hydrogen);
    return { ok: true };
  }

  function depart(id) {
    const dest = getSystem(id);
    if (!dest) return { ok: false, reason: 'No such system.' };
    if (dest.id === g.systemId && g.docked) return { ok: false, reason: 'You are already here.' };
    if (dest.gate && !g.tech[dest.gate]) {
      const name = { sail: 'the solar sail', ion: 'the ion drive', shield: 'magnetic shielding', ramjet: 'the fusion ramjet' }[dest.gate];
      return { ok: false, reason: 'That crossing wants ' + name + '.' };
    }
    if (!g.tech.sail && !g.tech.ramjet) return { ok: false, reason: 'Fit the sail. Chemical tanks will not cross between stars.' };
    if (g.systemId === 'trappist' && id !== 'trappist' && g.mayday != null) {
      g.mayday = null;
      g.maydayLost = true;
    }
    const cost = g.tech.ramjet ? 0.04 : 0.1;
    if (g.ship.fuel < cost) return { ok: false, reason: 'Top up the tanks before the coast.' };
    g.ship.fuel -= cost;
    g.docked = false;
    g.landed = null;
    g.surface = null;
    g.cinematic = { kind: 'depart', t: 0, dur: 8, to: id };
    say(g.tech.ramjet ? TIPS.ramjet : TIPS.sail);
    return { ok: true };
  }

  function setClimate(partial) {
    if (!g.landed) return;
    const cur = g.overrides[g.landed] || {};
    g.overrides[g.landed] = { ...cur, ...partial };
  }

  function seed() {
    if (!g.landed) return { ok: false, reason: 'Land first.' };
    const c = climateFor(g.landed);
    if (!c.habitable && !c.liquid) return { ok: false, reason: 'The climate will not hold liquid water yet.' };
    g.life[g.landed] = Math.max(g.life[g.landed] || 0, 0.18);
    g.nurture = { heat: 0.5, wet: 0.5, light: 0.45, stable: 0 };
    say('Seeded. Keep the warmth, the water, and the light in the middle of their ranges.');
    return { ok: true };
  }

  function nudge(which, dir) {
    if (!g.nurture) return;
    g.nurture[which] = Math.max(0, Math.min(1, g.nurture[which] + dir));
  }

  function hint() {
    if (g.docked) return 'LAUNCH leaves the station already in orbit of Proxima b. A and D turn. W thrusts. RETRO points you backward along your path.';
    if (g.surface && g.surface.kind === 'rescue') return 'Fly the survey bot with the stick or the arrows. The scanner blip shortens as you close. Hold RESCUE when you are on the cutter.';
    if (g.landed) return 'MINE pulls ore. The sliders change the air. REFINE turns ice into propellant. LIFT climbs back to orbit.';
    if (g.mayday != null) return 'TAB cycles worlds. SCAN sends a probe. The strong return is the cutter. Land only when LAND lights.';
    return 'PROGRADE points along your motion. RETRO points against it. A retrograde burn drops you toward the world. WARP waits, and cuts out near a world.';
  }

  function missions() {
    return [
      { id: 'shakedown', title: 'Shakedown', done: !!(g.landedOnce['proxima-b'] && g.mined.ice >= 8 && g.mined.iron >= 6) },
      { id: 'mayday', title: 'Mayday', done: !!g.rescued, locked: !g.tech.sail },
      { id: 'garden', title: 'Garden', done: g.bestLife >= 0.85, locked: !g.rescued },
      { id: 'farshore', title: 'Far Shore', done: !!g.surveyed['kepler186-f'], locked: !g.tech.ion },
      { id: 'flare', title: 'Flare Watch', done: !!(g.surveyed['gj667-b'] && g.tech.shield), locked: !g.tech.shield },
      { id: 'cousin', title: 'Cousin', done: !!g.surveyed['kepler452-b'], locked: !g.tech.ramjet }
    ];
  }

  function serialize() {
    return {
      v: 1,
      systemId: g.systemId, t: g.t, ship: g.ship, docked: g.docked, landed: g.landed,
      tech: g.tech, research: g.research, surveyed: g.surveyed, surveyPaid: g.surveyPaid,
      mined: g.mined, landedOnce: g.landedOnce, rescued: g.rescued, mayday: g.mayday,
      maydayLost: g.maydayLost, overrides: g.overrides, life: g.life, bestLife: g.bestLife,
      warp: g.warp, target: g.target, sailOn: g.sailOn, shieldOn: g.shieldOn, surface: g.surface
    };
  }

  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify(serialize())); } catch (e) { /* private mode */ }
  }

  return {
    g,
    bodies, station, targetBody, say, climateFor, look, step, launch, tryDock, tryLand, takeoff,
    scan, cycleTarget, cycleWarp, research, refine, depart, setClimate, seed, nudge, hint, missions,
    serialize, save, sys, findPlanet,
    deltaV() { return deltaV(g.ship, (DRIVES[g.ship.drive] || DRIVES.chem).ve || 1.75); },
    mass() { return shipMass(g.ship); }
  };
}

export function loadGame() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (raw && raw.v === 1) return createGame(raw);
  } catch (e) { /* ignore */ }
  return null;
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE); } catch (e) { return false; }
}

export { DRIVES, TECH, TIPS, SYSTEMS, MAYDAY };
