/* NAME THAT GROOVE: YouTube music source.
   Uses ONLY YouTube's official IFrame Player API (https://www.youtube.com/iframe_api) with a visible,
   full-size embedded player. Nothing is downloaded, recorded or re-hosted, and nothing about YouTube's
   own playback (including any ads YouTube chooses to show) is blocked, skipped or modified.
   Clips start at the player's own startSeconds and the game calls pauseVideo() when the clip time is up.
   ?yt=mock swaps in a fake player for automated tests only (no network); never used otherwise. */
(function (root) {
  'use strict';
  const API = 'https://www.youtube.com/iframe_api';
  const ERRORS = { 2: 'bad video id', 5: 'HTML5 player error', 100: 'video removed or private', 101: 'embedding not allowed', 150: 'embedding not allowed' };

  function Real(hostId, cb) {
    this.hostId = hostId; this.cb = cb || {}; this.status = 'idle'; this.player = null; this.want = null; this.muted = false; this.vol = 80; this.cc = true;
  }
  Real.prototype.load = function (timeoutMs) {
    if (this.status === 'ready' || this.status === 'loading') return;
    this.status = 'loading';
    const self = this, done = ok => { if (self.status !== 'loading') return; clearTimeout(self._to); self.status = ok ? 'ready' : 'failed'; if (!ok && self.cb.onFail) self.cb.onFail('api'); };
    this._to = setTimeout(() => done(false), timeoutMs || 12000);
    const make = () => {
      try {
        self.player = new root.YT.Player(self.hostId, {
          width: '100%', height: '100%', host: 'https://www.youtube.com',
          playerVars: { controls: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, cc_load_policy: 0, origin: location.origin },
          events: {
            onReady() { done(true); if (self.muted) self.player.mute(); self.player.setVolume(self.vol); if (self.want) self._start(); if (self.cb.onReady) self.cb.onReady(); },
            onStateChange(e) { if (e.data === 1 && !self.cc) self._cc(); if (self.cb.onState) self.cb.onState(e.data); },
            onError(e) { if (self.cb.onError) self.cb.onError(e.data, ERRORS[e.data] || 'player error'); }
          }
        });
      } catch (err) { done(false); }
    };
    if (root.YT && root.YT.Player) return make();
    const prev = root.onYouTubeIframeAPIReady;
    root.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) { } make(); };
    const s = document.createElement('script'); s.src = API; s.async = true; s.onerror = () => done(false);
    document.head.appendChild(s);
  };
  Real.prototype.retry = function () { if (this.status === 'failed') { this.status = 'idle'; if (root.YT && root.YT.Player && !this.player) { } this.load(); } };
  Real.prototype.ready = function () { return this.status === 'ready' && this.player && typeof this.player.loadVideoById === 'function'; };
  Real.prototype._start = function () { const w = this.want; if (!w) return; const o = { videoId: w.id, startSeconds: w.start }; if (w.end) o.endSeconds = w.end; this.player.loadVideoById(o); };
  Real.prototype.play = function (id, start, end) { this.want = { id, start, end }; if (this.ready()) this._start(); };
  Real.prototype.seek = function (t) { if (this.ready()) { this.player.seekTo(t, true); this.player.playVideo(); } };
  Real.prototype.pause = function () { if (this.ready()) try { this.player.pauseVideo(); } catch (e) { } };
  Real.prototype.resume = function () { if (this.ready()) try { this.player.playVideo(); } catch (e) { } };
  Real.prototype.stop = function () { this.want = null; if (this.ready()) try { this.player.stopVideo(); } catch (e) { } };
  Real.prototype.time = function () { try { return this.ready() ? (this.player.getCurrentTime() || 0) : 0; } catch (e) { return 0; } };
  Real.prototype.state = function () { try { return this.ready() ? this.player.getPlayerState() : -2; } catch (e) { return -2; } };
  Real.prototype.mute = function (m) { this.muted = !!m; if (this.ready()) try { m ? this.player.mute() : this.player.unMute(); } catch (e) { } };
  Real.prototype.setVolume = function (v) { this.vol = Math.round(v); if (this.ready()) try { this.player.setVolume(this.vol); } catch (e) { } };
  // Some videos switch their own lyric captions on, which would print the answer under the cover.
  // While guessing, the game unloads the player's captions module; it is loaded again on the reveal.
  Real.prototype.captions = function (on) { const was = this.cc; this.cc = !!on; if (this.cc !== was || !on) this._cc(); };
  Real.prototype._cc = function () { if (!this.ready()) return; try { if (this.cc) this.player.loadModule('captions'); else this.player.unloadModule('captions'); } catch (e) { } };
  Real.prototype.iframe = function () { try { return this.player && this.player.getIframe ? this.player.getIframe() : null; } catch (e) { return null; } };

  // ---------- test double (only with ?yt=mock) ----------
  function Mock(hostId, cb, opts) {
    this.cb = cb || {}; this.status = 'idle'; this.st = -1; this.t = 0; this.want = null; this.muted = false; this.vol = 80; this.opts = opts || {}; this.hostId = hostId; this.log = [];
  }
  Mock.prototype.load = function () {
    if (this.opts.apiFail) { this.status = 'failed'; if (this.cb.onFail) setTimeout(() => this.cb.onFail('api'), 50); return; }
    this.status = 'ready'; const h = document.getElementById(this.hostId); if (h) { h.classList.add('mock'); h.textContent = 'TEST PLAYER'; }
    let last = performance.now();
    const tick = () => { const now = performance.now(); if (this.st === 1 && this.want) { this.t += (now - last) / 1000; if (this.preEnd && this.t >= this.preEnd) { this.preEnd = 0; this.t = this.want.start; } if (this.want.end && this.t >= this.want.end) { this.t = this.want.end; this._set(0); } } last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick); setTimeout(() => this.cb.onReady && this.cb.onReady(), 10);
  };
  Mock.prototype.retry = function () { };
  Mock.prototype.ready = function () { return this.status === 'ready'; };
  Mock.prototype._set = function (s) { this.st = s; if (this.cb.onState) this.cb.onState(s); };
  Mock.prototype.play = function (id, start, end) {
    this.want = { id, start, end }; this.t = start; this.log.push(id); this._set(3);
    if ((this.opts.fail || []).includes(id)) { setTimeout(() => { if (this.want && this.want.id === id) { this._set(-1); this.cb.onError && this.cb.onError(150, ERRORS[150]); } }, 120); return; }
    if ((this.opts.stall || []).includes(id)) return;          // buffers forever
    if (this.opts.needTap) { setTimeout(() => this._set(5), 100); return; }
    if (this.opts.pre) { this.t = 0; this.preEnd = this.opts.pre; this._set(1); return; }   // YouTube shows its own content first (clock runs from 0)
    setTimeout(() => { if (this.want && this.want.id === id) this._set(1); }, 150);
  };
  Mock.prototype.tap = function () { if (this.want && (this.st === 5 || this.st === -1)) this._set(1); };
  Mock.prototype.seek = function (t) { this.t = t; this._set(1); };
  Mock.prototype.pause = function () { if (this.st === 1) this._set(2); };
  Mock.prototype.resume = function () { if (this.want && this.st !== 1) this._set(1); };
  Mock.prototype.stop = function () { this.want = null; this._set(-1); };
  Mock.prototype.time = function () { return this.t; };
  Mock.prototype.state = function () { return this.ready() ? this.st : -2; };
  Mock.prototype.mute = function (m) { this.muted = !!m; };
  Mock.prototype.setVolume = function (v) { this.vol = v; };
  Mock.prototype.iframe = function () { return null; };
  Mock.prototype.captions = function (on) { this.cc = !!on; };

  root.NTG_YT = { Real, Mock, ERRORS, API };
})(typeof window !== 'undefined' ? window : this);
