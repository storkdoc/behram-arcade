/* FEUD & DELIVERY — round bank.
 * Each round: { id, cat: 'OB'|'GYN', q: the condition, basis: ranking source/rationale, ties: honest notes,
 *   a: [[label, points, [synonyms], pearl], ...] }  answers are listed in RANK order (most likely first).
 * POINT VALUES APPROXIMATE RELATIVE LIKELIHOOD FOR TEACHING. They are not survey data or exact prevalence;
 * true frequencies vary with age, setting and population. Points in each round sum to 100.
 * Sources: ACOG Practice Bulletins / Committee Opinions, CDC STI Treatment Guidelines 2021, ASRM Practice Committee,
 * Endocrine Society, SOGC/RCOG where noted, Williams Obstetrics, Berek & Novak, Speroff (Clinical Gyn Endo & Infertility). */
(function (root) {
  'use strict';
  var R = [];
  function add(list) { Array.prototype.push.apply(R, list); }
  add([
  { id: 'tri1-bleed', cat: 'OB', q: 'Vaginal bleeding in the first trimester',
    basis: 'Williams Obstetrics; ACOG PB 200 (early pregnancy loss) and PB 193 (tubal ectopic). About half of first-trimester bleeding ends in miscarriage; ectopic is found in roughly 6-16% of ED patients with bleeding/pain.',
    ties: 'Ectopic vs cervical/vaginal source varies by setting (ED vs office).',
    a: [
      ['Miscarriage (threatened/incomplete)', 40, ['miscarriage', 'spontaneous abortion', 'threatened abortion', 'inevitable abortion', 'incomplete abortion', 'missed abortion', 'complete abortion', 'sab', 'early pregnancy loss', 'epl', 'abortion', 'threatened miscarriage', 'pregnancy loss', 'failed pregnancy', 'blighted ovum', 'anembryonic pregnancy'], 'The most common outcome to rule in or out. A closed os with a live IUP is a threatened abortion, and most of those go on to continue.'],
      ['Ectopic pregnancy', 22, ['ectopic', 'tubal pregnancy', 'eptopic', 'ruptured ectopic'], 'Never miss it: positive hCG and no IUP on TVUS means a pregnancy of unknown location until proven otherwise. Trend hCG and stay vigilant.'],
      ['Cervical / vaginal source', 18, ['cervicitis', 'cervical polyp', 'ectropion', 'cervical ectropion', 'postcoital bleeding', 'vaginal laceration', 'cervical bleeding', 'friable cervix', 'vaginitis', 'cervical source', 'vaginal source', 'polyp'], 'A speculum exam finds cervicitis, polyps, ectropion or postcoital bleeding. Test for GC/CT.'],
      ['Subchorionic hematoma', 12, ['subchorionic hemorrhage', 'subchorionic bleed', 'sch', 'subchorionic'], 'Common on early ultrasound. Most resolve, though large ones are linked to loss and later abruption.'],
      ['Molar pregnancy (GTD)', 5, ['molar', 'mole', 'hydatidiform mole', 'gtd', 'gestational trophoblastic disease', 'complete mole', 'partial mole', 'gtn'], 'Think of it with a very high hCG, severe nausea, early preeclampsia, or a "snowstorm" on ultrasound.'],
      ['Implantation bleeding', 3, ['implantation', 'implantation spotting'], 'Light spotting around the expected period. It is a diagnosis of exclusion once a normal IUP is confirmed.']
    ] },
  { id: 'tri3-bleed', cat: 'OB', q: 'Vaginal bleeding in the third trimester',
    basis: 'Williams Obstetrics; ACOG. Abruption ~1% of births, previa ~0.3-0.5%, vasa previa ~1 in 2,500; bloody show of labor is the most frequent source of light bleeding.',
    ties: '',
    a: [
      ['Bloody show / labor', 32, ['bloody show', 'labor', 'preterm labor', 'cervical change', 'mucus plug', 'show', 'labour', 'term labor'], 'Scant mucoid blood with cervical change. Always exclude previa before a digital exam.'],
      ['Placental abruption', 26, ['abruption', 'abruptio placentae', 'placental abruption', 'abrubtion', 'abruptio'], 'Painful bleeding with a tender, firm uterus and frequent contractions. It is a clinical diagnosis because ultrasound misses most of them. Watch for DIC.'],
      ['Placenta previa', 20, ['previa', 'placenta praevia', 'placenta previa', 'low lying placenta'], 'Classically painless bright red bleeding. NO digital exam until the placenta is localized by ultrasound.'],
      ['Cervical / vaginal lesion', 12, ['cervicitis', 'cervical polyp', 'ectropion', 'cervical lesion', 'vaginal lesion', 'trauma', 'postcoital', 'cervical cancer', 'polyp'], 'A gentle speculum exam can show an ectropion, polyp, cervicitis or, rarely, cancer.'],
      ['Uterine rupture', 6, ['rupture', 'ruptured uterus', 'uterine rupture', 'scar dehiscence'], 'Prior cesarean or uterine surgery plus sudden pain and FHR bradycardia. This is an emergency.'],
      ['Vasa previa', 4, ['vasa praevia', 'vasa previa', 'vasa', 'fetal vessels'], 'Bleeding at membrane rupture with acute fetal bradycardia. The blood is fetal, so mortality is high unless it is diagnosed prenatally.']
    ] },
  { id: 'pph-4t', cat: 'OB', q: 'Causes of postpartum hemorrhage (the 4 Ts)',
    basis: 'ACOG PB 183; SOGC. Classic distribution: Tone ~70%, Trauma ~20%, Tissue ~10%, Thrombin <1%.',
    ties: '',
    a: [
      ['Tone (uterine atony)', 68, ['atony', 'uterine atony', 'tone', 'boggy uterus', 'atonic uterus', 'uterine atonia'], 'The most common cause. Do bimanual massage plus uterotonics (oxytocin, methylergonovine if normotensive, carboprost unless asthmatic, misoprostol) and TXA within 3 h.'],
      ['Trauma (lacerations, hematoma)', 20, ['trauma', 'laceration', 'lacerations', 'tear', 'tears', 'cervical laceration', 'vaginal laceration', 'hematoma', 'uterine rupture', 'uterine inversion', 'inversion', 'perineal laceration', 'episiotomy'], 'A firm uterus that keeps bleeding? Inspect the cervix, vagina and perineum, and look for a hematoma.'],
      ['Tissue (retained placenta)', 10, ['tissue', 'retained placenta', 'retained products', 'retained products of conception', 'rpoc', 'placenta accreta', 'accreta', 'pas', 'placenta accreta spectrum', 'retained membranes', 'clots'], 'Inspect the placenta for missing cotyledons. Manual extraction or curettage, and keep accreta spectrum in mind.'],
      ['Thrombin (coagulopathy)', 2, ['thrombin', 'coagulopathy', 'dic', 'disseminated intravascular coagulation', 'von willebrand', 'vwd', 'bleeding disorder', 'anticoagulation', 'hypofibrinogenemia', 'clotting disorder'], 'Rare as a primary cause but common as a consequence. Check fibrinogen early, because <200 mg/dL predicts severe PPH.']
    ] },
  { id: 'aub-palm', cat: 'GYN', q: 'Abnormal uterine bleeding, non-pregnant reproductive-age woman (PALM-COEIN)',
    basis: 'ACOG PB 128 / CO 557; FIGO PALM-COEIN. Ovulatory dysfunction and leiomyomas dominate; coagulopathy is found in ~5-20% with heavy menstrual bleeding.',
    ties: 'Polyp vs adenomyosis vs iatrogenic are close; order shifts with age.',
    a: [
      ['Ovulatory dysfunction (AUB-O)', 30, ['ovulatory dysfunction', 'anovulation', 'anovulatory bleeding', 'aub o', 'pcos', 'polycystic ovary syndrome', 'oligo-ovulation', 'thyroid', 'hypothyroidism', 'perimenopause', 'anovulatory'], 'Irregular, unpredictable bleeding. Causes include PCOS, thyroid disease, hyperprolactinemia, perimenopause and stress.'],
      ['Leiomyoma (fibroids)', 24, ['fibroid', 'fibroids', 'leiomyoma', 'leiomyomas', 'myoma', 'myomas', 'aub l', 'submucosal fibroid', 'leiomyomata'], 'Submucosal fibroids cause the most bleeding. Ultrasound or saline sonohysterography maps them.'],
      ['Endometrial polyp', 15, ['polyp', 'polyps', 'endometrial polyp', 'aub p'], 'Intermenstrual bleeding. Seen on SIS or hysteroscopy, and removal is curative.'],
      ['Adenomyosis', 12, ['adenomyosis', 'aub a', 'adenomyoma'], 'Heavy, painful periods with a boggy, globular uterus. MRI or TVUS features support it.'],
      ['Iatrogenic (hormones, anticoagulants)', 11, ['iatrogenic', 'aub i', 'contraception', 'birth control', 'breakthrough bleeding', 'iud', 'anticoagulant', 'anticoagulants', 'warfarin', 'medication', 'medications', 'progestin', 'depo', 'nexplanon', 'implant'], 'Breakthrough bleeding on hormones, a copper IUD, and anticoagulants all count here.'],
      ['Coagulopathy (e.g., von Willebrand)', 8, ['coagulopathy', 'von willebrand', 'von willebrand disease', 'vwd', 'bleeding disorder', 'aub c', 'platelet disorder', 'clotting disorder'], 'Screen anyone with heavy bleeding since menarche. Not on the board: hyperplasia/malignancy, so biopsy if age 45 or older or with unopposed-estrogen risk factors.']
    ] },
  { id: 'pmb', cat: 'GYN', q: 'Postmenopausal bleeding',
    basis: 'ACOG CO 734 (TVUS in PMB); classic series: atrophy ~60%, hormone therapy ~15-25%, polyps ~2-12%, endometrial cancer ~9% (range 1-14%), hyperplasia ~5-10%.',
    ties: 'Polyp, cancer and hyperplasia ranges overlap; treat them as near-ties.',
    a: [
      ['Endometrial / vaginal atrophy', 45, ['atrophy', 'atrophic', 'vaginal atrophy', 'endometrial atrophy', 'gsm', 'genitourinary syndrome of menopause', 'atrophic vaginitis', 'atrophic endometrium'], 'The most common cause, but a diagnosis made only after cancer is excluded.'],
      ['Hormone therapy', 17, ['hormone therapy', 'hrt', 'mht', 'hormone replacement', 'estrogen', 'exogenous hormones', 'hormone replacement therapy', 'tamoxifen', 'menopausal hormone therapy'], 'Withdrawal bleeding on sequential regimens is expected. Persistent or unexpected bleeding still needs evaluation. Tamoxifen also raises cancer risk.'],
      ['Endometrial polyp', 13, ['polyp', 'polyps', 'endometrial polyp'], 'Often seen on SIS. Remove symptomatic polyps; a small fraction harbor malignancy.'],
      ['Endometrial cancer', 11, ['endometrial cancer', 'uterine cancer', 'endometrial carcinoma', 'cancer', 'malignancy', 'endometrial adenocarcinoma', 'uterine malignancy'], 'About 90% of endometrial cancers present with bleeding. Endometrial thickness 4 mm or less on TVUS has a >99% NPV, but persistent bleeding still needs a biopsy.'],
      ['Endometrial hyperplasia', 9, ['hyperplasia', 'endometrial hyperplasia', 'ein', 'atypical hyperplasia'], 'Driven by unopposed estrogen (obesity, PCOS, tamoxifen). Atypical hyperplasia/EIN carries a high risk of concurrent cancer.'],
      ['Cervical / other source', 5, ['cervical cancer', 'cervical lesion', 'cervical polyp', 'urethral caruncle', 'urethral', 'hematuria', 'rectal', 'hemorrhoids', 'gi bleeding', 'vulvar lesion', 'other'], 'Confirm the bleeding is truly uterine, not cervical, urethral, vulvar or rectal.']
    ] }
  ]);
  add([
  { id: 'amen-1', cat: 'GYN', q: 'Primary amenorrhea',
    basis: 'ASRM Practice Committee (Current evaluation of amenorrhea); Reindollar 1981 series: gonadal failure ~43%, Mullerian agenesis ~15%, constitutional delay ~14%, PCOS ~7%, GnRH deficiency ~5%, transverse septum ~3%.',
    ties: 'PCOS and hypothalamic causes are a near-tie.',
    a: [
      ['Gonadal dysgenesis (Turner)', 42, ['turner', 'turners', 'turner syndrome', "turner's syndrome", 'gonadal dysgenesis', '45x', '45 x', 'xo', 'primary ovarian insufficiency', 'poi', 'gonadal failure', 'hypergonadotropic hypogonadism', 'swyer'], 'High FSH: get a karyotype. Turner needs cardiac (bicuspid aortic valve, coarctation) and renal screening. Y material (Swyer) means gonadectomy.'],
      ['Mullerian agenesis (MRKH)', 17, ['mrkh', 'mullerian agenesis', 'müllerian agenesis', 'mayer rokitansky kuster hauser', 'vaginal agenesis', 'absent uterus', 'mullerian aplasia', 'rokitansky'], 'Normal breasts and pubic hair with a blind vaginal pouch. Check for renal anomalies. Dilators are first-line.'],
      ['Constitutional delay of puberty', 15, ['constitutional delay', 'delayed puberty', 'constitutional', 'late bloomer', 'physiologic delay'], 'A diagnosis of exclusion, often with a family history of late puberty and delayed bone age.'],
      ['Hypothalamic (GnRH deficiency, FHA)', 9, ['hypothalamic', 'kallmann', 'kallmann syndrome', 'gnrh deficiency', 'functional hypothalamic amenorrhea', 'fha', 'hypothalamic amenorrhea', 'anorexia', 'eating disorder', 'athletic amenorrhea', 'hypogonadotropic hypogonadism', 'idiopathic hypogonadotropic hypogonadism'], 'Low or normal FSH and LH. Kallmann comes with anosmia. Functional causes are energy deficit, stress and exercise.'],
      ['Polycystic ovary syndrome', 9, ['pcos', 'polycystic ovary syndrome', 'polycystic ovaries', 'polycystic ovarian syndrome'], 'Can present as primary amenorrhea with hyperandrogenism. It is a diagnosis of exclusion.'],
      ['Outflow tract obstruction', 8, ['imperforate hymen', 'transverse vaginal septum', 'vaginal septum', 'outflow obstruction', 'cervical agenesis', 'hematocolpos', 'outflow tract', 'androgen insensitivity', 'ais', 'cais'], 'Cyclic pain with hematocolpos suggests an imperforate hymen or septum. Also consider androgen insensitivity (46,XY, absent uterus, scant hair).']
    ] },
  { id: 'amen-2', cat: 'GYN', q: 'Secondary amenorrhea',
    basis: 'ASRM Practice Committee; Reindollar 1986: hypothalamic ~35%, PCOS ~30%, pituitary/hyperprolactinemia ~13-17%, POI ~10%, uterine (Asherman) ~7%. Pregnancy is listed first because it is the most common cause overall.',
    ties: 'Functional hypothalamic amenorrhea and PCOS are essentially tied.',
    a: [
      ['Pregnancy', 34, ['pregnancy', 'pregnant', 'intrauterine pregnancy', 'iup', 'gestation'], 'Always check hCG first, even when she "can\'t be pregnant."'],
      ['Functional hypothalamic amenorrhea', 20, ['fha', 'functional hypothalamic amenorrhea', 'hypothalamic amenorrhea', 'hypothalamic', 'stress', 'exercise', 'athletic amenorrhea', 'eating disorder', 'anorexia', 'weight loss', 'relative energy deficiency', 'red s', 'female athlete triad'], 'Low or normal FSH and low estrogen. Address the energy balance and protect bone.'],
      ['Polycystic ovary syndrome', 19, ['pcos', 'polycystic ovary syndrome', 'polycystic ovaries', 'polycystic ovarian syndrome', 'anovulation'], 'Rotterdam criteria require 2 of 3: oligo-anovulation, hyperandrogenism, polycystic ovaries.'],
      ['Hyperprolactinemia / thyroid', 11, ['hyperprolactinemia', 'prolactinoma', 'prolactin', 'pituitary adenoma', 'hypothyroidism', 'thyroid', 'pituitary'], 'Check TSH and prolactin in every workup. Medications are a common cause of a high prolactin.'],
      ['Primary ovarian insufficiency', 10, ['poi', 'primary ovarian insufficiency', 'premature ovarian failure', 'pof', 'premature ovarian insufficiency', 'early menopause', 'ovarian failure', 'menopause'], 'FSH in the menopausal range twice, 4 or more weeks apart, before age 40. Get a karyotype and FMR1 premutation testing.'],
      ["Asherman syndrome (uterine)", 6, ['asherman', 'ashermans', "asherman's", 'asherman syndrome', 'intrauterine adhesions', 'uterine adhesions', 'synechiae', 'cervical stenosis'], 'Prior D&C, especially postpartum. Hysteroscopy diagnoses and treats it.']
    ] },
  { id: 'acute-pelvic', cat: 'GYN', q: 'Acute pelvic pain in a reproductive-age woman (ED)',
    basis: 'ACOG; ACR Appropriateness Criteria (acute pelvic pain in the reproductive-age group). The pregnancy test comes first.',
    ties: 'Ranks 2-4 (PID, ectopic, appendicitis) are close and depend heavily on the population.',
    a: [
      ['Ovarian cyst (hemorrhagic/ruptured)', 25, ['ovarian cyst', 'ruptured cyst', 'hemorrhagic cyst', 'ruptured ovarian cyst', 'corpus luteum cyst', 'cyst', 'functional cyst', 'hemorrhagic corpus luteum', 'follicular cyst'], 'Sudden pain, often mid-cycle or luteal, with free fluid. Most are managed expectantly if she is stable.'],
      ['Pelvic inflammatory disease', 20, ['pid', 'pelvic inflammatory disease', 'salpingitis', 'tubo ovarian abscess', 'toa', 'endometritis', 'tuboovarian abscess'], 'Cervical motion, uterine or adnexal tenderness is enough to treat empirically (CDC 2021).'],
      ['Ectopic pregnancy', 18, ['ectopic', 'ectopic pregnancy', 'tubal pregnancy', 'ruptured ectopic'], 'The hCG test is mandatory. A ruptured ectopic is the leading cause of first-trimester maternal death.'],
      ['Appendicitis', 17, ['appendicitis', 'appendix', 'acute appendicitis'], 'The most common surgical emergency in this group. Pain migrates to McBurney\'s point.'],
      ['Urinary (UTI / kidney stone)', 12, ['uti', 'urinary tract infection', 'cystitis', 'pyelonephritis', 'pyelo', 'kidney stone', 'nephrolithiasis', 'renal colic', 'ureteral stone', 'urolithiasis'], 'Dysuria, flank pain and hematuria point here. Get a UA in every case.'],
      ['Adnexal torsion', 8, ['torsion', 'ovarian torsion', 'adnexal torsion', 'twisted ovary', 'tubal torsion'], 'Sudden severe pain with nausea, usually with an enlarged ovary. Doppler flow does not exclude it, so if suspicion is high, go to the OR.']
    ] },
  { id: 'cpp', cat: 'GYN', q: 'Chronic pelvic pain (6 months or longer)',
    basis: 'ACOG PB 218 (Chronic pelvic pain, 2020). Endometriosis is the most common gyn cause; IBS and bladder pain syndrome are very common co-diagnoses.',
    ties: 'IBS, bladder pain and myofascial pain are close, and often coexist.',
    a: [
      ['Endometriosis', 30, ['endometriosis', 'endo', 'endometrioma'], 'Dysmenorrhea, dyspareunia and dyschezia. Empiric hormonal therapy without laparoscopy is acceptable.'],
      ['Irritable bowel syndrome', 22, ['ibs', 'irritable bowel', 'irritable bowel syndrome', 'constipation', 'gi'], 'Rome IV criteria. It is one of the most common causes of pelvic pain overall.'],
      ['Interstitial cystitis / bladder pain', 16, ['interstitial cystitis', 'bladder pain syndrome', 'ic', 'painful bladder syndrome', 'ic bps', 'bps'], 'Pain with bladder filling, relieved by voiding, with urgency and frequency. Diagnosed after excluding other causes.'],
      ['Pelvic floor myofascial pain', 14, ['pelvic floor dysfunction', 'myofascial pain', 'pelvic floor', 'levator spasm', 'pelvic floor myalgia', 'musculoskeletal', 'trigger points', 'vaginismus', 'hypertonic pelvic floor'], 'Tender levator trigger points on single-digit exam. Pelvic floor physical therapy is first-line.'],
      ['Adenomyosis', 10, ['adenomyosis'], 'Heavy, painful periods with a globular, tender uterus.'],
      ['Pelvic adhesions', 8, ['adhesions', 'adhesive disease', 'pelvic adhesions', 'scar tissue'], 'Follow prior surgery or infection. Adhesiolysis rarely helps unless the adhesions are dense and bowel-involved.']
    ] },
  { id: 'discharge', cat: 'GYN', q: 'Abnormal vaginal discharge',
    basis: 'ACOG PB 215 (Vaginitis in nonpregnant patients); CDC STI Treatment Guidelines 2021. Among symptomatic women: BV ~22-50%, candidiasis ~17-39%, trichomoniasis ~4-35%.',
    ties: '',
    a: [
      ['Bacterial vaginosis', 35, ['bv', 'bacterial vaginosis', 'gardnerella', 'clue cells', 'bacterial vaginitis'], 'Thin gray discharge, pH above 4.5, fishy amine odor, clue cells (Amsel criteria). Treat with metronidazole.'],
      ['Vulvovaginal candidiasis', 25, ['yeast', 'yeast infection', 'candida', 'candidiasis', 'vvc', 'vulvovaginal candidiasis', 'thrush', 'monilia', 'fungal infection'], 'Thick white discharge with itching and a normal pH (4.5 or less). Recurrent cases deserve a culture for non-albicans species.'],
      ['Trichomoniasis', 15, ['trich', 'trichomonas', 'trichomoniasis', 'trichomonas vaginalis'], 'Frothy discharge and strawberry cervix. NAAT is the test of choice, and partners must be treated.'],
      ['Physiologic discharge', 12, ['physiologic', 'normal discharge', 'leukorrhea', 'physiologic leukorrhea', 'normal', 'ovulation', 'cervical mucus'], 'Clear or white, odorless, and it changes through the cycle. Reassure her.'],
      ['Cervicitis (gonorrhea/chlamydia)', 8, ['cervicitis', 'chlamydia', 'gonorrhea', 'gc', 'ct', 'gc ct', 'sti', 'std', 'mucopurulent cervicitis', 'gonococcal', 'chlamydial'], 'Mucopurulent discharge from the os. Use NAAT, and treat presumptively if follow-up is uncertain.'],
      ['Atrophic vaginitis (GSM)', 5, ['atrophic vaginitis', 'atrophy', 'gsm', 'genitourinary syndrome of menopause', 'vaginal atrophy', 'desquamative inflammatory vaginitis', 'div'], 'Postmenopausal thin discharge with a pH above 5 and parabasal cells. Vaginal estrogen helps.']
    ] },
  { id: 'pp-fever', cat: 'OB', q: 'Postpartum fever',
    basis: 'Williams Obstetrics; ACOG. Endometritis is the most common cause (especially after cesarean). Mnemonic: Womb, Water, Wound, Wind, Walking, Wonder drugs.',
    ties: 'Wound infection and UTI are roughly tied. After a vaginal birth, UTI and mastitis rank higher.',
    a: [
      ['Endometritis', 36, ['endometritis', 'postpartum endometritis', 'endomyometritis', 'uterine infection', 'womb'], 'Fever, uterine tenderness and foul lochia. Treat with clindamycin + gentamicin. Cesarean is the biggest risk factor.'],
      ['Wound infection', 18, ['wound infection', 'cellulitis', 'incision infection', 'surgical site infection', 'ssi', 'wound', 'perineal infection', 'episiotomy infection'], 'Usually days 4-7 after cesarean. Open and drain any abscess, and watch for necrotizing fasciitis.'],
      ['Urinary tract infection', 18, ['uti', 'urinary tract infection', 'pyelonephritis', 'pyelo', 'cystitis', 'water'], 'Catheterization in labor raises the risk. Get a UA and culture.'],
      ['Mastitis / breast abscess', 14, ['mastitis', 'breast abscess', 'breast infection', 'engorgement', 'lactational mastitis'], 'A red, tender wedge with fever, usually weeks 1-6. Keep breastfeeding. Ultrasound if there is a fluctuant mass.'],
      ['Septic pelvic thrombophlebitis / VTE', 7, ['septic pelvic thrombophlebitis', 'spt', 'septic thrombophlebitis', 'dvt', 'vte', 'pulmonary embolism', 'pe', 'ovarian vein thrombosis', 'thrombophlebitis', 'walking'], 'Fever that persists despite antibiotics is a diagnosis of exclusion. CT may show ovarian vein thrombosis.'],
      ['Pneumonia / respiratory', 7, ['pneumonia', 'aspiration', 'respiratory infection', 'influenza', 'flu', 'covid', 'atelectasis', 'wind'], 'Atelectasis is a classic answer but rarely a true cause of fever. Look for pneumonia or aspiration.']
    ] },
  { id: 'htn-preg', cat: 'OB', q: 'Hypertension found during pregnancy',
    basis: 'ACOG PB 222 (Gestational hypertension and preeclampsia) and PB 203 (Chronic hypertension). Gestational HTN ~6-17% of nulliparas, preeclampsia ~2-8%, chronic HTN ~2-3%.',
    ties: '',
    a: [
      ['Gestational hypertension', 32, ['gestational hypertension', 'ghtn', 'pregnancy induced hypertension', 'pih', 'gestational htn'], 'New BP of 140/90 or higher after 20 weeks without proteinuria or severe features. Up to half progress to preeclampsia.'],
      ['Preeclampsia', 28, ['preeclampsia', 'pre eclampsia', 'pre-eclampsia', 'toxemia', 'pet', 'eclampsia', 'severe preeclampsia'], 'HTN after 20 weeks plus proteinuria or end-organ signs. Deliver at 37w0d without severe features, or at 34w0d with them.'],
      ['Chronic hypertension', 20, ['chronic hypertension', 'chronic htn', 'essential hypertension', 'preexisting hypertension', 'pre existing hypertension', 'chtn'], 'HTN before pregnancy or before 20 weeks. Treat at 140/90 or higher (CHAP trial).'],
      ['Superimposed preeclampsia', 10, ['superimposed preeclampsia', 'superimposed', 'chronic hypertension with superimposed preeclampsia'], 'Chronic HTN with new proteinuria, worsening BP or severe features. Risk is about 20-25%.'],
      ['HELLP syndrome', 6, ['hellp', 'hellp syndrome', 'hemolysis elevated liver enzymes low platelets'], 'Hemolysis, raised liver enzymes and low platelets. HTN may be mild or absent. It is a severe-features diagnosis.'],
      ['Secondary HTN (renal, endocrine)', 4, ['secondary hypertension', 'renal disease', 'kidney disease', 'pheochromocytoma', 'pheo', 'hyperthyroidism', 'hyperaldosteronism', 'cushing', 'renal artery stenosis', 'lupus nephritis', 'coarctation'], 'Suspect it with resistant HTN, hypokalemia or paroxysms. Pheochromocytoma in pregnancy is rare but deadly.']
    ] }
  ]);
  add([
  { id: 'ruq-preg', cat: 'OB', q: 'RUQ / epigastric pain in the third trimester',
    basis: 'Williams Obstetrics; ACOG PB 222. Reflux is very common, gallstone disease ~0.05-0.8%, HELLP ~0.5-0.9%, appendicitis ~1 in 1,500, AFLP ~1 in 10,000-15,000.',
    ties: '',
    a: [
      ['Reflux / GERD', 32, ['gerd', 'reflux', 'heartburn', 'gastroesophageal reflux', 'dyspepsia', 'indigestion', 'acid reflux', 'gastritis'], 'Common and benign, but RUQ or epigastric pain in the third trimester is preeclampsia until BP and labs say otherwise.'],
      ['Biliary (gallstones, cholecystitis)', 25, ['gallstones', 'cholelithiasis', 'cholecystitis', 'biliary colic', 'gallbladder', 'choledocholithiasis', 'biliary', 'gallstone'], 'Pregnancy promotes gallstones through estrogen and biliary stasis. Ultrasound first. Cholecystectomy is safest in the 2nd trimester.'],
      ['Preeclampsia / HELLP', 18, ['preeclampsia', 'hellp', 'hellp syndrome', 'pre eclampsia', 'severe preeclampsia', 'liver capsule distension', 'subcapsular hematoma'], 'RUQ or epigastric pain is a severe feature. Check CBC, AST/ALT and creatinine.'],
      ['Pyelonephritis', 10, ['pyelonephritis', 'pyelo', 'kidney infection', 'uti'], 'More common in pregnancy because of ureteral dilation. Fever, flank pain and CVA tenderness.'],
      ['Appendicitis', 9, ['appendicitis', 'appendix'], 'The appendix is displaced upward, toward the RUQ, late in pregnancy. MRI if ultrasound is nondiagnostic.'],
      ['Acute fatty liver of pregnancy', 6, ['aflp', 'acute fatty liver', 'acute fatty liver of pregnancy', 'fatty liver'], 'Rare but lethal: hypoglycemia, coagulopathy and high bilirubin (Swansea criteria). Deliver.']
    ] },
  { id: 'breast-mass', cat: 'GYN', q: 'Palpable breast mass, woman aged 20-40',
    basis: 'ACOG PB 164 (Diagnosis and management of benign breast disorders); ACR Appropriateness. Fibroadenoma is the most common solid mass under 30; cysts peak at 35-50.',
    ties: '',
    a: [
      ['Fibroadenoma', 35, ['fibroadenoma', 'fibroadenomas', 'fa', 'breast mouse', 'fibro adenoma'], 'A firm, rubbery, mobile "breast mouse." Ultrasound first under 30, and a core biopsy if it is suspicious or growing.'],
      ['Cyst / fibrocystic change', 31, ['cyst', 'breast cyst', 'fibrocystic', 'fibrocystic change', 'fibrocystic changes', 'fibrocystic disease', 'fibrocystic breast'], 'Tender and often cyclic. A simple cyst on ultrasound needs no follow-up, and aspiration helps if it is symptomatic.'],
      ['Breast cancer', 12, ['breast cancer', 'cancer', 'carcinoma', 'invasive ductal carcinoma', 'idc', 'malignancy', 'ductal carcinoma', 'dcis', 'lobular carcinoma'], 'Less likely at this age, but every persistent mass needs imaging to a definite answer, often with a biopsy.'],
      ['Abscess / mastitis', 10, ['abscess', 'breast abscess', 'mastitis', 'infection', 'periductal mastitis', 'cellulitis', 'galactocele'], 'Redness, warmth and fever, usually during lactation. Ultrasound-guided drainage. Galactoceles occur too.'],
      ['Lipoma / fat necrosis', 8, ['lipoma', 'fat necrosis', 'trauma', 'oil cyst'], 'Fat necrosis follows trauma or surgery and can mimic cancer.'],
      ['Phyllodes tumor', 4, ['phyllodes', 'phyllodes tumor', 'cystosarcoma phyllodes'], 'A fast-growing "fibroadenoma" in a woman in her 40s. Treated with wide excision.']
    ] },
  { id: 'itch-preg', cat: 'OB', q: 'Itching (pruritus) in pregnancy',
    basis: 'Williams Obstetrics; SMFM Consult #53 (ICP); dermatoses of pregnancy reviews (Ambros-Rudolph). Of the specific dermatoses, atopic eruption ~50%, PEP ~20%, ICP and pemphigoid gestationis less common.',
    ties: 'ICP prevalence ranges ~0.3-5% by population, so it can outrank PEP.',
    a: [
      ['Physiologic itch / dry skin', 30, ['dry skin', 'xerosis', 'physiologic', 'stretch marks', 'striae', 'striae gravidarum', 'skin stretching', 'normal'], 'Very common with stretching skin. Emollients help. Still ask about palms and soles at night.'],
      ['Atopic eruption of pregnancy', 24, ['atopic eruption', 'atopic eruption of pregnancy', 'aep', 'eczema', 'atopic dermatitis', 'prurigo of pregnancy', 'prurigo'], 'The most common specific dermatosis. Eczematous, often early, and benign for the fetus.'],
      ['PUPPP / PEP', 18, ['puppp', 'pep', 'polymorphic eruption of pregnancy', 'pruritic urticarial papules and plaques', 'puppps', 'pruritic urticarial papules and plaques of pregnancy'], 'Primigravidas in the third trimester, starting in the striae and sparing the umbilicus. Benign.'],
      ['Intrahepatic cholestasis (ICP)', 16, ['icp', 'cholestasis', 'intrahepatic cholestasis', 'intrahepatic cholestasis of pregnancy', 'obstetric cholestasis', 'cholestasis of pregnancy'], 'Palms and soles, worse at night, with NO primary rash. Bile acids of 100 or more raise stillbirth risk. Ursodiol and timed delivery.'],
      ['Other (scabies, urticaria, drug)', 8, ['scabies', 'urticaria', 'hives', 'drug reaction', 'contact dermatitis', 'allergy', 'allergic reaction'], 'Pregnancy does not protect against everything else. Look at the web spaces and ask about family contacts.'],
      ['Pemphigoid gestationis', 4, ['pemphigoid gestationis', 'herpes gestationis', 'pemphigoid', 'pg'], 'Periumbilical urticarial plaques that progress to bullae. Autoimmune. Linked to SGA and preterm birth.']
    ] },
  { id: 'hcg-high', cat: 'OB', q: 'hCG higher than expected for gestational age',
    basis: 'Williams Obstetrics; ACOG PB 234 (GTD). Dating error is the most common explanation; multiples raise hCG roughly in proportion; trisomy 21 raises second-trimester hCG on serum screening.',
    ties: 'Heterophile antibody and hCG-secreting tumor are tied (both rare).',
    a: [
      ['Dating error (wrong dates)', 38, ['wrong dates', 'dating error', 'incorrect dating', 'dates', 'wrong lmp', 'further along', 'misdated', 'dating', 'incorrect lmp'], 'Ultrasound dating first. A CRL beats the LMP when they differ by more than 7 days before 14 weeks.'],
      ['Multiple gestation', 28, ['twins', 'twin', 'multiple gestation', 'multiples', 'triplets', 'multiple pregnancy', 'twin pregnancy'], 'Higher hCG goes with more nausea. Determine chorionicity in the first trimester.'],
      ['Molar pregnancy (GTD)', 14, ['molar', 'mole', 'molar pregnancy', 'hydatidiform mole', 'gtd', 'gestational trophoblastic disease', 'complete mole', 'partial mole'], 'Complete moles often have an hCG above 100,000. Evacuate and follow hCG to zero.'],
      ['Fetal aneuploidy (e.g., trisomy 21)', 10, ['trisomy 21', 'down syndrome', 'aneuploidy', 'trisomy', 't21', 'chromosomal abnormality', 'downs'], 'A high hCG and low PAPP-A/AFP on the screen. Offer cfDNA or diagnostic testing.'],
      ['Phantom hCG (heterophile antibody)', 5, ['heterophile', 'heterophile antibody', 'phantom hcg', 'false positive', 'lab error', 'assay interference'], 'Serum positive but urine negative. Dilutions are nonlinear. Avoid treating a lab artifact.'],
      ['hCG-secreting tumor', 5, ['choriocarcinoma', 'germ cell tumor', 'gtn', 'gestational trophoblastic neoplasia', 'tumor', 'dysgerminoma', 'hcg secreting tumor'], 'Choriocarcinoma can follow any pregnancy, and germ cell tumors in young women. Check imaging and the trend.']
    ] },
  { id: 'adnexal-pre', cat: 'GYN', q: 'Adnexal mass in a premenopausal woman',
    basis: 'ACOG PB 174 (Evaluation and management of adnexal masses). Most are functional cysts; mature cystic teratoma is the most common benign ovarian neoplasm in this age group.',
    ties: 'Dermoid and endometrioma are close.',
    a: [
      ['Functional cyst (follicular / CL)', 36, ['functional cyst', 'follicular cyst', 'corpus luteum', 'corpus luteum cyst', 'simple cyst', 'hemorrhagic cyst', 'physiologic cyst', 'ovarian cyst', 'cyst'], 'Simple cysts under 10 cm usually resolve. Repeat ultrasound in 6-12 weeks if needed.'],
      ['Mature cystic teratoma (dermoid)', 18, ['dermoid', 'teratoma', 'mature cystic teratoma', 'dermoid cyst', 'mature teratoma'], 'Hyperechoic nodule, "dot-dash" lines, fat. The highest torsion risk of the benign masses.'],
      ['Endometrioma', 16, ['endometrioma', 'chocolate cyst', 'endometriosis', 'endometriomas'], 'Homogeneous "ground-glass" echoes. Go easy on cystectomy because it reduces ovarian reserve.'],
      ['Cystadenoma (serous / mucinous)', 13, ['cystadenoma', 'serous cystadenoma', 'mucinous cystadenoma', 'epithelial tumor', 'benign epithelial', 'cystadenofibroma'], 'Benign epithelial neoplasms. They persist and can grow large, especially mucinous ones.'],
      ['Tubal (hydrosalpinx, TOA, paratubal)', 10, ['hydrosalpinx', 'tubo ovarian abscess', 'toa', 'paratubal cyst', 'paraovarian cyst', 'tubal', 'ectopic', 'ectopic pregnancy', 'pyosalpinx'], 'Tubular, with an incomplete septum (hydrosalpinx). Always check hCG for ectopic.'],
      ['Ovarian cancer', 7, ['ovarian cancer', 'cancer', 'malignancy', 'borderline tumor', 'germ cell tumor', 'epithelial ovarian cancer', 'malignant'], 'Uncommon at this age. Solid areas, papillations or ascites call for gyn oncology (O-RADS).']
    ] },
  { id: 'adnexal-post', cat: 'GYN', q: 'Adnexal mass in a postmenopausal woman',
    basis: 'ACOG PB 174; O-RADS US. Simple cysts are found in ~15-20% of postmenopausal women and are almost always benign; malignancy risk rises with age and complexity.',
    ties: 'Simple cyst vs cystadenoma overlap (many simple cysts are small serous cystadenomas).',
    a: [
      ['Simple cyst (benign)', 32, ['simple cyst', 'cyst', 'unilocular cyst', 'ovarian cyst', 'inclusion cyst', 'functional cyst'], 'Simple cysts up to 10 cm with normal symptoms can be followed (O-RADS 2).'],
      ['Benign cystadenoma', 26, ['cystadenoma', 'serous cystadenoma', 'mucinous cystadenoma', 'cystadenofibroma', 'benign epithelial tumor'], 'The most common benign neoplasm after menopause.'],
      ['Ovarian cancer', 20, ['ovarian cancer', 'cancer', 'malignancy', 'epithelial ovarian cancer', 'high grade serous', 'serous carcinoma', 'borderline', 'malignant'], 'Solid components, papillations, ascites or a high CA-125 call for gyn oncology referral.'],
      ['Fibroma / thecoma', 9, ['fibroma', 'thecoma', 'fibrothecoma', 'sex cord stromal', 'granulosa cell tumor', 'stromal tumor', 'meigs'], 'Solid and hypoechoic. Meigs syndrome is fibroma plus ascites plus pleural effusion. Granulosa cell tumors make estrogen.'],
      ['Metastasis to ovary', 7, ['metastasis', 'metastatic', 'krukenberg', 'krukenberg tumor', 'metastatic gi cancer', 'colon cancer', 'breast cancer', 'gastric cancer'], 'From the GI tract (Krukenberg) or breast, and often bilateral. Consider colonoscopy.'],
      ['Dermoid (teratoma)', 6, ['dermoid', 'teratoma', 'mature cystic teratoma'], 'Still possible after menopause, with a rare malignant transformation (squamous).']
    ] },
  { id: 'dfm', cat: 'OB', q: 'Decreased fetal movement at 32 weeks',
    basis: 'RCOG GTG 57 (Reduced fetal movements); ACOG PB 229 (antepartum fetal surveillance). Most presentations end with reassurance; a minority reveal FGR or demise.',
    ties: '',
    a: [
      ['Fetal sleep state', 35, ['fetal sleep', 'sleep', 'sleep cycle', 'sleeping', 'baby sleeping', 'quiet state', 'rest cycle', 'normal'], 'Sleep cycles last 20-40 minutes. A reactive NST reassures.'],
      ['Reduced maternal perception', 25, ['anterior placenta', 'maternal perception', 'distraction', 'busy', 'obesity', 'perception', 'not paying attention', 'position'], 'Anterior placenta, a busy day, or fetal position. Educate her about kick counts.'],
      ['Placental insufficiency / FGR', 16, ['fgr', 'iugr', 'placental insufficiency', 'fetal growth restriction', 'growth restriction', 'uteroplacental insufficiency', 'oligohydramnios', 'hypoxia', 'fetal compromise'], 'Check growth and fluid by ultrasound. Decreased movement can precede stillbirth.'],
      ['Maternal medications / substances', 10, ['sedatives', 'medications', 'opioids', 'betamethasone', 'steroids', 'magnesium', 'alcohol', 'drugs', 'benzodiazepines', 'smoking', 'cigarettes', 'medication'], 'Opioids, sedatives, magnesium and betamethasone can transiently reduce activity.'],
      ['Fetal demise (stillbirth)', 8, ['fetal demise', 'iufd', 'stillbirth', 'fetal death', 'demise', 'intrauterine fetal demise'], 'Confirm cardiac activity right away with a doppler, then ultrasound.'],
      ['Fetal anomaly / neuromuscular', 6, ['anomaly', 'fetal anomaly', 'neuromuscular disorder', 'congenital anomaly', 'arthrogryposis', 'neurologic', 'polyhydramnios', 'aneuploidy'], 'Persistent hypokinesia with polyhydramnios suggests a neuromuscular disorder or swallowing problem.']
    ] },
  { id: 'ptc', cat: 'OB', q: 'Painful contractions at 30 weeks',
    basis: 'ACOG PB 171 (Management of preterm labor). Most women evaluated for preterm contractions do not deliver preterm; fetal fibronectin and cervical length help triage.',
    ties: 'Abruption and intraamniotic infection are close.',
    a: [
      ['Preterm contractions without labor', 40, ['braxton hicks', 'false labor', 'preterm contractions', 'prodromal labor', 'irritable uterus', 'uterine irritability', 'practice contractions', 'dehydration'], 'No cervical change: most settle. Hydration does NOT prevent preterm birth, so do not lean on it.'],
      ['True preterm labor', 22, ['preterm labor', 'ptl', 'labor', 'premature labor', 'preterm labour', 'cervical change'], 'Regular contractions plus cervical change. Steroids up to 33w6d, magnesium under 32w0d, tocolysis for 48 hours, GBS prophylaxis.'],
      ['UTI / pyelonephritis', 12, ['uti', 'pyelonephritis', 'pyelo', 'urinary tract infection', 'cystitis', 'asymptomatic bacteriuria'], 'A treatable trigger. Get a UA and culture in every evaluation.'],
      ['Placental abruption', 10, ['abruption', 'placental abruption', 'abruptio placentae'], 'Painful contractions with or without bleeding, and frequent low-amplitude contractions on the tocometer.'],
      ['Intraamniotic infection', 9, ['chorioamnionitis', 'chorio', 'intraamniotic infection', 'iai', 'triple i', 'amnionitis'], 'Fever, fetal tachycardia and uterine tenderness. Look for PPROM.'],
      ['GI cause (constipation, gastroenteritis)', 7, ['constipation', 'gastroenteritis', 'gi', 'gas', 'diarrhea', 'stomach bug'], 'Cramping from the bowel can mimic contractions. Toco plus a cervical exam sorts it out.']
    ] }
  ]);
  add([
  { id: 'hirsutism', cat: 'GYN', q: 'Hirsutism',
    basis: 'Endocrine Society Clinical Practice Guideline 2018 (Hirsutism in premenopausal women). PCOS ~70-80%, idiopathic ~5-15%, NCAH ~1-10%, tumors ~0.2%.',
    ties: 'Medications, tumors and Cushing are near-tied at the bottom.',
    a: [
      ['Polycystic ovary syndrome', 70, ['pcos', 'polycystic ovary syndrome', 'polycystic ovaries', 'polycystic ovarian syndrome'], 'By far the most common. Treat with combined OCPs and add spironolactone after 6 months if needed.'],
      ['Idiopathic hirsutism / hyperandrogenemia', 12, ['idiopathic', 'idiopathic hirsutism', 'idiopathic hyperandrogenemia', 'familial', 'genetic'], 'Normal ovulation and normal androgens. Increased skin 5-alpha-reductase activity.'],
      ['Nonclassic CAH (21-hydroxylase)', 7, ['ncah', 'nonclassic cah', 'cah', 'congenital adrenal hyperplasia', 'late onset cah', '21 hydroxylase deficiency', 'non classic congenital adrenal hyperplasia', '21-hydroxylase deficiency'], 'Check a morning follicular 17-OH progesterone. It mimics PCOS.'],
      ['Medications (androgens, others)', 5, ['medications', 'drugs', 'testosterone', 'anabolic steroids', 'valproate', 'danazol', 'androgens', 'exogenous androgens', 'medication'], 'Ask about testosterone gels, including a partner\'s (transfer).'],
      ['Androgen-secreting tumor', 3, ['tumor', 'androgen secreting tumor', 'ovarian tumor', 'adrenal tumor', 'sertoli leydig', 'adrenal carcinoma', 'hilus cell tumor', 'virilizing tumor'], 'Rapid onset with virilization (clitoromegaly, deep voice). Total testosterone above ~150-200 ng/dL.'],
      ['Cushing syndrome', 3, ['cushing', 'cushings', "cushing's", 'cushing syndrome', 'hypercortisolism'], 'Striae, proximal weakness and easy bruising. Screen with 24-hour urine cortisol, late-night salivary cortisol, or dexamethasone suppression.']
    ] },
  { id: 'pop', cat: 'GYN', q: 'Vaginal bulge / "something falling out"',
    basis: "Women's Health Initiative prolapse data (cystocele ~34%, rectocele ~19%, uterine ~14%); ACOG PB 214 (Pelvic organ prolapse).",
    ties: '',
    a: [
      ['Anterior wall prolapse (cystocele)', 40, ['cystocele', 'anterior prolapse', 'anterior wall prolapse', 'bladder prolapse', 'dropped bladder', 'anterior compartment prolapse'], 'The most common compartment. Pessary or pelvic floor PT first, and surgery if the patient wishes.'],
      ['Posterior wall prolapse (rectocele)', 22, ['rectocele', 'posterior prolapse', 'posterior wall prolapse', 'posterior compartment prolapse'], 'Splinting to defecate is classic. Distinguish it from true rectal prolapse.'],
      ['Uterine / apical prolapse', 18, ['uterine prolapse', 'apical prolapse', 'uterovaginal prolapse', 'procidentia', 'vault prolapse', 'vaginal vault prolapse', 'cervical prolapse', 'prolapse'], 'Apical support underlies anterior repairs too, so address the apex.'],
      ['Enterocele', 8, ['enterocele', 'small bowel prolapse'], 'Small bowel herniates between the vagina and rectum, often after hysterectomy.'],
      ['Vaginal wall cyst', 7, ['gartner duct cyst', 'gartner cyst', 'bartholin cyst', 'inclusion cyst', 'vaginal cyst', 'skene cyst', 'skene gland cyst', 'cyst', 'bartholin'], 'A smooth cystic bulge that does not reduce like prolapse.'],
      ['Urethral diverticulum', 5, ['urethral diverticulum', 'diverticulum'], 'The 3 Ds: dysuria, dribbling, dyspareunia. Anterior wall mass with expressible discharge. MRI.']
    ] },
  { id: 'infertility', cat: 'GYN', q: 'Infertility: causes in the couple',
    basis: 'ASRM Practice Committee (Fertility evaluation of infertile women, 2021); Speroff. Approximate: ovulatory ~25%, male factor ~25-30% (alone or combined), tubal/peritoneal ~20%, unexplained ~15-30%, endometriosis ~5-10%, uterine ~5%.',
    ties: 'Ovulatory dysfunction and male factor are essentially tied.',
    a: [
      ['Ovulatory dysfunction', 26, ['ovulatory dysfunction', 'anovulation', 'pcos', 'polycystic ovary syndrome', 'ovulation', 'diminished ovarian reserve', 'dor', 'ovarian reserve', 'age', 'advanced maternal age', 'hypothalamic', 'thyroid', 'hyperprolactinemia', 'poi'], 'PCOS is the leading cause of anovulatory infertility. Letrozole is first-line.'],
      ['Male factor', 25, ['male factor', 'male', 'sperm', 'low sperm count', 'oligospermia', 'azoospermia', 'semen analysis', 'varicocele', 'male infertility', 'partner', 'oligozoospermia'], 'Get a semen analysis early. It is cheap and drives the whole plan.'],
      ['Tubal / peritoneal factor', 20, ['tubal factor', 'tubal', 'blocked tubes', 'hydrosalpinx', 'tubal occlusion', 'pid', 'adhesions', 'tubal disease', 'chlamydia', 'tubal blockage'], 'HSG for tubal patency. Prior PID or chlamydia is the classic history. A hydrosalpinx lowers IVF success.'],
      ['Unexplained infertility', 14, ['unexplained', 'unexplained infertility', 'idiopathic'], 'Normal ovulation, tubes and semen. Ovarian stimulation + IUI, then IVF.'],
      ['Endometriosis', 9, ['endometriosis', 'endo', 'endometrioma'], 'Even mild disease lowers fecundity. Surgery or IVF depending on the case.'],
      ['Uterine factor', 6, ['uterine factor', 'fibroids', 'submucosal fibroid', 'septum', 'uterine septum', 'polyp', 'polyps', 'asherman', 'intrauterine adhesions', 'uterine anomaly', 'cervical factor'], 'Submucosal fibroids, polyps, adhesions and a septum, seen on SIS or hysteroscopy.']
    ] },
  { id: 'rpl', cat: 'GYN', q: 'Recurrent pregnancy loss (2 or more losses)',
    basis: 'ASRM Practice Committee 2012 (Evaluation and treatment of recurrent pregnancy loss); ~50% remain unexplained after evaluation. APS ~5-20%, uterine anomalies ~10-15%, parental balanced translocation ~2-5%.',
    ties: 'Uterine anomaly and APS overlap in published ranges.',
    a: [
      ['Unexplained', 42, ['unexplained', 'idiopathic', 'unknown', 'no cause', 'unexplained recurrent pregnancy loss'], 'About half of couples have no cause found, and live birth rates are still good (about 65%) with supportive care.'],
      ['Uterine anomaly (septum, etc.)', 16, ['uterine anomaly', 'septate uterus', 'septum', 'uterine septum', 'mullerian anomaly', 'fibroids', 'submucosal fibroid', 'asherman', 'intrauterine adhesions', 'bicornuate uterus', 'anatomic', 'uterine'], 'Septate uterus is the anomaly most linked to loss. Image with 3D US, SIS or MRI.'],
      ['Antiphospholipid syndrome', 14, ['aps', 'antiphospholipid syndrome', 'antiphospholipid antibodies', 'lupus anticoagulant', 'anticardiolipin', 'apla', 'antiphospholipid', 'hughes syndrome'], 'Confirm positive antibodies 12 weeks apart. Low-dose aspirin + prophylactic heparin improves live birth.'],
      ['Recurrent embryonic aneuploidy', 12, ['aneuploidy', 'embryonic aneuploidy', 'chromosomal abnormality', 'trisomy', 'chromosomal', 'genetic', 'age', 'maternal age', 'advanced maternal age'], 'The top cause of any single loss, and it rises with maternal age. Karyotype the products of conception when possible.'],
      ['Endocrine (thyroid, diabetes)', 10, ['thyroid', 'hypothyroidism', 'diabetes', 'uncontrolled diabetes', 'endocrine', 'pcos', 'hyperprolactinemia', 'luteal phase defect', 'tpo antibodies'], 'Check TSH, A1c and prolactin, and correct overt disease.'],
      ['Parental balanced translocation', 6, ['balanced translocation', 'translocation', 'parental karyotype', 'parental chromosomal abnormality', 'robertsonian translocation', 'karyotype'], 'Karyotype both partners. Genetic counseling; PGT-SR is an option.']
    ] },
  { id: 'pp-mood', cat: 'OB', q: 'Mood changes in the first weeks postpartum',
    basis: 'ACOG CO 757 (Screening for perinatal depression) and CPG 4-5 (2023, perinatal mental health). Blues ~50-80%, PPD ~10-15%, anxiety disorders ~10-20%, thyroiditis ~5-10% (often subtle), psychosis ~0.1-0.2%.',
    ties: '',
    a: [
      ['Postpartum blues', 48, ['baby blues', 'postpartum blues', 'blues', 'maternity blues'], 'Peaks around day 5 and resolves within 2 weeks. Lasting longer is depression.'],
      ['Postpartum depression', 25, ['ppd', 'postpartum depression', 'perinatal depression', 'depression', 'major depression', 'peripartum depression'], 'Screen with the EPDS or PHQ-9. SSRIs, therapy, and zuranolone/brexanolone. Ask about safety.'],
      ['Perinatal anxiety / OCD', 13, ['anxiety', 'postpartum anxiety', 'ocd', 'postpartum ocd', 'generalized anxiety', 'panic disorder', 'intrusive thoughts', 'ptsd', 'birth trauma'], 'Intrusive, ego-dystonic thoughts are common and distressing. They are treatable and not psychosis.'],
      ['Postpartum thyroiditis', 7, ['thyroiditis', 'postpartum thyroiditis', 'thyroid', 'hypothyroidism', 'hyperthyroidism'], 'A hyperthyroid phase followed by a hypothyroid one, usually 1-6 months out. Check TSH in mood symptoms.'],
      ['Bipolar disorder', 4, ['bipolar', 'bipolar disorder', 'mania', 'hypomania'], 'Screen for bipolar before starting an SSRI. Postpartum is a high-risk time for the first episode.'],
      ['Postpartum psychosis', 3, ['psychosis', 'postpartum psychosis', 'puerperal psychosis'], 'A rare emergency: confusion, hallucinations, delusions. It is often bipolar. Admit and keep mother and baby safe.']
    ] },
  { id: 'nvp', cat: 'OB', q: 'Vomiting at 9 weeks of pregnancy',
    basis: 'ACOG PB 189 (Nausea and vomiting of pregnancy). NVP affects up to 70-80% of pregnancies; hyperemesis ~0.3-3%. Ranked for an ED/triage population with significant vomiting.',
    ties: '',
    a: [
      ['Nausea and vomiting of pregnancy', 42, ['nvp', 'morning sickness', 'nausea and vomiting of pregnancy', 'pregnancy nausea', 'emesis gravidarum', 'normal pregnancy'], 'Ginger and B6 ± doxylamine first, then antiemetics. Prenatal vitamins before conception reduce it.'],
      ['Hyperemesis gravidarum', 22, ['hyperemesis', 'hyperemesis gravidarum', 'hg'], 'Weight loss over 5%, ketonuria and electrolyte problems. IV fluids with thiamine before dextrose.'],
      ['Gastroenteritis', 13, ['gastroenteritis', 'stomach flu', 'food poisoning', 'viral gastroenteritis', 'norovirus', 'stomach bug'], 'Diarrhea, fever or sick contacts point away from NVP.'],
      ['UTI / pyelonephritis', 9, ['uti', 'pyelonephritis', 'pyelo', 'urinary tract infection', 'cystitis'], 'Vomiting with fever or flank pain. Check a UA.'],
      ['Cannabinoid hyperemesis', 8, ['cannabinoid hyperemesis', 'cannabis', 'marijuana', 'chs', 'cannabis hyperemesis', 'weed', 'thc'], 'Relief with hot showers is the clue. Ask kindly and without judgment, because cannabis use in pregnancy is rising.'],
      ['Molar pregnancy', 6, ['molar', 'mole', 'molar pregnancy', 'gtd', 'hydatidiform mole', 'gestational trophoblastic disease'], 'Very high hCG and bleeding. Ultrasound clinches it. Also think of multiples and hyperthyroidism.']
    ] },
  { id: 'dyspareunia', cat: 'GYN', q: 'Pain with intercourse (dyspareunia)',
    basis: 'ACOG PB 213 (Female sexual dysfunction) and CO 673 (Persistent vulvar pain). Prevalence varies widely by age; points are deliberately flat.',
    ties: 'All six are close; rank depends on age (GSM dominates after menopause, vestibulodynia in young women).',
    a: [
      ['Genitourinary syndrome of menopause', 24, ['gsm', 'atrophy', 'vaginal atrophy', 'atrophic vaginitis', 'genitourinary syndrome of menopause', 'vaginal dryness', 'menopause', 'dryness', 'vulvovaginal atrophy', 'lactation'], 'Vaginal estrogen, DHEA, ospemifene and moisturizers. Lactation causes a similar low-estrogen state.'],
      ['Vulvodynia / vestibulodynia', 20, ['vulvodynia', 'vestibulodynia', 'provoked vestibulodynia', 'vulvar vestibulitis', 'vestibulitis'], 'Cotton-swab test at the vestibule. Multimodal care: PT, topicals, neuromodulators.'],
      ['Vaginitis / infection', 16, ['vaginitis', 'yeast', 'candida', 'bv', 'trich', 'infection', 'herpes', 'hsv', 'sti', 'std', 'cervicitis', 'candidiasis'], 'Treat what you find on the wet mount or NAAT.'],
      ['Pelvic floor hypertonus / vaginismus', 15, ['vaginismus', 'pelvic floor dysfunction', 'hypertonic pelvic floor', 'pelvic floor', 'genito pelvic pain penetration disorder', 'gpppd', 'muscle spasm', 'levator spasm'], 'Involuntary guarding. Pelvic floor physical therapy and dilators.'],
      ['Endometriosis (deep)', 13, ['endometriosis', 'endo', 'deep infiltrating endometriosis', 'adenomyosis'], 'Deep dyspareunia with dysmenorrhea and nodularity at the uterosacral ligaments.'],
      ['Inadequate arousal / lubrication', 12, ['lubrication', 'arousal', 'inadequate lubrication', 'arousal disorder', 'insufficient arousal', 'low libido', 'relationship', 'psychological', 'anxiety'], 'Ask about arousal, relationship and medications (SSRIs, OCPs). Lubricants help.']
    ] },
  { id: 'vulvar-itch', cat: 'GYN', q: 'Chronic vulvar itching',
    basis: 'ACOG PB 224 (Diagnosis and management of vulvar skin disorders, 2020); dermatology series. Candidiasis and contact dermatitis are the most common; lichen sclerosus is underdiagnosed.',
    ties: 'Lichen simplex chronicus and lichen sclerosus are close.',
    a: [
      ['Candidiasis', 28, ['yeast', 'candida', 'candidiasis', 'yeast infection', 'vvc', 'thrush'], 'Confirm with microscopy or culture. Repeated self-treatment can cause contact dermatitis.'],
      ['Contact / irritant dermatitis', 24, ['contact dermatitis', 'irritant dermatitis', 'allergic contact dermatitis', 'dermatitis', 'irritant', 'soap', 'pads', 'wipes', 'eczema', 'allergy'], 'Stop the irritants (wipes, scented products, liners). Plain emollients and a short course of a mid-potency steroid.'],
      ['Lichen simplex chronicus', 15, ['lichen simplex', 'lichen simplex chronicus', 'lsc', 'itch scratch cycle', 'neurodermatitis'], 'An itch-scratch cycle with leathery thickening. Treat the itch and protect sleep.'],
      ['Lichen sclerosus', 14, ['lichen sclerosus', 'ls', 'lichen sclerosis', 'lichen sclerosus et atrophicus'], 'White, crinkly "cigarette-paper" skin with architectural loss. Ultrapotent topical steroid and lifelong follow-up (SCC risk).'],
      ['Atrophy (GSM)', 12, ['atrophy', 'gsm', 'genitourinary syndrome of menopause', 'atrophic vaginitis', 'vaginal atrophy'], 'Postmenopausal dryness and irritation. Vaginal estrogen.'],
      ['VIN / vulvar cancer', 7, ['vin', 'vulvar intraepithelial neoplasia', 'vulvar cancer', 'cancer', 'squamous cell carcinoma', 'hsil', 'dvin', 'paget', 'pagets', 'extramammary paget', 'malignancy'], 'Any persistent or pigmented lesion, or one that fails treatment: BIOPSY.']
    ] }
  ]);
  add([
  { id: 'big-uterus', cat: 'GYN', q: 'Enlarged uterus on exam',
    basis: 'ACOG PB 228 (Management of symptomatic uterine leiomyomas); Williams Gynecology. In reproductive age, pregnancy and fibroids dominate; leiomyosarcoma is rare (~1 in 1,000-2,000 surgeries for presumed fibroids).',
    ties: 'Pregnancy and fibroids are close and depend on age.',
    a: [
      ['Pregnancy', 38, ['pregnancy', 'pregnant', 'gravid uterus', 'iup', 'intrauterine pregnancy'], 'Check hCG before you call it a fibroid.'],
      ['Fibroids (leiomyomas)', 34, ['fibroids', 'fibroid', 'leiomyoma', 'leiomyomas', 'myoma', 'myomas', 'uterine fibroids'], 'Irregular, firm, nontender enlargement. Fibroids are present in up to 70-80% of women by 50.'],
      ['Adenomyosis', 16, ['adenomyosis'], 'Diffuse, globular, tender uterus. Diagnosed on MRI or ultrasound.'],
      ['Endometrial hyperplasia / cancer', 5, ['endometrial cancer', 'endometrial hyperplasia', 'uterine cancer', 'endometrial carcinoma', 'hyperplasia', 'cancer', 'malignancy'], 'Postmenopausal bleeding plus an enlarged uterus calls for an endometrial biopsy.'],
      ['Hematometra / pyometra', 4, ['hematometra', 'pyometra', 'cervical stenosis', 'obstructed uterus'], 'Cervical stenosis after treatment, radiation or with cancer. Drain and biopsy.'],
      ['Leiomyosarcoma', 3, ['leiomyosarcoma', 'sarcoma', 'uterine sarcoma', 'lms'], 'Rare. Postmenopausal growth of a "fibroid" is a red flag. Morcellation precautions apply.']
    ] },
  { id: 'mastalgia', cat: 'GYN', q: 'Breast pain (mastalgia)',
    basis: 'ACOG PB 164 (benign breast disorders); breast clinic series. Cyclic mastalgia ~2/3 of cases; cancer presenting as pain alone is uncommon (~0.5-3%).',
    ties: '',
    a: [
      ['Cyclic mastalgia', 40, ['cyclic mastalgia', 'cyclic', 'hormonal', 'premenstrual', 'fibrocystic', 'fibrocystic changes', 'pms', 'cyclical breast pain', 'menstrual'], 'Bilateral, luteal phase, diffuse. Reassurance and a supportive bra. Exercise helps.'],
      ['Chest wall / musculoskeletal', 18, ['chest wall pain', 'costochondritis', 'musculoskeletal', 'muscle strain', 'tietze', 'msk', 'chest wall'], 'Reproduced by pressing on the ribs. Try NSAIDs.'],
      ['Noncyclic mastalgia (cyst, duct ectasia)', 15, ['noncyclic', 'noncyclic mastalgia', 'cyst', 'breast cyst', 'duct ectasia', 'non cyclic'], 'Unilateral and focal. Image if there is a focal mass or the pain persists.'],
      ['Pregnancy', 12, ['pregnancy', 'pregnant', 'early pregnancy'], 'Breast tenderness is an early symptom. Check hCG.'],
      ['Mastitis / abscess', 10, ['mastitis', 'abscess', 'breast abscess', 'infection', 'engorgement', 'lactation'], 'Redness, warmth and fever, especially when breastfeeding.'],
      ['Breast cancer', 5, ['breast cancer', 'cancer', 'inflammatory breast cancer', 'malignancy', 'carcinoma'], 'Pain alone is rarely cancer, but focal pain with a mass or skin change needs imaging.']
    ] },
  { id: 'nipple-dc', cat: 'GYN', q: 'Nipple discharge',
    basis: 'ACOG PB 164; ACR Appropriateness (Evaluation of nipple discharge). Pathologic (spontaneous, unilateral, single-duct, bloody/serous) discharge is most often intraductal papilloma (~35-50%); cancer ~5-15% of pathologic discharge.',
    ties: '',
    a: [
      ['Physiologic discharge', 30, ['physiologic', 'normal', 'physiologic discharge', 'expressed discharge', 'nipple stimulation'], 'Bilateral, multiduct, only when expressed. Reassure her and stop squeezing.'],
      ['Intraductal papilloma', 24, ['intraductal papilloma', 'papilloma', 'ductal papilloma'], 'The most common cause of bloody, single-duct discharge. Ultrasound and ductal excision.'],
      ['Duct ectasia', 18, ['duct ectasia', 'mammary duct ectasia', 'periductal mastitis', 'ectasia'], 'Thick green, black or multicolored discharge near menopause, and smoking is a risk.'],
      ['Galactorrhea (prolactin)', 14, ['galactorrhea', 'hyperprolactinemia', 'prolactinoma', 'prolactin', 'milky discharge', 'medications', 'lactation'], 'Milky and bilateral. Check prolactin, TSH and hCG, and review medications.'],
      ['Breast cancer', 8, ['breast cancer', 'cancer', 'dcis', 'carcinoma', 'malignancy', 'pagets disease', 'paget'], 'Spontaneous, unilateral, bloody or serous discharge in an older woman, or with a mass: image and refer.'],
      ['Infection / abscess', 6, ['infection', 'abscess', 'mastitis', 'subareolar abscess', 'purulent'], 'Purulent discharge with inflammation. Subareolar abscesses are linked to smoking.']
    ] },
  { id: 'prolactin', cat: 'GYN', q: 'Elevated prolactin (not pregnant)',
    basis: 'Endocrine Society Clinical Practice Guideline (Hyperprolactinemia, 2011). Medications are the most common non-physiologic cause; prolactinoma most common pathologic pituitary cause; macroprolactin ~10-25% of hyperprolactinemic sera.',
    ties: 'Hypothyroidism and macroprolactinemia are tied.',
    a: [
      ['Medications', 32, ['medications', 'drugs', 'antipsychotics', 'risperidone', 'metoclopramide', 'reglan', 'ssri', 'opioids', 'dopamine antagonists', 'antidepressants', 'haloperidol', 'medication'], 'Antipsychotics (risperidone), metoclopramide and others. Stop or switch if possible, then recheck.'],
      ['Prolactinoma', 28, ['prolactinoma', 'pituitary adenoma', 'microadenoma', 'macroadenoma', 'pituitary tumor', 'lactotroph adenoma'], 'MRI if there is no other cause. Cabergoline first.'],
      ['Hypothyroidism', 12, ['hypothyroidism', 'thyroid', 'hypothyroid', 'primary hypothyroidism'], 'High TRH stimulates prolactin. Check TSH every time.'],
      ['Macroprolactinemia', 12, ['macroprolactin', 'macroprolactinemia', 'big prolactin', 'lab artifact', 'assay'], 'Biologically inactive big prolactin and asymptomatic. Ask the lab for PEG precipitation.'],
      ['Stalk effect / other pituitary', 9, ['stalk effect', 'stalk compression', 'nonfunctioning adenoma', 'craniopharyngioma', 'hypothalamic lesion', 'stalk', 'pituitary'], 'Any lesion that compresses the stalk removes dopamine inhibition. Prolactin is usually under 100.'],
      ['Renal / liver failure, other', 7, ['renal failure', 'kidney disease', 'ckd', 'cirrhosis', 'liver failure', 'chest wall injury', 'stress', 'exercise', 'nipple stimulation', 'seizure', 'herpes zoster'], 'Decreased clearance (CKD), chest wall stimulation, stress or a recent seizure.']
    ] },
  { id: 'aub-teen', cat: 'GYN', q: 'Heavy or irregular bleeding in a 15-year-old',
    basis: 'ACOG CO 785 (Screening and management of bleeding disorders in adolescents with heavy menstrual bleeding) and CO 651 (menstruation as a vital sign). Anovulation dominates; bleeding disorders in ~20% of adolescents with HMB (vWD most common).',
    ties: '',
    a: [
      ['Anovulation (immature HPO axis)', 45, ['anovulation', 'anovulatory bleeding', 'immature hpo axis', 'hpo axis immaturity', 'hormonal', 'aub o', 'ovulatory dysfunction', 'dysfunctional uterine bleeding', 'dub'], 'Normal in the first 1-3 years after menarche. Hormones regulate it if it is heavy.'],
      ['Bleeding disorder (von Willebrand)', 18, ['von willebrand', 'vwd', 'von willebrand disease', 'bleeding disorder', 'coagulopathy', 'platelet disorder', 'aub c', 'itp', 'thrombocytopenia', 'hemophilia carrier'], 'Heavy bleeding since menarche needs a bleeding disorder screen. Ask about nosebleeds and dental bleeding.'],
      ['Pregnancy complication', 12, ['pregnancy', 'miscarriage', 'ectopic', 'pregnant', 'abortion', 'spontaneous abortion', 'threatened abortion'], 'Check hCG and ask about sexual activity alone and confidentially.'],
      ['Hormonal contraception', 10, ['contraception', 'birth control', 'breakthrough bleeding', 'ocp', 'depo', 'nexplanon', 'implant', 'pill', 'hormonal contraception', 'missed pills'], 'Breakthrough bleeding on the implant, Depo or missed pills.'],
      ['Infection (STI / PID)', 8, ['sti', 'std', 'chlamydia', 'gonorrhea', 'pid', 'cervicitis', 'infection', 'endometritis'], 'Chlamydia-related cervicitis or endometritis can cause irregular bleeding.'],
      ['Endocrine (PCOS, thyroid)', 7, ['pcos', 'thyroid', 'hypothyroidism', 'polycystic ovary syndrome', 'hyperprolactinemia', 'endocrine'], 'Persistent irregularity beyond 2-3 years, or with signs of androgen excess.']
    ] },
  { id: 'lof', cat: 'OB', q: 'Leakage of fluid at 36 weeks',
    basis: 'ACOG PB 217 (Prelabor rupture of membranes). Diagnosis by sterile speculum: pooling, nitrazine, ferning; ultrasound/AFI and immunoassays as adjuncts. Ranked for an L&D triage population.',
    ties: '',
    a: [
      ['Rupture of membranes', 35, ['rom', 'rupture of membranes', 'srom', 'prom', 'pprom', 'water broke', 'broken water', 'ruptured membranes', 'amniotic fluid', 'prelabor rupture of membranes'], 'Pooling, nitrazine and ferning. At 36 weeks or later, induce rather than wait.'],
      ['Urinary incontinence', 25, ['urine', 'urinary incontinence', 'incontinence', 'stress incontinence', 'leaking urine', 'pee', 'bladder'], 'Common in late pregnancy. Negative ferning with normal fluid points here.'],
      ['Physiologic leukorrhea', 20, ['leukorrhea', 'discharge', 'vaginal discharge', 'physiologic discharge', 'normal discharge', 'increased discharge'], 'Discharge increases in pregnancy and the pH stays acidic.'],
      ['Mucus plug / bloody show', 9, ['mucus plug', 'bloody show', 'show', 'cervical mucus', 'cervical change'], 'Thick, sometimes blood-tinged mucus with cervical change.'],
      ['Vaginitis', 7, ['vaginitis', 'bv', 'yeast', 'trich', 'bacterial vaginosis', 'candida', 'infection'], 'BV and trichomoniasis can cause a falsely positive nitrazine.'],
      ['Semen', 4, ['semen', 'intercourse', 'sex', 'postcoital'], 'Recent intercourse causes a false-positive nitrazine. Ask the patient.']
    ] },
  { id: 'sga', cat: 'OB', q: 'Estimated fetal weight below the 10th percentile',
    basis: 'SMFM Consult #52 (Fetal growth restriction, 2020); ACOG PB 227. Many SGA fetuses are constitutionally small; placental insufficiency is the leading pathologic cause.',
    ties: 'Substances and anomaly/aneuploidy are close.',
    a: [
      ['Constitutionally small (healthy)', 38, ['constitutional', 'constitutionally small', 'small but healthy', 'genetic', 'small parents', 'familial', 'normal small', 'healthy small'], 'Normal Dopplers and fluid, steady growth, and often small parents. Still follow serially.'],
      ['Placental insufficiency', 24, ['placental insufficiency', 'uteroplacental insufficiency', 'placental', 'preeclampsia', 'hypertension', 'vascular disease'], 'Umbilical artery Doppler guides timing. Absent or reversed diastolic flow raises the stakes.'],
      ['Substances (smoking, alcohol, drugs)', 12, ['smoking', 'tobacco', 'cigarettes', 'alcohol', 'drugs', 'substance use', 'cocaine', 'opioids', 'substances', 'nicotine'], 'Smoking is the biggest modifiable risk factor. Offer cessation without judgment.'],
      ['Aneuploidy / structural anomaly', 10, ['aneuploidy', 'trisomy', 'trisomy 18', 'trisomy 13', 'triploidy', 'anomaly', 'genetic syndrome', 'chromosomal', 'structural anomaly', 'chromosomal abnormality'], 'Early, severe or symmetric FGR, or with anomalies: offer a microarray.'],
      ['Incorrect dating', 9, ['wrong dates', 'dating error', 'incorrect dating', 'dates', 'misdated'], 'Always check that the dating is solid.'],
      ['Congenital infection', 7, ['infection', 'cmv', 'cytomegalovirus', 'toxoplasmosis', 'toxo', 'rubella', 'zika', 'torch', 'syphilis', 'varicella', 'malaria'], 'CMV is the most common. Look for echogenic bowel or calcifications.']
    ] },
  { id: 'labor-fever', cat: 'OB', q: 'Fever (38.0 C or higher) in labor',
    basis: 'ACOG CO 712 (Intrapartum management of intraamniotic infection); epidural-related fever studies (~20-30% of epidural labors develop fever; ~1-4% of all labors have IAI).',
    ties: 'Epidural-related fever and intraamniotic infection are a TRUE TIE and clinically indistinguishable at the bedside, which is why intraamniotic infection is treated presumptively.',
    a: [
      ['Epidural-related fever', 35, ['epidural', 'epidural fever', 'epidural related fever', 'neuraxial', 'epidural related maternal fever', 'erf'], 'Common, non-infectious and a diagnosis of exclusion. You cannot tell it from IAI at the bedside.'],
      ['Intraamniotic infection', 33, ['chorioamnionitis', 'chorio', 'intraamniotic infection', 'iai', 'triple i', 'amnionitis'], 'Treat with ampicillin + gentamicin. Antipyretics too. Cesarean only for obstetric reasons.'],
      ['UTI / pyelonephritis', 12, ['uti', 'pyelonephritis', 'pyelo', 'urinary tract infection'], 'Flank pain and CVA tenderness.'],
      ['Viral illness (flu, COVID)', 10, ['viral', 'influenza', 'flu', 'covid', 'covid 19', 'viral illness', 'uri', 'upper respiratory infection', 'pneumonia'], 'Test during the season. Isolation and pediatric planning matter.'],
      ['Misoprostol / medication', 6, ['misoprostol', 'cytotec', 'medication', 'drug fever', 'prostaglandin', 'cervical ripening'], 'Misoprostol can cause fever and shivering. It is transient.'],
      ['Other (dehydration, sepsis, etc.)', 4, ['dehydration', 'environmental', 'hyperthermia', 'sepsis', 'appendicitis', 'listeria', 'thyroid storm', 'other'], 'Do not anchor. Sepsis screening in pregnancy uses modified criteria.']
    ] }
  ]);
  add([
  { id: 'dyspnea-preg', cat: 'OB', q: 'Shortness of breath in pregnancy',
    basis: 'Williams Obstetrics; ACOG PB 196 (Thromboembolism in pregnancy) and PB 212 (Pregnancy and heart disease). Physiologic dyspnea affects up to ~70% of pregnant women; PE and cardiomyopathy are rare but leading causes of maternal death.',
    ties: '',
    a: [
      ['Physiologic dyspnea of pregnancy', 42, ['physiologic', 'physiologic dyspnea', 'normal pregnancy', 'progesterone', 'hyperventilation of pregnancy', 'gravid uterus', 'normal'], 'Gradual onset, normal vitals and exam, not at rest. Sudden or rest dyspnea needs a workup.'],
      ['Asthma exacerbation', 16, ['asthma', 'asthma exacerbation', 'bronchospasm', 'reactive airway'], 'One third worsen. Keep inhaled steroids going because uncontrolled asthma is the bigger risk.'],
      ['Respiratory infection', 14, ['pneumonia', 'infection', 'influenza', 'flu', 'covid', 'covid 19', 'uri', 'bronchitis', 'viral'], 'Pregnancy raises the severity of influenza and COVID. Vaccinate.'],
      ['Anemia', 12, ['anemia', 'iron deficiency', 'iron deficiency anemia', 'low hemoglobin', 'low iron'], 'Check a CBC and ferritin. IV iron if oral fails.'],
      ['Pulmonary embolism', 9, ['pe', 'pulmonary embolism', 'pulmonary embolus', 'vte', 'blood clot', 'dvt', 'clot'], 'A leading cause of maternal death. Tachycardia, hypoxemia and a low threshold for CTPA or V/Q.'],
      ['Cardiac (PPCM, valve disease)', 7, ['cardiomyopathy', 'peripartum cardiomyopathy', 'ppcm', 'heart failure', 'mitral stenosis', 'valve disease', 'cardiac', 'heart disease', 'pulmonary edema', 'arrhythmia'], 'Orthopnea, PND, edema and tachycardia. Get a BNP and echo. Cardiovascular disease is the leading cause of US maternal death.']
    ] },
  { id: 'leg-swell', cat: 'OB', q: 'Leg swelling in the third trimester',
    basis: 'Williams Obstetrics; ACOG PB 196. Dependent edema affects ~50-80% of pregnancies; DVT ~1 per 1,000 pregnancies (higher postpartum) but it is the can\'t-miss diagnosis, especially if unilateral.',
    ties: '',
    a: [
      ['Physiologic dependent edema', 52, ['physiologic', 'dependent edema', 'normal', 'normal swelling', 'physiologic edema', 'water retention', 'pregnancy edema', 'fluid retention'], 'Bilateral, worse at the end of the day, normal BP. Elevation and compression.'],
      ['Preeclampsia', 16, ['preeclampsia', 'pre eclampsia', 'pre-eclampsia', 'toxemia'], 'Edema was dropped from the criteria, but sudden face or hand swelling means check BP and protein.'],
      ['Deep vein thrombosis', 13, ['dvt', 'deep vein thrombosis', 'blood clot', 'vte', 'clot', 'thrombosis'], 'Usually the LEFT leg in pregnancy (May-Thurner anatomy). Compression ultrasound.'],
      ['Venous insufficiency / varicose veins', 10, ['venous insufficiency', 'varicose veins', 'varicosities', 'venous stasis', 'chronic venous insufficiency'], 'Worsens with each pregnancy. Compression stockings.'],
      ['Cellulitis', 5, ['cellulitis', 'skin infection', 'infection'], 'Unilateral, red and warm, with fever.'],
      ['Ruptured Baker cyst', 4, ['baker cyst', 'bakers cyst', 'popliteal cyst', "baker's cyst"], 'Calf pain and swelling that mimics DVT. Ultrasound sorts it out.']
    ] },
  { id: 'pp-headache', cat: 'OB', q: 'Headache in the first week postpartum',
    basis: 'Stella CL et al., AJOG 2007 (postpartum headache: tension ~39%, preeclampsia ~24%, post-dural-puncture ~16%, migraine ~11%); ACOG PB 222.',
    ties: '',
    a: [
      ['Tension-type headache', 36, ['tension headache', 'tension', 'tension type headache', 'stress headache', 'sleep deprivation', 'muscle tension', 'primary headache'], 'The most common. Still check BP every single time.'],
      ['Preeclampsia (postpartum)', 24, ['preeclampsia', 'postpartum preeclampsia', 'pre eclampsia', 'eclampsia', 'hypertension', 'severe preeclampsia', 'hellp'], 'Can appear up to 6 weeks postpartum. Headache plus HTN is severe-features until proven otherwise. Magnesium.'],
      ['Post-dural puncture headache', 16, ['pdph', 'post dural puncture headache', 'spinal headache', 'epidural headache', 'post spinal headache', 'dural puncture', 'wet tap'], 'Positional: worse upright, better lying flat. Epidural blood patch.'],
      ['Migraine', 14, ['migraine', 'migraines', 'migraine headache'], 'Often returns postpartum. Avoid estrogen if she has aura. Ibuprofen and sumatriptan are compatible with breastfeeding.'],
      ['Cerebral venous thrombosis', 5, ['cvt', 'cerebral venous thrombosis', 'cvst', 'cerebral venous sinus thrombosis', 'sinus thrombosis', 'venous sinus thrombosis'], 'Progressive headache, seizures or focal signs. MR venography.'],
      ['Stroke / RCVS / PRES', 5, ['stroke', 'rcvs', 'reversible cerebral vasoconstriction', 'pres', 'posterior reversible encephalopathy', 'subarachnoid hemorrhage', 'sah', 'hemorrhage', 'aneurysm', 'thunderclap'], 'A thunderclap headache or neuro deficit needs urgent imaging.']
    ] },
  { id: 'incontinence', cat: 'GYN', q: 'Urinary incontinence in a woman',
    basis: 'ACOG PB 155 (Urinary incontinence in women, reaffirmed); Hannestad 2000 EPINCONT (stress ~50%, mixed ~36%, urge ~11%).',
    ties: '',
    a: [
      ['Stress urinary incontinence', 40, ['sui', 'stress incontinence', 'stress urinary incontinence', 'leaking with cough', 'leak when sneeze'], 'Leakage with cough, sneeze or exercise. Pelvic floor PT first, then a pessary or sling.'],
      ['Mixed incontinence', 28, ['mixed', 'mixed incontinence', 'mixed urinary incontinence'], 'Treat the most bothersome component first.'],
      ['Urgency incontinence (OAB)', 18, ['urge', 'urge incontinence', 'urgency incontinence', 'oab', 'overactive bladder', 'detrusor overactivity'], 'Bladder training and limiting caffeine first, then beta-3 agonists (preferred over anticholinergics in older women).'],
      ['UTI', 7, ['uti', 'urinary tract infection', 'cystitis', 'infection'], 'Check a UA in every new-onset case.'],
      ['Overflow / retention', 4, ['overflow', 'overflow incontinence', 'urinary retention', 'retention', 'neurogenic bladder', 'detrusor underactivity'], 'High PVR from diabetes, neurologic disease, medications or severe prolapse.'],
      ['Fistula', 3, ['fistula', 'vesicovaginal fistula', 'vvf', 'ureterovaginal fistula', 'urinary fistula', 'obstetric fistula'], 'Constant leakage after pelvic surgery or obstructed labor. Tampon dye test.']
    ] },
  { id: 'dysmenorrhea', cat: 'GYN', q: 'Painful periods (dysmenorrhea)',
    basis: 'ACOG CO 760 (Dysmenorrhea and endometriosis in the adolescent, 2018); primary dysmenorrhea affects up to 50-90% of menstruating people.',
    ties: '',
    a: [
      ['Primary dysmenorrhea', 50, ['primary dysmenorrhea', 'primary', 'prostaglandins', 'normal cramps', 'menstrual cramps', 'cramps', 'period cramps'], 'Prostaglandin-mediated. NSAIDs started before the flow, plus hormonal methods.'],
      ['Endometriosis', 20, ['endometriosis', 'endo', 'endometrioma'], 'Pain that fails NSAIDs and hormones calls for an endometriosis workup. Diagnosis is delayed for years on average.'],
      ['Adenomyosis', 12, ['adenomyosis'], 'Heavy, painful periods with a boggy uterus, more common in parous women in their 40s.'],
      ['Fibroids', 8, ['fibroids', 'fibroid', 'leiomyoma', 'leiomyomas', 'myoma'], 'Especially submucosal ones. Look for heavy bleeding.'],
      ['Copper IUD', 6, ['copper iud', 'iud', 'paragard', 'intrauterine device'], 'It increases cramps and flow, especially in the first year.'],
      ['PID / outflow obstruction', 4, ['pid', 'pelvic inflammatory disease', 'outflow obstruction', 'obstructed hemivagina', 'cervical stenosis', 'mullerian anomaly', 'ohvira', 'imperforate hymen', 'transverse septum'], 'An obstructed hemivagina (OHVIRA) causes severe pain from menarche, often with a renal anomaly.']
    ] },
  { id: 'vulvar-ulcer', cat: 'GYN', q: 'Genital ulcer',
    basis: 'CDC STI Treatment Guidelines 2021. In the US, HSV is by far the most common cause of genital ulcer disease, followed by syphilis; chancroid and LGV are rare.',
    ties: '',
    a: [
      ['Herpes simplex (HSV)', 60, ['herpes', 'hsv', 'genital herpes', 'herpes simplex', 'hsv2', 'hsv 2', 'hsv1', 'hsv 1'], 'Painful, multiple vesicles on a red base. PCR the lesion, and give antivirals within 72 hours.'],
      ['Syphilis (chancre)', 15, ['syphilis', 'chancre', 'primary syphilis', 'treponema', 'treponema pallidum'], 'A painless, indurated, clean-based ulcer. Serology, and penicillin G. Cases are rising, including congenital syphilis.'],
      ['Trauma / excoriation', 9, ['trauma', 'excoriation', 'injury', 'fissure', 'friction', 'shaving', 'abrasion'], 'History is key. It heals with protection.'],
      ['Aphthous / Lipschutz ulcer', 8, ['aphthous', 'lipschutz', 'lipschutz ulcer', 'aphthous ulcer', 'canker sore', 'ebv', 'non sexually acquired'], 'Large, painful ulcers in adolescents after a viral illness (EBV). Not sexually transmitted.'],
      ['Behcet / Crohn disease', 5, ['behcet', 'behcets', 'crohn', 'crohns', 'crohn disease', 'inflammatory bowel disease', 'ibd', 'behcet disease'], 'Recurrent oral plus genital ulcers (Behcet), or a "knife-cut" fissure (Crohn).'],
      ['Chancroid / LGV', 3, ['chancroid', 'lgv', 'lymphogranuloma venereum', 'haemophilus ducreyi', 'donovanosis', 'granuloma inguinale'], 'Chancroid: a painful ulcer with a suppurative node. Rare in the US.']
    ] },
  { id: 'adnexal-preg', cat: 'OB', q: 'Adnexal mass found on ultrasound in pregnancy',
    basis: 'ACOG PB 174; reviews of adnexal masses in pregnancy (most resolve by the second trimester; malignancy ~1-6% of persistent masses).',
    ties: '',
    a: [
      ['Corpus luteum / functional cyst', 40, ['corpus luteum', 'corpus luteum cyst', 'functional cyst', 'simple cyst', 'follicular cyst', 'cyst'], 'It supports the pregnancy until about 10 weeks and usually resolves by 16 weeks.'],
      ['Dermoid (teratoma)', 25, ['dermoid', 'teratoma', 'mature cystic teratoma'], 'The most common persistent mass in pregnancy. Torsion risk rises in the late first and second trimester.'],
      ['Cystadenoma', 12, ['cystadenoma', 'serous cystadenoma', 'mucinous cystadenoma', 'paratubal cyst', 'paraovarian cyst'], 'Benign epithelial. Surgery in the 2nd trimester if it is large or symptomatic.'],
      ['Endometrioma (decidualized)', 10, ['endometrioma', 'decidualized endometrioma', 'endometriosis', 'chocolate cyst'], 'Decidualization can mimic malignancy, with vascular papillations. MRI helps.'],
      ['Theca lutein cysts', 8, ['theca lutein', 'theca lutein cysts', 'hyperreactio luteinalis', 'ohss', 'luteoma'], 'Bilateral and multiloculated with high hCG (multiples, mole). They regress after delivery.'],
      ['Malignancy', 5, ['cancer', 'ovarian cancer', 'malignancy', 'borderline tumor', 'germ cell tumor', 'dysgerminoma', 'malignant'], 'Rare. Germ cell tumors and borderline tumors dominate at this age.']
    ] },
  { id: 'liver-preg', cat: 'OB', q: 'Elevated liver enzymes in the third trimester',
    basis: 'ACG Clinical Guideline (Liver disease and pregnancy, 2016); SMFM Consult #53. Pregnancy-specific causes (ICP, preeclampsia/HELLP, AFLP, HG) account for most cases.',
    ties: 'ICP and preeclampsia/HELLP are close.',
    a: [
      ['Intrahepatic cholestasis', 30, ['icp', 'cholestasis', 'intrahepatic cholestasis', 'intrahepatic cholestasis of pregnancy', 'obstetric cholestasis'], 'Itching plus elevated bile acids. Transaminases can be high. Deliver at 36-39 weeks depending on bile acids.'],
      ['Preeclampsia / HELLP', 28, ['preeclampsia', 'hellp', 'hellp syndrome', 'pre eclampsia', 'severe preeclampsia'], 'Transaminases twice normal or more is a severe feature. Check platelets and LDH.'],
      ['Gallstone disease', 14, ['gallstones', 'cholelithiasis', 'choledocholithiasis', 'biliary', 'cholecystitis', 'gallbladder', 'biliary obstruction'], 'Choledocholithiasis can cause a spike in transaminases. Ultrasound or MRCP.'],
      ['Viral hepatitis', 12, ['hepatitis', 'viral hepatitis', 'hepatitis a', 'hepatitis b', 'hepatitis c', 'hepatitis e', 'hsv hepatitis', 'cmv', 'ebv'], 'Hepatitis E and HSV hepatitis are dangerous in pregnancy. Order serologies.'],
      ['Hyperemesis gravidarum', 10, ['hyperemesis', 'hyperemesis gravidarum', 'hg'], 'Mild transaminitis in the 1st trimester. Unusual in the 3rd trimester, so consider it as a diagnosis of exclusion.'],
      ['Acute fatty liver of pregnancy', 6, ['aflp', 'acute fatty liver', 'acute fatty liver of pregnancy', 'fatty liver'], 'Hypoglycemia, coagulopathy and encephalopathy. Swansea criteria. Prompt delivery.']
    ] },
  { id: 'postcoital', cat: 'GYN', q: 'Postcoital bleeding',
    basis: 'Tarney & Han, Obstet Gynecol Int 2014 (Postcoital bleeding: a review); ACOG. Cervical cancer is found in ~3-5.5% of women referred with postcoital bleeding.',
    ties: 'Ectropion and cervicitis are near-tied.',
    a: [
      ['Cervical ectropion', 26, ['ectropion', 'cervical ectropion', 'erosion', 'cervical erosion', 'eversion', 'ectopy'], 'Friable columnar epithelium, common with OCPs and in pregnancy. Benign.'],
      ['Cervicitis (STI)', 24, ['cervicitis', 'chlamydia', 'gonorrhea', 'sti', 'std', 'trich', 'trichomonas', 'infection', 'gc', 'ct'], 'NAAT for gonorrhea, chlamydia and trichomonas.'],
      ['Cervical / endometrial polyp', 16, ['polyp', 'cervical polyp', 'endometrial polyp', 'polyps'], 'Removed in the office and sent to pathology.'],
      ['Atrophy (GSM)', 14, ['atrophy', 'gsm', 'atrophic vaginitis', 'vaginal atrophy', 'genitourinary syndrome of menopause'], 'Thin, fragile tissue after menopause. Vaginal estrogen.'],
      ['Trauma / vaginal lesion', 12, ['trauma', 'laceration', 'vaginal laceration', 'injury', 'tear', 'vaginitis', 'vaginal lesion'], 'Lacerations and vaginitis. Always look at the vaginal walls.'],
      ['Cervical cancer / CIN', 8, ['cervical cancer', 'cancer', 'cin', 'cervical dysplasia', 'dysplasia', 'hsil', 'cervical intraepithelial neoplasia', 'hpv', 'malignancy'], 'Cotest if not up to date. A visible lesion needs a biopsy whatever the Pap says.']
    ] },
  { id: 'iud-strings', cat: 'GYN', q: 'IUD strings not visible',
    basis: 'ACOG PB 186 (Long-acting reversible contraception: implants and intrauterine devices) and clinical reviews. Most cases are retracted strings within a correctly placed IUD.',
    ties: '',
    a: [
      ['Strings retracted (IUD in place)', 50, ['retracted strings', 'strings retracted', 'curled up', 'strings in canal', 'strings in cervix', 'retracted', 'normal', 'in place', 'strings curled'], 'Try a cytobrush in the canal, then ultrasound. Use backup contraception until you confirm it.'],
      ['Expulsion', 25, ['expulsion', 'expelled', 'fell out', 'expelled iud'], 'Highest in the first year and postpartum. Ultrasound or X-ray if it is not in the uterus.'],
      ['Malposition (embedded, low-lying)', 12, ['malposition', 'malpositioned', 'embedded', 'displaced', 'low lying', 'partial expulsion', 'rotated'], 'Seen on 3D US. Remove or replace if it is in the cervix.'],
      ['Pregnancy', 8, ['pregnancy', 'pregnant', 'ectopic', 'ectopic pregnancy'], 'Check hCG. A growing uterus can pull the strings up, and IUD failures raise the ectopic risk.'],
      ['Uterine perforation', 5, ['perforation', 'uterine perforation', 'perforated', 'translocated', 'intraabdominal', 'migrated'], 'About 1-2 per 1,000 insertions, higher when breastfeeding. Laparoscopic removal.']
    ] },
  { id: 'fetal-tachy', cat: 'OB', q: 'Fetal tachycardia (baseline above 160)',
    basis: 'ACOG PB 106 (Intrapartum FHR monitoring); NICHD categories. Maternal fever/intraamniotic infection is the most common cause; primary fetal tachyarrhythmias (often above 200 bpm) are rare.',
    ties: 'SVT and fetal anemia are tied (both uncommon).',
    a: [
      ['Maternal fever / intraamniotic infection', 40, ['fever', 'maternal fever', 'chorioamnionitis', 'chorio', 'intraamniotic infection', 'iai', 'triple i', 'infection', 'sepsis'], 'The classic cause. Treat the fever and the infection, and watch the tracing.'],
      ['Medications (beta-agonists, etc.)', 18, ['terbutaline', 'beta agonists', 'medications', 'drugs', 'atropine', 'albuterol', 'cocaine', 'stimulants', 'ephedrine', 'caffeine', 'meth', 'methamphetamine', 'medication'], 'Terbutaline, atropine, ephedrine and stimulants.'],
      ['Fetal hypoxemia (evolving)', 14, ['hypoxemia', 'hypoxia', 'fetal hypoxia', 'acidemia', 'fetal distress', 'abruption', 'evolving hypoxia', 'compensatory'], 'Tachycardia with lost variability and recurrent decelerations is a warning trend.'],
      ['Maternal hyperthyroidism', 10, ['hyperthyroidism', 'thyroid', 'graves', 'graves disease', 'thyrotoxicosis', 'fetal thyrotoxicosis', 'thyroid storm'], 'TSI antibodies cross the placenta, causing fetal thyrotoxicosis.'],
      ['Fetal tachyarrhythmia (SVT)', 9, ['svt', 'supraventricular tachycardia', 'arrhythmia', 'tachyarrhythmia', 'atrial flutter', 'fetal arrhythmia'], 'Often above 200 bpm with abrupt onset. Fetal echo and maternal digoxin or flecainide.'],
      ['Fetal anemia', 9, ['anemia', 'fetal anemia', 'alloimmunization', 'isoimmunization', 'rh disease', 'parvovirus', 'fetomaternal hemorrhage', 'hemolytic disease'], 'MCA peak systolic velocity Doppler. Consider alloimmunization, parvovirus and fetomaternal hemorrhage.']
    ] }
  ]);

  var api = { ROUNDS: R };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FEUD_ROUNDS = R;
})(typeof window !== 'undefined' ? window : globalThis);
