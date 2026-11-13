/* The cosmos Cletus floats in.
   Paintings breathe and crossfade. They do not cut.
   Placy hovers at the edge of every scene, and her cord sways.
   The doctor stays in the wings. The globe floats in when asked.
   The rose curtains part when birth is a stage entrance. */
(function (root) {
  'use strict';

  const MOOD = {
    calm: 0.85,
    squeeze: 1.7,
    ride: 1.2,
    birth: 1.05,
    tender: 0.62,
    cosmos: 0.7,
    farewell: 0.52
  };

  function Stage(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.images = {};
    this.t = 0;
    this.artKey = 'cover';
    this.prevKey = null;
    this.fade = 1;
    this.fadeDur = 4.8;
    this.sceneAge = 0;
    this.curtain = 1;
    this.curtainTarget = 1;
    this.globe = 0;
    this.globeTarget = 0;
    this.doctor = 0;
    this.doctorTarget = 0;
    this.mood = 'calm';
    this.reduced = false;
    try { this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    this.dust = [];
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    for (let i = 0; i < 70; i++) {
      this.dust.push({
        u: Math.random(),
        v: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        s: 0.004 + Math.random() * 0.012,
        a: 0.08 + Math.random() * 0.22,
        hue: Math.random()
      });
    }
  }

  Stage.prototype.load = function (keys) {
    const self = this;
    let left = keys.length;
    return new Promise(function (resolve) {
      if (!left) resolve();
      keys.forEach(function (key) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = img.onerror = function () {
          self.images[key] = img;
          if (--left === 0) resolve();
        };
        img.src = key === 'cover' ? 'art/cover.jpg' : key === 'nebula' ? 'art/nebula.jpg' : ('art/' + key + '.png');
      });
    });
  };

  Stage.prototype.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
  };

  Stage.prototype.set = function (opts) {
    if (!opts) return;
    if (opts.art && opts.art !== this.artKey) {
      this.prevKey = this.artKey;
      this.artKey = opts.art;
      this.fade = 0;
      this.sceneAge = 0;
    }
    if (typeof opts.curtain === 'number') {
      if (opts.curtain < this.curtainTarget - 0.35) this.curtain = opts.curtain;
      this.curtainTarget = opts.curtain;
    }
    if (typeof opts.globe === 'number') this.globeTarget = opts.globe;
    if (typeof opts.doctor === 'number') this.doctorTarget = opts.doctor;
    if (opts.mood) this.mood = opts.mood;
    if (opts.fast) this.fadeDur = 0.45;
  };

  function lerp(a, b, u) { return a + (b - a) * u; }

  Stage.prototype.tick = function (dt) {
    this.t += dt;
    this.sceneAge += dt;
    const fadeStep = dt / this.fadeDur;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + fadeStep);
    this.curtain = lerp(this.curtain, this.curtainTarget, this.reduced ? 1 : (1 - Math.exp(-dt * 1.8)));
    this.globe = lerp(this.globe, this.globeTarget, this.reduced ? 1 : (1 - Math.exp(-dt * 0.55)));
    this.doctor = lerp(this.doctor, this.doctorTarget, this.reduced ? 1 : (1 - Math.exp(-dt * 0.9)));
    if (!this.reduced) {
      for (let i = 0; i < this.dust.length; i++) {
        const p = this.dust[i];
        p.v -= p.s * dt;
        p.u += Math.sin(this.t * 0.2 + i) * 0.002 * dt;
        if (p.v < -0.02) { p.v = 1.02; p.u = Math.random(); }
      }
    }
  };

  Stage.prototype._img = function (key) {
    const img = this.images[key];
    if (!img || !img.complete || !img.naturalWidth) return null;
    return img;
  };

  Stage.prototype.draw = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#140e22';
    ctx.fillRect(0, 0, w, h);
    const neb = this._img('nebula');
    if (neb) {
      this._nebula(neb, 1.22, 0, 1);
      this._nebula(neb, 1.48, 1.7, 0.38);
    }
    const rate = MOOD[this.mood] || 0.8;
    const breathe = 1 + Math.sin(this.t * rate) * (this.reduced ? 0.004 : 0.016);
    const ken = 1 + Math.min(0.06, this.sceneAge * 0.004);
    const drift = this.reduced ? 0 : 1;
    if (this.prevKey && this.fade < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - this.fade;
      this._painting(this.prevKey, breathe, ken * 0.99, drift, 1);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = this.prevKey ? this.fade : 1;
    this._painting(this.artKey, breathe, ken, drift, this.artKey === 'stage' ? this.curtain : 1);
    ctx.restore();
    this._globe(breathe);
    this._doctor(breathe);
    this._placy(breathe);
    this._dust();
    this._vignette();
  };

  Stage.prototype._nebula = function (img, zoom, phase, alpha) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const ox = this.reduced ? 0 : Math.sin(this.t * 0.018 + phase) * w * 0.045;
    const oy = this.reduced ? 0 : Math.cos(this.t * 0.013 + phase) * h * 0.03;
    const dw = w * zoom;
    const dh = h * zoom;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (w - dw) / 2 + ox, (h - dh) / 2 + oy, dw, dh);
    ctx.restore();
  };

  Stage.prototype._painting = function (key, breathe, ken, drift, curtain) {
    const img = this._img(key);
    if (!img) return;
    const w = this.w;
    const h = this.h;
    const maxH = h * 0.8;
    const maxW = w * 0.78;
    const sc = Math.min(maxW / img.width, maxH / img.height) * breathe * ken;
    const dw = img.width * sc;
    const dh = img.height * sc;
    const bob = drift * Math.sin(this.t * 0.55 + (key.length)) * h * 0.012;
    const sway = drift * Math.cos(this.t * 0.33) * w * 0.01;
    const x = (w - dw) / 2 + sway;
    const y = (h - dh) / 2 + bob - h * 0.02;
    if (key === 'stage' && curtain < 0.98) this._curtains(img, x, y, dw, dh, curtain);
    else {
      this.ctx.drawImage(img, x, y, dw, dh);
    }
  };

  Stage.prototype._curtains = function (img, x, y, w, h, open) {
    const ctx = this.ctx;
    const openAmt = Math.max(0, Math.min(1, open));
    const overlap = 1 - openAmt;
    const panel = w * (0.52 + overlap * 0.16);
    ctx.drawImage(img, 0, 0, img.width * 0.5, img.height, x, y, panel, h);
    ctx.drawImage(img, img.width * 0.5, 0, img.width * 0.5, img.height, x + w - panel, y, panel, h);
    if (openAmt > 0.08) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, (openAmt - 0.08) * 1.5);
      const cw = w * (0.16 + openAmt * 0.42);
      const ch = h * (0.42 + openAmt * 0.28);
      ctx.drawImage(
        img,
        img.width * 0.3, img.height * 0.22, img.width * 0.4, img.height * 0.58,
        x + (w - cw) / 2, y + h * 0.2, cw, ch
      );
      ctx.restore();
    }
    if (openAmt > 0.72) {
      ctx.save();
      ctx.globalAlpha *= (openAmt - 0.72) / 0.28;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    }
  };

  Stage.prototype._globe = function (breathe) {
    if (this.globe < 0.02) return;
    const img = this._img('globe');
    if (!img) return;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const amt = this.globe;
    const size = h * (0.1 + amt * 0.26) * breathe;
    const x = w * (0.78 - amt * 0.28) + Math.sin(this.t * 0.6) * 10;
    const y = h * (0.58 - amt * 0.36) + Math.cos(this.t * 0.8) * 8;
    ctx.save();
    ctx.globalAlpha = Math.min(1, amt * 1.25);
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  };

  Stage.prototype._doctor = function (breathe) {
    if (this.doctor < 0.03) return;
    if (this.artKey === 'doctor' && this.fade > 0.8) return;
    const img = this._img('doctor');
    if (!img) return;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const dh = h * 0.46 * breathe;
    const dw = dh * (img.width / img.height);
    const x = w - dw * 0.78 + Math.sin(this.t * 0.35) * 5;
    const y = h * 0.36 + Math.cos(this.t * 0.45) * 4;
    ctx.save();
    ctx.globalAlpha = Math.min(0.94, this.doctor);
    ctx.drawImage(img, x, y, dw, dh);
    ctx.restore();
  };

  Stage.prototype._placy = function (breathe) {
    const img = this._img('placy');
    if (!img) return;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const amp = (this.mood === 'squeeze' || this.mood === 'ride') ? 1.45 : 1;
    const ph = h * 0.2 * breathe;
    const pw = ph * (img.width / img.height);
    const x = w * 0.05 + Math.sin(this.t * 0.41) * w * 0.012;
    const y = h * 0.1 + Math.cos(this.t * 0.53) * h * 0.016;
    const anchorX = x + pw * 0.62;
    const anchorY = y + ph * 0.22;
    this._cord(anchorX, anchorY + ph * 0.55, amp);
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.drawImage(img, x, y, pw, ph);
    ctx.restore();
  };

  Stage.prototype._cord = function (x, y, amp) {
    const ctx = this.ctx;
    const h = this.h;
    const len = h * 0.26;
    const wob = (this.reduced ? 4 : 14) * amp;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      const c1 = x + Math.sin(this.t * 1.15 + s) * wob;
      const c2 = x + Math.sin(this.t * 0.82 + 1.2 + s) * wob * 1.25;
      const ex = x + Math.sin(this.t * 0.64 + s * 0.4) * wob * 0.55;
      ctx.bezierCurveTo(c1, y + len * 0.35, c2, y + len * 0.68, ex, y + len);
      const rose = 168 + s * 12;
      ctx.strokeStyle = 'rgba(' + (232 - s * 8) + ',' + rose + ',' + (158 + s * 6) + ',' + (0.42 - s * 0.07) + ')';
      ctx.lineWidth = 4.2 - s * 0.7;
      ctx.stroke();
    }
    ctx.restore();
  };

  Stage.prototype._dust = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < this.dust.length; i++) {
      const p = this.dust[i];
      const x = p.u * w;
      const y = p.v * h;
      ctx.beginPath();
      ctx.fillStyle = p.hue > 0.75
        ? 'rgba(255, 214, 226,' + p.a + ')'
        : 'rgba(255, 246, 236,' + p.a + ')';
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Stage.prototype._vignette = function () {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,4,18,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  root.PlacentaStage = Stage;
})(window);
