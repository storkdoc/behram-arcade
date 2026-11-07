/* JUKEBOX YouTube player.
   Official IFrame Player API only: https://www.youtube.com/iframe_api
   One visible player is created on the first explicit Play and reused for every
   later song (loadVideoById, or seekTo when replaying the same video). The host
   is always https://www.youtube.com so a signed-in YouTube session can be sent.
   The privacy-enhanced host is not used. This file does not destroy the iframe, swap hosts,
   read or write cookies, change origin between tracks, or touch ad playback.

   Reuse is what keeps a signed-in youtube.com session attached to the embed.
   YouTube Premium on embeds depends on the viewer's own cookies in this browser.
   Building a fresh iframe per song, or per page view inside the same document,
   would drop the player YouTube already tied that session to. A full page reload
   still starts a new document; the configuration here is the same every time,
   and nothing in this cabinet clears site data to chase a different ad decision.

   The player shell is created when the IFrame API is ready so that Play can call
   loadVideoById or playVideo inside the click. No video id is loaded, and nothing
   is passed as autoplay, until that explicit Play. Ads, if any, stay YouTube's
   decision. Controls stay on. The iframe is not hidden, covered, or replaced
   with an audio-only element. */
(function (root) {
  'use strict';
  const API = 'https://www.youtube.com/iframe_api';
  const HOST = 'https://www.youtube.com';
  const ERRORS = {
    2: 'bad video id',
    5: 'HTML5 player error',
    100: 'video removed or private',
    101: 'embedding not allowed',
    150: 'embedding not allowed'
  };

  function buildPlayerVars(origin) {
    const v = { controls: 1, playsinline: 1, rel: 0, fs: 1 };
    if (origin) v.origin = origin;
    return v;
  }

  function blankStats() {
    return { constructs: 0, loads: [], replays: 0, destroys: 0, hosts: [], scripts: [] };
  }

  function Real(hostId, cb, env) {
    this.hostId = hostId;
    this.cb = cb || {};
    this.env = env || root;
    this.status = 'idle';
    this.player = null;
    this.want = null;
    this.currentId = null;
    this.hold = false;
    this.muted = false;
    this.vol = 80;
    this._iframe = null;
    this.stats = blankStats();
  }

  Real.prototype.ensure = function () {
    if (this.player || this.status === 'loading' || this.status === 'ready') return;
    this.status = 'loading';
    const self = this;
    const env = this.env;
    const make = () => {
      if (self.player || self.status === 'failed') return;
      self.stats.constructs++;
      self.stats.hosts.push(HOST);
      let origin = '';
      try { origin = env.location && env.location.origin || ''; } catch (e) { origin = ''; }
      try {
        self.player = new env.YT.Player(self.hostId, {
          width: '100%',
          height: '100%',
          host: HOST,
          playerVars: buildPlayerVars(origin),
          events: {
            onReady() {
              /* YouTube calls this after the constructor returns, but a test double
                 might call it re-entrantly. Defer so `self.player` is assigned either way,
                 and so play() does not load twice. */
              const kick = () => {
                if (self.status === 'failed') return;
                self.status = 'ready';
                try {
                  const frame = self.player && self.player.getIframe && self.player.getIframe();
                  if (frame) self._iframe = frame;
                } catch (e) { /* getIframe() is same-origin; the document inside is not */ }
                try {
                  self.player.setVolume(self.vol);
                  if (self.muted) self.player.mute();
                } catch (e) { /* player not fully attached yet */ }
                if (self.want && !self.hold && !self.currentId) self._load(self.want);
                if (self.cb.onReady) self.cb.onReady();
              };
              if (typeof queueMicrotask === 'function') queueMicrotask(kick);
              else setTimeout(kick, 0);
            },
            onStateChange(e) { if (self.cb.onState) self.cb.onState(e.data); },
            onError(e) { if (self.cb.onError) self.cb.onError(e.data, ERRORS[e.data] || 'player error'); }
          }
        });
      } catch (err) {
        self.status = 'failed';
        if (self.cb.onFail) self.cb.onFail('api');
      }
    };
    if (env.YT && env.YT.Player) { make(); return; }
    const prev = env.onYouTubeIframeAPIReady;
    env.onYouTubeIframeAPIReady = function () {
      if (prev) try { prev(); } catch (e) { /* keep going; this page owns the player */ }
      make();
    };
    const doc = env.document;
    if (doc && !doc.querySelector('script[data-jukebox-yt="1"]')) {
      const s = doc.createElement('script');
      s.src = API;
      s.async = true;
      s.setAttribute('data-jukebox-yt', '1');
      self.stats.scripts.push(API);
      s.onerror = () => {
        if (self.status !== 'loading') return;
        self.status = 'failed';
        if (self.cb.onFail) self.cb.onFail('api');
      };
      doc.head.appendChild(s);
    }
  };

  Real.prototype.ready = function () {
    return this.status === 'ready' && this.player && typeof this.player.loadVideoById === 'function';
  };

  Real.prototype._load = function (id) {
    if (!id || !this.ready()) return;
    this.currentId = id;
    this.stats.loads.push(id);
    /* New song, same iframe. No end time: the official video plays through. */
    this.player.loadVideoById({ videoId: id });
    try {
      const frame = this.player.getIframe && this.player.getIframe();
      if (frame && !this._iframe) this._iframe = frame;
    } catch (e) { /* ignore */ }
  };

  Real.prototype.play = function (videoId) {
    if (!videoId) return;
    this.want = videoId;
    this.hold = false;
    if (this.ready()) { this._load(videoId); return; }
    this.ensure();
  };

  Real.prototype.replay = function () {
    if (!this.ready()) return;
    this.hold = false;
    this.stats.replays++;
    try { this.player.seekTo(0, true); this.player.playVideo(); } catch (e) { /* ignore */ }
  };

  Real.prototype.pause = function () {
    this.hold = true;
    if (this.ready()) try { this.player.pauseVideo(); } catch (e) { /* ignore */ }
  };

  Real.prototype.resume = function () {
    this.hold = false;
    if (this.ready()) {
      if (this.currentId) { try { this.player.playVideo(); } catch (e) { /* ignore */ } }
      else if (this.want) this._load(this.want);
      return;
    }
    if (this.want) this.ensure();
  };

  Real.prototype.time = function () {
    try { return this.ready() ? (this.player.getCurrentTime() || 0) : 0; } catch (e) { return 0; }
  };

  Real.prototype.state = function () {
    try { return this.ready() ? this.player.getPlayerState() : -2; } catch (e) { return -2; }
  };

  Real.prototype.mute = function (m) {
    this.muted = !!m;
    if (!this.ready()) return;
    try { m ? this.player.mute() : this.player.unMute(); } catch (e) { /* ignore */ }
  };

  Real.prototype.setVolume = function (v) {
    this.vol = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    if (this.ready()) try { this.player.setVolume(this.vol); } catch (e) { /* ignore */ }
  };

  Real.prototype.iframe = function () {
    try { return (this.player && this.player.getIframe && this.player.getIframe()) || this._iframe || null; } catch (e) { return this._iframe || null; }
  };

  Real.prototype.report = function () {
    const frame = this.iframe();
    let src = '';
    try { src = frame && frame.src || ''; } catch (e) { src = ''; }
    let sandbox = null, credentialless = null, referrerPolicy = null, allow = null, query = {};
    if (frame) {
      try { sandbox = frame.getAttribute('sandbox'); } catch (e) { sandbox = null; }
      try { credentialless = frame.hasAttribute('credentialless'); } catch (e) { credentialless = null; }
      try { referrerPolicy = frame.referrerPolicy || frame.getAttribute('referrerpolicy'); } catch (e) { referrerPolicy = null; }
      try { allow = frame.getAttribute('allow'); } catch (e) { allow = null; }
    }
    if (src) {
      try {
        const u = new URL(src);
        const keep = ['controls', 'playsinline', 'rel', 'fs', 'enablejsapi', 'origin', 'autoplay', 'mute', 'iv_load_policy', 'disablekb', 'modestbranding'];
        keep.forEach(k => { if (u.searchParams.has(k)) query[k] = u.searchParams.get(k); });
        src = u.host + u.pathname;
      } catch (e) { src = ''; }
    }
    let iframes = 0;
    try { iframes = this.env.document.querySelectorAll('iframe').length; } catch (e) { iframes = 0; }
    return {
      constructs: this.stats.constructs,
      loads: this.stats.loads.slice(),
      replays: this.stats.replays,
      destroys: this.stats.destroys,
      hosts: this.stats.hosts.slice(),
      scripts: this.stats.scripts.slice(),
      status: this.status,
      configuredHost: HOST,
      sameIframe: !!(frame && this._iframe && frame === this._iframe),
      iframes,
      sandbox,
      credentialless,
      referrerPolicy,
      allow,
      src,
      query
    };
  };

  function Mock(hostId, cb, opts) {
    this.hostId = hostId;
    this.cb = cb || {};
    this.opts = opts || {};
    this.status = 'idle';
    this.player = null;
    this.face = null;
    this.want = null;
    this.currentId = null;
    this.hold = false;
    this.muted = false;
    this.vol = 80;
    this.st = -1;
    this.t = 0;
    this.stats = blankStats();
    this._timer = null;
  }

  Mock.prototype.ensure = function () {
    if (this.player || this.status === 'ready' || this.status === 'loading') return;
    if (this.opts.apiFail) {
      this.status = 'failed';
      if (this.cb.onFail) this.cb.onFail('api');
      return;
    }
    this.stats.constructs++;
    this.stats.hosts.push(HOST);
    const doc = root.document;
    const host = doc && doc.getElementById(this.hostId);
    if (host) {
      const face = doc.createElement('div');
      face.className = 'mock-player';
      face.setAttribute('role', 'img');
      face.setAttribute('aria-label', 'Test player stand-in');
      face.textContent = 'TEST PLAYER';
      host.appendChild(face);
      this.face = face;
    }
    this.player = { face: this.face };
    this.status = 'ready';
    if (this.cb.onReady) this.cb.onReady();
  };

  Mock.prototype.ready = function () { return this.status === 'ready'; };

  Mock.prototype._set = function (s) {
    this.st = s;
    if (this.cb.onState) this.cb.onState(s);
  };

  Mock.prototype._load = function (id) {
    this.currentId = id;
    this.t = 0;
    this.stats.loads.push(id);
    if (this.face) this.face.dataset.video = id;
    this._set(3);
    const self = this;
    clearTimeout(this._timer);
    if ((this.opts.fail || []).indexOf(id) >= 0) {
      this._timer = setTimeout(() => {
        if (self.currentId === id) {
          self._set(-1);
          if (self.cb.onError) self.cb.onError(150, ERRORS[150]);
        }
      }, 40);
      return;
    }
    /* noauto: the video is loaded but left unstarted, the way a browser blocks
       play that happens outside a user gesture. resume()/playVideo starts it. */
    if (this.opts.noauto) { this._set(-1); return; }
    this._timer = setTimeout(() => {
      if (self.currentId === id && !self.hold) self._set(1);
    }, 20);
  };

  Mock.prototype.play = function (videoId) {
    if (!videoId) return;
    this.want = videoId;
    this.hold = false;
    if (!this.ready()) this.ensure();
    if (this.ready()) this._load(videoId);
  };

  Mock.prototype.replay = function () {
    if (!this.ready()) return;
    this.hold = false;
    this.stats.replays++;
    this.t = 0;
    this._set(1);
  };

  Mock.prototype.pause = function () {
    this.hold = true;
    if (this.st === 1 || this.st === 3) this._set(2);
  };

  Mock.prototype.resume = function () {
    this.hold = false;
    if (!this.ready()) { if (this.want) this.ensure(); return; }
    if (this.currentId && this.st !== 1) this._set(1);
    else if (this.want && !this.currentId) this._load(this.want);
  };

  Mock.prototype.finish = function () {
    if (this.currentId) this._set(0);
  };

  Mock.prototype.time = function () { return this.t; };
  Mock.prototype.state = function () { return this.ready() ? this.st : -2; };
  Mock.prototype.mute = function (m) { this.muted = !!m; };
  Mock.prototype.setVolume = function (v) { this.vol = v; };
  Mock.prototype.iframe = function () { return null; };
  Mock.prototype.report = function () {
    return {
      constructs: this.stats.constructs,
      loads: this.stats.loads.slice(),
      replays: this.stats.replays,
      destroys: this.stats.destroys,
      hosts: this.stats.hosts.slice(),
      scripts: this.stats.scripts.slice(),
      status: this.status,
      configuredHost: HOST,
      sameIframe: true,
      iframes: 0,
      sandbox: null,
      credentialless: false,
      mock: true
    };
  };

  const api = { Real, Mock, ERRORS, API, HOST, buildPlayerVars };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukePlayer = api;
})(typeof window !== 'undefined' ? window : globalThis);
