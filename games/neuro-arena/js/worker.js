/* NEURO ARENA worker: a thin wrapper around the simulation core. */
import { makeHandler } from './simcore.js';
const handle = makeHandler((m, tr) => postMessage(m, tr));
onmessage = handle;
