# ACTIVITY_INPUT_POLICY_R1 — implementation report

## Scope and authority

Authority: `ACTIVITY_INPUT_POLICY_R1_FINAL`.

Verdict implemented: `KEEP_WITH_DOCUMENTED_HEURISTICS`.

This is an input-contract repair only. The byte-frozen A1/B1 implementation,
NASEM equations, activity classes, step bands, seven-day rule, B1 relative-TEE
width rule, GAIN initializer, Protein R1, fat, and carbohydrate behavior were
not changed.

## Old dead-code behavior

The active form wrote `0.7` for “varían bastante” and `0.9` for “sí, la
mayoría de los días.” The frozen A1 classifier treats only coverage below
`0.7` as degraded. Consequently both UI selections reached the same usable
branch: an implementation/semantic defect, not a reason to recalibrate A1.

## R1 semantic contract

`ACTIVITY_INPUT_POLICY_R1` (`activity-input-policy-r1-1.0.0`) writes one of:

| State | Meaning | Not a |
|---|---|---|
| `VARIABLE` | degraded representativeness evidence | probability, confidence percentage, or kcal multiplier |
| `MOSTLY_CONSISTENT` | usable representativeness evidence | probability, confidence percentage, or kcal multiplier |

The adapter maps these named states to private legacy branch sentinels only
while calling the frozen A1 snapshot: `VARIABLE -> 0`,
`MOSTLY_CONSISTENT -> 1`. Those values never become a public numeric contract,
are not newly persisted, and do not alter a TEE equation. They solely let the
frozen existing `< 0.7` degraded-evidence branch receive the intended semantic
state.

## Compatibility and persistence

Historical reads remain reproducible:

| Historical persisted/fixture input | R1 read state |
|---|---|
| `stepsCoverage: 0.7` | `VARIABLE` |
| `stepsCoverage: 0.9` | `MOSTLY_CONSISTENT` |

The UI, current calculator profile, Firebase new write path, and new shadow
raw payload use `stepsRepresentativeness` / `standardStepsRepresentativeness`.
Existing Firestore numeric fields are not mutated: Firebase translates them on
read, and a new semantic write takes precedence. The shadow mapper accepts
both the new raw key and the legacy key; its mapping version is
`production-raw-to-patch3-0.2.0`. Frozen historical artifacts were not
modified.

## F23 regression (MUSCLE_GAIN intent; target intentionally remains null)

Synthetic input: female, 23 years, 42.5 kg, 153 cm, `STANDING_WALKING`,
2,000 steps, realized resistance 4 x 60 min, `MODERATE`, visual BF 21%.

| Observations | Representativeness | A1 candidates | TEE envelope kcal/day | B1 status | Relevant reasons |
|---|---|---|---:|---|---|
| 4 days | `VARIABLE` | INACTIVE–VERY_ACTIVE | 1796.505–2272.110 | `REQUEST_INFORMATION` | short window; insufficient step evidence; TEE width too wide |
| 4 days | `MOSTLY_CONSISTENT` | INACTIVE–VERY_ACTIVE | 1796.505–2272.110 | `REQUEST_INFORMATION` | short window; insufficient step evidence; TEE width too wide |
| 7 days | `VARIABLE` | INACTIVE–VERY_ACTIVE | 1796.505–2272.110 | `REQUEST_INFORMATION` | degraded step evidence; TEE width too wide |
| 7 days | `MOSTLY_CONSISTENT` | INACTIVE–ACTIVE | 1796.505–2074.090 | `PASS` | evidence remains broad; conservative resistance gain region |

All four retain the authoritative final unavailable state
`UNRESOLVED_PHYSIOLOGY` because the separate low-BMI/reference-size protein
surface guard remains active. This patch neither forces a target nor changes
the user’s truthful input to obtain one.

## User wording

`STANDING_WALKING` now appears as:

> Movimiento moderado (caminas o te desplazas buena parte del día)

It describes normal locomotion rather than simply standing. It adds no input,
branch, MET/PAL label, or expenditure model.

## Heuristic classification (behavior unchanged)

- Seven observed days: `PRODUCT_DEFAULT / DEFENSIBLE_HEURISTIC`.
- Step bands: `PRODUCT HEURISTICS / pending future calibration`.
- B1 relative TEE width <=25%: `PRODUCT UNCERTAINTY ROUTING HEURISTIC`, not a
  biological threshold.

## Explicitly deferred and untouched

No graded observation confidence; new day threshold; new step band;
Tudor-Locke replacement; raw daily step history; step variance; resistance or
cardio branch; running/step temporal reconciliation; locomotor redesign;
25% recalibration; or new activity questions was implemented.

## Tests and invariants

The R1 suite covers semantic/legacy/missing states over 4, 6, 7, and 14 days
and 2k/5k/8k/12k/16k step bands. It proves `VARIABLE` and
`MOSTLY_CONSISTENT` are distinct once the unchanged seven-day evidence default
is met, and verifies `additiveKcalBlocks === false` with NASEM-only candidate
TEE calculations. It also covers new and legacy shadow payloads, Firebase
read/write contract source, F23, MUSCLE_GAIN, unresolved recovery, and
low-body-size shadow regressions.

Deferred numeric policy and all frozen A1 artifacts remain the source of
physiology; this report documents the product input repair only.
