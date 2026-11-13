/* A short journey with Cletus and Placy.
   Steer to float. Space is the stroke, the kick, the hug, the hold, the no.
   Enter is Placy helping. The paintings breathe behind you.
   No swimming heads and no vein-tips: the player is a round bowl and a face. */
(function (root) {
  'use strict';

  const ORDER = ['meet', 'kick', 'hug', 'hang', 'wash', 'jello', 'curtains', 'save', 'relay'];
  const LINES = {
    meet: 'She is right there.',
    kick: 'When it rises, kick.',
    hug: 'Squeeze when she squeezes.',
    hang: 'Hold on.',
    wash: 'Let it wash over you.',
    jello: 'Softly.',
    curtains: 'This is your entrance.',
    save: 'She stays.',
    relay: 'Placy lives on.'
  };
  const HOW = {
    meet: 'Float to Placy and stay close to her.',
    kick: 'Tap ● when the ring glows.',
    hug: 'Tap ● when Placy squeezes.',
    hang: 'Press and HOLD ● until the ring fills.',
    wash: 'Stay inside the glowing current.',
    jello: 'Drag UP gently to push through.',
    curtains: 'Float to the center, then tap ●.',
    save: 'Tap ● with the heartbeat to keep Placy with you.',
    relay: 'Follow the glowing light.'
  };
  /* A full journey is about two or three minutes: each stage asks for
     roughly ten to twenty seconds. The fast flag is only for tests. */
  const PLAY = {
    meetLegs: 2,
    meetStay: 4,
    meetRadius: 0.16,
    kick: 3,
    hug: 3,
    beat: 1.9,
    hugBeat: 2.05,
    window: 0.34,
    hang: 12,
    wash: 14,
    jello: 12,
    curtains: 6,
    save: 3,
    saveBeat: 2.1,
    relay: 14,
    stuck: 10
  };

  function Journey(stage, opts) {
    this.stage = stage;
    this.fast = !!(opts && opts.fast);
    this.onEnd = (opts && opts.onEnd) || function () {};
    this.onLine = (opts && opts.onLine) || function () {};
    this.onCoach = (opts && opts.onCoach) || function () {};
    this.onHelp = (opts && opts.onHelp) || function () {};
    this.active = false;
    this.paused = false;
    this.stageId = 'meet';
    this.player = { x: 0.42, y: 0.62, vx: 0, vy: 0 };
    this.held = {};
    this.steer = { x: 0, y: 0 };
    this.pointer = null;
    this.ripples = [];
    this.bubbles = [];
    this.t = 0;
    this.stageT = 0;
    this.kicks = 0;
    this.hugs = 0;
    this.saves = 0;
    this.met = 0;
    this.actions = 0;
    this.specials = 0;
    this.help = 0;
    this.stroke = 0;
    this.fox = { x: 0.62, y: 0.5 };
    this.leg = 0;
    this.near = 0;
    this.holdMeter = 0;
    this.wash = 0;
    this.jello = 0;
    this.relay = 0;
    this.art = 'sb01';
    this.mood = 'calm';
    this.globe = 0;
    this.curtain = 1;
    this._aim = null;
  }

  Journey.prototype.start = function () {
    this.active = true;
    this.paused = false;
    this._advancing = false;
    this.helping = false;
    this._still = 0;
    this._mark = 0;
    this.cueOpen = false;
    this.stageId = 'meet';
    this.t = 0;
    this.stageT = 0;
    this.kicks = this.hugs = this.saves = this.met = this.actions = this.specials = 0;
    this.help = 0;
    this.stroke = 0;
    this.leg = 0;
    this.near = 0;
    this.holdMeter = 0;
    this.wash = this.jello = this.relay = 0;
    this.ripples = [];
    this.held = {};
    this.player.x = this.fast ? 0.34 : 0.46;
    this.player.y = 0.62;
    this.player.vx = this.player.vy = 0;
    this.fox.x = this.fast ? 0.5 : 0.18;
    this.fox.y = this.fast ? 0.55 : 0.24;
    this._seedBubbles();
    this._enter('meet');
  };

  Journey.prototype.stop = function () {
    this.active = false;
    this.paused = false;
    if (this.stage && this.stage.canvas) this.stage.canvas.style.transform = '';
  };

  Journey.prototype.key = function (code, down) {
    this.held[code] = down;
    if (!down || this.paused) return;
    if (code === 'Space') this.action();
    else if (code === 'Enter') this.special();
  };

  Journey.prototype.action = function () {
    if (!this.active || this.paused) return;
    this.actions++;
    this.stroke = this.fast ? 0.34 : 0.2;
    this._ripple(this.player.x, this.player.y, 1);
    if (this.stageId === 'kick' || this.stageId === 'hug') this._beat();
    else if (this.stageId === 'curtains') this._burst();
    else if (this.stageId === 'save') this._beat();
  };

  Journey.prototype.special = function () {
    if (!this.active || this.paused) return;
    this.specials++;
    this.help = this.fast ? 0.8 : 1.8;
    this._ripple(this.player.x, this.player.y, 1.4);
    if (this.stageId === 'kick' || this.stageId === 'hug' || this.stageId === 'save') this._beat(true);
    if (this.stageId === 'curtains') this._burst();
  };

  Journey.prototype._enter = function (id) {
    this.stageId = id;
    this.stageT = 0;
    this.near = 0;
    const art = {
      meet: ['sb01', 'sb02', 'sb03'],
      kick: ['sb05'],
      hug: ['sb06'],
      hang: ['sb07'],
      wash: ['sb08'],
      jello: ['sb09'],
      curtains: ['sb10'],
      save: ['sb11', 'sb12', 'sb22', 'sb13'],
      relay: ['sb14', 'sb21', 'sb15']
    }[id];
    this._arts = art;
    this.art = art[0];
    this.mood = id === 'hug' || id === 'hang' ? 'squeeze' : id === 'relay' ? 'cosmos' : id === 'curtains' || id === 'save' ? 'birth' : id === 'meet' ? 'tender' : 'ride';
    this.globe = id === 'relay' ? 0.35 : 0;
    this.curtain = id === 'curtains' ? 0 : 1;
    if (id === 'kick' || id === 'hug' || id === 'save') this._clock = 0.02;
    if (id === 'wash') this.wash = 0;
    if (id === 'jello') {
      this.jello = 0;
      this.player.y = 0.78;
    }
    if (id === 'relay') this.relay = 0;
    if (id === 'hang') this.holdMeter = 0;
    this.helping = false;
    this._still = 0;
    this._mark = 0;
    this._helpLatched = false;
    this.cueOpen = false;
    this.bannerUntil = this.t + (this.fast ? 0.35 : 3);
    this.onHelp(false);
    this.onCoach(HOW[id] || '', LINES[id] || '');
    this.onLine(LINES[id] || '');
    this._apply();
  };

  Journey.prototype._pose = function () {
    const stagePose = { curtains: 'delivery', save: 'holding-baby', relay: 'waving' }[this.stageId];
    if (stagePose) return stagePose;
    return window.PlacentaStage.poseFor(this.art, null);
  };

  Journey.prototype._apply = function () {
    this.stage.set({
      art: this.art,
      doctor: 0.55,
      doctorPose: this._pose(),
      globe: this.globe,
      curtain: this.curtain,
      mood: this.mood,
      fast: this.fast
    });
  };

  Journey.prototype._goals = function () {
    if (this.fast) return [{ x: 0.52, y: 0.56 }, { x: 0.66, y: 0.5 }, { x: 0.8, y: 0.56 }];
    return [{ x: 0.62, y: 0.48 }, { x: 0.38, y: 0.4 }];
  };

  Journey.prototype._steerVec = function () {
    let x = 0;
    let y = 0;
    if (this.held.ArrowLeft || this.held.KeyA) x -= 1;
    if (this.held.ArrowRight || this.held.KeyD) x += 1;
    if (this.held.ArrowUp || this.held.KeyW) y -= 1;
    if (this.held.ArrowDown || this.held.KeyS) y += 1;
    if (this.pointer) {
      const dx = this.pointer.x - this.player.x;
      const dy = this.pointer.y - this.player.y;
      const m = Math.hypot(dx, dy);
      if (m > 0.02) { x += dx / m; y += dy / m; }
    }
    if (this._aim) { x += this._aim.x; y += this._aim.y; }
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    return { x: x, y: y };
  };

  Journey.prototype.tick = function (dt) {
    if (!this.active || this.paused) return;
    dt = Math.min(0.05, dt);
    this.t += dt;
    this.stageT += dt;
    if (this.help > 0) this.help -= dt;
    if (this.helping) this.help = Math.max(this.help, 0.45);
    this._readPad();
    this.steer = this._steerVec();
    this._integrate(dt);
    this._ripples(dt);
    if (this.stageId === 'meet') this._tickMeet(dt);
    else if (this.stageId === 'kick') this._tickBeat(dt, 'kicks', this.fast ? 2 : PLAY.kick, this.fast ? 0.42 : PLAY.beat);
    else if (this.stageId === 'hug') this._tickBeat(dt, 'hugs', this.fast ? 2 : PLAY.hug, this.fast ? 0.42 : PLAY.hugBeat);
    else if (this.stageId === 'hang') this._tickHang(dt);
    else if (this.stageId === 'wash') this._tickWash(dt);
    else if (this.stageId === 'jello') this._tickJello(dt);
    else if (this.stageId === 'curtains') this._tickCurtains(dt);
    else if (this.stageId === 'save') this._tickSave(dt);
    else if (this.stageId === 'relay') this._tickRelay(dt);
    this._assistBeat();
    this._noteProgress(dt);
    this.cueOpen = this._windowOpen();
    this._shake();
  };

  Journey.prototype._windowOpen = function () {
    if (this.stageId === 'kick' || this.stageId === 'hug' || this.stageId === 'save') return this._onWindow(false);
    if (this.stageId === 'hang') return this.holdMeter < 1;
    if (this.stageId === 'curtains') {
      const centered = Math.hypot(this.player.x - 0.5, this.player.y - 0.55) < 0.22;
      return this.curtain > 0.7 && centered;
    }
    return false;
  };

  Journey.prototype._noteProgress = function (dt) {
    const p = this.inner();
    if (p > this._mark + 0.012) {
      this._mark = p;
      this._still = 0;
    } else {
      this._still += dt;
    }
    const wait = this.fast ? 30 : PLAY.stuck;
    if (!this.helping && this._still >= wait) {
      this.helping = true;
      this.help = Math.max(this.help, 0.45);
      this.onHelp(true);
    }
  };

  Journey.prototype._assistBeat = function () {
    if (!this.helping) return;
    if (this.stageId !== 'kick' && this.stageId !== 'hug' && this.stageId !== 'save') return;
    const open = this._onWindow(true);
    if (open && !this._helpLatched) {
      this._helpLatched = true;
      this._beat(true);
    }
    if (!open) this._helpLatched = false;
  };

  Journey.prototype._integrate = function (dt) {
    const p = this.player;
    let accel = this.fast ? 1.5 : 0.9;
    if (this.stageId === 'jello') accel *= 0.72;
    const drag = this.stageId === 'jello' ? (this.fast ? 1.1 : 1.35) : (this.fast ? 1.7 : 2.5);
    p.vx += this.steer.x * accel * dt;
    p.vy += this.steer.y * accel * dt;
    if (this.stroke) {
      const sx = this.steer.x;
      const sy = this.steer.y;
      const m = Math.hypot(sx, sy);
      const ix = m > 0.15 ? sx / m : 0;
      const iy = m > 0.15 ? sy / m : -0.65;
      p.vx += ix * this.stroke;
      p.vy += iy * this.stroke;
      this.stroke = 0;
    }
    if ((this.help > 0 || this.helping) && this.stageId === 'meet') {
      const goals = this._goals();
      const g = goals[Math.min(this.leg, goals.length - 1)];
      p.vx += (g.x - p.x) * dt * 2.2;
      p.vy += (g.y - p.y) * dt * 2.2;
    }
    if (this.helping && this.stageId === 'curtains') {
      p.vx += (0.5 - p.x) * dt * 2.4;
      p.vy += (0.55 - p.y) * dt * 2.4;
    }
    if (this.helping && this.stageId === 'wash' && typeof this._lane === 'number') {
      p.vx += (this._lane - p.x) * dt * 3;
    }
    if (this.helping && this.stageId === 'jello') p.vy -= dt * 0.9;
    if (this.helping && this.stageId === 'relay' && this.mote) {
      p.vx += (this.mote.x - p.x) * dt * 2.4;
      p.vy += (this.mote.y - p.y) * dt * 2.4;
    }
    if (this.stageId === 'jello') {
      p.vx += Math.sin(this.t * 2.1) * dt * 0.55;
      p.vy += Math.cos(this.t * 1.7) * dt * 0.35;
    }
    const damp = Math.exp(-drag * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(0.06, Math.min(0.94, p.x));
    p.y = Math.max(0.08, Math.min(0.9, p.y));
  };

  Journey.prototype._tickMeet = function (dt) {
    const goals = this._goals();
    const g = goals[Math.min(this.leg, goals.length - 1)];
    const ease = 1 - Math.exp(-dt * (this.fast ? 4 : 1.3));
    this.fox.x += (g.x - this.fox.x) * ease;
    this.fox.y += (g.y - this.fox.y) * ease;
    const d = Math.hypot(this.player.x - this.fox.x, this.player.y - this.fox.y);
    const radius = this.fast ? 0.22 : PLAY.meetRadius;
    const together = this.fast ? 0.05 : PLAY.meetStay;
    if (d < radius) this.near += dt;
    else this.near = Math.max(0, this.near - dt * 0.35);
    this.art = this._arts[Math.min(this.leg, this._arts.length - 1)];
    this._apply();
    if (this.near >= together) {
      this.leg++;
      this.near = 0;
      this.met = this.leg;
      this._ripple(this.fox.x, this.fox.y, 1.6);
      if (this.leg >= goals.length) this._advance();
    }
  };

  Journey.prototype._tickBeat = function (dt, field, need, period) {
    this._clock = (this._clock || 0) + dt;
    this.art = this._arts[0];
    this.mood = this.stageId === 'hug' ? 'squeeze' : 'ride';
    this._apply();
    if (this[field] >= need) this._advance();
    this._period = period;
  };

  Journey.prototype._onWindow = function (wide) {
    const period = this._period || (this.fast ? 0.42 : 2.2);
    const p = ((this._clock || 0) % period) / period;
    const w = (this.fast ? 0.46 : PLAY.window) * (wide ? 1.4 : 1);
    return p < w || p > 1 - w * 0.25;
  };

  Journey.prototype._beat = function (wide) {
    if (this.stageId === 'kick' && this._onWindow(wide)) {
      this.kicks++;
      this._ripple(this.player.x, this.player.y, 1.8);
    } else if (this.stageId === 'hug' && this._onWindow(wide)) {
      this.hugs++;
      this._ripple(0.5, 0.55, 2.2);
    } else if (this.stageId === 'save' && this._onWindow(wide)) {
      this._saveHit();
    }
  };

  Journey.prototype._tickHang = function (dt) {
    const need = this.fast ? 1.15 : PLAY.hang;
    const holding = !!(this.held.Space || this.padHold || this.buttonHold || this.help > 0);
    if (holding) this.holdMeter += dt / need;
    else this.holdMeter -= dt * (this.fast ? 0.2 : 0.28);
    this.holdMeter = Math.max(0, Math.min(1, this.holdMeter));
    this.art = 'sb07';
    this.mood = 'squeeze';
    this._apply();
    if (this.holdMeter >= 1) this._advance();
  };

  Journey.prototype._tickWash = function (dt) {
    const need = this.fast ? 2.1 : PLAY.wash;
    const lane = 0.5 + Math.sin(this.t * 0.7) * (this.fast ? 0.12 : 0.1);
    this._lane = lane;
    const off = Math.abs(this.player.x - lane);
    const inside = off < (this.fast ? 0.2 : 0.2);
    if (inside || this.helping) this.wash += dt / need;
    if (!inside) this.player.vx += (lane - this.player.x) * dt * 1.3;
    this.art = 'sb08';
    this._apply();
    if (this.wash >= 1) this._advance();
  };

  Journey.prototype._tickJello = function (dt) {
    const need = this.fast ? 2.1 : PLAY.jello;
    const pushing = this.steer.y < -0.15 || this.player.vy < -0.02 || this.help > 0 || this.helping;
    if (pushing) this.jello += dt / need * (this.helping ? 1.2 : 1);
    this.art = 'sb09';
    this.mood = 'ride';
    this._apply();
    if (this.jello >= 1) this._advance();
  };

  Journey.prototype._tickCurtains = function (dt) {
    const openFor = this.fast ? 1.1 : PLAY.curtains;
    this.curtain = Math.min(1, this.stageT / openFor);
    this.art = 'sb10';
    this.mood = 'birth';
    this._apply();
    const centered = Math.hypot(this.player.x - 0.5, this.player.y - 0.55) < (this.fast ? 0.45 : (this.helping ? 0.28 : 0.2));
    const ready = this.curtain > (this.fast ? 0.92 : 0.72);
    if (ready && centered && (this._burstWant || this.helping || (this.fast && this.stageT > 1.3))) this._advance();
  };

  Journey.prototype._burst = function () {
    this._burstWant = true;
    this._ripple(0.5, 0.5, 2.4);
  };

  Journey.prototype._tickSave = function (dt) {
    this._clock = (this._clock || 0) + dt;
    const need = this.fast ? 2 : PLAY.save;
    const step = Math.min(need - 1, this.saves);
    this.art = this._arts[Math.min(step, this._arts.length - 1)];
    this.mood = this.saves >= need - 1 ? 'farewell' : 'birth';
    this.doctorFeel = this.art === 'sb11' ? 0.28 : 0.55;
    this.stage.set({
      art: this.art,
      doctor: 0.55,
      doctorPose: 'holding-baby',
      globe: 0,
      curtain: 1,
      mood: this.mood,
      fast: this.fast
    });
    this._period = this.fast ? 0.4 : PLAY.saveBeat;
    if (this.saves >= need) this._advance();
  };

  Journey.prototype._saveHit = function () {
    this.saves++;
    this._ripple(0.62, 0.58, 2);
  };

  Journey.prototype._tickRelay = function (dt) {
    const need = this.fast ? 1.5 : PLAY.relay;
    const ang = this.stageT / need * Math.PI * 2;
    this.mote = { x: 0.5 + Math.cos(ang) * 0.18, y: 0.48 + Math.sin(ang) * 0.12 };
    const d = Math.hypot(this.player.x - this.mote.x, this.player.y - this.mote.y);
    if (d < (this.fast ? 0.2 : 0.18) || this.help > 0 || this.helping) this.relay += dt / need;
    const u = Math.min(1, this.relay);
    this.art = u < 0.45 ? 'sb14' : u < 0.8 ? 'sb21' : 'sb15';
    this.globe = 0.4 + u * 0.6;
    this.mood = 'cosmos';
    this._apply();
    if (this.relay >= 1) this._advance();
  };

  Journey.prototype._advance = function () {
    if (this._advancing) return;
    const i = ORDER.indexOf(this.stageId);
    if (i < 0 || i >= ORDER.length - 1) {
      this._advancing = true;
      this.active = false;
      this.onEnd();
      return;
    }
    this._burstWant = false;
    this._enter(ORDER[i + 1]);
  };

  Journey.prototype._ripple = function (x, y, s) {
    this.ripples.push({ x: x, y: y, r: 0.01, s: s || 1, a: 0.45 });
    if (this.ripples.length > 16) this.ripples.shift();
  };

  Journey.prototype._ripples = function (dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += dt * 0.18 * r.s;
      r.a -= dt * 0.35;
      if (r.a <= 0) this.ripples.splice(i, 1);
    }
  };

  Journey.prototype._seedBubbles = function () {
    this.bubbles = [];
    for (let i = 0; i < 14; i++) {
      this.bubbles.push({
        x: 0.15 + ((i * 0.17) % 0.7),
        y: (i * 0.13) % 1,
        r: 0.012 + (i % 5) * 0.004
      });
    }
  };

  Journey.prototype._readPad = function () {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (let i = 0; i < (pads ? pads.length : 0); i++) if (pads[i] && pads[i].connected) pad = pads[i];
    this._aim = null;
    if (!pad) return;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.22) this._aim = { x: ax, y: ay };
    const a = !!(pad.buttons[0] && pad.buttons[0].pressed);
    const x = !!(pad.buttons[2] && pad.buttons[2].pressed);
    if (a && !this._padA) this.action();
    if (x && !this._padX) this.special();
    this._padA = a;
    this._padX = x;
    this.padHold = a;
  };

  Journey.prototype._shake = function () {
    const c = this.stage.canvas;
    if (!c) return;
    if (this.stageId !== 'hang') { c.style.transform = ''; return; }
    const m = this.stage.reduced ? 0 : Math.min(2.2, 0.6 + this.stageT * 0.08);
    const x = Math.sin(this.t * 23) * m;
    const y = Math.cos(this.t * 19) * m * 0.6;
    c.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
  };

  Journey.prototype.pointerDown = function (nx, ny) {
    this._down = { x: nx, y: ny, t: this.t };
    this.pointer = { x: nx, y: ny };
  };

  Journey.prototype.pointerMove = function (nx, ny) {
    if (!this._down) return;
    this.pointer = { x: nx, y: ny };
  };

  Journey.prototype.pointerUp = function (nx, ny) {
    if (!this._down) return;
    const d = Math.hypot(nx - this._down.x, ny - this._down.y);
    this.pointer = null;
    this._down = null;
    if (d < 0.03) this.action();
  };

  Journey.prototype.draw = function (ctx) {
    if (!this.active) return;
    const w = this.stage.w;
    const h = this.stage.h;
    const calm = this.stage.reduced ? 0.25 : 1;
    const breathe = 1 + Math.sin(this.t * 1.6) * 0.03 * calm;
    const bob = Math.sin(this.t * 1.25) * h * 0.012 * calm;
    if (this.stageId === 'wash') {
      this._drawCurrent(ctx, w, h);
      this._drawBubbles(ctx, w, h);
    }
    if (this.stageId === 'jello') this._drawLight(ctx, w, h);
    if (this.stageId === 'relay' && this.mote) this._drawMote(ctx, w, h);
    if (this.stageId === 'meet') this._drawGoal(ctx, w, h);
    for (let i = 0; i < this.ripples.length; i++) {
      const r = this.ripples[i];
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(240,183,198,' + r.a + ')';
      ctx.lineWidth = 2;
      ctx.arc(r.x * w, r.y * h, r.r * Math.min(w, h), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.stageId === 'kick' || this.stageId === 'hug' || this.stageId === 'save') this._drawBeat(ctx, w, h);
    const cx = this.player.x * w;
    const cy = this.player.y * h + bob;
    this._drawProgress(ctx, cx, cy, Math.min(w, h));
    this._drawCletus(ctx, cx, cy, Math.min(w, h) * 0.045 * breathe);
  };

  Journey.prototype._drawProgress = function (ctx, x, y, span) {
    const u = Math.max(0, Math.min(1, this.inner()));
    const rad = span * 0.07;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 236, 244, 0.28)';
    ctx.lineWidth = 3;
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
    if (u > 0.01) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(232, 120, 150, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
      ctx.stroke();
    }
    if (this.cueOpen) {
      const pulse = 0.5 + Math.sin(this.t * (this.stage.reduced ? 2 : 6)) * 0.5;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 214, 226,' + (0.45 + pulse * 0.5) + ')';
      ctx.lineWidth = 3 + pulse * 2;
      ctx.arc(x, y, rad + 8 + pulse * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  Journey.prototype._drawCurrent = function (ctx, w, h) {
    const lane = typeof this._lane === 'number' ? this._lane : 0.5;
    const x = lane * w;
    const band = Math.min(w, h) * 0.16;
    const g = ctx.createLinearGradient(x - band, 0, x + band, 0);
    g.addColorStop(0, 'rgba(255, 236, 210, 0)');
    g.addColorStop(0.5, 'rgba(255, 228, 190, 0.38)');
    g.addColorStop(1, 'rgba(255, 236, 210, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - band, 0, band * 2, h);
  };

  Journey.prototype._drawGoal = function (ctx, w, h) {
    const pulse = 0.5 + Math.sin(this.t * 2.2) * 0.5;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(240, 183, 198,' + (0.35 + pulse * 0.35) + ')';
    ctx.lineWidth = 2;
    ctx.arc(this.fox.x * w, this.fox.y * h, (0.04 + pulse * 0.01) * Math.min(w, h), 0, Math.PI * 2);
    ctx.stroke();
  };

  Journey.prototype._drawBeat = function (ctx, w, h) {
    const period = this._period || 2.2;
    const p = ((this._clock || 0) % period) / period;
    const open = this._onWindow(false);
    const rad = (0.05 + (1 - p) * 0.1) * Math.min(w, h);
    ctx.beginPath();
    ctx.strokeStyle = open ? 'rgba(255, 236, 244, 0.95)' : 'rgba(255, 236, 244, 0.28)';
    ctx.lineWidth = open ? 4 : 2;
    ctx.arc(this.player.x * w, this.player.y * h, rad, 0, Math.PI * 2);
    ctx.stroke();
  };

  Journey.prototype._drawBubbles = function (ctx, w, h) {
    const calm = this.stage.reduced ? 0.3 : 1;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      const depth = 0.35 + (i % 5) * 0.16;
      const y = (b.y + this.t * 0.03 * depth * calm + this.wash * 0.35) % 1;
      const x = b.x + Math.sin(this.t * 0.4 * depth + i) * 0.03 * depth * calm;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + depth * 0.12) + ')';
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.arc((0.18 + x * 0.64) * w, y * h, b.r * Math.min(w, h) * (6 + depth * 4), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  };

  Journey.prototype._drawLight = function (ctx, w, h) {
    const y = h * (0.22 + (1 - Math.min(1, this.jello)) * 0.15);
    const g = ctx.createRadialGradient(w * 0.5, y, 8, w * 0.5, y, Math.min(w, h) * 0.22);
    g.addColorStop(0, 'rgba(255, 236, 210, 0.85)');
    g.addColorStop(1, 'rgba(255, 236, 210, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w * 0.5, y, Math.min(w, h) * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };

  Journey.prototype._drawMote = function (ctx, w, h) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 228, 180, 0.9)';
    ctx.arc(this.mote.x * w, this.mote.y * h, 7, 0, Math.PI * 2);
    ctx.fill();
  };

  Journey.prototype._drawCletus = function (ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(232, 140, 162, 0.92)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.55, s * 1.15, s * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6e2d4';
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 70, 80, 0.8)';
    ctx.lineWidth = Math.max(1.2, s * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-s * 0.28, -s * 0.22, s * 0.14, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.28, -s * 0.22, s * 0.14, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232, 140, 162, 0.55)';
    ctx.beginPath();
    ctx.arc(-s * 0.42, -s * 0.02, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.42, -s * 0.02, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 90, 110, 0.85)';
    ctx.beginPath();
    ctx.arc(0, s * 0.08, s * 0.16, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();
  };

  Journey.prototype.inner = function () {
    if (this.stageId === 'meet') return this.leg / (this.fast ? 3 : PLAY.meetLegs);
    if (this.stageId === 'kick') return this.kicks / (this.fast ? 2 : PLAY.kick);
    if (this.stageId === 'hug') return this.hugs / (this.fast ? 2 : PLAY.hug);
    if (this.stageId === 'hang') return this.holdMeter;
    if (this.stageId === 'wash') return this.wash;
    if (this.stageId === 'jello') return this.jello;
    if (this.stageId === 'curtains') return this.curtain;
    if (this.stageId === 'save') return this.saves / (this.fast ? 2 : PLAY.save);
    if (this.stageId === 'relay') return this.relay;
    return 0;
  };

  Journey.prototype.fraction = function () {
    const i = Math.max(0, ORDER.indexOf(this.stageId));
    return Math.max(0, Math.min(1, (i + Math.max(0, Math.min(1, this.inner()))) / ORDER.length));
  };

  root.PlacentaPlay = Journey;
})(window);
