// Jax's Adventures - items, fish, shop, trades, quests, characters
export const ITEMS = {
  // food (grabbed from picnics/coolers, foraged)
  sandwich: { name: 'Sandwich', icon: '🥪', cat: 'food', value: 8 }, apple: { name: 'Apple', icon: '🍎', cat: 'food', value: 4 },
  hotdog: { name: 'Hot Dog', icon: '🌭', cat: 'food', value: 9 }, watermelon: { name: 'Watermelon', icon: '🍉', cat: 'food', value: 14 },
  cookies: { name: 'Cookies', icon: '🍪', cat: 'food', value: 7 }, marshmallows: { name: 'Marshmallows', icon: '🍡', cat: 'food', value: 6 },
  chocolate: { name: 'Chocolate Bar', icon: '🍫', cat: 'food', value: 7 }, soda: { name: 'Soda', icon: '🥤', cat: 'food', value: 5 },
  cheese: { name: 'Cheese', icon: '🧀', cat: 'food', value: 8 }, corn: { name: 'Corn', icon: '🌽', cat: 'food', value: 6 },
  donut: { name: 'Donut', icon: '🍩', cat: 'food', value: 10 }, pie: { name: 'Cherry Pie', icon: '🥧', cat: 'food', value: 22 },
  berries: { name: 'Wild Berries', icon: '🫐', cat: 'food', value: 5 }, popcorn: { name: 'Popcorn', icon: '🍿', cat: 'food', value: 6 },
  // cooked
  grilledfish: { name: 'Grilled Fish', icon: '🍢', cat: 'cooked', value: 0 }, smores: { name: "S'mores", icon: '🥮', cat: 'cooked', value: 26 },
  roastdog: { name: 'Roasted Hot Dog', icon: '🌭', cat: 'cooked', value: 17 }, berrypie: { name: 'Berry Pie', icon: '🥧', cat: 'cooked', value: 30 },
  // collectibles
  acorn: { name: 'Golden Acorn', icon: '🌰', cat: 'collectible', value: 0, keep: true }, feather: { name: 'Blue Jay Feather', icon: '🪶', cat: 'collectible', value: 12 },
  seashell: { name: 'Lake Shell', icon: '🐚', cat: 'collectible', value: 10 }, geode: { name: 'Sparkly Geode', icon: '💎', cat: 'collectible', value: 30 },
  oldcoin: { name: 'Old Coin', icon: '🪙', cat: 'collectible', value: 25 }, pinecone: { name: 'Giant Pinecone', icon: '🌲', cat: 'collectible', value: 8 },
  // junk / quest
  boot: { name: 'Old Boot', icon: '👢', cat: 'junk', value: 1 }, tincan: { name: 'Tin Can', icon: '🥫', cat: 'junk', value: 1 },
  sunglasses: { name: "Dev's Sunglasses", icon: '🕶️', cat: 'quest', value: 0, keep: true },
};
export const FOODS = ['sandwich', 'apple', 'hotdog', 'watermelon', 'cookies', 'marshmallows', 'chocolate', 'soda', 'cheese', 'corn', 'donut', 'popcorn'];

// rarity weights: common 1, uncommon 2, rare 3, legendary 4
export const FISH = [
  // lake (shore / dock)
  { id: 'bluegill', name: 'Bluegill', loc: ['lake'], time: 'any', rod: 1, w: 30, size: [12, 24], value: 8, str: 1.0, r: 1, col: ['#4f6f6a', '#e8b55a', '#2b3d52'], pat: 'bars', hint: 'Lake shore, any time' },
  { id: 'perch', name: 'Yellow Perch', loc: ['lake'], time: 'day', rod: 1, w: 26, size: [15, 30], value: 10, str: 1.2, r: 1, col: ['#c9b43a', '#f1e7b8', '#3d4a1f'], pat: 'bars', hint: 'Lake, daytime' },
  { id: 'pumpkinseed', name: 'Pumpkinseed', loc: ['lake'], time: 'day', rod: 1, w: 18, size: [10, 20], value: 9, str: 1.0, r: 1, col: ['#5f8a55', '#f28a2e', '#2f9fb0'], pat: 'spots', hint: 'Lake, daytime' },
  { id: 'crappie', name: 'Black Crappie', loc: ['lake'], time: 'dusk', rod: 1, w: 16, size: [18, 35], value: 14, str: 1.5, r: 2, col: ['#7c8a86', '#dfe6e0', '#222'], pat: 'spots', hint: 'Lake, dawn, dusk or night' },
  { id: 'bullhead', name: 'Bullhead Catfish', loc: ['lake', 'river'], time: 'night', rod: 1, w: 14, size: [20, 40], value: 16, str: 2.0, r: 2, col: ['#4a3a2a', '#c7b48c', '#2a2018'], pat: 'none', hint: 'Lake or river at night' },
  { id: 'lmbass', name: 'Largemouth Bass', loc: ['lake'], time: 'any', rod: 2, w: 13, size: [25, 60], value: 28, str: 2.6, r: 2, col: ['#5d7a3a', '#e8e4c0', '#2c3a1a'], pat: 'stripe', hint: 'Lake - needs a Bamboo Rod' },
  { id: 'pike', name: 'Northern Pike', loc: ['lake', 'deep'], time: 'any', rod: 3, w: 6, size: [50, 110], value: 55, str: 3.6, r: 3, col: ['#55703f', '#efe8c0', '#d8e0a0'], pat: 'spots', hint: 'Lake - needs a Fiberglass Rod' },
  { id: 'ghostcarp', name: 'Ghost Carp', loc: ['lake'], time: 'any', rod: 4, w: 2.5, rain: true, size: [70, 100], value: 450, str: 4.6, r: 4, col: ['#e8eef0', '#ffffff', '#b8c8d0'], pat: 'scales', hint: 'Legendary! Lake, only in the rain, Carbon Pro Rod' },
  // river
  { id: 'brooktrout', name: 'Brook Trout', loc: ['river'], time: 'any', rod: 1, w: 26, size: [15, 35], value: 12, str: 1.4, r: 1, col: ['#3c5a46', '#f07a3a', '#e8d070'], pat: 'spots', hint: 'River, any time' },
  { id: 'rainbow', name: 'Rainbow Trout', loc: ['river'], time: 'day', rod: 1, w: 20, size: [25, 60], value: 22, str: 2.2, r: 1, col: ['#6f8a6a', '#f2e8e0', '#e86a8a'], pat: 'stripe', hint: 'River, daytime' },
  { id: 'smallmouth', name: 'Smallmouth Bass', loc: ['river'], time: 'day', rod: 2, w: 12, size: [25, 50], value: 26, str: 2.6, r: 2, col: ['#8a6a3a', '#e8d8b0', '#4a3a1a'], pat: 'bars', hint: 'River, daytime - Bamboo Rod' },
  { id: 'browntrout', name: 'Brown Trout', loc: ['river'], time: 'dusk', rod: 2, w: 10, size: [30, 70], value: 38, str: 3.0, r: 2, col: ['#8a6a2a', '#f0dca0', '#c0402a'], pat: 'spots', hint: 'River at dawn/dusk/night - Bamboo Rod' },
  { id: 'goldentrout', name: 'Golden Trout', loc: ['river'], time: 'dusk', rod: 3, w: 4, size: [25, 45], value: 90, str: 2.6, r: 3, col: ['#e8b030', '#ffe080', '#d04030'], pat: 'stripe', hint: 'Rare! River at dawn or dusk - Fiberglass Rod' },
  { id: 'sturgeon', name: 'Lake Sturgeon', loc: ['river', 'deep'], time: 'any', rod: 4, w: 3, size: [90, 180], value: 130, str: 4.5, r: 3, col: ['#6a6a5a', '#c8c0a8', '#3a3a30'], pat: 'none', hint: 'Rare! River or deep lake - Carbon Pro Rod' },
  { id: 'oldwhiskers', name: 'Old Whiskers', loc: ['river'], time: 'night', rod: 3, w: 1.6, size: [140, 175], value: 400, str: 5.0, r: 4, col: ['#3a3020', '#a89870', '#1a1610'], pat: 'none', hint: 'Legendary catfish! River late at night - Fiberglass Rod' },
  // deep lake (canoe)
  { id: 'whitefish', name: 'Lake Whitefish', loc: ['deep'], time: 'any', rod: 1, w: 26, size: [30, 55], value: 18, str: 1.8, r: 1, col: ['#9aa8b0', '#f4f6f8', '#5a6a78'], pat: 'none', hint: 'Deep lake (canoe), any time' },
  { id: 'walleye', name: 'Walleye', loc: ['deep'], time: 'dusk', rod: 2, w: 16, size: [35, 70], value: 34, str: 2.6, r: 2, col: ['#9a8a3a', '#f0ead0', '#4a4020'], pat: 'bars', hint: 'Deep lake at dawn/dusk/night' },
  { id: 'laketrout', name: 'Lake Trout', loc: ['deep'], time: 'any', rod: 2, w: 14, size: [45, 90], value: 45, str: 3.0, r: 2, col: ['#4f5f62', '#e8ece8', '#d8dcc8'], pat: 'spots', hint: 'Deep lake - Bamboo Rod' },
  { id: 'muskie', name: 'Muskellunge', loc: ['deep'], time: 'day', rod: 3, w: 5, size: [80, 140], value: 110, str: 4.2, r: 3, col: ['#7a8a5a', '#efe8c8', '#3a4a2a'], pat: 'bars', hint: 'Rare! Deep lake, daytime - Fiberglass Rod' },
  { id: 'silverjaw', name: 'Silverjaw', loc: ['deep'], time: 'dusk', rod: 3, w: 7, lure: 'glow', size: [115, 135], value: 500, str: 5.0, r: 4, col: ['#8fa4b4', '#f8fbff', '#c8d8e8'], pat: 'spots', hint: 'Legendary lake trout! Deep lake at dawn or dusk with a Glow Lure' },
  // junk (not in journal species count)
  { id: 'boot', name: 'Old Boot', loc: ['lake', 'river', 'deep'], time: 'any', rod: 1, w: 4, junk: true, value: 1, str: 0.6, r: 0 },
  { id: 'tincan', name: 'Tin Can', loc: ['lake', 'river'], time: 'any', rod: 1, w: 3, junk: true, value: 1, str: 0.5, r: 0 },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));
export const SPECIES = FISH.filter(f => !f.junk);
export const RARITY = ['JUNK', 'COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY'];
export const RARITY_COL = ['#9a9a9a', '#e8e8e8', '#6fd36f', '#5fb0ff', '#ffc83a'];

export const RODS = [
  null,
  { id: 'rod1', name: 'Twig Rod', tier: 1, price: 0, desc: 'Gus\'s old starter rod.' },
  { id: 'rod2', name: 'Bamboo Rod', tier: 2, price: 60, desc: 'Longer casts, steadier line. Bass bite!' },
  { id: 'rod3', name: 'Fiberglass Rod', tier: 3, price: 180, desc: 'Tough enough for pike and big trout.' },
  { id: 'rod4', name: 'Carbon Pro Rod', tier: 4, price: 450, desc: 'Pro gear for sturgeon and monsters.' },
  { id: 'rod5', name: 'Golden Rod', tier: 5, price: 900, desc: 'Legendary. Huge hook window, super reel.' },
];

// shop catalogue
export const SHOP = [
  { id: 'rod2', cat: 'Rods', name: 'Bamboo Rod', price: 60, icon: '🎣', kind: 'rod', tier: 2, desc: 'Cast farther; catch bass.' },
  { id: 'rod3', cat: 'Rods', name: 'Fiberglass Rod', price: 180, icon: '🎣', kind: 'rod', tier: 3, desc: 'Pike, golden trout, legends.' },
  { id: 'rod4', cat: 'Rods', name: 'Carbon Pro Rod', price: 450, icon: '🎣', kind: 'rod', tier: 4, desc: 'Sturgeon & the Ghost Carp.' },
  { id: 'rod5', cat: 'Rods', name: 'Golden Rod', price: 900, icon: '✨', kind: 'rod', tier: 5, desc: 'The best rod in the park.' },
  { id: 'worms', cat: 'Bait', name: 'Worms x5', price: 10, icon: '🪱', kind: 'bait', n: 5, desc: 'Fish bite much faster.' },
  { id: 'spinner', cat: 'Bait', name: 'Spinner Lure', price: 40, icon: '🌀', kind: 'lure', desc: 'Faster bites, more trout & bass.' },
  { id: 'glow', cat: 'Bait', name: 'Glow Lure', price: 120, icon: '💡', kind: 'lure', desc: 'Shines in deep water and at night.' },
  { id: 'bike', cat: 'Travel', name: 'Mountain Bike', price: 150, icon: '🚲', kind: 'gear', desc: 'Zoom around the park. Press R.' },
  { id: 'canoe', cat: 'Travel', name: 'Canoe', price: 300, icon: '🛶', kind: 'gear', desc: 'Paddle the lake. Launch at the dock.' },
  { id: 'capshades', cat: 'Disguise', name: 'Cap & Shades', price: 50, icon: '🧢', kind: 'disguise', lvl: 1, desc: 'People are a bit less suspicious.' },
  { id: 'tourist', cat: 'Disguise', name: 'Tourist Kit', price: 140, icon: '📷', kind: 'disguise', lvl: 2, desc: 'Bucket hat & camera. Blend right in.' },
  { id: 'jrvest', cat: 'Disguise', name: 'Junior Ranger Vest', price: 320, icon: '🦺', kind: 'disguise', lvl: 3, desc: 'Even the ranger waves hello.' },
  { id: 'pack2', cat: 'Backpack', name: 'Day Pack (12)', price: 80, icon: '🎒', kind: 'pack', slots: 12, desc: 'Carry 12 things.' },
  { id: 'pack3', cat: 'Backpack', name: 'Hiking Pack (18)', price: 200, icon: '🎒', kind: 'pack', slots: 18, desc: 'Carry 18 things.' },
  { id: 'pack4', cat: 'Backpack', name: 'Expedition Pack (24)', price: 400, icon: '🎒', kind: 'pack', slots: 24, desc: 'Carry 24 things.' },
  { id: 'firepit', cat: 'Hideout', name: 'Fire Pit', price: 70, icon: '🔥', kind: 'decor', desc: 'Cook at home. Needed for a party!' },
  { id: 'lights', cat: 'Hideout', name: 'String Lights', price: 60, icon: '💡', kind: 'decor', desc: 'Cozy glowing lights.' },
  { id: 'hammock', cat: 'Hideout', name: 'Hammock', price: 90, icon: '🏝️', kind: 'decor', desc: 'Nap in style.' },
  { id: 'flag', cat: 'Hideout', name: 'Pirate Flag', price: 30, icon: '🏴', kind: 'decor', desc: 'Fly it on the tree fort.' },
  { id: 'swing', cat: 'Hideout', name: 'Tire Swing', price: 80, icon: '🛞', kind: 'decor', desc: 'Wheee!' },
  { id: 'gnome', cat: 'Hideout', name: 'Garden Gnome', price: 40, icon: '🧙', kind: 'decor', desc: 'He guards your stuff.' },
  { id: 'telescope', cat: 'Hideout', name: 'Telescope', price: 150, icon: '🔭', kind: 'decor', desc: 'Stargazing at night.' },
];
export const SHOP_BY_ID = Object.fromEntries(SHOP.map(s => [s.id, s]));

export const RECIPES = [
  { id: 'grilledfish', name: 'Grilled Fish', need: [{ cat: 'fish' }], desc: 'Any fish - worth 1.5x more' },
  { id: 'smores', name: "S'mores", need: [{ id: 'marshmallows' }, { id: 'chocolate' }], desc: 'Marshmallows + Chocolate' },
  { id: 'roastdog', name: 'Roasted Hot Dog', need: [{ id: 'hotdog' }], desc: 'Hot Dog' },
  { id: 'berrypie', name: 'Berry Pie', need: [{ id: 'berries' }, { id: 'berries' }], desc: '2 Wild Berries' },
];

export const NPCS = {
  gus: { name: 'Old Gus', role: 'Fisherman', skin: 0xc8946c, shirt: 0x6e7a4a, pants: 0x4a4436, hat: 'bucket', hatCol: 0x8a7a50, beard: 0xd8d4cc, hair: 0xd0ccc4, adult: true, old: true },
  hollis: { name: 'Mr. Hollis', role: 'Store Owner', skin: 0x9a6a48, shirt: 0xc8e0f0, pants: 0x30343c, apron: 0x2f6a3a, hair: 0x2a2420, adult: true, glasses: true },
  willa: { name: 'Willa', role: 'Trader', skin: 0xe0b090, shirt: 0xb0503a, pants: 0x3c4a6a, hair: 0xb0602a, longHair: true, hat: 'cowboy', hatCol: 0x7a5434, adult: true, female: true },
  ranger: { name: 'Ranger Bramble', role: 'Park Ranger', skin: 0xd8a882, shirt: 0xb8a878, pants: 0x4c5638, hat: 'ranger', hatCol: 0x8a7348, hair: 0x5a3a20, mustache: 0x5a3a20, adult: true, badge: true, big: true },
  deputy: { name: 'Deputy Pine', role: 'Deputy Ranger', skin: 0x8c5c3c, shirt: 0xb8a878, pants: 0x4c5638, hat: 'ranger', hatCol: 0x8a7348, hair: 0x1a1410, adult: true, badge: true },
  mike: { name: 'Mike Parker', role: 'Camper', skin: 0xe8c0a0, shirt: 0x2a6ab0, pants: 0x8a7a5a, hair: 0x7a5a30, hat: 'cap', hatCol: 0xd03030, adult: true },
  lily: { name: 'Lily Parker', role: 'Camper', skin: 0xe8c0a0, shirt: 0xf080b0, pants: 0x4a6aa0, hair: 0xc89a50, longHair: true, female: true, kid: true },
  dev: { name: 'Dev', role: 'Camper', skin: 0xa87050, shirt: 0xf0a030, pants: 0x3a3a40, hair: 0x101010, adult: true },
  rosa: { name: 'Rosa', role: 'Camper', skin: 0xc89070, shirt: 0x40a080, pants: 0x504060, hair: 0x2a1a10, longHair: true, female: true, adult: true },
  sam: { name: 'Sam', role: 'Camper', skin: 0xf0c8a8, shirt: 0x8050a0, pants: 0x5a5040, hair: 0xe0c070, adult: true },
  joe: { name: 'Grandpa Joe', role: 'Camper', skin: 0xe8b898, shirt: 0xa04040, pants: 0x50463a, hair: 0xe8e8e8, adult: true, old: true, glasses: true, hat: 'cap', hatCol: 0x30508a },
  maya: { name: 'Maya', role: 'Camper', skin: 0x7a4a30, shirt: 0xe0d040, pants: 0x2a3a5a, hair: 0x1a1008, longHair: true, female: true, adult: true },
  tasha: { name: 'Tasha', role: 'Beach Visitor', skin: 0x9a6040, shirt: 0xff6f91, pants: 0x3a7ab0, hair: 0x1a1008, longHair: true, female: true, adult: true, hat: 'sun', hatCol: 0xf0e0b0 },
  ben: { name: 'Ben', role: 'Beach Visitor', skin: 0xf0c8a8, shirt: 0x30b0c0, pants: 0xe0a040, hair: 0xa06030, adult: true, hat: 'cap', hatCol: 0xffffff },
};
// camper -> site index (5,6 = beach spots)
export const CAMPERS = [
  { id: 'mike', site: 0 }, { id: 'lily', site: 0, kid: true }, { id: 'dev', site: 1 }, { id: 'rosa', site: 2 }, { id: 'sam', site: 2 },
  { id: 'joe', site: 3, sleepy: true }, { id: 'maya', site: 4 }, { id: 'tasha', site: 5, beach: true }, { id: 'ben', site: 6, beach: true },
];

// ---------------- quests ----------------
// main chapters; each step: text, hint, target (key or fn name), check name (evaluated in sim)
export const CHAPTERS = [
  { id: 'c1', title: 'Chapter 1: Welcome to Pinecrest', steps: [
    { t: 'Walk to the trail sign outside your hideout', hint: 'Move: WASD / left stick. Drag to look around.', target: 'trailSign', check: 'atSign' },
    { t: 'Sneak to the beach picnic and grab a snack', hint: 'Sneak with C (or SNEAK). Grab when nobody is looking!', target: 'beachBasket', check: 'grabbed1' },
    { t: 'Meet Old Gus at the end of the dock', hint: 'Talk with E or SPACE.', target: 'gus', check: 'metGus' },
    { t: 'Catch a fish', hint: 'Face the water and press F. Hold to cast, tap when it bites, hold to reel.', target: 'dockEnd', check: 'caught1' },
    { t: 'Sell a fish at the General Store', hint: 'Talk to Mr. Hollis in town.', target: 'hollis', check: 'sold1' },
    { t: 'Ranger Bramble is on patrol! Hide in a bush or trash bin', hint: 'Hide with SPACE/E next to a big bush or bin.', target: 'nearestHide', check: 'hid1' },
  ], reward: { coins: 25 } },
  { id: 'c2', title: 'Chapter 2: Wheels & Paddles', steps: [
    { t: 'Trade something with Willa at the Trading Post', hint: 'Willa swaps fish, snacks and treasures.', target: 'willa', check: 'traded1' },
    { t: 'Buy a Mountain Bike (150 coins)', hint: 'Sell fish & snacks for coins. Press R to ride.', target: 'hollis', check: 'hasBike' },
    { t: 'Save up and buy a Canoe (300 coins)', hint: 'Bigger fish are worth more!', target: 'hollis', check: 'hasCanoe' },
    { t: 'Paddle your canoe out to Acorn Island', hint: 'Launch the canoe from the dock.', target: 'island', check: 'canoeIsland' },
  ], reward: { coins: 50 } },
  { id: 'c3', title: 'Chapter 3: The Legend of Silverjaw', steps: [
    { t: 'Ask Old Gus about the legend', hint: 'He is always on the dock.', target: 'gus', check: 'gusLegend' },
    { t: 'Get a Fiberglass Rod (or better)', hint: 'Mr. Hollis sells rods.', target: 'hollis', check: 'rod3' },
    { t: 'Buy a Glow Lure', hint: 'Silverjaw only chases glowing lures.', target: 'hollis', check: 'hasGlow' },
    { t: 'Catch Silverjaw in the deep lake at dawn or dusk', hint: 'Paddle to the middle of the lake. Dawn 5-8am, dusk 6-9pm. Sleep at your hideout to skip time.', target: 'deep', check: 'silverjaw' },
    { t: 'Show Silverjaw to Old Gus', hint: 'He has waited 40 years for this!', target: 'gus', check: 'showedGus' },
  ], reward: { coins: 300 } },
  { id: 'c4', title: 'Chapter 4: The Big Campfire Party', steps: [
    { t: 'Get a Fire Pit and String Lights for your hideout', hint: 'Both are at the General Store.', target: 'hollis', check: 'partyDecor' },
    { t: "Cook 3 S'mores and 2 Grilled Fish", hint: 'Cook at your fire pit. S\'mores = Marshmallows + Chocolate.', target: 'firepit', check: 'partyFood' },
    { t: 'Invite Old Gus, Willa and Mr. Hollis', hint: 'Talk to each of them.', target: 'invite', check: 'invited' },
    { t: 'After 7pm, light the fire pit to start the party!', hint: 'Sleep in your bed to skip to evening if needed.', target: 'firepit', check: 'party' },
  ], reward: { coins: 200 } },
];
export const SIDE_QUESTS = {
  lily: { title: "Lily's Skipping Challenge", giver: 'lily', t: 'Skip a stone 5 times in one throw', check: 'skip5', reward: { coins: 20, item: 'feather' }, target: 'skip' },
  maya: { title: "Maya's Trout Dinner", giver: 'maya', t: 'Bring Maya a Rainbow Trout (river)', check: 'haveRainbow', reward: { coins: 35, item: 'chocolate' }, take: 'rainbow', target: 'river' },
  dev: { title: "Dev's Lost Sunglasses", giver: 'dev', t: 'Fish up Dev\'s sunglasses near the dock', check: 'haveSunglasses', reward: { coins: 10, gear: 'capshades' }, take: 'sunglasses', target: 'dockEnd' },
  hollis: { title: 'Watermelon Craving', giver: 'hollis', t: 'Bring Mr. Hollis a Watermelon', check: 'haveWatermelon', reward: { coins: 40 }, take: 'watermelon', target: 'camp' },
  willa: { title: 'Golden Acorn Hunt', giver: 'willa', t: 'Find 6 Golden Acorns hidden around the park', check: 'acorns6', reward: { decor: 'telescope', coins: 30 }, target: null },
  willa2: { title: 'Every Last Acorn', giver: 'willa', t: 'Find all 12 Golden Acorns', check: 'acorns12', reward: { rod: 5 }, target: null, after: 'willa' },
  gus: { title: 'Fish Collector', giver: 'gus', t: 'Fill your Fish Journal with 10 species', check: 'species10', reward: { coins: 150, gear: 'spinner' }, target: null },
  joe: { title: "Grandpa Joe's Supper", giver: 'joe', t: 'Bring Grandpa Joe a Grilled Fish', check: 'haveGrilled', reward: { coins: 30, item: 'pie' }, take: 'grilledfish', target: 'firepit' },
};

export const TIPS = [
  'Sneaking (C) makes you quieter and harder to spot.',
  'Watch the meters over heads: ? means curious, ! means SPOTTED.',
  'Hide in big bushes, trash bins or empty tents when the ranger is close.',
  'Store your treasures in the chest at your hideout - the ranger can\'t take them.',
  'Fish bite more at dawn and dusk. Rain brings out rare fish!',
  'Willa\'s prices change every day. Check her HOT item!',
  'Campers sleep at night, but the ranger has a flashlight.',
];
