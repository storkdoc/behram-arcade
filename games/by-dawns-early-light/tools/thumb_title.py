# python3 tools/thumb_title.py — overlay the title on /tmp/bdel_thumb_raw.png -> thumb.png (960x600)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
im = Image.open('/tmp/bdel_thumb_raw.png').convert('RGB').resize((960, 600))
F = '/usr/share/fonts/truetype/sand-box/google/IBM Plex Serif/IBMPlexSerif-Regular.ttf'
try: f1 = ImageFont.truetype(F, 54); f2 = ImageFont.truetype(F, 18)
except Exception: f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 50); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 17)
def spaced(d, y, text, font, sp, fill):
    w = sum(d.textlength(c, font=font) + sp for c in text) - sp; x = (960 - w) / 2
    for c in text: d.text((x, y), c, font=font, fill=fill); x += d.textlength(c, font=font) + sp
glow = Image.new('RGBA', im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
spaced(g, 40, "BY DAWN'S EARLY LIGHT", f1, 7, (255, 190, 120, 200)); glow = glow.filter(ImageFilter.GaussianBlur(10))
im = Image.alpha_composite(im.convert('RGBA'), glow); d = ImageDraw.Draw(im)
spaced(d, 40, "BY DAWN'S EARLY LIGHT", f1, 7, (240, 236, 228, 255))
spaced(d, 112, 'ONE NIGHT · ONE AIRCRAFT · BRING THEM HOME BEFORE DAWN', f2, 3, (200, 210, 222, 230))
im.convert('RGB').save('thumb.png'); print(im.size)
