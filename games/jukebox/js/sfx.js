/* JUKEBOX cabinet clicks only. Previews play through audio.js. */
(function (root) {
  'use strict';
  function Sfx() { this.ctx = null; this.muted = false; }
  Sfx.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
  };
  Sfx.prototype.setMuted = function (m) { this.muted = !!m; };
  Sfx.prototype.click = function () {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(740, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.08);
  };
  root.JukeSfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
