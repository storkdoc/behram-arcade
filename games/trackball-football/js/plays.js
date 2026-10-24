/* ==========================================================================
   TRACKBALL FOOTBALL — plays.js
   7-on-7 playbook. Positions are (f, l): f = yards downfield from the line of
   scrimmage (+ = toward the end zone being attacked), l = yards across the
   field from the ball (+ = toward the near sideline). Plays are mirrored
   toward the wide side of the field at the snap.
   Offense roles  0 C · 1 LG · 2 RG · 3 QB · 4 RB · 5 WR1 (far) · 6 WR2 (near)
   Defense roles  0 DT · 1 DE · 2 DE · 3 MLB · 4 CB1 · 5 CB2 · 6 S
   ========================================================================== */
const OFF_FORM = [[-0.6, 0], [-0.8, -1.7], [-0.8, 1.7], [-4.2, 0], [-4.6, 2.2], [-0.9, -12], [-0.9, 11]];
const DEF_FORM = [[1.1, 0], [1.1, -2.9], [1.1, 2.9], [4.6, 0.4], [6.5, -12], [6, 11], [12, -1]];
const OFF_ROLE = ['C', 'LG', 'RG', 'QB', 'RB', 'WR', 'WR'];
const DEF_ROLE = ['DT', 'DE', 'DE', 'LB', 'CB', 'CB', 'S'];
const OFF_NUM = [55, 66, 71, 12, 28, 81, 88];
const DEF_NUM = [93, 97, 91, 52, 24, 21, 31];

// routes: absolute (f, l) waypoints from the snap. 'blk' = blocks. qb: drop point.
const OFFENSE = [
  { id: 'dive', name: 'DIVE', kind: 'run', desc: 'RB hits the middle',
    qb: [[-4.4, -1.5], [-6, -4]], hand: 4,
    r: { 4: [[-4.2, 0.4], [0.5, 0.2], [14, 0]], 5: [[8, -12], [30, -12]], 6: [[8, 11], [30, 11]] } },
  { id: 'sweep', name: 'SWEEP', kind: 'run', desc: 'Pitch wide, follow the lead block',
    qb: [[-5, -1]], pitch: 4,
    r: { 4: [[-5.2, 5], [-3.5, 10], [2, 15], [16, 16]], 6: 'blk', 2: 'pull' } },
  { id: 'slants', name: 'SLANTS', kind: 'pass', desc: 'Quick crossing slants, RB in the flat',
    qb: [[-6, 0]],
    r: { 5: [[2.5, -12], [8, -6], [16, 2]], 6: [[2.5, 11], [8, 5], [16, -3]], 4: [[-3.5, 6], [1.5, 12], [4, 17]] } },
  { id: 'post', name: 'POST + CURL', kind: 'pass', desc: 'Deep post, curl and a check-down',
    qb: [[-7, 0]],
    r: { 5: [[11, -12], [27, -3]], 6: [[11, 11], [8.5, 12.5]], 4: [[-2.5, 3.5], [4, 2]] } },
  { id: 'bomb', name: 'BOMB', kind: 'pass', desc: 'Everybody deep. RB blocks.',
    qb: [[-8.5, 0]],
    r: { 5: [[45, -13]], 6: [[45, 12]], 4: 'blk' } },
  { id: 'screen', name: 'SCREEN', kind: 'pass', desc: 'Let them rush, dump it to the RB',
    qb: [[-8, 0]], screen: 1,
    r: { 4: [[-4.5, 5], [-2.5, 10], [-1.5, 11]], 5: [[20, -12]], 6: [[3, 11], [4, 7]] } },
  { id: 'punt', name: 'PUNT', kind: 'punt', desc: 'Kick it away' },
  { id: 'fg', name: 'FIELD GOAL', kind: 'fg', desc: 'Kick for three' },
];
// defense: per role: ['rush'] | ['man', offRole, cushion] | ['zone', f, l] | ['fill'] | ['spy']
const DEFENSE = [
  { id: 'man', name: 'MAN-TO-MAN', desc: 'Lock on, safety over the top', a: [['rush'], ['rush'], ['rush'], ['man', 4, 2], ['man', 5, 3], ['man', 6, 3], ['zone', 16, 0]] },
  { id: 'zone', name: 'COVER 3 ZONE', desc: 'Three deep, linebacker underneath', a: [['rush'], ['rush'], ['rush'], ['zone', 6, 0], ['zone', 15, -13], ['zone', 15, 13], ['zone', 19, 0]] },
  { id: 'blitz', name: 'BLITZ', desc: 'Send the LB and safety. Press coverage.', a: [['rush'], ['rush'], ['rush'], ['rush'], ['man', 5, 0.8], ['man', 6, 0.8], ['rush']] },
  { id: 'stuff', name: 'RUN STUFF', desc: 'Crash the line, safety comes down', a: [['rush'], ['rush'], ['rush'], ['fill'], ['man', 5, 2.5], ['man', 6, 2.5], ['fill']] },
  { id: 'prevent', name: 'PREVENT', desc: 'Nothing deep. Bend, don\u2019t break.', a: [['rush'], ['rush'], ['rush'], ['zone', 9, 0], ['zone', 22, -12], ['zone', 22, 12], ['zone', 30, 0]] },
];
const PLAY_BY_ID = {}; for (const p of OFFENSE.concat(DEFENSE)) PLAY_BY_ID[p.id] = p;
