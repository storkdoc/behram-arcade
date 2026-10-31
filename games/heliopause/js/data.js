/* HELIOPAUSE — game data: bodies, sites, structures, aliens, research, sectors.
   Pure data; shared by the browser and the headless balance harness. */
(function (root) {
'use strict';
var TAU = Math.PI * 2;

/* ---- Bodies (world units; orbital periods in game seconds; time only flows during waves) ---- */
var BODIES = [
  { id: 'sun', name: 'SOL', orbit: 0, period: 1, a0: 0, size: 20 },
  { id: 'mercury', name: 'MERCURY', orbit: 62, period: 96, a0: 0.4, size: 4, col: '#b9a99a' },
  { id: 'venus', name: 'VENUS', orbit: 92, period: 160, a0: 2.3, size: 6.5, col: '#e8c98a' },
  { id: 'earth', name: 'EARTH', orbit: 128, period: 260, a0: 4.2, size: 8.5, col: '#4d8fe0' },
  { id: 'moon', name: 'LUNA', parent: 'earth', orbit: 19, period: 38, a0: 0, size: 2.6, col: '#cfcfd4' },
  { id: 'mars', name: 'MARS', orbit: 170, period: 400, a0: 5.2, size: 5, col: '#d0643a' },
  { id: 'vesta', name: 'VESTA', orbit: 204, period: 520, a0: 3.3, size: 1.8, col: '#a79c8f', rock: 1 },
  { id: 'ceres', name: 'CERES', orbit: 216, period: 560, a0: 4.9, size: 2.4, col: '#9d978f', rock: 1 },
  { id: 'pallas', name: 'PALLAS', orbit: 228, period: 610, a0: 0.9, size: 1.8, col: '#a89f93', rock: 1 },
  { id: 'hygiea', name: 'HYGIEA', orbit: 240, period: 650, a0: 2.0, size: 1.7, col: '#8f8a84', rock: 1 },
  { id: 'jupiter', name: 'JUPITER', orbit: 292, period: 1150, a0: 3.75, size: 17, col: '#d9b38c' },
  { id: 'io', name: 'IO', parent: 'jupiter', orbit: 25, period: 20, a0: 0.5, size: 2, col: '#e8d36a' },
  { id: 'europa', name: 'EUROPA', parent: 'jupiter', orbit: 31, period: 30, a0: 2.2, size: 1.9, col: '#d8cfc0' },
  { id: 'ganymede', name: 'GANYMEDE', parent: 'jupiter', orbit: 38, period: 44, a0: 3.9, size: 2.5, col: '#a59a8c' },
  { id: 'callisto', name: 'CALLISTO', parent: 'jupiter', orbit: 46, period: 64, a0: 5.3, size: 2.3, col: '#7d7468' },
  { id: 'jl4', name: 'TROJANS (L4)', lag: 'jupiter', ang: 1.0472, size: 0, col: '#998' },
  { id: 'jl5', name: 'GREEKS (L5)', lag: 'jupiter', ang: -1.0472, size: 0, col: '#998' },
  { id: 'saturn', name: 'SATURN', orbit: 352, period: 1600, a0: 0.95, size: 14, col: '#e3cf9a', rings: 1 },
  { id: 'enceladus', name: 'ENCELADUS', parent: 'saturn', orbit: 31, period: 26, a0: 1.0, size: 1.5, col: '#f2f5f8' },
  { id: 'rhea', name: 'RHEA', parent: 'saturn', orbit: 37, period: 36, a0: 3.0, size: 1.8, col: '#c9c6c0' },
  { id: 'titan', name: 'TITAN', parent: 'saturn', orbit: 45, period: 52, a0: 5.0, size: 2.6, col: '#d9a54e' },
  { id: 'uranus', name: 'URANUS', orbit: 405, period: 2200, a0: 5.6, size: 10, col: '#9fe0e6' },
  { id: 'titania', name: 'TITANIA', parent: 'uranus', orbit: 20, period: 30, a0: 1, size: 1.6, col: '#bdb7ae' },
  { id: 'neptune', name: 'NEPTUNE', orbit: 452, period: 2700, a0: 2.2, size: 9.5, col: '#4a6fe8' },
  { id: 'triton', name: 'TRITON', parent: 'neptune', orbit: 19, period: 34, a0: 4, size: 1.6, col: '#d6c9c4' },
  { id: 'pluto', name: 'PLUTO', orbit: 492, period: 3400, a0: 0.5, size: 2.2, col: '#c9ad92' },
  { id: 'el4', name: 'EARTH L4', lag: 'earth', ang: 1.0472, size: 0, col: '#89a' },
  { id: 'el5', name: 'EARTH L5', lag: 'earth', ang: -1.0472, size: 0, col: '#89a' }
];
var BODY = {}; BODIES.forEach(function (b) { BODY[b.id] = b; });
var EARTH_R = 128, HELIO_R = 545;

/* ---- Build sites. kinds: T = weapons/defence, M = mine, S = solar, L = lab.
   reach: research needed to deploy there (null = from the start). yield multipliers per economy type. */
var SITES = [
  { id: 'eo1', body: 'earth', off: [15, -0.6], kinds: 'TSL', reach: null, name: 'EARTH ORBIT · NORTH' },
  { id: 'eo2', body: 'earth', off: [15, 0.97], kinds: 'TSL', reach: null, name: 'EARTH ORBIT · EAST' },
  { id: 'eo3', body: 'earth', off: [15, 2.54], kinds: 'TSL', reach: null, name: 'EARTH ORBIT · SOUTH' },
  { id: 'eo4', body: 'earth', off: [15, 4.11], kinds: 'TSL', reach: null, name: 'EARTH ORBIT · WEST' },
  { id: 'lu1', body: 'moon', off: [4.6, 0], kinds: 'TMSL', reach: null, y: { M: 1.0, L: 1.0 }, name: 'LUNA · TYCHO' },
  { id: 'lu2', body: 'moon', off: [4.6, Math.PI], kinds: 'TMSL', reach: null, y: { M: 1.0, L: 1.0 }, name: 'LUNA · CLAVIUS' },
  { id: 'el4', body: 'el4', off: [0, 0], kinds: 'TSL', reach: null, name: 'EARTH L4' },
  { id: 'el5', body: 'el5', off: [0, 0], kinds: 'TSL', reach: null, name: 'EARTH L5' },
  { id: 've1', body: 'venus', off: [10, 0.8], kinds: 'TSL', reach: null, y: { L: 0.8 }, name: 'VENUS · CLOUD CITY' },
  { id: 've2', body: 'venus', off: [10, 3.9], kinds: 'TSL', reach: null, y: { L: 0.8 }, name: 'VENUS · ISHTAR' },
  { id: 'ma1', body: 'mars', off: [8.5, 1.2], kinds: 'TMSL', reach: null, y: { M: 1.15, L: 1.1 }, name: 'MARS · THARSIS' },
  { id: 'ma2', body: 'mars', off: [8.5, 4.3], kinds: 'TMSL', reach: null, y: { M: 1.15, L: 1.1 }, name: 'MARS · HELLAS' },
  { id: 'me1', body: 'mercury', off: [7, 2], kinds: 'TMS', reach: 'P1', y: { M: 1.2 }, name: 'MERCURY · CALORIS' },
  { id: 'ce1', body: 'ceres', off: [0, 0], kinds: 'TM', reach: 'P1', y: { M: 1.7 }, name: 'CERES' },
  { id: 'vs1', body: 'vesta', off: [0, 0], kinds: 'TM', reach: 'P1', y: { M: 1.6 }, name: 'VESTA' },
  { id: 'pa1', body: 'pallas', off: [0, 0], kinds: 'TM', reach: 'P1', y: { M: 1.6 }, name: 'PALLAS' },
  { id: 'hy1', body: 'hygiea', off: [0, 0], kinds: 'TM', reach: 'P1', y: { M: 1.5 }, name: 'HYGIEA' },
  { id: 'io1', body: 'io', off: [0, 0], kinds: 'TM', reach: 'P3', y: { M: 1.8 }, name: 'IO' },
  { id: 'eu1', body: 'europa', off: [0, 0], kinds: 'TML', reach: 'P3', y: { M: 0.8, L: 2.2 }, name: 'EUROPA' },
  { id: 'ga1', body: 'ganymede', off: [0, 0], kinds: 'TML', reach: 'P3', y: { M: 1.2, L: 1.2 }, name: 'GANYMEDE' },
  { id: 'ca1', body: 'callisto', off: [0, 0], kinds: 'TML', reach: 'P3', y: { M: 1.2, L: 1.0 }, name: 'CALLISTO' },
  { id: 'jt4', body: 'jl4', off: [0, 0], kinds: 'TM', reach: 'P3', y: { M: 1.9 }, name: 'JUPITER TROJANS' },
  { id: 'jt5', body: 'jl5', off: [0, 0], kinds: 'TM', reach: 'P3', y: { M: 1.9 }, name: 'JUPITER GREEKS' },
  { id: 'en1', body: 'enceladus', off: [0, 0], kinds: 'TL', reach: 'P3', y: { L: 2.0 }, name: 'ENCELADUS' },
  { id: 'rh1', body: 'rhea', off: [0, 0], kinds: 'TM', reach: 'P3', y: { M: 1.3 }, name: 'RHEA' },
  { id: 'ti1', body: 'titan', off: [0, 0], kinds: 'TML', reach: 'P3', y: { M: 1.0, L: 1.8 }, name: 'TITAN' },
  { id: 'ur1', body: 'titania', off: [0, 0], kinds: 'TM', reach: 'P5', y: { M: 1.6 }, name: 'TITANIA' },
  { id: 'ne1', body: 'triton', off: [0, 0], kinds: 'TML', reach: 'P5', y: { M: 1.5, L: 1.5 }, name: 'TRITON' },
  { id: 'pl1', body: 'pluto', off: [0, 0], kinds: 'TM', reach: 'P5', y: { M: 1.8 }, name: 'PLUTO · KUIPER GATE' }
];
var SITE = {}; SITES.forEach(function (s) { SITE[s.id] = s; });

/* ---- Structures. lv[0] is the base build; lv[1], lv[2] upgrades (c = cost); br = tier-4 branch choice. ---- */
var TOWERS = {
  rail: { name: 'RAILGUN', short: 'RAIL', cls: 'kin', kind: 'T', cost: 60, pw: 2, req: null, col: '#9fd8ff',
    blurb: 'Kinetic slugs at long range. Reliable single-target damage; punches through armour.',
    lv: [{ dmg: 24, rate: 0.8, rng: 74 }, { c: 55, dmg: 38, rate: 0.85, rng: 80 }, { c: 95, dmg: 56, rate: 0.9, rng: 86 }],
    br: { A: { name: 'MASS DRIVER', c: 175, dmg: 200, rate: 0.45, rng: 125, pierce: 1, blurb: 'Huge, slow, armour-piercing shots from far away.' },
          B: { name: 'GAUSS BATTERY', c: 175, dmg: 40, rate: 3.2, rng: 88, blurb: 'Rapid fire. Shreds cruisers and swarms; weak vs. heavy armour.' } } },
  missile: { name: 'MISSILE BATTERY', short: 'MSL', cls: 'exp', kind: 'T', cost: 75, pw: 2, req: null, col: '#ffcf7a',
    blurb: 'Homing warheads with splash damage. The answer to swarms.',
    lv: [{ dmg: 24, rate: 0.55, rng: 90, spl: 16 }, { c: 65, dmg: 38, rate: 0.6, rng: 94, spl: 18 }, { c: 100, dmg: 56, rate: 0.65, rng: 98, spl: 20 }],
    br: { A: { name: 'CLUSTER SWARM', c: 180, dmg: 30, rate: 0.7, rng: 104, spl: 14, n: 5, blurb: 'Five warheads per salvo at different targets.' },
          B: { name: 'NOVA WARHEAD', c: 190, dmg: 210, rate: 0.38, rng: 106, spl: 34, blurb: 'One enormous blast. Devastating on packs.' } } },
  laser: { name: 'LASER ARRAY', short: 'LSR', cls: 'las', kind: 'T', cost: 80, pw: 3, req: 'W1', col: '#ff7fa8',
    blurb: 'Continuous beam. Melts shields; weak against armour and useless against Prisms.',
    lv: [{ dps: 30, rng: 58 }, { c: 70, dps: 48, rng: 62 }, { c: 110, dps: 70, rng: 66 }],
    br: { A: { name: 'PHASER LATTICE', c: 180, dps: 76, rng: 68, chain: 3, blurb: 'Beam forks to two more nearby targets.' },
          B: { name: 'DEATH RAY', c: 180, dps: 84, rng: 72, ramp: 3, blurb: 'Ramps up to triple damage while locked on one target.' } } },
  grav: { name: 'GRAVITY WELL', short: 'GRV', cls: 'grav', kind: 'T', cost: 70, pw: 2, req: 'P2', col: '#b99cff',
    blurb: 'Bends spacetime: everything inside is slowed. Pair it with damage.',
    lv: [{ slow: 0.35, dps: 3, rng: 46 }, { c: 60, slow: 0.45, dps: 5, rng: 52 }, { c: 90, slow: 0.52, dps: 8, rng: 58 }],
    br: { A: { name: 'SINGULARITY', c: 170, slow: 0.5, dps: 42, rng: 58, pull: 14, blurb: 'Drags invaders into a crushing core.' },
          B: { name: 'TIME DILATION', c: 170, slow: 0.7, dps: 8, rng: 76, blurb: 'A vast field where time nearly stops.' } } },
  emp: { name: 'EMP ARRAY', short: 'EMP', cls: 'emp', kind: 'T', cost: 90, pw: 3, req: 'S2', col: '#7fffe0',
    blurb: 'Area pulses that rip shields away and stun small craft.',
    lv: [{ dmg: 14, rate: 0.34, rng: 52, stun: 0.8 }, { c: 70, dmg: 22, rate: 0.38, rng: 56, stun: 1 }, { c: 100, dmg: 32, rate: 0.42, rng: 60, stun: 1.2 }],
    br: { A: { name: 'ION STORM', c: 180, dmg: 40, rate: 0.85, rng: 66, stun: 1, blurb: 'Pulses twice as often.' },
          B: { name: 'NEURAL SCRAMBLER', c: 180, dmg: 30, rate: 0.42, rng: 66, stun: 1, confuse: 2.4, blurb: 'Pulses turn invaders around for a moment.' } } },
  lance: { name: 'SOLAR LANCE', short: 'SOL', cls: 'sol', kind: 'T', cost: 150, pw: 0, req: 'W4', col: '#fff1a8',
    blurb: 'Orbital mirrors focus sunlight. Needs no power; far stronger close to the Sun.',
    lv: [{ dps: 30, rng: 112 }, { c: 110, dps: 46, rng: 122 }, { c: 150, dps: 66, rng: 132 }],
    br: { A: { name: 'HELIOS SPEAR', c: 240, dps: 80, rng: 155, pierce: 1, blurb: 'The beam pierces everything along its line.' },
          B: { name: 'CORONA', c: 240, dps: 70, rng: 138, burn: 30, blurb: 'Sets targets burning for 3 s.' } } },
  aegis: { name: 'AEGIS SHIELD', short: 'AEG', cls: 'def', kind: 'T', cost: 100, pw: 3, req: 'S1', col: '#8fb8ff',
    blurb: 'Adds to Earth\'s shield if near Earth, and protects structures in its bubble.',
    lv: [{ sh: 25, rng: 42 }, { c: 80, sh: 40, rng: 48 }, { c: 110, sh: 60, rng: 54 }],
    br: { A: { name: 'BASTION', c: 180, sh: 115, rng: 58, blurb: 'A massive shield reserve.' },
          B: { name: 'REFLECTOR', c: 180, sh: 60, rng: 58, reflect: 70, blurb: 'Anything that strikes the shield is struck back.' } } },
  carrier: { name: 'INTERCEPTOR CARRIER', short: 'CAR', cls: 'kin', kind: 'T', cost: 160, pw: 4, req: 'P4', col: '#c8ffb0',
    blurb: 'Launches interceptor craft that hunt over a huge radius.',
    lv: [{ n: 3, dmg: 9, rate: 2, rng: 115 }, { c: 110, n: 4, dmg: 11, rate: 2, rng: 120 }, { c: 150, n: 5, dmg: 14, rate: 2, rng: 125 }],
    br: { A: { name: 'STRIKE WING', c: 220, n: 8, dmg: 14, rate: 2.2, rng: 130, blurb: 'Eight fast interceptors.' },
          B: { name: 'TORPEDO BOMBERS', c: 220, n: 4, dmg: 70, rate: 0.6, rng: 130, cls: 'exp', blurb: 'Heavy bombers with explosive torpedoes.' } } },
  radar: { name: 'DEEP SPACE RADAR', short: 'RDR', cls: 'def', kind: 'T', cost: 50, pw: 1, req: 'S3', col: '#a0ffc8',
    blurb: 'Reveals cloaked Phantoms; nearby towers gain +15% range.',
    lv: [{ rng: 120 }, { c: 40, rng: 150 }, { c: 60, rng: 185 }] },
  mine: { name: 'MINING OUTPOST', short: 'MINE', cls: 'eco', kind: 'M', cost: 80, pw: 1, req: null, col: '#ffb070',
    blurb: 'Extracts metals while a wave is under way. Asteroids and Jovian Trojans are richest.',
    lv: [{ y: 0.65 }, { c: 70, y: 1.0 }, { c: 110, y: 1.45 }] },
  solar: { name: 'SOLAR ARRAY', short: 'SUN', cls: 'eco', kind: 'S', cost: 55, pw: 0, req: null, col: '#ffe680',
    blurb: 'Raises the energy grid that powers towers. Much stronger close to the Sun.',
    lv: [{ e: 6 }, { c: 50, e: 9 }, { c: 80, e: 13 }] },
  lab: { name: 'RESEARCH STATION', short: 'LAB', cls: 'eco', kind: 'L', cost: 85, pw: 1, req: null, col: '#9cf',
    blurb: 'Produces science. Europa, Enceladus and Titan hide oceans worth studying.',
    lv: [{ s: 0.22 }, { c: 70, s: 0.36 }, { c: 110, s: 0.52 }] }
};
var TOWER_ORDER = ['rail', 'missile', 'laser', 'grav', 'emp', 'lance', 'aegis', 'carrier', 'radar', 'mine', 'solar', 'lab'];

/* ---- Invaders. res: damage multipliers by class (kin las exp emp grav sol). ---- */
var ALIENS = {
  drone: { name: 'SWARMER', hp: 15, spd: 27, dmg: 1, cost: 0.7, r: 2.6, bounty: 2, sci: 0.15, col: '#7dffb2',
    info: 'Tiny and numerous. Splash damage clears them.' },
  raider: { name: 'RAIDER', hp: 42, spd: 44, dmg: 2, cost: 3.2, r: 3.2, bounty: 5, sci: 0.3, col: '#ffd84a', raid: 1,
    info: 'Very fast. Hunts your outposts before Earth.' },
  cruiser: { name: 'CRUISER', hp: 95, spd: 19, dmg: 3, cost: 4, r: 4.2, bounty: 6, sci: 0.4, col: '#ff6fcf',
    info: 'The line ship of the Choir. Balanced and relentless.' },
  aegis: { name: 'WARDEN', hp: 120, sh: 170, shr: 14, spd: 17, dmg: 4, cost: 8, r: 4.8, bounty: 12, sci: 0.8, col: '#6fb6ff',
    info: 'Regenerating shield. Lasers and EMP strip it; slugs glance off.' },
  dread: { name: 'DREADNOUGHT', hp: 440, spd: 10, dmg: 10, cost: 16, r: 7.5, bounty: 26, sci: 2, col: '#ff8a4a',
    res: { las: 0.45, exp: 0.7, kin: 1.1, sol: 0.7 }, info: 'Heavy armour. Kinetic weapons and Mass Drivers break it.' },
  phantom: { name: 'PHANTOM', hp: 72, spd: 25, dmg: 4, cost: 6, r: 3.6, bounty: 10, sci: 0.9, col: '#c2a3ff', cloak: 1,
    info: 'Cloaked. Invisible to towers unless revealed by radar or close to Earth.' },
  hydra: { name: 'HYDRA', hp: 170, spd: 15, dmg: 3, cost: 9, r: 6, bounty: 10, sci: 0.9, col: '#a6ff4a', split: 3,
    info: 'Splits into three Swarmers when destroyed.' },
  mender: { name: 'MENDER', hp: 115, spd: 15, dmg: 2, cost: 9, r: 4.6, bounty: 14, sci: 1.2, col: '#5effe8', heal: 13,
    info: 'Heals nearby invaders. Kill it first.' },
  prism: { name: 'PRISM', hp: 160, spd: 20, dmg: 4, cost: 8, r: 4.6, bounty: 11, sci: 0.9, col: '#ffffff',
    res: { las: 0.08, sol: 0.35, kin: 1.3 }, info: 'Mirror hull reflects beams. Use kinetics and missiles.' },
  carrier: { name: 'HIVE CARRIER', hp: 620, spd: 9, dmg: 8, cost: 22, r: 9, bounty: 38, sci: 3, col: '#ff4a8a', spawn: 'drone', spawnT: 4.5,
    info: 'A living hangar. Releases Swarmers until destroyed.' },
  siege: { name: 'BOMBARD', hp: 270, spd: 14, dmg: 5, cost: 14, r: 6.5, bounty: 22, sci: 1.6, col: '#ff5a3a', siege: 74,
    info: 'Stops at long range and shells Earth. Must be hunted down.' },
  leviathan: { name: 'LEVIATHAN WORLD-SHIP', hp: 6200, spd: 5.5, dmg: 40, cost: 120, r: 16, bounty: 300, sci: 30, col: '#ff7a3a', boss: 1,
    res: { las: 0.6, exp: 0.8 }, spawn: 'cruiser', spawnT: 6.5, info: 'A moon-sized ark. Births cruisers as it comes.' },
  monolith: { name: 'THE SENTINEL', hp: 9500, spd: 4.8, dmg: 60, cost: 160, r: 12, bounty: 450, sci: 45, col: '#e8e8ff', boss: 1, mono: 1,
    info: 'A black slab of perfect proportion. It only opens for a moment — strike then. Its pulse silences towers.' },
  elder: { name: 'THE FIRST CHOIR', hp: 9000, spd: 4.2, dmg: 999, cost: 300, r: 18, bounty: 1000, sci: 100, col: '#ffffff', boss: 1, mono: 1, elder: 1,
    spawn: 'phantom', spawnT: 5, info: 'The intelligence behind the invasion. If it reaches Earth, everything ends.' }
};

/* ---- Research. cost in science. cat: W weapons, P propulsion/fields, E economy, S shields & sensors,
   D doctrine (pick one), X super-weapon (pick one), B xenobiology (needs specimens). ---- */
var RESEARCH = [
  { id: 'W1', cat: 'W', name: 'Coherent Optics', cost: 25, txt: 'Unlocks the LASER ARRAY.' },
  { id: 'W2', cat: 'W', name: 'Smart Munitions', cost: 40, txt: '+25% missile damage, +15% missile range.' },
  { id: 'W3', cat: 'W', name: 'Tungsten Penetrators', cost: 45, txt: '+25% kinetic damage (railguns, interceptors).' },
  { id: 'W4', cat: 'W', name: 'Heliostat Mirrors', cost: 80, req: ['W1'], txt: 'Unlocks the SOLAR LANCE.' },
  { id: 'W5', cat: 'W', name: 'Antimatter Warheads', cost: 130, req: ['W2'], txt: '+35% explosive damage, +25% blast radius.' },
  { id: 'W6', cat: 'W', name: 'Overcharged Capacitors', cost: 150, req: ['W3'], txt: '+22% fire rate for every tower — but each tower draws +1 power.' },
  { id: 'P1', cat: 'P', name: 'Ion Drives', cost: 20, txt: 'Reach Mercury and the asteroid belt.' },
  { id: 'P2', cat: 'P', name: 'Gravitics', cost: 35, txt: 'Unlocks the GRAVITY WELL.' },
  { id: 'P3', cat: 'P', name: 'Fusion Torch', cost: 60, req: ['P1'], txt: 'Reach Jupiter and Saturn, their moons and Trojans.' },
  { id: 'P4', cat: 'P', name: 'Interceptor Wings', cost: 90, req: ['P2'], txt: 'Unlocks the INTERCEPTOR CARRIER.' },
  { id: 'P5', cat: 'P', name: 'Antimatter Sails', cost: 110, req: ['P3'], txt: 'Reach Uranus, Neptune and Pluto at the Kuiper gate.' },
  { id: 'P6', cat: 'P', name: 'Graviton Lensing', cost: 140, req: ['P2'], txt: '+12% range for every tower.' },
  { id: 'E1', cat: 'E', name: 'Regolith Refining', cost: 20, txt: '+40% yield from Lunar, Martian and Mercurian mines.' },
  { id: 'E2', cat: 'E', name: 'Asteroid Prospecting', cost: 45, req: ['P1'], txt: '+50% yield from asteroid and Trojan mines.' },
  { id: 'E3', cat: 'E', name: 'Helium-3 Fusion', cost: 55, txt: '+8 energy, +20% solar output.' },
  { id: 'E4', cat: 'E', name: 'Orbital Foundries', cost: 100, req: ['E1'], txt: '-15% on every build and upgrade.' },
  { id: 'E5', cat: 'E', name: 'Dyson Swarm', cost: 200, req: ['E3'], txt: '+100% solar output; Earth produces +50% science.' },
  { id: 'S1', cat: 'S', name: 'Deflector Theory', cost: 30, txt: 'Unlocks the AEGIS SHIELD.' },
  { id: 'S2', cat: 'S', name: 'Electromagnetic Pulse', cost: 40, txt: 'Unlocks the EMP ARRAY.' },
  { id: 'S3', cat: 'S', name: 'Deep Space Radar', cost: 25, txt: 'Unlocks DEEP SPACE RADAR (reveals cloaked ships).' },
  { id: 'S4', cat: 'S', name: 'Planetary Grid', cost: 60, txt: 'Earth\'s own guns: triple damage, +40% range.' },
  { id: 'S5', cat: 'S', name: 'Hardened Circuits', cost: 90, req: ['S2'], txt: 'Towers ignore the Sentinel\'s silencing pulse; outposts +60% hull.' },
  { id: 'D1', cat: 'D', name: 'Doctrine: Fortress Earth', cost: 70, excl: 'D', txt: '+30 Earth integrity; towers within 60 of Earth deal +25%.' },
  { id: 'D2', cat: 'D', name: 'Doctrine: Forward Defence', cost: 70, excl: 'D', txt: 'Towers beyond Mars orbit: +20% damage and range; +25% bounty from kills out there.' },
  { id: 'X1', cat: 'X', name: 'Sunfire Protocol', cost: 120, excl: 'X', txt: 'Super-weapon becomes SUNFIRE: the Sun exhales a burning wave across the whole system.' },
  { id: 'X2', cat: 'X', name: 'Lagrange Collapse', cost: 120, excl: 'X', txt: 'Super-weapon becomes LAGRANGE COLLAPSE: all invaders frozen 6 s and hurled outward.' },
  { id: 'B1', cat: 'B', name: 'Swarm Neurology', cost: 35, spec: { drone: 40 }, txt: '+40% damage against Swarmers and Raiders.' },
  { id: 'B2', cat: 'B', name: 'Hull Metallurgy', cost: 55, spec: { dread: 4 }, txt: 'All weapons ignore half of any armour resistance.' },
  { id: 'B3', cat: 'B', name: 'Cloak Spectroscopy', cost: 45, spec: { phantom: 6 }, txt: 'All towers see cloaked ships within half their range.' },
  { id: 'B4', cat: 'B', name: 'Regeneration Inhibitors', cost: 45, spec: { mender: 5 }, txt: 'Alien healing -60%, shield regeneration -50%.' },
  { id: 'B5', cat: 'B', name: 'Monolith Resonance', cost: 150, spec: { boss: 1 }, txt: 'Super-weapon charges twice as fast and hits 50% harder.' }
];
var RES = {}; RESEARCH.forEach(function (r) { RES[r.id] = r; });
var CATS = { W: 'WEAPONS', P: 'PROPULSION & FIELDS', E: 'ECONOMY', S: 'SHIELDS & SENSORS', D: 'DOCTRINE', X: 'SUPER-WEAPON', B: 'XENOBIOLOGY' };

/* ---- Approach vectors (named for the constellations they come from). curl bends the path into a spiral. ---- */
var VECTORS = {
  CYGNUS: { ang: 1.15, curl: 0.55 }, ORION: { ang: 3.6, curl: -0.6 }, LYRA: { ang: 0.35, curl: -0.75 },
  SAGITTARIUS: { ang: 4.75, curl: 0.7 }, DRACO: { ang: 2.25, curl: 0.85 }, CARINA: { ang: 5.6, curl: -0.5 },
  PERSEUS: { ang: 2.95, curl: 0.4 }, CENTAURUS: { ang: 5.15, curl: -0.85 }
};

/* ---- Campaign: twelve chapters. ---- */
var ALL_R = RESEARCH.map(function (r) { return r.id; });
var SECTORS = [
  { title: 'THE DAWN OF DEFENSE', sub: 'CHAPTER I', waves: 6, pool: ['drone', 'cruiser'], vec: ['CYGNUS'], start: { m: 260, s: 25 },
    res: ['W1', 'W2', 'W3', 'P1', 'E1', 'E3', 'S4'], intro: { 1: 'cruiser', 2: 'drone' },
    story: 'A signal from beyond the heliopause. Then silence. Then the ships. Earth has six waves to learn how to fight.' },
  { title: 'LUNAR VIGIL', sub: 'CHAPTER II', waves: 8, pool: ['drone', 'cruiser', 'raider'], vec: ['CYGNUS', 'LYRA'], start: { m: 280, s: 25 },
    res: ['W1', 'W2', 'W3', 'P1', 'P2', 'E1', 'E2', 'E3', 'S1', 'S4'], intro: { 2: 'raider' },
    story: 'The mines of Tycho feed the war. The invaders have noticed. Raiders strike at outposts, not at Earth.' },
  { title: 'THE RED FRONTIER', sub: 'CHAPTER III', waves: 8, pool: ['drone', 'cruiser', 'raider', 'dread'], vec: ['ORION', 'CYGNUS'], start: { m: 300, s: 30 },
    res: ['W1', 'W2', 'W3', 'W4', 'P1', 'P2', 'E1', 'E2', 'E3', 'S1', 'S3', 'S4', 'D1', 'D2', 'B1', 'B2'], intro: { 3: 'dread' },
    story: 'Dreadnoughts — armoured beyond anything we can melt. Only mass and velocity will stop them.' },
  { title: 'THE BELT', sub: 'CHAPTER IV', waves: 9, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra'], vec: ['ORION', 'SAGITTARIUS', 'LYRA'], start: { m: 320, s: 35 },
    res: ['W1', 'W2', 'W3', 'W4', 'W5', 'P1', 'P2', 'P3', 'E1', 'E2', 'E3', 'E4', 'S1', 'S2', 'S3', 'S4', 'D1', 'D2', 'B1', 'B2'], intro: { 2: 'aegis', 5: 'hydra' },
    story: 'Shielded Wardens and splitting Hydras push through the asteroid belt. Prospect it, or lose it.' },
  { title: 'JUPITER AND BEYOND', sub: 'CHAPTER V', waves: 10, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'carrier'], vec: ['DRACO', 'CARINA', 'ORION'], start: { m: 340, s: 40 },
    res: ALL_R.filter(function (x) { return !/^(P5|E5|X1|X2|B3|B4|B5|W6)$/.test(x); }), intro: { 3: 'carrier' }, boss: { 10: 'leviathan' },
    story: 'Something vast is crossing the orbit of Jupiter. A world-ship, carrying a fleet inside it.' },
  { title: 'THE RINGS OF SATURN', sub: 'CHAPTER VI', waves: 10, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'carrier', 'phantom'], vec: ['PERSEUS', 'CENTAURUS', 'CYGNUS'], start: { m: 360, s: 45 },
    res: ALL_R.filter(function (x) { return !/^(E5|B4|B5)$/.test(x); }), intro: { 2: 'phantom' },
    story: 'Ships that cannot be seen slip through the rings. Build eyes before you build guns.' },
  { title: 'THE INNER FIRE', sub: 'CHAPTER VII', waves: 10, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism'], vec: ['SAGITTARIUS', 'DRACO', 'LYRA', 'ORION'], start: { m: 380, s: 50 },
    res: ALL_R.filter(function (x) { return x !== 'B5'; }), intro: { 2: 'mender', 4: 'prism' },
    story: 'Menders knit the fleet back together. Prisms turn our light against itself. Turn instead to the Sun.' },
  { title: 'THE ICE GIANTS', sub: 'CHAPTER VIII', waves: 11, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism', 'carrier', 'siege'], vec: ['CARINA', 'PERSEUS', 'CENTAURUS'], start: { m: 400, s: 55 },
    res: ALL_R.filter(function (x) { return x !== 'B5'; }), intro: { 2: 'siege' },
    story: 'Bombards hang beyond our reach and shell the Earth itself. Meet them at Uranus and Neptune.' },
  { title: 'HELIOPAUSE', sub: 'CHAPTER IX', waves: 12, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism', 'carrier', 'siege'], vec: ['CYGNUS', 'ORION', 'DRACO', 'CENTAURUS', 'LYRA'], start: { m: 420, s: 60 },
    res: ALL_R.filter(function (x) { return x !== 'B5'; }), intro: {},
    story: 'They come from every direction now, through the bubble where the Sun\'s wind dies.' },
  { title: 'THE SENTINEL', sub: 'CHAPTER X', waves: 12, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism', 'carrier', 'siege'], vec: ['SAGITTARIUS', 'PERSEUS', 'CARINA'], start: { m: 440, s: 65 },
    res: ALL_R, intro: {}, boss: { 6: 'leviathan', 12: 'monolith' },
    story: 'A black slab drifts toward the inner system, perfect in every proportion. It has been here before.' },
  { title: 'THE LONG NIGHT', sub: 'CHAPTER XI', waves: 14, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism', 'carrier', 'siege'], vec: ['CYGNUS', 'ORION', 'LYRA', 'SAGITTARIUS', 'DRACO', 'CARINA'], start: { m: 460, s: 70 },
    res: ALL_R, intro: {}, boss: { 7: 'monolith', 14: 'leviathan' },
    story: 'No reinforcements. No respite. Only the turning of the planets, and the dark.' },
  { title: 'BEYOND THE INFINITE', sub: 'CHAPTER XII', waves: 15, pool: ['drone', 'cruiser', 'raider', 'dread', 'aegis', 'hydra', 'phantom', 'mender', 'prism', 'carrier', 'siege'], vec: ['CYGNUS', 'ORION', 'LYRA', 'SAGITTARIUS', 'DRACO', 'CARINA', 'PERSEUS', 'CENTAURUS'], start: { m: 480, s: 80 },
    res: ALL_R, intro: {}, boss: { 8: 'monolith', 15: 'elder' },
    story: 'The Choir itself approaches. Whatever it is, it was old when the Sun was young.' }
];
var ENDLESS = { title: 'ENDLESS NIGHT', sub: 'ENDLESS', waves: 9999, pool: SECTORS[11].pool, vec: Object.keys(VECTORS), start: { m: 420, s: 60 }, res: ALL_R, intro: {}, endless: 1,
  story: 'There is no last wave. Hold as long as Earth endures.' };

var DIFF = {
  cadet: { name: 'CADET', hp: 0.72, inc: 1.2, earth: 130 },
  commander: { name: 'COMMANDER', hp: 1.0, inc: 1.0, earth: 100 },
  odyssey: { name: 'ODYSSEY', hp: 1.22, inc: 0.9, earth: 80 }
};

var PERKS = [
  { id: 'metals', name: 'Lunar Heritage', txt: '+12% starting metals per rank', max: 3, cost: [2, 3, 4] },
  { id: 'earth', name: 'Hardened Biosphere', txt: '+8 Earth integrity per rank', max: 3, cost: [2, 3, 4] },
  { id: 'science', name: 'Archive of Alexandria', txt: '+15 starting science per rank', max: 3, cost: [2, 3, 4] },
  { id: 'super', name: 'The Long Memory', txt: 'Super-weapon starts 25% charged per rank', max: 2, cost: [3, 5] }
];

var D = { TAU: TAU, BODIES: BODIES, BODY: BODY, SITES: SITES, SITE: SITE, TOWERS: TOWERS, TOWER_ORDER: TOWER_ORDER, ALIENS: ALIENS,
  RESEARCH: RESEARCH, RES: RES, CATS: CATS, VECTORS: VECTORS, SECTORS: SECTORS, ENDLESS: ENDLESS, DIFF: DIFF, PERKS: PERKS,
  EARTH_R: EARTH_R, HELIO_R: HELIO_R };
if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.HPD = D;
})(this);
