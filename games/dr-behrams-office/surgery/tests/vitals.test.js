// Physiology checks for the SUTURE SELF! vitals model: node games/dr-behrams-office/surgery/tests/vitals.test.js
// Time: the model runs TS=6 physiologic s per real s; frames are ≤0.05 s real (main.js caps dt), tested also at 0.25 s.
const path = require('path'), fs = require('fs');
const SV = require(path.join(__dirname, '..', 'js', 'vitals.js'));
let fail = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL ' + m); } };
const TS = SV.TS, FR = 1 / 20;
const run = (m, physSecs, dt, each) => { const steps = Math.round(physSecs / TS / dt); for (let i = 0; i < steps; i++) { const p = { sbp: m.sbp, hr: m.hr }; m.tick(dt); each && each(m, p, i); } return m; };
const avg = (m, physSecs) => { let s = 0, h = 0, d = 0, k = 0; run(m, physSecs, FR, () => { s += m.sbp; h += m.hr; d += m.dbp; k++; }); return { sbp: s / k, hr: h / k, dbp: d / k }; };
ok(TS === 6, 'time compression TS = 6');

// 1. Baselines and noise: realistic ranges, SpO2 97–100, no single-tick SBP change > 8 (or HR > 6) without an event
for (let seed = 1; seed <= 40; seed++) for (const preg of [true, false]) {
  const m = SV.create({ preg, ga: !preg, seed });
  const b = m.base;
  ok(preg ? b.sbp >= 110 && b.sbp <= 125 && b.dbp >= 65 && b.dbp <= 80 && b.hr >= 80 && b.hr <= 100 : b.sbp >= 110 && b.sbp <= 130 && b.dbp >= 70 && b.dbp <= 85 && b.hr >= 65 && b.hr <= 85, 'baseline seed ' + seed + ' preg=' + preg);
  let maxJ = 0, maxH = 0, lo = 1e9, hi = -1e9, spLo = 100, spHi = 0;
  for (const dt of [FR, 0.25]) run(m, 1800, dt, (m2, p) => { maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); maxH = Math.max(maxH, Math.abs(m2.hr - p.hr)); lo = Math.min(lo, m2.sbp); hi = Math.max(hi, m2.sbp); spLo = Math.min(spLo, m2.spo2); spHi = Math.max(spHi, m2.spo2); });
  ok(maxJ <= 8 && maxH <= 6, 'no jumps at rest (max ΔSBP ' + maxJ.toFixed(1) + ', ΔHR ' + maxH.toFixed(1) + ') seed ' + seed);
  ok(hi - b.sbp <= 12 && b.sbp - lo <= 12, 'resting SBP wanders only a little (' + lo.toFixed(0) + '–' + hi.toFixed(0) + ' vs ' + b.sbp.toFixed(0) + ')');
  ok(spLo >= 97 && spHi <= 100, 'SpO2 stays 97–100 at rest (' + spLo.toFixed(1) + '–' + spHi.toFixed(1) + ')');
  ok(Math.abs(m.map - (m.dbp + (m.sbp - m.dbp) / 3)) < 1e-9, 'MAP = DBP + (SBP − DBP)/3');
}

// 2. Hemorrhage classes by net loss / EBV (pregnant 100 mL/kg, non-pregnant 70 mL/kg), after the lag has settled
for (let seed = 1; seed <= 12; seed++) for (const preg of [true, false]) {
  const make = f => { const m = SV.create({ preg, seed }); m.addEBL(f * m.ebv); return m; };
  ok(Math.abs(make(0).ebv - (preg ? 100 : 70) * (preg ? 78 : 70)) < 1, 'EBV formula');
  let m = make(0.10); run(m, 600, FR); let v = avg(m, 120), b = m.base;
  ok(v.hr < Math.max(100, b.hr + 6) && Math.abs(v.sbp - b.sbp) < 8, `class I (<15%): essentially normal (${v.sbp.toFixed(0)}/${v.hr.toFixed(0)}) p=${preg}`);
  m = make(0.25); run(m, 600, FR); v = avg(m, 120);
  ok(v.hr >= 100 && v.hr <= 122, `class II: HR 100–120 (${v.hr.toFixed(0)}) p=${preg}`);
  ok(v.sbp >= b.sbp - 12, `class II: SBP maintained (${v.sbp.toFixed(0)} vs ${b.sbp.toFixed(0)})`);
  ok(v.sbp - v.dbp < (b.sbp - b.dbp) - 6, `class II: pulse pressure narrows (${(v.sbp - v.dbp).toFixed(0)} vs ${(b.sbp - b.dbp).toFixed(0)})`);
  m = make(preg ? 0.39 : 0.36); run(m, 600, FR); v = avg(m, 120);
  ok(v.sbp >= 78 && v.sbp <= 96 && v.hr >= 118 && v.hr <= 142, `class III: SBP ~80–90, HR 120–140 (${v.sbp.toFixed(0)}/${v.hr.toFixed(0)}) p=${preg}`);
  m = make(0.47); run(m, 600, FR); v = avg(m, 120);
  ok(v.sbp < 84 && v.hr > 135, `class IV (>40%): severe (${v.sbp.toFixed(0)}/${v.hr.toFixed(0)}) p=${preg}`);
  // pregnancy: tachycardia before hypotension — at 32% the pregnant SBP is still near baseline
  if (preg) { // same seed, same % loss: the pregnant patient keeps her SBP closer to baseline (tachycardia before hypotension)
    const np = SV.create({ preg: false, seed }); np.addEBL(0.34 * np.ebv); run(np, 600, FR); const vn = avg(np, 120);
    m = make(0.34); run(m, 600, FR); v = avg(m, 120);
    ok(v.hr >= 115 && (m.base.sbp - v.sbp) < (np.base.sbp - vn.sbp) - 5, `pregnant compensates longer at 34% (drop ${(m.base.sbp - v.sbp).toFixed(0)} vs ${(np.base.sbp - vn.sbp).toFixed(0)} mmHg, HR ${v.hr.toFixed(0)})`); }
  // lag: changes trend in over 30–90 s, not instantly; and a 900 mL bolus of loss never makes the SBP jump
  m = make(0); run(m, 120, FR); const h0 = m.hr; m.addEBL(0.3 * m.ebv); let maxJ = 0; run(m, 30, FR, (m2, p) => { maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); });
  ok(m.hr - h0 < 0.6 * (120 - h0), `HR lags a sudden loss (after 30 s: ${h0.toFixed(0)}→${m.hr.toFixed(0)})`);
  run(m, 150, FR, (m2, p) => { maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); });
  ok(m.hr >= 108, `…and has risen by 3 min (${m.hr.toFixed(0)})`); ok(maxJ <= 8, 'no single-tick SBP jump during hemorrhage (' + maxJ.toFixed(1) + ')');
  ok(SV.ebvClass(0.1) === 1 && SV.ebvClass(0.2) === 2 && SV.ebvClass(0.35) === 3 && SV.ebvClass(0.45) === 4, 'ATLS class cut-offs');
}

// 3. Recovery after treatment: blood/fluids bring HR and SBP back gradually (minutes, not a tick)
for (let seed = 1; seed <= 12; seed++) for (const preg of [true, false]) {
  const m = SV.create({ preg, seed }); m.addEBL(0.37 * m.ebv); run(m, 600, FR); const before = avg(m, 60);
  m.blood(0.25 * m.ebv); m.fluids(1000); let maxJ = 0;
  run(m, 20, FR, (m2, p) => { maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); }); const early = { sbp: m.sbp, hr: m.hr };
  ok(early.hr > before.hr - 12, `recovery is gradual: HR after 20 s ${early.hr.toFixed(0)} (from ${before.hr.toFixed(0)}) p=${preg}`);
  run(m, 600, FR, (m2, p) => { maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); }); const after = avg(m, 120);
  ok(after.hr < before.hr - 15 && after.hr < 112, `HR recovers after transfusion (${before.hr.toFixed(0)}→${after.hr.toFixed(0)})`);
  ok(after.sbp > before.sbp + 10 && after.sbp >= m.base.sbp - 12, `SBP recovers (${before.sbp.toFixed(0)}→${after.sbp.toFixed(0)}, base ${m.base.sbp.toFixed(0)})`);
  ok(maxJ <= 8, 'no SBP jump during recovery (' + maxJ.toFixed(1) + ')');
  // MTP keeps up with an ongoing loss
  const t = SV.create({ preg, seed }); t.mtp = true; t.addEBL(0.38 * t.ebv); run(t, 900, FR); ok(t.netFrac() < 0.2 && t.hr < 125, `MTP restores volume (net ${(t.netFrac() * 100).toFixed(0)}%, HR ${t.hr.toFixed(0)})`);
}

// 4. Spinal for cesarean: SBP dips 15–25% over 2–5 min; phenylephrine corrects within ~1–2 min with a slight HR drop
for (let seed = 1; seed <= 20; seed++) {
  const m = SV.create({ preg: true, seed }); m.autoPressor = false; const b = m.base; m.startSpinal(0.2);
  let tMin = 0, sMin = 1e9, maxJ = 0, t = 0;
  run(m, 420, FR, (m2, p) => { t += FR * TS; maxJ = Math.max(maxJ, Math.abs(m2.sbp - p.sbp)); if (m2.sbp < sMin) { sMin = m2.sbp; } });
  const sm = avg(m, 30); const drop = 1 - sm.sbp / b.sbp;
  ok(drop >= 0.13 && drop <= 0.27, `spinal dip ${(drop * 100).toFixed(0)}% (15–25% target) seed ${seed}`);
  // time to reach 85% of the final dip: 2–5 min
  const m2 = SV.create({ preg: true, seed }); m2.autoPressor = false; m2.startSpinal(0.2); let tt = 0; while (1 - m2.sbp / b.sbp < 0.85 * 0.2 && tt < 900) { m2.tick(FR); tt += FR * TS; }
  ok(tt >= 90 && tt <= 330, `spinal dip develops over ~2–5 min (noise ±30 s) (${(tt / 60).toFixed(1)} min)`);
  ok(maxJ <= 8, 'no SBP jump as the spinal sets in (' + maxJ.toFixed(1) + ')');
  const hrB = avg(m, 20).hr; m.pressor(); let tp = 0; while (m.sbp < b.sbp * 0.92 && tp < 600) { m.tick(FR); tp += FR * TS; }
  ok(tp >= 30 && tp <= 130, `phenylephrine corrects in ~1–2 min (${(tp / 60).toFixed(1)} min)`);
  run(m, 120, FR); const after = avg(m, 30); ok(after.hr < hrB - 2, `slight reflex HR drop on phenylephrine (${hrB.toFixed(0)}→${after.hr.toFixed(0)})`);
  // the auto-pressor (no surprise scheduled) lets the dip show, then treats it
  const a = SV.create({ preg: true, seed }); a.startSpinal(0.2); let lo = 1e9; run(a, 600, FR, x => { lo = Math.min(lo, x.sbp); }); const d2 = 1 - lo / a.base.sbp;
  ok(d2 >= 0.1 && d2 <= 0.27 && a.sbp > a.base.sbp * 0.9, `auto phenylephrine: dip ${(d2 * 100).toFixed(0)}% then recovered (${a.sbp.toFixed(0)})`);
}

// 5. Events are smooth and resolve; desaturation is the only thing that takes SpO2 below 97
{
  const m = SV.create({ preg: true, ga: true, seed: 3 }); run(m, 120, FR);
  const e = m.effect({ spo2: -10, hr: 12 }, { on: 20, hold: Infinity, off: 40 }); run(m, 120, FR);
  ok(m.spo2 < 92 && m.spo2 > 86, 'desaturation event shows on the monitor (' + m.spo2.toFixed(0) + ')');
  m.release(e); run(m, 300, FR); ok(m.spo2 >= 97, 'SpO2 recovers once treated (' + m.spo2.toFixed(0) + ')'); ok(m.fx.length === 0, 'resolved effects are removed');
  const g = SV.create({ preg: false, ga: true, seed: 4 }); const hb = g.hr; g.effect({ hr: -28, sbp: -8 }, { on: 4, hold: 15, off: 25 }); let lo = 1e9; run(g, 120, FR, x => { lo = Math.min(lo, x.hr); });
  ok(lo < hb - 15 && Math.abs(g.hr - hb) < 8, `vagal bradycardia is transient (${hb.toFixed(0)}→${lo.toFixed(0)}→${g.hr.toFixed(0)})`);
  const pn = SV.create({ preg: false, ga: true, seed: 5 }); const s0 = avg(pn, 60); pn.effect({ sbp: 8, dbp: 6, hr: 4, etco2: 4 }, { on: 60, hold: Infinity }); run(pn, 300, FR); const s1 = avg(pn, 60);
  ok(s1.sbp - s0.sbp > 3 && s1.sbp - s0.sbp < 16 && s1.hr - s0.hr < 10, `insufflation: mild BP/HR rise (+${(s1.sbp - s0.sbp).toFixed(0)} SBP, +${(s1.hr - s0.hr).toFixed(0)} HR)`);
}

// 6. Wiring: main.js uses the model, fills live numbers into anesthesia lines, shows MAP; texts carry no stale numbers
const D = path.join(__dirname, '..'), main = fs.readFileSync(path.join(D, 'js', 'main.js'), 'utf8'), cases = fs.readFileSync(path.join(D, 'js', 'cases.js'), 'utf8'), html = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
ok(html.indexOf('js/vitals.js') > 0 && html.indexOf('js/vitals.js') < html.indexOf('js/main.js'), 'vitals.js loads before main.js');
ok(/SVITALS\.create/.test(main) && /Math\.round\(V\.map\)/.test(main), 'main.js uses the model and shows MAP');
ok(!/OFF\[/.test(main), 'old offset model removed');
global.window = {}; new Function(cases)(); const S = window.SS;
for (const id in S.SURPRISES) { const x = S.SURPRISES[id]; if (x.vitals || /gas/.test(x.who)) ok(!/\b(BP \d|Sats are \d|\d+\/\d+|CO2 is \d)/.test(x.say + ' ' + x.quiz.q), id + ': no hard-coded vitals in dialogue (' + x.say + ')'); }
for (const q of S.QUIPS.gasIdle.concat(S.QUIPS.gasWarn)) ok(!/\b\d{2,3}\b/.test(q), 'anesthesia quip uses live numbers: ' + q);
console.log(fail ? fail + ' of ' + n + ' FAILED' : 'ALL ' + n + ' VITALS CHECKS PASSED');
process.exit(fail ? 1 : 0);
