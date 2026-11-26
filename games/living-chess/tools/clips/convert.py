# mp4 (green screen) -> keyed WebP sprite atlas. usage: convert.py in.mp4 out.webp [fps] [size]
import sys, subprocess, numpy as np, json, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
FPS = float(sys.argv[3]) if len(sys.argv) > 3 else 12
S = int(sys.argv[4]) if len(sys.argv) > 4 else 176
CROP = (0.11, 0.14, 0.78)  # x0, y0, side (fractions of width) — same camera for every clip
W = int(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width','-of','csv=p=0',src]).split()[0])
H = W
cx, cy, cs = int(CROP[0]*W), int(CROP[1]*W), int(CROP[2]*W)
raw = subprocess.check_output(['ffmpeg','-v','error','-i',src,'-vf',f'fps={FPS},crop={cs}:{cs}:{cx}:{cy},scale={S}:{S}:flags=area','-f','rawvideo','-pix_fmt','rgb24','-'])
fr = np.frombuffer(raw, np.uint8).reshape(-1, S, S, 3).astype(np.float32)
n = len(fr)
def key(f):
    r, g, b = f[...,0], f[...,1], f[...,2]
    m = np.maximum(r, b)
    d = g - m  # greenness
    a = 1 - np.clip((d - 22) / 40, 0, 1)   # d<22 opaque, d>62 transparent
    # spill suppression
    g2 = np.where(g > m, m + (g - m) * 0.25, g)
    o = np.stack([r, g2, b, a * 255], -1)
    return o
cols = int(np.ceil(np.sqrt(n))); rows = int(np.ceil(n / cols))
atlas = np.zeros((rows*S, cols*S, 4), np.float32)
for i, f in enumerate(fr):
    k = key(f)
    atlas[(i//cols)*S:(i//cols+1)*S, (i%cols)*S:(i%cols+1)*S] = k
img = Image.fromarray(np.clip(atlas,0,255).astype(np.uint8), 'RGBA')
img.save(out, 'WEBP', quality=int(os.environ.get('Q', 72)), alpha_quality=80, method=6)
print(json.dumps({'out': out, 'n': n, 'cols': cols, 'rows': rows, 'size': S, 'fps': FPS, 'kb': round(os.path.getsize(out)/1024)}))
