/* RELAX patterns.
   u in [0, 1] is the fraction of one 2.5-minute drawing. Each path is the
   kind of polar track a desktop magnetic sand table plays: an Archimedean
   spiral, concentric rings, a rosette, a hypotrochoid mandala, spokes, a
   star, nested squares and diamonds, a triangle spiral, a hex lattice, wave
   rings, a snowflake, a radial zigzag, and a Fermat spiral. The angle only
   advances and each new ring sits at a fresh radius, so the line does not
   retrace. The picture is finished when u reaches 1. */
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

  /* Archimedean spiral out, then back on the grooves that fall between. */
  function spiral(u) {
    const turns = 5.2;
    const th = clamp01(u) * turns * Math.PI * 2;
    const tri = u < 0.5 ? u * 2 : (1 - u) * 2;
    const r = 0.06 + 0.68 * smooth(tri);
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  /* Concentric rings: hold a radius for most of a turn, then ease to the
     next (out, then inward through the gaps). */
  function rings(u) {
    const stops = [0.18, 0.40, 0.62, 0.74, 0.46];
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

  /* Polar rose. Amplitude grows and the figure precesses, so later petals
     fall in the gaps. */
  function rose(k, laps) {
    return function (u) {
      const uu = clamp01(u);
      const th = uu * laps * Math.PI;
      const a = 0.16 + 0.56 * smooth(Math.min(1, uu / 0.72));
      const pre = uu * 1.35;
      const r = a * Math.cos(k * th);
      return clip(rot(r * Math.cos(th), r * Math.sin(th), pre));
    };
  }

  /* Hypotrochoid mandala. Pen distance and the roll ratio drift, and the
     whole figure slowly turns. */
  function hypotrochoid(u) {
    const uu = clamp01(u);
    const th = uu * Math.PI * 2 * 3.6;
    const R = 0.42;
    const rr = 0.12 + 0.03 * uu;
    const d = 0.08 + 0.18 * smooth(Math.min(1, uu / 0.8));
    const k = (R - rr) / rr;
    const x = ((R - rr) * Math.cos(th) + d * Math.cos(k * th)) * 1.2;
    const y = ((R - rr) * Math.sin(th) - d * Math.sin(k * th)) * 1.2;
    return clip(rot(x, y, uu * 0.65));
  }

  function polyPoint(sides, size, t, rotation) {
    const seg = clamp01(t) * sides;
    const i = Math.min(sides - 1, Math.floor(seg));
    const f = seg - i;
    const a0 = rotation + (i / sides) * Math.PI * 2 - Math.PI / 2;
    const a1 = rotation + ((i + 1) / sides) * Math.PI * 2 - Math.PI / 2;
    const x0 = Math.cos(a0) * size, y0 = Math.sin(a0) * size;
    const x1 = Math.cos(a1) * size, y1 = Math.sin(a1) * size;
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }

  /* Nested regular polygons. Each ring is a new size; the step between
     rings is a short radial move at one vertex, not a second pass. */
  function nested(sides, sizes, rotation) {
    return function (u) {
      const n = sizes.length;
      const uu = clamp01(u) * n;
      const i = Math.min(n - 1, Math.floor(uu));
      const f = uu - i;
      const hold = 0.84;
      let size, t;
      if (f < hold || i === n - 1) {
        const span = i === n - 1 ? 1 : hold;
        t = Math.min(1, f / span);
        size = sizes[i];
      } else {
        const e = smooth((f - hold) / (1 - hold));
        t = 1;
        size = sizes[i] + (sizes[i + 1] - sizes[i]) * e;
      }
      return polyPoint(sides, size, t, rotation || 0);
    };
  }

  /* Five-point star, then a larger one turned by a tenth of a turn so the
     new edges sit between the first. */
  function star(u) {
    const uu = clamp01(u);
    const n = 5, k = 2;
    function at(t, size, rot) {
      const seg = clamp01(t) * n;
      const i = Math.min(n - 1, Math.floor(seg));
      const f = seg - i;
      const ia = (i * k) % n;
      const ib = ((i + 1) * k) % n;
      const a0 = rot + (ia / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = rot + (ib / n) * Math.PI * 2 - Math.PI / 2;
      const x0 = Math.cos(a0) * size, y0 = Math.sin(a0) * size;
      const x1 = Math.cos(a1) * size, y1 = Math.sin(a1) * size;
      return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
    }
    if (uu < 0.46) return at(uu / 0.46, 0.34 + 0.08 * (uu / 0.46), 0);
    if (uu < 0.54) {
      const e = smooth((uu - 0.46) / 0.08);
      const size = 0.42 + (0.62 - 0.42) * e;
      const rot = (Math.PI / 5) * e;
      return at(1, size, rot);
    }
    return at((uu - 0.54) / 0.46, 0.62 + 0.08 * ((uu - 0.54) / 0.46), Math.PI / 5);
  }

  /* Radial spokes. Out along one angle, a short step at the rim, back on
     a new angle, so the return is not the same line. */
  function spokes(u) {
    const rays = 9;
    const uu = clamp01(u) * rays;
    const i = Math.min(rays - 1, Math.floor(uu));
    const f = uu - i;
    const base = -Math.PI / 2 + i * (Math.PI * 2 / rays) + u * 0.18;
    const spread = 0.1;
    let ang, r;
    if (f < 0.44) {
      ang = base;
      r = 0.72 * smooth(f / 0.44);
    } else if (f < 0.56) {
      ang = base + spread * smooth((f - 0.44) / 0.12);
      r = 0.72;
    } else {
      ang = base + spread;
      r = 0.72 * (1 - smooth((f - 0.56) / 0.44));
    }
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }

  /* Wavy spiral, outward only. The pitch is wider than the wave. */
  function waves(u) {
    const uu = clamp01(u);
    const turns = 4.2;
    const th = uu * turns * Math.PI * 2;
    const r = 0.12 + 0.60 * uu + 0.03 * Math.sin(5 * th);
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  /* Radial zigzag. The wobble is smaller than the forward sweep, so the
     angle never runs backwards over a line it already drew. */
  function zigzag(u) {
    const uu = clamp01(u);
    const th = uu * 4.4 * Math.PI * 2;
    const wobble = Math.asin(Math.sin(th * 4)) * 0.1;
    const r = 0.08 + 0.64 * uu;
    const ang = th + wobble;
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
  }

  /* One Fermat spiral, center to rim. */
  function fermat(u) {
    const th = clamp01(u) * 24;
    const r = Math.min(0.74, 0.151 * Math.sqrt(th));
    return { x: Math.cos(th) * r, y: Math.sin(th) * r };
  }

  root.RelaxPatterns = [
    { id: 'spiral', name: 'Spiral', pos: spiral },
    { id: 'fermat', name: 'Fermat spiral', pos: fermat },
    { id: 'rings', name: 'Rings', pos: rings },
    { id: 'rose3', name: 'Rosette', pos: rose(3, 3.2) },
    { id: 'daisy', name: 'Daisy', pos: rose(5, 2.0) },
    { id: 'snow', name: 'Snowflake', pos: rose(6, 1.7) },
    { id: 'spiro', name: 'Spirograph', pos: hypotrochoid },
    { id: 'spokes', name: 'Spokes', pos: spokes },
    { id: 'star', name: 'Star', pos: star },
    { id: 'squares', name: 'Squares', pos: nested(4, [0.20, 0.36, 0.52, 0.68], 0) },
    { id: 'diamonds', name: 'Diamonds', pos: nested(4, [0.22, 0.38, 0.54, 0.70], Math.PI / 4) },
    { id: 'triangles', name: 'Triangles', pos: nested(3, [0.24, 0.40, 0.56, 0.72], 0.2) },
    { id: 'hex', name: 'Hex lattice', pos: nested(6, [0.22, 0.38, 0.54, 0.70], 0) },
    { id: 'wave', name: 'Wave rings', pos: waves },
    { id: 'zigzag', name: 'Zigzag', pos: zigzag }
  ];
})(window);
