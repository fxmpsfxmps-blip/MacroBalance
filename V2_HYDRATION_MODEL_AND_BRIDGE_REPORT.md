# V2 Hydration Model and Bridge Report

## Decision

**PARTIALLY_READY — implemented as a reference-only sibling payload.** The Calculator now produces `hydration-reference-0.1` only for adults with recorded binary sex, using NASEM’s total-water AI: 3.7 L/day for men and 2.7 L/day for women. It means **total water from food and beverages**, not a plain-water target, an individual requirement, a hydration diagnosis, or a beverage allocation.

NASEM explicitly describes those values as total water and reports food moisture as part of intake; it also notes that a wide range of intake can be compatible with normal hydration. [NASEM water chapter](https://www.nationalacademies.org/read/10925/chapter/6) [NASEM summary](https://www.nationalacademies.org/news/report-sets-dietary-intake-levels-for-water-salt-and-potassium-to-maintain-health-and-reduce-chronic-disease-risk)

## Shootout outcome

| Candidate | Result |
| --- | --- |
| Total-water AI/DRI | Survives as a labeled population reference. |
| `ml/kg` | Not used: it falsely implies individual precision and does not solve sweat/environment variability. |
| Energy-linked rule | Not used: would make a non-hydration proxy drive the output. |
| Beverage/plain-water conversion | Not used: food moisture and beverage mix are not observed. |
| Baseline + exercise adjustment | Exercise is logged only as context; no numeric adjustment without sweat rate, environment, acclimatization, duration/intensity context, and restriction risk. |

EFSA uses different adult total-water reference values (2.5 L male / 2.0 L female), reinforcing that a population reference is not a universal personalized dose. [EFSA DRV summary](https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf) Exercise fluid replacement requires individualized information such as sweat loss and conditions; the ACSM position stand specifically discusses estimating sweat rate from pre/post exercise body mass. [ACSM exercise fluid replacement](https://pubmed.ncbi.nlm.nih.gov/17277604/)

## Implemented boundary

- `lib/hydration/hydration-reference.mjs` owns the versioned model.
- `calculadora.js` requests it after the Standard result is already finite, stores it beside — never inside — `NutritionTarget`, and has no legacy fallback.
- `firebase-init.js` stores the sibling `hydrationReference` with the goal snapshot.
- `plan.html` / `js/menu-app.js` display only the persisted reference with a glass icon; the Dashboard never recomputes it.
- Adult age or sex missing returns `NOT_ASSESSABLE`; exercise adjustment is `NOT_ESTIMATED`.

The implementation deliberately ignores weight, height, TEE, steps, strength training frequency, cardio, old MET logic, and the former 35 ml/kg heuristic. It makes no clinical-fluid-restriction decision and has no “glass” conversion. Hydration does not alter kcal, protein, fat, carbohydrate, activity, or any Standard target.

## Tests

`tests/v2-hydration.test.js` proves unit/semantics, invariance across body size/energy/training proxy changes, explicit missingness, absence of legacy formula use, and unchanged Standard target behavior.
