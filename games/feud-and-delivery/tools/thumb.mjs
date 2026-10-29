// node tools/thumb.mjs [port] -> thumb.png (960x600) rendered from the real game's title screen (serve the repo root first).
// Unlocks with a code made by the shared office access module (COBAccess.makeCode); no PIN is used or needed.
import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import path from 'path';
const require = createRequire('/workspace/tools/'); const pw = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url)), port = process.argv[2] || '8098';
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:${port}/games/feud-and-delivery/`); await p.waitForFunction(() => window.FEUD && FEUD.booted);
await p.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code }))));
await p.reload(); await p.waitForFunction(() => window.FEUD && FEUD.booted); await p.waitForTimeout(1500);
await p.addStyleTag({ content: '#toasts,.mood-sticker,[class*=mood]{display:none!important}' });
await p.screenshot({ path: path.join(here, '..', 'thumb.png') });
await b.close();
