#!/usr/bin/env node
/* Behram Arcade — read MoodSticker feedback submissions (Fun / Okay / Skip + optional suggestion).
   Node 18+ (uses global fetch). No dependencies, no credentials.

   Sinks (must match CONFIG in assets/js/mood-sticker.js):
     1. textdb.dev  — one JSON document per UTC day:  https://textdb.dev/api/data/<KEY>-YYYY-MM-DD
     2. ntfy.sh     — append-only mirror, kept ~12 h:  https://ntfy.sh/<TOPIC>/json?poll=1&since=all
   Records from both are merged and de-duplicated by id.

   Usage:
     node tools/read-feedback.mjs                       # yesterday (America/New_York), real players only
     node tools/read-feedback.mjs --date 2026-10-29     # a specific local day
     node tools/read-feedback.mjs --today               # today so far
     node tools/read-feedback.mjs --hours 36            # rolling window
     node tools/read-feedback.mjs --include-test        # also show test submissions ("test": true)
     node tools/read-feedback.mjs --only-test           # only test submissions
     node tools/read-feedback.mjs --json                # machine-readable JSON array on stdout
     node tools/read-feedback.mjs --archive ~/arcade-feedback.jsonl   # also append new records to a local archive
     node tools/read-feedback.mjs --id <recordId>       # find one record (any of the last 3 days)
     node tools/read-feedback.mjs --no-sync             # read only (by default, records that only reached the
                                                        #   12-hour ntfy mirror are copied into the durable textdb doc)
   Env overrides: FEEDBACK_TEXTDB_KEY, FEEDBACK_NTFY_TOPIC, FEEDBACK_TZ. */
import fs from 'node:fs';
import path from 'node:path';

const TEXTDB_BASE = 'https://textdb.dev/api/data/';
const TEXTDB_KEY = process.env.FEEDBACK_TEXTDB_KEY || 'behram-arcade-feedback-576d3eaa35c97915ac7d2c64';
const NTFY_TOPIC = process.env.FEEDBACK_NTFY_TOPIC || 'behram-arcade-fb-816a8d80e0b671e8c39b';
const TZ = process.env.FEEDBACK_TZ || 'America/New_York';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (flag('-h') || flag('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }

// --- local-day window in TZ -> UTC instants
const ymdInTz = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const tzOffsetMin = (d) => {   // minutes to add to UTC to get local wall time
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000;
};
const localMidnightUtc = ymd => {
  const [y, m, d] = ymd.split('-').map(Number), guess = new Date(Date.UTC(y, m - 1, d));
  let t = guess.getTime() - tzOffsetMin(guess) * 60000;
  t = guess.getTime() - tzOffsetMin(new Date(t)) * 60000;   // second pass handles DST edges
  return new Date(t);
};
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const nowD = new Date();
let from, to, label;
if (opt('--hours')) { to = nowD; from = new Date(nowD - Number(opt('--hours')) * 36e5); label = `last ${opt('--hours')} h`; }
else {
  const day = opt('--date') || (flag('--today') ? ymdInTz(nowD) : addDays(ymdInTz(nowD), -1));
  from = localMidnightUtc(day); to = localMidnightUtc(addDays(day, 1)); label = `${day} (${TZ})`;
}
if (opt('--id')) { from = new Date(nowD - 3 * 864e5); to = new Date(+nowD + 864e5); label = 'id ' + opt('--id'); }

// UTC day documents overlapping the window
const utcDays = [];
for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t < to.getTime(); t += 864e5) utcDays.push(new Date(t).toISOString().slice(0, 10));

const getText = async (url) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } }); if (r.ok) return await r.text(); if (r.status === 404) return ''; } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error('fetch failed: ' + url);
};
const errors = [], all = new Map(), source = {};
const add = (rec, src) => {
  if (!rec || typeof rec !== 'object' || !rec.id || !rec.ts) return;
  if (!all.has(rec.id)) all.set(rec.id, rec);
  (source[rec.id] ||= new Set()).add(src);
};
await Promise.all(utcDays.map(async d => {
  try {
    const txt = await getText(`${TEXTDB_BASE}${encodeURIComponent(`${TEXTDB_KEY}-${d}`)}?_=${Date.now()}`);
    if (!txt.trim()) return;
    let doc; try { doc = JSON.parse(txt); } catch { errors.push(`textdb ${d}: not JSON (${txt.length} bytes)`); return; }
    for (const r of (Array.isArray(doc) ? doc : doc.items || [])) add(r, 'textdb');
  } catch (e) { errors.push(`textdb ${d}: ${e.message}`); }
}));
try {
  const txt = await getText(`https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=all`);
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.event === 'message' && m.message) add(JSON.parse(m.message), 'ntfy'); } catch { /* not a record */ }
  }
} catch (e) { errors.push('ntfy: ' + e.message); }

// Repair: a record that reached ntfy but not textdb (player closed the tab mid-write, or two writers
// raced) is appended to its textdb day document so it survives past ntfy's ~12 h cache. Idempotent.
if (!flag('--no-sync')) {
  const orphans = [...all.values()].filter(r => source[r.id].has('ntfy') && !source[r.id].has('textdb'));
  const byDay = {}; orphans.forEach(r => (byDay[r.ts.slice(0, 10)] ||= []).push(r));
  for (const [d, recs] of Object.entries(byDay)) {
    const url = `${TEXTDB_BASE}${encodeURIComponent(`${TEXTDB_KEY}-${d}`)}`;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const txt = await getText(`${url}?_=${Date.now()}`);
        let doc; try { doc = JSON.parse(txt); } catch { doc = null; }
        if (Array.isArray(doc)) doc = { v: 1, items: doc };
        if (!doc || !Array.isArray(doc.items)) { if (txt.trim()) throw new Error('day doc is not JSON; not overwriting'); doc = { v: 1, items: [] }; }
        const have = new Set(doc.items.map(x => x && x.id)), add2 = recs.filter(r => !have.has(r.id));
        if (!add2.length) break;
        doc.items.push(...add2); doc.updated = new Date().toISOString();
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(doc) });
        if (!r.ok) throw new Error('write ' + r.status);
        await new Promise(res => setTimeout(res, 700));
      }
      recs.forEach(r => source[r.id].add('textdb(synced)'));
      console.error(`sync: copied ${recs.length} ntfy-only record(s) into textdb ${d}`);
    } catch (e) { errors.push(`sync ${d}: ${e.message}`); }
  }
}

let rows = [...all.values()].filter(r => { const t = Date.parse(r.ts); return t >= from && t < to; });
if (opt('--id')) rows = rows.filter(r => r.id === opt('--id'));
else if (flag('--only-test')) rows = rows.filter(r => r.test === true);
else if (!flag('--include-test')) rows = rows.filter(r => r.test !== true);
rows.sort((a, b) => a.ts.localeCompare(b.ts));
rows.forEach(r => { r._sources = [...(source[r.id] || [])]; });

if (opt('--archive')) {
  const file = opt('--archive').replace(/^~(?=\/)/, process.env.HOME || '~');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const have = new Set();
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) { try { have.add(JSON.parse(l).id); } catch { /* skip */ } }
  const fresh = [...all.values()].filter(r => !have.has(r.id));
  if (fresh.length) fs.appendFileSync(file, fresh.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.error(`archive: +${fresh.length} new record(s) -> ${file}`);
}

if (flag('--json')) { console.log(JSON.stringify(rows, null, 2)); }
else {
  const fmt = iso => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(from).find(p => p.type === 'timeZoneName')?.value || TZ;
  console.log(`Behram Arcade feedback — ${label}: ${rows.length} submission(s)${flag('--include-test') ? ' incl. tests' : ''}`);
  const tally = {}; rows.forEach(r => { const k = `${r.gameTitle || r.game}`; tally[k] ||= { fun: 0, okay: 0, skip: 0, none: 0, notes: 0 }; tally[k][r.rating || 'none']++; if (r.text) tally[k].notes++; });
  for (const [g, t] of Object.entries(tally)) console.log(`  ${g}: fun ${t.fun} · okay ${t.okay} · skip ${t.skip}${t.none ? ` · note-only ${t.none}` : ''} · suggestions ${t.notes}`);
  for (const r of rows) {
    const mins = Math.floor((r.durationSec || 0) / 60), secs = (r.durationSec || 0) % 60;
    console.log(`\n[${fmt(r.ts)} ${tzName}] ${r.gameTitle || r.game} (${r.game}) — ${String(r.rating || 'no rating').toUpperCase()}${r.test ? '  [TEST]' : ''}`);
    if (r.text) console.log(`  "${r.text.replace(/\n/g, '\n   ')}"`);
    console.log(`  session ${r.sid} started ${fmt(r.sessionStart)} ${tzName}, played ${mins}m${String(secs).padStart(2, '0')}s, last screen: ${r.lastScreen}${r.screens && r.screens.length ? ` (trail: ${r.screens.join(' > ')})` : ''}`);
    console.log(`  ${r.device}/${r.input}, ${r.viewport ? r.viewport.w + 'x' + r.viewport.h : '?'}, events big ${r.events?.big ?? 0} win ${r.events?.win ?? 0} lose ${r.events?.lose ?? 0} stall ${r.events?.stall ?? 0} · ${r.url} · id ${r.id} via ${r._sources.join('+')}`);
  }
}
if (errors.length) { console.error('\nWARN: ' + errors.join('\nWARN: ')); }
process.exit(errors.length && !rows.length && errors.length >= utcDays.length + 1 ? 2 : 0);
