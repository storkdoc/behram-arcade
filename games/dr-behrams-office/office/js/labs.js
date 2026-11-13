/* CONGRESSIONAL OB GYN — reference lab values, opened from any encounter (button or L key), like the lab sheet on a
   board exam. Added 2026-11-13 from player feedback ("add normal lab values as reference for the vignettes like we would
   for exams"). Ranges are typical teaching values (USMLE/NBME-style adult female sheet) plus the ACOG / SMFM / CDC
   thresholds the cases use. Each row: [test, range, pregnancy / OB-GYN note, keyword regex for "in this chart"]. */
(function (root) {
  'use strict';
  var LABS = [
    ['Hematology', [
      ['Hemoglobin', '12.0–16.0 g/dL', 'Anemia in pregnancy: < 11 (1st and 3rd trimester), < 10.5 (2nd)', /h(a)?emoglobin|\bhgb\b|\bhb\b|anemi|anaemi/i],
      ['Hematocrit', '36–46%', 'Pregnancy: < 33% (1st/3rd), < 32% (2nd)', /hematocrit|\bhct\b/i],
      ['MCV', '80–100 fL', '< 80: iron deficiency or thalassemia trait', /\bmcv\b|microcyt|macrocyt/i],
      ['Ferritin', '12–150 ng/mL', '< 30 ng/mL supports iron deficiency', /ferritin|iron/i],
      ['WBC', '4,500–11,000 /mm³', 'Normal pregnancy up to ~15,000; higher in labor', /\bwbc\b|white (blood )?cell|leukocyt/i],
      ['Platelets', '150,000–400,000 /mm³', 'Gestational thrombocytopenia usually > 70,000; < 100,000 is a severe feature of preeclampsia', /platelet|\bplt\b|thrombocyt|hellp/i],
      ['PT / INR', '11–15 s / 0.8–1.2', '', /\binr\b|prothrombin|warfarin|coagul/i],
      ['aPTT', '25–40 s', '', /ptt|heparin|coagul/i],
      ['Fibrinogen', '200–400 mg/dL', 'Pregnancy 300–600; < 200 in hemorrhage predicts severe bleeding / DIC', /fibrinogen|\bdic\b|abruption|hemorrhage|haemorrhage/i]
    ]],
    ['Chemistry', [
      ['Sodium', '136–146 mEq/L', '', /sodium|hyponatr|hypernatr/i],
      ['Potassium', '3.5–5.0 mEq/L', '', /potassium|hypokal|hyperkal/i],
      ['Bicarbonate', '22–28 mEq/L', 'Pregnancy ~18–22 (compensated respiratory alkalosis)', /bicarb|hco3|acidosis/i],
      ['BUN', '7–18 mg/dL', '', /\bbun\b|urea/i],
      ['Creatinine', '0.6–1.2 mg/dL', 'Pregnancy ~0.4–0.8; > 1.1 (or doubling) is a severe feature of preeclampsia', /creatinine|renal|kidney/i],
      ['Glucose, fasting', '70–100 mg/dL', 'Diabetes ≥ 126 fasting', /glucose|diabet|\bgdm\b/i],
      ['Hemoglobin A1c', '< 5.7%', '5.7–6.4% prediabetes; ≥ 6.5% diabetes', /a1c|diabet/i],
      ['Calcium', '8.4–10.2 mg/dL', '', /calcium/i],
      ['Magnesium', '1.7–2.2 mg/dL', 'MgSO4 therapeutic 4.8–8.4 mg/dL; reflexes lost ~8.5–12; respiratory depression ~12–16', /magnesium|mgso4|seizure prophyla|eclamp/i],
      ['AST / ALT', '12–38 / 10–40 U/L', 'Twice the upper limit of normal is a severe feature of preeclampsia', /\bast\b|\balt\b|transaminase|\bliver|hellp/i],
      ['Bilirubin, total', '0.1–1.0 mg/dL', '', /bilirubin|jaundice|icter/i],
      ['LDH', '45–200 U/L', 'HELLP: LDH ≥ 600 U/L', /\bldh\b|lactate dehydrogenase|hemolysis|hellp/i],
      ['Albumin', '3.5–5.5 g/dL', 'Falls ~1 g/dL in normal pregnancy', /albumin/i],
      ['Total bile acids', '< 10 µmol/L', 'ICP: ≥ 10 supports; ≥ 100 is severe (stillbirth risk rises)', /bile acid|cholestasis|\bicp\b|palms|soles/i]
    ]],
    ['Endocrine', [
      ['TSH', '0.4–4.0 mIU/L', 'Pregnancy: trimester-specific; lower in the 1st trimester (hCG effect)', /\btsh\b|thyroid/i],
      ['Free T4', '0.9–1.7 ng/dL', '', /\bt4\b|thyrox|thyroid/i],
      ['Prolactin', '< 25 ng/mL (nonpregnant)', 'Rises normally in pregnancy and lactation', /prolactin|galactorr/i],
      ['FSH', 'Follicular 3–10 mIU/mL', 'POI: > 25 (ESHRE) or menopausal range > 30–40 (ACOG), twice ≥ 4 weeks apart', /\bfsh\b|follicle|menopaus|ovarian insufficien|amenorrh/i],
      ['hCG (quantitative)', 'Nonpregnant < 5 mIU/mL', 'TVUS should show an IUP by ~3,500; viable IUP rises ≥ 35–53% in 48 h', /hcg|ectopic|pregnancy of unknown/i],
      ['Total testosterone', '~15–70 ng/dL', '> 150–200 ng/dL: evaluate for an androgen-secreting tumor', /testosterone|androgen|hirsut|virili/i],
      ['DHEA-S', '~35–430 µg/dL', '> 700 µg/dL: evaluate for an adrenal tumor', /dhea|androgen|hirsut|virili/i],
      ['17-OH progesterone', '< 200 ng/dL (morning, follicular)', '> 200: test for nonclassic CAH (ACTH stimulation)', /17-?oh|hydroxyprogesterone|\bcah\b|adrenal hyperplas|hirsut/i]
    ]],
    ['Pregnancy screening', [
      ['1-h 50 g glucose screen', '< 130–140 mg/dL', 'Cutoff 130, 135 or 140 by institution', /\bgdm\b|gestational diabetes|glucola|glucose (screen|challenge)/i],
      ['3-h 100 g GTT (Carpenter–Coustan)', 'Fasting 95 · 1 h 180 · 2 h 155 · 3 h 140', '2 or more abnormal values = GDM', /\bgdm\b|gestational diabetes|glucose tolerance|\bgtt\b/i],
      ['2-h 75 g GTT (IADPSG)', 'Fasting 92 · 1 h 180 · 2 h 153', 'Any 1 abnormal value = GDM', /\bgdm\b|gestational diabetes|glucose tolerance|\bgtt\b/i],
      ['GDM glucose targets', 'Fasting < 95 · 1 h < 140 · 2 h < 120', '', /\bgdm\b|gestational diabetes/i],
      ['Proteinuria (preeclampsia)', '≥ 300 mg / 24 h, or P:C ratio ≥ 0.3', 'Dipstick 2+ only if other methods are unavailable', /protein|preeclamp|pre-eclamp/i],
      ['Blood pressure', '< 140 / 90 mmHg', 'Gestational HTN / preeclampsia ≥ 140/90 twice 4 h apart; severe ≥ 160/110', /blood pressure|\bbp\b|hypertens|preeclamp|mmhg/i],
      ['Fetal heart rate baseline', '110–160 bpm', '', /fetal heart|\bfhr\b|tracing|decel|heart tones/i],
      ['Amniotic fluid', 'AFI > 5 and < 24 cm · MVP 2–8 cm', 'Oligohydramnios AFI ≤ 5 or MVP < 2; polyhydramnios AFI ≥ 24 or MVP ≥ 8', /amniotic fluid|\bafi\b|oligohydr|polyhydr/i],
      ['Intrapartum fever (Triple I)', '≥ 39.0 °C once, or 38.0–38.9 °C twice 30 min apart', '', /chorioamnion|triple i|intra-?amniotic|intrapartum fever|fever in labor/i]
    ]],
    ['Other', [
      ['ABG in pregnancy', 'pH 7.40–7.45 · PaCO2 ~28–32 mmHg', 'A "normal" PaCO2 of 40 in pregnancy means retention', /\babg\b|paco2|blood gas|asthma|dyspnea|shortness of breath/i],
      ['CA-125', '< 35 U/mL', 'Also raised by endometriosis, fibroids, PID and pregnancy', /ca-?125|adnexal|ovarian mass|pelvic mass/i],
      ['Urinalysis', 'Nitrite neg · leukocyte esterase neg', 'Asymptomatic bacteriuria: ≥ 100,000 CFU/mL on culture', /urinalysis|bacteriuria|dysuria|\buti\b|pyelo/i]
    ]]
  ];
  // rows whose keywords appear in the given text (the vignette + current question stem): shown first, highlighted
  function relevant(text) {
    var out = []; text = String(text || '');
    LABS.forEach(function (g) { g[1].forEach(function (r) { if (r[3].test(text)) out.push(r[0]); }); });
    return out;
  }
  var api = { LABS: LABS, relevant: relevant, source: 'Typical adult female teaching ranges (USMLE/NBME-style lab sheet) with ACOG, SMFM, CDC and IADPSG thresholds. Ranges vary by laboratory.' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COBLabs = api;
})(this);
