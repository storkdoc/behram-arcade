/* NAME THAT GROOVE: the composer. Turns a catalog entry into a 7-bar arrangement (a list of timed note
   events) from its seed: tempo, key, mode, chord progression, drum groove, bass line, comping and an
   original 2-bar hook that is stated, varied and resolved. The clip builds up so faster ears score more:
     bar 1 drums  ->  bar 2 + bass  ->  bar 3 + chords  ->  bars 4-7 + the hook.
   Pure and deterministic (same song => same events), so it is tested in Node. */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./catalog.js') : root.NTG_Catalog;
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
  const BARS = 7, STAGES = [{ bar: 0, key: 'drums', label: 'DRUMS' }, { bar: 1, key: 'bass', label: 'BASS' }, { bar: 2, key: 'chords', label: 'CHORDS' }, { bar: 3, key: 'hook', label: 'HOOK' }];
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  function deg2semi(scale, d) { const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return scale[i] + 12 * o; }

  function params(song) {
    const S = C.STYLES[song.style], r = C.rng(song.seed);
    const mode = C.pick(r, S.modes), scale = SCALES[mode];
    const p = {
      style: song.style, decade: song.decade, kit: S.kit, swing: S.swing || 0,
      bpm: C.randInt(r, S.bpm[0], S.bpm[1]), mode, scale,
      root: 40 + C.randInt(r, 0, 7),                     // bass root E2..B2
      prog: C.pick(r, S.progs).slice(),
      bassPat: C.pick(r, S.bass), bassInst: C.pick(r, S.bassInst),
      comp: C.pick(r, S.comp), compRhythm: C.pick(r, S.compRhythm),
      lead: C.pick(r, S.leads), extra: C.pick(r, S.extras),
      sevenths: r() < (/soul|softrock|rnb|house|boombap|funk/.test(song.style) ? 0.8 : 0.25)
    };
    // seeded groove variation: one extra kick, a few ghost snares
    p.drums = Object.assign({}, S.drums);
    if (r() < 0.5) { const k = p.drums.k.split(''); const i = C.pick(r, [3, 7, 11, 14, 15]); if (k[i] === '.') k[i] = 'g'; p.drums.k = k.join(''); }
    p.hook = makeHook(r, S.hook, p);
    p.keyName = NOTE_NAMES[p.root % 12] + (mode === 'major' || mode === 'mixolydian' ? ' major' : ' minor');
    return p;
  }

  function chordTones(p, deg) { return [0, 2, 4].concat(p.sevenths ? [6] : []).map(x => deg + x); }

  // a 2-bar hook motif on a 16th grid: [{step, len, deg}], degrees relative to the tonic (scale steps)
  function makeHook(r, H, p) {
    const steps = []; const grid = H.grid; // 1 = 16ths allowed, 2 = 8ths
    for (let bar = 0; bar < 2; bar++) {
      const n = C.randInt(r, H.notes[0], H.notes[1]);
      const cand = [];
      for (let s = 0; s < 16; s += grid) cand.push({ s: bar * 16 + s, w: s % 4 === 0 ? 3 : s % 2 === 0 ? 2 : 1.2 });
      const picked = new Set(bar === 0 ? [0] : []);
      while (picked.size < Math.min(n, cand.length)) { let tot = 0; cand.forEach(c => { if (!picked.has(c.s)) tot += c.w; }); let x = r() * tot; for (const c of cand) { if (picked.has(c.s)) continue; x -= c.w; if (x <= 0) { picked.add(c.s); break; } } }
      steps.push(...[...picked].sort((a, b) => a - b));
    }
    const notes = []; let deg = C.pick(r, [0, 2, 4, 4, 7]);
    steps.forEach((s, i) => {
      const chordDeg = p.prog[Math.floor(s / 16)];
      const strong = s % 8 === 0;
      if (i > 0) { const leap = r() < H.leap; deg += leap ? C.pick(r, [-4, -3, 3, 4, 5]) : C.pick(r, [-2, -1, -1, 1, 1, 2, 0]); }
      if (strong) { // snap to the nearest chord tone
        const tones = chordTones(p, chordDeg); let best = deg, bd = 99;
        for (let o = -14; o <= 14; o += 7) for (const t of tones) { const c = t + o; if (Math.abs(c - deg) < bd) { bd = Math.abs(c - deg); best = c; } }
        deg = best;
      }
      deg = Math.max(H.range[0], Math.min(H.range[1], deg));
      const next = i + 1 < steps.length ? steps[i + 1] : 32;
      notes.push({ step: s, len: Math.max(1, Math.min(next - s, r() < 0.7 ? next - s : 2)), deg });
    });
    // answer phrase: same rhythm, last notes re-pitched to land on the tonic / chord root
    const answer = notes.map(n => ({ step: n.step, len: n.len, deg: n.deg }));
    const tail = Math.max(1, Math.min(3, answer.length - 1));
    for (let i = answer.length - tail; i < answer.length; i++) answer[i].deg = Math.max(H.range[0], answer[i].deg + C.pick(r, [-2, -1, 1]));
    answer[answer.length - 1].deg = answer[answer.length - 1].deg >= 4 ? 7 : 0;
    answer[answer.length - 1].len = Math.max(answer[answer.length - 1].len, 4);
    return { a: notes, b: answer };
  }

  const LEAD_OCT = { whistle: 36, bell: 24, flute: 24, saw: 24, synth: 24, strings: 24, voice: 12, sax: 12, brass: 12, guitar: 12, pianolead: 24, organlead: 24 };

  function arrange(song, opt) {
    opt = opt || {};
    const p = params(song), spb = 60 / p.bpm, st = spb / 4;
    const from = opt.fromBar || 0, upto = Math.min(BARS, from + (opt.bars || BARS));
    const ev = [];
    const T = (bar, step) => (bar * 16 + step) * st + (step % 2 === 1 ? p.swing * st : 0);
    const chordAt = bar => p.prog[bar % 4];
    const chordRoot = bar => { let m = p.root + deg2semi(p.scale, chordAt(bar)); while (m > 47) m -= 12; return m; };
    const voicing = bar => { const d = chordAt(bar); return chordTones(p, d).map(x => { let m = p.root + 12 + deg2semi(p.scale, x); while (m > 69) m -= 12; while (m < 53) m += 12; return m; }).sort((a, b) => a - b); };
    for (let bar = 0; bar < BARS; bar++) {
      // ---- drums (all bars). Fill into the hook on bar 3, crash on the downbeat of the hook ----
      for (const inst of Object.keys(p.drums)) {
        const pat = p.drums[inst];
        for (let s = 0; s < 16; s++) {
          const c = pat[s]; if (c === '.') continue;
          if (bar === 2 && s >= 12 && (inst === 's' || inst === 'h' || inst === 'o')) continue; // room for the fill
          ev.push({ t: T(bar, s), layer: 'drums', kind: 'drum', inst, vel: c === 'X' ? 1 : c === 'g' ? 0.35 : (inst === 'h' && s % 4 !== 0 ? 0.6 : 0.85) });
        }
      }
      if (bar === 2) { const fill = (p.extra === 'tomfill') ? ['t3', 't2', 't2', 't1'] : ['s', 's', 's', 's']; for (let i = 0; i < 4; i++) ev.push({ t: T(2, 12 + i), layer: 'drums', kind: 'drum', inst: fill[i], vel: 0.5 + i * 0.15 }); }
      if (bar === 3 || bar === 0) ev.push({ t: T(bar, 0), layer: 'drums', kind: 'drum', inst: 'cr', vel: bar === 3 ? 0.8 : 0.45 });
      // ---- bass from bar 2 ----
      if (bar >= 1) {
        const R = chordRoot(bar), nextR = chordRoot(bar + 1);
        const pat = p.bassPat;
        for (let s = 0; s < 16; s++) {
          const c = pat[s]; if (c === '.') continue;
          let n = c === 'O' ? R + 12 : c === 'F' ? R + 7 : c === 'A' ? nextR - 1 : R;
          let len = 1; while (s + len < 16 && pat[s + len] === '.' && len < 4) len++;
          ev.push({ t: T(bar, s), layer: 'bass', kind: 'bass', inst: p.bassInst, midi: n, dur: len * st * 0.92, vel: c === 'r' ? 0.45 : 0.85 });
        }
      }
      // ---- chords from bar 3 ----
      if (bar >= 2) {
        const pat = p.compRhythm, v = voicing(bar);
        for (let s = 0; s < 16; s++) {
          if (pat[s] !== 'x') continue;
          let len = 1; while (s + len < 16 && pat[s + len] === '-') len++;
          ev.push({ t: T(bar, s), layer: 'chords', kind: 'chord', inst: p.comp, midis: v, dur: Math.max(len, p.comp === 'clav' || p.comp === 'stab' ? 1 : 2) * st * 0.95, vel: 0.7 });
        }
        if (p.extra === 'arp') for (let s = 0; s < 16; s++) { const n = v[s % v.length] + (Math.floor(s / v.length) % 2 ? 12 : 0); ev.push({ t: T(bar, s), layer: 'chords', kind: 'lead', inst: 'arp', midi: n + 12, dur: st * 0.8, vel: 0.35 }); }
      }
      // ---- hook bars 4-7: A, B (answer), A, B ----
      if (bar >= 3) {
        const half = (bar - 3) % 2, phrase = (bar - 3) < 2 ? p.hook.a : p.hook.b;
        const oct = LEAD_OCT[p.lead] || 24;
        for (const n of phrase) {
          if (Math.floor(n.step / 16) !== half) continue;
          const s = n.step % 16;
          ev.push({ t: T(bar, s), layer: 'hook', kind: 'lead', inst: p.lead, midi: p.root + oct + deg2semi(p.scale, n.deg), dur: n.len * st * 0.9, vel: 0.8 });
        }
      }
    }
    // ---- signature extras ----
    const X = p.extra;
    if (X === 'run') for (let i = 0; i < 8; i++) ev.push({ t: T(2, 8 + i), layer: 'fx', kind: 'lead', inst: 'strings', midi: p.root + 24 + deg2semi(p.scale, i), dur: st, vel: 0.4 });
    if (X === 'tamb' || X === 'shaker' || X === 'cowbell' || X === 'snap' || X === 'clap') for (let bar = 1; bar < BARS; bar++) for (let s = 0; s < 16; s++) {
      const on = X === 'cowbell' ? (s % 4 === 2) : X === 'snap' || X === 'clap' ? (s === 4 || s === 12) : X === 'tamb' ? (s % 4 === 2) : (s % 2 === 0);
      if (on) ev.push({ t: T(bar, s), layer: bar < 2 ? 'drums' : 'fx', kind: 'drum', inst: X, vel: X === 'shaker' ? (s % 4 === 2 ? 0.6 : 0.35) : 0.6 });
    }
    if (X === 'horns') for (let bar = 2; bar < BARS; bar++) ev.push({ t: T(bar, 14), layer: 'fx', kind: 'chord', inst: 'brass', midis: voicing(bar).map(m => m + 12), dur: st * 1.6, vel: 0.55 });
    if (X === 'orch') { ev.push({ t: T(3, 0), layer: 'fx', kind: 'fx', inst: 'orch', midi: chordRoot(3) + 24, dur: 0.6, vel: 0.7 }); ev.push({ t: T(5, 0), layer: 'fx', kind: 'fx', inst: 'orch', midi: chordRoot(5) + 24, dur: 0.6, vel: 0.6 }); }
    if (X === 'riser') ev.push({ t: T(2, 0), layer: 'fx', kind: 'fx', inst: 'riser', dur: 16 * st, vel: 0.5 });
    if (X === 'scratch') { ev.push({ t: T(2, 12), layer: 'fx', kind: 'fx', inst: 'scratch', dur: 2 * st, vel: 0.7 }); ev.push({ t: T(2, 14), layer: 'fx', kind: 'fx', inst: 'scratch', dur: 2 * st, vel: 0.7 }); }
    if (X === 'feedback') ev.push({ t: T(2, 0), layer: 'fx', kind: 'fx', inst: 'feedback', midi: p.root + 43, dur: 16 * st, vel: 0.35 });
    if (X === 'crackle') ev.push({ t: 0, layer: 'fx', kind: 'fx', inst: 'crackle', dur: BARS * 16 * st, vel: 0.5 });

    const startT = from * 16 * st, endT = upto * 16 * st;
    const events = ev.filter(e => e.t >= startT - 1e-9 && e.t < endT - 1e-9).map(e => Object.assign({}, e, { t: e.t - startT, dur: e.dur === undefined ? undefined : Math.min(e.dur, endT - e.t) })).sort((a, b) => a.t - b.t);
    return { params: p, bpm: p.bpm, spb, barSec: 16 * st, length: endT - startT, fromBar: from, bars: upto - from, stages: STAGES.map(s => ({ key: s.key, label: s.label, t: Math.max(0, (s.bar - from) * 16 * st) })), events };
  }

  function linerNote(song) { const p = params(song); return { tag: C.STYLES[song.style].tag, bpm: p.bpm, key: p.keyName, lead: p.lead }; }

  const api = { arrange, params, linerNote, BARS, STAGES, SCALES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NTG_Arrange = api;
})(typeof window !== 'undefined' ? window : this);
