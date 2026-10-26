/* BY DAWN'S EARLY LIGHT — cockpit.js: the bomber set piece.
   A wing beyond the fail-safe line with a damaged radio. Fly low through the valleys to stay off radar,
   beat missiles with decoy flares timed late, climb into a brief relay window to receive traffic,
   then decide: is the recall genuine? (Compare each message's authenticator with the card.) */
import * as THREE from '../vendor/three/three.module.min.js';
import { terrainH, valleyX } from './render.js';

export class Cockpit {
  constructor(stage, audio, el, opt, onDone) {
    this.s = stage; this.A = audio; this.el = el; this.o = opt; this.done = onDone; this.t = 0; this.over = false;
    this.pos = new THREE.Vector3(valleyX(0), 0, 0); this.pos.y = terrainH(this.pos.x, 0) + 120; this.vx = 0; this.vy = 0; this.speed = 250; this.yaw = 0; this.roll = 0; this.pitch = 0;
    this.detect = 0; this.hits = 0; this.missiles = []; this.flares = []; this.fcd = 0; this.relay = 0; this.relayWin = null; this.windows = [[16, 38], [44, 62]]; this.msg = null; this.decision = false;
    this.input = { x: 0, y: 0 }; this.camPos = this.pos.clone().add(new THREE.Vector3(0, 30, 120)); this.log = [];
    const card = (opt.card || 'ALPHA 7').toUpperCase(); const fake = card.replace(/\d/, d => String((+d + 3) % 10)).replace(/[A-Z]+/, w => (w === 'ALPHA' ? 'ECHO' : 'ALPHA'));
    this.msgs = [{ k: 'recall', text: 'RECALL. ' + opt.name + ' RETURN TO BASE. DO NOT PROCEED.', code: card }, { k: 'proceed', text: 'DISREGARD ALL RECALLS. ' + opt.name + ' PROCEED TO TARGET.', code: fake }];
    if (opt.spoofFirst ?? Math.random() < 0.5) this.msgs.reverse();
    this.say('01:00 · ' + opt.name + ' is past the fail-safe line with a damaged radio. Stay low — under 150 m — to stay off their radar.', 'info');
    this.A && this.A.setMode('cockpit');
    this.paint();
  }
  say(text, lvl) { this.el.prompt.textContent = text; this.el.prompt.className = 'cp-prompt ' + (lvl || ''); this.log.push(text); }
  flare() { if (this.over || this.decision || this.fcd > 0) return; this.fcd = 1.1; this.A && this.A.S.flare(); const p = this.pos.clone(); for (let i = 0; i < 4; i++) this.flares.push({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, -5, 20)), v: new THREE.Vector3((Math.random() - 0.5) * 60, -30, 150 + Math.random() * 50), t: 0 });
    let beat = false; for (const m of this.missiles) if (!m.dead && m.tti < 1.7) { m.dead = true; m.decoy = true; beat = true; }
    if (beat) this.say('Decoy taken. Missile defeated.', 'good'); else if (this.missiles.some(m => !m.dead)) this.say('Too early — the seeker ignores it. Wait until it is close.', 'warn'); }
  choose(k) { if (!this.decision || this.over) return; const res = k === 'turn' ? 'turned' : k === 'hold' ? 'held' : 'continued'; this.finish(res); }
  finish(res) { if (this.over) return; this.over = true; this.result = res; this.A && this.A.warn(false); this.el.dec.hidden = true; this.done && this.done(res, this); }
  update(dt, input) {
    if (this.over) return; const s = this.s; this.t += dt; const t = this.t;
    if (!this.decision) {
      // flight
      this.vx += ((input.x || 0) * 190 - this.vx) * (1 - Math.exp(-dt * 2.5)); this.vy += ((input.y || 0) * 110 - this.vy) * (1 - Math.exp(-dt * 3));
      this.pos.z -= this.speed * dt; this.pos.x += this.vx * dt; const g = terrainH(this.pos.x, this.pos.z);
      this.pos.y = Math.max(g + 12, this.pos.y + this.vy * dt); this.pos.y = Math.min(this.pos.y, g + 1400);
      // gentle valley-hugging assist so touch players can fly it
      if (!input.x) this.pos.x += (valleyX(this.pos.z - 600) - this.pos.x) * dt * 0.35;
      const agl = this.agl = this.pos.y - g, ahead = terrainH(this.pos.x, this.pos.z - 500);
      if (agl < 22 || ahead > this.pos.y + 15 && agl < 60) { this.pos.y = Math.max(this.pos.y, ahead + 40); if (agl < 16) { this.impact('ground'); this.pos.y = g + 90; } }
      this.roll += (-this.vx / 190 * 0.7 - this.roll) * (1 - Math.exp(-dt * 3)); this.pitch += (this.vy / 110 * 0.25 - this.pitch) * (1 - Math.exp(-dt * 3));
      // radar
      const rate = agl > 150 ? (agl - 150) / 150 * 30 + 6 : -14; this.detect = Math.max(0, Math.min(100, this.detect + rate * dt * (this.o.hard || 1)));
      if (this.detect >= 100 && this.missiles.filter(m => !m.dead).length < 2) { this.detect = 35; this.launchMissile(); }
      if (t > 8 && t < 9 && !this.m1) { this.m1 = 1; this.launchMissile(); this.say('MISSILE LAUNCH. Wait for it — FLARE when the tone is fast and it is close.', 'warn'); }
      for (const m of this.missiles) { if (m.dead) continue; m.tti -= dt; if (m.tti <= 0) { m.dead = true; this.impact('missile'); } }
      if (!this.missiles.some(m => !m.dead)) this.A && this.A.warn(false); else this.A && this.A.warn(true);
      // relay windows
      const w = this.windows.find(w => t >= w[0] && t < w[1]);
      if (w && !this.msg) { if (this.relayWin !== w) { this.relayWin = w; this.say('RELAY WINDOW OPEN — climb above 600 m and hold for 6 s to receive traffic. They will see you up there.', 'warn'); this.A && this.A.S.static(1); }
        if (agl > 600) { this.relay += dt; this.A && Math.random() < dt * 4 && this.A.S.static(0.15); } if (this.relay >= 6) { this.msg = true; this.say('Traffic received. Two messages. Get low and compare them with the card.', 'good'); this.A && this.A.S.teletype(10); this.decAt = t + 4; } }
      if (!w && this.relayWin && !this.msg) { this.relayWin = null; this.relay = 0; this.say(t > 62 ? 'The relay window closed. With no word, the crew presses on.' : 'Window closed. Nothing received. Another pass in a few seconds.', 'bad'); if (t > 62) return this.finish('continued'); }
      if (this.msg && t > this.decAt && this.agl < 400) this.openDecision();
      if (this.msg && t > this.decAt + 12) this.openDecision();
    }
    this.fcd = Math.max(0, this.fcd - dt);
    // render
    const p = this.pos, yaw = Math.atan2(-this.vx, this.speed); s.place('b1', p, yaw, this.pitch, this.roll); s.hidePlanes(); s.place('b1', p, yaw, this.pitch, this.roll);
    const want = p.clone().add(new THREE.Vector3(Math.sin(yaw) * 95, 24 + this.pitch * 30, Math.cos(yaw) * 95)); this.camPos.lerp(want, 1 - Math.exp(-dt * 4));
    s.skyCam = { pos: this.camPos, look: p.clone().add(new THREE.Vector3(-Math.sin(yaw) * 220, 6, -Math.cos(yaw) * 220)), fov: 62, roll: this.roll * 0.35 };
    const fx = []; for (const f of this.flares) { f.t += dt; f.p.addScaledVector(f.v, dt); f.v.y -= 30 * dt; if (f.t < 3) fx.push({ p: f.p, s: 14, a: 1 - f.t / 3, c: [6, 4.5, 2.5] }); } this.flares = this.flares.filter(f => f.t < 3);
    for (const m of this.missiles) { if (m.dead && !m.decoy) continue; const k = Math.max(0, m.tti / m.T); const mp = p.clone().add(m.off.clone().multiplyScalar(k)); if (m.decoy) { m.dt2 = (m.dt2 || 0) + dt; if (m.dt2 > 1.2) continue; mp.add(new THREE.Vector3(0, -40 * m.dt2, 80 * m.dt2)); } fx.push({ p: mp, s: 10, a: 1, c: [4, 3, 2] }); fx.push({ p: mp.clone().add(m.off.clone().normalize().multiplyScalar(30)), s: 22, a: 0.35, c: [1, 0.6, 0.3] }); }
    this.fx = fx; this.paint();
  }
  launchMissile() { const T = 5.5; const side = Math.random() < 0.5 ? -1 : 1; this.missiles.push({ tti: T, T, off: new THREE.Vector3(side * 1800, 600, -3500) }); this.A && this.A.S.blip(); }
  impact(kind) { this.hits++; this.s.shake = Math.min(1.5, this.s.shake + 1); this.A && this.A.S.hit(); this.say(kind === 'ground' ? 'Terrain strike! Pull up — damage to the airframe.' : 'HIT. We have a fire in number three engine.', 'bad');
    if (this.hits >= 2) { this.say(this.o.name + ' is going down.', 'bad'); setTimeout(() => this.finish('lost'), 1200); this.decision = true; } }
  openDecision() { if (this.decision) return; this.decision = true; this.A && this.A.warn(false); const d = this.el.dec; d.hidden = false;
    this.el.msgs.innerHTML = this.msgs.map((m, i) => `<div class="cp-msg"><b>MESSAGE ${i + 1}</b><span>${m.text}</span><em>AUTH ${m.code}</em></div>`).join('') + `<div class="cp-card">YOUR CARD THIS HOUR: <b>${(this.o.card || '').toUpperCase()}</b></div>`;
    this.say('The crew asks for your call, Commander.', 'info'); }
  paint() { const e = this.el; if (!e.hud) return; e.agl.textContent = Math.round(this.agl || 0) + ' m'; e.aglBar.style.height = Math.min(100, (this.agl || 0) / 8) + '%'; e.aglBar.className = (this.agl > 150 ? 'hot' : '');
    e.det.style.width = this.detect + '%'; e.hits.textContent = '◆'.repeat(Math.max(0, 2 - this.hits)) + '◇'.repeat(Math.min(2, this.hits)); e.relay.style.width = Math.min(100, this.relay / 6 * 100) + '%'; e.relayBox.hidden = !this.relayWin || !!this.msg;
    const m = this.missiles.find(m => !m.dead); e.mw.hidden = !m; if (m) e.mw.textContent = 'MISSILE ' + m.tti.toFixed(1) + 's' + (m.tti < 1.7 ? ' — FLARE NOW' : ''); }
}
