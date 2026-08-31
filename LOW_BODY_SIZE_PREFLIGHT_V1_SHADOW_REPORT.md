# LOW_BODY_SIZE_PREFLIGHT_V1 — Shadow report

## Scope and architecture

Base commit: `3abe80104656f6dcb10e9608a0b079ee304f71cb` (`MUSCLE_GAIN`).
At implementation start, `origin/main` was
`93e4b8e060d110dd7d592c573f2fd1f7a8fc307c`; this worktree started at the
MUSCLE_GAIN commit, not at `main`.

`LOW_BODY_SIZE_PREFLIGHT_V1` is a non-authoritative, versioned routing layer.
It runs independently from `calculatePatch3Standard()`:

```text
current Standard profile → current authoritative Standard → current result
same profile + Q1/Q2 → LOW_BODY_SIZE_PREFLIGHT_V1 shadow → routing metadata only
```

The preflight never enters the profile sent to the authoritative calculator,
never changes a `NutritionTarget`, and cannot release a target the current
low-BMI reference-size guard rejects. The intended order is:

```text
current general scope gate → body-size domain → shadow preflight → goal eligibility → frozen Standard policies
```

No Protein R1, rate/energy, TEE, fat, carbohydrate, Precision, or frozen
reference-size code was modified.

## UI and flag

The two-question block is present in the calculator only when all of these
are true: adult, calculated BMI below 18.5, and
`LOW_BODY_SIZE_PREFLIGHT_V1_ENABLED=true`. The generated runtime config defaults
to `false` / `SHADOW_SILENT`; therefore this branch has no live user-visible
flow by default.

The UI text is intentionally non-clinical:

- title: `Antes de continuar`
- body: `Tu peso está por debajo del rango habitual usado por la calculadora. Necesitamos confirmar dos datos antes de continuar.`
- Q1: `En los últimos 6 meses, ¿has perdido peso sin proponértelo o sin buscarlo activamente?`
- Q2: `Ahora mismo, ¿estás tratando de bajar de peso?`

The UI does not say that a shadow-clear result enables calculation. If the
authoritative Standard returns `UNRESOLVED_PHYSIOLOGY`, that result remains the
user-facing authority.

## Decision contract

The compact result has:

```js
{
  applicable, status, reasonCode, q1, q2, generalSafetyStatus,
  downstreamDisposition, referenceAnchorCandidate
}
```

Supported statuses are `NOT_APPLICABLE`, `PREFLIGHT_CLEARED`,
`REQUEST_MORE_INFORMATION`, `PROFESSIONAL_HANDOFF`, `CLINICAL_HANDOFF`, and
`UNRESOLVED`. Missing and `NOT_SURE` are not normalized to `NO`.

| Condition | Shadow status | Downstream disposition |
|---|---|---|
| Adult BMI >= 18.5 | `NOT_APPLICABLE` | current authoritative path |
| BMI < 18.5; Q1 NO; Q2 NO; scope clear | `PREFLIGHT_CLEARED` | LOSS: `BLOCK_STANDARD_DEFICIT_PROFESSIONAL_ROUTE`; MAINTENANCE/MUSCLE_GAIN: `LIMITED_STANDARD_CANDIDATE` |
| Either answer YES | `PROFESSIONAL_HANDOFF` | `PROFESSIONAL_HANDOFF` |
| Either answer NOT_SURE | `REQUEST_MORE_INFORMATION` | `REQUEST_MORE_INFORMATION` |
| Either answer missing | `UNRESOLVED` | `UNRESOLVED` |
| Existing scope gate does not allow complete | `CLINICAL_HANDOFF` | `CLINICAL_HANDOFF` |

For Q1 `NOT_SURE`, the optional follow-up exposes only approximate weight six
months ago and current weight; it applies no percentage or time threshold.
For Q2 `NOT_SURE`, it exposes the agreed plain-language goal clarification.
If an external flow marks follow-up exhausted, routing is professional rather
than an invented automatic resolution.

## General safety gate audit

The active Standard scope gate already routes flags for pregnancy, recent
bariatric surgery, acute illness, competitive weight cut, minority, CKD, and
SGLT2 plus ketogenic strategy. The shadow contract reuses that existing gate:
an `IN_SCOPE` result is `CLEAR` only in the limited sense of no current scope
flag; it is explicitly **not** medical clearance.

Lactation/postpartum and clinician-directed dietary restriction appear in the
A9 laboratory context but are not captured by the active Standard form or its
scope flags. No clinical question was invented. The new contract can represent
`UNKNOWN` and `CLINICAL_HANDOFF_REQUIRED` when a future approved intake/scope
source provides them; no absence was silently treated as a new clinical fact.

## Matrix coverage

Automated coverage runs 126 combinations: BMI `19.0, 18.5, 18.4, 18.2, 17.8,
17.0, 16.0` × goals `MAINTENANCE, LOSS, MUSCLE_GAIN` × the six meaningful
Q1/Q2 pairs `NO/NO`, `YES/NO`, `NO/YES`, `NOT_SURE/NO`, `NO/NOT_SURE`, and
`missing/missing`.

- BMI 19.0 and 18.5: `NOT_APPLICABLE` for every goal/answer combination.
- Every lower tested BMI: Q1/Q2 routing follows the decision contract above.
- MUSCLE_GAIN training controls were separately tested for confirmed NONE,
  planned, unknown, ordinary realized resistance, and high demand. Preflight
  clearance does not override their existing MUSCLE_GAIN eligibility outcome.

Other control profiles were also executed: female 40/150, 43/150, 50/150;
male 50/170, 60/170, 75/175. Only 40/150 and 50/170 were below the preflight
threshold; the other four remained `NOT_APPLICABLE`.

## F23 real-case shadow run

Profile: female, 23 y, 42.5 kg, 153 cm (BMI about 18.15), visual body fat 21%,
MUSCLE_GAIN, realized resistance 4 × 60 min moderate, standing/walking,
2,000 variable steps with four observed days.

The current authoritative result is unchanged for every row:
`UNRESOLVED_PHYSIOLOGY`, `nutritionTarget=null`, due to the frozen
`LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN` guard.

| Q1 | Q2 | Shadow status | Shadow disposition |
|---|---|---|---|
| NO | NO | `PREFLIGHT_CLEARED` | `LIMITED_STANDARD_CANDIDATE` |
| YES | NO | `PROFESSIONAL_HANDOFF` | `PROFESSIONAL_HANDOFF` |
| NO | YES | `PROFESSIONAL_HANDOFF` | `PROFESSIONAL_HANDOFF` |
| NOT_SURE | NO | `REQUEST_MORE_INFORMATION` | `REQUEST_MORE_INFORMATION` |
| NO | NOT_SURE | `REQUEST_MORE_INFORMATION` | `REQUEST_MORE_INFORMATION` |
| missing | missing | `UNRESOLVED` | `UNRESOLVED` |

## Current-body-weight anchor

Only a `PREFLIGHT_CLEARED` record has:

```js
{ type: 'CURRENT_BODY_WEIGHT', valueKg, status: 'SHADOW_METADATA_ONLY' }
```

It is not a Protein R1 execution input and does not create a BMI-18.5 weight,
IBW, adjusted body weight, goal weight, FFM denominator, diagnostic macro
target, or user recommendation.

## Invariance and reachability

- Authoritative low-BMI MUSCLE_GAIN output was compared before and after the
  shadow call and is structurally unchanged.
- Existing Standard control output is unchanged by a shadow call.
- Protein R1 and energy logic have no imports from the new module.
- The browser bridge exposes an explicit shadow method, while the frozen
  adapter itself has no low-body-size dependency.
- No old Precision-calculator function/import appears in the new module,
  bridge, or active shadow path.

## Remaining decisions (not implemented)

1. Whether a later, separately adjudicated policy may turn a cleared low-body
   case into an authoritative Standard candidate by changing the frozen R1
   reference-size guard. This shadow work makes no such change.
2. Whether approved active intake should capture lactation/postpartum,
   clinician-directed restriction, or other general-safety information; the
   existing form does not provide a basis to add it here.
3. The product owner must separately approve any promotion from shadow-only UI
   to a live user flow, and any Professional handoff destination.

## Files changed

- `lib/standard/low-body-size-preflight-v1.mjs`
- `js/patch3-standard-adapter.js`
- `js/low-body-size-preflight-runtime-config.js`
- `scripts/build-static.js`
- `calculadora.js`
- `index.html`
- `tests/low-body-size-preflight-shadow.test.js`
- `LOW_BODY_SIZE_PREFLIGHT_V1_SHADOW_REPORT.md`

No production deployment, merge to main, or policy promotion occurred.
