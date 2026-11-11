/* RELAX music.
   Real recordings streamed at runtime from Wikimedia Commons (upload.wikimedia.org
   sends Access-Control-Allow-Origin: *). Nothing is downloaded into the repo.
   Safari plays MP3 and FLAC; Chrome and Firefox also play Ogg Vorbis. Tracks the
   browser cannot decode are left out, and a file that fails to load is skipped.
   Two elements crossfade so the piece can change with the sand pattern. */
(function (root) {
  'use strict';

  const TRACKS = [
    { composer: 'Claude Debussy', piece: 'Clair de Lune', performer: 'Wright Brass, USAF Band of Flight', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Clair_de_Lune_-_Wright_Brass_-_United_States_Air_Force_Band_of_Flight.mp3' },
    { composer: 'Johann Sebastian Bach', piece: 'Air on the G String, BWV 1068', performer: 'Air Force Strings, USAF Band', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3' },
    { composer: 'Johann Sebastian Bach', piece: 'Violin Concerto No. 1 in A minor, II. Andante', performer: 'United States Marine Chamber Orchestra', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Violin_Concerto_No.1_in_A_minor_-_II._Andante_-_Chamber_Orchestra_-_United_States_Marine_Band.mp3' },
    { composer: 'Johann Sebastian Bach', piece: 'Sleepers, Wake, BWV 140', performer: 'Galaxy Brass, USAF Band of the Rockies', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Sleepers%2C_Wake_-_Galaxy_Brass_-_United_States_Air_Force_Band_of_the_Rockies.mp3' },
    { composer: 'Johann Sebastian Bach', piece: 'Goldberg Variations, Aria', performer: 'Kimiko Ishizaka', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Kimiko_Ishizaka_-_J.S._Bach-_-Open-_Goldberg_Variations%2C_BWV_988_%28Piano%29_-_01_Aria.mp3' },
    { composer: 'Bach, Gounod & Schubert', piece: 'Ave Maria in Due', performer: 'USAF Heritage of America Band, arr. Aldo Forte', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Ave_Maria_in_Due_-_Concert_Band_-_United_States_Air_Force_Heritage_of_America_Band.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in E-flat major, Op. 9 No. 2', performer: 'Frank Levy', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Nocturne_in_E_flat_major%2C_Op._9_no._2.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in D-flat major, Op. 27 No. 2', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/NocturneOp27No2.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in C-sharp minor, B. 49', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Nocturne_B._49_in_C_sharp_minor_%27Lento_con_gran_espressione%27_%281%29.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Nocturne in C minor, B. 108', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/3/34/Nocturne_B._108_in_C_minor.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in D-flat major, Op. 28 No. 15', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Prelude_Op._28_no._15.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in B minor, Op. 28 No. 6', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Prelude_Op._28_no._6.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Prelude in A major, Op. 28 No. 7', performer: 'Musopen pianist', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Prelude_Op._28_no._7.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Waltz in F minor, Op. 70 No. 2', performer: 'Olga Gurevich', license: 'CC BY 4.0', url: 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Chopin_Waltz_Op._70_no._2_in_F_minor_Olga_Gurevich.mp3' },
    { composer: 'Frédéric Chopin', piece: 'Cello Sonata in G minor, Op. 65, III. Largo', performer: 'Musopen', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Sonata_for_Piano_and_Cello_in_G_Minor%2C_Op._65_-_III._Largo.mp3' },
    { composer: 'Antonín Dvořák', piece: "Goin' Home (New World Symphony, Largo)", performer: 'USAF Concert Band', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Goin%27_Home_-_Concert_Band_-_United_States_Air_Force_Band.mp3' },
    { composer: 'Edvard Grieg', piece: "From Holberg's Time, I. Praeludium", performer: 'United States Marine Band, Maj Jason K. Fettig', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Grieg%27s_Suite_for_Strings%2C_Op._40%2C_%22From_Holberg%E2%80%99s_Time%22_-_I._Praeludium_-_Chamber_Orchestra_-_United_States_Marine_Band.mp3' },
    { composer: 'Edvard Grieg', piece: "From Holberg's Time, II. Sarabande", performer: 'United States Marine Band, Maj Jason K. Fettig', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/2/20/Grieg%27s_Suite_for_Strings%2C_Op._40%2C_%22From_Holberg%E2%80%99s_Time%22_-_II._Sarabande_-_Chamber_Orchestra_-_United_States_Marine_Band.mp3' },
    { composer: 'Edvard Grieg', piece: "From Holberg's Time, IV. Air", performer: 'United States Marine Band, Maj Jason K. Fettig', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Grieg%27s_Suite_for_Strings%2C_Op._40%2C_%22From_Holberg%E2%80%99s_Time%22_-_IV._Air_-_Chamber_Orchestra_-_United_States_Marine_Band.mp3' },
    { composer: 'Wolfgang Amadeus Mozart', piece: 'Serenade No. 10, III. Adagio', performer: "The President's Own, United States Marine Band", license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Mozart%27s_Serenade_No._10_%22Grand_Partita%22_-_III._Adagio._Andante_-_United_States_Marine_Band.mp3' },
    { composer: 'Wolfgang Amadeus Mozart', piece: 'Serenade No. 10, V. Romance. Adagio', performer: "The President's Own, United States Marine Band", license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Mozart%27s_Serenade_No._10_%22Grand_Partita%22_-_V._Romance._Adagio_-_United_States_Marine_Band.mp3' },
    { composer: 'Wolfgang Amadeus Mozart', piece: "Soave sia il vento, from Così fan tutte", performer: 'Singing Sergeants, USAF Band', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/9/91/%22Soave_Sia_Il_Vento%22_from_Cosi_Fan_Tutte_-_Singing_Sergeants_-_United_States_Air_Force_Band.mp3' },
    { composer: 'Erik Satie', piece: 'Gymnopédie No. 1', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Gymnopedie_No._1_%28ISRC_USUAN1100787%29.mp3' },
    { composer: 'Erik Satie', piece: 'Gymnopédie No. 2', performer: 'Michael Laucke, guitar', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Satie_Gymnopedie_No_2_performed_by_Michael_Laucke.flac' },
    { composer: 'Johann Pachelbel', piece: 'Canon in D', performer: 'Kevin MacLeod', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Canon_in_D_Major_%28ISRC_USUAN1100301%29.mp3' },
    { composer: 'Ludwig van Beethoven', piece: 'Ode to Joy', performer: 'USAF Band of the Rockies', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Ode_to_Joy_-_Concert_Band_-_United_States_Air_Force_Band_of_the_Rockies.mp3' },
    { composer: 'Ludwig van Beethoven', piece: 'Piano Sonata No. 8, II. Adagio cantabile', performer: 'Daniel Veesey', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Daniel_Veesey_-_02_-_Sonata_8_Pathetique_-_II_Adagio_cantabile.ogg' },
    { composer: 'Claude Debussy', piece: 'Première Arabesque', performer: 'Patrizia Prati', license: 'CC BY-SA 4.0', url: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Claude_Debussy_-_Premi%C3%A8re_Arabesque_-_Patrizia_Prati.ogg' },
    { composer: 'Erik Satie', piece: 'Gnossienne No. 1', performer: 'La Pianista', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Satie_-_Gnossienne_1.ogg' },
    { composer: 'Erik Satie', piece: 'Gymnopédie No. 1', performer: 'Teknopazzo, piano', license: 'CC0', url: 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg' },
    { composer: 'Robert Schumann', piece: 'Träumerei, Kinderszenen Op. 15 No. 7', performer: 'Musopen pianist', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Robert_Schumann_-_scenes_from_childhood%2C_op._15_-_vii._dreaming.ogg' },
    { composer: 'Franz Schubert', piece: 'Ständchen, Schwanengesang D. 957 No. 4', performer: 'Jason M. C. Han', license: 'CC BY-SA 4.0', url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/St%C3%A4ndchen_%28Schubert%29-Serenade_D957_No.4%2C_Player_Jason%2C_Han.ogg' },
    { composer: 'Johann Pachelbel', piece: 'Canon in D', performer: 'Lee Galloway, piano', license: 'CC BY-SA 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Pachelbel%27s_Canon.ogg' },
    { composer: 'Maurice Ravel', piece: 'Pavane pour une infante défunte', performer: 'historical 78 rpm transfer by Pracchia-78', license: 'Public domain', url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Maurice_Ravel_-_Pavane_pour_une_infante_d%C3%A9funte.ogg' },
    { composer: 'Edward Elgar', piece: "Salut d'amour, Op. 12", performer: 'Emanuel Salvador and Pau Casan', license: 'CC BY 3.0', url: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Edward_Elgar_-_Salut_d%27amour%2C_Op._12_-_Emanuel_Salvador_and_Pau_Casan_%282011%29.ogg' }
  ];

  function pageFor(url) {
    const name = decodeURIComponent(url.split('/').pop() || '');
    return 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(name).replace(/%20/g, '_');
  }
  TRACKS.forEach(function (t) { t.page = pageFor(t.url); });

  function canPlay(url) {
    const a = document.createElement('audio');
    const u = url.toLowerCase();
    let type = 'audio/mpeg';
    if (u.endsWith('.flac')) type = 'audio/flac';
    else if (u.endsWith('.ogg') || u.endsWith('.oga')) type = 'audio/ogg; codecs="vorbis"';
    const s = a.canPlayType(type);
    return s === 'probably' || s === 'maybe';
  }

  function absUrl(url) {
    try { return new URL(url, root.location.href).href; } catch (e) { return url; }
  }

  function Music(rand) {
    this.rand = rand;
    this.all = TRACKS;
    this.tracks = TRACKS.filter(function (t) { return canPlay(t.url); });
    this.volume = 0.85;
    this.muted = false;
    this.unlocked = false;
    this.ctx = null;
    this.analyser = null;
    this.freq = null;
    this.master = null;
    this.graph = false;
    this.corsOk = null;
    this.els = [];
    this.gains = [];
    this.hot = 0;
    this.bag = [];
    this.bagAt = 0;
    this.index = 0;
    this.track = this.tracks[0] || null;
    this.failures = 0;
    this.lastError = '';
    this.fadeOld = -1;
    this.fadeAt = 0;
    this._switching = false;
    const self = this;
    this.holder = document.createElement('div');
    this.holder.hidden = true;
    this.holder.setAttribute('aria-hidden', 'true');
    if (document.body) document.body.appendChild(this.holder);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(self.holder); });
    for (let i = 0; i < 2; i++) this.els.push(this._makeEl());
    if (this.track) {
      this._orderPick(true);
      this._assign(this.els[0], this.track.url);
      this.els[0].load();
      this._probe(this.track.url);
    }
  }

  Music.prototype._makeEl = function () {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.loop = true;
    el.preload = 'auto';
    el.muted = false;
    el.volume = 1;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    const self = this;
    el.addEventListener('error', function () {
      if (self.els[self.hot] !== el) return;
      if (!el.error || el.error.code === 1) return;
      self._failed(el);
    });
    el.addEventListener('ended', function () {
      if (self.els[self.hot] !== el || !self.unlocked) return;
      try { el.currentTime = 0; } catch (e) { /* ignore */ }
      const p = el.play();
      if (p && p.catch) p.catch(function () { self._failed(el); });
    });
    this.holder.appendChild(el);
    return el;
  };

  Music.prototype._assign = function (el, url) {
    if (!el || !url) return;
    if (el.src && absUrl(el.src) === absUrl(url)) return;
    el.src = url;
  };

  Music.prototype._probe = function (url) {
    const self = this;
    if (!root.fetch) { this.corsOk = false; return; }
    fetch(url, { mode: 'cors', method: 'GET', headers: { Range: 'bytes=0-1023' } })
      .then(function (r) { self.corsOk = !!r.ok; })
      .catch(function () { self.corsOk = false; });
  };

  Music.prototype._orderPick = function (first) {
    if (this.bagAt >= this.bag.length) {
      this.bag = this.tracks.map(function (_, i) { return i; });
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        const t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
      }
      if (!first && this.bag.length > 1 && this.bag[0] === this.index) {
        const t = this.bag[0]; this.bag[0] = this.bag[1]; this.bag[1] = t;
      }
      this.bagAt = 0;
    }
    this.index = this.bag[this.bagAt++];
    this.track = this.tracks[this.index];
  };

  /* Route through Web Audio only after a CORS read of the file succeeded.
     createMediaElementSource permanently detaches the element, and a tainted
     element then plays silence. If the probe fails, the element plays on its
     own and stays audible. */
  Music.prototype._attach = function () {
    if (this.graph || !this.ctx || this.corsOk !== true) return;
    const analyser = this.analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.gains = this.els.map(function (el) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain);
      gain.connect(analyser);
      return gain;
    }, this);
    this.graph = true;
  };

  Music.prototype._output = function () {
    if (this.graph && this.master) {
      const v = this.muted ? 0 : this.volume;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(v, now);
      return;
    }
    const v = this.muted ? 0 : this.volume;
    for (let i = 0; i < this.els.length; i++) {
      this.els[i].muted = false;
      this.els[i].volume = v;
    }
  };

  Music.prototype._failed = function (el) {
    if (this._switching) return;
    if (this.els[this.hot] !== el) return;
    this.failures++;
    this.lastError = 'load';
    if (this.failures > this.tracks.length) return;
    this._switching = true;
    this._orderPick(false);
    this._probe(this.track.url);
    this._playHot(false);
    this._switching = false;
  };

  Music.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._output();
  };

  Music.prototype.setMuted = function (m) {
    this.muted = !!m;
    this._output();
  };

  Music.prototype.toggleMuted = function () {
    this.setMuted(!this.muted);
    return this.muted;
  };

  Music.prototype._setGain = function (index, value, fade) {
    const gain = this.gains[index];
    if (!gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    if (fade && fade > 0) {
      const from = Math.max(0.001, gain.gain.value || 0);
      gain.gain.setValueAtTime(from, now);
      gain.gain.linearRampToValueAtTime(value, now + fade);
    } else {
      gain.gain.setValueAtTime(value, now);
    }
  };

  /* play() is called in the same turn as the gesture. The first note starts
     at full gain; only later pieces crossfade. */
  Music.prototype._playHot = function (fadeIn) {
    const el = this.els[this.hot];
    const track = this.track;
    if (!el || !track) return;
    el.muted = false;
    el.volume = this.graph ? 1 : (this.muted ? 0 : this.volume);
    el.loop = true;
    this._assign(el, track.url);
    const self = this;
    const playP = el.play();
    if (playP && playP.catch) {
      playP.catch(function (err) {
        if (err && err.name === 'NotAllowedError') return;
        self._failed(el);
      });
    }
    if (this.graph) this._setGain(this.hot, 1, fadeIn ? 1.6 : 0);
  };

  Music.prototype.start = function () {
    if (!this.tracks.length) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!this.ctx && AC) {
      try { this.ctx = new AC(); } catch (e) { this.lastError = String(e && e.message || e); }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.corsOk === true) this._attach();
    this._output();
    this._playHot(false);
  };

  Music.prototype.next = function () {
    if (!this.tracks.length) return;
    const prev = this.hot;
    this._orderPick(false);
    this._probe(this.track.url);
    if (!this.unlocked) {
      this._assign(this.els[0], this.track.url);
      return;
    }
    const incoming = prev === 0 ? 1 : 0;
    this.hot = incoming;
    this._playHot(this.graph);
    if (this.graph) {
      this._setGain(prev, 0, 1.6);
      this.fadeOld = prev;
      this.fadeAt = this.ctx.currentTime + 1.7;
    } else {
      try { this.els[prev].pause(); } catch (e) { /* ignore */ }
    }
  };

  Music.prototype.tick = function () {
    if (this.unlocked && this.corsOk === true && !this.graph && this.ctx) {
      this._attach();
      this._output();
      this._setGain(this.hot, 1, 0);
      const el = this.els[this.hot];
      if (el) { el.muted = false; el.volume = 1; }
    }
    if (this.graph && this.fadeOld >= 0 && this.ctx && this.ctx.currentTime >= this.fadeAt) {
      try { this.els[this.fadeOld].pause(); } catch (e) { /* ignore */ }
      this.fadeOld = -1;
    }
    if (this.graph && this.gains[this.hot]) {
      const g = this.gains[this.hot].gain;
      if (this.unlocked && g.value < 0.5 && (!this.ctx || this.ctx.currentTime > 0.4)) {
        g.cancelScheduledValues(this.ctx.currentTime);
        g.setValueAtTime(1, this.ctx.currentTime);
      }
    }
  };

  Music.prototype.sum = function () {
    if (!this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.freq);
    let s = 0;
    for (let i = 0; i < this.freq.length; i++) s += this.freq[i];
    return s;
  };

  Music.prototype.level = function () {
    const n = this.sum();
    if (!this.freq || !this.freq.length) return 0;
    return Math.min(1, n / (this.freq.length * 42));
  };

  Music.prototype.element = function () {
    return this.els[this.hot] || null;
  };

  Music.prototype.outputGain = function () {
    if (this.muted) return 0;
    if (this.graph && this.master) return this.master.gain.value;
    const el = this.element();
    return el ? el.volume : this.volume;
  };

  Music.prototype.line = function () {
    const t = this.track;
    if (!t) return '';
    return t.composer + ' · ' + t.piece + ' · ' + t.performer + ' · ' + t.license;
  };

  root.RelaxMusic = Music;
  root.RelaxTracks = TRACKS;
})(window);
