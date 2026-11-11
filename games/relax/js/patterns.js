/* RELAX patterns.
   Each path is parameterized by u in [0, 1], the fraction of the drawing
   minute. The magnet walks the whole figure once: radii, phase, and petal
   size drift so the line keeps landing on fresh sand and the minute ends
   on a finished picture. Nothing is ping-ponged back over itself. */
(function (root) {
  'use strict';

  function clamp01(u) { return u < 0 ? 0 : u > 1 ? 1 : u; }
  function smooth(t) {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  }
  function rot(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  }
  function clip(p) {
    const d = Math.hypot(p.x, p.y);
    if (d > 0.76) { const k = 0.76 / d; p.x *= k; p.y *= k; }
    return p;
  }

  /* Out along an Archimedean spiral, then inward on the turns that fall
     between those grooves, because the angle keeps advancing. */
  function spiral(u) {
    const turns = 6.4;
    const th = clamp01(u) * turns * Math.PI * 2;
    const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
    const r = 0.06 + 0.68 * smooth(tri);
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  /* Almost-closed rings. Each turn holds a radius, then eases to the next
     (out, then back through the gaps) while the angle only increases. */
  function rings(u) {
    const stops = [0.16, 0.34, 0.52, 0.70, 0.60, 0.42, 0.24];
    const n = stops.length - 1;
    const uu = clamp01(u) * n;
    const i = Math.min(n - 1, Math.floor(uu));
    const f = uu - i;
    const hold = 0.8;
    const a0 = i * Math.PI * 2;
    let r, th;
    if (f < hold) {
      r = stops[i];
      th = a0 + (f / hold) * Math.PI * 2 * 0.9;
    } else {
      const e = smooth((f - hold) / (1 - hold));
      r = stops[i] + (stops[i + 1] - stops[i]) * e;
      th = a0 + Math.PI * 2 * 0.9 + e * Math.PI * 2 * 0.1;
    }
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  /* Rhodonea whose amplitude grows and whose whole figure slowly precesses,
     so the next set of petals sits in the gaps of the first. */
  function rose(k, laps) {
    return function (u) {
      const uu = clamp01(u);
      const th = uu * laps * Math.PI;
      const a = 0.15 + 0.58 * smooth(Math.min(1, uu / 0.7));
      const pre = uu * 1.65;
      const r = a * Math.cos(k * th);
      return clip(rot(r * Math.cos(th), r * Math.sin(th), pre));
    };
  }

  /* Hypotrochoid. The rolling ratio and the pen distance drift, and the
     whole flower slowly turns, so successive loops enlarge instead of closing. */
  function hypotrochoid(u) {
    const uu = clamp01(u);
    const th = uu * Math.PI * 2 * 4.8;
    const R = 0.42;
    const rr = 0.118 + 0.028 * uu;
    const d = 0.07 + 0.20 * smooth(Math.min(1, uu / 0.78));
    const k = (R - rr) / rr;
    const x = ((R - rr) * Math.cos(th) + d * Math.cos(k * th)) * 1.28;
    const y = ((R - rr) * Math.sin(th) - d * Math.sin(k * th)) * 1.28;
    return clip(rot(x, y, uu * 0.7));
  }

  function epitrochoid(u) {
    const uu = clamp01(u);
    const th = uu * Math.PI * 2 * 2.6;
    const R = 0.26;
    const rr = 0.09 + 0.025 * uu;
    const d = 0.06 + 0.16 * smooth(Math.min(1, uu / 0.8));
    const k = (R + rr) / rr;
    const x = ((R + rr) * Math.cos(th) - d * Math.cos(k * th)) * 1.2;
    const y = ((R + rr) * Math.sin(th) - d * Math.sin(k * th)) * 1.2;
    return clip(rot(x, y, -uu * 0.55));
  }

  /* Two drifting incommensurate frequencies, so the bow never closes. */
  function lissajous(u) {
    const uu = clamp01(u);
    const p = uu * 13.5;
    const ax = 1.7 + 0.45 * uu;
    const ay = 2.35 + 0.38 * uu;
    const ph = 0.35 + uu * 1.7;
    return clip({
      x: 0.40 * Math.sin(ax * p) + 0.28 * Math.sin((ax + 0.65) * p + ph),
      y: 0.38 * Math.sin(ay * p + ph * 0.6) + 0.26 * Math.sin((ay - 0.55) * p + 0.4)
    });
  }

  /* Ten rays. Each goes out, steps sideways at the rim, and returns on a
     new angle, so the inbound line is not the outbound one. */
  function sunburst(u) {
    const rays = 10;
    const uu = clamp01(u) * rays;
    const i = Math.min(rays - 1, Math.floor(uu));
    const f = uu - i;
    const base = -Math.PI / 2 + i * (Math.PI * 2 / rays) + u * 0.22;
    const spread = 0.11;
    let ang, r;
    if (f < 0.44) {
      ang = base;
      r = 0.70 * smooth(f / 0.44);
    } else if (f < 0.56) {
      const e = smooth((f - 0.44) / 0.12);
      ang = base + spread * e;
      r = 0.70;
    } else {
      ang = base + spread;
      r = 0.70 * (1 - smooth((f - 0.56) / 0.44));
    }
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }

  /* A wavy spiral that only winds outward, pitch wider than the wave. */
  function waves(u) {
    const uu = clamp01(u);
    const turns = 4.6;
    const th = uu * turns * Math.PI * 2;
    const r = 0.12 + 0.60 * uu + 0.032 * Math.sin(5 * th);
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  /* Lemniscate that grows and whose axis turns while it is drawn. */
  function eight(u) {
    const uu = clamp01(u);
    const s = uu * Math.PI * 2 * 4.2;
    const grow = 0.30 + 0.44 * uu;
    const x = grow * Math.cos(s);
    const y = grow * Math.sin(s) * Math.cos(s) * 1.15;
    return clip(rot(x, y, uu * 1.25));
  }

  /* Cardioid swept more than once while it grows and rotates. */
  function cardioid(u) {
    const uu = clamp01(u);
    const th = uu * Math.PI * 2 * 5.2;
    const a = 0.08 + 0.26 * smooth(Math.min(1, uu / 0.72));
    const r = a * (1 - Math.cos(th));
    return clip(rot(r * Math.cos(th), r * Math.sin(th), uu * 1.05));
  }

  /* Guilloché: the secondary frequencies drift across the minute, so the
     engraving keeps filling new ground. */
  function guilloche(u) {
    const uu = clamp01(u);
    const p = uu * 15.5;
    const x = 0.36 * Math.sin(p) + 0.22 * Math.sin((2.05 + 0.35 * uu) * p + 0.5) + 0.10 * Math.sin((3.3 + uu) * p);
    const y = 0.34 * Math.sin((1.35 + 0.25 * uu) * p + 0.8) + 0.24 * Math.sin((2.4 + 0.4 * uu) * p) + 0.08 * Math.cos((3.7 + 0.5 * uu) * p);
    return clip({ x: x, y: y });
  }

  /* One Fermat spiral, center to rim. No return trip. */
  function fermat(u) {
    const th = clamp01(u) * 28;
    const r = Math.min(0.74, 0.140 * Math.sqrt(th));
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  function hilbertPoints(order) {
    const n = 1 << order;
    const pts = new Float32Array(n * n * 2);
    let o = 0;
    for (let d = 0, N = n * n; d < N; d++) {
      let x = 0, y = 0, tv = d;
      for (let s = 1; s < n; s <<= 1) {
        const rx = 1 & (tv >> 1);
        const ry = 1 & (tv ^ rx);
        if (ry === 0) {
          if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
          const tmp = x; x = y; y = tmp;
        }
        x += s * rx;
        y += s * ry;
        tv >>= 2;
      }
      pts[o++] = x;
      pts[o++] = y;
    }
    return pts;
  }

  const H4 = hilbertPoints(4);
  /* Order-4 Hilbert, start to end, once. Scaled to sit inside the bowl
     so the corners are not flattened onto the rim. */
  function hilbert(u) {
    const n = 16;
    const count = n * n - 1;
    const f = clamp01(u) * count;
    const i = Math.min(count - 1, Math.floor(f));
    const frac = f - i;
    const i2 = i + 1;
    const x = H4[i * 2] + (H4[i2 * 2] - H4[i * 2]) * frac;
    const y = H4[i * 2 + 1] + (H4[i2 * 2 + 1] - H4[i * 2 + 1]) * frac;
    const s = 1.08 / (n - 1);
    return { x: (x - (n - 1) / 2) * s, y: (y - (n - 1) / 2) * s };
  }

  root.RelaxPatterns = [
    { id: 'spiral', name: 'Spiral', pos: spiral },
    { id: 'rings', name: 'Rings', pos: rings },
    { id: 'rose3', name: 'Three-petal rose', pos: rose(3, 3.6) },
    { id: 'rose4', name: 'Eight-petal rose', pos: rose(4, 3.15) },
    { id: 'rose5', name: 'Five-petal rose', pos: rose(5, 2.7) },
    { id: 'spiro', name: 'Spirograph', pos: hypotrochoid },
    { id: 'epi', name: 'Orbit flower', pos: epitrochoid },
    { id: 'liss', name: 'Lissajous', pos: lissajous },
    { id: 'sun', name: 'Sunburst', pos: sunburst },
    { id: 'wave', name: 'Wavy ring', pos: waves },
    { id: 'eight', name: 'Figure eight', pos: eight },
    { id: 'heart', name: 'Cardioid', pos: cardioid },
    { id: 'guilloche', name: 'Guilloché', pos: guilloche },
    { id: 'fermat', name: 'Fermat spiral', pos: fermat },
    { id: 'hilbert', name: 'Hilbert curve', pos: hilbert }
  ];
})(window);
