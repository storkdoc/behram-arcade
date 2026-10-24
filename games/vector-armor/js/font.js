/* VECTOR ARMOR — font.js : a 5x7 arcade bitmap font drawn as whole device pixels (never blurry). */
const Font = (() => {
  const D = {
    A:'0E11111F111111',B:'1E11111E11111E',C:'0E11101010110E',D:'1E11111111111E',E:'1F10101E10101F',F:'1F10101E101010',
    G:'0E11101711110F',H:'1111111F111111',I:'0E04040404040E',J:'0702020202120C',K:'11121418141211',L:'1010101010101F',
    M:'111B1515111111',N:'11111915131111',O:'0E11111111110E',P:'1E11111E101010',Q:'0E11111115120D',R:'1E11111E141211',
    S:'0F10100E01011E',T:'1F040404040404',U:'1111111111110E',V:'1111111111 0A04'.replace(' ',''),W:'1111111515150A',X:'11110A040A1111',
    Y:'11110A04040404',Z:'1F01020408101F',
    0:'0E111315191 10E'.replace(' ',''),1:'040C040404040E',2:'0E11010204081F',3:'1F020402011 10E'.replace(' ',''),4:'02060A121F0202',
    5:'1F101E0101110E',6:'0608101E11110E',7:'1F010204080808',8:'0E11110E11110E',9:'0E11110F01020C',
    '-':'0000001F000000','.':'00000000000C0C',':':'000C0C000C0C00','!':'04040404040004','?':'0E110102040004',
    '/':'01010204081010',"'":'04040800000000',',':'000000000C0408','<':'02040810080402','>':'08040201020408',
    '=':'00001F001F0000','*':'0004150E150400','(':'02040808080402',')':'08040202020408','+':'0004041F040400',
    '#':'0A0A1F0A1F0A0A','&':'0C121408151 20D'.replace(' ',''),'%':'18190204081303','♥':'000A1F1F0E0400',
    '◀':'02060E1E0E0602','▶':'080C0E0F0E0C08','▲':'0004040E0E1F00','▼':'001F0E0E040400','·':'00000004000000',
    '♪':'02061E1E1E0602','"':'0A0A0000000000','_':'0000000000001F','@':'0E11171517100E','$':'040F140E051E04'
  };
  const G = {};
  for (const k in D) { const h = D[k]; G[k] = []; for (let i = 0; i < 7; i++) G[k].push(parseInt(h.substr(i * 2, 2), 16)); }
  const norm = s => String(s).replace(/…/g, '...').toUpperCase();
  /** width in device px for a given dot size */
  const width = (s, dot) => { s = norm(s); return s.length ? (s.length * 6 - 1) * dot : 0; };
  /** draw text with its top-left / center / right at integer device pixels. Returns the width. */
  function draw(ctx, s, x, y, dot, color, align, shadow) {
    s = norm(s); dot = Math.max(1, Math.round(dot));
    const w = width(s, dot);
    if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (shadow) { const o = Math.max(1, Math.round(dot / 3)); ctx.fillStyle = shadow; run(ctx, s, x + o, y + o, dot); }
    ctx.fillStyle = color; run(ctx, s, x, y, dot);
    return w;
  }
  function run(ctx, s, x, y, dot) {
    for (let c = 0; c < s.length; c++) {
      const g = G[s[c]]; if (!g) continue; const cx = x + c * 6 * dot;
      for (let r = 0; r < 7; r++) {
        const bits = g[r]; if (!bits) continue; let b = 4;
        while (b >= 0) {
          if (bits >> b & 1) { let e = b; while (e - 1 >= 0 && (bits >> (e - 1) & 1)) e--; ctx.fillRect(cx + (4 - b) * dot, y + r * dot, (b - e + 1) * dot, dot); b = e - 1; }
          else b--;
        }
      }
    }
  }
  /** wrap text into lines of at most n chars */
  function wrap(s, n) {
    const out = []; for (const para of norm(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } out.push(line); } return out;
  }
  return { G, draw, width, wrap, norm };
})();
