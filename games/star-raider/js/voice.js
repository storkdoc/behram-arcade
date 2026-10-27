/* STAR RAIDER — voice.js : the ship computer speaks, with the browser's speechSynthesis.
   Picks the best installed English voice (Mac/iOS: Samantha, Ava, Allison, Karen, Daniel… preferring
   "Enhanced"/"Premium"/"Siri" variants; Chrome: Google US English), throttles and de-duplicates callouts so it
   never babbles, lets urgent lines cut in, and on iOS only starts after the first user gesture
   (a silent primer utterance spoken inside the gesture unlocks it). Volume 0..1 plus mute. */
(function (root) {
  'use strict';
  const SS = root.speechSynthesis, U = root.SpeechSynthesisUtterance;
  let voice = null, vol = 0.8, muted = false, primed = false, last = {}, queue = [], speaking = false, lastAny = 0;
  const PREF = [/siri/i, /premium/i, /enhanced/i, /^samantha/i, /^ava/i, /^allison/i, /^susan/i, /^karen/i, /^daniel/i, /^serena/i, /^moira/i, /google us english/i, /microsoft (aria|jenny|guy)/i, /^alex$/i];
  const BAD = /(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|princess|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)/i;
  function pick() {
    if (!SS) return null; const vs = SS.getVoices() || []; if (!vs.length) return null;
    const en = vs.filter(v => /^en(-|_|$)/i.test(v.lang) && !BAD.test(v.name));
    const pool = en.length ? en : vs; let best = null, bs = -1;
    for (const v of pool) { let s = 0; PREF.forEach((re, i) => { if (re.test(v.name)) s += 40 - i; }); if (/en-US/i.test(v.lang)) s += 6; else if (/en-GB|en-AU/i.test(v.lang)) s += 4; if (v.localService) s += 3; if (s > bs) { bs = s; best = v; } }
    return best;
  }
  if (SS) { voice = pick(); try { SS.addEventListener ? SS.addEventListener('voiceschanged', () => { voice = pick(); }) : (SS.onvoiceschanged = () => { voice = pick(); }); } catch (e) {} }
  /** call inside a user gesture (touchend / click / keydown): iOS requires the first utterance there */
  function unlock() {
    if (!SS || primed) return; primed = true;
    try { const u = new U(' '); u.volume = 0; if (voice) u.voice = voice; SS.speak(u); } catch (e) {}
  }
  function pump() {
    if (speaking || !queue.length || !SS) return;
    const it = queue.shift(); speaking = true;
    try {
      const u = new U(it.text); if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.volume = vol; u.rate = it.urgent ? 1.08 : 1.0; u.pitch = 0.92;
      const done = () => { speaking = false; setTimeout(pump, 120); };
      u.onend = done; u.onerror = done; setTimeout(() => { if (speaking) done(); }, 6000);
      SS.speak(u); lastAny = Date.now();
    } catch (e) { speaking = false; }
  }
  /** say(text, {key, gap (s) between repeats of the same key, urgent: cut in front}) */
  function say(text, o = {}) {
    if (!SS || muted || vol <= 0.01 || !primed) return false;
    const k = o.key || text, now = Date.now(), gap = (o.gap == null ? 6 : o.gap) * 1000;
    if (last[k] && now - last[k] < gap) return false; last[k] = now;
    if (queue.some(q => q.text === text)) return false;
    if (o.urgent) { queue = queue.filter(q => q.urgent); queue.unshift({ text, urgent: true }); if (speaking && SS.speaking && !o.noCut) { try { SS.cancel(); } catch (e) {} speaking = false; } }
    else { if (queue.length >= 2) queue.shift(); queue.push({ text }); }
    pump(); return true;
  }
  /** sector coordinates read the way a computer would: "4-7" -> "four seven" */
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
  const sector = (x, y) => 'sector ' + (NUM[x] || x) + ' ' + (NUM[y] || y);
  function stop() { queue = []; speaking = false; try { SS && SS.cancel(); } catch (e) {} }
  root.SRVoice = {
    say, unlock, stop, sector,
    get supported() { return !!SS; }, get name() { return voice ? voice.name : ''; }, get primed() { return primed; },
    setVolume(v) { vol = Math.max(0, Math.min(1, +v || 0)); }, get volume() { return vol; },
    setMuted(m) { muted = !!m; if (muted) stop(); }, get muted() { return muted; },
  };
})(window);
