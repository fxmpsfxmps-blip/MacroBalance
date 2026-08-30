# V3 Longitudinal Foundation Report

## Scope

V3 implements **observation + neutral descriptive derivation**, not policy. It cannot recalculate or change the active Standard `NutritionTarget`; Professional recalibration remains **NOT IMPLEMENTED**.

## Versioned contract

`LONGITUDINAL_SCHEMA_V1` supports sparse, immutable observations:

- `WEIGHT` in canonical kg.
- `BODY_MEASUREMENT` in canonical cm for supported current keys (`waist`, `neck`, `hip`, `chest`, `arm`, `thigh`).
- `SUBJECTIVE` (`HUNGER`, `SATIETY`, `PERCEIVED_ENERGY`, `PERFORMANCE`) only with a caller-supplied versioned instrument.
- `ADHERENCE` only with an explicit metric and instrument; no percentage algorithm is invented.
- `REALIZED_TRAINING` as a recorded existing-contract payload, without MET expenditure or energy action.
- `NUTRITION_TARGET_SNAPSHOT` with calculator/Standard/freeze versions, input provenance, and result.
- `PLAN_REFERENCE` with plan, target, generator, goal, and optional digest identifiers.

All records have opaque ID, owner ID, type, canonical observed timestamp, source, quality, schema version, revision, and optional `supersedesId`. Invalid/non-finite/negative measurements are rejected. Correction is append-only: the original remains auditable.

## Repository, query, and security model

`lib/longitudinal/repository.mjs` supplies owner-bound idempotent creation, get, correction, type/date/reverse queries, deterministic ordering, pagination, and next-cursor semantics. `lib/longitudinal/firestore-store.mjs` maps the same contract to `users/{uid}/longitudinal_observations/{id}` with transactional create-if-absent.

Firestore rules allow only the authenticated owner to read/create a V1 record carrying the same `ownerId`; update/delete are denied. Index definitions support filtered chronological query paths. The deployed-rule state is not verifiable from this repository and remains an activation gate.

## Descriptive trends and missingness

`trend-utils.mjs` calculates only caller-windowed observations, elapsed time, absolute change, rate, mean, median, slope, count, and `INSUFFICIENT_HISTORY`. It does not apply water/glycogen/cycle corrections or make kcal, macro, hydration, activity, or policy decisions. Missing observation means missing; it is never zero, neutral, or non-adherent.

## Dashboard bridge and feature flag

`V3_LONGITUDINAL_ENABLED` compiles to `false` by default. The browser facade offers future, authenticated recording/read APIs plus a **paged** Dashboard data bridge; no V3 UI is exposed. A query with a continuation returns `PARTIAL_PAGED_HISTORY` rather than silently claiming lifetime history. Existing `goals_history` is adapted at read time.

## Compatibility and scale

Tests cover 100, 1,000, and 5,000 synthetic records, deterministic order, pagination, correction, idempotency, cross-user in-memory isolation, target/plan reproducibility envelopes, absent history, and Standard invariance after 1,000 observations. The full suite passes 124/124 and build passes. No destructive migration, backfill, or automatic write is performed.

## Not implemented

Future Professional policy may consume Standard target + observations only through an explicitly versioned policy. It currently does not exist. Old Precision Calculator code is not imported or used. Subjective scales, adherence interpretation, retention/deletion policy, exact historic plan replay, and deployed Firestore rules verification remain controlled decisions, not hidden defaults.
