/* NAME THAT GROOVE: the record crate. Real songs from the 1970s, 1980s and 1990s. You guess from a short
   INSTRUMENTAL excerpt (so no sung title gives it away) and, after answering, can hear the same hook from
   the original recording. Both play through YouTube's official embedded player (see yt.js). Nothing is
   downloaded or stored here: each entry is song facts plus two public YouTube video ids and excerpt windows.
   Instrumental videos were chosen by title/channel/description (marked instrumental or karaoke, no "lyrics",
   "vocals", "cover", "live" or "remix"), then checked to be public, embeddable and playable. Nobody listened
   to them, so a stray backing vocal is possible; the reveal still waits for your answer.
   Original videos are official artist / label / VEVO uploads on verified channels (channel and title in the
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

  // yt/start/end = ORIGINAL recording (artist / label / VEVO upload), played only by HEAR ORIGINAL after you answer.
  // iyt/istart/iend = the INSTRUMENTAL used for guessing; kind 'instrumental' = an instrumental of the song
  // (official instrumental or the original backing track), 'karaoke' = a re-recorded karaoke backing track.
  const S = (id, decade, year, title, artist, genre, yt, start, end, iyt, istart, iend, kind) => ({ id, decade, year, title, artist, genre, yt, start, end, iyt, istart, iend, kind });
  const SONGS = [
    // ---------------- 70s ----------------
    // original: The Jacksons: ABC  |  instrumental: TheInstrumentalCollector: Jackson 5 ABC Instrumental Original Official  (window: same timing as the original)
    S("abc", "70s", 1970, "ABC", "The Jackson 5", "soul", "ISqzbbZVIiU", 23, 38, "XUfirYddl9Q", 23, 38, "instrumental"),
    // original: Al Green: Al Green - Let's Stay Together (Official Audio)  |  instrumental: Zog's Instrumental: Let's Stay Together - Al Green - Instrumental  (window: same timing as the original)
    S("let-s-stay-together", "70s", 1971, "Let's Stay Together", "Al Green", "soul", "XXx6RDzR6eM", 13, 28, "moJnvL6ELWI", 13, 28, "instrumental"),
    // original: John Denver: John Denver - Take Me Home, Country Roads (Official Audio)  |  instrumental: Zog's Instrumental: Take Me Home, Country Roads - John Denver - Instrumental  (window: same timing as the original)
    S("take-me-home-country-roads", "70s", 1971, "Take Me Home, Country Roads", "John Denver", "country", "1vrEljMfXYo", 28, 43, "ELVMP3QyNHY", 28, 43, "instrumental"),
    // original: Elton John: Crocodile Rock  |  instrumental: Daniela Acuña: Elton John - Crocodile Rock(Instrumental)  (window: own most-replayed point)
    S("crocodile-rock", "70s", 1972, "Crocodile Rock", "Elton John", "pop", "75r0nQu-hMs", 15, 30, "SeQUlGCFud8", 59, 74, "instrumental"),
    // original: Bill Withers: Bill Withers - Lean on Me (Official Audio)  |  karaoke: Release - Topic: Lean on Me (Originally Performed by Bill Withers) (Instrumental Version)  (window: same timing as the original)
    S("lean-on-me", "70s", 1972, "Lean on Me", "Bill Withers", "soul", "gOZgo8gMIoM", 57, 72, "YTEFbYJmsMo", 57, 72, "karaoke"),
    // original: Elton John: Elton John - Rocket Man (Official Music Video)  |  instrumental: Rock Band Stems: Elton John - Rocket Man - Instrumental  (window: same timing as the original)
    S("rocket-man", "70s", 1972, "Rocket Man", "Elton John", "pop", "DtVBCG6ThDk", 56, 71, "Vot5FwzDaEY", 56, 71, "instrumental"),
    // original: Stevie Wonder: Superstition  |  instrumental: albin411: Stevie Wonder - Superstition (instrumental)  (window: same timing as the original)
    S("superstition", "70s", 1972, "Superstition", "Stevie Wonder", "funk", "egqv1mtos6A", 13, 28, "uWVllkyOv2U", 13, 28, "instrumental"),
    // original: Marvin Gaye: Marvin Gaye - Let's Get It On (Official Music Video)  |  instrumental: Justin Pettry: Marvin Gaye - Let's Get It On (Instrumental)  (window: same timing as the original)
    S("let-s-get-it-on", "70s", 1973, "Let's Get It On", "Marvin Gaye", "soul", "AqPBfbLoF_M", 41, 56, "o8FlXBZWlYI", 41, 56, "instrumental"),
    // original: Lynyrd Skynyrd: Lynyrd Skynyrd - Sweet Home Alabama (Audio)  |  instrumental: FinalStem Instrumental: Lynyrd Skynyrd - Sweet Home Alabama | Instrumental  (window: same timing as the original)
    S("sweet-home-alabama", "70s", 1974, "Sweet Home Alabama", "Lynyrd Skynyrd", "rock", "-35W_FWCT9Q", 68, 83, "eG0IP488Z2I", 68, 83, "instrumental"),
    // original: ABBA: ABBA - Waterloo (Official Music Video)  |  karaoke: Karaoke Doke: ABBA - Waterloo (Original Instrumental)  (window: same timing as the original)
    S("waterloo", "70s", 1974, "Waterloo", "ABBA", "pop", "Sj_9CiNkkn4", 28, 43, "rRBI98YmxWY", 28, 43, "karaoke"),
    // original: Queen Official: Queen – Bohemian Rhapsody (Official Video Remastered)  |  instrumental: TheInstrumentalCollector: Queen Bohemian Rhapsody Instrumental Original Official  (window: same timing as the original)
    S("bohemian-rhapsody", "70s", 1975, "Bohemian Rhapsody", "Queen", "rock", "fJ9rUzIMcZQ", 187, 202, "roQ7tOnMWy8", 187, 202, "instrumental"),
    // original: KC & The Sunshine Band: Get Down Tonight  |  instrumental: Unofficial KC & The Sunshine Band instrumentals: KC & the Sunshine Band - Get Down Tonight (Instrumental)  (window: same timing as the original)
    S("get-down-tonight", "70s", 1975, "Get Down Tonight", "KC and the Sunshine Band", "disco", "BXIBEW5MLuU", 31, 46, "jG3iPQ_Uf5g", 31, 46, "instrumental"),
    // original: KISS: Kiss - Rock And Roll All Nite (From Kiss eXposed)  |  instrumental: KISS: Rock And Roll All Nite (Instrumental Outtake)  (window: scaled from the original)
    S("rock-and-roll-all-nite", "70s", 1975, "Rock and Roll All Nite", "KISS", "rock", "EFMD7Usflbg", 62, 77, "-k_H4NFacfk", 60, 75, "instrumental"),
    // original: ABBA: ABBA - Dancing Queen (Official Music Video)  |  karaoke: Sing Again KARAOKE: ABBA - Dancing Queen (Instrumental) (Karaoke Version)  (window: own most-replayed point)
    S("dancing-queen", "70s", 1976, "Dancing Queen", "ABBA", "pop", "xFrGuyw1V8s", 22, 37, "kA2gJF-dCKE", 20, 35, "karaoke"),
    // original: Fleetwood Mac: Fleetwood Mac - Go Your Own Way (Official Music Video) [HD]  |  instrumental: TheInstrumentalCollector: Fleetwood Mac   Go Your Own Way instrumental Original Official  (window: scaled from the original)
    S("go-your-own-way", "70s", 1976, "Go Your Own Way", "Fleetwood Mac", "rock", "ozl3L9fhKtE", 146, 161, "eoA4Rv3FzqI", 151, 166, "instrumental"),
    // original: Eagles: Eagles - Hotel California (Official Audio)  |  karaoke: The Hit Crew - Topic: Hotel California (Instrumental Version)  (window: same timing as the original)
    S("hotel-california", "70s", 1976, "Hotel California", "Eagles", "rock", "dLl4PZtxia8", 259, 274, "xAdIhzdC4Kg", 259, 274, "karaoke"),
    // original: BOSTON: Boston - More Than a Feeling (Official HD Video)  |  instrumental: Tornadic Records: Boston - More Than A Feeling - Instrumental  (window: scaled from the original)
    S("more-than-a-feeling", "70s", 1976, "More Than a Feeling", "Boston", "rock", "t4QK8RxCAwo", 49, 64, "zSQg8f0NvGc", 65, 80, "instrumental"),
    // original: The Commodores: Brick House  |  instrumental: 𝕿𝖍𝖆𝕭𝖎𝖌_𝕯𝖔𝖈: Commodores- Brick House (Official Instrumental)  (window: own most-replayed point)
    S("brick-house", "70s", 1977, "Brick House", "Commodores", "funk", "RYWOk-E4REE", 21, 36, "mAwISYk1vJM", 22, 37, "instrumental"),
    // original: Fleetwood Mac: Fleetwood Mac - Dreams (Official Music Video) [4K]  |  instrumental: The Music Angel: Fleetwood Mac - Dreams (Instrumental)  (window: same timing as the original)
    S("dreams", "70s", 1977, "Dreams", "Fleetwood Mac", "rock", "Y3ywicffOj4", 113, 128, "Xddd62VdDG8", 113, 128, "instrumental"),
    // original: ELO: Electric Light Orchestra - Mr. Blue Sky (Official Video)  |  instrumental: Ramona Reiman: Mr. Blue Sky (Instrumental)  (window: scaled from the original)
    S("mr-blue-sky", "70s", 1977, "Mr. Blue Sky", "Electric Light Orchestra", "rock", "aQUlA8Hcv4s", 29, 44, "j08Z-s1TbUs", 22, 37, "instrumental"),
    // original: BlondieMusicOfficial: Blondie - Heart Of Glass  |  instrumental: TheInstrumentalCollector: Blondie Heart of Glass Instrumental Original Official  (window: scaled from the original)
    S("heart-of-glass", "70s", 1978, "Heart of Glass", "Blondie", "new wave", "WGU_4-5RaxU", 17, 32, "-XajSUPoCzQ", 21, 36, "instrumental"),
    // original: RHINO: CHIC - Le Freak (Official Music Video)  |  karaoke: Release - Topic: Le Freak (By Chic) (Instrumental Karaoke Version)  (window: same timing as the original)
    S("le-freak", "70s", 1978, "Le Freak", "Chic", "disco", "aXgSHL7efKg", 97, 112, "sqVa4Gneqbk", 97, 112, "karaoke"),
    // original: Earth Wind & Fire: Earth, Wind & Fire - September (Official HD Video)  |  karaoke: CC Karaoke: Earth, Wind & Fire • September (CC Karaoke / Instrumental)  (window: same timing as the original)
    S("september", "70s", 1978, "September", "Earth, Wind & Fire", "funk", "Gs069dndIYk", 16, 31, "sF5bzTjMxOg", 16, 31, "karaoke"),
    // original: Village People: Village People - YMCA (OFFICIAL Music Video 1978)  |  instrumental: WiggyVideos14: Village People - YMCA [Wiggy Instrumental]  (window: scaled from the original)
    S("y-m-c-a", "70s", 1978, "Y.M.C.A.", "Village People", "disco", "CS9OO0S5w2k", 40, 55, "t8ITcNwOqIM", 48, 63, "instrumental"),
    // original: Michael Jackson: Michael Jackson - Don't Stop 'Til You Get Enough (Official Video - Upscaled)  |  instrumental: DomtendoHaterPJ: Michael Jackson Don't Stop Til You Get Enough Official Instrumental  (window: same timing as the original)
    S("don-t-stop-til-you-get-enough", "70s", 1979, "Don't Stop 'Til You Get Enough", "Michael Jackson", "disco", "yURRmWtbTbo", 12, 27, "YRbIgcRpB2Y", 12, 27, "instrumental"),
    // original: RHINO: Sister Sledge - We Are Family (Official Music Video)  |  instrumental: FinalStem Instrumental: Sister Sledge - We Are Family | Instrumental  (window: same timing as the original)
    S("we-are-family", "70s", 1979, "We Are Family", "Sister Sledge", "disco", "uyGY2NfYpeE", 30, 45, "0lIrI_D5EC0", 30, 45, "instrumental"),
    // ---------------- 80s ----------------
    // original: Queen Official: Queen - Another One Bites the Dust (Official Video Remastered)  |  instrumental: Iván C.: Queen - Another One Bites The Dust - Official Instrumental  (window: same timing as the original)
    S("another-one-bites-the-dust", "80s", 1980, "Another One Bites the Dust", "Queen", "funk", "rY0WxgSXdEE", 25, 40, "WNTMZ7K4h1Q", 25, 40, "instrumental"),
    // original: KoolandthegangShow: Kool & The Gang - Celebration  |  instrumental: TheInstrumentalCollector: Kool And The Gang Celebration Instrumental Original Official  (window: scaled from the original)
    S("celebration", "80s", 1980, "Celebration", "Kool & the Gang", "funk", "3GwjfUFyY6M", 17, 32, "6Kv7fHBziRM", 20, 35, "instrumental"),
    // original: journey: Journey - Don't Stop Believin' (Official Audio)  |  instrumental: All Acapellas & Instrumentals: Journey - Don’t Stop Believin’ (Official Studio Instrumental)  (window: same timing as the original)
    S("don-t-stop-believin", "80s", 1981, "Don't Stop Believin'", "Journey", "rock", "1k8craCGpgs", 77, 92, "NfOS9rqh_YA", 77, 92, "instrumental"),
    // original: Soft Cell: Soft Cell - Tainted Love (Official Music Video)  |  instrumental: Soft Cell: Tainted Love (Instrumental)  (window: same timing as the original)
    S("tainted-love", "80s", 1981, "Tainted Love", "Soft Cell", "synth-pop", "XZVpR3Pk-r8", 13, 28, "kt3B9kcmPdc", 13, 28, "instrumental"),
    // original: TOTO: Toto - Africa (Official HD Video)  |  instrumental: Claudio Marcelo Fimiani: Toto | Africa (Instrumental)  (window: own most-replayed point)
    S("africa", "80s", 1982, "Africa", "Toto", "rock", "FTQbiNvZqaY", 67, 82, "vQot4cVBLo8", 177, 192, "instrumental"),
    // original: Michael Jackson: Michael Jackson - Beat It (Official 4K Video)  |  karaoke: CC Karaoke X: Michael Jackson - Beat It (CC) 🎤 [Karaoke] [Instrumental]  (window: scaled from the original)
    S("beat-it", "80s", 1982, "Beat It", "Michael Jackson", "rock", "oRdxUFDoQe0", 233, 248, "Mazh66SYsRk", 239, 254, "karaoke"),
    // original: Dexys and Dexys Midnight Runners Official: Dexys Midnight Runners, Kevin Rowland - Come On Eileen (1982 Version)  |  instrumental: EnterAtYourOwnR!sk: Dexys Midnight Runners- Come On Eileen- Instrumental  (window: same timing as the original)
    S("come-on-eileen", "80s", 1982, "Come On Eileen", "Dexys Midnight Runners", "new wave", "6BODDyZRF6A", 63, 78, "fp1juE3Rxdw", 63, 78, "instrumental"),
    // original: Survivor Band: Survivor - Eye Of The Tiger (Official HD Video)  |  instrumental: Instrumental Music: Survivor - Eye of the Tiger Instrumental  (window: same timing as the original)
    S("eye-of-the-tiger", "80s", 1982, "Eye of the Tiger", "Survivor", "rock", "btPJPFnesV4", 80, 95, "TOSrMw4Gsuo", 80, 95, "instrumental"),
    // original: Duran Duran: Duran Duran - Hungry like the Wolf (Official Music Video)  |  karaoke: Songjam: Official Karaoke: Duran Duran - Hungry Like The Wolf (Official Karaoke Instrumental) | SongJam  (window: scaled from the original)
    S("hungry-like-the-wolf", "80s", 1982, "Hungry Like the Wolf", "Duran Duran", "new wave", "oJL-lCzEXgI", 39, 54, "_fzVHwcYSMk", 36, 51, "karaoke"),
    // original: lionelrichie: Lionel Richie - All Night Long (All Night)  |  instrumental: Máté Farkas: Lionel Richie - All Night Long (All Night) (Instrumental Version) [45 RPM]  (window: scaled from the original)
    S("all-night-long-all-night", "80s", 1983, "All Night Long (All Night)", "Lionel Richie", "pop", "nqAvFx3NxUM", 61, 76, "XLnmNVA9ZUo", 76, 91, "instrumental"),
    // original: Cyndi Lauper: Cyndi Lauper - Girls Just Want To Have Fun (Official Video)  |  instrumental: Unreleased Mixes: Cyndi Lauper - Girls Just Want To Have Fun (Official Instrumental)  (window: scaled from the original)
    S("girls-just-want-to-have-fun", "80s", 1983, "Girls Just Want to Have Fun", "Cyndi Lauper", "pop", "PIb6AZdTr-A", 50, 65, "Wff7OdvroJo", 44, 59, "instrumental"),
    // original: Van Halen: Van Halen - Jump (Official Music Video) [HD]  |  instrumental: TheInstrumentalCollector: Van Halen   Jump Instrumental Original Official  (window: same timing as the original)
    S("jump", "80s", 1983, "Jump", "Van Halen", "rock", "SwYN7mTi6HM", 135, 150, "sAcekmAUgco", 135, 150, "instrumental"),
    // original: Eurythmics: Eurythmics, Annie Lennox, Dave Stewart - Sweet Dreams (Are Made Of This) (Official Video)  |  instrumental: WaldoWaiver: Eurythmics - Sweet Dreams (Are Made of This) (Instrumental)  (window: same timing as the original)
    S("sweet-dreams-are-made-of-this", "80s", 1983, "Sweet Dreams (Are Made of This)", "Eurythmics", "synth-pop", "qeMFqkcPYcg", 12, 27, "TH_WT-V8uss", 12, 27, "instrumental"),
    // original: Michael Jackson: Michael Jackson - Thriller (Official Video - Shortened Version)  |  instrumental: Brendon Squires: Michael Jackson - Thriller (Official Instrumental)  (window: own most-replayed point)
    S("thriller", "80s", 1983, "Thriller", "Michael Jackson", "pop", "4V90AmXnguw", 45, 60, "gWaJmAFpnX4", 249, 264, "instrumental"),
    // original: Bonnie Tyler: Bonnie Tyler - Total Eclipse of the Heart (Turn Around) (Official Video)  |  instrumental: Daniela Acuña: Bonnie Tyler - Total Eclipse of the Heart (instrumental)  (window: same timing as the original)
    S("total-eclipse-of-the-heart", "80s", 1983, "Total Eclipse of the Heart", "Bonnie Tyler", "ballad", "lcOxhH8N3Bo", 87, 102, "avvuV8uvEfk", 87, 102, "instrumental"),
    // original: WHAM!: Wham! - Wake Me Up Before You Go-Go (Official Video)  |  instrumental: WHAM!: Wham! - Wake Me Up Before You Go-Go (Instrumental - Official Visualiser)  (window: own most-replayed point)
    S("wake-me-up-before-you-go-go", "80s", 1984, "Wake Me Up Before You Go-Go", "Wham!", "pop", "pIgZ7gMze7A", 18, 33, "hkiGXJ8dQ_Y", 142, 157, "instrumental"),
    // original: Tears For Fears: Tears For Fears - Everybody Wants To Rule The World (Official Music Video)  |  instrumental: The Instrumental Library: Tears For Fears - Everybody Wants To Rule The World (Official Instrumental)  (window: scaled from the original)
    S("everybody-wants-to-rule-the-world", "80s", 1985, "Everybody Wants to Rule the World", "Tears for Fears", "synth-pop", "aGCdLKXNF3w", 75, 90, "GvHOI7xXkKI", 65, 80, "instrumental"),
    // original: a-ha: a-ha - Take On Me (Official Video) [4K]  |  instrumental: TheInstrumentalCollector: a-ha Take On Me Instrumental Original Official  (window: scaled from the original)
    S("take-on-me", "80s", 1985, "Take On Me", "a-ha", "synth-pop", "djV11Xbc914", 50, 65, "SQg66Q0q-kI", 48, 63, "instrumental"),
    // original: hueylewisofficial: Huey Lewis & The News - The Power Of Love (Official Music Video)  |  instrumental: Xylot Themes: Huey Lewis & The News - "The Power Of Love" (Instrumental Edit)  (window: scaled from the original)
    S("the-power-of-love", "80s", 1985, "The Power of Love", "Huey Lewis and the News", "rock", "wBl2QGAIx1s", 133, 148, "ronuQXJ_9fk", 82, 97, "instrumental"),
    // original: Europe: Europe - The Final Countdown (Official Video)  |  instrumental: TheInstrumentalCollector: Europe The Final Countdown Instrumental Original Official  (window: scaled from the original)
    S("the-final-countdown", "80s", 1986, "The Final Countdown", "Europe", "rock", "9jK-NcRmVcw", 115, 130, "RQwu9BHt5UI", 129, 144, "instrumental"),
    // original: The Bangles: The Bangles - Walk Like an Egyptian (Official Video)  |  instrumental: Justin Pettry: The Bangles - Walk Like An Egyptian (Instrumental)  (window: same timing as the original)
    S("walk-like-an-egyptian", "80s", 1986, "Walk Like an Egyptian", "The Bangles", "pop", "Cv6tuzHUuuk", 59, 74, "rLCnsWOJiTs", 59, 74, "instrumental"),
    // original: Whitney Houston: Whitney Houston - I Wanna Dance With Somebody (Who Loves Me) (Official 4K Video)  |  instrumental: Matthew Anniss: Whitney Houston - I Wanna Dance With Somebody (Who Loves Me) (Instrumental)  (window: own most-replayed point)
    S("i-wanna-dance-with-somebody", "80s", 1987, "I Wanna Dance with Somebody", "Whitney Houston", "pop", "eH3giaIzONA", 82, 97, "zPp9ZzXHGBs", 26, 41, "instrumental"),
    // original: Rick Astley: Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)  |  karaoke: RIK Real Instrumental Karaokes: Never Gonna Give You Up (Official Instrumental Karaoke) - Rick Astley  (window: same timing as the original)
    S("never-gonna-give-you-up", "80s", 1987, "Never Gonna Give You Up", "Rick Astley", "pop", "dQw4w9WgXcQ", 39, 54, "uwMFPoWm0qk", 39, 54, "karaoke"),
    // original: Guns N' Roses: Guns N' Roses - Sweet Child O' Mine (Official Music Video)  |  instrumental: Instrumentals: Sweet Child O' Mine (Instrumental) - Guns N' Roses Official Version  (window: scaled from the original)
    S("sweet-child-o-mine", "80s", 1987, "Sweet Child o' Mine", "Guns N' Roses", "rock", "1w7OgIMMRc4", 27, 42, "mlR_MreF1NQ", 32, 47, "instrumental"),
    // original: Madonna: Madonna - Like A Prayer (Official Video)  |  instrumental: Alex's Mastermix: Madonna - Like A Prayer (Album Instrumental Version)  (window: same timing as the original)
    S("like-a-prayer", "80s", 1989, "Like a Prayer", "Madonna", "pop", "79fzeNUqQbQ", 193, 208, "xh367g8wl4A", 193, 208, "instrumental"),
    // ---------------- 90s ----------------
    // original: Vanilla Ice: Vanilla Ice - Ice Ice Baby (Official Music Video)  |  karaoke: EXACTLY Instrumentals: Vanilla Ice - Ice Ice Baby (Official Instrumental) remade by EXACTLY Instrumentals  (window: same timing as the original)
    S("ice-ice-baby", "90s", 1990, "Ice Ice Baby", "Vanilla Ice", "hip-hop", "rog8ou-ZepE", 16, 31, "STxeWcWbOiA", 16, 31, "karaoke"),
    // original: MC HAMMER: M.C. Hammer - U Can't Touch This  |  instrumental: Mas Tono: M.C. Hammer - U Can't Touch This (Instrumental) 1990  (window: scaled from the original)
    S("u-can-t-touch-this", "90s", 1990, "U Can't Touch This", "MC Hammer", "hip-hop", "otCpCn0l4Wo", 13, 28, "DRg32GNdIBM", 13, 28, "instrumental"),
    // original: Madonna: Madonna - Vogue (Official Video)  |  karaoke: RIK Real Instrumental Karaokes: Vogue (Official Instrumental Karaoke) - Madonna  (window: same timing as the original)
    S("vogue", "90s", 1990, "Vogue", "Madonna", "dance", "GuJQSAiODqI", 96, 111, "9idbH--dAm4", 96, 111, "karaoke"),
    // original: remhq: R.E.M. - Losing My Religion (Official HD Music Video)  |  instrumental: Cristian Avila Lopez: R.E.M. - Losing My Religion (Official Instrumental)  (window: scaled from the original)
    S("losing-my-religion", "90s", 1991, "Losing My Religion", "R.E.M.", "rock", "xwtdhWltSIg", 26, 41, "zedTqBfvkl8", 24, 39, "instrumental"),
    // original: Nirvana: Nirvana - Smells Like Teen Spirit (Official Music Video)  |  instrumental: nirvanainstrumental: Nirvana - Smells Like Teen Spirit (Official Studio Instrumental)  (window: scaled from the original)
    S("smells-like-teen-spirit", "90s", 1991, "Smells Like Teen Spirit", "Nirvana", "grunge", "hTWKbfoikeg", 55, 70, "TLveqktfeiw", 60, 75, "instrumental"),
    // original: Whitney Houston: Whitney Houston - I Will Always Love You (Official 4K Video)  |  instrumental: WaldoWaiver: Whitney Houston - I Will Always Love You (Instrumental)  (window: same timing as the original)
    S("i-will-always-love-you", "90s", 1992, "I Will Always Love You", "Whitney Houston", "ballad", "3JWTaaS7LdU", 186, 201, "SJEeof74WvM", 186, 201, "instrumental"),
    // original: SNAP!: SNAP! - Rhythm Is A Dancer (Official 4K Music Video)  |  instrumental: C Coh: Snap! – Rhythm Is A Dancer (Instrumental)  (window: same timing as the original)
    S("rhythm-is-a-dancer", "90s", 1992, "Rhythm Is a Dancer", "Snap!", "eurodance", "JYIaWeVL1JM", 28, 43, "2PP9tiZg278", 28, 43, "instrumental"),
    // original: Los del Rio Oficial: Macarena  |  instrumental: Instrumentales ND: Macarena (Bayside Boys Mix) - Los Del Rio (Instrumental)  (window: scaled from the original)
    S("macarena", "90s", 1993, "Macarena", "Los del Rio", "dance", "Zc8r6cnNQao", 27, 42, "uoFij9JMmN4", 21, 36, "instrumental"),
    // original: Ace of Base: Ace of Base - The Sign (Official Music Video)  |  instrumental: MD Music: Ace of Base - The Sign (Instrumental)  (window: scaled from the original)
    S("the-sign", "90s", 1993, "The Sign", "Ace of Base", "pop", "iqu132vTl5Y", 56, 71, "yJqRZGV47VI", 54, 69, "instrumental"),
    // original: Green Day: Green Day - Basket Case [Official Music Video] (4K Upgrade)  |  karaoke: CC Karaoke: Green Day • Basket Case (CC Karaoke / Instrumental)  (window: same timing as the original)
    S("basket-case", "90s", 1994, "Basket Case", "Green Day", "punk", "NUTGr5t3MoY", 16, 31, "v1E0bVAIixI", 16, 31, "karaoke"),
    // original: Coolio: Coolio - Gangsta's Paradise (feat. L.V.) [Official 4K Music Video]  |  instrumental: 916ej: Gangsta's Paradise (Instrumental)  (window: scaled from the original)
    S("gangsta-s-paradise", "90s", 1995, "Gangsta's Paradise", "Coolio", "hip-hop", "SQCSxqScSVQ", 61, 76, "liI1Y0AUSUc", 55, 70, "instrumental"),
    // original: TLC: TLC - Waterfalls (Official HD Video)  |  instrumental: Justin Pettry: TLC - Waterfalls (Instrumental)  (window: scaled from the original)
    S("waterfalls", "90s", 1995, "Waterfalls", "TLC", "r&b", "8WEtxJ4-sh4", 230, 245, "zIX3KhhXaJ8", 185, 200, "instrumental"),
    // original: Oasis: Oasis - Wonderwall (Official Video)  |  instrumental: Absolute Instrumentals: Oasis - Wonderwall (Official Instrumental)HQ  (window: scaled from the original)
    S("wonderwall", "90s", 1995, "Wonderwall", "Oasis", "britpop", "6hzrDeceEKc", 36, 51, "yHCgqO5l_QI", 33, 48, "instrumental"),
    // original: Alanis Morissette: Alanis Morissette - Ironic (Official 4K Music Video)  |  karaoke: Songjam: Official Karaoke: Alanis Morissette - Ironic (Official Karaoke Instrumental) | SongJam  (window: scaled from the original)
    S("ironic", "90s", 1996, "Ironic", "Alanis Morissette", "rock", "Jne9t8sHpUc", 41, 56, "pkABRMfT0TE", 38, 53, "karaoke"),
    // original: Spice Girls: Spice Girls - Wannabe (Official Music Video)  |  instrumental: TheInstrumentalCollector: Spice Girls Wannabe Instrumental Original Official  (window: scaled from the original)
    S("wannabe", "90s", 1996, "Wannabe", "Spice Girls", "pop", "gJLIiF15wjQ", 46, 61, "fH1ZL0zm558", 34, 49, "instrumental"),
    // original: Aqua: Aqua - Barbie Girl (Official Music Video)  |  instrumental: The Instrumental Library: Aqua - Barbie Girl (Official Instrumental)  (window: scaled from the original)
    S("barbie-girl", "90s", 1997, "Barbie Girl", "Aqua", "eurodance", "ZyhrYis509A", 13, 28, "dKY0lHfhrD8", 13, 28, "instrumental"),
    // original: Backstreet Boys: Backstreet Boys - Everybody (Backstreet's Back) (Official HD Video)  |  instrumental: The Instrumental Library: Backstreet Boys - Everybody (Backstreet's Back) - Official Instrumental  (window: scaled from the original)
    S("everybody-backstreet-s-back", "90s", 1997, "Everybody (Backstreet's Back)", "Backstreet Boys", "pop", "6M6samPEMpM", 156, 171, "UrZWHUb5LSQ", 97, 112, "instrumental"),
    // original: Will Smith: Will Smith - Gettin' Jiggy Wit It  |  instrumental: Jamie Marchant: Will Smith - Gettin’ Jiggy Wit It (Official Instrumental)  (window: same timing as the original)
    S("gettin-jiggy-wit-it", "90s", 1997, "Gettin' Jiggy wit It", "Will Smith", "hip-hop", "3JcmQONgXJM", 54, 69, "l2r3nXwzmUk", 54, 69, "instrumental"),
    // original: HANSON: Hanson - MMMBop (Official Music Video)  |  instrumental: MMMBopster: HANSON - MMMBop (Official Instrumental)  (window: same timing as the original)
    S("mmmbop", "90s", 1997, "MMMBop", "Hanson", "pop", "NHozn0YXAeE", 52, 67, "8E0urW43DIY", 52, 67, "instrumental"),
    // original: Natalie Imbruglia: Natalie Imbruglia - Torn (Official Video)  |  karaoke: RIK Real Instrumental Karaokes: Torn (Official Instrumental) - Natalie Imbruglia  (window: scaled from the original)
    S("torn", "90s", 1997, "Torn", "Natalie Imbruglia", "pop", "VV1XWJN3nJo", 43, 58, "D_QsHYlOdbI", 47, 62, "karaoke"),
    // original: ChumbawambaVEVO: Chumbawamba - Tubthumping  |  instrumental: Justin Pettry: Chumbawamba - Tubthumping (Instrumental)  (window: same timing as the original)
    S("tubthumping", "90s", 1997, "Tubthumping", "Chumbawamba", "rock", "2H5uWRjFsGc", 14, 29, "gCVPvtYlxZ0", 14, 29, "instrumental"),
    // original: Britney Spears: Britney Spears - ...Baby One More Time (Official Video)  |  instrumental: BritneyZone: Britney Spears - Baby One More Time (Official Instrumental) | BritneyZone  (window: own most-replayed point)
    S("baby-one-more-time", "90s", 1998, "...Baby One More Time", "Britney Spears", "pop", "C-u5WLJ9Yk4", 58, 73, "j-rf6j9I2Ic", 189, 204, "instrumental"),
    // original: Goo Goo Dolls: Goo Goo Dolls – Iris [Official Music Video] [4K Remaster]  |  instrumental: The Music Angel: The Goo Goo Dolls - Iris (Instrumental)  (window: scaled from the original)
    S("iris", "90s", 1998, "Iris", "Goo Goo Dolls", "rock", "NdYWuo9OFAw", 12, 27, "68GO810RAEk", 16, 31, "instrumental"),
    // original: SMASH MOUTH: Smash Mouth - All Star  |  instrumental: TheInstrumentalCollector: Smash Mouth All Star instrumental original Official  (window: scaled from the original)
    S("all-star", "90s", 1999, "All Star", "Smash Mouth", "rock", "L_jWHffIx5E", 34, 49, "rYpnA4XtEuQ", 30, 45, "instrumental"),
    // original: Ricky Martin: Ricky Martin - Livin' La Vida Loca (Official HD Video)  |  instrumental: El Rey Del Pop Latino Ricky Martin: Ricky Martin - Livin' La Vida Loca (Official Instrumental)  (window: same timing as the original)
    S("livin-la-vida-loca", "90s", 1999, "Livin' la Vida Loca", "Ricky Martin", "pop", "p47fEXGabaY", 50, 65, "aBy8abo4JeE", 50, 65, "instrumental"),
    // original: Lou Bega Official: Lou Bega - Mambo No. 5 (A Little Bit of...)  |  instrumental: Jom: DMCA's Worst Nightmare: Mambo No. 5 (Official Instrumental) - Lou Bega  (window: own most-replayed point)
    S("mambo-no-5", "90s", 1999, "Mambo No. 5", "Lou Bega", "pop", "EK_LN3XEcnw", 48, 63, "tFA3TLx2Qbw", 55, 70, "instrumental"),
    // original: Shania Twain: Shania Twain - Man! I Feel Like A Woman! (Official Music Video)  |  karaoke: CPUSongs: Man I Feel Like a Woman Shania Twain Karaoke Instrumental  (window: same timing as the original)
    S("man-i-feel-like-a-woman", "90s", 1999, "Man! I Feel Like a Woman!", "Shania Twain", "country", "ZJL4UGSbeFg", 13, 28, "oqc345O36rw", 13, 28, "karaoke"),
    // original: TLC: TLC - No Scrubs (Official HD Video)  |  instrumental: CRAU: TLC - No Scrubs (Official Instrumental)  (window: scaled from the original)
    S("no-scrubs", "90s", 1999, "No Scrubs", "TLC", "r&b", "FrLequ6dUdM", 37, 52, "tvbKZtHQvaQ", 34, 49, "instrumental"),
    // original: Santana: Santana - Smooth (Official Video) ft. Rob Thomas  |  instrumental: AORHeavenHD III: Santana - Smooth (Instrumental) (2010) [Legacy Edition] HQ  (window: scaled from the original)
    S("smooth", "90s", 1999, "Smooth", "Santana", "rock", "6Whgn_iE5uc", 17, 32, "fhI6b86xQ0M", 20, 35, "instrumental"),
  ];
  const BY_ID = {}; SONGS.forEach(s => { BY_ID[s.id] = s; });
  const byId = id => BY_ID[id];
  const songsFor = mode => mode === 'all' ? SONGS.slice() : SONGS.filter(s => s.decade === mode);
  const clipLen = s => s.iend - s.istart;   // the guess clip (instrumental) drives timing and scoring
  const SOURCE_NOTE = 'Music plays from YouTube; availability and any ads are controlled by YouTube.';

  const api = { hash, rng, shuffle, DECADES, DECADE_INFO, SONGS, byId, songsFor, clipLen, SOURCE_NOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NTG_Catalog = api;
})(typeof window !== 'undefined' ? window : this);
