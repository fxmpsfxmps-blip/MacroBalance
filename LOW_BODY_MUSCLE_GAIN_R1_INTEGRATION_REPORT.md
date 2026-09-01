# LOW_BODY_MUSCLE_GAIN_R1 — Integration report

## Scope and ancestry

- Integration branch: `codex/low-body-muscle-gain-r1-integration-r1`
- Common base / activity parent: `0e2de06fd5ccaecf74104d61021bcac8118dd495`
- Muscle-gain intent commit: `3abe80104656f6dcb10e9608a0b079ee304f71cb`
- Low-body shadow preflight commit: `4b495a5f72589ec9ea0a986c199ce56f10b0ae34`
- Activity Input Policy R1 commit: `0e2de06fd5ccaecf74104d61021bcac8118dd495`

The commits are linear ancestors: `3abe801 → 4b495a → 0e2de`. No merge
reconciliation or scientific target surface was required.

## Authoritative R1 overlay

`LOW_BODY_SIZE_POLICY_R1_2026_08_31` is an additive successor to the retained
shadow-only V1 preflight. It applies only to adults with BMI below 18.5.
Current Standard scope is evaluated first. For an applicable profile:

1. Missing Q1 or Q2 returns `LOW_BODY_SIZE_PREFLIGHT_INFORMATION_MISSING` and
   no NutritionTarget.
2. `YES` to either question returns the explicit professional-route reason and
   no NutritionTarget.
3. `NOT_SURE` asks the existing light clarification; an exhausted follow-up
   routes to professional review.
4. Only Q1=`NO` and Q2=`NO` can release the existing low-BMI
   reference-size review.

The release does not add a coefficient, g/kg band, reference weight, energy
target, or macro point. It reuses the frozen run's existing candidate range
and its actual-body-weight sensitivity record. The execution anchor is named
`CURRENT_BODY_WEIGHT_LOW_BODY_SIZE_R1_REASONABLE_DEFAULT`; it is explicitly
not a biological truth or universal reference weight.

The V1 shadow module and its `enabled: false` configuration remain intact for
audit reproducibility. R1 has its own versioned runtime configuration and is
the active browser policy layer on this candidate branch.

## Ordering and F23 synthetic integration matrix

Fixture: female, 23 y, 42.5 kg, 153 cm, ordinary realized resistance
(4 × 60 min, MODERATE), `MUSCLE_GAIN`.

| Case | Activity/preflight state | Result |
|---|---|---|
| A: 4 days, MOSTLY_CONSISTENT, Q1/Q2 NO/NO | A1/B1 `REQUEST_INFORMATION` | No target; R1 cannot bypass B1. |
| B: 7 days, VARIABLE, Q1/Q2 NO/NO | A1/B1 `REQUEST_INFORMATION` | No target; R1 cannot bypass activity evidence. |
| C: 7 days, MOSTLY_CONSISTENT, Q answers missing | `UNRESOLVED` | No target; explicit missing-information reason. |
| D: 7 days, MOSTLY_CONSISTENT, Q1 YES | `PROFESSIONAL_HANDOFF` | No target; explicit report reason. |
| E: 7 days, MOSTLY_CONSISTENT, Q1 NO / Q2 NO | A1/B1 pass; muscle eligible | Full existing pipeline and contextual warning. |

Case E produces this synthetic compatibility output only: **2037 kcal,
64 g protein, 62 g fat, 306 g carbohydrate**. Its protein reference anchor is
42.5 kg current body weight; its existing R1 resistance preference remains
1.4–1.6 g/kg. The returned NutritionTarget contains both
`LOW_BODY_SIZE_CAUTION` and `STRONG_PROFESSIONAL_RECOMMENDATION`; neither is a
medical-clearance claim and neither changes calories or macros.

## Compatibility and boundaries

- At BMI exactly 18.5 R1 is not applicable. Immediately below it, the only
  policy difference is the explicit R1 context/release; there is no new dosage
  surface. Boundary tests keep the selected kcal and protein rounded values
  within one unit for the 0.001 kg synthetic contrast.
- The 43 kg / 150 cm generic-gain comparator (BMI about 19.11) remains outside
  the R1 domain and has byte-level-equivalent macro output when compared with
  the disabled-policy path.
- Existing `MUSCLE_GAIN` eligibility remains first: confirmed none, unknown,
  and planned future training cannot generate a muscle-gain target.
- `PLANNED_FUTURE` remains distinct from realized training. No planned-training
  preview, Advanced policy, or goal-semantic split was added.
- `LOSS` retains the existing low-body Standard-deficit professional route.
- A1 semantic activity states and the private frozen legacy adapter are
  unchanged. R1 never turns `VARIABLE` into a kcal multiplier.
- Precision was not imported, called, or exposed. Its dormant legacy code is
  not a dependency of this branch.

## User-facing contract

Unavailable results now map low-body reason codes to specific messages and
actions. They do not blame training when the cause is Q1/Q2 context. A cleared
result displays the caution and the strong professional recommendation in the
existing Standard result context.

## Files and frozen boundaries

Added:

- `lib/standard/low-body-size-policy-r1.mjs`
- `js/low-body-size-policy-r1-runtime-config.js`
- `tests/low-body-muscle-gain-r1-integration.test.js`

Changed only at the Standard adapter, R1 composition, UI bridge/presentation,
reason-specific resolution mapping, and relevant regression tests.

Not changed:

- `lib/shadow/frozen-patch3/**`
- `engine.js`
- `foods.json`
- `dishes.json`
- legacy Precision implementation or routing

## Verification

- Focused low-body / muscle / activity / unresolved tests: **39/39 passed**.
- Full suite after `npm ci` and static build: **163/163 passed**.
- `npm run build`: passed.
- `git diff --check`: passed.

The initial full-suite attempt in the new clean worktree lacked already-declared
packages (`jose`, `pdf-lib`) and pre-build `dist`; `npm ci` plus the normal
build restored that environment. No dependency manifest or source change was
needed for it.

## Explicit non-decisions

- No new scientific threshold, coefficient, protein density, energy rate, or
  macro target was created.
- No deficit-policy revision, clinical diagnosis, Professional recalibration,
  or planned-training target was implemented.
- No commit to `main`, main push, production deploy, or production-data change
  has been made by this integration work.
