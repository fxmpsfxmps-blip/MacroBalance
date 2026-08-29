# Shadow data contract

Status: `PROPOSED_OPERATIONAL_POLICY`; owner/privacy/legal approval remains required.

The `shadow_raw_v1` browser payload contains only calculator fields needed for PATCH3 execution or missingness analysis. It records field state separately from value so missing element, empty string, explicit zero, explicit `NONE`, and entered value are not conflated. Raw input is never reconstructed from normalized input.

Excluded: name, email, photo, Firebase UID, auth provider, persisted IP/user-agent, water/free text, food exclusions, menu preferences/selections, Firebase history, and saved goals. Firebase ID tokens are verified and discarded. UID is converted server-side to versioned `HMAC-SHA256(secret, version:uid)` and never persisted unhashed.

Collections are isolated contracts: `shadow_raw_v1`, `shadow_results_v1`, `shadow_alerts_v1`, `shadow_control_v1`, and `shadow_aggregates_v1`. Configuration that names `macrobalance-502bb`, `users`, or `goals_history` is refused. No fallback to Production Firestore exists.

Proposed retention metadata: minimized raw 7 days; normalized/results 30 days; deidentified aggregates 90 days; alerts through incident closure plus an approved audit window. Records carry `expiresAt`; actual TTL enforcement and access roles require the external isolated datastore and owner/privacy approval.
