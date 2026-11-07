/* JUKEBOX catalog — real 1970s, 1980s and 1990s hits.
   Every video id is the original official / artist / label upload already stored on
   Name That Groove (field `yt` in games/name-that-groove/js/catalog.js). That file
   records the 2026-11-06 check: public, not age-restricted, YouTube reported
   "playable in embed", oEmbed returned 200, and the IFrame API played it.
   Instrumental and karaoke ids (`iyt`) belong to the quiz and are not used here.
   This file invents no ids, titles, artists or years. */
(function (root) {
  'use strict';
  function source() {
    if (root.NTG_Catalog && root.NTG_Catalog.SONGS) return root.NTG_Catalog;
    if (typeof require === 'function') {
      try { return require('../../name-that-groove/js/catalog.js'); } catch (e) { /* opened as a page, or the quiz catalog moved */ }
    }
    return null;
  }
  const N = source();
  if (!N) throw new Error('Jukebox catalog needs the Name That Groove catalog');

  const SONGS = N.SONGS.map(s => ({
    id: s.id, decade: s.decade, year: s.year, title: s.title, artist: s.artist, genre: s.genre, yt: s.yt
  }));
  const BY = {};
  SONGS.forEach(s => { BY[s.id] = s; });

  const DECADES = ['70s', '80s', '90s'];
  const DECADE_INFO = {
    '70s': { label: "'70s", long: 'The Seventies' },
    '80s': { label: "'80s", long: 'The Eighties' },
    '90s': { label: "'90s", long: 'The Nineties' },
    all: { label: 'ALL', long: 'All decades' },
    fav: { label: 'FAVES', long: 'Your favorites' }
  };
  const TABS = ['70s', '80s', '90s', 'all', 'fav'];
  const SOURCE_NOTE = "Songs play in full in YouTube's own player. YouTube controls availability and any ads.";
  const PREMIUM_NOTE = 'YouTube chooses whether an ad plays. YouTube Premium can apply to embedded videos when you are signed in to YouTube in this same browser and cookies for [*.]youtube.com are allowed. YouTube Music Premium alone does not cover videos. Info cards can still appear. This jukebox does not hide the player and cannot turn ads off.';
  const PREMIUM_URL = 'https://support.google.com/youtube/answer/7437519';

  const byId = id => BY[id] || null;
  const songsFor = mode => (mode === 'all' || mode === 'fav') ? SONGS.slice() : SONGS.filter(s => s.decade === mode);
  const api = { SONGS, DECADES, DECADE_INFO, TABS, byId, songsFor, SOURCE_NOTE, PREMIUM_NOTE, PREMIUM_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
