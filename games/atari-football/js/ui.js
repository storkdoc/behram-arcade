/* ==========================================================================
   ATARI FOOTBALL — ui.js
   Every screen except the field itself: title menu, how-to pages, the
   "call your buddy" tape-loading homage, host / join lobbies, the playbook
   overlay, pause and game-over panels.
   All widgets register tap regions (frame-buffer coords) so every menu works
   with mouse clicks and touch taps as well as keyboard / gamepad.
   Screens read and write the global App object defined in main.js.
   ========================================================================== */
const UI = (() => {
  const hits = [];
  const beginFrame = () => { hits.length = 0; };
  const hit = (x, y, w, h, fn, label = '') => hits.push({ x, y, w, h, fn, label }); // label: for tests / debugging
  function tap(px, py) {
    for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (px >= h.x && px < h.x + h.w && py >= h.y && py < h.y + h.h) { h.fn(); return true; } }
    return false;
  }
  const RAINBOW = ['#ff5050', '#ff9a30', '#ffe048', '#60e060', '#40c0ff', '#8070ff', '#e060ff'];

  /** a framed button; sel = keyboard-highlighted */
  function button(ctx, label, x, y, w, h, sel, fn, color = '#ffffff', sc = 1) {
    Px.rect(ctx, x, y, w, h, sel ? '#3048b0' : '#0c0c24');
    Px.frame(ctx, x, y, w, h, sel ? '#ffffff' : '#5060a0');
    FONT.draw(ctx, label, x + Math.floor(w / 2), y + Math.floor((h - 7 * sc) / 2), sel ? '#ffffff' : color, sc, 'c');
    if (fn) hit(x, y, w, h, fn, label);
  }
  function panel(ctx, x, y, w, h, c = '#ffffff') { Px.rect(ctx, x, y, w, h, '#0c0c24'); Px.frame(ctx, x, y, w, h, c); Px.frame(ctx, x + 2, y + 2, w - 4, h - 4, '#3048b0'); }
  function para(ctx, text, x, y, w, color = '#ffffff', align = 'l') {
    let yy = y;
    for (const block of text.split('\n')) { for (const line of FONT.wrap(block, w)) { FONT.draw(ctx, line, align === 'c' ? x + w / 2 : x, yy, color, 1, align); yy += FONT.LINE + 1; } }
    return yy;
  }
  function stripes(ctx, t, thick = 10) { // Atari-style cycling border stripes
    for (let y = 0; y < VH; y += 3) { const c = RAINBOW[(Math.floor(y / 3) + Math.floor(t * 18)) % RAINBOW.length]; Px.rect(ctx, 0, y, VW, 3, c); }
    Px.rect(ctx, thick, thick, VW - thick * 2, VH - thick * 2, '#000');
  }
  function title(ctx, t, y) {
    const s1 = 'ATARI', s2 = 'FOOTBALL';
    for (let i = 0; i < s1.length; i++) FONT.shadow(ctx, s1[i], VW / 2 - FONT.width(s1, 5) / 2 + i * 30, y, RAINBOW[(i + Math.floor(t * 6)) % 7], 5, 'l');
    FONT.shadow(ctx, s2, VW / 2, y + 42, '#ffffff', 4, 'c');
  }

  /* ====================== TITLE ====================== */
  // same-screen 2-player is NOT a two-player mode here; it only exists behind ?local=1 (testing / couch use)
  const LOCAL = /[?&]local=1\b/.test(location.search);
  const MENU = [
    { id: 'cpu', label: 'PLAY VS COMPUTER' },
    { id: 'host', label: 'TWO-PLAYER GAME (ONLINE)' },
    { id: 'join', label: 'JOIN TWO-PLAYER GAME IN PROGRESS' },
    ...(LOCAL ? [{ id: 'hot', label: 'SAME-SCREEN 2-PLAYER' }] : []),
    { id: 'howto', label: 'HOW TO PLAY' },
    { id: 'qlen', label: () => 'QUARTERS: ' + (App.qLen / 60) + ' MIN' },
    { id: 'music', label: () => 'MUSIC: ' + (Audio8.musicOn ? 'ON' : 'OFF') + '   SOUND: ' + (Audio8.sfxOn ? 'ON' : 'OFF') },
  ];
  function menuAct(id) {
    Audio8.play('select');
    if (id === 'cpu') App.startGame('cpu');
    else if (id === 'host') { App.homageNext = 'hostLobby'; Net.host(); App.go('homage'); }
    else if (id === 'join') { Net.joinAny(); App.go('connecting'); }
    else if (id === 'hot') { App.homageNext = 'hot'; App.go('homage'); }
    else if (id === 'howto') App.go('howto');
    else if (id === 'qlen') { App.qLen = App.qLen === 120 ? 180 : App.qLen === 180 ? 300 : 120; localStorage.setItem('atarifb.qlen', App.qLen); }
    else if (id === 'music') { if (Audio8.musicOn && Audio8.sfxOn) Audio8.toggleMusic(); else if (!Audio8.musicOn && Audio8.sfxOn) Audio8.toggleSfx(); else { if (!Audio8.musicOn) Audio8.toggleMusic(); if (!Audio8.sfxOn) Audio8.toggleSfx(); } }
  }
  const Title = {
    sel: 0, t: 0,
    enter() { this.t = 0; Audio8.music(1); },
    update(dt, inp) {
      this.t += dt;
      if (inp.my) { this.sel = (this.sel + inp.my + MENU.length) % MENU.length; Audio8.play('select'); }
      if (inp.aP) menuAct(MENU[this.sel].id);
      if (inp.mx && (MENU[this.sel].id === 'qlen' || MENU[this.sel].id === 'music')) menuAct(MENU[this.sel].id);
    },
    draw(ctx) {
      const t = this.t;
      Px.rect(ctx, 0, 0, VW, VH, '#000');
      // mini field strip with a looping pass play
      const fy = 96; Px.rect(ctx, 0, fy, VW, 30, PAL.grass1);
      for (let x = ((-t * 40) % 30 + 30) % 30 - 30; x < VW; x += 30) Px.rect(ctx, Math.round(x), fy, 1, 30, '#f4f4f4');
      const u = (t % 3) / 3, qx = 120, rx = 120 + u * 260;
      Field.player.call({ sx: v => v, sy: v => v }, ctx, qx, fy + 15, { team: 0, face: 1, frame: 0, moving: false });
      Field.player.call({ sx: v => v, sy: v => v }, ctx, rx, fy + 10, { team: 0, face: 1, frame: Math.floor(t * 8) & 1, moving: true, ball: u > 0.8 });
      Field.player.call({ sx: v => v, sy: v => v }, ctx, rx + 20 - u * 10, fy + 20, { team: 1, face: -1, frame: Math.floor(t * 8) & 1, moving: true });
      if (u > 0.15 && u < 0.8) { const v = (u - 0.15) / 0.65, bx = lerp(qx + 4, 120 + 0.8 * 260, v), lift = Math.sin(v * Math.PI) * 18; Px.sprite(ctx, BALL_SPR, Math.round(bx), Math.round(fy + 12 - lift), { B: PAL.ball, L: PAL.lace }); }
      title(ctx, t, 18);
      const x = VW / 2 - 120, y0 = 143, h = MENU.length > 6 ? 15 : 17;
      MENU.forEach((m, i) => {
        const label = typeof m.label === 'function' ? m.label() : m.label;
        button(ctx, label, x, y0 + i * (h + 2), 240, h, i === this.sel, () => { this.sel = i; menuAct(m.id); }, m.id === 'qlen' || m.id === 'music' ? '#8890b8' : '#ffffff');
      });
      FONT.draw(ctx, 'BEHRAM ARCADE  `  ATARI 800 XL STYLE  `  2026', VW / 2, VH - 9, '#5060a0', 1, 'c');
      FONT.draw(ctx, App.touch ? 'TAP TO CHOOSE' : 'ARROWS + SPACE / ENTER', VW / 2, 131, '#8890b8', 1, 'c');
    },
  };

  /* ====================== HOW TO PLAY ====================== */
  const Howto = {
    page: 0, t: 0,
    pages() {
      const keys = 'KEYBOARD:\n  MOVE: ARROWS OR WASD\n  ACTION: SPACE / ENTER / F\n  CYCLE: SHIFT / G / X\n  PAUSE: ESC OR P\nGAMEPAD: STICK/D-PAD, A = ACTION, B/X = CYCLE\nTOUCH (PHONES + TABLETS): STICK ON THE LEFT, A = ACTION, B = CYCLE ON THE RIGHT, II = PAUSE. TAP MENUS AND PLAYS (TAP A PLAY TWICE TO LOCK IT IN).';
      return [
        ['THE GAME', 'TOP-DOWN 7-ON-7 FOOTBALL. EACH SIDE SECRETLY PICKS A PLAY FROM THE PLAYBOOK, THEN THE PLAY RUNS LIVE.\nYOU CONTROL THE FLASHING PLAYER. EVERYONE ELSE RUNS THEIR ROUTES AND ASSIGNMENTS.\n4 DOWNS TO GAIN 10 YARDS. TOUCHDOWN = 7 (EXTRA POINT IS AUTOMATIC). FIELD GOAL = 3. SAFETY = 2.\nPUNT OR KICK A FIELD GOAL WHEN YOU ARE STUCK ON 4TH DOWN. 4 QUARTERS.'],
        ['ON OFFENSE', 'YOU START AS THE QB.\nPASS PLAYS: CYCLE PICKS YOUR RECEIVER (BRACKETS), ACTION THROWS. THEN YOU STEER THE RECEIVER - PRESS ACTION AS THE BALL ARRIVES FOR A SURE CATCH.\nRUNS: THE HANDOFF IS AUTOMATIC, THEN YOU STEER THE RUNNER. ACTION = JUKE (HARDER TO TACKLE).\nSWEEP: PRESS ACTION TO PITCH.\nKICKS: PRESS ACTION WHEN THE METER IS IN THE GREEN.\nRETURNS: CYCLE IN YOUR END ZONE = KNEEL FOR A TOUCHBACK.'],
        ['ON DEFENSE', 'YOU START AS THE LINEBACKER.\nCHASE THE BALL CARRIER AND RUN INTO HIM TO TACKLE.\nACTION = DIVING TACKLE (BEST CHANCE, BUT MISS AND YOU ARE ON THE GROUND). ACTION NEAR A PASS = SWAT / INTERCEPT.\nCYCLE = SWITCH TO THE DEFENDER NEAREST THE BALL.\nSTUCK IN A BLOCK? MASH ACTION TO BREAK FREE.'],
        ['TWO-PLAYER', 'HEAD TO HEAD, EACH ON YOUR OWN DEVICE - ACROSS TOWN IS FINE.\n1. YOU PICK TWO-PLAYER GAME. CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE... (OR JUST OPEN THE SITE).\n2. YOUR BUDDY OPENS THE BEHRAM ARCADE, PICKS ATARI FOOTBALL AND TAPS JOIN TWO-PLAYER GAME IN PROGRESS. NO CODE NEEDED - THE GAME FINDS YOU. (A BACKUP ROOM CODE IS ON YOUR SCREEN JUST IN CASE.)\n3. YOU ARE BLUE, YOUR BUDDY IS GOLD.\nSECRET PLAY CALLS: YOU ONLY EVER SEE YOUR OWN PLAYBOOK. YOUR BUDDY SEES "OPPONENT IS CHOOSING" OR "OPPONENT LOCKED IN" - NEVER WHICH PLAY. THE CALLS ARE REVEALED AT THE SNAP.'],
        ['CONTROLS', keys],
        ['OFFENSE PLAYBOOK', OFFENSE.map(p => p.name + ' - ' + p.desc).join('\n')],
        ['DEFENSE PLAYBOOK', DEFENSE.map(p => p.name + ' - ' + p.desc).join('\n')],
      ];
    },
    enter() { this.page = 0; },
    update(dt, inp, typed) {
      const n = this.pages().length;
      if (inp.mx) { this.page = clamp(this.page + inp.mx, 0, n - 1); Audio8.play('select'); }
      if (inp.aP) { if (this.page < n - 1) this.page++; else App.go('title'); Audio8.play('select'); }
      if (typed.some(e => e.code === 'Escape' || e.code === 'Backspace')) App.go('title');
    },
    draw(ctx) {
      const pg = this.pages(), [h, body] = pg[this.page];
      Px.rect(ctx, 0, 0, VW, VH, '#000');
      panel(ctx, 10, 8, VW - 20, VH - 44);
      FONT.shadow(ctx, h, VW / 2, 18, '#ffe048', 2, 'c');
      para(ctx, body, 24, 42, VW - 48, '#ffffff');
      FONT.draw(ctx, 'PAGE ' + (this.page + 1) + '/' + pg.length, VW - 24, VH - 50, '#5060a0', 1, 'r');
      const y = VH - 30;
      button(ctx, '{ PREV', 14, y, 96, 22, false, () => { this.page = Math.max(0, this.page - 1); });
      button(ctx, 'BACK TO MENU', VW / 2 - 70, y, 140, 22, false, () => App.go('title'));
      button(ctx, this.page < pg.length - 1 ? 'NEXT }' : 'DONE', VW - 110, y, 96, 22, true, () => { if (this.page < pg.length - 1) this.page++; else App.go('title'); });
    },
  };

  /* ====================== HOMAGE: "CALL YOUR BUDDY" TAPE LOAD ====================== */
  const BG = '#1d4f9c', FG = '#9cc8ff';
  const Homage = {
    t: 0, DUR: 24, phase: 0, done: false,
    enter() { this.t = 0; this.done = false; this.beeped = 0; this.typed = 0; this.tape = false; Audio8.music(0); },
    exit() { Audio8.tapeStop(); },
    finish() { if (this.done) return; this.done = true; Audio8.tapeStop(); Audio8.play('ready'); if (App.homageNext === 'hot') App.startGame('hot'); else App.go('hostLobby'); },
    update(dt, inp, typed) {
      const before = this.t; this.t += dt; const t = this.t;
      if (typed.some(e => e.code === 'Escape' || e.code === 'KeyK')) return this.finish();
      // CLOAD typed letter by letter
      const typedN = clamp(Math.floor((t - 1.2) / 0.16), 0, 5);
      if (typedN > this.typed) { this.typed = typedN; Audio8.play('select'); }
      // two prompt beeps: "press PLAY on the recorder, then RETURN"
      for (const bt of [2.4, 2.75, 3.6]) if (before < bt && t >= bt) Audio8.play('beep');
      if (!this.tape && t > 4.2) { this.tape = true; Audio8.tapeStart(); }
      if (t >= this.DUR - 1.4 && this.tape) { this.tape = false; Audio8.tapeStop(); Audio8.play('boot'); }
      if (t >= this.DUR) this.finish();
    },
    draw(ctx) {
      const t = this.t, load = t > 4.2 && t < this.DUR - 1.4;
      if (load) stripes(ctx, t, 14); else Px.rect(ctx, 0, 0, VW, VH, BG);
      Px.rect(ctx, 14, 14, VW - 28, VH - 28, BG);
      const L = (s, row, c = FG) => FONT.draw(ctx, s, 26, 24 + row * 11, c, 1);
      L('ATARI 800 XL    BASIC REV. C', 0);
      L('READY', 2);
      if (t > 1.2) L('CLOAD'.slice(0, this.typed) + ((t * 2 | 0) % 2 && this.typed < 5 ? '_' : ''), 3);
      if (t > 2.4) L('PRESS PLAY ON TAPE, THEN RETURN', 4);
      if (t > 3.6) L('` PLAY', 5, '#ffffff');
      if (t > 4.2) {
        const msg1 = 'CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER.';
        const msg2 = 'THE GAME IS LOADING... JUST LIKE THE OLD DAYS.';
        let y = 100;
        for (const line of FONT.wrap(msg1, 420, 2)) { FONT.draw(ctx, line, VW / 2, y, '#ffffff', 2, 'c'); y += 18; }
        y += 8; FONT.draw(ctx, msg2, VW / 2, y, FG, 1, 'c');
        // progress: 32 tape blocks
        const prog = clamp((t - 4.2) / (this.DUR - 5.8), 0, 1), blocks = Math.floor(prog * 32);
        const bx = 60, by = 170, bw = VW - 120;
        Px.frame(ctx, bx - 2, by - 2, bw + 4, 12, FG);
        for (let i = 0; i < blocks; i++) Px.rect(ctx, bx + Math.floor(i * bw / 32), by, Math.floor(bw / 32) - 1, 8, '#ffffff');
        FONT.draw(ctx, 'BLOCK ' + String(blocks).padStart(2, '0') + '/32', VW / 2, by + 14, FG, 1, 'c');
        // the buddy on his bike, pedalling across
        const rx = Math.round(bx - 10 + prog * (bw + 10)), ry = 212, f = Math.floor(t * 8) & 1;
        Px.circle(ctx, rx - 6, ry + 8, 4, '#ffffff'); Px.circle(ctx, rx + 7, ry + 8, 4, '#ffffff');
        Px.line(ctx, rx - 6, ry + 8, rx, ry + 3, '#ffe048'); Px.line(ctx, rx, ry + 3, rx + 7, ry + 8, '#ffe048'); Px.line(ctx, rx, ry + 3, rx + 5, ry + 2, '#ffe048');
        Px.rect(ctx, rx - 2, ry - 6, 3, 3, '#ffcc99'); Px.rect(ctx, rx - 2, ry - 3, 3, 5, '#ff5050');
        Px.line(ctx, rx, ry + 2, rx + (f ? 2 : -1), ry + 7, '#4060ff');
      }
      if (t >= this.DUR - 1.4) L('READY', 16, '#ffffff');
      if ((t * 2.5 | 0) % 2 && t < 1.2) Px.rect(ctx, 26, 24 + 3 * 11, 5, 7, FG);
      FONT.draw(ctx, App.touch ? 'TAP SKIP' : 'ESC = SKIP', VW - 22, VH - 24, '#6a90d0', 1, 'r');
      hit(VW - 90, VH - 40, 80, 30, () => this.finish(), 'SKIP');
    },
  };

  /* ====================== HOST LOBBY ====================== */
  const HostLobby = {
    t: 0, connT: -1,
    enter() { this.t = 0; this.connT = -1; Audio8.music(0.5); },
    update(dt, inp, typed) {
      this.t += dt;
      if (typed.some(e => e.code === 'Escape')) { Net.leave(); App.go('title'); return; }
      if (Net.st.status === 'connected' && this.connT < 0) { this.connT = this.t; Audio8.play('cheer'); }
      if (this.connT >= 0 && this.t - this.connT > 1.6) App.startGame('host');
    },
    draw(ctx) {
      Px.rect(ctx, 0, 0, VW, VH, '#000'); panel(ctx, 20, 12, VW - 40, VH - 24);
      FONT.shadow(ctx, 'TWO-PLAYER GAME', VW / 2, 24, '#ffe048', 2, 'c');
      const s = Net.st;
      if (s.status === 'error') {
        para(ctx, s.error, 50, 90, VW - 100, '#ff8080', 'c');
        button(ctx, 'TRY AGAIN', VW / 2 - 110, 200, 100, 24, true, () => { Net.host(); this.connT = -1; });
        button(ctx, 'MENU', VW / 2 + 10, 200, 100, 24, false, () => { Net.leave(); App.go('title'); });
        return;
      }
      const dots = '...'.slice(0, (this.t * 2 | 0) % 4);
      if (s.status === 'connected') FONT.shadow(ctx, 'YOUR BUDDY IS HERE!', VW / 2, 56, '#60ff60', 2, 'c');
      else if (s.status === 'opening') FONT.shadow(ctx, 'SETTING UP THE GAME' + dots, VW / 2, 56, '#ffffff', 2, 'c');
      else FONT.shadow(ctx, 'WAITING FOR YOUR BUDDY' + dots, VW / 2, 56, '#ffffff', 2, 'c');
      if (s.status === 'connected') { FONT.draw(ctx, 'KICKOFF COMING UP... YOU ARE BLUE, YOUR BUDDY IS GOLD.', VW / 2, 92, '#ffffff', 1, 'c'); }
      else {
        FONT.draw(ctx, 'TELL THEM TO:', VW / 2, 82, '#8890b8', 1, 'c');
        const steps = ['1. OPEN THE BEHRAM ARCADE', '2. PICK ATARI FOOTBALL', '3. TAP  JOIN TWO-PLAYER GAME IN PROGRESS'];
        steps.forEach((l, i) => FONT.draw(ctx, l, VW / 2 - 118, 96 + i * 14, i === 2 ? '#ffe048' : '#ffffff', 1, 'l'));
        FONT.draw(ctx, 'NO CODE NEEDED - THE GAME FINDS YOU.', VW / 2, 144, '#60ff60', 1, 'c');
      }
      // the backup room code, small
      const code = s.code || '.....';
      Px.frame(ctx, VW / 2 - 90, 164, 180, 34, '#5060a0');
      FONT.draw(ctx, 'BACKUP ROOM CODE', VW / 2, 168, '#8890b8', 1, 'c');
      FONT.draw(ctx, code.split('').join(' '), VW / 2, 180, '#ffe048', 2, 'c');
      para(ctx, "ONLY IF JOINING DOESN'T FIND YOU: THEY TAP JOIN, THEN ENTER CODE INSTEAD.", 50, 206, VW - 100, '#5060a0', 'c');
      button(ctx, 'CANCEL', VW / 2 - 50, 240, 100, 22, false, () => { Net.leave(); App.go('title'); });
    },
  };

  /* ====================== JOIN (room code entry) ====================== */
  const Join = {
    code: '', t: 0,
    enter() { this.code = ''; this.t = 0; Audio8.music(0.5); Net.leave(); },
    add(ch) { ch = ch.toUpperCase(); if (this.code.length < 5 && Net.ALPH.includes(ch)) { this.code += ch; Audio8.play('select'); } },
    del() { this.code = this.code.slice(0, -1); Audio8.play('back'); },
    go() { if (this.code.length === 5) { Audio8.play('lock'); Net.join(this.code); App.go('connecting'); } else Audio8.play('error'); },
    update(dt, inp, typed) {
      this.t += dt;
      const box = document.getElementById('codeInput'), boxFocused = box && document.activeElement === box;
      for (const e of typed) {
        if (e.code === 'Escape') { if (boxFocused) box.blur(); App.go('title'); return; }
        if (boxFocused && e.key && e.key.length === 1) continue; // the hidden input delivers these
        if (e.code === 'Backspace') this.del();
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.go();
        else if (e.key && e.key.length === 1) this.add(e.key === 'I' || e.key === 'i' ? 'J' : e.key === 'O' || e.key === 'o' ? '0' : e.key);
      }
      if (box && box.value) { for (const ch of box.value) this.add(ch); box.value = ''; }
    },
    draw(ctx) {
      Px.rect(ctx, 0, 0, VW, VH, '#000'); panel(ctx, 10, 6, VW - 20, VH - 12);
      FONT.shadow(ctx, 'ENTER ROOM CODE', VW / 2, 14, '#ffe048', 2, 'c');
      FONT.draw(ctx, "THE BACKUP CODE ON YOUR BUDDY'S SCREEN", VW / 2, 34, '#ffffff', 1, 'c');
      for (let i = 0; i < 5; i++) {
        const x = VW / 2 - 85 + i * 35, y = 48;
        Px.rect(ctx, x, y, 30, 34, '#000'); Px.frame(ctx, x, y, 30, 34, i === this.code.length ? '#ffffff' : '#5060a0');
        if (this.code[i]) FONT.draw(ctx, this.code[i], x + 15, y + 10, '#ffe048', 3, 'c');
        else if (i === this.code.length && (this.t * 2 | 0) % 2) Px.rect(ctx, x + 9, y + 26, 12, 2, '#ffffff');
      }
      // tap keyboard: 24 letters (no I / O) in 2 rows of 12
      const L = Net.ALPH, kw = 34, kh = 26, gx = VW / 2 - (12 * kw + 11 * 2) / 2;
      for (let i = 0; i < L.length; i++) {
        const r = Math.floor(i / 12), c = i % 12, x = gx + c * (kw + 2), y = 94 + r * (kh + 3);
        button(ctx, L[i], x, y, kw, kh, false, () => this.add(L[i]), '#ffffff', 2);
      }
      button(ctx, 'DEL', gx, 154, 80, 26, false, () => this.del());
      if (App.touch) button(ctx, 'PHONE KEYBOARD', gx + 88, 154, 132, 26, false, () => { const b = document.getElementById('codeInput'); if (b) { b.value = ''; b.focus(); } });
      button(ctx, 'JOIN!', gx + 12 * (kw + 2) - 2 - 100, 154, 100, 26, this.code.length === 5, () => this.go(), '#60ff60');
      para(ctx, 'NO SPACES, NO I OR O. YOU WILL PLAY GOLD. NEEDS INTERNET (PEER-TO-PEER, NO ACCOUNT).', 40, 192, VW - 80, '#8890b8', 'c');
      button(ctx, 'SEARCH AGAIN', VW / 2 - 130, 236, 120, 22, false, () => { Net.joinAny(); App.go('connecting'); });
      button(ctx, 'BACK', VW / 2 + 10, 236, 100, 22, false, () => App.go('title'));
    },
  };
  const Connecting = {
    t: 0, sel: 0, enter() { this.t = 0; this.sel = 0; },
    retry() { this.t = 0; if (Net.st.via === 'code') Net.join(Join.code); else Net.joinAny(); },
    update(dt, inp, typed) {
      this.t += dt;
      if (typed.some(e => e.code === 'Escape')) { Net.leave(); App.go('title'); return; }
      const s = Net.st;
      if (s.status === 'nogame' || s.status === 'error') {
        if (inp.mx || inp.my) { this.sel = (this.sel + (inp.mx || inp.my) + 3) % 3; Audio8.play('select'); }
        if (inp.aP) [() => this.retry(), () => App.go('join'), () => { Net.leave(); App.go('title'); }][this.sel]();
      }
    },
    draw(ctx) {
      Px.rect(ctx, 0, 0, VW, VH, '#000'); panel(ctx, 20, 30, VW - 40, VH - 60);
      const s = Net.st;
      if (s.status === 'nogame' || s.status === 'error') {
        const none = s.status === 'nogame' && !s.error;
        FONT.shadow(ctx, none ? 'NO GAME WAITING' : 'NO CONNECTION', VW / 2, 50, '#ff8080', 2, 'c');
        para(ctx, none ? 'ASK YOUR BUDDY TO START A TWO-PLAYER GAME FIRST, THEN TRY AGAIN.' : s.error, 50, 86, VW - 100, '#ffffff', 'c');
        if (none) FONT.draw(ctx, '(THEY PICK TWO-PLAYER GAME ON THEIR OWN DEVICE.)', VW / 2, 118, '#8890b8', 1, 'c');
        const L = ['RETRY', 'ENTER CODE INSTEAD', 'BACK'], W = [90, 160, 90], X = [VW / 2 - 180, VW / 2 - 80, VW / 2 + 90];
        L.forEach((l, i) => button(ctx, l, X[i], 200, W[i], 24, this.sel === i, [() => this.retry(), () => App.go('join'), () => { Net.leave(); App.go('title'); }][i]));
        return;
      }
      const found = s.status === 'connected';
      FONT.shadow(ctx, found ? 'FOUND YOUR BUDDY!' : s.via === 'code' ? 'CONNECTING' : 'LOOKING FOR A GAME', VW / 2, 60, found ? '#60ff60' : '#ffe048', 2, 'c');
      FONT.draw(ctx, found ? 'ROOM ' + s.code + ' - YOU ARE GOLD. WAITING FOR KICKOFF...' : s.via === 'code' ? 'DIALING ROOM ' + s.code + '...'.slice(0, (this.t * 2 | 0) % 4) : 'IN PROGRESS' + '...'.slice(0, (this.t * 2 | 0) % 4), VW / 2, 100, '#ffffff', 1, 'c');
      for (let i = 0; i < 12; i++) Px.rect(ctx, VW / 2 - 72 + i * 12, 130, 8, 8, (Math.floor(this.t * 8) % 12) === i ? '#ffe048' : '#3048b0');
      if (!found) para(ctx, 'YOUR BUDDY NEEDS TO HAVE PICKED TWO-PLAYER GAME ON THEIR DEVICE.', 50, 156, VW - 100, '#8890b8', 'c');
      button(ctx, 'CANCEL', VW / 2 - 50, 200, 100, 24, false, () => { Net.leave(); App.go('title'); });
    },
  };
  const ErrorScreen = {
    msg: '', role: null, enter(o) { this.msg = (o && o.msg) || 'SOMETHING WENT WRONG.'; this.role = (o && o.role) || Net.st.role; Audio8.play('error'); },
    update(dt, inp, typed) { if (typed.some(e => e.code === 'Escape')) App.go('title'); else if (inp.aP) { if (this.role === 'host') { Net.host(); App.go('hostLobby'); } else if (this.role === 'guest') { Net.joinAny(); App.go('connecting'); } else App.go('title'); } },
    draw(ctx) {
      Px.rect(ctx, 0, 0, VW, VH, '#000'); panel(ctx, 30, 60, VW - 60, VH - 120, '#ff8080');
      FONT.shadow(ctx, 'GAME OVER, MAN', VW / 2, 76, '#ff8080', 2, 'c');
      para(ctx, this.msg, 60, 110, VW - 120, '#ffffff', 'c');
      if (this.role === 'host' || this.role === 'guest') { // straight back to a lobby
        button(ctx, this.role === 'host' ? 'NEW GAME' : 'JOIN AGAIN', VW / 2 - 150, 190, 140, 24, true, () => { if (this.role === 'host') { Net.host(); App.go('hostLobby'); } else { Net.joinAny(); App.go('connecting'); } });
        button(ctx, 'BACK TO MENU', VW / 2 + 10, 190, 140, 24, false, () => App.go('title'));
      } else button(ctx, 'BACK TO MENU', VW / 2 - 70, 190, 140, 24, true, () => App.go('title'));
    },
  };

  /* ====================== PLAYBOOK OVERLAY ====================== */
  /** which team should be picking on THIS screen right now (or -1) */
  function pickingTeam(S) {
    if (S.ph !== 'select') return -1;
    const L = App.view.local;
    if (App.mode === 'hot') return !S.lk[S.off] ? S.off : !S.lk[1 - S.off] ? 1 - S.off : -1;
    for (const t of [0, 1]) if (L[t] && !S.lk[t] && !(App.mode === 'guest' && App.sentPick)) return t;
    return -1;
  }
  const Select = {
    cur: [0, 0], gateFor: -1, lastKey: '',
    reset(S) {
      for (const t of [0, 1]) { const list = t === S.off ? OFFENSE : DEFENSE; const k = list.findIndex(p => p.id === App.lastPick[t]); this.cur[t] = Math.max(0, k); }
      this.gateFor = App.mode === 'hot' ? S.off : -1; this.gateOpen = false;
    },
    lock(team, S) {
      const list = team === S.off ? OFFENSE : DEFENSE, p = list[this.cur[team]];
      App.lastPick[team] = p.id; App.pick(team, p.id);
      if (App.mode === 'hot') { this.gateFor = 1 - team; this.gateOpen = false; }
    },
    update(dt, S, ctlFor) {
      const t = pickingTeam(S); if (t < 0) return;
      const inp = ctlFor(t);
      if (App.mode === 'hot' && this.gateFor === t && !this.gateOpen) { if (inp.aP) { this.gateOpen = true; Audio8.play('select'); } return; }
      const list = t === S.off ? OFFENSE : DEFENSE;
      if (inp.my) { this.cur[t] = (this.cur[t] + inp.my + list.length) % list.length; Audio8.play('select'); }
      if (inp.mx) { this.cur[t] = (this.cur[t] + inp.mx * (list.length > 8 ? 6 : 3) + list.length * 3) % list.length; Audio8.play('select'); }
      if (inp.aP) this.lock(t, S);
    },
    draw(ctx, S) {
      const t = pickingTeam(S);
      Px.rect(ctx, 0, HUD_H, VW, VH - HUD_H, '#0c0c24');
      if (t < 0) { // waiting
        const me = App.view.local[0] ? 0 : 1, them = 1 - me;
        panel(ctx, 90, 110, VW - 180, 70);
        FONT.shadow(ctx, 'LOCKED IN!', VW / 2, 122, '#60ff60', 2, 'c');
        const oppL = S.lk[them];
        FONT.draw(ctx, oppL ? (App.mode === 'cpu' ? 'COMPUTER' : 'OPPONENT') + ' LOCKED IN - HERE WE GO!' : (App.mode === 'cpu' ? 'COMPUTER' : 'OPPONENT') + ' IS CHOOSING' + '...'.slice(0, (performance.now() / 400 | 0) % 4), VW / 2, 146, '#ffffff', 1, 'c');
        FONT.draw(ctx, 'YOUR CALL: ' + (PLAY_BY_ID[App.lastPick[me]] || { name: '?' }).name, VW / 2, 160, '#8890b8', 1, 'c');
        return;
      }
      const isOff = t === S.off, list = isOff ? OFFENSE : DEFENSE, T = TEAMS[t], O = TEAMS[1 - t];
      const who = App.mode === 'hot' ? (t === 0 ? 'P1 ' : 'P2 ') : '';
      if (App.mode === 'hot' && this.gateFor === t && !this.gateOpen) {
        panel(ctx, 50, 70, VW - 100, 140, T.main);
        FONT.shadow(ctx, who + T.name + (isOff ? ' OFFENSE' : ' DEFENSE'), VW / 2, 86, T.main, 2, 'c');
        FONT.shadow(ctx, O.name + ': LOOK AWAY!', VW / 2, 112, '#ff8080', 2, 'c');
        FONT.draw(ctx, 'NO PEEKING AT THE PLAY CALL.', VW / 2, 136, '#ffffff', 1, 'c');
        FONT.draw(ctx, 'PRESS ' + (t === 0 ? 'F' : 'ENTER') + ' WHEN READY', VW / 2, 152, '#ffffff', 1, 'c');
        button(ctx, 'READY', VW / 2 - 50, 176, 100, 22, true, () => { this.gateOpen = true; });
        return;
      }
      // header
      FONT.draw(ctx, who + T.name + (isOff ? ' OFFENSE' : ' DEFENSE') + ': CALL A PLAY', 8, HUD_H + 6, T.main, 1);
      const oppLocked = S.lk[1 - t];
      if (App.mode !== 'hot') FONT.draw(ctx, (App.mode === 'cpu' ? 'COMPUTER' : 'OPPONENT') + (oppLocked ? ' LOCKED IN' : ' IS CHOOSING' + '...'.slice(0, (performance.now() / 400 | 0) % 4)), VW - 8, HUD_H + 6, oppLocked ? '#60ff60' : '#8890b8', 1, 'r');
      // list
      const rowH = list.length > 8 ? 18 : 24, y0 = HUD_H + 20;
      list.forEach((p, i) => {
        const y = y0 + i * rowH, sel = i === this.cur[t];
        Px.rect(ctx, 6, y, 160, rowH - 2, sel ? T.dark : '#141838');
        if (sel) Px.frame(ctx, 6, y, 160, rowH - 2, '#ffffff');
        FONT.draw(ctx, (i + 1 < 10 ? ' ' : '') + (i + 1) + ' ' + p.name, 10, y + Math.floor((rowH - 9) / 2), sel ? '#ffffff' : (p.kind === 'punt' || p.kind === 'fg') ? '#ffe048' : '#c8d0ff', 1);
        hit(6, y, 160, rowH - 2, () => { if (this.cur[t] === i && App.touch) { this.lock(t, S); } else { this.cur[t] = i; Audio8.play('select'); } }, list[i].name);
      });
      // diagram
      const p = list[this.cur[t]];
      Diagram.draw(ctx, p, isOff, 174, HUD_H + 20, 300, 186, T.main, O.main);
      FONT.draw(ctx, p.name, 180, HUD_H + 24, '#ffffff', 1);
      para(ctx, p.desc, 176, HUD_H + 212, 296, '#ffffff');
      button(ctx, 'LOCK IN ' + p.name, 174, VH - 26, 190, 20, true, () => this.lock(t, S), '#ffffff');
      FONT.draw(ctx, App.touch ? 'TAP TWICE = LOCK IN' : '^~ CHOOSE  ACTION = LOCK', 8, VH - 10, '#8890b8', 1, 'l');
    },
  };

  /* ====================== PAUSE & GAME OVER ====================== */
  const Pause = {
    sel: 0,
    items() { return App.mode === 'host' || App.mode === 'guest' ? ['BACK TO GAME', 'MUSIC ' + (Audio8.musicOn ? 'ON' : 'OFF'), 'QUIT TO MENU'] : ['RESUME', 'MUSIC ' + (Audio8.musicOn ? 'ON' : 'OFF'), 'RESTART GAME', 'QUIT TO MENU']; },
    act(label) {
      Audio8.play('select');
      if (label.startsWith('RESUME') || label.startsWith('BACK')) App.paused = false;
      else if (label.startsWith('MUSIC')) Audio8.toggleMusic();
      else if (label.startsWith('RESTART')) { App.paused = false; App.startGame(App.mode); }
      else if (label.startsWith('QUIT')) App.quit();
    },
    update(dt, inp) { const it = this.items(); if (inp.my) this.sel = (this.sel + inp.my + it.length) % it.length; if (inp.aP) this.act(it[this.sel]); },
    draw(ctx) {
      const it = this.items(); panel(ctx, VW / 2 - 90, 70, 180, 40 + it.length * 26);
      FONT.shadow(ctx, App.mode === 'host' || App.mode === 'guest' ? 'MENU' : 'PAUSED', VW / 2, 80, '#ffe048', 2, 'c');
      it.forEach((l, i) => button(ctx, l, VW / 2 - 70, 104 + i * 26, 140, 22, i === this.sel, () => this.act(l)));
    },
  };
  const Over = {
    sel: 0,
    update(dt, inp) { if (inp.mx || inp.my) this.sel ^= 1; if (inp.aP) this.act(this.sel); },
    act(i) { Audio8.play('select'); if (i === 0) App.rematch(); else App.quit(); },
    draw(ctx, S) {
      panel(ctx, 70, 50, VW - 140, 200, '#ffe048');
      FONT.shadow(ctx, 'FINAL', VW / 2, 62, '#ffe048', 3, 'c');
      FONT.shadow(ctx, TEAMS[0].name, VW / 2 - 80, 100, TEAMS[0].main, 2, 'c'); FONT.shadow(ctx, TEAMS[1].name, VW / 2 + 80, 100, TEAMS[1].main, 2, 'c');
      FONT.shadow(ctx, String(S.sc[0]), VW / 2 - 80, 122, '#ffffff', 4, 'c'); FONT.shadow(ctx, String(S.sc[1]), VW / 2 + 80, 122, '#ffffff', 4, 'c');
      const w = S.sc[0] === S.sc[1] ? -1 : S.sc[0] > S.sc[1] ? 0 : 1;
      const me = App.view.local[0] && !App.view.local[1] ? 0 : App.view.local[1] && !App.view.local[0] ? 1 : -1;
      const msg = w < 0 ? 'TIE GAME!' : me < 0 ? TEAMS[w].name + ' WINS!' : w === me ? 'YOU WIN!' : 'YOU LOSE!';
      FONT.shadow(ctx, msg, VW / 2, 166, w < 0 ? '#ffffff' : TEAMS[w].main, 2, 'c');
      const waiting = App.mode === 'guest' && App.rematchSent;
      button(ctx, waiting ? 'ASKED...' : 'REMATCH', VW / 2 - 110, 204, 100, 24, this.sel === 0, () => this.act(0));
      button(ctx, 'MAIN MENU', VW / 2 + 10, 204, 100, 24, this.sel === 1, () => this.act(1));
    },
  };

  return { hits, beginFrame, tap, hit, button, panel, para, Title, Howto, Homage, HostLobby, Join, Connecting, ErrorScreen, Select, Pause, Over, pickingTeam };
})();
