#!/usr/bin/env python3
"""Build the jukebox catalog from Billboard's year-end Hot 100 and Apple previews.

The shelf is the biggest hits of 1970-1999, not every recording from those years.
Ranks come from the Billboard Year-End Hot 100 (via the Wikipedia pages that cite
the year-end issue). A few songs that finished lower are added when they also
appear on a published VH1 greatest-of-decade or greatest-rock list.

Each kept row is an Apple iTunes Search result: original studio recording, with
the preview left on Apple's host. This script does not download audio.
"""
import html as html_lib
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'data' / 'catalog.json'
CACHE = Path('/tmp/jukebox-hits-cache')
CACHE.mkdir(parents=True, exist_ok=True)
UA = 'BehramArcadeCatalog/1.0 (jukebox hits catalog)'

CORE_RANKS = 12          # top of each Billboard year-end chart
ICONIC_MAX_RANK = 40     # lower year-end songs eligible as iconic extras
MIN_PER_YEAR = 8
MAX_PER_DECADE = 165
BACKFILL_RANK = 20

JUNK = re.compile(
    r'\b(karaoke|tribute|lullaby|music box|ringtone|instrumental|in the style|originally performed|made famous|8-bit|8 bit|cover version|megamix|medley|interview|commentary|spoken word|parody|re-?recorded|bhangra|banghra|a ?capp?ella)\b',
    re.I)
PAREN_JUNK = re.compile(
    r'\((?:[^)]*\b(?:live|remix|demo|acoustic|session|karaoke|dub|extended|re-?record(?:ed)?)\b[^)]*)\)',
    re.I)
PAREN_META = re.compile(
    r'(?:\((?:[^)]*\b(?:remaster(?:ed)?|mono|stereo|single version|album version|radio version|version|edit|titles|theme|main theme)\b[^)]*)\)|\[[^\]]*\b(?:remaster(?:ed)?|mono|stereo)\b[^\]]*\])',
    re.I)
SOUNDTRACK = re.compile(r'\b(soundtrack|motion picture|music from|from the (?:motion picture|film))\b', re.I)
DASH_JUNK = re.compile(r'\s+-\s+(?:live|remix|demo|acoustic)\b', re.I)
HITS_ALBUM = re.compile(r'\b(greatest|best of|best hits|anthology|number ones|collection|essentials|classics|now that|the hits|remastered)\b', re.I)


def get(url, pause=0.0):
    key = re.sub(r'[^a-zA-Z0-9]+', '_', url)[:180]
    path = CACHE / (key + '.json')
    if path.exists() and path.stat().st_size > 20:
        return json.loads(path.read_text())
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as res:
                raw = res.read()
            data = json.loads(raw)
            path.write_text(json.dumps(data))
            if pause:
                time.sleep(pause)
            return data
        except Exception as e:
            last = e
            time.sleep(1.4 * (attempt + 1))
    raise RuntimeError('failed %s (%s)' % (url, last))


def get_text(url):
    key = re.sub(r'[^a-zA-Z0-9]+', '_', url)[:180]
    path = CACHE / (key + '.txt')
    if path.exists() and path.stat().st_size > 50:
        return path.read_text(errors='replace')
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as res:
        text = res.read().decode('latin1', 'replace')
    path.write_text(text)
    time.sleep(0.2)
    return text


def wiki_link(s, prefer_full_page):
    def repl(m):
        inner = m.group(1)
        if '|' in inner:
            page, label = inner.split('|', 1)
        else:
            page, label = inner, inner
        page = re.sub(r'\s*\([^)]*\)', '', page).strip()
        label = label.strip()
        if prefer_full_page and page.startswith(label) and len(page) > len(label):
            return page
        return label or page
    return re.sub(r'\[\[([^\]]+)\]\]', repl, s)


def wiki_plain(s, prefer_full_page=False):
    s = re.sub(r'<!--.*?-->', '', s)
    s = re.sub(r'data-sort-value="[^"]*"\|', '', s)
    s = re.sub(r'\browspan="[^"]*"\|', '', s)
    s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<ref[^>]*/>', '', s)
    s = wiki_link(s, prefer_full_page)
    s = s.replace("'''", '').replace("''", '')
    s = s.strip()
    # Double A-sides list the hit side first.
    s = re.split(r'"\s*/\s*"', s)[0]
    s = s.strip().strip('"').strip()
    s = re.sub(r'\s*\([^)]*\bmix\b[^)]*\)', '', s, flags=re.I)
    return re.sub(r'\s+', ' ', s).strip()


def fetch_yearend():
    charts = {}
    for year in range(1970, 2000):
        title = 'Billboard Year-End Hot 100 singles of %d' % year
        url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json'
        })
        text = get(url, pause=0.15)['parse']['wikitext']['*']
        rows = []
        for line in text.splitlines():
            m = re.match(r'\|(\d+)\s*\|\|\s*(.*?)\s*\|\|\s*(.*?)\s*$', line.strip())
            if not m:
                continue
            rank = int(m.group(1))
            song = wiki_plain(m.group(2))
            artist = wiki_plain(m.group(3), prefer_full_page=True)
            if song and artist and 1 <= rank <= 100:
                rows.append({'year': year, 'rank': rank, 'title': song, 'artist': artist})
        rows.sort(key=lambda r: r['rank'])
        charts[year] = rows
        print('chart', year, len(rows), rows[0]['title'] if rows else 'EMPTY')
        if len(rows) < 40:
            raise RuntimeError('short year-end chart for %s' % year)
    return charts


def clean_html_title(s):
    s = re.sub(r'<[^>]+>', '', s)
    s = html_lib.unescape(s)
    s = s.replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip(' "')


def fetch_iconic_titles():
    """Titles from published VH1 rankings, used only as a cross-check."""
    pages = {
        '80s': [
            'http://www.rockonthenet.com/archive/2006/vh180s.htm',
            'http://www.rockonthenet.com/archive/2006/vh180s2.htm',
        ],
        '90s': [
            'http://www.rockonthenet.com/archive/2007/vh190s.htm',
            'http://www.rockonthenet.com/archive/2007/vh190s2.htm',
        ],
        'rock': [
            'http://www.rockonthenet.com/archive/2000/vh1rocksongs.htm',
        ],
    }
    found = {'80s': [], '90s': [], 'rock': []}
    pat = re.compile(
        r'&quot;(?:</?\w+[^>]*>|\s){0,12}<strong>(.*?)</strong>|<strong>&quot;(.*?)&quot;</strong>',
        re.S)
    for bucket, urls in pages.items():
        seen = set()
        for url in urls:
            html = get_text(url)
            for a, b in pat.findall(html):
                title = clean_html_title(a or b)
                key = norm(title)
                if key and key not in seen and 2 <= len(title) <= 80 and not title.isdigit():
                    seen.add(key)
                    found[bucket].append(title)
        # The top of each list is the iconic end. Keep the published order.
        found[bucket] = found[bucket][:40]
        print('iconic', bucket, len(found[bucket]), found[bucket][:3])
    return found


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('&', ' and ')
    s = re.sub(r'\bthe\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def title_key(title):
    t = re.sub(r'\((?:feat\.?|featuring|ft\.)[^)]*\)', '', title, flags=re.I)
    t = re.sub(r'\((\d{4})\s+version\)', r' \1 ', t, flags=re.I)
    t = PAREN_JUNK.sub('', t)
    t = PAREN_META.sub('', t)
    t = re.sub(r'\([^)]*\b(?:from|soundtrack)\b[^)]*\)', '', t, flags=re.I)
    t = re.sub(r'\s*\[[^\]]*\]', '', t)
    t = re.sub(r'\s+-\s+(?:(?:\d{4}\s+)?(?:remaster(?:ed)?|single version|radio edit|album version).*)$', '', t, flags=re.I)
    t = re.sub(r'\([^)]*hidden track[^)]*\)', '', t, flags=re.I)
    t = DASH_JUNK.sub('', t)
    t = norm(t)
    t = re.sub(r'\bpt\b', 'part', t)
    t = re.sub(r'\bii\b', '2', t)
    t = re.sub(r'\biii\b', '3', t)
    t = re.sub(r'\bnite\b', 'night', t)
    return re.sub(r'\s+', ' ', t).strip()


def titles_match(track, query):
    if title_key(track) == title_key(query) or loose_key(track) == loose_key(query):
        return True
    # "Love Machine (Pt. 1)" is the charted single of "Love Machine".
    def strip_part(key):
        return re.sub(r'\s+part\s+[0-9]+$', '', key).strip()
    if strip_part(title_key(track)) == title_key(query):
        return True
    base = re.sub(r'\s*\([^)]*\)\s*$', '', track).strip()
    paren = re.search(r'\(([^)]*)\)\s*$', track)
    arrangement = paren and re.search(r'\b(remix|mix|live|acoustic|edit|demo|version|instrumental|extended|intro|capella|cappella)\b', paren.group(1), re.I)
    if base and base != track and not arrangement and title_key(base) == title_key(query):
        return True
    # "(I Can't Help) Falling in Love With You" is the chart title with a few extra words.
    qw = title_key(query).split()
    tw = title_key(track).split()
    if len(qw) >= 4 and len(tw) <= len(qw) + 4:
        i = 0
        for word in tw:
            if i < len(qw) and word == qw[i]:
                i += 1
        extras = [w for w in tw if w not in qw]
        allowed = {'i', 'with', 'you', 'me', 'and', 'to', 'for', 'it', 'do', 'a', 'the'}
        if i == len(qw) and all(w in allowed for w in extras):
            return True
    return False


def loose_key(title):
    """Fallin' and Falling are the same title. Used only as a fallback."""
    parts = []
    for token in title_key(title).split():
        if token.endswith('g') and len(token) > 4:
            token = token[:-1]
        parts.append(token)
    return ' '.join(parts)


def junk_title(title):
    if JUNK.search(title) or PAREN_JUNK.search(title) or DASH_JUNK.search(title):
        return True
    if re.search(r'\b(remix|karaoke|mix)\b', title, re.I):
        return True
    return False


# Chart credits that Apple now lists under a later name.
ALIASES = {
    norm("Terence Trent D'Arby"): ['Sananda Maitreya'],
}


def lead_artist(artist):
    return re.split(r'\s+(?:&|and|with)\s+', artist, maxsplit=1, flags=re.I)[0].strip()


def artist_ok(query, name):
    name = re.split(r'\s+(?:feat\.?|featuring|ft\.)\s+', name or '', maxsplit=1, flags=re.I)[0]
    if JUNK.search(name):
        return False
    nq, nn = norm(query), norm(name)
    if nq and nq == nn:
        return True
    for alias in ALIASES.get(nq, []):
        if norm(alias) == nn:
            return True
    if nn.startswith(nq + ' and '):
        return True
    lead = norm(lead_artist(query))
    if lead and lead == nn and lead != nq:
        return True
    # "Dawn" is the credit Apple uses for "Tony Orlando and Dawn".
    if nn and re.search(r'(?:^| )%s(?: |$)' % re.escape(nn), nq):
        return True
    return False


def decade_of(year):
    if 1970 <= year <= 1979:
        return '70s'
    if 1980 <= year <= 1989:
        return '80s'
    if 1990 <= year <= 1999:
        return '90s'
    return ''


def search_song(title, artist):
    q = urllib.parse.urlencode({
        'term': '%s %s' % (title, artist),
        'entity': 'song',
        'limit': '50',
        'country': 'US',
    })
    return get('https://itunes.apple.com/search?' + q, pause=0.12)


def candidates(results, title, artist, chart_year):
    found = []
    for r in results.get('results') or []:
        if r.get('kind') != 'song':
            continue
        preview = r.get('previewUrl') or ''
        store = r.get('trackViewUrl') or ''
        if not preview.startswith('https://') or not store.startswith('https://'):
            continue
        track = r.get('trackName') or ''
        if junk_title(track):
            continue
        if not titles_match(track, title):
            continue
        if not artist_ok(artist, r.get('artistName') or ''):
            continue
        rd = r.get('releaseDate') or ''
        if len(rd) < 4 or not rd[:4].isdigit():
            continue
        year = int(rd[:4])
        if year < 1955 or year > 2026:
            continue
        ms = r.get('trackTimeMillis') or 0
        if ms < 75000 or ms > 12 * 60 * 1000:
            continue
        album = r.get('collectionName') or ''
        if JUNK.search(album):
            continue
        # Keep Apple's year when it already falls in the chart decade. A
        # release dated the year before, or a later compilation, is filed
        # under the Billboard year so the hit stays in its decade.
        shown = year if decade_of(year) == decade_of(chart_year) else chart_year
        display = re.sub(r'\s*\([^)]*hidden track[^)]*\)', '', track, flags=re.I).strip()
        comp = 2 if SOUNDTRACK.search(album) else 1 if HITS_ALBUM.search(album) or re.search(r'remix', album, re.I) else 0
        alt = 1 if re.search(r'\b(edit|radio|no rap|single version|remaster)', track, re.I) else 0
        found.append({
            'id': str(r['trackId']),
            'title': display,
            'artist': r['artistName'],
            'year': shown,
            'decade': decade_of(shown),
            'album': album,
            'artwork': r.get('artworkUrl100') or '',
            'store': store,
            'preview': preview,
            '_same': 0 if decade_of(year) == decade_of(chart_year) else 1,
            '_dist': abs(year - chart_year),
            '_comp': comp,
            '_alt': alt,
        })
    found.sort(key=lambda s: (s['_same'], s['_alt'], s['_comp'], s['_dist'], len(s['title'])))
    return found


def resolve(entry):
    queries = [entry['artist'], lead_artist(entry['artist'])]
    queries.extend(ALIASES.get(norm(entry['artist']), []))
    tried = set()
    best = None
    for artist in queries:
        if not artist or artist in tried:
            continue
        tried.add(artist)
        data = search_song(entry['title'], artist)
        found = candidates(data, entry['title'], entry['artist'], entry['year'])
        if found:
            best = found[0]
            break
    return best


def choose(charts, iconic):
    """Core year-end ranks, then iconic songs that finished lower."""
    picked = []
    seen = set()

    def add(entry, why):
        key = (entry['year'], norm(entry['title']), norm(lead_artist(entry['artist'])))
        if key in seen:
            return False
        seen.add(key)
        row = dict(entry)
        row['why'] = why
        picked.append(row)
        return True

    for year, rows in charts.items():
        for row in rows:
            if row['rank'] <= CORE_RANKS:
                add(row, 'year-end')

    iconic_keys = {norm(t) for bucket in iconic.values() for t in bucket}
    # A short title such as "One" is only safe when a single year-end row uses it.
    by_title = defaultdict(list)
    for rows in charts.values():
        for row in rows:
            by_title[norm(row['title'])].append(row)
    for key, rows in by_title.items():
        if key not in iconic_keys:
            continue
        pool = [r for r in rows if CORE_RANKS < r['rank'] <= ICONIC_MAX_RANK]
        if not pool:
            continue
        artists = {norm(lead_artist(r['artist'])) for r in pool}
        if len(pool) != 1 and len(artists) != 1:
            continue
        # Same recording charting again: keep the first year it was a hit.
        row = min(pool, key=lambda r: (r['year'], r['rank']))
        # Rock-list songs from other eras stay out unless this chart year is theirs.
        decade = decade_of(row['year'])
        on_decade_list = key in {norm(t) for t in iconic.get(decade, [])}
        on_rock = key in {norm(t) for t in iconic.get('rock', [])}
        if decade == '70s':
            if not (on_rock or on_decade_list):
                continue
        elif not on_decade_list:
            continue
        year_count = sum(1 for p in picked if p['year'] == row['year'] and p['why'] == 'iconic')
        if year_count >= 3:
            continue
        add(row, 'iconic')
    return picked


def main():
    charts = fetch_yearend()
    iconic = fetch_iconic_titles()
    seeds = choose(charts, iconic)
    print('seeds', len(seeds), Counter(s['why'] for s in seeds), Counter(decade_of(s['year']) for s in seeds))

    songs = []
    misses = []
    seen_id = set()
    seen_key = set()
    for i, seed in enumerate(seeds, 1):
        try:
            hit = resolve(seed)
        except Exception as e:
            print('FAIL', seed['year'], seed['title'], e)
            misses.append({**seed, 'reason': str(e)})
            continue
        if not hit:
            misses.append({**seed, 'reason': 'no original preview'})
            print('miss', seed['year'], '#%d' % seed['rank'], seed['title'], '-', seed['artist'])
            continue
        key = title_key(hit['title']) + '|' + norm(hit['artist'])
        if hit['id'] in seen_id or key in seen_key:
            misses.append({**seed, 'reason': 'duplicate of another hit'})
            continue
        seen_id.add(hit['id'])
        seen_key.add(key)
        hit['chartYear'] = seed['year']
        hit['chartRank'] = seed['rank']
        for extra in ('_dist', '_comp', '_same', '_alt'):
            hit.pop(extra, None)
        songs.append(hit)
        if i % 25 == 0:
            print('resolved', i, '/', len(seeds), 'kept', len(songs))

    # Backfill a thin year from the next year-end ranks, still from the same chart.
    by_chart_year = Counter(s['chartYear'] for s in songs)
    for year in range(1970, 2000):
        if by_chart_year[year] >= MIN_PER_YEAR:
            continue
        if Counter(s['decade'] for s in songs)[decade_of(year)] >= MAX_PER_DECADE:
            continue
        for row in charts[year]:
            if row['rank'] <= CORE_RANKS or row['rank'] > BACKFILL_RANK:
                continue
            if by_chart_year[year] >= MIN_PER_YEAR:
                break
            try:
                hit = resolve(row)
            except Exception as e:
                misses.append({**row, 'reason': str(e)})
                continue
            if not hit:
                misses.append({**row, 'reason': 'no original preview'})
                continue
            key = title_key(hit['title']) + '|' + norm(hit['artist'])
            if hit['id'] in seen_id or key in seen_key:
                continue
            seen_id.add(hit['id'])
            seen_key.add(key)
            hit['chartYear'] = year
            hit['chartRank'] = row['rank']
            for extra in ('_dist', '_comp', '_same', '_alt'):
                hit.pop(extra, None)
            songs.append(hit)
            by_chart_year[year] += 1
            print('backfill', year, '#%d' % row['rank'], hit['title'])

    songs.sort(key=lambda s: (s['decade'], s['year'], s['artist'].lower(), s['title'].lower()))
    doc = {
        'source': 'Apple iTunes Search API',
        'courtesy': '30-second previews provided courtesy of iTunes.',
        'storeNote': 'Previews stream from Apple to promote the matching iTunes listing. They are not downloaded or stored here.',
        'selection': 'Billboard Year-End Hot 100, top 12 each year from 1970 through 1999, plus lower year-end songs that also appear on VH1\'s 100 Greatest Songs of the \'80s (2006), 100 Greatest Songs of the \'90s (2007), or 100 Greatest Rock Songs (2000).',
        'songs': songs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    counts = Counter(s['decade'] for s in songs)
    years = Counter(s['chartYear'] for s in songs)
    print('WROTE', OUT, 'count', len(songs), dict(counts))
    print('per chart year', dict(sorted(years.items())))
    print('UNRESOLVED', len(misses))
    for m in misses:
        print(' - %s #%s %s — %s (%s)' % (m['year'], m['rank'], m['title'], m['artist'], m['reason']))


if __name__ == '__main__':
    main()
