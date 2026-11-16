/* Real systems. Semi-major axes are derived from the star's mass and the
   published period, so the orbits agree with Kepler's law. Radii and masses
   follow the sources named in audio/CREDITS and the guide's lines: Agol 2021
   for TRAPPIST-1, and the discovery papers for the others. Masses marked
   estimated are from a rocky mass-radius guess where only a radius was measured. */
import { aFromPeriod, planetRadius, starGM, planetGM } from './sim.js';

const DAYS = 365.25;

function world(partial) {
  return partial;
}

function pack(star, planets) {
  const gm = starGM(star.mass);
  const out = planets.map((p) => {
    const aAU = p.aAU != null ? p.aAU : aFromPeriod(star.mass, p.period);
    return {
      ...p,
      aAU,
      a: aAU,
      mass: p.mass,
      radius: p.radius,
      e: p.e || 0,
      M0: p.M0 || 0,
      gmStar: gm,
      draw: planetRadius(p.radius),
      well: planetGM(p.mass)
    };
  });
  return out;
}

const proximaPlanets = pack(
  { mass: 0.1221 },
  [
    world({ id: 'proxima-d', name: 'Proxima d', period: 5.122, mass: 0.26, radius: 0.81, e: 0.04, M0: 0.4,
      rock: 1, ores: { iron: 0.45, si: 0.35, ice: 0.08, carbon: 0.1, xe: 0.02 },
      note: 'A small world on a 5-day orbit, baked by the red star.' }),
    world({ id: 'proxima-b', name: 'Proxima b', period: 11.186, mass: 1.07, radius: 1.08, e: 0.02, M0: 2.2,
      rock: 1, home: true, ores: { iron: 0.34, si: 0.28, ice: 0.28, carbon: 0.08, xe: 0.02 },
      note: 'At least 1.07 Earth masses, on an 11.2-day orbit. It keeps one face toward the star.' }),
    world({ id: 'proxima-c', name: 'Proxima c', period: 1928, mass: 7, radius: 1.8, e: 0.1, M0: 1.1,
      rock: 0, ores: { iron: 0.1, si: 0.1, ice: 0.62, carbon: 0.05, xe: 0.13 },
      note: 'A cold super-Earth on a roughly five-year orbit. The mass is a minimum.' })
  ]
);

const trappistPlanets = pack(
  { mass: 0.0898 },
  [
    world({ id: 'trappist-b', name: 'TRAPPIST-1 b', period: 1.510876, mass: 1.374, radius: 1.116, M0: 0.2,
      rock: 1, ores: { iron: 0.5, si: 0.32, ice: 0.05, carbon: 0.1, xe: 0.03 },
      note: 'The innermost. A day and a half long, and hot.' }),
    world({ id: 'trappist-c', name: 'TRAPPIST-1 c', period: 2.421807, mass: 1.308, radius: 1.097, M0: 1.0,
      rock: 1, ores: { iron: 0.46, si: 0.32, ice: 0.08, carbon: 0.1, xe: 0.04 },
      note: 'Still well inside the liquid-water zone. A hot rock.' }),
    world({ id: 'trappist-d', name: 'TRAPPIST-1 d', period: 4.049959, mass: 0.388, radius: 0.788, M0: 2.4,
      rock: 1, ores: { iron: 0.3, si: 0.28, ice: 0.18, carbon: 0.2, xe: 0.04 },
      note: 'The smallest of the seven. A whisper of a beacon can bounce off it.' }),
    world({ id: 'trappist-e', name: 'TRAPPIST-1 e', period: 6.099043, mass: 0.692, radius: 0.92, M0: 3.5,
      rock: 1, beacon: 1, ores: { iron: 0.3, si: 0.26, ice: 0.28, carbon: 0.12, xe: 0.04 },
      note: 'Earth-sized, in the temperate band. The distress call is strongest here.' }),
    world({ id: 'trappist-f', name: 'TRAPPIST-1 f', period: 9.20669, mass: 1.039, radius: 1.045, M0: 4.6,
      rock: 1, beacon: 0.34, ores: { iron: 0.28, si: 0.24, ice: 0.32, carbon: 0.12, xe: 0.04 },
      note: 'A little larger than Earth, near the outer temperate edge.' }),
    world({ id: 'trappist-g', name: 'TRAPPIST-1 g', period: 12.35294, mass: 1.321, radius: 1.129, M0: 5.4,
      rock: 1, ores: { iron: 0.26, si: 0.24, ice: 0.36, carbon: 0.1, xe: 0.04 },
      note: 'The heaviest of the seven. Cool, and possibly icy.' }),
    world({ id: 'trappist-h', name: 'TRAPPIST-1 h', period: 18.767, mass: 0.326, radius: 0.755, M0: 0.7,
      rock: 1, ores: { iron: 0.12, si: 0.16, ice: 0.55, carbon: 0.05, xe: 0.12 },
      note: 'The outer small world. Cold enough that noble gases freeze into the rock.' })
  ]
);

const k186Planets = pack(
  { mass: 0.544 },
  [
    world({ id: 'kepler186-b', name: 'Kepler-186 b', period: 3.887, mass: 1.3, radius: 1.07, massEst: true, M0: 0.5,
      rock: 1, ores: { iron: 0.48, si: 0.34, ice: 0.06, carbon: 0.1, xe: 0.02 },
      note: 'Innermost of five. The radius is measured. The mass is estimated.' }),
    world({ id: 'kepler186-c', name: 'Kepler-186 c', period: 7.267, mass: 1.9, radius: 1.25, massEst: true, M0: 1.6,
      rock: 1, ores: { iron: 0.44, si: 0.34, ice: 0.08, carbon: 0.12, xe: 0.02 },
      note: 'A larger hot world on a week-long orbit.' }),
    world({ id: 'kepler186-d', name: 'Kepler-186 d', period: 13.343, mass: 2.5, radius: 1.39, massEst: true, M0: 2.5,
      rock: 1, ores: { iron: 0.4, si: 0.32, ice: 0.12, carbon: 0.14, xe: 0.02 },
      note: 'The largest of the inner worlds.' }),
    world({ id: 'kepler186-e', name: 'Kepler-186 e', period: 22.408, mass: 2.1, radius: 1.27, massEst: true, M0: 4.0,
      rock: 1, ores: { iron: 0.36, si: 0.3, ice: 0.18, carbon: 0.14, xe: 0.02 },
      note: 'Still interior to the temperate world.' }),
    world({ id: 'kepler186-f', name: 'Kepler-186 f', period: 129.946, mass: 1.44, radius: 1.17, massEst: true, M0: 2.0,
      rock: 1, ores: { iron: 0.28, si: 0.26, ice: 0.3, carbon: 0.12, xe: 0.04 },
      note: 'Near the outer edge of the liquid-water zone. About a third of Earth\'s sunlight.' })
  ]
);

const gjPlanets = pack(
  { mass: 0.33 },
  [
    world({ id: 'gj667-b', name: 'GJ 667 C b', period: 7.2, mass: 5.6, radius: 1.7, massEst: true, M0: 0.9,
      rock: 1, ores: { iron: 0.42, si: 0.3, ice: 0.12, carbon: 0.12, xe: 0.04 },
      note: 'A heavy inner world. The star flares. Minimum mass about 5.6 Earths.' }),
    world({ id: 'gj667-c', name: 'GJ 667 C c', period: 28.14, mass: 3.8, radius: 1.54, massEst: true, M0: 2.6,
      rock: 1, ores: { iron: 0.3, si: 0.26, ice: 0.26, carbon: 0.14, xe: 0.04 },
      note: 'In the temperate band, with about nine-tenths of Earth\'s sunlight. Minimum mass about 3.8 Earths.' })
  ]
);

const k452Planets = pack(
  { mass: 1.04 },
  [
    world({ id: 'kepler452-b', name: 'Kepler-452 b', period: 384.84, aAU: 1.046, mass: 5, radius: 1.63, massEst: true, M0: 1.4,
      rock: 1, ores: { iron: 0.32, si: 0.28, ice: 0.22, carbon: 0.14, xe: 0.04 },
      note: 'A larger cousin on a 385-day orbit around a Sun-like star. About ten percent more sunlight than Earth.' })
  ]
);

export const SYSTEMS = [
  {
    id: 'proxima',
    name: 'Proxima Centauri',
    gate: null,
    blurb: 'The nearest star, 4.24 light years out. A cool red dwarf.',
    star: { mass: 0.1221, L: 0.001567, teff: 2992, spectral: 'M5.5', radius: 0.154 },
    planets: proximaPlanets,
    flare: 0,
    nebula: [0.45, 0.16, 0.08]
  },
  {
    id: 'trappist',
    name: 'TRAPPIST-1',
    gate: 'sail',
    blurb: 'Seven worlds, all closer to their star than Mercury is to the Sun.',
    star: { mass: 0.0898, L: 0.000553, teff: 2566, spectral: 'M8', radius: 0.119 },
    planets: trappistPlanets,
    flare: 0,
    nebula: [0.42, 0.1, 0.12]
  },
  {
    id: 'kepler186',
    name: 'Kepler-186',
    gate: 'ion',
    blurb: 'A quiet red dwarf with a temperate world at the outer edge.',
    star: { mass: 0.544, L: 0.055, teff: 3755, spectral: 'M1', radius: 0.52 },
    planets: k186Planets,
    flare: 0,
    nebula: [0.18, 0.16, 0.28]
  },
  {
    id: 'gj667',
    name: 'GJ 667 C',
    gate: 'shield',
    blurb: 'The faintest star of a triple. It flares. Two worlds here have held up.',
    star: { mass: 0.33, L: 0.0137, teff: 3600, spectral: 'M1.5', radius: 0.42 },
    planets: gjPlanets,
    flare: 1,
    nebula: [0.35, 0.12, 0.1]
  },
  {
    id: 'kepler452',
    name: 'Kepler-452',
    gate: 'ramjet',
    blurb: 'A Sun-like star, and one larger world with a little more light than Earth.',
    star: { mass: 1.04, L: 1.2, teff: 5757, spectral: 'G2', radius: 1.11 },
    planets: k452Planets,
    flare: 0,
    nebula: [0.12, 0.16, 0.32]
  }
];

export function getSystem(id) {
  return SYSTEMS.find((s) => s.id === id) || SYSTEMS[0];
}

export function getPlanet(id) {
  for (const s of SYSTEMS) {
    const p = s.planets.find((q) => q.id === id);
    if (p) return { system: s, planet: p };
  }
  return null;
}

export const DRIVES = {
  chem: {
    id: 'chem', name: 'Chemical', thrust: 0.11, ve: 1.75, fuel: 'prop',
    tip: 'Burning fuel you carry. Strong for a short time. The tanks are the limit.'
  },
  ion: {
    id: 'ion', name: 'Ion', thrust: 0.034, ve: 7.2, fuel: 'xe',
    tip: 'An ion drive throws xenon very fast. The push is gentle. The delta-v, for the fuel you spend, is large.'
  },
  sail: {
    id: 'sail', name: 'Solar sail', thrust: 0, ve: 0, fuel: 'none',
    tip: 'A solar sail pushes on light. The push falls with the square of distance, and a dim red star gives only a small one.'
  },
  ramjet: {
    id: 'ramjet', name: 'Fusion ramjet', thrust: 0.14, ve: 8.5, fuel: 'prop',
    tip: 'A ramjet would scoop interstellar hydrogen and burn it. No one has built one. Here, the tanks last.'
  }
};

export const TECH = [
  {
    id: 'sail', name: 'Solar sail', needs: [],
    cost: { iron: 6, ice: 8, research: 8 },
    about: 'A mirrored sheet, kilometres wide. Sunlight pushes it. Between stars, you carry no fuel for the coast.'
  },
  {
    id: 'ion', name: 'Ion drive', needs: ['rescued'],
    cost: { xe: 4, iron: 6, research: 16 },
    about: 'Xenon ions leave the ship at tens of kilometres a second. Thrust is a whisper. Range is not.'
  },
  {
    id: 'shield', name: 'Magnetic shield', needs: [],
    cost: { iron: 12, si: 8, research: 18 },
    about: 'A magnetic field turns charged particles aside. It does not stop light, or neutral dust.'
  },
  {
    id: 'nano', name: 'Nanotech fabricator', needs: ['rescued'],
    cost: { carbon: 8, si: 6, research: 14 },
    about: 'Cell-sized factories. They do not remake a planet in an afternoon. They make the machines you have faster, and less wasteful.'
  },
  {
    id: 'ramjet', name: 'Fusion ramjet', needs: ['ion'],
    cost: { ice: 16, iron: 10, research: 28 },
    about: 'Scoop hydrogen from the dark and fuse it. Hypothetical, and the only engine here that makes the Sun-like stars a day\'s flight.'
  },
  {
    id: 'dark', name: 'Dark-matter scoop', needs: ['ramjet'],
    cost: { research: 36 },
    about: 'Dark matter is mass we infer and cannot see. A scoop for it is a story told ahead of the evidence. Aboard, it is only a slow trickle of power.'
  }
];

export const TIPS = {
  proxima: 'Proxima Centauri is 4.24 light years away, a cool red dwarf. Proxima b receives about two-thirds of Earth\'s sunlight and keeps one face toward the star.',
  trappist: 'All seven TRAPPIST-1 worlds orbit closer than Mercury orbits the Sun. The star is so dim that several can still sit in the liquid-water zone.',
  kepler186: 'Kepler-186 f receives roughly a third of the light Earth does. It sits near the outer edge of the temperate zone.',
  gj667: 'GJ 667 C is the dim member of a triple star. World c gets a little less light than Earth. The star flares.',
  kepler452: 'Kepler-452 b circles a Sun-like star in 385 days, with about a tenth more sunlight than Earth. The world itself is larger.',
  sling: 'A slingshot steals a little of a planet\'s orbital speed. Come in behind its motion and you leave faster than you arrived.',
  sail: 'A solar sail pushes on sunlight. Around a dim red dwarf the push is small. The sail earns its keep on the long coast between stars.',
  ion: 'An ion drive throws its propellant very fast. Thrust is gentle. Delta-v, for the mass you spend, is large.',
  ramjet: 'A fusion ramjet would scoop interstellar hydrogen and burn it. Nobody has flown one. It is the engine that stops you carrying every kilogram of fuel.',
  shield: 'Magnetic shielding deflects charged particles from a flare. Light, and neutral dust, come straight through.',
  nano: 'Nanotech here is a small factory, not a miracle. It speeds the fabricators that mine, refine, and tend a young ecology.',
  dark: 'Dark matter is a name for unseen mass. The scoop is speculative. It trickles a little power from the galactic halo, and that is all.',
  hydrogen: 'The ice you mine is hydrogen and oxygen locked together. Split it, and the hydrogen is chemical fuel. A star does the same chemistry, hotter.',
  orbit: 'In a circular orbit you are always falling, and always missing the ground. Burn backward, against your motion, and the ground rises to meet you.',
  retrograde: 'Retrograde is the direction opposite your path. A burn there drops your orbit. A burn the other way, prograde, raises it.',
  greenhouse: 'A thicker carbon dioxide blanket holds heat. Earth\'s air adds about 33 degrees to the temperature the sunlight alone would give.',
  hz: 'The habitable zone is the band of orbits where a world with a reasonable air could keep liquid water. Too close, and the water boils away. Too far, and it freezes.',
  locked: 'A tidally locked world keeps one face in daylight. The twilight line, the terminator, is the mildest place to stand.'
};

export const MISSIONS = [
  {
    id: 'shakedown', title: 'Shakedown', system: 'proxima',
    text: 'Leave Infinity Command. Fall from orbit and land on Proxima b. Mine ice and iron for the sail foundry.',
    done: (g) => g.landedOnce['proxima-b'] && g.mined.ice >= 8 && g.mined.iron >= 6
  },
  {
    id: 'mayday', title: 'Mayday', system: 'trappist', needs: ['sail'],
    text: 'A cutter is down somewhere in TRAPPIST-1. Dock is behind you. Scan the seven worlds, land, and bring the pilot up with the survey bot before the cells die.',
    done: (g) => g.rescued
  },
  {
    id: 'garden', title: 'Garden', system: 'trappist', needs: ['rescued'],
    text: 'The pilot\'s kit can change a world\'s air, water, and warmth. Make one TRAPPIST world able to hold liquid water, then keep a seeded ecology alive.',
    done: (g) => g.bestLife >= 0.85
  },
  {
    id: 'farshore', title: 'Far Shore', system: 'kepler186', needs: ['ion'],
    text: 'Kepler-186 f sits at the outer edge of the temperate zone. Survey it from close orbit.',
    done: (g) => !!g.surveyed['kepler186-f']
  },
  {
    id: 'flare', title: 'Flare Watch', system: 'gj667', needs: ['shield'],
    text: 'GJ 667 C flares. Raise the magnetic shield, skim the inner world, and bring the particle counts home.',
    done: (g) => !!g.surveyed['gj667-b'] && g.tech.shield
  },
  {
    id: 'cousin', title: 'Cousin', system: 'kepler452', needs: ['ramjet'],
    text: 'Kepler-452 b circles a Sun-like star. Read it from orbit and log the system.',
    done: (g) => !!g.surveyed['kepler452-b']
  }
];

export function beaconStrength(id) {
  if (id === 'trappist-e') return 1;
  if (id === 'trappist-d' || id === 'trappist-f') return 0.36;
  if (id && id.indexOf('trappist-') === 0) return 0.08;
  return 0;
}
