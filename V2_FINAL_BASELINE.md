# V2 Final Technical Baseline — 2026-08-30

`V2_TECHNICAL_BASELINE_2026_08_30` freezes the completed technical baseline at parent commit `910bdf1626c8d3c2da7420bc36a4f50619f30e53`. The active authority remains `MACROBALANCE_STANDARD_PATCH3` / `standard-patch3-protein-r1-2026-08-29`; no V2 work changes its energy, protein, fat, carbohydrate, activity, or `NutritionTarget` behavior.

## Closed technical baseline

- Foods working schema, per-food provenance/status, and explicit `MISSING != ZERO` semantics are versioned in the V2.2 shadow artifacts.
- Micronutrient shadow aggregation preserves `KNOWN`, `PARTIAL`, and `NOT_ASSESSABLE` rather than coercing missing input to zero.
- Production dishes remain independent from the working Foods catalog; 193 dishes validate structurally and the harness exercises 500+ synthetic dishes without a fixed catalog limit.
- Menu generation, substitutions, Dashboard objects, and shopping-list output remain compatible with the production engine.
- Reference-only hydration and dashboard export are additive siblings; neither recomputes or rewrites the Standard target.

## Verification at freeze

`npm test`: 124/124 pass. `npm run build`: pass. `git diff --check`: pass. Production `foods.json`, `dishes.json`, `engine.js`, and substitution hashes are pinned in [V2_TECHNICAL_BASELINE_2026_08_30.json](V2_TECHNICAL_BASELINE_2026_08_30.json).

## Explicitly deferred

**DISH CONTENT = CONTINUOUS CATALOG WORK.** Adding recipes is not a V2 closure blocker. Images are owner-managed and outside this freeze. Micronutrient adequacy policy, clinical interpretation, Professional recalibration, user-scale design, retention policy, and fully reproducible historical plan snapshots are not silently inferred by this baseline.

The old Precision Calculator remains dormant legacy code only; it is not part of V2 authority and is not a dependency of V3.
