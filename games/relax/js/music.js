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

  function Music(rand) {
    this.rand = rand;
    this.all = TRACKS;
    this.tracks = TRACKS.filter(function (t) { return canPlay(t.url); });
    this.volume = 0.8;
    this.muted = false;
    this.unlocked = false;
    this.ctx = null;
    this.analyser = null;
    this.freq = null;
    this.master = null;
    this.slots = null;
    this.hot = 0;
    this.bag = [];
    this.bagAt = 0;
    this.index = 0;
    this.track = this.tracks[0] || null;
    this.failures = 0;
    this.lastError = '';
    this.fadeOld = null;
    this.fadeAt = 0;
    this._built = false;
    if (this.track) this._orderPick(true);
  }

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

  Music.prototype._build = function () {
    if (this._built) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error('no audio');
    const ctx = this.ctx = new AC();
    const analyser = this.analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    analyser.connect(this.master);
    this.master.connect(ctx.destination);
    const self = this;
    this.slots = [0, 1].map(function () {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.loop = true;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const src = ctx.createMediaElementSource(el);
      src.connect(gain);
      gain.connect(analyser);
      el.addEventListener('error', function () { self._failed(el); });
      return { el: el, gain: gain };
    });
    this._built = true;
  };

  Music.prototype._failed = function (el) {
    const slot = this.slots && this.slots[this.hot];
    if (!slot || slot.el !== el) return;
    this.failures++;
    this.lastError = 'load';
    if (this.failures > this.tracks.length) return;
    this._orderPick(false);
    this._playInto(this.hot, 0.4);
  };

  Music.prototype._applyMute = function () {
    if (!this.master) return;
    const v = this.muted ? 0 : this.volume;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(v, now + 0.12);
  };

  Music.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyMute();
  };

  Music.prototype.setMuted = function (m) {
    this.muted = !!m;
    this._applyMute();
  };

  Music.prototype.toggleMuted = function () {
    this.setMuted(!this.muted);
    return this.muted;
  };

  Music.prototype._playInto = function (slotIndex, fade) {
    const slot = this.slots[slotIndex];
    const track = this.track;
    if (!slot || !track) return;
    slot.el.src = track.url;
    const playP = slot.el.play();
    if (playP && playP.catch) playP.catch(function () { /* gesture or decode; error event handles decode */ });
    const now = this.ctx.currentTime;
    const dur = fade;
    slot.gain.gain.cancelScheduledValues(now);
    slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
    slot.gain.gain.linearRampToValueAtTime(1, now + dur);
  };

  /* Call from the user-gesture turn. play() is invoked synchronously. */
  Music.prototype.start = function () {
    if (!this.tracks.length) return;
    try { this._build(); } catch (e) { this.lastError = String(e && e.message || e); return; }
    if (this.ctx.state === 'suspended') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
    if (!this.unlocked) {
      this.unlocked = true;
      this.hot = 0;
      this._playInto(0, 1.1);
      this.slots[1].gain.gain.value = 0;
    }
  };

  Music.prototype.next = function () {
    if (!this.tracks.length) return;
    this._orderPick(false);
    if (!this.unlocked) return;
    const incoming = this.hot === 0 ? 1 : 0;
    const outgoing = this.hot;
    this.hot = incoming;
    this._playInto(incoming, 2.2);
    const old = this.slots[outgoing];
    const now = this.ctx.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + 2.2);
    this.fadeOld = old;
    this.fadeAt = now + 2.25;
  };

  Music.prototype.tick = function () {
    if (this.fadeOld && this.ctx && this.ctx.currentTime >= this.fadeAt) {
      try { this.fadeOld.el.pause(); } catch (e) { /* ignore */ }
      this.fadeOld = null;
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
    return this.slots && this.slots[this.hot] ? this.slots[this.hot].el : null;
  };

  Music.prototype.line = function () {
    const t = this.track;
    if (!t) return 'Music unavailable in this browser';
    if (!this.unlocked) return 'Tap or press a key for music';
    return t.composer + ' · ' + t.piece + ' · ' + t.performer + ' · ' + t.license;
  };

  root.RelaxMusic = Music;
  root.RelaxTracks = TRACKS;
})(window);
