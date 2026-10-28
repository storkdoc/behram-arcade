/* ==========================================================================
   MELTDOWN — content.js
   Concept cards, faults, drills, tutorial and history. Plain data plus
   small setup/check functions that poke the sim state (see sim.js).
   Text tone: short, accurate, respectful of the real people involved.
   ========================================================================== */
(function (root) {
'use strict';
const S = root.RXSim;

/* ---------- concept cards: the physics the game teaches ---------- */
const CONCEPTS = {
  rods: { t: 'CONTROL RODS', icon: '▮', b: [
    'Control rods are made of materials such as boron carbide or silver-indium-cadmium that <b>soak up neutrons</b>.',
    'Pull them out and fewer neutrons are absorbed, so more go on to split uranium and power rises. Push them in and power falls.',
    'A rod near the middle of the core sits in the strongest flux, so it is worth more than one at the edge. Rods do most of their work in the middle of their travel, which is the S-curve on your rod gauge.'] },
  flux: { t: 'NEUTRON FLUX', icon: '✶', b: [
    '<b>Reactor power is neutron flux.</b> Every fission releases about 200 MeV of heat and 2 to 3 new neutrons.',
    'The power gauge actually counts neutrons with detectors outside the vessel. The Geiger clicks you hear follow the flux.',
    'Flux is highest in the centre of the core and falls off toward the edges and the top and bottom. That is the glow you see in the cross-section.'] },
  crit: { t: 'CRITICALITY', icon: 'k', b: [
    'The multiplication factor <b>k</b> is how many neutrons one generation leaves for the next. <b>k = 1: critical</b>, so power holds steady at any level. k &gt; 1 means supercritical (power rises) and k &lt; 1 means subcritical (power falls).',
    '"Critical" is the normal running state. It is not an emergency.',
    'Reactivity ρ = (k−1)/k is measured in pcm (1/100,000) or in <b>dollars</b>, where $1 equals the delayed-neutron fraction β.'] },
  delayed: { t: 'PROMPT vs DELAYED NEUTRONS', icon: '⏱', b: [
    'About <b>99.35 %</b> of fission neutrons are <b>prompt</b>: they appear within about 10⁻¹⁴ s, and one neutron generation in a PWR lasts only about 20 microseconds.',
    'The other <b>0.65 %</b> are <b>delayed</b>. Fission products such as bromine-87 release them seconds to about a minute later.',
    'Below $1 of reactivity the chain reaction has to <i>wait</i> for those delayed neutrons, so power changes over seconds to minutes and a human can steer it. <b>That small 0.65 % is what makes reactors controllable.</b>',
    'At $1 or more the reactor is <b>prompt critical</b>: prompt neutrons alone sustain the chain, and power multiplies thousands of times in a fraction of a second. Try it in the NEUTRON LAB.'] },
  period: { t: 'REACTOR PERIOD', icon: '↗', b: [
    'The <b>period</b> is the time for power to grow by a factor of e (2.718). A 60-second period means power is rising steadily but slowly. Below 10 s the reactor trips on HIGH STARTUP RATE.',
    'After a scram power drops quickly at first, then settles onto a −80 s period. That is the longest-lived delayed-neutron group dying away, and it cannot be made any faster.'] },
  flow: { t: 'COOLANT FLOW', icon: '≋', b: [
    'Four reactor coolant pumps push about 18,000 kg of water per second through the core. Water carries the heat to the steam generators.',
    'Less flow means each kilogram picks up more heat. If the fuel surface makes steam faster than water can rewet it, a steam film forms (<b>DNB</b>, departure from nucleate boiling) and the cladding overheats.',
    'The <b>DNBR</b> gauge shows how far you are from that limit. Keep it above 1.3.'] },
  temp: { t: 'TEMPERATURE FEEDBACK', icon: '🌡', b: [
    'Hotter fuel absorbs more neutrons (the <b>Doppler</b> effect). Hotter water is less dense and slows neutrons less well (the <b>moderator coefficient</b>).',
    'In a water reactor both effects are <b>negative</b>: if the core gets hotter, power falls by itself. This self-stabilising behaviour is the most important safety property a reactor can have.',
    'With rods on AUTO the control system holds the average temperature (Tavg) on a program that rises with load.'] },
  pressure: { t: 'PRESSURE & THE PRESSURIZER', icon: '◍', b: [
    'At 15.5 MPa (about 155 atmospheres) water stays liquid at 325 °C. The <b>pressurizer</b> is a tall tank with a steam bubble on top: heaters raise the pressure and sprays lower it.',
    '<b>Subcooling margin</b> is how far the water is below boiling. If it reaches 0 the water flashes to steam: pressure gauges can mislead you and the core can begin to void.',
    'The PORV (power-operated relief valve) vents steam if pressure climbs too high. Its <b>block valve</b> can isolate it.'] },
  decay: { t: 'DECAY HEAT', icon: '☢', b: [
    'A scram stops the chain reaction in seconds, but the fission products keep decaying. They still produce about <b>7 % of full power right after shutdown</b>, about 1 % after an hour, and about 0.5 % after a day.',
    'For a 3000 MW reactor that is still 30 MW an hour later, enough to boil the core dry if nothing cools it.',
    '<b>Every serious accident is really a decay-heat accident.</b> Whatever happens, keep water on the fuel and keep a heat sink.'] },
  xenon: { t: 'XENON POISONING', icon: 'Xe', b: [
    'Xenon-135 is the strongest neutron absorber known. It mostly forms from the decay of iodine-135 (half-life 6.6 h), and neutrons burn it away.',
    'Cut power and the burn-off stops, but the iodine keeps decaying. Xenon builds for about <b>8 to 11 hours</b>: this is the <b>iodine pit</b>. The reactor may not be able to restart until it decays.',
    'Here xenon runs on a ×120 clock, so an hour of plant time passes in 30 s.'] },
  boron: { t: 'BORON (CHEMICAL SHIM)', icon: 'B', b: [
    'PWRs dissolve boric acid in the coolant. Boron-10 absorbs neutrons evenly through the whole core.',
    'Boron is slow but strong, about −10 pcm per ppm. Use it for big, slow changes such as xenon or fuel burnup, and use rods for fast, fine control.',
    'Unplanned dilution (fresh water getting in) adds reactivity silently.'] },
  heatsink: { t: 'THE HEAT SINK', icon: '⇄', b: [
    'In a PWR the primary water never leaves the containment. It boils water in the <b>steam generators</b>, and that steam spins the turbine.',
    'If feedwater stops, the steam generators boil dry in minutes and the reactor loses its heat sink. <b>Auxiliary feedwater</b> (AFW) pumps exist only to prevent this.',
    'The turbine and the reactor have to stay matched. A turbine trip removes the load suddenly, so the reactor trips too.'] },
  eccs: { t: 'EMERGENCY CORE COOLING', icon: '✚', b: [
    'If coolant leaks out, <b>safety injection</b> pumps borated water back in. High-pressure injection (HPI) works first, nitrogen-charged accumulators dump in below 4 MPa, and low-pressure injection (LPI) works near atmospheric pressure.',
    'Do not throttle HPI because of one indication. Confirm with <b>subcooling margin</b> and core-exit temperature.'] },
  power: { t: 'ELECTRICAL POWER', icon: 'ϟ', b: [
    'A nuclear plant needs electricity to cool itself: pumps, valves, instruments. If the grid connection is lost (<b>LOOP</b>), two emergency diesels start within about 10 s.',
    'If the diesels fail too, the plant is in <b>station blackout</b>. Batteries keep instruments and steam-driven pumps alive for hours in reality, minutes in this game. Shedding loads stretches them.'] },
  void: { t: 'VOID COEFFICIENT', icon: '○', b: [
    'Steam bubbles (voids) in the core replace water. In a PWR, water is the moderator, so voids make power <b>fall</b> (a negative coefficient).',
    'In the 1986 RBMK, graphite did the moderating and the water mostly absorbed neutrons, so voids made power <b>rise</b>. More power makes more steam, and more steam makes more power.'] },
};

/* ---------- history (tasteful, factual, short) ---------- */
const HISTORY = {
  tmi: { t: 'THREE MILE ISLAND UNIT 2 — 28 MARCH 1979', b: [
    'A feedwater pump trip at 4:00 a.m. led to a turbine and reactor trip. The pilot-operated relief valve opened as designed but <b>stuck open</b>. Its control-room light showed only that the valve had been <i>commanded</i> shut.',
    'Coolant boiled out of the valve. Steam voids pushed water up into the pressurizer, so its level <b>rose</b> while the core was losing water. Operators, trained never to let the pressurizer go solid, <b>throttled high-pressure injection</b>, and later shut the vibrating coolant pumps off. The auxiliary feed valves had also been left shut after maintenance.',
    'About half the core melted. The steel vessel held, releases were small, and no deaths or injuries were attributed. The industry was reshaped: INPO, simulator training, symptom-based procedures, better instruments and human factors.'] },
  chernobyl: { t: 'CHERNOBYL UNIT 4 — 26 APRIL 1986, 01:23', b: [
    'A test was meant to show that a coasting turbine could power the coolant pumps until the diesels started. Delayed by grid demand, it ran in the night. Power then fell to about 30 MW, and xenon pinned the reactor down.',
    'To recover, operators withdrew far too many control rods. The operating reactivity margin fell to about 6 to 8 rod-equivalents; the rules required at least 15. At low power, with the pumps coasting down, the RBMK\'s <b>positive void coefficient</b> made it unstable.',
    'AZ-5 (scram) was pressed. The rods\' graphite displacers first pushed water out of the bottom of the channels and <b>added</b> reactivity. Power surged to many times nominal, and steam explosions destroyed the reactor. Two workers died that night and 28 more died of acute radiation syndrome within months. The release contaminated a wide region, and every RBMK was modified afterwards.'] },
  fukushima: { t: 'FUKUSHIMA DAIICHI — 11 MARCH 2011', b: [
    'The magnitude-9.0 Tōhoku earthquake cut off-site power. Units 1 to 3 shut down automatically and their diesels started, as designed.',
    'About 50 minutes later a tsunami of roughly 14 to 15 m flooded the diesels and much of the electrical switchgear. This was <b>station blackout</b>. Steam-driven and battery-backed cooling ran for hours to days, then failed, and decay heat melted three cores. Hydrogen explosions wrecked the reactor buildings.',
    'More than 100,000 people were evacuated. The radiation itself killed no one in the immediate aftermath; the evacuation cost many lives among frail and elderly people. (These were boiling-water reactors, but the decay-heat lesson is the same.)'] },
  generic: { t: 'OPERATING EXPERIENCE', b: ['Plants share every event worldwide through operating-experience programmes, so that a mistake made once is not repeated.'] },
};

/* ---------- faults for the free-running SHIFT ----------
   start(s,g) applies the fault. done(s,g,f) -> true when the plant is stable again.
   act: optional fault-specific action button the operator can take.
   min: minimum difficulty index (0 trainee, 1 operator, 2 senior, 3 chief).
   w: weight. repair: seconds of game time until the crew repairs it.        */
const pick = a => a[Math.floor(Math.random() * a.length)];
const withdrawn = s => { const r = []; for (let i = 0; i < S.NR; i++) if (s.rods[i] < 0.5 && !s.stuck[i]) r.push(i); return r; };

const FAULTS = [
  { id: 'rcp', name: 'REACTOR COOLANT PUMP TRIP', concept: 'flow', w: 3, min: 0, repair: 120,
    hint: 'Flow drops to 75 %. Cut turbine load to about 70 % so the DNB ratio stays above 1.3. Restart the pump after the crew repairs it.',
    start(s, g, f) { const c = s.pumps.map((p, i) => i).filter(i => !s.pumps[i].failed && s.pumps[i].on); f.k = pick(c.length ? c : [0]); s.pumps[f.k].failed = true; },
    repairFn(s, f) { s.pumps[f.k].failed = false; },
    done(s, g, f) { return f.repaired && s.pumps[f.k].on && s.pumps[f.k].w > 0.9; },
    why: 'Pumps trip on electrical faults, vibration or seal problems. With less flow, each kilogram of water carries more heat, so margin to DNB shrinks. Plants have power limits for 3-pump operation for exactly this reason.' },
  { id: 'stuck', name: 'CONTROL ROD STUCK', concept: 'rods', w: 2, min: 0, repair: 150,
    hint: 'One cluster will not move. Use the other rods and BORON to control power. A scram still works because every other rod falls.',
    start(s, g, f) { const c = withdrawn(s); f.k = pick(c.length ? c : [4]); s.stuck[f.k] = true; },
    repairFn(s, f) { s.stuck[f.k] = false; },
    done(s, g, f) { return f.repaired; },
    why: 'Rod drive mechanisms can bind from debris, deformed guide tubes or electrical faults. Plants check rod movement every quarter, and their shutdown-margin rules assume the most valuable rod fails to insert.' },
  { id: 'drop', name: 'DROPPED ROD', concept: 'flux', w: 2, min: 0, repair: 140,
    hint: 'One cluster fell into the core and power is tilted toward the other side. Reduce load and let Tavg settle; the crew will re-latch the rod.',
    start(s, g, f) { const c = withdrawn(s); f.k = pick(c.length ? c : [3]); s.rods[f.k] = 1; s.stuck[f.k] = true; },
    repairFn(s, f) { s.stuck[f.k] = false; },
    done(s, g, f) { return f.repaired; },
    why: 'A lost coil voltage on a rod gripper releases the rod. One inserted rod distorts the flux shape (a "tilt"), so the rest of the core runs hotter even while total power falls.' },
  { id: 'mfw', name: 'LOSS OF MAIN FEEDWATER', concept: 'heatsink', w: 2, min: 0, repair: 170,
    hint: 'The turbine trips and the reactor trips. Make sure AUX FEED (U) is running so the steam generators keep their water.',
    start(s, g, f) { s.mainFW = false; if (g.diff >= 2) s.afwAuto = false; },
    repairFn(s) { s.mainFW = true; s.afwAuto = true; },
    done(s, g, f) { return f.repaired && s.Lsg > 0.3; },
    why: 'Main feed pumps trip on suction pressure, controls or condensate problems. That is how TMI-2 started. The steam generators hold only minutes of water at full power, so auxiliary feedwater has to start.' },
  { id: 'loop', name: 'LOSS OF OFFSITE POWER', concept: 'power', w: 2, min: 0, repair: 170,
    hint: 'The grid is gone, so the pumps coast down and the reactor trips. The diesels should start. Keep AUX FEED running; natural circulation will carry decay heat.',
    start(s, g, f) { s.offsite = false; s.dg.forEach(d => d.failP = g.diff >= 3 ? 0.3 : 0.05); },
    repairFn(s) { s.offsite = true; },
    done(s, g, f) { return f.repaired && s.offsite; },
    why: 'Storms, grid faults and switchyard failures cut plants off from the grid every year somewhere. The reactor trips, emergency diesels carry the safety loads, and hot water rising and cold water sinking keeps the core cool without pumps.' },
  { id: 'porv', name: 'PRESSURIZER RELIEF VALVE STUCK OPEN', concept: 'pressure', w: 2, min: 1, repair: 0, history: 'tmi',
    hint: 'The PORV light says CLOSED, but the tail-pipe is hot and pressure is falling. Close the BLOCK valve (K). Keep HPI flowing.',
    start(s, g, f) { s.porvStuck = true; s.porv = 1; },
    done(s, g, f) { return s.block < 0.05 && s.SM > 10 && s.coverage > 0.99; },
    why: 'A relief valve can stick open after lifting. At TMI-2 the indicator showed only the solenoid command, so operators believed it was shut for over two hours. The block valve behind it exists for exactly this case.' },
  { id: 'loca', name: 'SMALL BREAK LOCA', concept: 'eccs', w: 1, min: 1, repair: 0,
    hint: 'Coolant is leaking. Expect SI and a trip. Do NOT throttle HPI unless subcooling is healthy. Watch the core water level.',
    start(s, g, f) { s.leak = 0.25 + Math.random() * 0.35; },
    done(s, g, f) { if (f.t > 90 && s.SM > 10 && s.coverage > 0.99) { s.leak = 0; return true; } return false; },
    why: 'A cracked instrument line, a failed seal or a weld can leak primary coolant. Safety injection matches the leak until the crew isolates it or cools the plant down to cold shutdown.' },
  { id: 'slb', name: 'STEAM LINE BREAK', concept: 'temp', w: 1, min: 1, repair: 0,
    hint: 'Steam is pouring out and the primary is overcooling. Cold water plus a negative MTC adds reactivity! Close the MSIVs (M).',
    start(s, g, f) { s.slb = 0.25 + Math.random() * 0.5; },
    done(s, g, f) { if (s.msiv < 0.05) { s.slb = 0; return true; } return false; },
    why: 'A steam line break is the classic overcooling accident. Colder moderator adds reactivity through the negative temperature coefficient, which can even return a tripped core to power. Closing the main steam isolation valves stops the blowdown.' },
  { id: 'runaway', name: 'UNCONTROLLED ROD WITHDRAWAL', concept: 'crit', w: 2, min: 0, repair: 0,
    hint: 'Rods are pulling out on their own! Switch rods to MANUAL (C) or drive them IN (↓). If power runs away, SCRAM.',
    start(s, g, f) { s.rodAuto = false; s.runaway = 1; },
    done(s, g, f) { return !s.runaway && s.n < 1.05; },
    why: 'A failed rod-control card can drive rods out continuously. Protection catches it on high flux or high startup rate, but an alert operator should catch it first. Here, delayed neutrons buy you the seconds you need.' },
  { id: 'dilution', name: 'BORON DILUTION', concept: 'boron', w: 1, min: 1, repair: 0,
    hint: 'Clean water is diluting the boron and reactivity is creeping up. Isolate the source with the fault button, then borate back.',
    start(s, g, f) { s.dilutionLeak = 1.2 + Math.random(); },
    act: { label: 'ISOLATE MAKEUP WATER', fn(s) { s.dilutionLeak = 0; } },
    done(s, g, f) { return s.dilutionLeak === 0 && Math.abs(s.rho.dollars) < 0.05; },
    why: 'Unborated water from the makeup system or a heat exchanger leak lowers boron concentration slowly. Boron meters, makeup flow totals and rod-insertion limits catch it before it matters.' },
  { id: 'turb', name: 'TURBINE TRIP', concept: 'heatsink', w: 2, min: 0, repair: 60,
    hint: 'The load vanished and the reactor trips. The steam dumps hold temperature. After the crew\'s checks, re-latch the turbine (T) when power is above 8 %.',
    start(s) { S.tripTurbine(s); },
    repairFn() {},
    done(s, g, f) { return f.repaired && !s.turb.tripped; },
    why: 'Turbines trip on vibration, overspeed, condenser vacuum or generator faults. Removing the load suddenly would heat the primary, so the reactor trips with it and condenser dumps take the heat for a while.' },
  { id: 'xenon', name: 'GRID: DEEP LOAD CUT, THEN RETURN', concept: 'xenon', w: 1, min: 1, repair: 0,
    hint: 'The grid wants 50 % now and full power again soon. Xenon will build up after the cut. Plan to dilute boron to climb back out of the iodine pit.',
    start(s, g, f) { g.demandPlan = [{ v: 0.5, at: g.t + 4 }, { v: 1.0, at: g.t + 150 }]; },
    done(s, g, f) { return f.t > 200 && Math.abs(s.MWe / 1000 - g.demand) < 0.05; },
    why: 'Grids with a lot of solar and wind ask nuclear plants to follow load. Xenon makes deep cuts late in a fuel cycle hard to reverse, and that is why "load-follow" needs careful planning.' },
  { id: 'instr', name: 'INSTRUMENT FAILURE', concept: 'pressure', w: 1, min: 2, repair: 120,
    hint: 'One gauge is stuck. Cross-check it against related readings (pressure vs subcooling, level vs inventory). Don\'t act on one indication.',
    start(s, g, f) { f.k = pick(['Lpzr', 'P', 'Tavg']); g.frozen[f.k] = s[f.k]; },
    repairFn(s, f) {},
    done(s, g, f) { if (f.repaired) { delete g.frozen[f.k]; return true; } return false; },
    why: 'Transmitters fail high, low or as-is. Operators are trained to verify an indication with a diverse second instrument before acting, a habit TMI-2 made urgent.' },
  { id: 'sbo', name: 'STATION BLACKOUT', concept: 'decay', w: 1, min: 2, repair: 240, history: 'fukushima',
    hint: 'Grid AND diesels lost. Batteries are draining. SHED DC LOADS (fault button), keep the turbine-driven AUX FEED going, and hang on until power is restored.',
    start(s, g, f) { s.offsite = false; s.dg.forEach(d => { d.flooded = true; d.st = 'failed'; }); },
    act: { label: 'SHED DC LOADS', fn(s) { s.dcLoadShed = true; } },
    repairFn(s) { s.offsite = true; s.dg.forEach(d => { d.flooded = false; d.st = 'off'; }); },
    done(s, g, f) { return f.repaired && s.offsite; },
    why: 'Station blackout means every AC source is lost. Plants now keep portable pumps and generators ready (the FLEX strategy) because of Fukushima.' },
];

/* ---------- drills (standalone scenarios) ---------- */
const DRILLS = [
  { id: 'pump', name: 'PUMP TRIP', sub: 'Keep DNB margin when flow drops', concept: 'flow', len: 150, diff: 0,
    brief: 'You are at full power. A reactor coolant pump is about to trip. Three-pump operation is licensed only up to 75 % power. Get below that within 45 s of the trip, without a reactor trip, and keep the DNB ratio above 1.3.',
    setup(s, g) { g.at(8, () => { s.pumps[2].failed = true; g.alarm('RCP 3 TRIP'); }); },
    goal: 'Reactor power below 75 % by t = 53 s, no trip, DNBR ≥ 1.3 throughout.',
    check(s, g) { if (s.scram) return 'fail'; if (s.t > 10 && s.dnbr < 1.3) return 'fail'; if (s.t > 53 && s.n > 0.76) return 'fail'; if (s.t > 150) return 'pass'; } },
  { id: 'stuck', name: 'STUCK ROD', sub: 'Shut down with a rod stuck out', concept: 'rods', len: 140, diff: 0,
    brief: 'Grid dispatch wants 60 %. Halfway through the ramp a centre control rod jams. Reach 60 % ±5 % with Tavg on program, then hold it.',
    setup(s, g) { g.demandPlan = [{ v: 0.6, at: 4 }]; g.at(20, () => { s.stuck[4] = true; g.alarm('ROD DEVIATION'); }); },
    goal: 'Within 5 % of 60 % electrical output and no trip at t = 140 s.',
    check(s, g) { if (s.scram) return 'fail'; if (s.t > 140) return Math.abs(s.MWe / 1000 - 0.6) < 0.05 ? 'pass' : 'fail'; } },
  { id: 'sbo', name: 'STATION BLACKOUT', sub: 'Fukushima: decay heat with no AC power', concept: 'decay', len: 1700, warp: 4, diff: 1, history: 'fukushima',
    brief: 'An earthquake cuts the grid and the reactor scrams. The diesels start, and then a tsunami floods them. Batteries are already low, and the coolant-pump seals will start leaking. Power returns at plant time 28:20. Plant clock ×4.<br><br>Hint: decay heat goes where you send it. <b>Open the steam-generator atmospheric dumps</b> to cool and depressurize the plant so the accumulators can inject. Shed DC loads to keep the steam-driven feed pump alive. When the SG pressure is below 1 MPa, a fire truck can feed it.',
    setup(s, g) { s.offsite = false; s.battery = 0.55; s.dg.forEach(d => d.failP = 0); g.at(45, () => { s.dg.forEach(d => { d.flooded = true; d.st = 'failed'; }); g.alarm('DIESELS FLOODED'); g.cine('TSUNAMI: DIESELS LOST', 'red'); });
      g.at(1700, () => { s.offsite = true; s.dg.forEach(d => { d.flooded = false; d.st = 'off'; }); g.alarm('OFFSITE POWER RESTORED'); }); g.drillActs = ['shed', 'sgdump', 'truck']; },
    goal: 'No core damage (clad below 1204 °C) when power returns at 28:20.',
    check(s, g) { if (s.damage > 0.001 || s.TclPk > 1204) return 'fail'; if (s.t > 1700) return 'pass'; } },
  { id: 'slb', name: 'STEAM LINE BREAK', sub: 'Overcooling and return to power', concept: 'temp', len: 150, diff: 1,
    brief: 'A main steam line ruptures outside containment. Isolate the break and stop the overcooling before the cold water returns the core to power.',
    setup(s, g) { g.at(6, () => { s.slb = 0.9; g.alarm('STEAM FLOW HIGH'); }); },
    goal: 'MSIVs closed within 60 s of the break, the core stays subcritical (n < 5 %), no damage.',
    check(s, g) { if (s.t > 66 && s.msiv > 0.05) return 'fail'; if (s.scram && s.scramT > 8 && s.n > 0.05) return 'fail'; if (s.t > 150) return 'pass'; } },
  { id: 'tmi', name: 'TMI-2: STUCK-OPEN PORV', sub: 'The misleading light, 4:00 a.m.', concept: 'pressure', len: 600, diff: 1, history: 'tmi',
    brief: 'Babcock & Wilcox plant at full power. The main feedwater pumps are about to trip. Watch EVERY indication, not just the one you expect. The PORV light shows only what the valve was told to do.',
    setup(s, g) { s.otsg = true; s.noTurbineTripScram = true; s.dumpCap = 0.1; s.afwBlockedT = 480; g.tmi = true;
      g.at(5, () => { s.mainFW = false; g.alarm('FEEDWATER PUMPS TRIP'); }); },
    tick(s, g) { if (s.porvAuto && !g.porvStuckSet) { s.porvStuck = true; g.porvStuckSet = true; } },
    goal: 'Recognise the stuck valve: close the BLOCK valve, keep HPI on, no core damage by 10:00.',
    check(s, g) { if (s.damage > 0.001) return 'fail'; if (s.t > 600) return s.block < 0.1 ? 'pass' : 'fail'; } },
  { id: 'xenon', name: 'IODINE PIT', sub: 'Return to power against xenon', concept: 'xenon', len: 360, diff: 1,
    brief: 'You were at 30 % for hours while the grid was quiet, then the grid lost a big plant. Dispatch wants 100 % for six minutes. Xenon is building up. Climb out with rods and boron.',
    setup(s, g) { g.demandPlan = [{ v: 1.0, at: 3 }]; },
    init: () => ({ power: 0.3, xe: S.xenonRun(1, S.X_EQ1, t => t < 20 * 3600 ? 1 : 0.3, 23 * 3600, 60) }),
    goal: 'Average output ≥ 85 % of demand over the drill with no trip.',
    check(s, g) { if (s.scram) return 'fail'; if (s.t > 360) return g.acc() >= 0.85 ? 'pass' : 'fail'; } },
  { id: 'night', name: 'UNIT 4 NIGHT TEST', sub: 'RBMK, 26 April 1986, 01:22', concept: 'void', len: 300, diff: 2, history: 'chernobyl', rbmk: true,
    brief: 'You are shift chief of an RBMK-style unit. Power collapsed to 30 MW in the xenon pit, and the crew pulled rods until power came back to 200 MW. Your <b>ORM</b> (rods in the core) is far below the 15-rod minimum. The test team wants to start the turbine rundown now.',
    setup(s, g) { g.drillActs = ['test', 'refuse']; },
    init: () => ({ type: 'RBMK', power: 0.0625, xe: S.xenonRun(1, S.X_EQ1, t => t < 10 * 3600 ? 0.5 : 0.07, 11 * 3600, 60), rods: 0.13 }),
    post(s) { s.tripsBypassed = true; s.xeFrozen = true; s.rodAuto = true; s.powerSet = 0.0625; },
    goal: 'Choose safety: refuse the test, or drive rods IN until ORM ≥ 15 (which shuts the unit down). If the test runs, the supervisor presses AZ-5 36 s in, so the ORM had better be ≥ 15 by then.',
    tick(s, g) { if (g.testStarted && !s.scram && s.t - g.testT > 36) { S.doScram(s, 'AZ-5'); g.cine('AZ-5 PRESSED', 'red'); } },
    check(s, g) { if (s.exploded) return 'fail'; if (g.refused) return 'pass'; if (!g.testStarted && s.ORM >= 15 && s.t > 3) return 'pass'; if (g.testStarted && s.t - g.testT > 55) return 'pass'; if (s.t > 300) return 'fail'; } },
];

/* ---------- tutorial ---------- */
const TUTORIAL = [
  { t: 'WELCOME TO THE CONTROL ROOM', concept: null, b: 'This is a teaching model of a 3000 MW pressurized-water reactor, not an engineering simulator. Things happen faster than in reality so you can see them. The view on the left is a <b>cross-section of the core</b>: fuel rods, control rods and coolant water.', wait: 'space' },
  { t: 'NEUTRON FLUX = POWER', concept: 'flux', b: 'The reactor is shut down but critical at a tiny power (0.1 %). The blue Cherenkov glow and the Geiger clicks follow the neutron flux. Watch the <b>POWER</b> gauge.', wait: 'space' },
  { t: 'WITHDRAW THE RODS', concept: 'rods', b: 'Hold <b>↑ / W</b> (or the ROD ▲ button) to pull the control rods out. Watch the <b>PERIOD</b>: power begins to rise exponentially. Get the period below 60 s.', check: (s) => s.period > 0 && s.period < 60 },
  { t: 'PROMPT vs DELAYED NEUTRONS', concept: 'delayed', b: 'Notice how <i>smoothly</i> power rises. It can only grow as fast as the delayed neutrons arrive. Without them the same rod movement would multiply power a million times in a second. Now raise power to <b>5 %</b>.', check: (s) => s.n > 0.05 },
  { t: 'LEVEL OFF: CRITICAL', concept: 'crit', b: 'Hold <b>↓ / S</b> to insert rods a little until the period is very long (power steady). That is <b>critical</b>: k = 1. Then heat from the fuel starts warming the water, and the temperature feedback helps hold power steady.', check: (s) => s.n > 0.03 && (s.period > 300 || s.period < -300 || !isFinite(s.period)) },
  { t: 'SYNC THE TURBINE', concept: 'heatsink', b: 'Raise power above 10 %, then press <b>T</b> to latch the turbine. Then <b>→</b> raises load. With rods on <b>AUTO (C)</b> the control system follows the turbine for you. Reach <b>40 % electrical output</b>.', check: (s) => s.MWe > 400, auto: 'turb' },
  { t: 'COOLANT FLOW', concept: 'flow', b: 'Four pumps drive water through the core. Trip pump 4 with the <b>4</b> key and watch flow and the <b>DNBR</b> fall. Then press <b>4</b> again to restart it.', check: (s, g) => g.tut.p4off && s.pumps[3].on && s.pumps[3].w > 0.9 },
  { t: 'PRESSURE', concept: 'pressure', b: 'The pressurizer holds 15.5 MPa so water stays liquid at 320 °C. Open the PORV with <b>O</b> for a few seconds, watch the pressure fall and the tail-pipe temperature rise, then close it again.', check: (s, g) => g.tut.porvCycled && !s.porvCmd },
  { t: 'TEMPERATURE FEEDBACK', concept: 'temp', b: 'Set rods to MANUAL (<b>C</b>), then raise turbine load with <b>→</b>. Pulling more steam cools the water, and negative feedback raises reactor power <i>by itself</i>, with no rod motion. Raise reactor power by 10 points.', check: (s, g) => { if (s.rodAuto || g.tut.n0 == null) { g.tut.n0 = s.n; return false; } return s.n > g.tut.n0 + 0.1; } },
  { t: 'SCRAM & DECAY HEAT', concept: 'decay', b: 'Now <b>SCRAM</b>: hold <b>Enter</b> (or the guarded button) for about half a second. Watch neutron power fall in seconds, then the long −80 s tail, while <b>decay heat</b> stays at a few % and has to be cooled.', check: (s) => s.scram && s.scramT > 25 },
  { t: 'YOU ARE QUALIFIED (ALMOST)', concept: null, b: 'That is the core of it. Try the <b>NEUTRON LAB</b> to see prompt criticality, run the <b>DRILLS</b> to relive real events, and work a <b>SHIFT</b> to climb from Trainee to Senior Reactor Operator.', wait: 'space' },
];

/* ---------- career ---------- */
const RANKS = [
  { xp: 0, t: 'TRAINEE' }, { xp: 1500, t: 'REACTOR OPERATOR' }, { xp: 5000, t: 'SENIOR OPERATOR' }, { xp: 12000, t: 'SHIFT SUPERVISOR (SRO)' },
];
const DIFFS = [
  { id: 'trainee', t: 'TRAINEE', mult: 1, faultGap: [75, 110], repair: 0.6, sub: 'Rods start on AUTO, faults are rare, every card pauses' },
  { id: 'operator', t: 'OPERATOR', mult: 1.5, faultGap: [55, 85], repair: 0.8, sub: 'Normal plant, normal crew' },
  { id: 'senior', t: 'SENIOR', mult: 2, faultGap: [40, 65], repair: 1, sub: 'More faults, compound failures, AFW may not auto-start' },
  { id: 'chief', t: 'CHIEF', mult: 3, faultGap: [30, 50], repair: 1.3, sub: 'Instrument failures, blackouts, a slow crew' },
];

root.RXContent = { CONCEPTS, HISTORY, FAULTS, DRILLS, TUTORIAL, RANKS, DIFFS };
})(typeof window !== 'undefined' ? window : globalThis);
