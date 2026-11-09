/* JUKEBOX catalog helpers. Song rows come from data/catalog.json, built from the
   Apple iTunes Search API. This file does not invent recordings. */
(function (root) {
  'use strict';
  const COURTESY = '30-second previews provided courtesy of iTunes.';
  const SOURCE = 'Apple iTunes Search API';

  function decadeOf(year) {
    if (year >= 1970 && year <= 1979) return '70s';
    if (year >= 1980 && year <= 1989) return '80s';
    if (year >= 1990 && year <= 1999) return '90s';
    return '';
  }

  function accept(s) {
    if (!s || typeof s !== 'object') return false;
    const year = s.year;
    const decade = decadeOf(year);
    if (!decade || s.decade !== decade) return false;
    if (!/^\d{5,12}$/.test(String(s.id))) return false;
    if (!s.title || !s.artist) return false;
    if (!/^https:\/\/audio(?:-ssl)?\.itunes\.apple\.com\//.test(s.preview || '')) return false;
    if (!/^https:\/\/(?:music|itunes)\.apple\.com\//.test(s.store || '')) return false;
    return true;
  }

  function prepare(songs) {
    const out = [];
    const ids = new Set();
    (songs || []).forEach(s => {
      if (!accept(s) || ids.has(String(s.id))) return;
      ids.add(String(s.id));
      s._q = norm(s.title + ' ' + s.artist + ' ' + (s.album || ''));
      out.push(s);
    });
    return out;
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function query(songs, opts) {
    opts = opts || {};
    const decade = opts.decade || 'all';
    const favs = opts.favs;
    const q = norm(opts.q);
    const out = [];
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      if (decade === 'fav') {
        if (!favs || !favs.has(String(s.id))) continue;
      } else if (decade !== 'all' && s.decade !== decade) continue;
      if (q) {
        if (!s._q) s._q = norm(s.title + ' ' + s.artist + ' ' + (s.album || ''));
        if (s._q.indexOf(q) < 0) continue;
      }
      out.push(s);
    }
    return out;
  }

  const api = { COURTESY, SOURCE, decadeOf, accept, prepare, query, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
