# GENESIS: Meta-Evolution Arena — working notes (resume from here)

Repo rules: stage ONLY games/meta-arena and games.js. Never git add -A / stash / reset others' files.
Other workers: games/neuro-arena (lexicon), games/congressional-obgyn, daily-improvement worker.

## Spec (authoritative, user update 12:42)
Three roles: PROBLEM GENERATOR (fresh held-out batteries across domains: logic, pattern, planning, language-like;
surface scrambles = token remap + layout permutation), SOLUTION GENERATOR (paradigms: rule induction, memory lookup,
next-token prediction, spiking + open-ended LLM designs), THE REAPER (fraction solved, steps to solution, transfer
under scramble; ONLY selection pressure; no bonuses/favoritism/LLM opinion). GENOME = abstract blueprint of
capabilities (memory capacity, abstraction depth, compositionality, search budget, biases, lr, mechanisms);
each paradigm translates it natively; copy/crossover/mutate; WILD CARD slot protected as a slot only.

## Status
- [x] js/tasks.js v1 (13 tasks), designs seeds: symbolic, memory, transformer, spiking, bayes, gp, baseline
- [x] js/mutate.js hybridCode combinator
- [x] tasks.js v2: families train(6)/select(12)/sealed(3) + scramble + Reaper (S, Q steps, X transfer), makeStepper
- [x] genome.js (GENES/BIASES/MECHS, mutate, crossover → hybrid), designs read api.genome:
      rule, memory, nexttoken, spiking, bayes, gp, relational, baseline; js/mutate.js hybridCode(cascade|arbiter)
- [x] tools/offline.mjs + tools/lineage.mjs (agent = LLM designer) → data/archive.json, gens 1-4 + audit
      (data/.cache.json caches evaluations; delete it if tasks/designs change)

## Offline run results (selection battery score = (S+Q+X)/3)
gen1: B1 memory 0.475 WIN | A1 rule 0.349 partner (dev 0.994!) | B2 nexttoken 0.301 | W bayes 0.248 | A2 spiking 0.083
gen2: A2 crossover→hybrid cascade(memory,rule) 0.529 WIN | A1 structured memory 0.504 | B2 0.492 | B1 0.448 | W relational 0.271 (sealed 0.44)
gen3: B1 arbiter 0.561 WIN by 0.002 | A2 0.558 | A1 0.555 | B2 0.543 | W gp 0.088 (X=0)
gen4: B2 copy-error arbiter 0.639 WIN by 0.001 | A1 Deep Grammar 0.638 (sealed 0.666, audit mean 0.608 > B2 0.592) | B1 +nexttoken 0.589 | A2 0.508 | W spiking 0.107
audit sd per design ≈ 0.01 → margins < 0.02 are noise.
- [x] UI: index.html, style.css, js/main.js (arena/lineage/map/evolve, verdict, design card, audio, input),
      js/draw.js (organisms, Reaper), js/worker.js (sandbox: network globals deleted, page kills on timeout),
      js/evolve.js (browser breeding rules), js/llm.js (live LLM: key in localStorage only, static code check)
- [x] tests/page.test.cjs (desktop + iPhone 13 portrait/landscape: live re-run == archive, verdict, map, card,
      breed gen 5 in the browser, no console errors) · tests/shots.cjs screenshots
- [x] games.js entry (slug meta-arena, added 2026-10-28), thumb.png (960x600)
- note: tests/landing.test.js "fast flick right" FAILS also on HEAD without GENESIS (pre-existing, not ours)

## Layout of the code
tasks.js = problem generator + Reaper (makeStepper/runStream/evaluate/reaperScore/reaperRank)
genome.js = genome, mutate, crossover, codeFor · mutate.js = hybrid controller · designs/*.js = paradigm code
tools/offline.mjs = offline run (node tools/offline.mjs) → data/archive.json; lineage.mjs = agent-as-LLM designs
Run tests: python3 -m http.server 8095 (repo root) ; NODE_PATH=/workspace/tools/node_modules node games/meta-arena/tests/page.test.cjs

## Early census (v1 tasks, before the spec update; for reference)
symbolic train 0.99 / held 0.14 (huge gap); memory held 0.49; transformer(gated) held 0.22; bayes 0.25; gp 0.52(v0 tasks); spiking ~0.
