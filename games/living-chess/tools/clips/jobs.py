import json
T = [('P','pawn','pawn'),('N','knight','knight with a horse head'),('B','bishop','bishop with a mitre'),('R','rook','rook shaped like a castle turret'),('Q','queen','queen with a crown'),('K','king','king with a crown topped by a cross')]
SIDES = [('w','white','porcelain','white'),('b','black','ebony','black')]
SQ = [('dark','dark green'),('light','cream')]
DEATH = {
 'melt': 'then it slowly melts into a glossy {c} puddle that spreads across the top of the tile until it fully collapses',
 'shatter': 'then cracks race across its {m} body and it shatters like porcelain into dozens of sharp shards that scatter across the tile',
 'dust': 'then it turns grey and crumbles into a heap of fine dust that drifts away on a gentle breeze',
 'burn': 'then flames lick up from the tile, it chars and burns away into glowing embers and drifting grey ash',
 'topple': 'then a deep crack splits it down the middle, it wobbles, topples over sideways and breaks in two on the tile',
 'sand': 'then it dissolves from the top down into streams of fine sand that pour into a small dune on the tile',
 'lightning': 'then a jagged bolt of lightning strikes it from above in a blinding flash, leaving a smoking blackened stump that crumbles',
 'freeze': 'then frost races up its body, it freezes solid into pale blue ice, and splinters into icy shards',
 'sink': 'then the tile surface turns liquid and it slowly sinks into its square, one little hand reaching up, until it vanishes and the surface smooths over',
}
DK = list(DEATH)
CEL = {
 'fistpump': 'It bursts into jubilant triumph: a huge open-mouthed grin, it pumps both little fists in the air again and again, eyes sparkling',
 'dance': 'It breaks into a gleeful little victory dance, hopping side to side and wiggling with a huge grin, arms swinging',
 'gloat': 'It gives a smug, gloating grin, crosses its little arms, throws its head back laughing, then wags a finger',
 'glow': 'It swells with pride, chest puffed out, chin raised with a confident smile, as a warm golden glow and sparkles rise around it',
 'confetti': 'It leaps up cheering with arms raised high, landing with a happy bounce as bright confetti bursts and rains down around it',
 'flex': 'It flexes both little arms like a champion, grinning broadly, then gives a cocky wink and a thumbs up',
}
CK = list(CEL)
EMO = {
 'fear': 'Terror: its big eyes go wide, pupils shrink, it trembles violently, mouth open in a gasp, cowering back with its little hands raised defensively, a bead of sweat on its head',
 'sorrow': 'Grief: its face crumples, it weeps uncontrollably with big tears streaming down, shoulders shaking, then slumps forward and covers its face with its little hands',
 'rage': 'Fury: its brows slam down, eyes blaze, teeth gritted, it shakes with anger, clenches both little fists and stamps, glowing red-hot at the edges as steam puffs from its head',
 'relief': 'Relief: it lets out a huge sigh, shoulders dropping, wipes its brow with one little hand, then smiles gently with eyes closed as a soft warm light settles on it',
 'hope': 'Hope: it looks upward with shining, wide eyes and a dawning smile, clasps its little hands to its chest as a soft warm beam of light falls on it and tiny motes float up',
 'dismay': 'Dismay: its jaw drops in disbelief, it clutches its head with both little hands, staggers back and its knees buckle as the color drains from its face',
}
def pre(t, s, q):
    return f"Static locked-off camera, no camera movement, no zoom. The little {s[1]} {s[2]} {t[2]} chess character with a cartoon face stands on its {q[1]} marble tile against a perfectly flat, uniform chroma-key green background that never changes. "
SUF = " Pixar-meets-claymation, photoreal, soft studio light. The tile stays exactly in place; the green background stays solid green."
jobs = []
for ti, t in enumerate(T):
  for si, s in enumerate(SIDES):
    for qi, q in enumerate(SQ):
      v = ti*4 + si*2 + qi; base = f"{t[0]}{s[0]}-{q[0]}"; img = f"/workspace/chess-clips-assets/ref/{base}.png"
      for k in range(2):
        d = DK[(ti*8 + si*4 + qi*2 + k) % 9]
        jobs.append(dict(pri=0 if k == 0 else 2, id=f"{base}-demise-{d}", img=img, p=pre(t,s,q) + "Its big eyes fill with fear, its face crumples and it begins to sob, " + DEATH[d].format(c=s[3], m=s[2]) + "." + SUF))
      c = CK[(v + ti) % 6]
      jobs.append(dict(pri=1, id=f"{base}-triumph-{c}", img=img, p=pre(t,s,q) + CEL[c] + "." + SUF))
      for e, pr in (('fear',3),('sorrow',4),('rage',5),('relief',6)):
        jobs.append(dict(pri=pr, id=f"{base}-{e}", img=img, p=pre(t,s,q) + EMO[e] + "." + SUF))
      if t[0] == 'P': jobs.append(dict(pri=3, id=f"{base}-hope", img=img, p=pre(t,s,q) + EMO['hope'] + "." + SUF))
      if t[0] == 'K': jobs.append(dict(pri=3, id=f"{base}-dismay", img=img, p=pre(t,s,q) + EMO['dismay'] + "." + SUF))
jobs.sort(key=lambda j: j['pri'])
json.dump(jobs, open('jobs.json','w'), indent=0)
print(len(jobs))
from collections import Counter; print(Counter(j['id'].split('-')[3] if 'demise' in j['id'] else '' for j in jobs))
