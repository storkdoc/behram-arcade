/* Nursery music for Me & My Placenta.
   Real recordings, streamed at play time. Nothing is stored in the repo.
   Safari plays the MP3 set. Each URL was checked: it answers audio/mpeg,
   sends Access-Control-Allow-Origin: *, and ffprobe reads a duration.
   A short file simply hands the night-light to the next shuffled piece. */
(function (root) {
  'use strict';

  const TRACKS = [
    { composer: 'Johannes Brahms', piece: 'Wiegenlied, Op. 49 No. 4', performer: 'Ernestine Schumann-Heink, Victor Orchestra (1906)', license: 'Public domain', url: 'https://archive.org/download/78_wiegenlied-cradle-song_ernestine-schumann-heink-victor-orchestra-brahms_gbia0455298a/Wiegenlied%20(Cradle%20Song)%20-%20Ernestine%20Schumann-Heink.mp3', page: 'https://archive.org/details/78_wiegenlied-cradle-song_ernestine-schumann-heink-victor-orchestra-brahms_gbia0455298a' },
    { composer: 'Johannes Brahms', piece: 'Lullaby', performer: 'Elsie Baker (1912)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-132112-lullaby/jukebox-132112_lullaby.mp3', page: 'https://archive.org/details/loc-jukebox-132112-lullaby' },
    { composer: 'Johannes Brahms', piece: 'Lullaby', performer: 'Edna White Trumpet Quartet (1918)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-658837-lullaby/jukebox-658837_lullaby.mp3', page: 'https://archive.org/details/loc-jukebox-658837-lullaby' },
    { composer: 'Johannes Brahms', piece: 'Cradle Song', performer: 'Percy Grainger and Porter Grainger (1922)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-668736-cradle-song/jukebox-668736_cradle-song.mp3', page: 'https://archive.org/details/loc-jukebox-668736-cradle-song' },
    { composer: 'Franz Schubert', piece: 'Wiegenlied', performer: 'Emmy Destinn, with Walter B. Rogers (1915)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-12052-wiegenlied/jukebox-12052_wiegenlied.mp3', page: 'https://archive.org/details/loc-jukebox-12052-wiegenlied' },
    { composer: 'Frédéric Chopin', piece: 'Berceuse in D-flat major, Op. 57', performer: 'Frank La Forge (1913)', license: 'Public domain', url: 'https://archive.org/download/1913-berceuse-chopin-frank-la-forge-vic-55031-a/1913%20Berceuse%20-%20Chopin%20-%20Frank%20La%20Forge%20VIC%2055031%20A.mp3', page: 'https://archive.org/details/1913-berceuse-chopin-frank-la-forge-vic-55031-a' },
    { composer: 'Frédéric Chopin', piece: 'Berceuse, Op. 57', performer: 'Leopold Godowsky (1913)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-750801-berceuse/jukebox-750801_berceuse.mp3', page: 'https://archive.org/details/loc-jukebox-750801-berceuse' },
    { composer: 'Traditional Welsh (Ar Hyd y Nos)', piece: 'All Through the Night', performer: 'David Bispham (1911)', license: 'Public domain', url: 'https://archive.org/download/a-5320-bishpham-all-through-the-night/A%205320%20Bishpham%20-%20All%20through%20the%20Night.mp3', page: 'https://archive.org/details/a-5320-bishpham-all-through-the-night' },
    { composer: 'Traditional Welsh (Ar Hyd y Nos)', piece: 'All Through the Night', performer: 'Evan Williams (1908)', license: 'Public domain', url: 'https://archive.org/download/AllThroughTheNight_201812/All%20through%20the%20night.mp3', page: 'https://archive.org/details/AllThroughTheNight_201812' },
    { composer: 'Traditional Welsh (Ar Hyd y Nos)', piece: 'All Through the Night', performer: 'Margaret Romaine (1922)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-709646-all-through-the-night/jukebox-709646_all-through-the-night.mp3', page: 'https://archive.org/details/loc-jukebox-709646-all-through-the-night' },
    { composer: 'Benjamin Godard', piece: 'Berceuse, from Jocelyn', performer: 'William Beck (1912)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-762750-berceuse-lullaby/jukebox-762750_berceuse-lullaby.mp3', page: 'https://archive.org/details/loc-jukebox-762750-berceuse-lullaby' },
    { composer: 'Benjamin Godard', piece: 'Berceuse', performer: 'Gudrun Carlson (1906)', license: 'Public domain', url: 'https://archive.org/download/loc-jukebox-124191-berceuse/jukebox-124191_berceuse.mp3', page: 'https://archive.org/details/loc-jukebox-124191-berceuse' },
    { composer: 'Bernhard Flies, long attributed to Mozart', piece: 'Wiegenlied (cradle song)', performer: 'Frieda Hempel (1915)', license: 'Public domain', url: 'https://archive.org/download/78_wiegenlied-cradle-song_frieda-hempel-mozart_gbia0132351a_item/Wiegenlied(Cradle%20Song)-Frieda%20Hempel.mp3', page: 'https://archive.org/details/78_wiegenlied-cradle-song_frieda-hempel-mozart_gbia0132351a_item' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 1, Of Foreign Lands and Peoples', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%201.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 7, Träumerei', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%207.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 12, Child Falling Asleep', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%2012.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Robert Schumann', piece: 'Kinderszenen, Op. 15 No. 13, The Poet Speaks', performer: 'Gregory Tait, piano (2020)', license: 'CC BY 4.0', url: 'https://archive.org/download/schumann-kinderszenen-op.-15/Schumann%20Kinderszenen%20No.%2013.mp3', page: 'https://archive.org/details/schumann-kinderszenen-op.-15' },
    { composer: 'Johann Sebastian Bach', piece: 'Sheep May Safely Graze, BWV 208', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Sheep_May_Safely_Graze_-_BWV_208_%28ISRC_USUAN1100079%29.mp3', page: 'https://commons.wikimedia.org/wiki/File:Sheep_May_Safely_Graze_-_BWV_208_(ISRC_USUAN1100079).mp3' }
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
    this.track = this.tracks[0] || null;
    this.bag = [];
    this.failures = 0;
    this._switching = false;
    this.els = [];
    this.hot = 0;
    const self = this;
    this.holder = document.createElement('div');
    this.holder.hidden = true;
    this.holder.setAttribute('aria-hidden', 'true');
    const mount = function () { if (!self.holder.parentNode) document.body.appendChild(self.holder); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
    for (let i = 0; i < 2; i++) this.els.push(this._make());
    this._refill();
    if (this.track) this._assign(this.els[0], this.track);
  }

  Music.prototype._make = function () {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = false;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    const self = this;
    el.addEventListener('error', function () {
      if (self.els[self.hot] !== el) return;
      if (!el.error || el.error.code === 1) return;
      self.failures++;
      if (self.unlocked) self.next();
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
    el.src = track.url;
    el.load();
  };

  Music.prototype._level = function () {
    if (this.muted) return 0;
    return Math.max(0, Math.min(1, this.volume * this.duck));
  };

  Music.prototype.apply = function () {
    if (this._switching) return;
    this.els[this.hot].volume = this._level();
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
    this.apply();
    if (el.paused) {
      const p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
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
      old.volume = from * (1 - u);
      el.volume = to * u;
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
    if (!el || el.paused || !isFinite(el.duration) || el.duration < 8) return;
    if (el.currentTime > el.duration - 2.4) this.next();
    else this.apply();
  };

  root.PlacentaMusic = Music;
})(window);
