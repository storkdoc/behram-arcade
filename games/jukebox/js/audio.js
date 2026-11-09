/* JUKEBOX audio. Streams a preview URL with an HTML audio element and reads it
   through AnalyserNode. The element uses crossOrigin anonymous so frequency
   data is the real preview, not a silent stand-in. Nothing is saved. */
(function (root) {
  'use strict';
  function Engine() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'none';
    this.audio.setAttribute('playsinline', '');
    this.ctx = null;
    this.analyser = null;
    this.gain = null;
    this.freq = null;
    this.wave = null;
    this.volume = 0.85;
    this.muted = false;
    this._src = null;
  }
  Engine.prototype.unlock = function () {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('no audio'));
    if (!this.ctx) {
      const ctx = this.ctx = new AC();
      const analyser = this.analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      this.freq = new Uint8Array(analyser.frequencyBinCount);
      this.wave = new Uint8Array(analyser.fftSize);
      this.gain = ctx.createGain();
      this.gain.gain.value = this.muted ? 0 : this.volume;
      const src = ctx.createMediaElementSource(this.audio);
      src.connect(analyser);
      analyser.connect(this.gain);
      this.gain.connect(ctx.destination);
      this._src = src;
    }
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  };
  Engine.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain && !this.muted) this.gain.gain.value = this.volume;
  };
  Engine.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume;
  };
  Engine.prototype.playUrl = function (url) {
    /* play() runs on this turn so the tap still counts on iPhone Safari. */
    const unlockP = this.unlock();
    if (this._url !== url) {
      this._url = url;
      this.audio.src = url;
    }
    const playP = this.audio.play();
    return Promise.resolve(unlockP).then(function () { return playP; });
  };
  Engine.prototype.pause = function () {
    try { this.audio.pause(); } catch (e) { /* ignore */ }
  };
  Engine.prototype.resume = function () {
    const unlockP = this.unlock();
    const playP = this.audio.play();
    return Promise.resolve(unlockP).then(function () { return playP; });
  };
  Engine.prototype.stop = function () {
    try { this.audio.pause(); selfSeek(this.audio); } catch (e) { /* ignore */ }
  };
  function selfSeek(audio) { try { audio.currentTime = 0; } catch (e) { /* ignore */ } }
  Engine.prototype.sample = function () {
    if (!this.analyser) return { freq: null, wave: null, sum: 0 };
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.freq.length; i++) sum += this.freq[i];
    return { freq: this.freq, wave: this.wave, sum: sum };
  };
  Engine.prototype.playing = function () {
    return !!this.audio && !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0;
  };
  const api = { Engine: Engine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
