/* FEUD & DELIVERY: host banter. Warm, professional, and never at a patient's or a group's expense.
 * {T} = team/player name, {O} = the other side, {Q} = the condition, {P} = points, {A} = the answer */
(function (root) {
  'use strict';
  var B = {
    welcome: [
      'Welcome to FEUD & DELIVERY, live from Fallsgrove Plaza! I am your host, and yes, I washed my hands.',
      'Good evening, Rockville! Tonight we find out who really reads the Practice Bulletins.',
      'Welcome back to the only game show where the buzzer is quieter than a fetal monitor alarm.',
      'Hello, everybody! We surveyed the textbooks, so you don\'t have to. You still have to, though.',
      'It\'s FEUD & DELIVERY! Where the stakes are high and the coffee is lukewarm.',
      'Welcome! Phones on silent, pagers on vibrate, differentials on MAXIMUM.',
      'Live from the second floor, it\'s the game that puts the "diff" in "difficult"!'
    ],
    roundIntro: [
      'Round {R}! Hands on buzzers. Gently. Those are rentals.',
      'Here comes round {R}. Somebody tell the front desk to hold my calls.',
      'Round {R}! Remember, common things are common. Most of the time. Usually. Ask me later.',
      'Round {R}, everyone. Deep breath. Not you, the board.',
      'On to round {R}! Let\'s see what the textbooks said.',
      'Round {R}. I have not been this excited since the new ultrasound machine arrived.',
      'Round {R}! Think like an attending, buzz like an intern.'
    ],
    multDouble: ['DOUBLE POINTS! Like twins, but you get to keep both.', 'Everything is worth DOUBLE now. Much like the paperwork.', 'Double points! This is where legends are made, and charts are signed.'],
    multTriple: ['TRIPLE POINTS! The triplets of scoring!', 'Triple points! Somebody page the NICU, things are about to get exciting.', 'Triple! This round could change EVERYTHING. No pressure. Lots of pressure.'],
    faceoff: [
      'Face-off! First to buzz gets the first answer.',
      'Fingers on buzzers... we surveyed the literature...',
      'Face-off time. May the fastest differential win.',
      'Here we go. Eyes on me. No peeking at UpToDate.'
    ],
    topAnswer: [
      'NUMBER ONE ANSWER! Somebody frame that!',
      'TOP OF THE BOARD! You\'ve been studying!',
      'Number one! That is textbook. Literally. It is in the textbook.',
      'The big one! Common things are common, and you KNOW it!',
      'NUMBER ONE! I may need to sit down.'
    ],
    goodAnswer: [
      'It\'s up there! Nice!',
      'GOOD ANSWER! Good answer!',
      'On the board! That\'s clinical reasoning, folks.',
      'Yes! That one\'s in the differential!',
      'Look at that! The board agrees with you.',
      'Ding! I love that sound. I hear it in my sleep.',
      'Up there! Your attending would be proud.',
      'That\'s a real answer! Write it in the chart!',
      'Got it! Smooth like a well-timed epidural.'
    ],
    lowAnswer: [
      'It\'s up there... at the bottom. But up there!',
      'A deep cut! Respect the zebra-adjacent thinking.',
      'Not common, but it counts. Can\'t-miss diagnoses deserve love too.',
      'Small points, big brain.'
    ],
    wrong: [
      'Hmmm. Bold. Incorrect, but bold.',
      'The board says... no.',
      'Not up there. But I admire the confidence.',
      'Interesting. Let\'s see what the survey thinks about that... oh. Oh no.',
      'That\'s on a board somewhere. Not this one.',
      'I\'ll allow it. The board will not.',
      'Respectfully... no.',
      'Points for creativity. Zero points for the board, though.',
      'You know what? I\'ve thought that too. At 3 a.m. On call.'
    ],
    strike1: ['Strike one! Shake it off.', 'That\'s one. Everybody gets one.', 'Strike! Deep breath, back to the differential.', 'One strike. Totally fine. Totally fine.'],
    strike2: ['Strike two! Things are getting spicy.', 'Two strikes. Somebody hand them a cold compress.', 'That\'s two! Huddle up, think common.', 'Two! I am nervous FOR you.'],
    strike3: ['THREE STRIKES!', 'And that is... STRIKE THREE!', 'Oh no. Oh NO. Three strikes!', 'Strike three! The other side is already whispering!'],
    stealSetup: ['{O}, you have ONE chance to steal it all!', 'Huddle up, {O}! One answer steals the bank!', '{O}, the bank is on the table. One guess. Make it count.', 'STEAL TIME! {O}, put your heads together.'],
    stealWin: ['STOLEN! {T} takes the bank!', 'They did it! A clean steal by {T}!', 'Robbery in broad daylight! {T}, that\'s yours!', 'Steal successful! I\'ve seen less smooth handoffs at shift change.'],
    stealFail: ['No steal! The points stay with {T}!', 'Not up there! {T} keeps the bank!', 'The steal falls short! {T}, you get to keep those.', 'Close... but {T} keeps it!'],
    playPass: ['{T}, you won the face-off. PLAY or PASS?', '{T}! Do you play this one, or pass it to {O}?', 'Big decision, {T}: play or pass?'],
    play: ['They\'re playing it! Let\'s go!', 'Playing! Love the confidence.', 'They want it! Here we go!'],
    pass: ['A pass! Strategic. Spooky.', 'They pass! {O}, you\'re up!', 'Passing! Bold move. Let\'s see if it pays off.'],
    clear: ['THEY CLEARED THE BOARD!', 'A CLEAN SWEEP! Every answer! I\'m emotional!', 'The whole board! Somebody call the residency director!'],
    roundWin: ['{T} takes the round with {P} points!', '{P} points to {T}! Well played!', 'And {T} banks {P}! Beautiful.'],
    matchWin: ['{T} WINS FEUD & DELIVERY! Time for FAST MONEY!', 'WE HAVE A WINNER! {T}! The clinic is proud!', '{T} takes it! I need a moment. And maybe a snack.'],
    soloLose: ['The Night Float takes it this time... they never sleep, so they study a lot.', 'Night Float wins! Don\'t worry, they\'ll be too tired to gloat.', 'So close! Rematch? I\'ll get the coffee.'],
    fmIntro: ['FAST MONEY! Five conditions, one clock, 200 points to win!', 'Welcome to FAST MONEY! Think fast, type faster!', 'It\'s FAST MONEY time! Say the first thing that comes into your differential!'],
    fmSeat2: ['Player two! Don\'t repeat your partner\'s answers. You need {P}!', 'Player two, you need {P} more. No pressure. Some pressure.', 'Player two! Same five, new answers. Let\'s go!'],
    fmWin: ['YOU DID IT! 200 POINTS! Somebody get the confetti! Oh, there\'s confetti!', 'FAST MONEY WINNER! I\'m doing my happy dance!', 'OVER 200! That\'s board-certified brilliance!'],
    fmLose: ['So close! You\'re still winners in my clinic.', 'Not quite 200, but those were real differentials. I\'m proud.', 'Short of 200... but what a run! Applause, everybody!'],
    gag: [
      'Survey says... NOPE.',
      'I\'m going to pretend I didn\'t hear that.',
      'That one is not in any textbook I own. And I own many.',
      'Wow. Okay. Strike, but a funny strike.',
      'I\'m putting that in the chart as "creative."',
      'The board is laughing. The board does not laugh often.'
    ],
    bonus: [
      'Mercury in retrograde', 'The fax machine ate the results', 'Prior authorization still pending', 'Dr. Google\'s second opinion',
      'Too much Grey\'s Anatomy', 'The stork took a wrong turn', 'A ghost in the EHR', 'WebMD said so', 'The printer is jammed again', 'It was a full moon on L&D'
    ],
    cameo: ['I just came in for my annual!', 'Wait... is that covered by insurance?', 'Should I be writing this down?', 'Is that a real thing?!', 'Can I get that in writing?', 'My cousin said the same thing!', 'Is this the line for flu shots?'],
    idle: ['Take your time. Not too much time. The waiting room is filling up.', 'Think common! Then think dangerous!', 'You\'ve got this. Probably.'],
    rivalTalk: ['Night Float: "We\'ve been awake for 26 hours. We are UNSTOPPABLE."', 'Night Float: "Is it morning? Doesn\'t matter. Buzz."', 'Night Float: "We read this at 4 a.m. It counts."', 'Night Float: "Coffee in, differentials out."']
  };
  root.FeudBanter = B;
})(typeof window !== 'undefined' ? window : globalThis);
