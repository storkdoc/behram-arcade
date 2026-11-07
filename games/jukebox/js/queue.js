/* JUKEBOX queue, shuffle, repeat and favorites.
   Pure data. Nothing here talks to YouTube or starts playback.
   Favorites and the queue are ordinary local preferences (song ids only). */
(function (root) {
  'use strict';

  const REPEATS = ['off', 'all', 'one'];

  function create(opts) {
    opts = opts || {};
    return {
      queue: [],
      index: -1,
      shuffle: false,
      repeat: 'off',
      bag: null,
      history: [],
      rng: typeof opts.rng === 'function' ? opts.rng : Math.random
    };
  }

  function clampIndex(state) {
    if (!state.queue.length) { state.index = -1; return; }
    if (state.index >= state.queue.length) state.index = state.queue.length - 1;
    if (state.index < -1) state.index = -1;
  }

  function add(state, id) {
    if (!id) return state;
    state.queue.push(id);
    state.bag = null;
    return state;
  }

  function removeAt(state, i) {
    if (i < 0 || i >= state.queue.length) return { ok: false, removedCurrent: false };
    const removedCurrent = i === state.index;
    state.queue.splice(i, 1);
    state.bag = null;
    state.history = (state.history || []).filter(h => h !== i).map(h => h > i ? h - 1 : h);
    if (state.index > i) state.index--;
    else if (removedCurrent && state.index >= state.queue.length) state.index = state.queue.length - 1;
    if (!state.queue.length) state.index = -1;
    return { ok: true, removedCurrent };
  }

  function move(state, i, dir) {
    const j = i + dir;
    if (i < 0 || j < 0 || i >= state.queue.length || j >= state.queue.length) return false;
    const id = state.queue[i];
    state.queue.splice(i, 1);
    state.queue.splice(j, 0, id);
    if (state.index === i) state.index = j;
    else if (state.index === j) state.index = i;
    state.bag = null;
    state.history = [];
    return true;
  }

  function jump(state, i) {
    if (i < 0 || i >= state.queue.length) return null;
    if (state.index !== i && state.index >= 0) remember(state);
    state.index = i;
    state.bag = null;
    return state.queue[i];
  }

  function current(state) {
    return state.index >= 0 && state.index < state.queue.length ? state.queue[state.index] : null;
  }

  function remember(state) {
    if (state.index < 0) return;
    state.history = state.history || [];
    state.history.push(state.index);
    if (state.history.length > 50) state.history.shift();
  }

  function allExcept(n, skip) {
    const a = [];
    for (let i = 0; i < n; i++) if (i !== skip) a.push(i);
    return a;
  }

  function shuffled(state, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(state.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function ensureBag(state) {
    if (!state.bag) state.bag = shuffled(state, allExcept(state.queue.length, state.index < 0 ? -1 : state.index));
    return state.bag;
  }

  function start(state) {
    const n = state.queue.length;
    if (!n) { state.index = -1; return null; }
    if (state.index >= 0 && state.index < n) return state.queue[state.index];
    if (state.shuffle) {
      state.index = Math.floor(state.rng() * n);
      state.bag = shuffled(state, allExcept(n, state.index));
      state.history = [];
      return state.queue[state.index];
    }
    state.index = 0;
    return state.queue[0];
  }

  function next(state, opts) {
    opts = opts || {};
    const n = state.queue.length;
    if (!n) { state.index = -1; return null; }
    if (state.repeat === 'one' && !opts.force && state.index >= 0) return state.queue[state.index];
    if (state.shuffle) {
      const bag = ensureBag(state);
      if (!bag.length) {
        if (state.repeat !== 'all') return null;
        const pool = allExcept(n, n === 1 ? -1 : state.index);
        state.bag = shuffled(state, pool.length ? pool : [state.index]);
      }
      if (!state.bag.length) return null;
      remember(state);
      state.index = state.bag.shift();
      return state.queue[state.index];
    }
    if (state.index < 0) { state.index = 0; return state.queue[0]; }
    const i = state.index + 1;
    if (i >= n) {
      if (state.repeat !== 'all') return null;
      remember(state);
      state.index = 0;
      return state.queue[0];
    }
    remember(state);
    state.index = i;
    return state.queue[state.index];
  }

  function prev(state) {
    const n = state.queue.length;
    if (!n) return null;
    if (state.shuffle && state.history && state.history.length) {
      state.bag = null;
      state.index = state.history.pop();
      if (state.index < 0 || state.index >= n) state.index = 0;
      return state.queue[state.index];
    }
    if (state.index <= 0) {
      state.index = state.repeat === 'all' ? n - 1 : 0;
      return state.queue[state.index];
    }
    state.index -= 1;
    return state.queue[state.index];
  }

  function setShuffle(state, on) {
    state.shuffle = !!on;
    state.bag = null;
    return state.shuffle;
  }

  function cycleRepeat(state) {
    const i = REPEATS.indexOf(state.repeat);
    state.repeat = REPEATS[(i + 1) % REPEATS.length] || 'off';
    return state.repeat;
  }

  function toggleFav(list, id) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    return list;
  }

  function serialize(state, extra) {
    extra = extra || {};
    return {
      queue: state.queue.slice(),
      index: state.index,
      shuffle: !!state.shuffle,
      repeat: REPEATS.indexOf(state.repeat) >= 0 ? state.repeat : 'off',
      favorites: (extra.favorites || []).slice(),
      volume: extra.volume,
      muted: !!extra.muted,
      decade: extra.decade || 'all'
    };
  }

  function restore(raw, valid, opts) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const state = create(opts);
    const ok = id => valid ? valid.has(id) : true;
    if (Array.isArray(raw.queue)) state.queue = raw.queue.filter(ok);
    state.shuffle = !!raw.shuffle;
    state.repeat = REPEATS.indexOf(raw.repeat) >= 0 ? raw.repeat : 'off';
    state.index = Number.isInteger(raw.index) ? raw.index : -1;
    clampIndex(state);
    const favorites = (Array.isArray(raw.favorites) ? raw.favorites : []).filter(ok);
    let volume = Number(raw.volume);
    if (!Number.isFinite(volume)) volume = 80;
    volume = Math.max(0, Math.min(100, Math.round(volume)));
    const decade = ['70s', '80s', '90s', 'all', 'fav'].indexOf(raw.decade) >= 0 ? raw.decade : 'all';
    return { state, favorites, volume, muted: !!raw.muted, decade };
  }

  const api = {
    REPEATS, create, add, removeAt, move, jump, current, start, next, prev,
    setShuffle, cycleRepeat, toggleFav, serialize, restore
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JukeQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);
