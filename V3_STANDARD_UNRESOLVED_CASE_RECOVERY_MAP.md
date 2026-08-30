# V3 Standard — Unresolved Case Recovery Map

**Scope:** product-resolution UX based only on existing PATCH3 authority. No scientific branch, target surface, eligibility rule, macro, energy, hydration value, or routing decision is changed.

## Resolution contract

```js
resolutionResult = {
  resolved: Boolean,
  reasonCode: String | null,             // adapter unavailableReason; unchanged
  detailReasonCodes: String[],           // supporting existing trace codes
  userMessage: String | null,            // presentation only
  allowedActions: ResolutionAction[]     // presentation only
}
```

Supported presentation actions are: `COMPLETE_INFORMATION`, `CHANGE_GOAL`, `CHANGE_RATE`, `USE_MAINTENANCE_TEMPORARILY`, `DECLARE_PLANNED_TRAINING`, `PROVIDE_REALIZED_TRAINING`, `ADVANCED_HANDOFF`, and `NO_SAFE_AUTOMATIC_RECOVERY`. An action is displayed only where the current Standard actually supports it; it is never a hidden recovery or target mutation.

## The eight exact unavailable scenarios

All values use the synthetic-female matrix base: `FEMALE`, age 20, height 150 cm, BF unknown, `SEATED`, 8,000 steps, coverage 0.9, seven days, no selected rate (`requestedRatePerWeek=null`). BMI is descriptive.

| Scenario | Goal | Weight / BMI | Training state and details | Step observability | Plan reason | Exact internal trace | Guard / routing responsible |
|---|---|---|---|---|---|---|---|
| `GOAL-MAINTENANCE-UNKNOWN` | MAINTENANCE | 43 kg / 19.111111 | `PARTIAL_OR_UNKNOWN_TRAINING`; status UNKNOWN; modality/sessions/duration/workload all null | 8,000 / 0.9 / 7 | `UNRESOLVED_MISSING_INFORMATION` | `PARTIAL_OR_UNKNOWN_TRAINING_REQUIRES_INFORMATION`; carbohydrate `CLASSIFICATION_UNCERTAIN`, mode `AMBIGUOUS`, route `REQUEST_INFORMATION_FOR_MODE_CLASSIFICATION`; menu `BLOCKED_BY_UNRESOLVED_MISSING_INFORMATION` | A7 mode classification → B4 menu authority block |
| `GOAL-LOSS-UNKNOWN` | LOSS | 43 kg / 19.111111 | Same partial/unknown tuple | 8,000 / 0.9 / 7 | `UNRESOLVED_MISSING_INFORMATION` | Same training trace; `TEE_ENVELOPE_TOO_WIDE_FOR_ORDINARY_DIRECTIONAL_INITIALIZATION`; `RELATIVE_AGGRESSIVENESS_NUMERIC_POLICY_OPEN`; A7 route requests information | A7 classification / B1 directional initialization → B4 block |
| `GOAL-GAIN-UNKNOWN` | GAIN | 43 kg / 19.111111 | Same partial/unknown tuple | 8,000 / 0.9 / 7 | `UNRESOLVED_MISSING_INFORMATION` | Same training trace; `TEE_ENVELOPE_TOO_WIDE_FOR_ORDINARY_DIRECTIONAL_INITIALIZATION`; A7 requests mode-classification information | A7 classification / B1 directional initialization → B4 block |
| `GAIN-RHIGH` | GAIN | 43 kg / 19.111111 | `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING`; resistance, 6 sessions/week, 75 min, HIGH | 8,000 / 0.9 / 7 | `ROUTED_TARGET_NOT_IDENTIFIED` | `REALIZED_TRAINING_CORE_TUPLE_OBSERVED`; carbohydrate `TARGET_NOT_IDENTIFIED`, `ACTIVE_TRAINING_TARGET`, `PERFORMANCE_TARGET_NOT_IDENTIFIED`, route `PERFORMANCE_NUTRITION_SPECIALIST_ROUTE`; menu `BLOCKED_BY_ROUTED_TARGET_NOT_IDENTIFIED` | A7 performance demand route → B4 menu authority block |
| `WT40-MNT-NO` | MAINTENANCE | 40 kg / 17.777778 | `CONFIRMED_NONE`; NONE / 0 / 0 / LOW | 8,000 / 0.9 / 7 | `UNRESOLVED_PHYSIOLOGY` | A4/A5 `PARTIAL_REFERENCE_SIZE_REVIEW_REQUIRED`; `LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN`; protein target/constraint are null | A4/A5 reference-size review → A8 feasibility unknown → B4 block |
| `WT40-LOSS-NO` | LOSS | 40 kg / 17.777778 | `CONFIRMED_NONE`; NONE / 0 / 0 / LOW | 8,000 / 0.9 / 7 | `UNRESOLVED_PHYSIOLOGY` | Same A4/A5 partial protein state and low-BMI reference-size trace; energy loss envelope exists but is not enough for a four-number target | A4/A5 reference-size review → A8/B4 block |
| `WT40-GAIN-NO` | GAIN | 40 kg / 17.777778 | `CONFIRMED_NONE`; NONE / 0 / 0 / LOW | 8,000 / 0.9 / 7 | `UNRESOLVED_PHYSIOLOGY` | Same A4/A5 partial protein state; `NONTRAINING_GAIN_HAS_WEAK_DIRECT_EVIDENCE` is context only, not the blocking cause | A4/A5 reference-size review → A8/B4 block |
| `WT40-GAIN-RMOD` | GAIN | 40 kg / 17.777778 | `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING`; resistance, 4 sessions/week, 60 min, MODERATE | 8,000 / 0.9 / 7 | `UNRESOLVED_PHYSIOLOGY` | Same A4/A5 `PARTIAL_REFERENCE_SIZE_REVIEW_REQUIRED`; carbohydrate is `TRANSITION` and otherwise Standard-routed | A4/A5 reference-size review → A8/B4 block |

The exact low-BMI trace additionally says `NO_UNIVERSAL_REFERENCE_WEIGHT` and `NO_SELECTED_PROTEIN_POINT`. Its domain record labels BMI 18.5 a `STANDARD_DOMAIN_REVIEW_BOUNDARY_NOT_PROTEIN_COEFFICIENT`; this UX must not diagnose or prescribe a change in activity.

## Original 43 kg gain / confirmed NONE case

**RESOLVED.** Exact input: female, 20 y, 43 kg, 150 cm, `GAIN`, `CONFIRMED_NONE` / NONE / 0 / 0 / LOW. It returns `COMPATIBILITY_TARGETS_READY`: **1897 kcal, 49 g protein, 58 g fat, 295 g carbohydrate**.

Its trace retains `NONTRAINING_GAIN_HAS_WEAK_DIRECT_EVIDENCE` as context. It is not rejected for lack of training. Therefore this task does not add a conditional gain target, a fallback target, or a new training requirement.

## Current gain and planned-training semantics

The active UI label is **“Subir masa muscular”**, while the Standard core has only the generic identifier `GAIN` and the adapter plan id/name `volumen` / `Volumen`. There is no `MUSCLE_GAIN` scientific goal or muscle-specific target branch.

**Classification: UX_LABEL_PROBLEM; future PRODUCT_MODEL_SPLIT_CANDIDATE.** It is not evidence for a goal split in this task.

The frozen input contract already recognizes `PLANNED_FUTURE_NOT_REALIZED`. It explicitly excludes planned training from current TEE/carbohydrate demand and keeps protein's `realizedTraining=false`. At the original 43 kg gain case, a planned 4×60 moderate resistance plan returns the same generic gain compatibility output as confirmed NONE (1897/49/58/295), not a muscle-training target. Current Standard can therefore record that distinction, but it cannot create a conditional muscle-gain prescription from it.

| Candidate action | Current verdict |
|---|---|
| `COMPLETE_INFORMATION` / `PROVIDE_REALIZED_TRAINING` | Correct only for the three UNKNOWN cases: confirm current no training or provide the complete realized tuple. |
| `DECLARE_PLANNED_TRAINING` | Valid future-state metadata, but not a recovery to a realized-training or muscle-specific target. Current UI does not expose it. |
| `CHANGE_RATE` | Not offered: current UI rate is contextual and does not alter scientific calculation. |
| `CHANGE_GOAL` | Not offered as automatic recovery: it does not resolve UNKNOWN training and does not resolve the 40 kg reference-size review. |
| `USE_MAINTENANCE_TEMPORARILY` | Not an automatic fallback: maintenance with UNKNOWN training remains unresolved; the generic 43 kg planned/NONE gain case already resolves without it. |
| `ADVANCED_HANDOFF` | Correct for `ROUTED_TARGET_NOT_IDENTIFIED`; no internal Advanced resolver is currently implemented. This is a clean specialist/performance route, never the legacy Precision calculator. |
| `NO_SAFE_AUTOMATIC_RECOVERY` | Required for all four `UNRESOLVED_PHYSIOLOGY` cases. |

## Reason-code presentation matrix

| Adapter reason code | User message | Allowed actions |
|---|---|---|
| `UNRESOLVED_MISSING_INFORMATION` | “Para resolver este objetivo necesitamos confirmar tu entrenamiento actual. Si entrenas actualmente, indica tipo, días, duración y carga; si no, selecciónalo. Los planes futuros no se usan como entrenamiento realizado.” | `COMPLETE_INFORMATION`, `PROVIDE_REALIZED_TRAINING` |
| `ROUTED_TARGET_NOT_IDENTIFIED` | “Tu entrenamiento actual indica una demanda de rendimiento que Standard no puede convertir de forma fiable en un objetivo automático. No generamos un plan de macros para este caso; requiere una revisión de nutrición de rendimiento.” | `ADVANCED_HANDOFF`, `NO_SAFE_AUTOMATIC_RECOVERY` |
| `UNRESOLVED_PHYSIOLOGY` | “Standard no puede establecer un objetivo automático con estos datos porque necesita revisar la referencia usada para proteína. No es un diagnóstico ni una indicación de cambiar tu actividad actual; no generamos un plan automáticamente.” | `NO_SAFE_AUTOMATIC_RECOVERY` |

## Shared preflight authority

`standard-intake-preflight.mjs` is now the single product-input preflight used by the active browser bridge. It validates only form evidence and preserves current UI wording for:

- a directional (`LOSS`/`GAIN`) goal without steps;
- steps with missing representativeness or observation-day evidence; and
- the user selecting “yes, I train” without a complete realized tuple.

It uses the frozen `classifyTrainingInput()` contract, so `UNKNOWN`, `CONFIRMED_NONE`, realized training, and planned future training retain their exact states. The scientific core remains range-native and can still represent lower-quality evidence as context when it is called directly; the preflight does not alter its eligibility or outputs.

## Mechanical changes applied

- Added a pure reason-code-to-resolution module: `lib/standard/standard-resolution-ux.mjs`.
- Added a pure shared product preflight: `lib/standard/standard-intake-preflight.mjs`.
- Exposed both through the existing PATCH3 browser bridge and replaced the former generic unavailable-plan error in `calculadora.js`.
- Added a 47-resolved-case invariance matrix, eight unavailable-case preservation tests, planned-vs-realized tests, and UI/preflight tests.

## Scientific questions not implemented

- A muscle-gain versus generic body-weight-gain model split.
- A planned-training target or conditional gain target.
- An internal Advanced/performance carbohydrate resolver.
- Any BMI/reference-size threshold or protein-policy change.
