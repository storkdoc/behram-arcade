/* GLOW MUNCH — neon board, wisps, particles, shake. */
(function (root) {
  'use strict';

  const L = () => root.GlowLogic;
  const ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  function create(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const particles = [];
    const trail = [];
    let flash = 0;
    let walls = null;
    let wallKey = '';
    let view = { tile: 16, ox: 0, oy: 0, w: 300, h: 150, dpr: 1 };
    let clock = 0;

    function layout(inset) {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const logic = L();
      const top = (inset.top || 0) + 54;
      const bottom = (inset.bottom || 0) + (inset.extraBottom == null ? 8 : inset.extraBottom);
      const left = (inset.left || 0) + (inset.extraLeft == null ? 8 : inset.extraLeft);
      const right = (inset.right || 0) + (inset.extraRight == null ? 8 : inset.extraRight);
      const availW = Math.max(40, w - left - right);
      const availH = Math.max(40, h - top - bottom);
      const tile = Math.min(availW / logic.COLS, availH / logic.ROWS);
      const boardW = tile * logic.COLS;
      const boardH = tile * logic.ROWS;
      view = {
        tile: tile,
        ox: left + (availW - boardW) / 2,
        oy: top + (availH - boardH) / 2,
        w: w,
        h: h,
        dpr: dpr,
        boardW: boardW,
        boardH: boardH
      };
      return view;
    }

    function project(tx, ty) {
      return {
        x: view.ox + (tx + 0.5) * view.tile,
        y: view.oy + (ty + 0.5) * view.tile
      };
    }
    function tileAt(px, py) {
      const logic = L();
      const x = Math.floor((px - view.ox) / view.tile);
      const y = Math.floor((py - view.oy) / view.tile);
      if (x < 0 || y < 0 || x >= logic.COLS || y >= logic.ROWS) return null;
      if (!logic.passable(x, y, null)) return null;
      return { x: x, y: y };
    }

    function buildWalls(tile, frightened) {
      const logic = L();
      const rows = logic.MAZE_ROWS;
      const pad = 48;
      const c = document.createElement('canvas');
      c.width = Math.ceil(logic.COLS * tile + pad * 2);
      c.height = Math.ceil(logic.ROWS * tile + pad * 2);
      const g = c.getContext('2d');
      g.translate(pad, pad);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const glow = frightened ? '#d7d2ff' : '#39e7ff';
      const core = frightened ? '#fff6d8' : '#f3fdff';
      function trace() {
        g.beginPath();
        for (let y = 0; y < rows.length; y++) {
          for (let x = 0; x < logic.COLS; x++) {
            if (rows[y][x] !== '#') continue;
            const cx = (x + 0.5) * tile;
            const cy = (y + 0.5) * tile;
            if (x + 1 < logic.COLS && rows[y][x + 1] === '#') {
              g.moveTo(cx, cy);
              g.lineTo(cx + tile, cy);
            }
            if (y + 1 < rows.length && rows[y + 1][x] === '#') {
              g.moveTo(cx, cy);
              g.lineTo(cx, cy + tile);
            }
          }
        }
      }
      g.strokeStyle = glow;
      g.shadowColor = glow;
      g.shadowBlur = Math.max(8, tile * 0.95);
      g.lineWidth = Math.max(2, tile * 0.42);
      trace();
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = core;
      g.globalAlpha = 0.95;
      g.lineWidth = Math.max(1, tile * 0.11);
      trace();
      g.stroke();
      g.globalAlpha = 1;
      walls = { canvas: c, pad: pad, frightened: frightened, tile: tile };
      wallKey = tile.toFixed(2) + (frightened ? 'F' : 'N');
    }

    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.4 + Math.random()) * (speed || 6);
        particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0.35 + Math.random() * 0.4,
          max: 0.75,
          color: color,
          size: 0.08 + Math.random() * 0.12
        });
      }
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    }

    function spark(game) {
      (game.pops || []).forEach(pop => {
        if (pop.sparked) return;
        pop.sparked = true;
        if (pop.kind === 'dot') burst(pop.x, pop.y, '#ffe7a0', 4, 3);
        else if (pop.kind === 'power') { burst(pop.x, pop.y, '#ffffff', 18, 7); flash = 0.28; }
        else if (pop.kind === 'chain') { burst(pop.x, pop.y, '#9af7ff', 16, 8); flash = 0.16; }
        else if (pop.kind === 'fruit') burst(pop.x, pop.y, '#ffd0f0', 14, 6);
        else if (pop.kind === 'extra') burst(pop.x, pop.y, '#ffe14a', 12, 5);
      });
      (game.events || []).forEach(ev => {
        if (ev === 'die') { burst(game.player.x, game.player.y, '#ff5a6a', 28, 9); flash = 0.4; }
        if (ev === 'dash') burst(game.player.x, game.player.y, '#fff1b0', 8, 5);
        if (ev === 'clear' || ev === 'act') flash = 0.22;
      });
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawGhost(g, x, y, r, t, frightened, left) {
      ctx.save();
      ctx.translate(x, y + Math.sin(t * 7 + g.id) * r * 0.06);
      const scared = g.mode === 'frightened';
      const eyesOnly = g.mode === 'eaten';
      if (!eyesOnly) {
        let color = g.color;
        if (scared) {
          const blink = left < 1.7 && Math.sin(t * 28) > 0;
          color = blink ? '#e9ecff' : '#2a3dff';
        }
        ctx.beginPath();
        ctx.arc(0, -r * 0.08, r * 0.78, Math.PI, 0);
        const feet = 3;
        const base = r * 0.55;
        ctx.lineTo(r * 0.78, base);
        for (let i = 0; i < feet; i++) {
          const x0 = r * 0.78 - (i * 2 * r * 0.78) / feet;
          const xm = r * 0.78 - ((i + 0.5) * 2 * r * 0.78) / feet;
          const x1 = r * 0.78 - ((i + 1) * 2 * r * 0.78) / feet;
          const dip = base + r * (0.28 + Math.sin(t * 10 + i + g.id) * 0.08);
          ctx.quadraticCurveTo(xm, dip, x1, base);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.stroke();
      }
      const look = g.dir == null ? 2 : g.dir;
      const lx = [0.16, 0, -0.16, 0][look] * r;
      const ly = [0, 0.12, 0, -0.12][look] * r;
      if (scared && !eyesOnly) {
        ctx.strokeStyle = '#d7fff8';
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.beginPath();
        ctx.moveTo(-r * 0.28, -r * 0.15);
        ctx.lineTo(-r * 0.05, r * 0.05);
        ctx.moveTo(r * 0.05, -r * 0.15);
        ctx.lineTo(r * 0.28, r * 0.05);
        ctx.stroke();
      } else {
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.fillStyle = '#f7fbff';
          ctx.arc(s * r * 0.28, -r * 0.12, r * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = '#1a1d33';
          ctx.arc(s * r * 0.28 + lx, -r * 0.12 + ly, r * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawPlayer(p, t) {
      const s = project(p.x, p.y);
      const r = view.tile * 0.46;
      const dir = p.dir == null ? 2 : p.dir;
      const mouth = p.dash > 0 ? 0.15 : 0.08 + Math.abs(Math.sin(t * 14)) * 0.7;
      if (p.dash > 0) {
        trail.push({ x: p.x, y: p.y, life: 0.28 });
        if (trail.length > 16) trail.shift();
      }
      for (let i = 0; i < trail.length; i++) {
        const tr = trail[i];
        tr.life -= 0.016;
        if (tr.life <= 0) continue;
        const ps = project(tr.x, tr.y);
        ctx.globalAlpha = tr.life * 1.4;
        ctx.fillStyle = '#ffe9a2';
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].life <= 0) trail.splice(i, 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ROT[dir]);
      ctx.fillStyle = 'rgba(255, 210, 70, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      const grd = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
      grd.addColorStop(0, '#fff6c4');
      grd.addColorStop(0.55, '#ffd24a');
      grd.addColorStop(1, '#ff8a1e');
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.restore();
      if (p.meter >= 100) {
        ctx.strokeStyle = 'rgba(255, 236, 170, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3 + Math.sin(t * 10) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.meter > 0) {
        ctx.strokeStyle = 'rgba(255, 220, 140, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.meter / 100));
        ctx.stroke();
      }
    }

    function banner(text, sub, y) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff8e8';
      ctx.font = '800 ' + Math.round(Math.min(42, view.tile * 1.7)) + 'px Avenir Next, Segoe UI, sans-serif';
      ctx.shadowColor = '#39e7ff';
      ctx.shadowBlur = 16;
      const yy = Math.round(y);
      ctx.fillText(text, Math.round(view.w / 2), yy);
      ctx.shadowBlur = 0;
      if (sub) {
        ctx.font = '600 ' + Math.round(Math.min(16, view.tile * 0.7)) + 'px Avenir Next, Segoe UI, sans-serif';
        ctx.fillStyle = '#d5f6ff';
        ctx.fillText(sub, Math.round(view.w / 2), yy + Math.round(view.tile * 1.1));
      }
      ctx.restore();
    }

    function frame(game, dt) {
      clock += dt;
      const logic = L();
      const frightened = game && game.fright > 0.2;
      const key = view.tile.toFixed(2) + (frightened ? 'F' : 'N');
      if (!walls || wallKey !== key) buildWalls(view.tile, frightened);
      spark(game);
      const shake = (game && game.shake) || 0;
      const sx = Math.sin(clock * 48) * shake * 7;
      const sy = Math.cos(clock * 41) * shake * 5;

      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const bg = ctx.createRadialGradient(view.w * 0.5, view.h * 0.45, 20, view.w * 0.5, view.h * 0.5, view.w * 0.75);
      bg.addColorStop(0, frightened ? '#1a1440' : '#141226');
      bg.addColorStop(1, '#07060f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, view.w, view.h);

      ctx.save();
      ctx.translate(sx, sy);
      roundRect(ctx, view.ox - 6, view.oy - 6, view.boardW + 12, view.boardH + 12, 16);
      ctx.fillStyle = 'rgba(6, 8, 18, 0.92)';
      ctx.fill();

      ctx.drawImage(walls.canvas, view.ox - walls.pad, view.oy - walls.pad);

      const tile = view.tile;
      const rows = logic.MAZE_ROWS;
      for (let y = 0; y < logic.ROWS; y++) {
        for (let x = 0; x < logic.COLS; x++) {
          if (rows[y][x] !== '-') continue;
          const p = project(x, y);
          ctx.strokeStyle = 'rgba(180, 255, 255, 0.85)';
          ctx.lineWidth = Math.max(2, tile * 0.12);
          ctx.beginPath();
          ctx.moveTo(p.x - tile * 0.4, p.y);
          ctx.lineTo(p.x + tile * 0.4, p.y);
          ctx.stroke();
        }
      }

      const pulse = 0.65 + Math.sin(clock * 5) * 0.35;
      game.dots.forEach(k => {
        const parts = k.split(',');
        const x = +parts[0], y = +parts[1];
        const p = project(x, y);
        if (game.powers.has(k)) {
          ctx.fillStyle = 'rgba(255, 246, 210, ' + (0.25 + pulse * 0.35) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, tile * 0.42 * (0.85 + pulse * 0.2), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff8e4';
          ctx.beginPath();
          ctx.arc(p.x, p.y, tile * 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#ffe3a0';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.4, tile * 0.09), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (game.fruit) {
        const p = project(game.fruit.x, game.fruit.y);
        const bob = Math.sin(clock * 4) * tile * 0.08;
        ctx.fillStyle = 'rgba(255, 120, 190, 0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, tile * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8ec8';
        ctx.beginPath();
        ctx.arc(p.x, p.y + bob, tile * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 ' + Math.max(8, Math.round(tile * 0.28)) + 'px Avenir Next, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.fruit.name, p.x, p.y - tile * 0.55);
      }

      game.ghosts.forEach(g => {
        const p = project(g.x, g.y);
        drawGhost(g, p.x, p.y, tile * 0.48, clock, game.fright > 0, game.fright);
      });
      if (game.phase !== 'die' && game.phase !== 'over') drawPlayer(game.player, game.travel || clock);

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.life <= 0) { particles.splice(i, 1); continue; }
        const p = project(q.x, q.y);
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, q.size * tile), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      (game.pops || []).forEach(pop => {
        if (!pop.text) return;
        const p = project(pop.x, pop.y);
        ctx.globalAlpha = Math.max(0, Math.min(1, pop.life));
        ctx.textAlign = 'center';
        const big = pop.kind === 'chain' || pop.kind === 'fruit';
        ctx.font = (big ? '800 ' : '700 ') + Math.round(tile * (big ? 0.85 : 0.48)) + 'px Avenir Next, Segoe UI, sans-serif';
        ctx.fillStyle = pop.kind === 'chain' ? '#b8fff8' : '#fff4c8';
        ctx.fillText(pop.text, p.x + 1, p.y);
        ctx.fillStyle = '#fff';
        ctx.fillText(pop.text, p.x, p.y - 1);
      });
      ctx.globalAlpha = 1;

      if (game.phase === 'ready') banner('GET SET', 'LANE ' + game.level, view.oy + view.boardH * 0.46);
      if (game.phase === 'clear') banner('LANE CLEAR', 'THE LIGHTS COME BACK', view.oy + view.boardH * 0.42);
      if (game.phase === 'act' && game.act) banner(game.act.title, game.act.line, view.oy + view.boardH * 0.4);
      if (game.phase === 'die') banner('OUCH', '', view.oy + view.boardH * 0.46);
      if (game.chain > 1 && game.fright > 0) {
        ctx.textAlign = 'center';
        ctx.font = '800 ' + Math.round(Math.min(28, tile * 1.15)) + 'px Avenir Next, Segoe UI, sans-serif';
        ctx.fillStyle = '#e9fbff';
        ctx.fillText('CHAIN x' + game.chain, Math.round(view.w / 2), Math.round(view.oy - 8));
      }

      ctx.restore();

      if (flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + flash + ')';
        ctx.fillRect(0, 0, view.w, view.h);
        flash = Math.max(0, flash - dt * 1.4);
      }
      const vig = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.35, view.w / 2, view.h / 2, view.h * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    return { layout: layout, frame: frame, project: project, tileAt: tileAt, view: () => view };
  }

  root.GlowRender = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
