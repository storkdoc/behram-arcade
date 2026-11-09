/* OB TRIAGE — case content. All patients and staff are fictional; Dr. Steven Behram is the attending.
 * Interpretation: 2008 NICHD three-tier system; management: ACOG Practice Bulletins 106 (2009) and 116 (2010), now consolidated in
 * ACOG Clinical Practice Guideline No. 10 (Oct 2025), ACOG Practice Advisory on oxygen (Jan 2022), ACOG CO 712 (intrapartum fever),
 * ACOG PB 219 (operative vaginal birth), ACOG PB 205 (VBAC). Teaching game, not a substitute for supervised clinical training.
 * Times: 'hist' events are seconds into the 30-minute strip the student reads. One call per patient: choice.opts (best first; shown shuffled),
 * grades best | ok (acceptable, not ideal) | meh (not indicated) | wrong | harm. */
(function (root) {
  'use strict';
  var C = {};
  C.TEAM = {
    behram: { name: 'Dr. Behram', role: 'Attending OB/GYN' },
    nurse: { name: 'Paige Toco, RN', role: 'L&D nurse', color: '#e46a9a', initials: 'PT' },
    gas: { name: 'Dr. Ana Stasia', role: 'Anesthesiology', color: '#4b86c9', initials: 'AS' },
    peds: { name: 'Dr. Neo Nate', role: 'NICU', color: '#3c9c6a', initials: 'NN' }
  };

  /* helpers */
  var V = function (t, hr, bp, rr, sp) { return { T: t, HR: hr, BP: bp, RR: rr || 18, SpO2: sp || 98 }; };

  C.CASES = [
    /* ---------------- Chapter 1: the basics ---------------- */
    { id: 'quiet', ch: 1, title: 'Quiet Night', tag: 'A Category I strip, and a pop', bed: 'LDR 2',
      pt: { name: 'Rosa Delgado', age: 27, gp: 'G2P1001', ga: '39w4d', cc: 'Contractions since dinner (triage)',
        hx: ['Uncomplicated pregnancy, prior SVD 3 years ago', 'Irregular contractions, walking 2 h in triage', 'No leaking fluid, no bleeding, good movement'], vitals: V('36.9', 82, '118/74'),
        exam: 'SVE 2 / 50 / −3, unchanged after 2 h; membranes intact', meds: ['None'] },
      present: 'Rosa is 39 and 4, second baby, contracting since dinner. Cervix hasn’t changed in two hours. Read the strip, then make the call.',
      nurse: 'She’s comfortable. Contractions every 4 or 5 minutes. She asks if she can go home and sleep.',
      p: { base: 135, ucInt: 4.6, accRate: 0.3, head: 0 },
      choice: { q: "What’s your call for Rosa?", hint: "Is this a reactive Category I strip, and has her cervix changed at all in two hours?", opts: [
        { t: "Discharge home with labor precautions", g: "best", why: "Reactive Category I tracing (baseline 135, moderate variability, accels, no decels), intact membranes and no cervical change in 2 hours: latent/prodromal labor. Home with labor precautions and kick counts." },
        { t: "Admit to L&D for active labor", g: "wrong", why: "Active labor means ~6 cm or cervical change. 2 cm unchanged after 2 hours is latent labor; admitting now invites unnecessary interventions." },
        { t: "Admit and augment with oxytocin", g: "wrong", why: "No indication to augment latent labor in a term multip with a normal tracing." },
        { t: "Biophysical profile before discharge", g: "meh", why: "A reactive NST already tells you the fetus is well-oxygenated right now. A BPP adds nothing here." },
        { t: "Cesarean delivery for failure to progress", g: "harm", why: "She is not even in active labor. There is no labor arrest and no fetal indication." },
        { t: "Terbutaline to stop preterm contractions", g: "wrong", why: "She is 39 weeks: these are not preterm contractions, and there is no tachysystole." } ] },
      debrief: { summary: 'A textbook Category I tracing: baseline 135, moderate variability, accelerations, no decelerations, contractions every 4–5 minutes. With no cervical change and intact membranes she is in latent labor: home with precautions.',
        pearls: ['Category I predicts normal fetal acid–base status at the time of observation. Routine care.', 'Accelerations (≥15 bpm for ≥15 s at ≥32 weeks) reliably exclude metabolic acidemia at that moment.', 'Latent labor with a Category I strip and intact membranes is safely managed at home; return for regular painful contractions, leaking fluid, bleeding or fewer movements.'] } },

    { id: 'heads', ch: 1, title: 'Heads Up', tag: 'Early decelerations', bed: 'LDR 5',
      pt: { name: 'Hana Kobayashi', age: 30, gp: 'G1P0', ga: '40w1d', cc: 'Painful contractions, water broke',
        hx: ['Walked in: membranes ruptured 2 h ago, clear fluid', 'Contractions every 3 min, painful', 'GBS negative'], vitals: V('37.1', 86, '112/68'),
        exam: 'SVE 8 / 100 / +1, OA', meds: ['None, no epidural yet'] },
      present: 'Hana is a first-timer at 40 and 1 in triage: water broke, 8 centimeters. The nurse is worried about “dips”. Name them, then decide.',
      nurse: 'Every contraction she dips a little. I just want a doctor’s eyes on it.',
      p: { base: 140, ucInt: 2.9, head: 0.95, accRate: 0.16, rom: 1, ucDur: 90 },
      choice: { q: "What’s your call for Hana?", hint: "Line up each dip with its contraction. Gradual or abrupt? Nadir with the peak or after it? And she’s 8 cm.", opts: [
        { t: "Admit to L&D for active labor", g: "best", why: "8 cm with ruptured membranes is active labor. The dips are early decelerations (gradual, nadir with the contraction peak): head compression, Category I. Admit, epidural if she wants it, routine care." },
        { t: "Discharge home: she is in latent labor", g: "harm", why: "8 cm and ruptured is active labor, possibly close to delivery. Never send this patient home." },
        { t: "Amnioinfusion via IUPC", g: "wrong", why: "These are early decels (head compression), not variables. Amnioinfusion treats recurrent variables." },
        { t: "Intrauterine resuscitation, then recheck", g: "meh", why: "Early decelerations are benign and need no resuscitation. Admit her." },
        { t: "Urgent cesarean for recurrent decels", g: "harm", why: "Early decels are Category I. No fetal indication for cesarean." },
        { t: "Terbutaline to space the contractions", g: "wrong", why: "Contractions every 3 minutes is normal labor, and the tracing is Category I." } ] },
      debrief: { summary: 'Recurrent early decelerations: gradual, shallow, the nadir lines up with the peak of each contraction, a mirror image. Category I. At 8 cm with ruptured membranes she is in active labor: admit.',
        pearls: ['Early = gradual (≥30 s onset to nadir) AND nadir at the same time as the contraction peak.', 'Early decelerations are head compression, benign, Category I.', 'If it looks early but is deep, abrupt or late in timing, call it what it is: variable or late.'] } },

    { id: 'pit', ch: 2, title: 'Pit Stop', tag: 'Oxytocin tachysystole + recurrent lates', bed: 'LDR 6',
      pt: { name: 'Gloria Vance', age: 33, gp: 'G1P0', ga: '41w2d', cc: 'Induction for late-term pregnancy',
        hx: ['Induction day 2, AROM 3 h ago, clear', 'Oxytocin titrated up every 30 min per protocol', 'Epidural in place'], vitals: V('37.0', 88, '122/76'),
        exam: 'SVE 5 / 80 / −1, vertex', meds: ['Oxytocin 14 mU/min', 'Epidural'] },
      present: 'Gloria, 41 and 2, induction. Oxytocin at 14. The resident wants to go up again. Look at the contractions first, and at what the baby does after each one.',
      nurse: 'She’s contracting a lot. Pump’s at 14. Resident said keep titrating…',
      p: { base: 145, ucInt: 4.6, ucSens: 0.16, oxy: 14, oxyEff: 14, upi: 0.13, tachyLate: 1, accRate: 0.08, rom: 1 },
      choice: { q: "Oxytocin is at 14. What do you do?", hint: "Count the contractions in 10 minutes, then look where each dip’s nadir falls relative to the contraction peak.", opts: [
        { t: "Stop the oxytocin infusion", g: "best", why: "Tachysystole (>5 contractions/10 min averaged over 30) with recurrent late decels on oxytocin: turn it off (with lateral position and fluids). The lates usually resolve as the uterus rests." },
        { t: "Increase oxytocin to 16 mU/min", g: "harm", why: "More oxytocin into tachysystole with recurrent lates worsens fetal hypoxemia." },
        { t: "Cesarean delivery for recurrent lates", g: "wrong", why: "Moderate variability, and a reversible cause: resuscitate first. Most tachysystole-related lates resolve once oxytocin is off." },
        { t: "Amnioinfusion through an IUPC", g: "wrong", why: "Amnioinfusion treats variable decels (cord compression), not lates." },
        { t: "Continue current oxytocin and observe", g: "wrong", why: "Tachysystole with recurrent lates is not something to watch on the same dose." },
        { t: "Scalp stimulation only", g: "meh", why: "Moderate variability already tells you she is not acidemic now. Fix the cause: the oxytocin." } ] },
      debrief: { summary: 'Oxytocin-induced tachysystole (>5 contractions in 10 minutes averaged over 30) with recurrent late decelerations and moderate variability: Category II. Stopping oxytocin, lateral positioning and a fluid bolus let the uterus rest and the lates resolve over 10–20 minutes.',
        pearls: ['Tachysystole = >5 contractions per 10 min averaged over 30 min. Always say “with” or “without” FHR changes.', 'Late decels mean uteroplacental insufficiency: the nadir comes after the contraction peak.', 'Moderate variability is reassuring for now, but recurrent lates that persist will eventually take it away.', 'Restart oxytocin after resolution: if it was off <20–30 min, restart at no more than the prior rate (many protocols use half); if off longer, at the initial dose.'] } },

    { id: 'miso', ch: 2, title: 'Miso Hungry', tag: 'Tachysystole without FHR changes', bed: 'Triage 3',
      pt: { name: 'Aaliyah Brooks', age: 25, gp: 'G2P1001', ga: '39w1d', cc: 'Elective induction, misoprostol',
        hx: ['Misoprostol 25 mcg vaginally ×2, last dose 3 h ago', 'Membranes intact', 'Next dose due now'], vitals: V('36.8', 84, '116/70'),
        exam: 'SVE 2 / 60 / −2, vertex', meds: ['Misoprostol 25 mcg PV q4h'] },
      present: 'Aaliyah: induction at 39 and 1 with misoprostol. The nurse is about to put in dose three. Count the contractions before she does.',
      nurse: 'Dose three is drawn up. She says the cramps are “a lot”, but she’s handling it.',
      p: { base: 130, ucInt: 6.5, miso: 1.25, misoK: 4.2, tachyLate: 0, upi: 0.05, accRate: 0.26, ucDur: 78 },
      choice: { q: "Dose three is drawn up. Your call?", hint: "Count the contractions. Then decide whether the fetus is bothered by them.", opts: [
        { t: "Hold the next misoprostol dose", g: "best", why: "Tachysystole WITHOUT FHR changes (Category I) on misoprostol: do not redose. Watch, support, and it fades as the drug wears off." },
        { t: "Give the third misoprostol dose", g: "harm", why: "Redosing a prostaglandin during tachysystole risks hyperstimulation with fetal compromise." },
        { t: "Start oxytocin right away", g: "harm", why: "Oxytocin should not start until at least 4 hours after the last misoprostol dose, and she is already contracting too often." },
        { t: "Cesarean delivery for tachysystole", g: "harm", why: "Tachysystole with a Category I tracing is not an indication for cesarean." },
        { t: "Biophysical profile, then redose", g: "wrong", why: "The issue is the uterus, not fetal well-being. Redosing is the wrong part." } ] },
      debrief: { summary: 'Misoprostol tachysystole WITHOUT FHR changes: baseline 130, moderate variability, accelerations, no decels, Category I. Hold the next dose, support, watch. It fades as the drug wears off.',
        pearls: ['Tachysystole is about the uterus; the category is about the fetus. Describe both.', 'Do not redose misoprostol during tachysystole; oxytocin should not start until ≥4 h after the last misoprostol dose.', 'Terbutaline is for tachysystole that persists with FHR changes.'] } },

    { id: 'cord', ch: 2, title: 'Cord Blimey', tag: 'Recurrent variable decelerations', bed: 'LDR 3',
      pt: { name: 'Fatima Haddad', age: 29, gp: 'G3P2002', ga: '39w0d', cc: 'Active labor after AROM',
        hx: ['AROM 40 min ago for augmentation, scant fluid', 'Repositioned left and right: no change', 'Two prior SVDs, largest 3.6 kg', 'No oxytocin'], vitals: V('37.2', 90, '120/78'),
        exam: 'SVE 6 / 90 / −1, vertex', meds: ['Epidural'] },
      present: 'Fatima, third baby, 6 centimeters. We broke her water 40 minutes ago and there wasn’t much fluid. Now the strip is doing this. Name it.',
      nurse: 'These dips are deep and fast. We turned her left, then right. Still dipping.',
      p: { base: 140, ucInt: 2.9, cord: 0.7, cordPos: 0.3, rom: 1, accRate: 0.12 },
      choice: { q: "She’s been turned side to side. Next step?", hint: "Abrupt or gradual? Scant fluid after AROM, and repositioning did not fix it.", opts: [
        { t: "Amnioinfusion through an IUPC", g: "best", why: "Recurrent variable decels (cord compression) after AROM with scant fluid, moderate variability, first stage, repositioning failed: amnioinfusion reduces variables and cesareans for them." },
        { t: "Cesarean delivery for recurrent variables", g: "wrong", why: "Category II with moderate variability and a treatable cause: try amnioinfusion first." },
        { t: "Start oxytocin to speed delivery", g: "harm", why: "More contractions means more cord compression." },
        { t: "Terbutaline to stop contractions", g: "wrong", why: "There is no tachysystole; contractions are every 3 minutes." },
        { t: "Continue routine monitoring only", g: "wrong", why: "Recurrent variables need action, not routine checks." },
        { t: "Forceps delivery now", g: "harm", why: "She is 6 cm. Operative vaginal delivery requires full dilation." } ] },
      debrief: { summary: 'Recurrent variable decelerations (abrupt, deep, V- and U-shaped, some with shoulders) after AROM with scant fluid: cord compression. Moderate variability: Category II. Position change, rule out prolapse, then amnioinfusion.',
        pearls: ['Variable = abrupt: <30 s from onset to nadir, ≥15 bpm, ≥15 s, <2 min.', 'Recurrent = with ≥50% of contractions over 20 minutes.', 'Worrisome features: slow return, loss of variability, rising baseline, overshoots.', 'Amnioinfusion is for the first stage, through an IUPC, for recurrent variables.'] } },

    /* ---------------- Chapter 2: things go wrong ---------------- */
    { id: 'drop', ch: 3, title: 'The Drop', tag: 'Post-epidural hypotension, prolonged decel', bed: 'LDR 8',
      pt: { name: 'Megan O’Shea', age: 31, gp: 'G1P0', ga: '39w3d', cc: 'Labor, epidural just placed',
        hx: ['Spontaneous labor, oxytocin augmentation at 4 mU/min', 'Epidural placed 8 min ago', 'Strip Category I all morning'], vitals: V('36.9', 112, '78/42'),
        exam: 'SVE 5 / 90 / −1, vertex', meds: ['Oxytocin 4 mU/min', 'Epidural (just bolused)'] },
      present: 'Megan just got her epidural. Her pressure is 78 over 42 and the baby is not happy. What’s going on, and what do we do in the next 2 minutes?',
      nurse: 'BP 78/42. She says she feels nauseated and lightheaded. Heart rate’s been down a few minutes!',
      p: { base: 140, ucInt: 3.6, ucSens: 0.04, oxy: 4, oxyEff: 4, accRate: 0.22, rom: 1 },
      hist: [{ t: 1590, ramp: ['hypo', 0.9, 25] }],
      choice: { q: "BP 78/42 after the epidural. Your one move?", hint: "Why did the heart rate fall right after the epidural? Look at her blood pressure.", opts: [
        { t: "Phenylephrine, fluids, left tilt", g: "best", why: "A prolonged decel from post-neuraxial hypotension: treat the cause. Vasopressor, IV fluid bolus and lateral position (plus stop oxytocin and check her) usually recover it within minutes." },
        { t: "Stat cesarean for bradycardia", g: "wrong", why: "Most post-epidural prolonged decels recover with resuscitation. Prepare for delivery only if it does not recover (often by 8–10 min)." },
        { t: "Terbutaline for the prolonged decel", g: "meh", why: "Only if tachysystole or a tetanic contraction is driving it. Here it is the blood pressure." },
        { t: "Amnioinfusion through an IUPC", g: "wrong", why: "This is not cord compression. It is low maternal blood pressure." },
        { t: "Face-mask oxygen and observe", g: "wrong", why: "Her saturation is normal. Oxygen does not fix uteroplacental hypoperfusion from hypotension (ACOG 2022)." },
        { t: "Operative vaginal delivery now", g: "harm", why: "She is 5 cm. Not possible." } ] },
      debrief: { summary: 'A prolonged deceleration (≥15 bpm below baseline for ≥2 and <10 min) right after epidural placement, from maternal hypotension. Category II. Vasopressor, fluids, lateral position, stop oxytocin and an exam: it recovers in minutes.',
        pearls: ['Prolonged decel: ≥2 min and <10 min. ≥10 min is a baseline change (bradycardia).', 'Post-neuraxial causes: hypotension, and uterine tachysystole/hypertonus after rapid pain relief.', 'Always ask “why”: hypotension, tachysystole, cord prolapse, rapid descent, abruption, rupture.'] } },

    { id: 'prolapse', ch: 3, title: 'Cord Prolapse', tag: 'Abrupt bradycardia after SROM', bed: 'Triage 1',
      pt: { name: 'Destiny Carter', age: 22, gp: 'G2P1001', ga: '37w2d', cc: 'Leaking fluid, contractions',
        hx: ['Polyhydramnios (AFI 27)', 'Unengaged vertex on admission ultrasound', 'Gush of fluid 6 min ago'], vitals: V('36.8', 96, '124/80'),
        exam: 'Admission SVE 3 / 50 / −3, ballotable', meds: ['None'] },
      present: 'Destiny: polyhydramnios, head way up at −3, and she just had a big gush. Look at the end of this strip. Fast.',
      nurse: 'She had a big gush in the bathroom and the heart rate went down right after!',
      p: { base: 140, ucInt: 4, accRate: 0.24 },
      hist: [{ t: 1480, set: { rom: 1 }, ramp: ['prolapse', 1, 8] }],
      choice: { q: "Gush, then this. Your call?", hint: "Abrupt drop right after a gush with a high head and polyhydramnios. What do you feel on exam?", opts: [
        { t: "Elevate the head, stat cesarean", g: "best", why: "Overt cord prolapse: abrupt prolonged decel right after SROM with an unengaged head. Hand in, elevate the presenting part off the cord, and emergency cesarean." },
        { t: "Manually replace the cord, then observe", g: "harm", why: "Do not try to replace the cord. Elevate the presenting part and deliver." },
        { t: "Amnioinfusion through an IUPC", g: "harm", why: "Contraindicated with a prolapsed cord." },
        { t: "Operative vaginal delivery now", g: "harm", why: "3 cm with the head at −3. Impossible." },
        { t: "Left lateral position and fluids", g: "wrong", why: "Repositioning alone will not take the head off a prolapsed cord." },
        { t: "Terbutaline and continue labor", g: "wrong", why: "Terbutaline can help on the way to the OR, but continuing labor with a prolapsed cord is wrong." } ] },
      debrief: { summary: 'Overt cord prolapse after SROM with an unengaged head and polyhydramnios: an abrupt, prolonged deceleration to the 60s. The NICHD category is II (variability was still present), but this is an obstetric emergency: elevate the presenting part, position, and emergency cesarean.',
        pearls: ['Category is about the tracing; the clinical picture decides urgency. Cord prolapse, uterine rupture and abruption need delivery even if the strip is “only” Category II.', 'Risk factors: unengaged presenting part, malpresentation, polyhydramnios, prematurity, AROM with a high head.', 'Hand stays in, elevating the presenting part, until the baby is delivered.'] } },

    { id: 'chorio', ch: 3, title: 'Hot Mess', tag: 'Intraamniotic infection, fetal tachycardia', bed: 'LDR 4',
      pt: { name: 'Priya Raman', age: 28, gp: 'G1P0', ga: '39w5d', cc: 'Fever in labor',
        hx: ['ROM 22 h, oxytocin augmentation', 'Temp 38.9 °C, uterine tenderness, foul-smelling fluid', 'WBC 19K'], vitals: V('38.9', 118, '118/70'),
        exam: 'SVE 6 / 90 / 0, vertex', meds: ['Oxytocin 8 mU/min', 'Epidural'] },
      present: 'Priya has a temp of 38.9, mom’s heart rate is 118, and the baby is running fast. Interpret it, then treat the cause.',
      nurse: 'She’s burning up. Fluid smells off. The baby’s heart rate keeps creeping up.',
      p: { base: 141, fever: 1.9, varTarget: 4.2, accRate: 0, upi: 0.12, oxy: 8, oxyEff: 8, ucInt: 4.2, ucSens: 0.06, rom: 1 },
      choice: { q: "Temp 38.9 and a fast baby. Your call?", hint: "What is driving the fetal heart rate up? Look at the mother.", opts: [
        { t: "Ampicillin, gentamicin, acetaminophen", g: "best", why: "Fetal tachycardia with minimal variability in a febrile patient with tenderness and foul fluid: intraamniotic infection. Antibiotics and an antipyretic; continue labor." },
        { t: "Cesarean delivery for chorioamnionitis", g: "wrong", why: "Intraamniotic infection alone is not an indication for cesarean. Treat and continue labor." },
        { t: "Stop oxytocin and observe", g: "wrong", why: "No tachysystole, no decels. The problem is the infection." },
        { t: "Amnioinfusion through an IUPC", g: "wrong", why: "There are no variable decels to treat." },
        { t: "Terbutaline for fetal tachycardia", g: "harm", why: "Terbutaline is a β-agonist: it raises maternal and fetal heart rates." },
        { t: "Face-mask oxygen for the tachycardia", g: "wrong", why: "Oxygen does not treat a fever or an infection." } ] },
      debrief: { summary: 'Fetal tachycardia (baseline >160) with minimal variability and no accelerations in a laboring patient with fever, maternal tachycardia, uterine tenderness and foul fluid: intraamniotic infection. Category II. Antibiotics, antipyretic, continue labor.',
        pearls: ['Tachycardia: baseline >160 for ≥10 min. Causes: maternal fever/infection, β-agonists, maternal hyperthyroidism, fetal anemia, arrhythmia, early hypoxemia.', 'Intraamniotic infection: fever ≥39.0, or 38.0–38.9 plus another sign (WBC, purulent fluid, fetal tachycardia).', 'Antipyretic first lowers the FHR; then reassess.'] } },

    { id: 'abruption', ch: 4, title: 'Ripped Off', tag: 'Placental abruption', bed: 'Triage 2',
      pt: { name: 'Tanya Mitchell', age: 35, gp: 'G4P3003', ga: '36w2d', cc: 'Sudden abdominal pain and bleeding',
        hx: ['Chronic hypertension, missed meds this week', 'Pain started 1 h ago, constant', 'Dark red vaginal bleeding, soaking a pad'], vitals: V('37.0', 108, '156/98'),
        exam: 'Uterus firm, tender between contractions. SVE 3 / 60 / −2', meds: ['None'] },
      present: 'Tanya: chronic hypertension, sudden pain, dark bleeding, a board-like uterus. Look at the contractions AND the decels.',
      nurse: 'She’s in a lot of pain and the uterus won’t relax. Bleeding is steady.',
      p: { base: 148, abrupt: 0.85, upi: 0.32, reserve: 0.33, rMin: 0.3, rMax: 0.36, accRate: 0, ucInt: 3 },
      choice: { q: "Bleeding, board-like uterus. Your call?", hint: "Look at the contraction channel (frequency, resting tone) and what follows each contraction.", opts: [
        { t: "Urgent cesarean delivery", g: "best", why: "Abruption: frequent low-amplitude contractions on a high resting tone, recurrent lates with minimal variability. With bleeding and a worsening tracing, deliver (with labs and blood ready)." },
        { t: "Terbutaline for the contractions", g: "harm", why: "Tocolysis in a bleeding abruption with fetal compromise worsens maternal hemodynamics and delays delivery." },
        { t: "Amnioinfusion through an IUPC", g: "harm", why: "Not indicated in abruption." },
        { t: "Admit, observe, recheck in an hour", g: "harm", why: "An abruption with recurrent lates will not get better by watching." },
        { t: "Oxytocin augmentation", g: "harm", why: "More uterine activity into an abruption with lates." },
        { t: "Biophysical profile first", g: "wrong", why: "The tracing and the story already tell you what to do. Don’t delay." } ] },
      debrief: { summary: 'Placental abruption: frequent low-amplitude contractions on an elevated resting tone, recurrent late decels and minimal variability, which can worsen to absent variability (Category III). Stabilize, labs and blood, and deliver by cesarean.',
        pearls: ['Classic abruption: high-frequency, low-amplitude contractions with high resting tone, plus lates or a prolonged decel.', 'Recurrent lates + absent variability = Category III: deliver if resuscitation does not fix it fast.', 'Watch the mother: DIC, hemorrhage, Kleihauer-Betke and RhIG if Rh-negative.'] } },

    { id: 'rupture', ch: 4, title: 'Scar Tissue', tag: 'TOLAC, uterine rupture', bed: 'LDR 1',
      pt: { name: 'Lena Fischer', age: 34, gp: 'G2P1001', ga: '39w6d', cc: 'TOLAC on oxytocin',
        hx: ['One prior low transverse cesarean (breech)', 'Oxytocin augmentation 10 mU/min', 'Epidural'], vitals: V('36.9', 92, '118/72'),
        exam: 'SVE 7 / 100 / 0, vertex', meds: ['Oxytocin 10 mU/min', 'Epidural'] },
      present: 'Lena is a TOLAC on oxytocin. She suddenly has pain through her epidural. Look at the end of the strip and tell me what you’re worried about.',
      nurse: 'She says something “popped” and it hurts even with the epidural. And the heart rate…',
      p: { base: 140, ucInt: 3.6, ucSens: 0.05, oxy: 10, oxyEff: 10, cord: 0.45, accRate: 0.15, rom: 1 },
      hist: [{ t: 1610, set: { rupture: 1, cord: 0 } }],
      choice: { q: "TOLAC, sudden pain. Your call?", hint: "What happened to the contractions and the station? What does that mean in a TOLAC?", opts: [
        { t: "Stat cesarean (laparotomy)", g: "best", why: "TOLAC with sudden pain, prolonged bradycardia, loss of contractions and loss of station: uterine rupture. Emergency laparotomy and delivery." },
        { t: "Increase oxytocin for the lost contractions", g: "harm", why: "Loss of contractions after a pop is a rupture sign, not a reason for more oxytocin." },
        { t: "Intrauterine resuscitation and observe", g: "wrong", why: "Resuscitation won’t fix a ruptured uterus. Go to the OR." },
        { t: "Vacuum delivery now", g: "harm", why: "She is 7 cm and the head has gone up. Not possible." },
        { t: "Scalp stimulation during the brady", g: "wrong", why: "Scalp stimulation only reassures when the baseline is normal. During a bradycardia it wastes minutes." },
        { t: "Terbutaline for the deceleration", g: "wrong", why: "This is rupture, not tachysystole." } ] },
      debrief: { summary: 'TOLAC with sudden pain, then a prolonged deceleration/bradycardia, loss of contractions and loss of station: uterine rupture. The FHR abnormality is the most common first sign. Emergency laparotomy.',
        pearls: ['Signs of rupture: prolonged decel or bradycardia (most common), pain, bleeding, loss of station, loss of contractions, change in uterine shape, maternal tachycardia/hypotension.', 'Recurrent variables often come first.', 'TOLAC needs immediately available staff for an emergency cesarean (ACOG PB 205).'] } },

    { id: 'sine', ch: 4, title: 'Sine of the Times', tag: 'Sinusoidal pattern', bed: 'Triage 4',
      pt: { name: 'Mei Lin Zhou', age: 26, gp: 'G2P1001', ga: '36w4d', cc: 'Decreased fetal movement since yesterday',
        hx: ['Rear-ended in a car accident 2 days ago, seat belt on, “just sore”', 'Blood type O negative, RhIG at 28 weeks', 'Irregular tightenings'], vitals: V('36.8', 90, '112/70'),
        exam: 'Uterus soft, non-tender. Cervix closed', meds: ['Prenatal vitamins'] },
      present: 'Mei Lin, 36 and 4, decreased movement after a car accident 2 days ago. Look at the shape of this strip. That is not variability.',
      nurse: 'It’s so… regular. Like a wave. No accels the whole time.',
      p: { base: 145, sinus: 1, ucInt: 9, ucAmp: 28, accRate: 0, reserveRec: 0 },
      choice: { q: "Decreased movement after a crash. Your call?", hint: "Is that wiggle real variability? Smooth, regular, 3–5 cycles a minute, no accels.", opts: [
        { t: "Expedited cesarean delivery", g: "best", why: "A true sinusoidal pattern (Category III) at 36 weeks after trauma suggests severe fetal anemia from fetomaternal hemorrhage. Kleihauer-Betke, NICU with O-negative blood, and deliver." },
        { t: "Biophysical profile, then decide", g: "wrong", why: "A sinusoidal pattern is Category III by itself. A BPP only delays delivery of an anemic fetus." },
        { t: "Intrauterine resuscitation, then recheck", g: "wrong", why: "No resuscitation fixes fetal anemia." },
        { t: "Discharge after a reactive recheck", g: "harm", why: "There are no accels and the pattern is sinusoidal. Sending her home could be fatal." },
        { t: "Kleihauer-Betke and observe overnight", g: "harm", why: "Send the Kleihauer-Betke, but watching a sinusoidal pattern lets the fetus get worse." },
        { t: "Terbutaline tocolysis", g: "wrong", why: "Nothing to relax: the problem is fetal anemia." } ] },
      debrief: { summary: 'A true sinusoidal pattern: smooth sine-wave undulation at 3–5 cycles/min, no variability, no accelerations, persisting ≥20 minutes. Category III, here from fetomaternal hemorrhage after trauma. Kleihauer-Betke, RhIG for an Rh-negative mother, NICU with blood, and deliver.',
        pearls: ['Sinusoidal: smooth, regular sine wave, 3–5 cycles/min, ≥20 min. It is Category III on its own.', 'Causes: severe fetal anemia (alloimmunization, fetomaternal hemorrhage, vasa previa, twin-twin transfusion), severe hypoxia.', 'Pseudosinusoidal after IV opioids is short-lived and has normal variability around it.'] } },

    /* ---------------- Chapter 3: judgment ---------------- */
    { id: 'mag', ch: 5, title: 'Mag Fog', tag: 'Minimal variability on magnesium', bed: 'LDR 7',
      pt: { name: 'Keisha Grant', age: 32, gp: 'G1P0', ga: '37w1d', cc: 'Preeclampsia with severe features, induction',
        hx: ['BP 166/108 on admission, headache resolved', 'Magnesium sulfate 2 g/h for seizure prophylaxis', 'Oxytocin 4 mU/min'], vitals: V('37.0', 84, '148/94'),
        exam: 'SVE 4 / 80 / −1, AROM clear', meds: ['Magnesium sulfate 2 g/h', 'Labetalol', 'Oxytocin 4 mU/min'] },
      present: 'Keisha: preeclampsia with severe features on magnesium. The tracing looks… sleepy. Is this the magnesium or the baby? How do we find out?',
      nurse: 'Variability’s been flat-ish since the mag started. No accels. No decels either.',
      p: { base: 140, mag: 1, accRate: 0, ucInt: 3.8, ucSens: 0.04, oxy: 4, oxyEff: 4, rom: 1 },
      choice: { q: "Sleepy strip on magnesium. Your call?", hint: "Minimal variability, no decels, on magnesium. How can you tell sleepy from sick at the bedside?", opts: [
        { t: "Digital scalp stimulation", g: "best", why: "Minimal variability without decels on magnesium: Category II. An acceleration after scalp stimulation reliably predicts pH > 7.20. Then continue labor, magnesium on." },
        { t: "Stop the magnesium infusion", g: "harm", why: "Never stop seizure prophylaxis to improve the strip." },
        { t: "Cesarean for minimal variability", g: "wrong", why: "Minimal variability on magnesium without decels is not an indication for cesarean." },
        { t: "A 1-liter IV fluid bolus", g: "wrong", why: "Boluses in preeclampsia risk pulmonary edema, and there is no hypotension or decel to treat." },
        { t: "Biophysical profile on L&D", g: "meh", why: "A BPP in labor is awkward and slow. Scalp stimulation answers the same question in seconds." },
        { t: "Increase oxytocin to 8 mU/min", g: "meh", why: "Doesn’t address the question: is this the magnesium or the baby?" } ] },
      debrief: { summary: 'Minimal variability (≤5 bpm) without accelerations or decelerations on magnesium: Category II. Magnesium can modestly reduce variability and accelerations. An acceleration after scalp stimulation is reassuring (pH > 7.20). Continue labor; never stop magnesium for the tracing.',
        pearls: ['Minimal variability: amplitude >undetectable and ≤5 bpm.', 'Magnesium, opioids, sleep cycles (usually <40 min), prematurity and fetal acidemia all reduce variability. Rule out the bad one.', 'An acceleration after scalp stimulation (or spontaneously) reliably predicts pH > 7.20.'] } },

    { id: 'push', ch: 5, title: 'Push Comes to Shove', tag: 'Second stage, prolonged decel', bed: 'LDR 9',
      pt: { name: 'Sofia Rossi', age: 29, gp: 'G1P0', ga: '40w2d', cc: 'Pushing for 2 hours',
        hx: ['Complete for 2.5 h, pushing 2 h with a good epidural', 'EFW 3.4 kg by Leopold’s, adequate pelvis', 'Bladder emptied 20 min ago, consent for OVD discussed on admission'], vitals: V('37.3', 96, '124/78'),
        exam: 'SVE complete / +3, direct OA, little caput', meds: ['Oxytocin 6 mU/min', 'Epidural'] },
      present: 'Sofia has pushed for two hours, complete, +3, direct OA. The strip has been doing this with every push. What’s the plan?',
      nurse: 'She’s an amazing pusher. Baby’s dipping with every push though.',
      p: { base: 145, ucInt: 2.7, ucSens: 0.03, oxy: 6, oxyEff: 6, cord: 0.6, push: 1, cordPos: 0.2, accRate: 0.05, rom: 1, reserve: 0.75, rMin: 0.66 },
      hist: [{ t: 1630, set: { rMin: 0 }, ramp: ['prolapse', 0.62, 10] }],
      choice: { q: "Complete, +3, OA, and this decel. Your call?", hint: "How long has the rate been down? Where is the head, and are the criteria met?", opts: [
        { t: "Vacuum-assisted vaginal birth", g: "best", why: "Prolonged decel in the second stage with every criterion met (complete, +3, direct OA, epidural, empty bladder, consent): operative vaginal delivery is the fastest safe route (ACOG PB 219)." },
        { t: "Stat cesarean delivery", g: "ok", why: "Acceptable, but slower: at +3 OA with every criterion met, the vacuum gets the baby out faster." },
        { t: "Amnioinfusion through an IUPC", g: "wrong", why: "A first-stage tool. There is no time for it in the second stage." },
        { t: "Keep pushing, recheck in 30 min", g: "harm", why: "A prolonged decel that is not recovering needs delivery now." },
        { t: "Increase oxytocin to 10 mU/min", g: "harm", why: "More contractions during a prolonged decel." },
        { t: "Terbutaline and push in an hour", g: "wrong", why: "Delaying delivery during a non-recovering decel with the head at +3." } ] },
      debrief: { summary: 'Second stage with recurrent variables from pushing, then a prolonged deceleration that does not recover. Complete, +3, direct OA, adequate epidural and consent: criteria for operative vaginal delivery are met, and it is the fastest route.',
        pearls: ['OVD prerequisites: complete, membranes ruptured, head engaged (+2 or lower), position known, adequate anesthesia, empty bladder, consent, willingness to abandon.', 'Indications include suspicion of immediate or potential fetal compromise and a prolonged second stage.', 'Spacing pushes (every other or every third contraction) is a second-stage resuscitation tool.'] } },

    { id: 'subtle', ch: 5, title: 'The Late Show', tag: 'Subtle lates, minimal → absent variability', bed: 'LDR 10',
      pt: { name: 'Grace Okafor', age: 36, gp: 'G2P0101', ga: '37w0d', cc: 'Induction for fetal growth restriction',
        hx: ['FGR (EFW 4th percentile), elevated umbilical artery Doppler indices', 'Gestational hypertension', 'Oxytocin 4 mU/min'], vitals: V('37.0', 86, '142/90'),
        exam: 'SVE 3 / 60 / −2', meds: ['Oxytocin 4 mU/min'] },
      present: 'Grace: growth-restricted baby, induction. This strip is quiet, but look closely after every contraction. Small things matter in a small baby.',
      nurse: 'It’s not dramatic. But I don’t love it.',
      p: { base: 145, upi: 0.42, reserve: 0.32, rMin: 0.28, rMax: 0.36, accRate: 0, ucInt: 4, ucSens: 0.04, oxy: 4, oxyEff: 4 },
      choice: { q: "Small baby, quiet strip. Your call?", hint: "Look right after every contraction. Shallow dips count if the timing is late.", opts: [
        { t: "Intrauterine resuscitation now", g: "best", why: "Subtle recurrent lates with minimal variability in an FGR fetus: Category II. Stop oxytocin, lateral position, fluids now; if it does not resolve (or variability goes absent), deliver." },
        { t: "Increase oxytocin to 6 mU/min", g: "harm", why: "More oxytocin into recurrent lates in a growth-restricted fetus." },
        { t: "Continue routine monitoring", g: "wrong", why: "Shallow lates are still lates. Recurrent lates need action." },
        { t: "Stat cesarean delivery", g: "ok", why: "Not wrong to be ready, but with minimal (not absent) variability, resuscitate first; deliver if it does not resolve." },
        { t: "Amnioinfusion through an IUPC", g: "wrong", why: "Amnioinfusion treats variables, not lates." },
        { t: "Terbutaline and resume oxytocin", g: "wrong", why: "No tachysystole, and oxytocin is the problem." } ] },
      debrief: { summary: 'Shallow (subtle) recurrent late decels with minimal variability in a growth-restricted fetus: Category II, and variability can become absent (Category III). Intrauterine resuscitation, and when it does not resolve, deliver.',
        pearls: ['Late decels can be shallow. Depth does not define them; timing does.', 'Recurrent lates with absent variability = Category III.', 'FGR fetuses have little reserve: they move from II to III faster.'] } }
  ];
  // triage priority for Shift mode (higher = see first)
  C.SEV = { prolapse: 10, rupture: 10, abruption: 9, sine: 8, drop: 7, push: 7, subtle: 6, pit: 5, cord: 5, chorio: 4, mag: 3, miso: 2, heads: 1, quiet: 0 };
  C.CHAPTERS = { 1: 'Reading the strip', 2: 'Uterine activity & the cord', 3: 'Prolonged & fast', 4: 'Emergencies', 5: 'Judgment calls' };
  C.byId = {}; C.CASES.forEach(function (c, i) { c.n = i + 1; c.sev = C.SEV[c.id]; C.byId[c.id] = c; });
  /* build a case's simulator with its 30-minute history already on paper */
  C.HIST = 1800;
  C.start = function (c, seed, CTGlib) {
    var L = CTGlib || (typeof CTG !== 'undefined' ? CTG : root.CTG);
    var sim = new L.Sim(c.p, seed);
    (c.hist || []).forEach(function (h) { sim.timers.push({ t: h.t, fn: function (S) { C.apply(S, h); } }); });
    sim.run(C.HIST);
    return sim;
  };
  C.apply = function (S, h) {
    if (h.set) S.set(h.set);
    if (h.ramp) S.ramp(h.ramp[0], h.ramp[1], h.ramp[2]);
  };
  // what the student should answer (designed truth; tests check the generated strips match it)
  C.EXPECT = {
    quiet: { variability: 'moderate', predominant: 'none', category: 1, accels: true, tachysystole: false, baseline: 135 },
    heads: { variability: 'moderate', predominant: 'early', category: 1, tachysystole: false, baseline: 140 },
    pit: { variability: 'moderate', predominant: 'late-rec', category: 2, tachysystole: true, baseline: 145 },
    miso: { variability: 'moderate', predominant: 'none', category: 1, tachysystole: true, baseline: 130 },
    cord: { variability: 'moderate', predominant: 'var-rec', category: 2, tachysystole: false, baseline: 140 },
    drop: { variability: 'moderate', predominant: 'prolonged', category: 2, tachysystole: false, baseline: 140 },
    prolapse: { variability: 'moderate', predominant: 'prolonged', category: 2, tachysystole: false, baseline: 140 },
    chorio: { variability: 'minimal', predominant: 'none', category: 2, tachysystole: false, accels: false, baseline: 165 },
    abruption: { variability: 'minimal', predominant: 'late-rec', category: 2, tachysystole: true },
    rupture: { predominant: 'prolonged', category: 2, tachysystole: false, baseline: 140 },
    sine: { variability: 'sinusoidal', category: 3, accels: false, baseline: 145 },
    mag: { variability: 'minimal', predominant: 'none', category: 2, accels: false, baseline: 140 },
    push: { variability: 'moderate', predominant: 'prolonged', category: 2, baseline: 145 },
    subtle: { variability: 'minimal', predominant: 'late-rec', category: 2, accels: false, baseline: 145 }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.OBC = C;
})(typeof window !== 'undefined' ? window : this);
