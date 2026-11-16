# Exo Odyssey — work in progress

This folder is a detached prototype. It is not registered in the arcade (`games.js` was not changed) and it has no pull request.

## Done

- `js/sim.js` — Newtonian ship step, Keplerian orbits, scaled years, strengthened planetary gravity, climate model (equilibrium temperature, greenhouse, habitable zone).
- `js/data.js` — Proxima Centauri, TRAPPIST-1 (7 planets), Kepler-186, GJ 667 C, Kepler-452. Axes come from stellar mass and published periods. Tech, drives, missions, and guide lines. No real-person name and no campaign branding.
- `js/game.js` — Campaign state: docked start, launch, land, scan, mine, refine, sail/ion/shield/ramjet/nanotech/dark-matter gates, TRAPPIST rescue clock and drone fields, terraforming overrides, nurture, localStorage shape. Not wired to a page.
- `js/audio.js` — Two `<audio>` elements, no `crossOrigin`, playback session, cue crossfade, flight shuffle. Track table matches `audio/CREDITS.md`.
- `tests/physics.test.js` — Orbit closure, TRAPPIST spacing, Earth/Venus climate, Proxima b flux, and Kepler-452 b flux pass. The scripted slingshot flyby currently fails (it dips inside the world and loses speed). Re-tune that case before treating assists as proven.
- `audio/` — Six real recordings, excerpted and re-encoded to 160 kbit/s MP3. Credits and licenses are in `audio/CREDITS.md`.
- `vendor/three/` — Three.js r169 and the postprocessing passes copied from Cubertron. Unused so far.

## Not done

- No `index.html`, CSS, or render loop. No Three.js scene, planet shader, bloom, opening shot, HUD, or touch controls.
- No save round-trip exercised in a browser. No Playwright smoke test.
- Music files are not referenced by a page yet (`audio.js` is unimported).
- Systems beyond the data tables are not playable. The rescue, lab, and terraform exist only as state transitions.
