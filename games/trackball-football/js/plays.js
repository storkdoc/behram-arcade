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
  // SELL OUT: bet on the offense's habit. At the snap it becomes the COUNTER for the play the scouting report
  // expects (lined up to that play's side). Right, and the play dies; wrong, and the holes it leaves get gashed.
  { id: 'read', name: 'SELL OUT', desc: 'Bet on their habit: the counter to the play they keep calling', counter: true, a: [['rush'], ['rush'], ['rush'], ['man', 4, 2], ['man', 5, 3], ['man', 6, 3], ['zone', 16, 0]] },
];
/* counter-defenses, one per offensive play. Same assignment language as DEFENSE plus
     ['crash', f, l, tag]  fire at the snap to a spot (no reading, slips the first block), then hunt the ball
     ['jump', recv, f, l]  sit on that receiver's break point, then undercut him (better odds to pick it)
     ['bracket', recv, c]  stay over the top of that receiver, c yards of cushion
   Spots are in the defense's frame, lined up with the expected call (flipped with it), so +l is the side the
   sweep, screen and curl go. Each one takes something away and gives something up: see `weak`. */
const COUNTER = {
  sweep: { name: 'EDGE BLITZ', tag: 'THE SWEEP', weak: 'the middle and deep', a: [['rush'], ['rush'], ['crash', -3.8, 8.2, 'eblitz'], ['crash', -1.5, 6.5, 'scrape'], ['man', 5, 3], ['crash', -1.8, 12.5, 'ccrash'], ['crash', 2.5, 9.5, 'rotate']] },
  dive: { name: 'RUN BLITZ', tag: 'THE DIVE', weak: 'the edges and deep', a: [['crash', -2.6, 0, 'gap'], ['crash', -2.8, -1.2, 'pinch'], ['crash', -2.8, 1.6, 'pinch'], ['crash', -2.2, 0.4, 'gap'], ['man', 5, 1.2], ['man', 6, 1.2], ['crash', 0.5, 0.3, 'gap']] },
  slants: { name: 'JUMP THE SLANTS', tag: 'THE SLANTS', weak: 'deep and the run', a: [['rush'], ['rush'], ['rush'], ['jump', 4, 1.5, 12], ['jump', 5, 6.5, -7.5], ['jump', 6, 6.5, 6.5], ['zone', 10, 0]] },
  post: { name: 'BRACKET THE POST', tag: 'THE POST', weak: 'the run and the flat', a: [['rush'], ['rush'], ['rush'], ['jump', 4, 3.5, 2.2], ['man', 5, 1.2], ['jump', 6, 9.5, 12.5], ['bracket', 5, 3.5]] },
  bomb: { name: 'DEEP BRACKET + BLITZ', tag: 'THE BOMB', weak: 'everything short', a: [['rush'], ['rush'], ['rush'], ['crash', -7.5, 0.5, 'blitz'], ['bracket', 5, 5], ['bracket', 6, 5], ['crash', -7, -2, 'blitz']] },
  screen: { name: 'SNIFF THE SCREEN', tag: 'THE SCREEN', weak: 'deep and the dive', a: [['rush'], ['rush'], ['crash', -3.2, 9.5, 'sniff'], ['crash', -2.6, 10.5, 'sniff'], ['man', 5, 3], ['man', 6, 1.2], ['zone', 12, 0]] },
};
const COUNTER_SYM = { dive: 1, slants: 1, bomb: 1 }; // counters that don't care which way the call was flipped
const PLAY_BY_ID = {}; for (const p of OFFENSE.concat(DEFENSE)) PLAY_BY_ID[p.id] = p;
