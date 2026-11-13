/* Nursery music for Me & My Placenta.
   Clean modern recordings only, streamed at play time. Nothing is stored in the repo.
   Each file was checked: HTTP 200, an audio content type, and a quiet noise floor.
   The night starts on a random piece, then keeps shuffling. Playback stays at 1x. */
(function (root) {
  'use strict';

  const TRACKS = [
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 1, Of Foreign Lands and Peoples', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%201.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 7, Träumerei', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%207.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 12, Child Falling Asleep', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%2012.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 13, The Poet Speaks', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%2013.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Johann Sebastian Bach', piece: 'Sheep May Safely Graze, BWV 208', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Sheep_May_Safely_Graze_-_BWV_208_%28ISRC_USUAN1100079%29.mp3', page: 'https://commons.wikimedia.org/wiki/File:Sheep_May_Safely_Graze_-_BWV_208_(ISRC_USUAN1100079).mp3' },
    { composer: 'Erik Satie', piece: 'Gymnopédie No. 1', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Gymnopedie_No._1_%28ISRC_USUAN1100787%29.mp3', page: 'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3' },
    { composer: 'Erik Satie', piece: 'Gymnopédie No. 3', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Gymnopedie_No._3_%28ISRC_USUAN1100785%29.mp3', page: 'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._3_(ISRC_USUAN1100785).mp3' },
    { composer: 'Johann Sebastian Bach', piece: 'Goldberg Variations, BWV 988, Aria', performer: 'Kimiko Ishizaka, piano', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Kimiko_Ishizaka_-_J.S._Bach-_-Open-_Goldberg_Variations%2C_BWV_988_%28Piano%29_-_01_Aria.mp3', page: 'https://commons.wikimedia.org/wiki/File:Kimiko_Ishizaka_-_J.S._Bach-_-Open-_Goldberg_Variations,_BWV_988_(Piano)_-_01_Aria.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in D-flat major, Op. 27 No. 2', performer: 'Musopen', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/NocturneOp27No2.mp3', page: 'https://commons.wikimedia.org/wiki/File:NocturneOp27No2.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in E-flat major, Op. 9 No. 2', performer: 'Frank Levy, piano', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Nocturne_in_E_flat_major%2C_Op._9_no._2.mp3', page: 'https://commons.wikimedia.org/wiki/File:Nocturne_in_E_flat_major,_Op._9_no._2.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in D-flat major, Op. 28 No. 15, Raindrop', performer: 'Musopen', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Prelude_Op._28_no._15.mp3', page: 'https://commons.wikimedia.org/wiki/File:Prelude_Op._28_no._15.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in A major, Op. 28 No. 7', performer: 'Musopen', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Prelude_Op._28_no._7.mp3', page: 'https://commons.wikimedia.org/wiki/File:Prelude_Op._28_no._7.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in B minor, Op. 28 No. 6', performer: 'Musopen', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Prelude_Op._28_no._6.mp3', page: 'https://commons.wikimedia.org/wiki/File:Prelude_Op._28_no._6.mp3' },
    { composer: 'Claude Debussy', piece: 'Clair de lune', performer: 'United States Air Force Band of Flight, Wright Brass', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Clair_de_Lune_-_Wright_Brass_-_United_States_Air_Force_Band_of_Flight.mp3', page: 'https://commons.wikimedia.org/wiki/File:Clair_de_Lune_-_Wright_Brass_-_United_States_Air_Force_Band_of_Flight.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in G major, Op. 37 No. 2', performer: 'Olga Gurevich, piano', license: 'CC0', url: 'https://archive.org/download/parso-1c53a71e4ef6f47591ab605d801bc3780b27824a/000_Chopin_Nocturne_Op_37_no_2_in_G_major_Olga_Gurevich.mp3', page: 'https://archive.org/details/parso-1c53a71e4ef6f47591ab605d801bc3780b27824a' }
  ];

  function canPlay(url) {
    const a = document.createElement('audio');
    const s = a.canPlayType('audio/mpeg');
    return s === 'probably' || s === 'maybe';
  }

  function Music(rand) {
    this.rand = rand || Math.random;
    this.all = TRACKS;
    this.tracks = TRACKS.filter(function (t) { return canPlay(t.url); });
    this.volume = 0.8;
    this.muted = false;
    this.duck = 0.78;
    this.unlocked = false;
    this.track = null;
    this.bag = [];
    this.failures = 0;
    this._switching = false;
    this.els = [];
    this.hot = 0;
    const self = this;
    this.holder = document.createElement('div');
    this.holder.setAttribute('aria-hidden', 'true');
    /* Not display:none. Safari refuses to play media inside a hidden element. */
    this.holder.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const mount = function () { if (!self.holder.parentNode) document.body.appendChild(self.holder); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
    for (let i = 0; i < 2; i++) this.els.push(this._make());
    this._refill();
    this.track = this._take() || this.tracks[0] || null;
    if (this.track) this._assign(this.els[0], this.track);
  }

  Music.prototype._make = function () {
    const el = new Audio();
    /* No crossOrigin. These files are only played, never read through Web Audio.
       A CORS miss would make the element silent in Safari and Chrome.
       Speed stays at 1. The narration slider does not touch the lullaby. */
    el.preload = 'auto';
    el.loop = false;
    el.playbackRate = 1;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    const self = this;
    el.addEventListener('pause', function () {
      if (self.els[self.hot] !== el || self._switching) return;
      self.keepAlive();
    });
    el.addEventListener('error', function () {
      if (!el.error || el.error.code === 1) return;
      if (!self.unlocked) return;
      if (self.els[self.hot] !== el && !self._switching) return;
      self.failures++;
      self._switching = false;
      if (self.failures > 8) return;
      self.next();
    });
    el.addEventListener('ended', function () {
      if (self.els[self.hot] !== el || self._switching) return;
      self.next();
    });
    this.holder.appendChild(el);
    return el;
  };

  Music.prototype._refill = function () {
    const list = this.tracks.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    if (this.track && list.length > 1 && list[0] === this.track) {
      list.push(list.shift());
    }
    this.bag = list;
  };

  Music.prototype._take = function () {
    if (!this.bag.length) this._refill();
    return this.bag.shift() || this.tracks[0] || null;
  };

  Music.prototype._assign = function (el, track) {
    if (!track) return;
    if (el.src !== track.url && !String(el.src || '').endsWith(track.url)) el.src = track.url;
  };

  Music.prototype._level = function () {
    if (this.muted) return 0;
    return Math.max(0, Math.min(1, this.volume * this.duck));
  };

  Music.prototype.apply = function () {
    if (this._switching) return;
    try { this.els[this.hot].volume = this._level(); } catch (e) {}
  };

  Music.prototype.setDuck = function (n) {
    this.duck = n;
    this.apply();
  };

  Music.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.apply();
  };

  Music.prototype.setMuted = function (m) {
    this.muted = !!m;
    this.apply();
    if (!this.muted) this.keepAlive();
  };

  Music.prototype.toggleMuted = function () { this.setMuted(!this.muted); };

  Music.prototype.element = function () { return this.els[this.hot]; };

  Music.prototype.line = function () {
    const t = this.track;
    if (!t) return '';
    return t.composer + ' — ' + t.piece;
  };

  Music.prototype.start = function () {
    this.unlocked = true;
    const el = this.els[this.hot];
    if (el.error && this.track) el.src = this.track.url;
    try { el.playbackRate = 1; } catch (e) {}
    this.apply();
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
  };

  /* If a narration swap pauses the lullaby, play it again in this same turn.
     A muted lullaby stays quiet. A failure here must not throw. */
  Music.prototype.keepAlive = function () {
    if (this._keeping || !this.unlocked || this.muted || this._switching) return;
    const el = this.els[this.hot];
    if (!el || (!el.paused && !el.ended)) return;
    if (el.ended || (isFinite(el.duration) && el.duration > 8 && el.currentTime >= el.duration - 0.35)) {
      this.next();
      return;
    }
    this._keeping = true;
    try { el.playbackRate = 1; } catch (e) {}
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
    this._keeping = false;
  };

  Music.prototype.next = function () {
    if (!this.tracks.length || this._switching) return;
    const incoming = this._take();
    if (!incoming) return;
    this._switching = true;
    const nxt = 1 - this.hot;
    const el = this.els[nxt];
    this.track = incoming;
    this._assign(el, incoming);
    try { el.playbackRate = 1; } catch (e) {}
    el.volume = 0;
    const self = this;
    const go = el.play();
    if (go && go.catch) go.catch(function () {});
    const old = this.els[this.hot];
    const t0 = performance.now();
    const from = old.volume;
    const to = this._level();
    function step(now) {
      const u = Math.min(1, (now - t0) / 1400);
      try { old.volume = from * (1 - u); el.volume = to * u; } catch (e) {}
      if (u < 1) requestAnimationFrame(step);
      else {
        old.pause();
        self.hot = nxt;
        self._switching = false;
        self.apply();
      }
    }
    requestAnimationFrame(step);
  };

  Music.prototype.tick = function () {
    if (!this.unlocked || this._switching) return;
    const el = this.els[this.hot];
    if (!el) return;
    try { if (el.playbackRate !== 1) el.playbackRate = 1; } catch (e) {}
    if (el.paused || el.ended) {
      const now = performance.now();
      if (!this._keepAt || now - this._keepAt > 450) {
        this._keepAt = now;
        this.keepAlive();
      }
      return;
    }
    if (!isFinite(el.duration) || el.duration < 8) return;
    if (el.currentTime > el.duration - 2.4) this.next();
    else this.apply();
  };

  root.PlacentaMusic = Music;
})(window);
