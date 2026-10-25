# Generates tex/*.jpg|png and js/world.js from public-domain sources:
#   NASA Blue Marble (world.topo.bathy.200412), NASA Black Marble 2016, NASA cloud_combined_2048,
#   Natural Earth 110m countries + 50m populated places (public domain).
# usage: python3 tools/gen.py /path/to/sources
import json, sys, math, collections
from PIL import Image, ImageDraw, ImageFilter
Image.MAX_IMAGE_PIXELS = None
SRC = sys.argv[1]; OUT = '.'
BLOCS = ['WA', 'EB', 'PC', 'EU', 'SA', 'MC']
EB = {'RUS','BLR','KAZ','UZB','TJK','KGZ','TKM','MNG','ARM','AZE','GEO'}
def bloc_of(p):
    a = p['ADM0_A3']; sub = p['SUBREGION']; cont = p['CONTINENT']
    if a in EB: return 1
    if a in ('ATA','ATF'): return 6
    if a == 'CYP' or a == 'CYN': return 3
    if sub in ('Northern America','Central America','Caribbean'): return 0
    if sub in ('Eastern Asia','South-Eastern Asia','Melanesia','Australia and New Zealand','Micronesia','Polynesia'): return 2
    if cont == 'Europe': return 3
    if sub == 'South America': return 4
    if cont == 'Africa' or sub in ('Western Asia','Southern Asia'): return 5
    print('unassigned', a, sub); return 6
countries = json.load(open(SRC + '/countries.geojson'))['features']
def polys(g):
    if g['type'] == 'Polygon': return [g['coordinates']]
    return g['coordinates']
W, H = 4096, 2048
def px(lon, lat, w, h): return ((lon + 180) / 360 * w, (90 - lat) / 180 * h)
# territory id raster (R) and borders (B)
terr = Image.new('L', (W, H), 0); bord = Image.new('L', (W * 2, H * 2), 0)
dt = ImageDraw.Draw(terr); db = ImageDraw.Draw(bord)
blocpop = collections.Counter(); cbloc = {}
for f in countries:
    b = bloc_of(f['properties']); cbloc[f['properties']['ADM0_A3']] = b
    blocpop[b] += f['properties']['POP_EST']
    for poly in polys(f['geometry']):
        ring = [px(x, y, W, H) for x, y in poly[0]]
        dt.polygon(ring, fill=(b + 1) * 30 if b < 6 else 230)
        for r in poly[:1]:
            db.line([px(x, y, W * 2, H * 2) for x, y in r], fill=255, width=3)
bord = bord.resize((W, H), Image.LANCZOS)
# water mask from the 50m land polygons (finer coast than 110m countries)
land = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(land)
for f in json.load(open(SRC + '/land.geojson'))['features']:
    for poly in polys(f['geometry']):
        dl.polygon([px(x, y, W, H) for x, y in poly[0]], fill=255)
        for hole in poly[1:]: dl.polygon([px(x, y, W, H) for x, y in hole], fill=0)
water = Image.eval(land.filter(ImageFilter.GaussianBlur(1.2)), lambda v: 255 - v)
Image.merge('RGB', (terr, water, bord)).save(OUT + '/tex/terr.png', optimize=True)
# imagery
Image.open(SRC + '/bm.jpg').convert('RGB').resize((W, H), Image.LANCZOS).save(OUT + '/tex/day.jpg', quality=84, optimize=True, progressive=True)
n = Image.open(SRC + '/night.jpg').convert('L').resize((W, H), Image.LANCZOS)
n.save(OUT + '/tex/night.jpg', quality=82, optimize=True)
Image.open(SRC + '/clouds.jpg').convert('L').save(OUT + '/tex/clouds.jpg', quality=80, optimize=True)
# 1-degree sim grid. chars: '.' ocean, '0'-'5' bloc land, 'n' neutral land, 'a'-'f' bloc waters
G = [[None] * 360 for _ in range(180)]
tp = terr.load(); lp = land.load()
for j in range(180):
    for i in range(360):
        x = int((i + 0.5) / 360 * W); y = int((j + 0.5) / 180 * H)
        v = tp[x, y]; l = lp[x, y] > 127
        if v and v != 230: G[j][i] = str(v // 30 - 1)
        elif v == 230 or (l and j > 160): G[j][i] = 'n'
        else: G[j][i] = '.'
# fix land cells with no country (small islands from 50m mask) -> neutral land if majority land; keep ocean otherwise
# waters: BFS from bloc land over ocean, up to 7 cells
dist = [[99] * 360 for _ in range(180)]; owner = [[-1] * 360 for _ in range(180)]
q = collections.deque()
for j in range(180):
    for i in range(360):
        if G[j][i] in '012345': dist[j][i] = 0; owner[j][i] = int(G[j][i]); q.append((j, i))
while q:
    j, i = q.popleft()
    if dist[j][i] >= 7: continue
    for dj, di in ((1,0),(-1,0),(0,1),(0,-1)):
        jj, ii = j + dj, (i + di) % 360
        if 0 <= jj < 180 and G[jj][ii] == '.' and dist[jj][ii] > dist[j][i] + 1:
            dist[jj][ii] = dist[j][i] + 1; owner[jj][ii] = owner[j][i]; q.append((jj, ii))
for j in range(180):
    for i in range(360):
        if G[j][i] == '.' and owner[j][i] >= 0: G[j][i] = 'abcdef'[owner[j][i]]
grid = ''.join(''.join(r) for r in G)
# cities: biggest per bloc, spaced >= 2.5 deg, scaled to bloc population
places = json.load(open(SRC + '/places50.geojson'))['features']
pl = sorted([f['properties'] for f in places], key=lambda p: -p['pop_max'])
def gc(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    return math.degrees(math.acos(max(-1, min(1, math.sin(la1)*math.sin(la2) + math.cos(la1)*math.cos(la2)*math.cos(lo1-lo2)))))
cities = collections.defaultdict(list)
for p in pl:
    b = cbloc.get(p['adm0_a3'])
    if b is None or b >= 6: continue
    la, lo = p['latitude'], p['longitude']
    if len(cities[b]) >= 18: continue
    if any(gc((la, lo), (c[1], c[2])) < 2.5 for c in cities[b]): continue
    cities[b].append([p['nameascii'], round(la, 2), round(lo, 2), p['pop_max']])
out = []
for b in range(6):
    cs = cities[b]; tot = sum(c[3] for c in cs); share = blocpop[b] * 0.62  # population living in/around the big metro regions
    for c in cs: out.append([c[0], c[1], c[2], b, round(c[3] / tot * share / 1e6, 2)])
    print(BLOCS[b], len(cs), round(blocpop[b] / 1e6), 'M', [c[0] for c in cs][:6])
# coarse coastline / border polylines for the vector War Room view (from 110m countries, rounded)
lines = []
for f in countries:
    if bloc_of(f['properties']) == 6 and f['properties']['ADM0_A3'] == 'ATA': pass
    for poly in polys(f['geometry']):
        r = poly[0]
        if len(r) < 4: continue
        lines.append([round(v, 1) for xy in r for v in xy])
js = '/* generated by tools/gen.py from Natural Earth (public domain). Do not edit. */\n'
js += '(function (g) {\nconst W = {\n'
js += ' grid: ' + json.dumps(grid) + ',\n'
js += ' cities: ' + json.dumps(out, separators=(',', ':')) + ',\n'
js += ' lines: ' + json.dumps(lines, separators=(',', ':')) + '\n};\n'
js += 'if (typeof module !== "undefined") module.exports = W; else g.MCWorld = W;\n})(typeof window !== "undefined" ? window : globalThis);\n'
open(OUT + '/js/world.js', 'w').write(js)
