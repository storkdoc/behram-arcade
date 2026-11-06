/* NAME THAT GROOVE: the record crate. Real songs from the 1970s, 1980s and 1990s, each played as a short
   excerpt through YouTube's official embedded player (see yt.js). Nothing is downloaded or stored here:
   each entry is just song facts plus a public YouTube video id and the second the clip starts at.
   Videos are official artist / label / VEVO uploads on verified channels (channel and video title in the
   comment). Every id was checked on 2026-11-06: public, not age-restricted, YouTube reports
   "playable in embed", its oEmbed endpoint answers 200, and the official IFrame API actually played it.
   Each song has ONE fixed excerpt window [start, end] in seconds of its video: it opens 3 s before the
   video's most-replayed moment (YouTube's own "most replayed" heatmap, which peaks where viewers jump to,
   normally the chorus or signature hook) and runs 15 s. Every difficulty plays that same window, and
   REPLAY seeks back to exactly the same start and stops at the same end.
   Pure data + a seeded RNG, so it runs in the browser and in Node tests. No lyrics are reproduced. */
(function (root) {
  'use strict';

  // ---- seeded RNG (mulberry32) + string hash ----
  function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  const DECADES = ['70s', '80s', '90s'];
  const DECADE_INFO = {
    '70s': { label: "'70s", long: 'The Seventies', blurb: 'Disco, funk, soul and classic rock from 1970 to 1979.' },
    '80s': { label: "'80s", long: 'The Eighties', blurb: 'Pop, synth-pop, new wave and arena rock from 1980 to 1989.' },
    '90s': { label: "'90s", long: 'The Nineties', blurb: 'Pop, grunge, hip-hop, R&B and eurodance from 1990 to 1999.' },
    all: { label: 'ALL', long: 'All Decades', blurb: 'A mixed crate from 1970 to 1999.' }
  };

  const S = (id, decade, year, title, artist, genre, yt, start, end) => ({ id, decade, year, title, artist, genre, yt, start, end });
  const SONGS = [
    // ---------------- 70s ----------------
    S("abc", "70s", 1970, "ABC", "The Jackson 5", "soul", "ISqzbbZVIiU", 23, 38),  // The Jacksons: ABC
    S("american-pie", "70s", 1971, "American Pie", "Don McLean", "folk", "bETXDOrmIiM", 140, 155),  // Don McLean: American Pie (Single Version)
    S("let-s-stay-together", "70s", 1971, "Let's Stay Together", "Al Green", "soul", "XXx6RDzR6eM", 13, 28),  // Al Green: Al Green - Let's Stay Together (Official Audio)
    S("take-me-home-country-roads", "70s", 1971, "Take Me Home, Country Roads", "John Denver", "country", "1vrEljMfXYo", 28, 43),  // John Denver: John Denver - Take Me Home, Country Roads (Official Audio)
    S("tiny-dancer", "70s", 1971, "Tiny Dancer", "Elton John", "pop", "yYcyacLRPNs", 176, 191),  // Elton John: Elton John - Tiny Dancer
    S("crocodile-rock", "70s", 1972, "Crocodile Rock", "Elton John", "pop", "75r0nQu-hMs", 15, 30),  // Elton John: Crocodile Rock
    S("lean-on-me", "70s", 1972, "Lean on Me", "Bill Withers", "soul", "gOZgo8gMIoM", 57, 72),  // Bill Withers: Bill Withers - Lean on Me (Official Audio)
    S("rocket-man", "70s", 1972, "Rocket Man", "Elton John", "pop", "DtVBCG6ThDk", 56, 71),  // Elton John: Elton John - Rocket Man (Official Music Video)
    S("superstition", "70s", 1972, "Superstition", "Stevie Wonder", "funk", "egqv1mtos6A", 13, 28),  // Stevie Wonder: Superstition
    S("let-s-get-it-on", "70s", 1973, "Let's Get It On", "Marvin Gaye", "soul", "AqPBfbLoF_M", 41, 56),  // Marvin Gaye: Marvin Gaye - Let's Get It On (Official Music Video)
    S("piano-man", "70s", 1973, "Piano Man", "Billy Joel", "pop", "gxEPV4kolz0", 14, 29),  // Billy Joel: Billy Joel - Piano Man (Official HD Video)
    S("sweet-home-alabama", "70s", 1974, "Sweet Home Alabama", "Lynyrd Skynyrd", "rock", "-35W_FWCT9Q", 68, 83),  // Lynyrd Skynyrd: Lynyrd Skynyrd - Sweet Home Alabama (Audio)
    S("waterloo", "70s", 1974, "Waterloo", "ABBA", "pop", "Sj_9CiNkkn4", 28, 43),  // ABBA: ABBA - Waterloo (Official Music Video)
    S("bohemian-rhapsody", "70s", 1975, "Bohemian Rhapsody", "Queen", "rock", "fJ9rUzIMcZQ", 187, 202),  // Queen Official: Queen – Bohemian Rhapsody (Official Video Remastered)
    S("get-down-tonight", "70s", 1975, "Get Down Tonight", "KC and the Sunshine Band", "disco", "BXIBEW5MLuU", 31, 46),  // KC & The Sunshine Band: Get Down Tonight
    S("rock-and-roll-all-nite", "70s", 1975, "Rock and Roll All Nite", "KISS", "rock", "EFMD7Usflbg", 62, 77),  // KISS: Kiss - Rock And Roll All Nite (From Kiss eXposed)
    S("dancing-queen", "70s", 1976, "Dancing Queen", "ABBA", "pop", "xFrGuyw1V8s", 22, 37),  // ABBA: ABBA - Dancing Queen (Official Music Video)
    S("go-your-own-way", "70s", 1976, "Go Your Own Way", "Fleetwood Mac", "rock", "ozl3L9fhKtE", 146, 161),  // Fleetwood Mac: Fleetwood Mac - Go Your Own Way (Official Music Video) [HD]
    S("hotel-california", "70s", 1976, "Hotel California", "Eagles", "rock", "dLl4PZtxia8", 259, 274),  // Eagles: Eagles - Hotel California (Official Audio)
    S("more-than-a-feeling", "70s", 1976, "More Than a Feeling", "Boston", "rock", "t4QK8RxCAwo", 49, 64),  // BOSTON: Boston - More Than a Feeling (Official HD Video)
    S("brick-house", "70s", 1977, "Brick House", "Commodores", "funk", "RYWOk-E4REE", 21, 36),  // The Commodores: Brick House
    S("dreams", "70s", 1977, "Dreams", "Fleetwood Mac", "rock", "Y3ywicffOj4", 113, 128),  // Fleetwood Mac: Fleetwood Mac - Dreams (Official Music Video) [4K]
    S("mr-blue-sky", "70s", 1977, "Mr. Blue Sky", "Electric Light Orchestra", "rock", "aQUlA8Hcv4s", 29, 44),  // ELO: Electric Light Orchestra - Mr. Blue Sky (Official Video)
    S("stayin-alive", "70s", 1977, "Stayin' Alive", "Bee Gees", "disco", "fNFzfwLM72c", 29, 44),  // beegees: Bee Gees - Stayin' Alive (Official Music Video)
    S("heart-of-glass", "70s", 1978, "Heart of Glass", "Blondie", "new wave", "WGU_4-5RaxU", 17, 32),  // BlondieMusicOfficial: Blondie - Heart Of Glass
    S("i-will-survive", "70s", 1978, "I Will Survive", "Gloria Gaynor", "disco", "6dYWe1c3OyU", 20, 35),  // Gloria Gaynor: Gloria Gaynor - I Will Survive
    S("le-freak", "70s", 1978, "Le Freak", "Chic", "disco", "aXgSHL7efKg", 97, 112),  // RHINO: CHIC - Le Freak (Official Music Video)
    S("september", "70s", 1978, "September", "Earth, Wind & Fire", "funk", "Gs069dndIYk", 16, 31),  // Earth Wind & Fire: Earth, Wind & Fire - September (Official HD Video)
    S("y-m-c-a", "70s", 1978, "Y.M.C.A.", "Village People", "disco", "CS9OO0S5w2k", 40, 55),  // Village People: Village People - YMCA (OFFICIAL Music Video 1978)
    S("don-t-stop-til-you-get-enough", "70s", 1979, "Don't Stop 'Til You Get Enough", "Michael Jackson", "disco", "yURRmWtbTbo", 12, 27),  // Michael Jackson: Michael Jackson - Don't Stop 'Til You Get Enough (Official Video - Upscaled)
    S("hot-stuff", "70s", 1979, "Hot Stuff", "Donna Summer", "disco", "EWlBSw77Dgc", 82, 97),  // Donna Summer: Hot Stuff
    S("my-sharona", "70s", 1979, "My Sharona", "The Knack", "rock", "bbr60I0u2Ng", 74, 89),  // TheKnackVEVO: The Knack - My Sharona
    S("we-are-family", "70s", 1979, "We Are Family", "Sister Sledge", "disco", "uyGY2NfYpeE", 30, 45),  // RHINO: Sister Sledge - We Are Family (Official Music Video)
    // ---------------- 80s ----------------
    S("another-one-bites-the-dust", "80s", 1980, "Another One Bites the Dust", "Queen", "funk", "rY0WxgSXdEE", 25, 40),  // Queen Official: Queen - Another One Bites the Dust (Official Video Remastered)
    S("celebration", "80s", 1980, "Celebration", "Kool & the Gang", "funk", "3GwjfUFyY6M", 17, 32),  // KoolandthegangShow: Kool & The Gang - Celebration
    S("don-t-stop-believin", "80s", 1981, "Don't Stop Believin'", "Journey", "rock", "1k8craCGpgs", 77, 92),  // journey: Journey - Don't Stop Believin' (Official Audio)
    S("tainted-love", "80s", 1981, "Tainted Love", "Soft Cell", "synth-pop", "XZVpR3Pk-r8", 13, 28),  // Soft Cell: Soft Cell - Tainted Love (Official Music Video)
    S("africa", "80s", 1982, "Africa", "Toto", "rock", "FTQbiNvZqaY", 67, 82),  // TOTO: Toto - Africa (Official HD Video)
    S("beat-it", "80s", 1982, "Beat It", "Michael Jackson", "rock", "oRdxUFDoQe0", 233, 248),  // Michael Jackson: Michael Jackson - Beat It (Official 4K Video)
    S("come-on-eileen", "80s", 1982, "Come On Eileen", "Dexys Midnight Runners", "new wave", "6BODDyZRF6A", 63, 78),  // Dexys and Dexys Midnight Runners Official: Dexys Midnight Runners, Kevin Rowland - Come On Eileen (1982 Version)
    S("eye-of-the-tiger", "80s", 1982, "Eye of the Tiger", "Survivor", "rock", "btPJPFnesV4", 80, 95),  // Survivor Band: Survivor - Eye Of The Tiger (Official HD Video)
    S("hungry-like-the-wolf", "80s", 1982, "Hungry Like the Wolf", "Duran Duran", "new wave", "oJL-lCzEXgI", 39, 54),  // Duran Duran: Duran Duran - Hungry like the Wolf (Official Music Video)
    S("all-night-long-all-night", "80s", 1983, "All Night Long (All Night)", "Lionel Richie", "pop", "nqAvFx3NxUM", 61, 76),  // lionelrichie: Lionel Richie - All Night Long (All Night)
    S("billie-jean", "80s", 1983, "Billie Jean", "Michael Jackson", "pop", "Zi_XLOBDo_Y", 85, 100),  // Michael Jackson: Michael Jackson - Billie Jean (Official Video)
    S("girls-just-want-to-have-fun", "80s", 1983, "Girls Just Want to Have Fun", "Cyndi Lauper", "pop", "PIb6AZdTr-A", 50, 65),  // Cyndi Lauper: Cyndi Lauper - Girls Just Want To Have Fun (Official Video)
    S("jump", "80s", 1983, "Jump", "Van Halen", "rock", "SwYN7mTi6HM", 135, 150),  // Van Halen: Van Halen - Jump (Official Music Video) [HD]
    S("karma-chameleon", "80s", 1983, "Karma Chameleon", "Culture Club", "pop", "JmcA9LIIXWw", 44, 59),  // Culture Club: Culture Club - Karma Chameleon (Official Music Video)
    S("sweet-dreams-are-made-of-this", "80s", 1983, "Sweet Dreams (Are Made of This)", "Eurythmics", "synth-pop", "qeMFqkcPYcg", 12, 27),  // Eurythmics: Eurythmics, Annie Lennox, Dave Stewart - Sweet Dreams (Are Made Of This) (Official Video)
    S("thriller", "80s", 1983, "Thriller", "Michael Jackson", "pop", "4V90AmXnguw", 45, 60),  // Michael Jackson: Michael Jackson - Thriller (Official Video - Shortened Version)
    S("total-eclipse-of-the-heart", "80s", 1983, "Total Eclipse of the Heart", "Bonnie Tyler", "ballad", "lcOxhH8N3Bo", 87, 102),  // Bonnie Tyler: Bonnie Tyler - Total Eclipse of the Heart (Turn Around) (Official Video)
    S("footloose", "80s", 1984, "Footloose", "Kenny Loggins", "rock", "ltrMfT4Qz5Y", 60, 75),  // Kenny Loggins: Kenny Loggins - Footloose (Official Video)
    S("wake-me-up-before-you-go-go", "80s", 1984, "Wake Me Up Before You Go-Go", "Wham!", "pop", "pIgZ7gMze7A", 18, 33),  // WHAM!: Wham! - Wake Me Up Before You Go-Go (Official Video)
    S("when-doves-cry", "80s", 1984, "When Doves Cry", "Prince", "funk", "UG3VcCAlUgE", 80, 95),  // Prince: Prince and the Revolution - When Doves Cry (Official Music Video)
    S("don-t-you-forget-about-me", "80s", 1985, "Don't You (Forget About Me)", "Simple Minds", "new wave", "CdqoNKCCt7A", 52, 67),  // Simple Minds: Simple Minds - Don't You (Forget About Me)
    S("everybody-wants-to-rule-the-world", "80s", 1985, "Everybody Wants to Rule the World", "Tears for Fears", "synth-pop", "aGCdLKXNF3w", 75, 90),  // Tears For Fears: Tears For Fears - Everybody Wants To Rule The World (Official Music Video)
    S("material-girl", "80s", 1985, "Material Girl", "Madonna", "pop", "6p-lDYPR2P8", 85, 100),  // Madonna: Madonna - Material Girl (Official Video) [HD]
    S("take-on-me", "80s", 1985, "Take On Me", "a-ha", "synth-pop", "djV11Xbc914", 50, 65),  // a-ha: a-ha - Take On Me (Official Video) [4K]
    S("the-power-of-love", "80s", 1985, "The Power of Love", "Huey Lewis and the News", "rock", "wBl2QGAIx1s", 133, 148),  // hueylewisofficial: Huey Lewis & The News - The Power Of Love (Official Music Video)
    S("livin-on-a-prayer", "80s", 1986, "Livin' on a Prayer", "Bon Jovi", "rock", "lDK9QqIzhwk", 89, 104),  // Bon Jovi: Bon Jovi - Livin' On A Prayer
    S("the-final-countdown", "80s", 1986, "The Final Countdown", "Europe", "rock", "9jK-NcRmVcw", 115, 130),  // Europe: Europe - The Final Countdown (Official Video)
    S("walk-like-an-egyptian", "80s", 1986, "Walk Like an Egyptian", "The Bangles", "pop", "Cv6tuzHUuuk", 59, 74),  // The Bangles: The Bangles - Walk Like an Egyptian (Official Video)
    S("here-i-go-again", "80s", 1987, "Here I Go Again", "Whitesnake", "rock", "WyF8RHM1OCg", 70, 85),  // Whitesnake TV: Whitesnake - Here I Go Again '87 (Official Music Video)
    S("i-wanna-dance-with-somebody", "80s", 1987, "I Wanna Dance with Somebody", "Whitney Houston", "pop", "eH3giaIzONA", 82, 97),  // Whitney Houston: Whitney Houston - I Wanna Dance With Somebody (Who Loves Me) (Official 4K Video)
    S("never-gonna-give-you-up", "80s", 1987, "Never Gonna Give You Up", "Rick Astley", "pop", "dQw4w9WgXcQ", 39, 54),  // Rick Astley: Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)
    S("sweet-child-o-mine", "80s", 1987, "Sweet Child o' Mine", "Guns N' Roses", "rock", "1w7OgIMMRc4", 27, 42),  // Guns N' Roses: Guns N' Roses - Sweet Child O' Mine (Official Music Video)
    S("like-a-prayer", "80s", 1989, "Like a Prayer", "Madonna", "pop", "79fzeNUqQbQ", 193, 208),  // Madonna: Madonna - Like A Prayer (Official Video)
    // ---------------- 90s ----------------
    S("ice-ice-baby", "90s", 1990, "Ice Ice Baby", "Vanilla Ice", "hip-hop", "rog8ou-ZepE", 16, 31),  // Vanilla Ice: Vanilla Ice - Ice Ice Baby (Official Music Video)
    S("u-can-t-touch-this", "90s", 1990, "U Can't Touch This", "MC Hammer", "hip-hop", "otCpCn0l4Wo", 13, 28),  // MC HAMMER: M.C. Hammer - U Can't Touch This
    S("vogue", "90s", 1990, "Vogue", "Madonna", "dance", "GuJQSAiODqI", 96, 111),  // Madonna: Madonna - Vogue (Official Video)
    S("losing-my-religion", "90s", 1991, "Losing My Religion", "R.E.M.", "rock", "xwtdhWltSIg", 26, 41),  // remhq: R.E.M. - Losing My Religion (Official HD Music Video)
    S("smells-like-teen-spirit", "90s", 1991, "Smells Like Teen Spirit", "Nirvana", "grunge", "hTWKbfoikeg", 55, 70),  // Nirvana: Nirvana - Smells Like Teen Spirit (Official Music Video)
    S("i-will-always-love-you", "90s", 1992, "I Will Always Love You", "Whitney Houston", "ballad", "3JWTaaS7LdU", 186, 201),  // Whitney Houston: Whitney Houston - I Will Always Love You (Official 4K Video)
    S("rhythm-is-a-dancer", "90s", 1992, "Rhythm Is a Dancer", "Snap!", "eurodance", "JYIaWeVL1JM", 28, 43),  // SNAP!: SNAP! - Rhythm Is A Dancer (Official 4K Music Video)
    S("macarena", "90s", 1993, "Macarena", "Los del Rio", "dance", "Zc8r6cnNQao", 27, 42),  // Los del Rio Oficial: Macarena
    S("the-sign", "90s", 1993, "The Sign", "Ace of Base", "pop", "iqu132vTl5Y", 56, 71),  // Ace of Base: Ace of Base - The Sign (Official Music Video)
    S("basket-case", "90s", 1994, "Basket Case", "Green Day", "punk", "NUTGr5t3MoY", 16, 31),  // Green Day: Green Day - Basket Case [Official Music Video] (4K Upgrade)
    S("fantasy", "90s", 1995, "Fantasy", "Mariah Carey", "pop", "qq09UkPRdFY", 44, 59),  // Mariah Carey: Mariah Carey - Fantasy (Official 4K Video)
    S("gangsta-s-paradise", "90s", 1995, "Gangsta's Paradise", "Coolio", "hip-hop", "SQCSxqScSVQ", 61, 76),  // Coolio: Coolio - Gangsta's Paradise (feat. L.V.) [Official 4K Music Video]
    S("waterfalls", "90s", 1995, "Waterfalls", "TLC", "r&b", "8WEtxJ4-sh4", 230, 245),  // TLC: TLC - Waterfalls (Official HD Video)
    S("wonderwall", "90s", 1995, "Wonderwall", "Oasis", "britpop", "6hzrDeceEKc", 36, 51),  // Oasis: Oasis - Wonderwall (Official Video)
    S("don-t-speak", "90s", 1996, "Don't Speak", "No Doubt", "rock", "TR3Vdo5etCQ", 69, 84),  // No Doubt: No Doubt - Don't Speak (Official 4K Music Video)
    S("ironic", "90s", 1996, "Ironic", "Alanis Morissette", "rock", "Jne9t8sHpUc", 41, 56),  // Alanis Morissette: Alanis Morissette - Ironic (Official 4K Music Video)
    S("wannabe", "90s", 1996, "Wannabe", "Spice Girls", "pop", "gJLIiF15wjQ", 46, 61),  // Spice Girls: Spice Girls - Wannabe (Official Music Video)
    S("barbie-girl", "90s", 1997, "Barbie Girl", "Aqua", "eurodance", "ZyhrYis509A", 13, 28),  // Aqua: Aqua - Barbie Girl (Official Music Video)
    S("everybody-backstreet-s-back", "90s", 1997, "Everybody (Backstreet's Back)", "Backstreet Boys", "pop", "6M6samPEMpM", 156, 171),  // Backstreet Boys: Backstreet Boys - Everybody (Backstreet's Back) (Official HD Video)
    S("gettin-jiggy-wit-it", "90s", 1997, "Gettin' Jiggy wit It", "Will Smith", "hip-hop", "3JcmQONgXJM", 54, 69),  // Will Smith: Will Smith - Gettin' Jiggy Wit It
    S("mmmbop", "90s", 1997, "MMMBop", "Hanson", "pop", "NHozn0YXAeE", 52, 67),  // HANSON: Hanson - MMMBop (Official Music Video)
    S("my-heart-will-go-on", "90s", 1997, "My Heart Will Go On", "Celine Dion", "ballad", "9bFHsd3o1w0", 204, 219),  // Celine Dion: Céline Dion - My Heart Will Go On (Official 25th Anniversary Alternate Music Video)
    S("torn", "90s", 1997, "Torn", "Natalie Imbruglia", "pop", "VV1XWJN3nJo", 43, 58),  // Natalie Imbruglia: Natalie Imbruglia - Torn (Official Video)
    S("tubthumping", "90s", 1997, "Tubthumping", "Chumbawamba", "rock", "2H5uWRjFsGc", 14, 29),  // ChumbawambaVEVO: Chumbawamba - Tubthumping
    S("baby-one-more-time", "90s", 1998, "...Baby One More Time", "Britney Spears", "pop", "C-u5WLJ9Yk4", 58, 73),  // Britney Spears: Britney Spears - ...Baby One More Time (Official Video)
    S("iris", "90s", 1998, "Iris", "Goo Goo Dolls", "rock", "NdYWuo9OFAw", 12, 27),  // Goo Goo Dolls: Goo Goo Dolls – Iris [Official Music Video] [4K Remaster]
    S("all-star", "90s", 1999, "All Star", "Smash Mouth", "rock", "L_jWHffIx5E", 34, 49),  // SMASH MOUTH: Smash Mouth - All Star
    S("i-want-it-that-way", "90s", 1999, "I Want It That Way", "Backstreet Boys", "pop", "4fndeDfaWCg", 52, 67),  // Backstreet Boys: Backstreet Boys - I Want It That Way (Official HD Video)
    S("livin-la-vida-loca", "90s", 1999, "Livin' la Vida Loca", "Ricky Martin", "pop", "p47fEXGabaY", 50, 65),  // Ricky Martin: Ricky Martin - Livin' La Vida Loca (Official HD Video)
    S("mambo-no-5", "90s", 1999, "Mambo No. 5", "Lou Bega", "pop", "EK_LN3XEcnw", 48, 63),  // Lou Bega Official: Lou Bega - Mambo No. 5 (A Little Bit of...)
    S("man-i-feel-like-a-woman", "90s", 1999, "Man! I Feel Like a Woman!", "Shania Twain", "country", "ZJL4UGSbeFg", 13, 28),  // Shania Twain: Shania Twain - Man! I Feel Like A Woman! (Official Music Video)
    S("no-scrubs", "90s", 1999, "No Scrubs", "TLC", "r&b", "FrLequ6dUdM", 37, 52),  // TLC: TLC - No Scrubs (Official HD Video)
    S("smooth", "90s", 1999, "Smooth", "Santana", "rock", "6Whgn_iE5uc", 17, 32),  // Santana: Santana - Smooth (Official Video) ft. Rob Thomas
  ];
  const BY_ID = {}; SONGS.forEach(s => { BY_ID[s.id] = s; });
  const byId = id => BY_ID[id];
  const songsFor = mode => mode === 'all' ? SONGS.slice() : SONGS.filter(s => s.decade === mode);
  const watchUrl = s => 'https://www.youtube.com/watch?v=' + s.yt + '&t=' + s.start + 's';
  const clipLen = s => s.end - s.start;
  const SOURCE_NOTE = 'Music plays from YouTube; availability and any ads are controlled by YouTube.';

  const api = { hash, rng, shuffle, DECADES, DECADE_INFO, SONGS, byId, songsFor, watchUrl, clipLen, SOURCE_NOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NTG_Catalog = api;
})(typeof window !== 'undefined' ? window : this);
