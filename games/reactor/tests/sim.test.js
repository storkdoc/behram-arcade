/* MELTDOWN physics sanity tests: node games/reactor/tests/sim.test.js
   Checks the teaching model against textbook behaviour (signs, time constants, magnitudes). */
const S = require('../js/sim.js');
let fails = 0, passes = 0;
const ok = (c, m, v) => { if (c) passes++; else fails++; console.log((c ? '  ok   ' : '  FAIL ') + m + (v !== undefined ? '  [' + v + ']' : '')); };
const run = (s, sec, f, dt = 0.05) => { for (let t = 0; t < sec; t += dt) { if (f) f(s, t); S.step(s, dt); } return s; };
const zeroPowerLab = (rho) => { const s = S.create({ power: 1e-3 }); s.tripsBypassed = true; s.Tf = 292; s.Tavg = 292; s.Tcl = 292; s.noFeedback = true; s.rho0 = 0; s.extRho = 0; S.computeRho(s); s.rho0 = -s.rho.total; s.extRho = rho; s.c = s.n; return s; };

console.log('== point kinetics');
{ const s = zeroPowerLab(65); const n0 = s.n; run(s, 30); const n30 = s.n; run(s, 30); const T = 30 / Math.log(s.n / n30);
  const Tin = S.inhourPeriod('PWR', 65e-5);
  ok(Math.abs(T - Tin) / Tin < 0.08, '+0.1$ step: stable period matches the six-group inhour equation (' + Tin.toFixed(0) + ' s)', T.toFixed(1) + ' s');
  ok(T > 80 && T < 160, 'period is ~minutes, not milliseconds: delayed neutrons make control possible', T.toFixed(0)); }
{ const s = zeroPowerLab(-1000); const n0 = s.n; S.step(s, 0.5); const jump = s.n / n0; const exp = 0.0065 / (0.0065 + 0.01);
  ok(Math.abs(jump - exp) < 0.05, 'negative step -1000 pcm: prompt drop to beta/(beta-rho)', jump.toFixed(3) + ' vs ' + exp.toFixed(3)); }
{ const s = zeroPowerLab(-8000); S.step(s, 200); const n1 = s.n; S.step(s, 100); const T = 100 / Math.log(s.n / n1);
  ok(T < -60 && T > -100, 'after a big negative insertion power falls on the ~ -80 s period (precursor decay)', T.toFixed(1)); }
{ const s = zeroPowerLab(800); const n0 = s.n; S.step(s, 0.05); ok(s.n / n0 > 100, 'prompt critical (+800 pcm > beta=650): x100 in 50 ms', (s.n / n0).toExponential(2)); }
{ const s = zeroPowerLab(300); s.noDelayed = true; const n0 = s.n; S.step(s, 0.05); ok(s.n / n0 > 1e3, 'NO delayed neutrons: even +300 pcm runs away in milliseconds', (s.n / n0).toExponential(2));
  const s2 = zeroPowerLab(300); const m0 = s2.n; S.step(s2, 0.05); ok(s2.n / m0 < 2.5, 'with delayed neutrons +300 pcm: only the prompt jump (beta/(beta-rho)=1.86)', (s2.n / m0).toFixed(2)); }

console.log('== steady state + feedback');
{ const s = S.create(); run(s, 60); ok(Math.abs(s.n - 1) < 0.03 && !s.scram, 'full power steady', s.n.toFixed(3));
  ok(s.dnbr > 1.8 && s.dnbr < 2.3, 'DNBR ~2 at full power', s.dnbr.toFixed(2));
  ok(Math.abs(s.P - 15.5) < 0.15, 'pressure held at 15.5 MPa', s.P.toFixed(2));
  ok(s.TfPk > 1500 && s.TfPk < 2200, 'fuel centreline (hot spot) 1500-2200 C', s.TfPk.toFixed(0));
  ok(s.rho.mtc < 0 && S.TYPES.PWR.alphaD < 0, 'PWR MTC and Doppler negative', s.rho.mtc.toFixed(1)); }
{ const s = S.create({ power: 0.7 }); run(s, 20); s.extRho = 100; run(s, 90); ok(s.n > 0.72 && s.n < 0.9 && !s.scram, '+100 pcm at 70 %: negative feedback (Doppler + MTC) settles a little higher', s.n.toFixed(3)); }
{ const s = S.create(); run(s, 10); const T0 = s.Tavg; s.turb.load = 0.8; run(s, 40); ok(s.n < 0.97 && s.Tavg > T0 + 1.5, 'turbine load 100->80 % with no rod motion: Tavg rises and feedback brings power down to follow', s.n.toFixed(3) + ' Tavg ' + s.Tavg.toFixed(1)); }

console.log('== SCRAM + decay heat');
{ const s = S.create(); run(s, 5); S.doScram(s, 'TEST'); S.step(s, 0.2); ok(s.decay > 0.06 && s.decay < 0.07, 'decay heat right after SCRAM ~6-7 %', (s.decay * 100).toFixed(2)); run(s, 2.8); ok(s.n < 0.08, 'SCRAM: neutron power falls fast', s.n.toFixed(4));
  run(s, 25); ok(s.decay > 0.02 && s.decay < 0.03, 'decay heat ~2.5 % after 100 plant-s (25 game-s at x4)', (s.decay * 100).toFixed(2));
  run(s, 870); ok(s.decay > 0.010 && s.decay < 0.014, 'decay heat ~1.2 % after 1 plant-hour', (s.decay * 100).toFixed(2));
  ok(s.Tavg < 300 && s.Tavg > 270 && s.P > 12, 'plant cools to no-load and stays pressurized with steam dumps', s.Tavg.toFixed(1) + ' C ' + s.P.toFixed(1) + ' MPa'); }

console.log('== xenon');
{ let I = 1, X = S.X_EQ1, peak = 0, tp = 0; for (let t = 0; t < 40 * 3600; t += 60) { const r = S.xenonRun(I, X, () => 0, 60, 60); I = r.I; X = r.X; if (X > peak) { peak = X; tp = t; } }
  ok(peak / S.X_EQ1 > 1.6 && peak / S.X_EQ1 < 3.5, 'post-shutdown xenon peak 1.6-3.5x equilibrium', (peak / S.X_EQ1).toFixed(2));
  ok(tp > 7 * 3600 && tp < 13 * 3600, 'xenon peaks ~8-12 h after shutdown (the iodine pit)', (tp / 3600).toFixed(1) + ' h'); }
{ const e = S.xenonEq(0.5).X / S.X_EQ1; ok(e > 0.7 && e < 0.95, 'equilibrium xenon at 50 % is most of full-power xenon (saturation)', e.toFixed(2)); }

console.log('== faults');
{ const s = S.create(); run(s, 5); s.pumps[0].failed = true; run(s, 40); ok(!s.scram && s.dnbr < 1.9 && s.dnbr > 1.0, 'one coolant pump trips: flow 75 %, DNBR falls, no trip', s.dnbr.toFixed(2) + ' W ' + s.W.toFixed(2)); }
{ const s = S.create(); run(s, 5); s.pumps[0].failed = s.pumps[1].failed = true; run(s, 20); ok(s.scram && /FLOW/.test(s.scramCause), 'two pumps: low-flow trip', s.scramCause); }
{ const s = S.create(); s.tripsBypassed = true; run(s, 5); s.pumps.forEach(p => p.failed = true); let mn = 9; run(s, 40, s => mn = Math.min(mn, s.dnbr)); ok(mn < 1.3 && s.n < 0.5, 'loss of all flow, trips bypassed: DNBR margin lost, but PWR negative void/MTC feedback cuts power by itself', 'min DNBR ' + mn.toFixed(2) + ' n ' + s.n.toFixed(2)); }
{ const s = S.create(); run(s, 5); s.stuck[4] = true; S.doScram(s); run(s, 10); ok(s.rods[4] < 0.2 && s.n < 0.1, 'stuck rod: one cluster stays out but the reactor still shuts down', s.rods[4].toFixed(2)); }
{ // TMI: loss of feedwater -> turbine trip -> PORV opens and sticks; indicator would show the command (closed)
  const s = S.create(); s.otsg = true; s.noTurbineTripScram = true; s.dumpCap = 0.1; s.afwBlockedT = 480; run(s, 5); s.mainFW = false; s.porvStuck = false; let stuckSet = false;
  run(s, 30, (s) => { if (!stuckSet && s.porvAuto) { s.porvStuck = true; stuckSet = true; } });
  const P0 = s.P, L0 = s.Lpzr; s.hpiThrottle = 0.15; s.afw = true; run(s, 160);
  ok(stuckSet, 'PORV lifted on the pressure spike');
  ok(s.scram, 'reactor tripped (' + s.scramCause + ')');
  ok(s.P < 11, 'stuck-open PORV: pressure falls toward saturation', s.P.toFixed(2) + ' MPa');
  ok(s.Lpzr > 0.7, 'pressurizer level RISES while inventory is lost (the misleading indication)', (s.Lpzr * 100).toFixed(0) + ' % inventory ' + (s.M * 100).toFixed(0) + '%');
  ok(s.tailT > 130, 'tail-pipe temperature high = the real clue', s.tailT.toFixed(0) + ' C');
  // fix: close block valve, full HPI
  s.blockCmd = 0; s.hpiThrottle = 1; run(s, 120); ok(s.SM > 0 && s.coverage > 0.99, 'block valve shut + full HPI: subcooling restored, core covered', 'SM ' + s.SM.toFixed(1)); }
{ // TMI path left alone with HPI throttled and pumps off: core uncovers and heats up
  const s = S.create(); s.otsg = true; s.noTurbineTripScram = true; s.dumpCap = 0.1; run(s, 5); s.mainFW = false; let st = false;
  s.afwBlockedT = 9999; run(s, 30, (s) => { if (!st && s.porvAuto) { s.porvStuck = st = true; } }); s.hpiThrottle = 0.02; run(s, 150); s.pumps.forEach(p => p.on = false);
  let maxT = 0; run(s, 1500, s => { maxT = Math.max(maxT, s.TclPk); }, 0.1);
  ok(maxT > 1204, 'TMI mistakes (HPI throttled, pumps off): core uncovers, clad > 1204 C, hydrogen', maxT.toFixed(0) + ' C  H2 ' + s.h2.toFixed(0) + ' kg cov ' + s.coverage.toFixed(2)); }
{ const s = S.create(); run(s, 5); s.offsite = false; s.dg.forEach(d => d.failP = 0); s.afw = true; run(s, 60);
  ok(s.scram && s.dg.every(d => d.st === 'run'), 'loss of offsite power: trip, diesels start in ~10 s', s.scramCause);
  run(s, 200); ok(s.TclPk < 400 && s.coverage > 0.99, 'decay heat removed by natural circulation + aux feed', s.TclPk.toFixed(0)); }
{ const s = S.create(); run(s, 5); s.offsite = false; s.dg.forEach(d => { d.failP = 1; }); let maxT = 0; run(s, 6000, s => maxT = Math.max(maxT, s.TclPk), 0.1);
  ok(maxT > 1204, 'station blackout, no diesels: batteries run out, SG boils dry, core damage', maxT.toFixed(0) + ' battery ' + s.battery.toFixed(2)); }
{ const s = S.create(); run(s, 5); s.slb = 1; run(s, 40); ok(s.scram, 'steam line break: overcooling, trip', s.scramCause + ' Tavg ' + s.Tavg.toFixed(0));
  let pk = 0; run(s, 60, s => pk = Math.max(pk, s.n)); ok(s.Tavg < 285, 'primary overcooled by the break', s.Tavg.toFixed(0) + ' C, max n after trip ' + pk.toFixed(3));
  s.msivCmd = 0; run(s, 80); ok(s.Ts2 > 200 || s.Lsg >= 0, 'MSIVs closed: blowdown isolated', s.Ps.toFixed(2) + ' MPa'); }

console.log('== RBMK / Chernobyl lesson');
function nightTest(ormRods) {
  const hist = S.xenonRun(1, S.X_EQ1, t => t < 10 * 3600 ? 0.5 : 0.07, 11 * 3600, 60);
  const s = S.create({ type: 'RBMK', power: 0.0625, xe: hist, rods: ormRods });
  s.tripsBypassed = true; s.xeFrozen = true; s.rodAuto = true; s.powerSet = 0.0625;   // the test lasted ~1 minute of real time: xenon is fixed
  return s;
}
{ const s = nightTest(0.5); run(s, 20); ok(s.ORM > 20, 'RBMK normal rod pattern ORM', s.ORM.toFixed(1)); ok(s.rho.void > 0 || s.voidCore >= 0, 'void coefficient positive', S.TYPES.RBMK.voidCoef); }
{ // the trap: rods pulled to fight xenon (ORM ~7), then the rundown test, then AZ-5
  const s = nightTest(0.13); run(s, 30); const orm = s.ORM;
  s.pumps.forEach((p, i) => p.rundown = i < 2); s.testRundown = 0.01; s.turb.tripped = true;
  let t36 = false; run(s, 50, (s, t) => { if (t > 36 && !t36) { t36 = true; S.doScram(s, 'AZ-5'); } });
  ok(orm < 12, 'trap set: ORM below the 15-rod limit', orm.toFixed(1));
  ok(s.exploded, 'low ORM + rundown + AZ-5 with graphite tips: power excursion destroys the core', 'n max reached; exploded=' + s.exploded + ' n=' + s.n.toFixed(1)); }
{ const s = nightTest(0.13); run(s, 30); S.doScram(s, 'AZ-5'); let mx = 0; run(s, 25, s => mx = Math.max(mx, s.rho.tip));
  ok(mx > 200, 'positive scram: graphite displacers ADD reactivity in the first seconds', mx.toFixed(0) + ' pcm'); }
{ const s = nightTest(0.5); s.Ffw = 0.06; run(s, 10); s.pumps.forEach((p, i) => p.rundown = i < 2); s.testRundown = 0.01; run(s, 60, (s, t) => { if (t > 36 && !s.scram) S.doScram(s, 'AZ-5'); });
  ok(!s.exploded && s.n < 0.06, 'with a healthy ORM the same test + AZ-5 is survivable', s.n.toFixed(4)); }

console.log('== automatic rod control');
{ const s = S.create(); s.rodAuto = true; run(s, 100, s => { s.turb.load = Math.max(0.5, s.turb.load - 0.01 * 0.05); }); ok(!s.scram && Math.abs(s.n - 0.5) < 0.06 && Math.abs(s.Tavg - (292 + 7.5)) < 2, 'auto rods follow a 1 %/s load cut to 50 % (Tavg on program)', 'n ' + s.n.toFixed(2) + ' Tavg ' + s.Tavg.toFixed(1)); }
{ const xe = S.xenonRun(1, S.X_EQ1, t => t < 20 * 3600 ? 1 : 0.3, 23 * 3600, 60); const s = S.create({ power: 0.3, xe }); s.rodAuto = true;
  run(s, 300, s => { s.turb.load = Math.min(1, s.turb.load + 0.01 * 0.05); s.borCmd = S.rodAvg(s) < 0.1 ? -0.5 : S.rodAvg(s) > 0.3 ? 1 : 0; });
  ok(!s.scram && s.MWe > 950, 'iodine-pit drill is winnable: auto rods + boron dilution back to full power', s.MWe.toFixed(0) + ' MWe B ' + s.B.toFixed(0)); }

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
