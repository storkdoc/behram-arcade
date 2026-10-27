/* ==========================================================================
   LIVING CHESS — voice.js : spoken pleas with the Web Speech API.
   One distinct voice per piece type (King deep/slow/wary, Queen
   commanding, Rook gruff/low, Bishop measured/higher, Knight brisk/bold,
   Pawn young/fast/high). Prefers good installed voices (Premium /
   Enhanced / Siri-like Samantha, Daniel, Karen, Moira, Alex, natural
   cloud voices) and falls back gracefully. Emotion shifts pitch and rate
   (terror faster+higher, grief slower). Speech is queued so pieces never
   talk over each other; a new hover interrupts. Word-boundary events drive
   the mouth (with a syllable-timer fallback where boundaries don't fire).
   iOS Safari: unlocked by a silent utterance inside the first gesture.
   ========================================================================== */
(function (root) {
  'use strict';
  const SS = root.speechSynthesis, U = root.SpeechSynthesisUtterance;
  const supported = !!(SS && U);
  const st = { on: true, vol: 0.9, unlocked: false, voices: [], pick: {}, speaking: null, queue: [], gen: 0 };
  const MALE = /daniel|alex|fred|tom|arthur|oliver|aaron|gordon|rishi|thomas|lee|ralph|bruce|junior|albert|reed|eddy|rocko|grandpa|evan|nathan|google uk english male|microsoft (guy|ryan|davis|george|christopher|eric|andrew|brian|roger|steffan)|male/i;
  const FEMALE = /samantha|karen|moira|serena|victoria|tessa|fiona|kate|allison|ava|susan|zoe|nicky|martha|catherine|flo|sandy|shelley|grandma|google uk english female|google us english|microsoft (aria|jenny|sonia|libby|michelle|emma|ana|clara|natasha)|female/i;
  const NOVELTY = /bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|bad news|good news|hysterical|deranged|albert|jester|superstar|wobble/i;
  function quality(v) {
    let s = 0; const n = v.name;
    if (/premium/i.test(n)) s += 6; if (/enhanced/i.test(n)) s += 5; if (/siri/i.test(n)) s += 4; if (/natural|neural|online/i.test(n)) s += 4;
    if (/samantha|daniel|karen|moira|alex|serena|arthur|tom|oliver/i.test(n)) s += 3; if (/google/i.test(n)) s += 2;
    if (/^en[-_]GB/i.test(v.lang)) s += 1.2; else if (/^en[-_](US|AU|IE|ZA|IN)/i.test(v.lang)) s += 1; else if (/^en/i.test(v.lang)) s += 0.5; else s -= 20;
    if (NOVELTY.test(n)) s -= 30; if (v.localService) s += 0.5; return s;
  }
  // base characters: gender preference, pitch, rate, preferred names
  const CAST = {
    king:   { g: 'm', pitch: 0.62, rate: 0.84, prefer: /daniel|arthur|alex|gordon|george|ryan/i },
    queen:  { g: 'f', pitch: 0.95, rate: 0.96, prefer: /serena|moira|karen|sonia|kate|victoria/i },
    rook:   { g: 'm', pitch: 0.48, rate: 0.86, prefer: /tom|fred|ralph|guy|davis|alex/i },
    bishop: { g: 'm', pitch: 1.12, rate: 0.9, prefer: /oliver|daniel|rishi|aaron|george/i },
    knight: { g: 'm', pitch: 1.0, rate: 1.13, prefer: /alex|aaron|tom|evan|andrew|guy/i },
    pawn:   { g: 'f', pitch: 1.45, rate: 1.16, prefer: /samantha|karen|tessa|allison|ava|aria|jenny/i },
  };
  const EMO = { terror: [1.16, 1.2], horror: [1.2, 1.2], anxiety: [1.05, 1.08], pain: [1.0, 0.95], grief: [0.9, 0.8], thrill: [1.08, 1.1], joy: [1.1, 1.05], resolve: [0.95, 0.92], pride: [0.97, 0.95], longing: [1.04, 0.92], calm: [1, 1] };
  function load() {
    if (!supported) return;
    const vs = SS.getVoices() || []; if (!vs.length) return;
    st.voices = vs.filter(v => /^en/i.test(v.lang)).sort((a, b) => quality(b) - quality(a));
    if (!st.voices.length) st.voices = vs.slice();
    const males = st.voices.filter(v => MALE.test(v.name) && !FEMALE.test(v.name)), females = st.voices.filter(v => FEMALE.test(v.name)), used = new Set();
    for (const k of ['king', 'queen', 'rook', 'knight', 'bishop', 'pawn']) {
      const c = CAST[k], pool = (c.g === 'm' ? males : females).concat(st.voices);
      let v = pool.find(x => c.prefer.test(x.name) && !used.has(x.name) && quality(x) > 0) || pool.find(x => !used.has(x.name) && quality(x) > 0) || pool[0] || null;
      if (v) used.add(v.name); st.pick[k] = v;
    }
  }
  if (supported) { load(); if (SS.addEventListener) SS.addEventListener('voiceschanged', load); else SS.onvoiceschanged = load; }
  /** must run inside a user gesture the first time (iOS) */
  function unlock() {
    if (!supported || st.unlocked) return; st.unlocked = true;
    try { const u = new U(' '); u.volume = 0; u.rate = 1; SS.speak(u); } catch (e) { }
    load();
  }
  ['touchend', 'click', 'keydown', 'pointerup'].forEach(e => root.addEventListener && root.addEventListener(e, unlock, { capture: true, passive: true }));

  const NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
  /** "Nxe4+" -> "Knight takes e4, check" */
  function speakable(text) {
    return text.replace(/\s*\(Counsel:[^)]*\)/g, '')
      .replace(/\bO-O-O\b/g, 'castle long').replace(/\bO-O\b/g, 'castle short')
      .replace(/\b([KQRBN])?([a-h1-8]{0,2})(x)?([a-h][1-8])(=([QRBN]))?([+#])?(?=[\s,.!?;:]|$)/g, (m, p, dis, x, sq, _pr, promo, ck) => {
        if (!p && !x && !promo && !ck && !dis) return sq.toUpperCase();
        let s = (p ? NAMES[p] : (dis ? 'pawn' : '')) + (x ? ' takes ' : ' to ') + sq.toUpperCase(); if (!p && !x) s = sq.toUpperCase();
        if (promo) s += ', promotes to ' + NAMES[promo]; if (ck === '+') s += ', check'; if (ck === '#') s += ', checkmate'; return s.trim();
      }).replace(/\.\.\./g, ', ').replace(/\s+/g, ' ').trim();
  }
  function settings(voiceKey, emo) {
    const c = CAST[voiceKey] || CAST.pawn, e = EMO[emo] || EMO.calm;
    return { voice: st.pick[voiceKey] || null, pitch: Math.max(0.1, Math.min(2, c.pitch * e[0])), rate: Math.max(0.5, Math.min(1.8, c.rate * e[1])) };
  }
  /** say(text, {voice:'knight', emo, interrupt, onstart, onword, onend}) */
  function say(text, o = {}) {
    if (!supported || !st.on || st.vol <= 0) { o.onend && setTimeout(o.onend, 0); return false; }
    const item = { text: speakable(text), o };
    if (o.interrupt) { st.queue.length = 0; if (SS.speaking || SS.pending || st.speaking) { st.gen++; try { SS.cancel(); } catch (e) { } const prev = st.speaking; st.speaking = null; prev && prev.o.onend && prev.o.onend(); } }
    if (o.dedupe && st.queue.some(q => q.text === item.text)) return false;
    st.queue.push(item); if (st.queue.length > 3) st.queue.splice(0, st.queue.length - 3);
    if (!st.speaking) setTimeout(next, o.interrupt ? 60 : 0);
    return true;
  }
  function next() {
    if (st.speaking || !st.queue.length) return;
    const it = st.queue.shift(), s = settings(it.o.voice, it.o.emo), u = new U(it.text), gen = ++st.gen;
    if (s.voice) { u.voice = s.voice; u.lang = s.voice.lang; } else u.lang = 'en-US';
    u.pitch = s.pitch; u.rate = s.rate; u.volume = st.vol;
    let gotWord = false, timer = null; st.speaking = it;
    const done = () => { if (gen !== st.gen && st.speaking !== it) return; clearInterval(timer); if (st.speaking === it) st.speaking = null; it.o.onend && it.o.onend(); setTimeout(next, 120); };
    u.onstart = () => { it.o.onstart && it.o.onstart(); // fallback mouth when no boundary events arrive
      timer = setInterval(() => { if (!gotWord) it.o.onword && it.o.onword(0.6 + Math.random() * 0.4); }, 170 / s.rate); };
    u.onboundary = e => { if (e.name && e.name !== 'word') return; gotWord = true; it.o.onword && it.o.onword(1); };
    u.onend = done; u.onerror = done;
    try { SS.speak(u); } catch (e) { done(); }
    // safety: some engines never fire onend
    setTimeout(() => { if (st.speaking === it && !SS.speaking) done(); }, 1500 + it.text.length * 110 / s.rate);
  }
  function stop() { st.queue.length = 0; if (supported) { st.gen++; try { SS.cancel(); } catch (e) { } } const p = st.speaking; st.speaking = null; p && p.o.onend && p.o.onend(); }
  root.LCVoice = {
    st, say, stop, unlock, speakable, settings, get supported() { return supported; },
    setOn(v) { st.on = !!v; if (!v) stop(); }, setVol(v) { st.vol = +v; if (v <= 0) stop(); },
    get busy() { return !!st.speaking || st.queue.length > 0; },
    voiceName(k) { const v = st.pick[k]; return v ? v.name : 'default'; },
  };
})(window);
