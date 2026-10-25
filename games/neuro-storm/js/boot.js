/* NEURO STORM boot: choose the classic 4K CPU model or a dense GPU cortex tier (55K to 1M neurons). */
const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const TIER_IDS = ['55k', '147k', '276k', '1m'];
function probeGpu() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) return null;
    const ok = !!gl.getExtension('EXT_color_buffer_float');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok, name, maxTex };
  } catch (e) { return null; }
}
function autoTier(gpu) {
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(gpu.name);
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const small = Math.min(screen.width, screen.height) < 600;
  const apple = /apple/i.test(gpu.name);
  if (soft) return '55k';
  if (touch) return small ? '55k' : '147k';      // iPhone / iPad (the runtime check steps down if needed)
  if (apple) return '1m';                         // Apple-silicon Mac
  return '276k';
}
function choose() {
  const t = (Q.get('tier') || '').toLowerCase(), n = +Q.get('n');
  if (t === '4k' || t === 'classic' || Q.get('gl') === '0') return { mode: 'classic', why: 'url' };
  if (n && n <= 6000) return { mode: 'classic', why: 'url' };
  const gpu = probeGpu();
  if (!gpu || !gpu.ok || gpu.maxTex < 4096) return { mode: 'classic', why: 'nofloat' };
  if (TIER_IDS.includes(t)) return { mode: 'dense', tier: t, why: 'url', gpu };
  if (n) { const v = n < 100e3 ? '55k' : n < 200e3 ? '147k' : n < 600e3 ? '276k' : '1m'; return { mode: 'dense', tier: v, why: 'url', gpu }; }
  const saved = sessionStorage.getItem('ns-tier');
  if (saved === '4k') return { mode: 'classic', why: 'saved' };
  if (TIER_IDS.includes(saved)) return { mode: 'dense', tier: saved, why: 'saved', gpu };
  return { mode: 'dense', tier: autoTier(gpu), why: 'auto', gpu };
}
const pick = choose();
const sel = $('selN');
sel.addEventListener('change', () => {
  sessionStorage.setItem('ns-tier', sel.value);
  const u = new URL(location.href); u.searchParams.delete('n'); u.searchParams.delete('gl'); u.searchParams.set('tier', sel.value); location.href = u.toString();
});
async function go() {
  if (pick.mode === 'dense') {
    document.body.classList.add('dense', 'loading');
    $('ncount').textContent = '…';
    try {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
      const { startDense } = await import('./dmain.js');
      await startDense(pick.tier, pick.why);
      document.body.classList.remove('loading');
      window.NS.boot = pick; return;
    } catch (e) {
      console.warn('dense mode failed, falling back to the classic model:', e);
      document.body.classList.remove('dense', 'loading');
      const c = $('gl'), c2 = c.cloneNode(); c.replaceWith(c2);
    }
  }
  sel.value = '4k'; document.body.classList.add('classic');
  await import('./main.js');
  if (window.NS) window.NS.boot = pick;
}
go();
