/* AGE OF EMBERS — game data: ages, units, buildings, technologies */
(function (E) {
  'use strict';
  const D = E.D = {};
  D.RES = ['f', 'w', 'g', 's'];
  D.RESNAME = { f: 'Food', w: 'Wood', g: 'Gold', s: 'Stone' };
  D.AGES = [
    { name: 'Hearth Age', short: 'HEARTH', roman: 'I' },
    { name: 'Bronze Age', short: 'BRONZE', roman: 'II' },
    { name: 'Iron Age', short: 'IRON', roman: 'III' },
    { name: 'Imperial Age', short: 'IMPERIAL', roman: 'IV' }
  ];
  D.COLORS = [
    { name: 'Azure', c: '#2f7de1', d: '#1b4b8c', l: '#8cc0ff' },
    { name: 'Crimson', c: '#d8383a', d: '#86191d', l: '#ff9a8f' },
    { name: 'Saffron', c: '#e9b324', d: '#94690a', l: '#ffe28a' },
    { name: 'Jade', c: '#2fae6a', d: '#17663b', l: '#8ff0b6' },
    { name: 'Violet', c: '#8d55d6', d: '#4f2a85', l: '#d2b2ff' },
    { name: 'Teal', c: '#20b2b8', d: '#0e6467', l: '#97f2f2' }
  ];
  // ---- units ----  stats arrays are per tier
  D.UNITS = {
    villager: { name: 'Villager', cls: 'villager', hp: [25], atk: [3], dmg: 'm', range: [0.35], rate: 2.0, am: [0], ap: [1], speed: [1.15], los: 4, cost: { f: 50 }, time: 20, from: 'towncenter', r: 0.27, age: 0,
      desc: 'Gathers wood, food, gold and stone; builds and repairs.' },
    infantry: { tiers: ['Clubman', 'Axeman', 'Swordsman', 'Legionary'], cls: 'infantry', hp: [40, 50, 62, 78], atk: [4, 6, 8, 11], dmg: 'm', range: [0.35], rate: 2.0, am: [0, 0, 1, 2], ap: [0, 0, 1, 1], speed: [1.0], los: 5, cost: { f: 60, g: 20 }, time: 18, from: 'barracks', r: 0.28, age: 0,
      bonus: { spear: 5, building: 3, villager: 2 }, desc: 'Sturdy foot soldier. Strong vs spearmen and buildings; weak vs archers.' },
    spear: { tiers: ['Spearman', 'Pikeman', 'Halberdier'], cls: 'spear', hp: [45, 55, 62], atk: [3, 4, 6], dmg: 'm', range: [0.5], rate: 3.0, am: [0], ap: [0], speed: [1.0], los: 5, cost: { f: 35, w: 25 }, time: 16, from: 'barracks', r: 0.28, age: 1,
      bonus: { cavalry: [16, 24, 32], ship: 0 }, desc: 'Cheap anti-cavalry. Strong vs cavalry; weak vs archers and infantry.' },
    archer: { tiers: ['Archer', 'Crossbowman', 'Arbalest'], cls: 'archer', hp: [30, 35, 40], atk: [4, 5, 6], dmg: 'p', range: [4, 5, 5.5], rate: 2.0, am: [0], ap: [0], speed: [0.96], los: 6, cost: { w: 25, g: 45 }, time: 20, from: 'archery', r: 0.27, age: 1,
      bonus: { spear: 3, infantry: 2 }, desc: 'Ranged. Strong vs infantry and spearmen; weak vs cavalry and siege.' },
    scout: { name: 'Scout Rider', cls: 'cavalry', hp: [45], atk: [4], dmg: 'm', range: [0.4], rate: 2.0, am: [0], ap: [2], speed: [1.75], los: 7, cost: { f: 80 }, time: 24, from: 'stable', r: 0.36, age: 1,
      bonus: { archer: 3, siege: 6, villager: 2 }, desc: 'Fast, cheap light cavalry. Raids villagers, hunts archers and siege.' },
    knight: { tiers: ['Knight', 'Paladin'], cls: 'cavalry', hp: [100, 135], atk: [10, 13], dmg: 'm', range: [0.4], rate: 1.8, am: [2, 2], ap: [2, 3], speed: [1.45], los: 5, cost: { f: 60, g: 75 }, time: 28, from: 'stable', r: 0.38, age: 2,
      bonus: { archer: 2, siege: 8 }, desc: 'Heavy cavalry. Strong vs archers and siege; weak vs spearmen.' },
    ram: { tiers: ['Battering Ram', 'Siege Ram'], cls: 'siege', hp: [180, 260], atk: [2, 3], dmg: 'm', range: [0.4], rate: 5.0, am: [0], ap: [150], speed: [0.62], los: 3, cost: { w: 160, g: 75 }, time: 36, from: 'siegeworks', r: 0.45, age: 2,
      bonus: { building: [48, 70] }, attacksOnly: 'building', desc: 'Smashes buildings and walls; immune to arrows. Helpless vs melee.' },
    catapult: { tiers: ['Catapult', 'Onager'], cls: 'siege', hp: [60, 70], atk: [26, 36], dmg: 'm', range: [7, 7.5], minRange: 3, splash: 1.0, rate: 6.0, am: [0], ap: [6], speed: [0.6], los: 8, cost: { w: 160, g: 135 }, time: 36, from: 'siegeworks', r: 0.45, age: 2,
      bonus: { building: 16, wall: 30 }, desc: 'Hurls stones that crush packed troops and buildings. Has a minimum range.' },
    fishboat: { name: 'Fishing Boat', cls: 'ship', naval: true, hp: [60], atk: [0], dmg: 'p', range: [0], rate: 2, am: [0], ap: [4], speed: [1.35], los: 5, cost: { w: 75 }, time: 30, from: 'dock', r: 0.42, age: 0,
      desc: 'Catches fish and brings it to a dock.' },
    galley: { tiers: ['Galley', 'War Galley'], cls: 'ship', naval: true, hp: [120, 150], atk: [6, 8], dmg: 'p', range: [5, 6], rate: 3.0, am: [0], ap: [6], speed: [1.4], los: 7, cost: { w: 90, g: 30 }, time: 36, from: 'dock', r: 0.5, age: 1,
      bonus: { ship: 6, building: 3 }, desc: 'Warship. Bombards ships and anything near the shore.' },
    deer: { name: 'Deer', cls: 'animal', gaia: true, hp: [8], atk: [0], dmg: 'm', range: [0], rate: 2, am: [0], ap: [0], speed: [1.05], los: 4, r: 0.3, food: 110 }
  };
  // ---- buildings ----
  D.BUILD = {
    towncenter: { name: 'Town Center', size: 3, hp: 2400, cost: { w: 275, s: 100 }, time: 150, pop: 5, drop: 'fwgs', los: 8, atk: { dmg: 5, range: 6, rate: 2.2 }, age: 1, trains: ['villager'], techs: ['loom', 'wheelbarrow', 'handcart', 'age1', 'age2', 'age3'], am: 3, ap: 5,
      desc: 'Trains villagers, researches the ages. Accepts every resource. Shoots arrows at enemies.' },
    house: { name: 'House', size: 2, hp: 550, cost: { w: 30 }, time: 22, pop: 5, los: 2, am: 0, ap: 5, desc: 'Supports 5 population.' },
    lumbercamp: { name: 'Lumber Camp', size: 2, hp: 600, cost: { w: 100 }, time: 30, drop: 'w', los: 3, techs: ['axe1', 'axe2', 'axe3'], am: 0, ap: 5, desc: 'Drop-off for wood. Woodcutting upgrades.' },
    miningcamp: { name: 'Mining Camp', size: 2, hp: 600, cost: { w: 100 }, time: 30, drop: 'gs', los: 3, techs: ['gold1', 'stone1', 'gold2'], am: 0, ap: 5, desc: 'Drop-off for gold and stone. Mining upgrades.' },
    mill: { name: 'Mill', size: 2, hp: 600, cost: { w: 100 }, time: 30, drop: 'f', los: 3, techs: ['farm1', 'farm2', 'farm3'], am: 0, ap: 5, desc: 'Drop-off for food. Lets you build farms. Farming upgrades.' },
    farm: { name: 'Farm', size: 3, hp: 400, cost: { w: 60 }, time: 14, walk: true, food: 250, los: 1, req: 'mill', am: 0, ap: 0, desc: 'One villager farms endless food (250 per sowing, re-sown for 60 wood).' },
    barracks: { name: 'Barracks', size: 3, hp: 1200, cost: { w: 175 }, time: 45, los: 4, trains: ['infantry', 'spear'], techs: ['axeman', 'swordsman', 'legionary', 'pikeman', 'halberdier'], am: 0, ap: 6, desc: 'Trains infantry and spearmen.' },
    dock: { name: 'Dock', size: 3, hp: 1400, cost: { w: 150 }, time: 35, drop: 'f', naval: true, los: 5, trains: ['fishboat', 'galley'], techs: ['gillnets', 'wargalley'], am: 0, ap: 6, desc: 'Built on shoreline water. Fishing boats and warships.' },
    archery: { name: 'Archery Range', size: 3, hp: 1200, cost: { w: 175 }, time: 45, age: 1, los: 4, trains: ['archer'], techs: ['crossbow', 'arbalest', 'thumbring'], am: 0, ap: 6, desc: 'Trains archers.' },
    stable: { name: 'Stable', size: 3, hp: 1200, cost: { w: 175 }, time: 45, age: 1, los: 4, trains: ['scout', 'knight'], techs: ['husbandry', 'paladin'], am: 0, ap: 6, desc: 'Trains cavalry.' },
    blacksmith: { name: 'Blacksmith', size: 3, hp: 1200, cost: { w: 150 }, time: 40, age: 1, los: 3, techs: ['forge1', 'forge2', 'forge3', 'fletch1', 'fletch2', 'scale1', 'scale2', 'pad1', 'pad2', 'bard1', 'bard2'], am: 0, ap: 6, desc: 'Attack and armor upgrades.' },
    market: { name: 'Market', size: 3, hp: 1300, cost: { w: 175 }, time: 45, age: 1, los: 4, techs: ['coinage', 'guilds'], trade: true, am: 0, ap: 6, desc: 'Buy and sell resources for gold.' },
    tower: { name: 'Watch Tower', size: 2, hp: 1000, cost: { w: 25, s: 125 }, time: 45, age: 1, los: 9, atk: { dmg: 6, range: 7, rate: 2.0 }, am: 1, ap: 7, desc: 'Shoots arrows at enemies in range.' },
    palisade: { name: 'Palisade Wall', size: 1, hp: 260, cost: { w: 3 }, time: 4, wall: true, los: 1, am: 2, ap: 5, desc: 'Cheap wooden wall. Drag to build a line.' },
    wall: { name: 'Stone Wall', size: 1, hp: 1600, cost: { s: 5 }, time: 7, age: 1, wall: true, los: 1, am: 6, ap: 8, desc: 'Strong stone wall. Drag to build a line.' },
    siegeworks: { name: 'Siege Works', size: 3, hp: 1200, cost: { w: 200 }, time: 50, age: 2, los: 4, trains: ['ram', 'catapult'], techs: ['siegeram', 'onager'], am: 0, ap: 6, desc: 'Builds rams and catapults.' },
    academy: { name: 'Academy', size: 3, hp: 1400, cost: { w: 200 }, time: 50, age: 2, los: 4, techs: ['masonry', 'ballistics', 'guardtower', 'architecture'], am: 0, ap: 6, desc: 'Building, tower and arrow sciences.' },
    wonder: { name: 'Wonder: The Eternal Flame', size: 5, hp: 4500, cost: { w: 800, g: 600, s: 600 }, time: 600, age: 3, los: 6, am: 4, ap: 10, desc: 'Keep it standing for 3:00 to win the game.' }
  };
  D.BUILD_ORDER = ['house', 'lumbercamp', 'miningcamp', 'mill', 'farm', 'barracks', 'dock', 'palisade', 'archery', 'stable', 'blacksmith', 'market', 'tower', 'wall', 'towncenter', 'siegeworks', 'academy', 'wonder'];
  D.WONDER_TIME = 180;
  D.AGE_REQ = [null,
    { cost: { f: 400 }, time: 60, need: 2, from: ['lumbercamp', 'miningcamp', 'mill', 'barracks', 'dock'] },
    { cost: { f: 600, g: 150 }, time: 80, need: 2, from: ['archery', 'stable', 'blacksmith', 'market'] },
    { cost: { f: 800, g: 500 }, time: 100, need: 2, from: ['siegeworks', 'academy', 'market'] }];
  // ---- technologies ----  fx(player) applies the effect
  const T = D.TECH = {};
  const tech = (k, o) => { T[k] = Object.assign({ key: k }, o); };
  tech('age1', { name: 'Advance to the Bronze Age', icon: 'age', age: 0, at: 'towncenter', ageUp: 1 });
  tech('age2', { name: 'Advance to the Iron Age', icon: 'age', age: 1, at: 'towncenter', ageUp: 2 });
  tech('age3', { name: 'Advance to the Imperial Age', icon: 'age', age: 2, at: 'towncenter', ageUp: 3 });
  tech('loom', { name: 'Loom', icon: 'loom', age: 0, at: 'towncenter', cost: { g: 50 }, time: 25, desc: 'Villagers +15 HP, +1/+2 armor.', fx: p => { p.m.vilHp += 15; p.m.vilAm += 1; p.m.vilAp += 2; } });
  tech('wheelbarrow', { name: 'Wheelbarrow', icon: 'cart', age: 1, at: 'towncenter', cost: { f: 175, w: 50 }, time: 45, desc: 'Villagers carry +5 and move 10% faster.', fx: p => { p.m.carry += 5; p.m.vilSpeed *= 1.1; } });
  tech('handcart', { name: 'Hand Cart', icon: 'cart', age: 2, at: 'towncenter', cost: { f: 300, w: 200 }, time: 55, req: 'wheelbarrow', desc: 'Villagers carry +5 more and move 10% faster.', fx: p => { p.m.carry += 5; p.m.vilSpeed *= 1.1; } });
  tech('axe1', { name: 'Double-Bit Axe', icon: 'axe', age: 1, at: 'lumbercamp', cost: { f: 100, w: 50 }, time: 25, desc: 'Woodcutting +20%.', fx: p => { p.m.w *= 1.2; } });
  tech('axe2', { name: 'Bow Saw', icon: 'axe', age: 2, at: 'lumbercamp', cost: { f: 150, w: 100 }, time: 40, req: 'axe1', desc: 'Woodcutting +20%.', fx: p => { p.m.w *= 1.2; } });
  tech('axe3', { name: 'Two-Man Saw', icon: 'axe', age: 3, at: 'lumbercamp', cost: { f: 300, w: 200 }, time: 50, req: 'axe2', desc: 'Woodcutting +10%.', fx: p => { p.m.w *= 1.1; } });
  tech('gold1', { name: 'Gold Mining', icon: 'pick', age: 1, at: 'miningcamp', cost: { f: 100, w: 75 }, time: 30, desc: 'Gold mining +15%.', fx: p => { p.m.g *= 1.15; } });
  tech('stone1', { name: 'Stone Mining', icon: 'pick', age: 1, at: 'miningcamp', cost: { f: 100, w: 75 }, time: 30, desc: 'Stone mining +15%.', fx: p => { p.m.s *= 1.15; } });
  tech('gold2', { name: 'Gold Shaft Mining', icon: 'pick', age: 2, at: 'miningcamp', cost: { f: 200, w: 100 }, time: 45, req: 'gold1', desc: 'Gold mining +15%.', fx: p => { p.m.g *= 1.15; } });
  tech('farm1', { name: 'Horse Collar', icon: 'plow', age: 1, at: 'mill', cost: { f: 75, w: 75 }, time: 20, desc: 'Farms +20% food rate and +50 food.', fx: p => { p.m.farm *= 1.2; p.m.farmFood += 50; } });
  tech('farm2', { name: 'Heavy Plow', icon: 'plow', age: 2, at: 'mill', cost: { f: 125, w: 125 }, time: 40, req: 'farm1', desc: 'Farms +20% food rate and +75 food.', fx: p => { p.m.farm *= 1.2; p.m.farmFood += 75; } });
  tech('farm3', { name: 'Crop Rotation', icon: 'plow', age: 3, at: 'mill', cost: { f: 250, w: 250 }, time: 50, req: 'farm2', desc: 'Farms +15% food rate and +100 food.', fx: p => { p.m.farm *= 1.15; p.m.farmFood += 100; } });
  tech('forge1', { name: 'Forging', icon: 'sword', age: 1, at: 'blacksmith', cost: { f: 150 }, time: 35, desc: 'Infantry, spearmen and cavalry +1 attack.', fx: p => { p.m.atkM += 1; } });
  tech('forge2', { name: 'Iron Casting', icon: 'sword', age: 2, at: 'blacksmith', cost: { f: 220, g: 120 }, time: 50, req: 'forge1', desc: 'Infantry, spearmen and cavalry +1 attack.', fx: p => { p.m.atkM += 1; } });
  tech('forge3', { name: 'Blast Furnace', icon: 'sword', age: 3, at: 'blacksmith', cost: { f: 275, g: 225 }, time: 60, req: 'forge2', desc: 'Infantry, spearmen and cavalry +2 attack.', fx: p => { p.m.atkM += 2; } });
  tech('fletch1', { name: 'Fletching', icon: 'arrow', age: 1, at: 'blacksmith', cost: { f: 100, g: 50 }, time: 30, desc: 'Archers, galleys, towers and town centers +1 attack, +1 range.', fx: p => { p.m.atkP += 1; p.m.rangeP += 1; } });
  tech('fletch2', { name: 'Bodkin Arrow', icon: 'arrow', age: 2, at: 'blacksmith', cost: { f: 200, g: 100 }, time: 45, req: 'fletch1', desc: 'Archers, galleys, towers and town centers +1 attack, +1 range.', fx: p => { p.m.atkP += 1; p.m.rangeP += 1; } });
  tech('scale1', { name: 'Scale Mail', icon: 'shield', age: 1, at: 'blacksmith', cost: { f: 100 }, time: 30, desc: 'Infantry and spearmen +1/+1 armor.', fx: p => { p.m.infAm += 1; p.m.infAp += 1; } });
  tech('scale2', { name: 'Chain Mail', icon: 'shield', age: 2, at: 'blacksmith', cost: { f: 200, g: 100 }, time: 45, req: 'scale1', desc: 'Infantry and spearmen +1/+1 armor.', fx: p => { p.m.infAm += 1; p.m.infAp += 1; } });
  tech('pad1', { name: 'Padded Archer Armor', icon: 'shield', age: 1, at: 'blacksmith', cost: { f: 100 }, time: 30, desc: 'Archers +1/+1 armor.', fx: p => { p.m.arcAm += 1; p.m.arcAp += 1; } });
  tech('pad2', { name: 'Leather Archer Armor', icon: 'shield', age: 2, at: 'blacksmith', cost: { f: 150, g: 150 }, time: 45, req: 'pad1', desc: 'Archers +1/+1 armor.', fx: p => { p.m.arcAm += 1; p.m.arcAp += 1; } });
  tech('bard1', { name: 'Scale Barding', icon: 'horse', age: 1, at: 'blacksmith', cost: { f: 150 }, time: 35, desc: 'Cavalry +1/+1 armor.', fx: p => { p.m.cavAm += 1; p.m.cavAp += 1; } });
  tech('bard2', { name: 'Chain Barding', icon: 'horse', age: 2, at: 'blacksmith', cost: { f: 250, g: 150 }, time: 50, req: 'bard1', desc: 'Cavalry +1/+1 armor.', fx: p => { p.m.cavAm += 1; p.m.cavAp += 1; } });
  tech('axeman', { name: 'Axeman', icon: 'up', age: 1, at: 'barracks', cost: { f: 100, g: 40 }, time: 30, desc: 'Upgrade Clubmen to Axemen.', fx: p => { p.tier.infantry = Math.max(p.tier.infantry, 1); } });
  tech('swordsman', { name: 'Swordsman', icon: 'up', age: 2, at: 'barracks', cost: { f: 150, g: 65 }, time: 40, req: 'axeman', desc: 'Upgrade Axemen to Swordsmen.', fx: p => { p.tier.infantry = Math.max(p.tier.infantry, 2); } });
  tech('legionary', { name: 'Legionary', icon: 'up', age: 3, at: 'barracks', cost: { f: 250, g: 150 }, time: 50, req: 'swordsman', desc: 'Upgrade Swordsmen to Legionaries.', fx: p => { p.tier.infantry = 3; } });
  tech('pikeman', { name: 'Pikeman', icon: 'up', age: 2, at: 'barracks', cost: { f: 200, w: 90 }, time: 40, desc: 'Upgrade Spearmen to Pikemen.', fx: p => { p.tier.spear = Math.max(p.tier.spear, 1); } });
  tech('halberdier', { name: 'Halberdier', icon: 'up', age: 3, at: 'barracks', cost: { f: 300, w: 200 }, time: 50, req: 'pikeman', desc: 'Upgrade Pikemen to Halberdiers.', fx: p => { p.tier.spear = 2; } });
  tech('crossbow', { name: 'Crossbowman', icon: 'up', age: 2, at: 'archery', cost: { f: 125, g: 75 }, time: 35, desc: 'Upgrade Archers to Crossbowmen.', fx: p => { p.tier.archer = Math.max(p.tier.archer, 1); } });
  tech('arbalest', { name: 'Arbalest', icon: 'up', age: 3, at: 'archery', cost: { f: 300, g: 250 }, time: 50, req: 'crossbow', desc: 'Upgrade Crossbowmen to Arbalests.', fx: p => { p.tier.archer = 2; } });
  tech('thumbring', { name: 'Thumb Ring', icon: 'arrow', age: 2, at: 'archery', cost: { f: 250, w: 150 }, time: 45, desc: 'Archers shoot 18% faster.', fx: p => { p.m.arcRate *= 0.85; } });
  tech('husbandry', { name: 'Husbandry', icon: 'horse', age: 1, at: 'stable', cost: { f: 150 }, time: 30, desc: 'Cavalry move 10% faster.', fx: p => { p.m.cavSpeed *= 1.1; } });
  tech('paladin', { name: 'Paladin', icon: 'up', age: 3, at: 'stable', cost: { f: 600, g: 400 }, time: 60, desc: 'Upgrade Knights to Paladins.', fx: p => { p.tier.knight = 1; } });
  tech('siegeram', { name: 'Siege Ram', icon: 'up', age: 3, at: 'siegeworks', cost: { f: 300, g: 200 }, time: 45, desc: 'Upgrade Battering Rams to Siege Rams.', fx: p => { p.tier.ram = 1; } });
  tech('onager', { name: 'Onager', icon: 'up', age: 3, at: 'siegeworks', cost: { f: 400, g: 300 }, time: 50, desc: 'Upgrade Catapults to Onagers.', fx: p => { p.tier.catapult = 1; } });
  tech('gillnets', { name: 'Gillnets', icon: 'fish', age: 1, at: 'dock', cost: { f: 150, w: 150 }, time: 35, desc: 'Fishing boats +25% catch rate.', fx: p => { p.m.fish *= 1.25; } });
  tech('wargalley', { name: 'War Galley', icon: 'up', age: 2, at: 'dock', cost: { f: 230, g: 100 }, time: 45, desc: 'Upgrade Galleys to War Galleys.', fx: p => { p.tier.galley = 1; } });
  tech('masonry', { name: 'Masonry', icon: 'brick', age: 2, at: 'academy', cost: { w: 150, s: 175 }, time: 40, desc: 'Buildings +15% HP, +1/+1 armor.', fx: p => { p.m.bldHp *= 1.15; p.m.bldArm += 1; } });
  tech('architecture', { name: 'Architecture', icon: 'brick', age: 3, at: 'academy', cost: { w: 300, s: 200 }, time: 50, req: 'masonry', desc: 'Buildings +15% HP and build 20% faster.', fx: p => { p.m.bldHp *= 1.15; p.m.buildSpd *= 1.2; } });
  tech('ballistics', { name: 'Ballistics', icon: 'arrow', age: 2, at: 'academy', cost: { w: 300, g: 175 }, time: 45, desc: 'Towers and town centers +2 attack.', fx: p => { p.m.towerAtk += 2; } });
  tech('guardtower', { name: 'Guard Tower', icon: 'tower', age: 2, at: 'academy', cost: { f: 100, s: 250 }, time: 45, desc: 'Towers +40% HP and +1 range.', fx: p => { p.m.towerHp *= 1.4; p.m.towerRange += 1; } });
  tech('coinage', { name: 'Coinage', icon: 'coin', age: 1, at: 'market', cost: { f: 100, g: 50 }, time: 30, desc: 'Gold mining +10%. Market fee drops to 20%.', fx: p => { p.m.g *= 1.1; p.m.fee = 0.2; } });
  tech('guilds', { name: 'Guilds', icon: 'coin', age: 2, at: 'market', cost: { f: 200, g: 150 }, time: 40, req: 'coinage', desc: 'Market fee drops to 10%.', fx: p => { p.m.fee = 0.1; } });
  for (let a = 1; a <= 3; a++) { const t = T['age' + a], r = D.AGE_REQ[a]; t.cost = r.cost; t.time = r.time; t.desc = 'Requires ' + r.need + ' of: ' + r.from.map(k => D.BUILD[k].name).join(', ') + '.'; }
  D.newMods = () => ({ f: 1, w: 1, g: 1, s: 1, farm: 1, fish: 1, hunt: 1, berry: 1, carry: 10, vilSpeed: 1, vilHp: 0, vilAm: 0, vilAp: 0, atkM: 0, atkP: 0, rangeP: 0, infAm: 0, infAp: 0, arcAm: 0, arcAp: 0, cavAm: 0, cavAp: 0, arcRate: 1, cavSpeed: 1, bldHp: 1, bldArm: 0, buildSpd: 1, towerAtk: 0, towerHp: 1, towerRange: 0, farmFood: 0, fee: 0.3, gather: 1 });
  D.GATHER = { tree: 0.6, berry: 0.5, carcass: 0.7, farm: 0.52, gold: 0.52, stone: 0.5, fish: 0.6 };
  D.RESOF = { tree: 'w', berry: 'f', carcass: 'f', farm: 'f', gold: 'g', stone: 's', fish: 'f' };
  D.costStr = (c) => Object.keys(c || {}).map(k => c[k] + ' ' + D.RESNAME[k]).join(', ');
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
