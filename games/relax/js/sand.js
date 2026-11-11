/* RELAX sand.
   A heightfield stands in for the bowl of fine sand. The steel ball is not
   glued to the magnet: wherever it actually travels it cuts a rounded groove
   and the displaced sand is pushed into a soft berm on either side. Heights
   then creep back toward flat, so older lines look settled. A rake pass
   (used between patterns) sweeps the field smooth. */
(function (root) {
  'use strict';

  function Sand(n) {
    this.rebuild(n);
  }

  Sand.prototype.rebuild = function (n) {
    this.n = n;
    this.h = new Float32Array(n * n);
    this.grain = new Uint8Array(n * n);
    this.canvas = document.createElement('canvas');
    this.canvas.width = n;
    this.canvas.height = n;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.img = this.ctx.createImageData(n, n);
    this.cx = (n - 1) / 2;
    this.radius = (n - 1) / 2;
    const mix = (x, y) => {
      let v = Math.imul(x ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2d);
      v = Math.imul(v ^ (v >>> 13), 0x165667b1);
      return (v ^ (v >>> 16)) & 255;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fine = mix(x, y);
        const blot = mix(x >> 2, y >> 2);
        this.grain[y * n + x] = (fine * 3 + blot) >> 2;
      }
    }
    this._groove = 0;
  };

  Sand.prototype._toGrid = function (wx, wy) {
    const s = this.radius;
    return [this.cx + wx * s, this.cx + wy * s];
  };

  Sand.prototype.sample = function (wx, wy) {
    const p = this._toGrid(wx, wy);
    const x = p[0], y = p[1];
    const n = this.n;
    if (x < 1 || y < 1 || x >= n - 2 || y >= n - 2) return 0;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const i = y0 * n + x0;
    const h00 = this.h[i], h10 = this.h[i + 1];
    const h01 = this.h[i + n], h11 = this.h[i + n + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  };

  Sand.prototype.gradient = function (wx, wy) {
    const e = 0.018;
    return {
      x: (this.sample(wx + e, wy) - this.sample(wx - e, wy)) / (2 * e),
      y: (this.sample(wx, wy + e) - this.sample(wx, wy - e)) / (2 * e)
    };
  };

  /* radius and depth are in world units. depth is how deep a fresh cut sits
     (positive). Returns how much sand was newly displaced, for sparkles. */
  Sand.prototype.carve = function (wx, wy, radiusWorld, depth) {
    const n = this.n;
    const g = this._toGrid(wx, wy);
    const gx = g[0], gy = g[1];
    const rp = Math.max(1.2, radiusWorld * this.radius);
    const berm = rp + 2.6;
    const x0 = Math.max(1, Math.floor(gx - berm - 1));
    const x1 = Math.min(n - 2, Math.ceil(gx + berm + 1));
    const y0 = Math.max(1, Math.floor(gy - berm - 1));
    const y1 = Math.min(n - 2, Math.ceil(gy + berm + 1));
    const removed = [];
    let sum = 0;
    let already = 0;
    const h = this.h;
    for (let y = y0; y <= y1; y++) {
      const dy = y - gy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        const d = Math.hypot(dx, dy);
        const bowl = Math.hypot(x - this.cx, y - this.cy);
        if (bowl > this.radius - 0.5) continue;
        const i = y * n + x;
        if (d <= rp) {
          const t = 1 - d / rp;
          const target = -depth * Math.pow(t, 1.35);
          if (h[i] > target) {
            const dig = h[i] - target;
            h[i] = target;
            sum += dig;
          } else if (h[i] < -depth * 0.45 && d < rp * 0.72) {
            already++;
          }
        } else if (d <= berm) {
          const t = 1 - (d - rp) / (berm - rp);
          removed.push(i, t * t);
        }
      }
    }
    if (sum > 0 && removed.length) {
      let wsum = 0;
      for (let k = 1; k < removed.length; k += 2) wsum += removed[k];
      const give = sum * 0.82;
      if (wsum > 0) {
        for (let k = 0; k < removed.length; k += 2) {
          const i = removed[k];
          h[i] = Math.min(0.95, h[i] + give * removed[k + 1] / wsum);
        }
      }
    }
    return { dug: sum, crossed: already > 6 && sum < depth * 0.35 };
  };

  Sand.prototype.carveSegment = function (x0, y0, x1, y1, radius, depth) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(0.004, radius * 0.45);
    const n = Math.max(1, Math.ceil(dist / step));
    let crossed = false;
    let dug = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const r = this.carve(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, depth);
      dug += r.dug;
      if (r.crossed) crossed = true;
    }
    return { dug: dug, crossed: crossed };
  };

  Sand.prototype.settle = function (dt) {
    const n = this.n;
    const h = this.h;
    /* A full diffusion is expensive and, at relaxation speed, unnecessary.
       Creep every height toward 0. Berms slump a little faster than trenches. */
    const base = Math.exp(-dt * 0.012);
    const berm = Math.exp(-dt * 0.045);
    for (let i = 0, N = h.length; i < N; i++) {
      const v = h[i];
      if (v === 0) continue;
      h[i] = v * (v > 0 ? berm : base);
    }
  };

  /* progress 0..1. A soft bar travels across the bowl and levels the sand
     behind it, like a hand rake between pictures. */
  Sand.prototype.rake = function (progress) {
    const n = this.n;
    const h = this.h;
    const sweep = progress * (n + 24) - 12;
    const cx = this.cx, rad = this.radius;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        if (Math.hypot(x - cx, y - cx) > rad) continue;
        const i = y * n + x;
        const behind = sweep - x;
        if (behind > 10) h[i] *= 0.55;
        else if (behind > -2) {
          const k = behind > 0 ? 0.35 : 0.12;
          h[i] *= (1 - k);
        }
      }
    }
  };

  Sand.prototype.finishRake = function () {
    this.h.fill(0);
  };

  Sand.prototype.coverage = function () {
    let n = 0;
    const h = this.h;
    for (let i = 0; i < h.length; i++) if (h[i] < -0.22) n++;
    return n;
  };

  Sand.prototype.groove = function () {
    let g = 0;
    const h = this.h;
    for (let i = 0, N = h.length; i < N; i++) if (h[i] < 0) g -= h[i];
    this._groove = g;
    return g;
  };

  Sand.prototype.shade = function (lightAngle, effects, level) {
    const n = this.n;
    const h = this.h;
    const grain = this.grain;
    const data = this.img.data;
    const cx = this.cx, rad = this.radius;
    const lx = Math.cos(lightAngle) * 0.85;
    const ly = Math.sin(lightAngle) * 0.55;
    const lz = 0.72;
    const iri = effects ? (0.10 + level * 0.08) : 0.025;
    for (let y = 0; y < n; y++) {
      const dy0 = y - cx;
      for (let x = 0; x < n; x++) {
        const o = (y * n + x) * 4;
        const bowl = Math.hypot(x - cx, dy0);
        if (bowl > rad - 0.6) {
          data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0;
          continue;
        }
        const i = y * n + x;
        const hv = h[i];
        const xm = x > 0 && x < n - 1;
        const ym = y > 0 && y < n - 1;
        const gx = xm ? h[i + 1] - h[i - 1] : 0;
        const gy = ym ? h[i + n] - h[i - n] : 0;
        const nz = 0.55;
        const len = Math.hypot(gx, gy, nz) || 1;
        const nx = -gx / len, ny = -gy / len, nnz = nz / len;
        let ndl = nx * lx + ny * ly + nnz * lz;
        const wrap = Math.max(0, (ndl + 0.55) / 1.55);
        const g = grain[i];
        /* Martian rust. Grain perturbs it; grooves sink into umber and
           berms catch a pale ochre highlight. */
        let r = 176 + (g - 128) * 0.18;
        let gc = 68 + (g - 128) * 0.09;
        let b = 36 + (g - 128) * 0.05;
        /* Grooves fall into deep umber; berms pick up a pale crest. */
        let shade = 0.62 + wrap * 0.48;
        if (hv < 0) shade += hv * 1.05;
        else shade += hv * 0.35;
        shade = Math.max(0.16, shade);
        const edge = bowl / rad;
        const bowlShade = 1 - Math.pow(Math.max(0, edge - 0.84) / 0.16, 2) * 0.22;
        r *= shade * bowlShade;
        gc *= shade * bowlShade;
        b *= shade * bowlShade;
        if (hv > 0) {
          r += hv * 70;
          gc += hv * 36;
          b += hv * 14;
        }
        if (iri) {
          const sheen = (nx * 0.6 + 0.4) * iri;
          r += sheen * 90;
          gc += (1 - sheen) * 40;
          b += Math.abs(ny) * 70 * (iri * 6);
        }
        /* A slow specular kiss on the crests. */
        const spec = Math.pow(Math.max(0, ndl), 18) * (effects ? 28 : 10);
        r += spec; gc += spec * 0.85; b += spec * 0.6;
        data[o] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[o + 1] = gc < 0 ? 0 : gc > 255 ? 255 : gc;
        data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        data[o + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  };

  root.RelaxSand = Sand;
})(window);
