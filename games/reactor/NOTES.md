# MELTDOWN — working notes (games/reactor)

Homage to Parker Brothers' *Reactor* (1982). A teaching model, not an engineering simulator.

## Status
- [x] js/sim.js: physics core. `node games/reactor/tests/sim.test.js` passes 45/45.
- [ ] content.js (faults, scenarios, tutorial, concept/why cards, history)
- [ ] audio.js, render.js (three.js cross-section + 8-bit bloom), ui.js, main.js, index.html, css
- [ ] tests/page.test.mjs (playwright desktop/iPhone/iPad), tools/thumb.mjs → thumb.png
- [ ] games.js entry (slug 'reactor', title 'MELTDOWN'), push, verify live

## Where to work (after the 2026-10-28 shared-checkout reset)
Work in the separate worktree /workspace/meltdown-wt (branch meltdown-work, based on origin/main).
Commit there; `git pull --rebase origin main`; `git push origin meltdown-work:main`. Never reset/stash /workspace/arcade.
The physics + content are already on origin (805f88f).

## Repo rules
Other workers share this checkout. Stage ONLY games/reactor and games.js. Never `git add -A`,
never stash/reset others' files. Commit, then `git pull --rebase` (or push from a separate worktree).

## Physics model (sim.js)
- Point kinetics with 6 delayed groups (Keepin U-235), implicit with adaptive sub-steps; prompt-critical
  sub-steps 0.5 ms. `noDelayed` toggle for the lab. Inhour(+0.1$) = 99 s; after a big negative step the
  power falls on the -80 s period.
- Rod worth S-curve, 9 clusters, cos-weighted. RBMK: sequential bank (RB_ORDER), ORM = 54 x avg insertion,
  graphite-tip positive scram beta*(1.0+1.2*clamp((26-ORM0)/26)) for rods fully out at AZ-5; RBMK auto regulator
  (rodAuto + powerSet). ORM 8 -> explosion, 13 -> spike to ~95 %, 27 -> safe.
- Feedback: Doppler -2.6 pcm/C, MTC -40+0.02*ppm, PWR void -120 pcm/%, RBMK +25 pcm/% x (1+1.0*ORM factor),
  boron -10 pcm/ppm, Xe 2700 pcm. `noFeedback` flag for kinetics tests, `xeFrozen` for the night test.
- Xe/I on a x120 plant clock (peak 1.9x at 8.4 h). Decay heat: 7-group Way-Wigner fit, x4 clock (6.9 % -> 1.2 % at 1 h).
- Primary: real water specific volume (vrel), pressurizer insurge 18 MPa per unit level, sprays/heaters, PORV 16.2,
  safety valves 17.2, two-phase systems pinned at psat(Thot), steam-vs-liquid venting energy, TMI void
  displacement (level rises while inventory is lost). SI < 12.4 MPa independent of trip.
- Uncovered core: separate adiabatic hot-spot node `Tup` (decay heat + Zr-steam), capped 2950 C (melt plateau).
- Secondary: U-tube SG (default) or `otsg` (B&W once-through: small inventory, used in TMI drill), dumps
  (dumpCap), atmospheric dumps, SLB, MSIVs, main/aux feed (afwBlockedT = TMI closed AFW valves),
  loss of main feed trips the turbine; `noTurbineTripScram` (B&W 1979 had no anticipatory trip).
- Electrical: 2 diesels, battery 600 s (1200 shed), RCP seal LOCA after 90 s of SBO, fire truck.

## Scenario setup knobs (for content.js)
- TMI: otsg=true, noTurbineTripScram=true, dumpCap=0.1, afwBlockedT=480, mainFW=false, porvStuck once porvAuto.
- Night test: RBMK, power 0.0625, xe from xenonRun(…0.5 then 0.07…), rods (bank) 0.13, xeFrozen, rodAuto, powerSet.
- SBO: offsite=false, dg failP=1 (or flooded), battery.

## Time compression (disclose in game)
xenon x120, decay heat x4, rods ~7x real speed, optional player warp x1/x4/x16.
