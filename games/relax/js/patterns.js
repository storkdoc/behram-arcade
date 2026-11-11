/* RELAX patterns.
   Each one is the path of the hidden magnet under the bowl, in world units
   (bowl radius 1, magnet kept near 0.78 so the ball has room to lag).
   Curves are continuous: spirals breathe in and out, rings glide from one
   radius to the next, and the Hilbert path ping-pongs so it never jumps. */
(function (root) {
  'use strict';

  function clip(p) {
    const d = Math.hypot(p.x, p.y);
    if (d > 0.78) { const k = 0.78 / d; p.x *= k; p.y *= k; }
    return p;
  }

  function spiral(t) {
    const period = 18;
    const u = (t % (period * 2)) / period;
    const tri = u < 1 ? u : 2 - u;
    const th = t * 1.25;
    const r = 0.05 + tri * 0.73;
    return clip({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }

  function rings(t) {
    const radii = [0.16, 0.32, 0.48, 0.64, 0.76];
    const hold = 4.6, glide = 1.15, cyc = hold + glide;
    const k = Math.floor(t / cyc);
    const u = t - k * cyc;
    const r0 = radii[k % radii.length];
    const r1 = radii[(k + 1) % radii.length];
    let r = r0;
    if (u > hold) {
      const s = (u - hold) / glide;
      const e = s * s * (3 - 2 * s);
      r = r0 + (r1 - r0) * e;
    }
    const th = t * 0.95;
    return clip({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }

  function rose(k, speed) {
    return function (t) {
      const th = t * speed;
      const r = 0.76 * Math.cos(k * th);
      return clip({ x: Math.cos(th) * r, y: Math.sin(th) * r });
    };
  }

  function hypotrochoid(t) {
    const R = 0.52, r = 0.16, d = 0.28;
    const th = t * 0.52;
    const k = (R - r) / r;
    return clip({
      x: ((R - r) * Math.cos(th) + d * Math.cos(k * th)) * 1.12,
      y: ((R - r) * Math.sin(th) - d * Math.sin(k * th)) * 1.12
    });
  }

  function epitrochoid(t) {
    const R = 0.28, r = 0.11, d = 0.20;
    const th = t * 0.55;
    const k = (R + r) / r;
    return clip({
      x: ((R + r) * Math.cos(th) - d * Math.cos(k * th)) * 1.22,
      y: ((R + r) * Math.sin(th) - d * Math.sin(k * th)) * 1.22
    });
  }

  function lissajous(t) {
    const w = 0.46;
    return clip({
      x: 0.72 * Math.sin(2 * w * t + 0.45),
      y: 0.68 * Math.sin(3 * w * t)
    });
  }

  function sunburst(t) {
    const n = 18, per = 2.15;
    const i = Math.floor(t / per);
    const u = (t / per) - i;
    const ang = (i % n) * (Math.PI * 2 / n);
    const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
    const e = tri * tri * (3 - 2 * tri);
    const r = 0.07 + 0.71 * e;
    return clip({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
  }

  function waves(t) {
    const th = t * 0.52;
    const r = 0.46 + 0.28 * Math.sin(7 * th);
    return clip({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }

  function eight(t) {
    const s = t * 0.62;
    return clip({ x: 0.74 * Math.cos(s), y: 0.74 * Math.sin(s) * Math.cos(s) });
  }

  function cardioid(t) {
    const th = t * 0.58;
    const r = 0.36 * (1 - Math.cos(th));
    return clip({ x: r * Math.cos(th) - 0.18, y: r * Math.sin(th) });
  }

  function guilloche(t) {
    return clip({
      x: 0.42 * Math.sin(t * 0.71) + 0.30 * Math.sin(t * 1.19 + 0.5),
      y: 0.40 * Math.sin(t * 0.93 + 1.2) + 0.28 * Math.sin(t * 1.51 + 0.3)
    });
  }

  function fermat(t) {
    const period = 24;
    const u = (t % (period * 2)) / period;
    const tri = u < 1 ? u : 2 - u;
    const th = tri * 26;
    const r = Math.min(0.78, 0.145 * Math.sqrt(Math.max(0, th)));
    return clip({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }

  function hilbertPoints(order) {
    const n = 1 << order;
    const pts = new Float32Array(n * n * 2);
    let o = 0;
    const N = n * n;
    for (let d = 0; d < N; d++) {
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
  function hilbert(t) {
    const n = 16;
    const count = n * n - 1;
    const speed = 11;
    const oneWay = count / speed;
    const u0 = (t % (oneWay * 2)) / oneWay;
    const u = u0 < 1 ? u0 : 2 - u0;
    const f = u * count;
    const i = Math.floor(f);
    const frac = f - i;
    const i2 = Math.min(count, i + 1);
    const ax = H4[i * 2], ay = H4[i * 2 + 1];
    const bx = H4[i2 * 2], by = H4[i2 * 2 + 1];
    const x = ax + (bx - ax) * frac;
    const y = ay + (by - ay) * frac;
    const s = 1.36 / (n - 1);
    return clip({ x: (x - (n - 1) / 2) * s, y: (y - (n - 1) / 2) * s });
  }

  root.RelaxPatterns = [
    { id: 'spiral', name: 'Spiral', pos: spiral },
    { id: 'rings', name: 'Rings', pos: rings },
    { id: 'rose3', name: 'Three-petal rose', pos: rose(3, 0.40) },
    { id: 'rose4', name: 'Eight-petal rose', pos: rose(4, 0.36) },
    { id: 'rose5', name: 'Five-petal rose', pos: rose(5, 0.34) },
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
