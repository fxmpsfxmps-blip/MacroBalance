# MUSCLE_GAIN integration gate — pre-implementation validation

**Scope:** read-only validation of the frozen Standard/PATCH3 behavior. This is not a new nutritional policy, does not make `MUSCLE_GAIN` active, and does not modify the Standard calculator.

**Baseline:** `4e8cbc875a18ead0aae96228c9a6eb5ade5c177e` on `codex/unresolved-case-recovery-ux`.

## Executive verdict

The proposed split is technically viable, subject to one required explicit integration layer: `MUSCLE_GAIN` must be recognized as its own intent **before** the current goal normalizer. Today an input of `MUSCLE_GAIN` silently normalizes to `MAINTENANCE`; it must never fall through to either `MAINTENANCE` or generic `GAIN`.

For ordinary, sufficiently observed realized resistance, Protein Policy R1 already supplies the reusable protein envelope. The current generic `GAIN` energy envelope can be reused only as an **initial, non-tissue-specific energy initializer** after muscle-gain eligibility is established. Its existing caveat remains binding: `FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN`.

No new protein density, body-fat adjustment, fat rule, carbohydrate number, rate, or calorie percentage is required for this limited integration. High-performance demand remains routed; planned training remains non-realized; all low-BMI/reference-size behavior remains unchanged.

## Current truth versus proposed intent

The active UI label for option `2` is **“Subir masa muscular”**, but `calculadora.js` maps it to `GAIN`; the active adapter exposes the `volumen` plan and passes `GAIN` into frozen core. The frozen rate/energy core supports only `MAINTENANCE`, `LOSS`, and `GAIN`.

Passing `goal: 'MUSCLE_GAIN'` directly to the active adapter produces `preferredGoal: 'MAINTENANCE'` and the 43 kg base maintenance comparator (`1806 kcal / 49 P / 55 F / 279 C`). This is a silent unknown-goal fallback, not a muscle-gain calculation. It is the primary technical condition to correct in a later implementation.

## Base profile and critical states

Base: female, 20 y, 43 kg, 150 cm (BMI 19.11), seated, 8,000 representative steps, 7 observation days, coverage 0.9. All figures below are **current generic GAIN comparators**, never proposed MUSCLE_GAIN outputs.

| State | Frozen current behavior | Current generic comparator | Proposed MUSCLE_GAIN routing direction |
|---|---|---:|---|
| Confirmed none (`NONE/0/0/LOW`) | resolved as generic GAIN | 1897 kcal / 49 P / 58 F / 295 C | `MUSCLE_GAIN_TARGET_NOT_CONFIRMED`; no muscle target |
| Unknown / incomplete tuple | `UNRESOLVED_MISSING_INFORMATION` | none | request current realized training information |
| Planned future resistance, 4×60 moderate | resolved as generic GAIN, but planned excluded from TEE/protein/carb context | 1897 / 49 / 58 / 295 | `MUSCLE_GAIN_TARGET_NOT_CONFIRMED`; maintenance may be explicitly offered, not silently substituted |
| Realized ordinary resistance, 4×60 moderate | resolved | 2045 / 65 / 62 / 307 | eligible candidate for an initial MUSCLE_GAIN target using reused frozen surfaces |
| Realized high resistance, 6×75 high | `ROUTED_TARGET_NOT_IDENTIFIED` | none | Professional/performance route; no Standard target |

### Body-fat variants

For realized 4×60 moderate resistance, body-fat values unknown, 16%, 17%, and 20% visual, plus 17% DXA/high-quality, all produced the same current comparator: **2045 kcal / 65 P / 62 F / 307 C**. Measured body fat remains diagnostic only; it must not become a muscle-gain eligibility or protein-scaling input.

## A. Why the old 49 g appears

`49 g` is not a muscle-gain target. With generic `GAIN + CONFIRMED_NONE`, R1 applies the ordinary non-training preferred protein envelope of `1.0–1.3 g/kg` using the 43 kg anchor: **43.0–55.9 g/day**, with protected lower `0.83 g/kg = 35.69 g/day`. The downstream compatibility selector then selects 49 g within that envelope. It is not an R1 selected physiological point, a body-fat adjustment, or a muscle-specific protein floor.

## B. Protein R1 trace: 43 kg, realized ordinary resistance

Current input: `REALIZED_HABITUAL / RESISTANCE / 4 sessions / 60 min / MODERATE` produces `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING`.

| Item | Frozen result |
|---|---|
| Reference anchor | 43 kg, `CURRENT_BODY_WEIGHT_WITHIN_BMI30_DOMAIN` |
| Protected lower | 35.69 g/day (`0.83 g/kg`) |
| Solver preferred density | `1.4–1.6 g/kg` |
| Solver preferred range | `60.2–68.8 g/day` |
| Practical supported range | `1.6–2.0 g/kg` / `68.8–86.0 g/day`, **metadata only** |
| R1 selected point | `null` — R1 is region/envelope native |
| Compatibility presentation point | 65 g, selected later by `DOWNSTREAM_COMPATIBILITY_LOWER_ENERGY_ENDPOINT_WITH_REVALIDATION` |
| R1 interaction | false; the special interaction applies to resistance plus `LOSS`, not gain |
| Gain modifier | none: `NO_BODY_FAT_SEX_OR_SURPLUS_MODIFIER` and `gainIncrementApplied: false` |

**Protein verdict:** `REUSE_PROTEIN_R1` for sufficiently observed ordinary realized resistance. A MUSCLE_GAIN integration must consume existing protected/preferred semantics exactly; it must not promote practical metadata into a solver constraint or add a new floor.

## C. Old generic GAIN versus true MUSCLE_GAIN candidate

| Case | Current generic GAIN | Valid interpretation |
|---|---|---|
| 43 kg, confirmed none | resolved `1897 / 49 / 58 / 295` | generic volume/gain comparator only; not evidence for a muscle target |
| 43 kg, planned 4×60 | identical `1897 / 49 / 58 / 295` | planned training is correctly excluded; not evidence for a muscle target |
| 43 kg, realized 4×60 moderate | resolved `2045 / 65 / 62 / 307` | reusable candidate only after the distinct MUSCLE_GAIN eligibility gate |

The difference is eligibility and meaning, not a renamed macro number. The planned and confirmed-none generic results demonstrate why a simple UI rename would be false semantics.

## D. Eligibility direction

This is a proposed integration contract, not active behavior:

| Canonical training state | MUSCLE_GAIN decision |
|---|---|
| `PARTIAL_OR_UNKNOWN_TRAINING` | unresolved information; no muscle target |
| `CONFIRMED_NONE` | no confirmed muscle target |
| `PLANNED_FUTURE_NOT_REALIZED` | no confirmed muscle target; an explicit maintenance alternative may be offered |
| `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING` + ordinary resistance | eligible to invoke existing frozen Standard surfaces |
| sufficiently observed high-performance demand | `ROUTED_TARGET_NOT_IDENTIFIED` / performance route |

This must preserve the current input/scope/protein reference-size behavior. For example, 40 kg / 150 cm (BMI 17.78) remains unresolved in NONE, planned, and realized-resistance variants because `LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN` leaves protein unresolved. No BMI threshold or R1 guard changes.

## E. Energy reuse verdict

For the 43 kg realized-resistance comparator:

| Direction | TEE envelope | Current energy envelope | Frozen decision |
|---|---:|---:|---|
| Maintenance | 1947.59–2081.67 | 1947.59–2081.67 | `MAINTENANCE_IDENTITY_OVER_TEE_ENVELOPE` |
| Loss | 1947.59–2081.67 | 1711.09–2007.19 | bounded local static initializer |
| Generic gain | 1947.59–2081.67 | 2044.97–2289.84 | TEE-relative initializer |

**Reuse decision:** reuse the generic-gain **initial energy envelope** only after MUSCLE_GAIN is eligible. Do not claim it converts predicted weight change into muscle tissue: frozen reasons include `GAIN_TEE_RELATIVE_INITIALIZER_NOT_TISSUE_ENERGY_CONVERSION` and `FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN`. No new percent, energy-density constant, or requested-rate behavior is authorized.

## F. Protein reuse verdict

`YES`, restricted to the R1 ordinary realized-resistance branch above. This does not authorize sex, body-fat, session-volume, load, FFM, or surplus multipliers. Present limitations remain binding.

## G. Fat and carbohydrate behavior

- Fat remains the A6 reference-soft surface; no total-fat floor or individual fat point is introduced.
- Ordinary realized resistance remains carbohydrate `TRANSITION` with `NUMERIC_CONSTRAINT_NOT_REQUIRED_IN_STANDARD`; no carbohydrate g/kg or percentage target is created.
- Confirmed none and planned future remain `FLEXIBLE_RESIDUAL`.
- High demand remains `ACTIVE_TRAINING_TARGET` + `PERFORMANCE_TARGET_NOT_IDENTIFIED`, routing to `PERFORMANCE_NUTRITION_SPECIALIST_ROUTE`.

## H. Low-weight/reference-size outcome

Female 40 kg / 150 cm (BMI 17.78) was checked in NONE, planned resistance, realized ordinary resistance, and unknown-training variants. The adapter does not issue a target: current outcomes are `UNRESOLVED_PHYSIOLOGY` except unknown input, which remains `UNRESOLVED_MISSING_INFORMATION` while the same R1 reference-size review trace is present. This is expected frozen policy behavior, not a MUSCLE_GAIN exception.

## I. Obesity/reference-anchor outcome

Male 100 kg / 180 cm (BMI 30.86) remains resolved in all three training-state comparators. R1 uses a 97.2 kg BMI30 execution anchor, not actual 100 kg, and the realized-resistance preferred range is 136.1–155.5 g/day. This existing R1 robustness anchor remains unchanged.

## J. High-demand outcome

Realized resistance 6×75 min with `HIGH` workload produces `ACTIVE_TRAINING_TARGET`, but no numerical active carbohydrate surface is identified. The current adapter withholds a plan with `ROUTED_TARGET_NOT_IDENTIFIED`. A MUSCLE_GAIN integration must preserve this route rather than publish a generic gain result.

## K. New parameters required

No new physiological parameter is required. The integration needs only product/contract fields:

- explicit goal intent `MUSCLE_GAIN`;
- canonical training-input state and complete realized core tuple;
- explicit eligibility/routing result and reason code;
- explicit maintenance alternative action for planned future training, if product chooses to present it.

## L. Parameters not needed

Do not introduce body-fat thresholds, sex multipliers, a muscle-specific g/kg floor, a surplus percentage, a fixed rate, session-volume/load scaling, FFM denominator, macro point, fat floor, carbohydrate g/kg surface, old Precision logic, or a new calculator.

## M. Required later code changes

1. Add a dedicated `MUSCLE_GAIN` intent/eligibility module before `normalizeGoal()` and frozen `rateEnergyLab`.
2. Make UI value `2` emit `MUSCLE_GAIN`, not generic `GAIN`.
3. Handle MUSCLE_GAIN explicitly; it must not default to maintenance.
4. Invoke frozen Standard `GAIN` only from the eligible ordinary realized-resistance route, with MUSCLE_GAIN provenance and no computational change.
5. Preserve planned future training as non-realized. Current UI has only YES/NO/UNKNOWN; a future planned choice needs an explicit state.
6. Add tests for all routes, silent-fallback regression, B2/R1 preservation, generic sentinels unchanged, and no Precision/Foods/Dishes reachability.

## N. Scientific blockers

No new blocker for the narrow gate described here, assuming the adjudicated product direction is accepted. Existing open limits remain visible: generic gain-rate refinement by verified resistance experience, gain tissue partition, and longitudinal calibration are not resolved by this feature. They prohibit a tissue-specific muscle-growth claim, not reuse of the existing initial envelope with its caveat.

## O. Technical blockers

One pre-implementation blocker: direct `MUSCLE_GAIN` silently becomes maintenance. The feature must not be enabled until it has explicit recognition and its own eligibility result. A secondary contract caution: the base protein-lab field named `contexts.realizedTraining` means “not planned” and is true for confirmed NONE; muscle-gain eligibility must use canonical `trainingInput.state === SUFFICIENTLY_OBSERVED_REALIZED_TRAINING` plus realized resistance evidence. R1 already uses the stricter predicate for its resistance override.

## P. Readiness

**READY TO IMPLEMENT: YES, conditionally.**

Implement only the explicit MUSCLE_GAIN intent + eligibility/routing layer and reuse frozen GAIN/R1/A6/A7 execution downstream for the eligible ordinary realized-resistance domain. Keep all other profiles unresolved, maintenance-offered, or routed as above. Do not activate a renamed generic GAIN path, add scientific values, or push as part of this validation task.

## Nearby-profile continuity matrix

All entries are current generic-GAIN comparators in `kcal / P / F / C` order; they are not MUSCLE_GAIN outputs.

| Profile | BMI | NONE | Planned resistance | Realized ordinary resistance |
|---|---:|---|---|---|
| Female 40 kg / 150 cm | 17.78 | unresolved physiology | unresolved physiology | unresolved physiology |
| Female 43 kg / 150 cm | 19.11 | 1897 / 49 / 58 / 295 | identical to NONE | 2045 / 65 / 62 / 307 |
| Female 50 kg / 150 cm | 22.22 | 1983 / 58 / 61 / 301 | identical to NONE | 2134 / 75 / 65 / 312 |
| Male 60 kg / 170 cm | 20.76 | 2612 / 69 / 80 / 404 | identical to NONE | 2806 / 90 / 86 / 418 |
| Male 75 kg / 175 cm | 24.49 | 2868 / 86 / 88 / 433 | identical to NONE | 3085 / 113 / 94 / 447 |
| Male 100 kg / 180 cm | 30.86 | 3272 / 112 / 100 / 481 | identical to NONE | 3521 / 146 / 108 / 491 |

The generic comparator changes smoothly among in-domain profiles. Planned future training exactly matches NONE and has `PLANNED_FUTURE_NOT_REALIZED`; realized ordinary resistance activates R1 resistance preference and a transition carbohydrate context. The discontinuity at 40 kg is the existing low-BMI/reference-size route, not a new muscle-gain rule.

## Validation evidence

- Direct critical-state, body-fat, energy, low-BMI, high-demand, obesity-anchor, and nearby-profile runs completed against the frozen runner.
- `node --test tests/protein-policy-r1.test.js tests/standard-unresolved-recovery.test.js`: **15/15 PASS**.
- `npm test`: **130/130 PASS**.
- `npm run build`: **PASS**.
- `git diff --check`: **PASS**.
- No source, test, frozen scientific candidate, Foods, Dishes, engine, or UI file changed. This report is uncommitted validation documentation only.
