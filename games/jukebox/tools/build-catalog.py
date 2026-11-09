#!/usr/bin/env python3
"""Build the jukebox catalog from the Apple iTunes Search API.

Stores metadata and preview URLs returned by Apple. Does not download audio.
A song is kept only when the API names the artist, returns a preview, and the
release year falls in 1970-1999.
"""
import json, os, re, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'data' / 'catalog.json'
CACHE = Path('/tmp/itunes-catalog-cache')
CACHE.mkdir(parents=True, exist_ok=True)
UA = 'BehramArcadeCatalog/1.0'

ARTISTS = [
    # 70s and earlier stars still charting then
    'The Jackson 5', 'The Jacksons', 'Michael Jackson', 'Stevie Wonder', 'Marvin Gaye',
    'Al Green', 'Bill Withers', 'Aretha Franklin', 'Roberta Flack', 'Diana Ross',
    'The Temptations', 'The Four Tops', 'Gladys Knight & The Pips', 'The O\'Jays',
    'The Spinners', 'Curtis Mayfield', 'Sly & The Family Stone', 'Earth, Wind & Fire',
    'Commodores', 'Kool & The Gang', 'Chic', 'Donna Summer', 'Gloria Gaynor',
    'Sister Sledge', 'Village People', 'Barry White', 'The Isley Brothers', 'War',
    'Average White Band', 'Heatwave', 'The Trammps', 'Rose Royce', 'Harold Melvin & The Blue Notes',
    'The Stylistics', 'Elton John', 'Queen', 'ABBA', 'Bee Gees', 'Eagles', 'Fleetwood Mac',
    'David Bowie', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'The Who',
    'Paul McCartney & Wings', 'Paul McCartney', 'John Lennon', 'George Harrison',
    'Carole King', 'James Taylor', 'Joni Mitchell', 'Carly Simon', 'Simon & Garfunkel',
    'Paul Simon', 'Billy Joel', 'Bruce Springsteen', 'Bob Seger', 'Bob Dylan', 'Neil Young',
    'Crosby, Stills & Nash', 'The Doobie Brothers', 'Steve Miller Band', 'Boston', 'Foreigner',
    'Kiss', 'Aerosmith', 'Electric Light Orchestra', 'Supertramp', 'Rod Stewart', 'Cat Stevens',
    'Jim Croce', 'John Denver', 'Olivia Newton-John', 'Linda Ronstadt', 'Dolly Parton',
    'Willie Nelson', 'Kenny Rogers', 'The Carpenters', 'Bread', 'America', 'Chicago',
    'Steely Dan', 'Creedence Clearwater Revival', 'Santana', 'The Doors', 'Three Dog Night',
    'Lynyrd Skynyrd', 'The Allman Brothers Band', 'ZZ Top', 'Heart', 'Cheap Trick', 'The Cars',
    'Blondie', 'Tom Petty and the Heartbreakers', 'Tom Petty', 'Elvis Costello', 'The Clash',
    'Ramones', 'Talking Heads', 'The Police', 'Eric Clapton', 'Peter Frampton', 'Genesis',
    'Phil Collins', 'Yes', 'Rush', 'Van Halen', 'AC/DC', 'Black Sabbath', 'Deep Purple',
    'Alice Cooper', 'Ted Nugent', 'Grand Funk Railroad', 'Bachman-Turner Overdrive',
    'Neil Diamond', 'Barbra Streisand', 'Barry Manilow', 'Captain & Tennille', 'Hall & Oates',
    'Player', 'Little River Band', '10cc', 'Sweet', 'T. Rex', 'Roxy Music', 'Brian Ferry',
    'The Beach Boys', 'Elvis Presley', 'Johnny Cash', 'Charlie Rich', 'Loretta Lynn',
    'Tammy Wynette', 'George Jones', 'Conway Twitty', 'Anne Murray', 'Helen Reddy',
    'Roberta Flack & Donny Hathaway', 'Donny Hathaway', 'Isaac Hayes', 'The Pointer Sisters',
    'Labelle', 'Patti LaBelle', 'Thelma Houston', 'Yvonne Elliman', 'Andy Gibb',
    'KC & The Sunshine Band', 'Wild Cherry', 'Brick', 'The Brothers Johnson', 'Parliament',
    'Bootsy Collins', 'Ohio Players', 'The Gap Band', 'Rick James', 'Prince',
    'Stevie Nicks', 'Lindsey Buckingham', 'Boz Scaggs', 'Doobie Brothers',
    # 80s
    'Madonna', 'Prince', 'Michael Jackson', 'Whitney Houston', 'Cyndi Lauper', 'Tina Turner',
    'Bruce Springsteen', 'Journey', 'Bon Jovi', 'Def Leppard', 'Guns N\' Roses', 'U2',
    'The Police', 'Sting', 'Duran Duran', 'Wham!', 'George Michael', 'Culture Club',
    'Boy George', 'Eurythmics', 'Depeche Mode', 'New Order', 'The Cure', 'Tears For Fears',
    'a-ha', 'Simple Minds', 'INXS', 'Men at Work', 'The Bangles', 'The Go-Go\'s',
    'Pat Benatar', 'Joan Jett & The Blackhearts', 'Bonnie Tyler', 'Survivor', 'REO Speedwagon',
    'Styx', 'Toto', 'Asia', 'Huey Lewis & The News', 'Billy Joel', 'Lionel Richie',
    'Commodores', 'Kool & The Gang', 'Rick James', 'Cameo', 'Zapp', 'Roger',
    'Luther Vandross', 'Anita Baker', 'Sade', 'Janet Jackson', 'Paula Abdul', 'Jody Watley',
    'Bobby Brown', 'New Edition', 'Guy', 'Keith Sweat', 'Freddie Jackson', 'Maze',
    'Stevie Wonder', 'Prince and the Revolution', 'The Time', 'Sheila E.',
    'Run-D.M.C.', 'Beastie Boys', 'LL Cool J', 'Public Enemy', 'Eric B. & Rakim',
    'Salt-N-Pepa', 'DJ Jazzy Jeff & The Fresh Prince', 'Tone Loc', 'Young MC', 'Rob Base & DJ E-Z Rock',
    'Grandmaster Flash', 'Kurtis Blow', 'Whodini', 'The Fat Boys',
    'Phil Collins', 'Peter Gabriel', 'Dire Straits', 'Mark Knopfler', 'The Pretenders',
    'Blondie', 'Talking Heads', 'R.E.M.', 'The Smiths', 'Echo & The Bunnymen',
    'Billy Idol', 'Adam Ant', 'Human League', 'Soft Cell', 'Yaz', 'Erasure', 'Pet Shop Boys',
    'Frankie Goes to Hollywood', 'Dead or Alive', 'Bronski Beat', 'Communards',
    'Bryan Adams', 'John Mellencamp', 'Don Henley', 'Glenn Frey', 'Steve Winwood',
    'Robert Palmer', 'Simply Red', 'Fine Young Cannibals', 'Tears for Fears',
    'Kenny Loggins', 'Christopher Cross', 'Air Supply', 'Chicago', 'Richard Marx',
    'Rick Springfield', 'Tommy Tutone', 'The J. Geils Band', 'John Cougar Mellencamp',
    'Bruce Hornsby', 'Tracy Chapman', 'Suzanne Vega', 'Edie Brickell & New Bohemians',
    '10,000 Maniacs', 'Roxette', 'Belinda Carlisle', 'Expose', 'Taylor Dayne',
    'Gloria Estefan', 'Miami Sound Machine', 'Julio Iglesias', 'Laura Branigan',
    'Kim Carnes', 'Sheena Easton', 'Olivia Newton-John', 'Irene Cara', 'Deniece Williams',
    'Patti Austin', 'James Ingram', 'Jeffrey Osborne', 'Ray Parker Jr.', 'The Pointer Sisters',
    'Klymaxx', 'Midnight Star', 'Mtume', 'SOS Band', 'Loose Ends', 'Five Star',
    'DeBarge', 'Ready for the World', 'Club Nouveau', 'Timex Social Club',
    'Queen', 'David Bowie', 'Elton John', 'George Michael', 'Wham!',
    'Van Halen', 'Motley Crue', 'Poison', 'Whitesnake', 'Europe', 'Scorpions',
    'Ozzy Osbourne', 'Iron Maiden', 'Judas Priest', 'Metallica', 'Quiet Riot',
    'Twisted Sister', 'Ratt', 'Cinderella', 'Warrant', 'Skid Row',
    'The Rolling Stones', 'ZZ Top', 'Aerosmith', 'Heart', 'Cheap Trick', 'The Cars',
    'Talking Heads', 'U2', 'Simple Minds', 'Big Country', 'The Alarm',
    'Howard Jones', 'Thompson Twins', 'Naked Eyes', 'ABC', 'Spandau Ballet',
    'Kajagoogoo', 'A Flock of Seagulls', 'Thomas Dolby', 'Gary Numan',
    'Men Without Hats', 'Nena', 'Falco', 'Peter Schilling', 'After the Fire',
    'Toto', 'Mr. Mister', 'Glass Tiger', 'Cutting Crew', 'Johnny Hates Jazz',
    'Level 42', 'Scritti Politti', 'Swing Out Sister', 'Basia',
    'George Benson', 'Al Jarreau', 'Grover Washington Jr.', 'David Sanborn',
    'Kenny G', 'Sade', 'Everything but the Girl',
    'Dolly Parton', 'Kenny Rogers', 'Alabama', 'The Judds', 'Randy Travis',
    'George Strait', 'Reba McEntire', 'Hank Williams Jr.', 'Willie Nelson',
    'Waylon Jennings', 'Rosanne Cash', 'Juice Newton', 'Eddie Rabbitt',
    'Crystal Gayle', 'Barbara Mandrell', 'Ronnie Milsap', 'Lee Greenwood',
    'The Oak Ridge Boys', 'Exile', 'Restless Heart', 'Highway 101',
    # 90s
    'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Stone Temple Pilots',
    'Smashing Pumpkins', 'Red Hot Chili Peppers', 'Foo Fighters', 'Oasis', 'Blur',
    'Radiohead', 'R.E.M.', 'U2', 'Alanis Morissette', 'No Doubt', 'Garbage',
    'Hole', 'Courtney Love', 'Liz Phair', 'PJ Harvey', 'Bjork', 'Tori Amos',
    'Sarah McLachlan', 'Jewel', 'Sheryl Crow', 'Melissa Etheridge', 'Natalie Merchant',
    'The Cranberries', 'Sixpence None the Richer', 'Savage Garden', 'Matchbox Twenty',
    'Goo Goo Dolls', 'Third Eye Blind', 'Semisonic', 'Fastball', 'Eagle-Eye Cherry',
    'Sugar Ray', 'Smash Mouth', 'Barenaked Ladies', 'Counting Crows', 'Hootie & The Blowfish',
    'Blues Traveler', 'Dave Matthews Band', 'Spin Doctors', 'Gin Blossoms',
    'Toad the Wet Sprocket', 'Soul Asylum', 'Blind Melon', 'Temple of the Dog',
    'Green Day', 'The Offspring', 'Blink-182', 'Rancid', 'NOFX', 'Bad Religion',
    'Sublime', '311', 'Rage Against the Machine', 'Tool', 'Nine Inch Nails',
    'Marilyn Manson', 'Beck', 'Weezer', 'Pavement', 'Pixies', 'Jane\'s Addiction',
    'Metallica', 'Guns N\' Roses', 'Aerosmith', 'Bon Jovi', 'Def Leppard',
    'Mariah Carey', 'Whitney Houston', 'Celine Dion', 'Toni Braxton', 'Boyz II Men',
    'TLC', 'En Vogue', 'SWV', 'Xscape', 'Brandy', 'Monica', 'Aaliyah', 'Mary J. Blige',
    'Lauryn Hill', 'Erykah Badu', 'D\'Angelo', 'Maxwell', 'Janet Jackson',
    'Michael Jackson', 'Madonna', 'Spice Girls', 'Britney Spears', 'Backstreet Boys',
    'NSYNC', '98 Degrees', 'Hanson', 'Ace of Base', 'Aqua', 'Robyn', 'All Saints',
    'Destiny\'s Child', 'Blaque', '702', 'Total', 'Changing Faces',
    'Dr. Dre', 'Snoop Dogg', 'Tupac', 'The Notorious B.I.G.', 'Nas', 'Wu-Tang Clan',
    'A Tribe Called Quest', 'De La Soul', 'The Fugees', 'Lauryn Hill', 'Wyclef Jean',
    'Busta Rhymes', 'Missy Elliott', 'Timbaland', 'Jay-Z', 'Outkast', 'Goodie Mob',
    'Juvenile', 'Mystikal', 'Master P', 'Warren G', 'Nate Dogg', 'Ice Cube',
    'Cypress Hill', 'House of Pain', 'Beastie Boys', 'LL Cool J', 'Salt-N-Pepa',
    'Coolio', 'Warren G', 'Montell Jordan', 'Blackstreet', 'Next', 'Dru Hill',
    'Jodeci', 'H-Town', 'Shai', 'Silk', '112', 'Ginuwine', 'Usher',
    'R. Kelly', 'Keith Sweat', 'Babyface', 'Boyz II Men', 'All-4-One', 'Color Me Badd',
    'PM Dawn', 'Arrested Development', 'Digable Planets', 'Us3', 'Guru',
    'Shania Twain', 'Garth Brooks', 'Tim McGraw', 'Faith Hill', 'Dixie Chicks',
    'LeAnn Rimes', 'Martina McBride', 'Alan Jackson', 'Brooks & Dunn', 'Clint Black',
    'Vince Gill', 'Wynonna', 'Trisha Yearwood', 'Reba McEntire', 'George Strait',
    'John Michael Montgomery', 'Clay Walker', 'Toby Keith', 'Kenny Chesney',
    'Celine Dion', 'Whitney Houston', 'Mariah Carey', 'Bryan Adams', 'Rod Stewart',
    'Elton John', 'Phil Collins', 'Sting', 'Seal', 'Simply Red', 'Lisa Stansfield',
    'Des\'ree', 'Joan Osborne', 'Paula Cole', 'Fiona Apple', 'Meredith Brooks',
    'Chumbawamba', 'The Verve', 'Oasis', 'Blur', 'Pulp', 'Suede', 'Manic Street Preachers',
    'Radiohead', 'Portishead', 'Massive Attack', 'The Chemical Brothers', 'Fatboy Slim',
    'The Prodigy', 'Moby', 'Daft Punk', 'Air', 'Jamiroquai', 'Brand New Heavies',
    'Incognito', 'Groove Theory', 'Soul II Soul', 'Lisa Stansfield',
    'Ace of Base', 'Real McCoy', 'La Bouche', 'Snap!', 'Culture Beat', 'Haddaway',
    'Corona', 'Ice MC', '2 Unlimited', 'Technotronic', 'C+C Music Factory',
    'Black Box', 'CeCe Peniston', 'Robin S', 'Crystal Waters', 'Deee-Lite',
    'Madonna', 'Janet Jackson', 'Amber', 'Everything but the Girl',
    'Ricky Martin', 'Jennifer Lopez', 'Marc Anthony', 'Enrique Iglesias', 'Shakira',
    'Santana', 'Lou Bega', 'Los Del Rio', 'Los Lobos', 'Selena',
    'Britney Spears', 'Christina Aguilera', 'Mandy Moore', 'Jessica Simpson',
    'Backstreet Boys', '*NSYNC', 'Five', 'Westlife', 'Boyzone',
    'Spice Girls', 'All Saints', 'B*Witched', 'Steps',
    'Will Smith', 'Puff Daddy', 'Ma$e', 'Notorious B.I.G.', 'Sean Combs',
    'Bone Thugs-N-Harmony', 'Kris Kross', 'Sir Mix-a-Lot', 'Tag Team', '69 Boyz',
    'Quad City DJ\'s', 'Cartoons', 'Aqua', 'Eiffel 65', 'Vengaboys', 'Lou Bega',
    'Cher', 'Cher', 'Whitney Houston', 'Eric Clapton', 'Bonnie Raitt',
    'Tom Petty', 'Bruce Springsteen', 'R.E.M.', 'U2', 'Red Hot Chili Peppers',
    'Lenny Kravitz', 'John Mellencamp', 'Melissa Etheridge', 'Bonnie Raitt',
    'k.d. lang', 'Sarah McLachlan', 'Dido', 'Macy Gray', 'Lauryn Hill',
    'TLC', 'No Doubt', 'Gwen Stefani', 'Sublime', 'Sugar Ray', 'Smash Mouth',
    'Third Eye Blind', 'Matchbox Twenty', 'Train', 'Vertical Horizon', 'Lifehouse',
    'Creed', 'Nickelback', 'Collective Soul', 'Live', 'Bush', 'Candlebox',
    'Everclear', 'Harvey Danger', 'Lit', 'Stroke 9', 'New Radicals',
    'Eagle-Eye Cherry', 'Natalie Imbruglia', 'Chumbawamba', 'The Cardigans',
    'Robyn',     'Ace of Base', 'Roxette', 'Ace of Base',
    # Names the store uses when the common billing does not match artistTerm
    'Daryl Hall & John Oates', 'Bryan Ferry', 'Run-DMC', '2Pac', 'Vanilla Ice',
    'MC Hammer', 'Dexys Midnight Runners', 'The S.O.S. Band', 'Rob Base',
]

# Unique, preserve order
_seen = set()
ARTISTS_U = []
for a in ARTISTS:
    k = a.lower()
    if k not in _seen:
        _seen.add(k)
        ARTISTS_U.append(a)

JUNK = re.compile(
    r'\b(karaoke|tribute|lullaby|music box|ringtone|instrumental|in the style|originally performed|made famous|8-bit|8 bit|cover version|megamix|medley|interview|commentary|spoken word|parody)\b',
    re.I)
# Live, remix, karaoke and similar alternates are skipped. A remaster or
# single/album version of the same recording collapses to one title below.
PAREN_JUNK = re.compile(
    r'\((?:[^)]*\b(?:live|remix|demo|acoustic|session|karaoke|dub|extended|re-?record(?:ed)?)\b[^)]*)\)',
    re.I)
PAREN_META = re.compile(
    r'(?:\((?:[^)]*\b(?:remaster(?:ed)?|mono|stereo|single version|album version|radio version|version|edit)\b[^)]*)\)|\[[^\]]*\b(?:remaster(?:ed)?|mono|stereo)\b[^\]]*\])',
    re.I)
DASH_JUNK = re.compile(r'\s+-\s+(?:live|remix|demo|acoustic)\b', re.I)


def norm(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('&', ' and ')
    s = re.sub(r'\bthe\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def artist_ok(query, name):
    name = re.split(r'\s+(?:feat\.?|featuring|ft\.)\s+', name, maxsplit=1, flags=re.I)[0]
    return norm(query) == norm(name)


def title_key(title):
    t = PAREN_JUNK.sub('', title)
    t = PAREN_META.sub('', t)
    t = re.sub(r'\([^)]*\b(?:from|soundtrack)\b[^)]*\)', '', t, flags=re.I)
    t = re.sub(r'\s*\[[^\]]*\]', '', t)
    t = DASH_JUNK.sub('', t)
    return norm(t)


def junk_title(title):
    if JUNK.search(title) or PAREN_JUNK.search(title) or DASH_JUNK.search(title):
        return True
    if re.search(r'\b(remix|karaoke|mix)\b', title, re.I):
        return True
    return False


def fetch(url):
    key = re.sub(r'[^a-zA-Z0-9]+', '_', url)[:180]
    path = CACHE / (key + '.json')
    if path.exists() and path.stat().st_size > 20:
        return json.loads(path.read_text())
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as res:
                data = json.load(res)
            path.write_text(json.dumps(data))
            time.sleep(0.12)
            return data
        except Exception as e:
            wait = 1.5 * (attempt + 1)
            print(' retry', attempt, type(e).__name__, url[:80])
            time.sleep(wait)
    raise RuntimeError('failed ' + url)


def search_artist(name):
    q = urllib.parse.urlencode({
        'term': name,
        'entity': 'song',
        'attribute': 'artistTerm',
        'limit': '200',
        'country': 'US',
    })
    return fetch('https://itunes.apple.com/search?' + q)


def consider(r, query_artist):
    if r.get('kind') != 'song':
        return None
    if not r.get('previewUrl') or not str(r.get('previewUrl')).startswith('https://'):
        return None
    if not artist_ok(query_artist, r.get('artistName') or ''):
        return None
    title = r.get('trackName') or ''
    if junk_title(title):
        return None
    rd = r.get('releaseDate') or ''
    if len(rd) < 4 or not rd[:4].isdigit():
        return None
    year = int(rd[:4])
    if year < 1970 or year > 1999:
        return None
    ms = r.get('trackTimeMillis') or 0
    if ms < 75000 or ms > 12 * 60 * 1000:
        return None
    decade = '70s' if year < 1980 else '80s' if year < 1990 else '90s'
    store = r.get('trackViewUrl') or ''
    if not store.startswith('https://'):
        return None
    return {
        'id': str(r['trackId']),
        'title': title,
        'artist': r['artistName'],
        'year': year,
        'decade': decade,
        'album': r.get('collectionName') or '',
        'artwork': r.get('artworkUrl100') or '',
        'store': store,
        'preview': r['previewUrl'],
    }


def main():
    songs = []
    seen_id = set()
    seen_key = set()
    for i, artist in enumerate(ARTISTS_U):
        try:
            data = search_artist(artist)
        except Exception as e:
            print('FAIL', artist, e)
            continue
        kept = 0
        for r in data.get('results') or []:
            song = consider(r, artist)
            if not song:
                continue
            key = title_key(song['title']) + '|' + norm(song['artist'])
            if song['id'] in seen_id or key in seen_key:
                continue
            seen_id.add(song['id'])
            seen_key.add(key)
            songs.append(song)
            kept += 1
            if kept >= 36:
                break
        print(f'{i+1}/{len(ARTISTS_U)} {artist}: +{kept} total {len(songs)}')
    songs.sort(key=lambda s: (s['decade'], s['year'], s['artist'].lower(), s['title'].lower()))
    doc = {
        'source': 'Apple iTunes Search API',
        'courtesy': '30-second previews provided courtesy of iTunes.',
        'storeNote': 'Previews stream from Apple to promote the matching iTunes listing. They are not downloaded or stored here.',
        'songs': songs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    from collections import Counter
    c = Counter(s['decade'] for s in songs)
    print('WROTE', OUT, 'count', len(songs), dict(c))


if __name__ == '__main__':
    main()
