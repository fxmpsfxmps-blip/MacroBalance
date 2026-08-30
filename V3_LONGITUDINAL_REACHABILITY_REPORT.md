# V3 Longitudinal Reachability Report

## Forensic map

| Concern | Current authority / path | V3 disposition |
| --- | --- | --- |
| Authentication | Firebase Web Auth in `firebase-init.js`; browser-local persistence; `auth.currentUser.uid` | Reused; no second auth system. |
| User profile | `users/{uid}/profile/current` | Read-only contextual source; no migration required. |
| Current goal / target history | `users/{uid}/goals_history/{goalId}` and `users/{uid}.currentObjectiveId` | Reused through a read-only adapter for historical target snapshots. |
| Generated plan | Browser `sessionStorage` key `macrobalance:plan:{uid}`; server generation is stateless | V3 stores only an optional plan reference; does not pretend this makes legacy plans reproducible. |
| Standard calculation | Browser PATCH3 adapter → one Standard `NutritionTarget` | Recorded only in future snapshots; never altered by V3. |
| Menu APIs | `api/generar-*.mjs` → `lib/server/menu-service.cjs` → menu engine | Not used as V3 persistence. |
| Dashboard | `plan.html` / `js/menu-app.js`, current goal plus session plan | A feature-gated data adapter is available but no V3 UI is exposed. |
| Firestore security | `firestore.rules` owner rule at `users/{uid}` | Additive owner-scoped append-only subcollection rule. |

## New reachable foundation

The new, additive storage path is `users/{uid}/longitudinal_observations/{observationId}`. Browser code constructs a service bound to the authenticated UID, and Firestore rules require the same `ownerId`; direct client cross-user reads/writes are denied by the rule design. Observations are immutable after creation; corrections create a new observation with `supersedesId`.

The V3 facade is compiled into the browser but feature-gated by `V3_LONGITUDINAL_ENABLED`, which defaults to `false`. There is no visible V3 dashboard, no automatic snapshot write, no migration, and no calculation hook. Existing users with no observations keep their current behavior.

## Existing versioning and history

Goals already retain calculator/version metadata, `inputSnapshot`, raw macro result, `nutritionTarget`, and timestamps. `adaptGoalHistoryToTargetSnapshots()` maps those existing documents at read time; it does not bulk-copy or mutate them. The generated menu currently has no durable server-side history, so `PLAN_REFERENCE` is intentionally a reference envelope, not a claim of complete historical reproduction.

## Legacy Precision reachability

`js/calculator-core.js` and legacy Precision functions remain present for historical rollback code, but are not in the visible Standard route. No V3 module imports them, uses MET/series/rest logic, or falls back to them. They remain dormant reachability to document, not an authority to revive.

## BLOCKED_DECISION

1. **Firestore deployment verification.** The repository contains rules/index configuration, but the Firebase project’s deployed state and emulator evidence are unavailable. Safe implementation: dormant schema and tests. Blocks main: **NO**; blocks flag activation: **YES**.
2. **Retention, export, and account deletion.** The repo has no account-deletion workflow and no approved retention policy. Safe implementation: append-only records and serializable contract. Blocks main: **NO**; blocks collecting real V3 data: **YES**.
3. **Subjective instruments and adherence semantics.** There is no existing product scale or validated metric. Safe implementation: explicit versioned instrument boundary only. Blocks main: **NO**; blocks subjective UI/policy: **YES**.
4. **Plan reproducibility scope.** Existing plans are session-only and do not retain a required deterministic generation seed. Safe implementation: plan reference/version/digest contract. Blocks main: **NO**; blocks a claim of exact historic plan replay: **YES**.
