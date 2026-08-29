# Shadow deployment integration runbook

Status: local, flags OFF, not deployed.

## Authority boundary

`calcular()` continues synchronously through the existing Production path. Its first statement invokes a guarded, non-awaited shadow collector. With the public flag OFF, the collector returns before any DOM access, snapshot, timer, token lookup, request, or telemetry. When all later operational prerequisites are approved, the collector may send a minimized raw snapshot to `/api/shadow-evaluate`; the endpoint returns only an acceptance receipt and never a nutrition result.

PATCH3 and the harness cannot update `NutritionTarget`, Firebase goals/history, menus, UI, calculator output, or user messages. Static import checks reject Production-authority imports from the shadow layer.

## Flag precedence and activation sequence

Defaults are `MB_SHADOW_CLIENT_ENABLED=false`, `MB_SHADOW_SERVER_ENABLED=false`, `MB_SHADOW_KILL_SWITCH=true`, and `MB_SHADOW_SAMPLE_BPS=0`. Missing or invalid values resolve OFF. The kill switch wins, then server enablement, then positive sampling. Server execution additionally requires an allowed origin, Firebase auth project, 32+ character HMAC secret, and an isolated HTTPS datastore URL/token/project/path.

Activation is not authorized by this implementation. A future operator must first provision the external prerequisites, verify `/api/shadow-health`, deploy with both client/server OFF and kill ON, run flag-off smoke tests, enable the server while the client remains OFF, then activate a proposed small sample only after explicit approval.

## Stop and rollback

Critical mapping, unresolved-menu authorization, complete-tuple change, finite-required non-finite value, impossible range, Production mutation, datastore isolation, runner error, manifest mismatch, or `stopRecommended=true` writes an isolated alert when possible and attempts to set the isolated shadow control record disabled. Alert/control failures are swallowed.

Rollback is operational: set kill switch true and client/server flags false, then redeploy only the public OFF config if necessary. Because the Production result never awaits or consumes shadow, rollback does not require nutrition-data migration. The code can later be reverted by removing the one guarded hook, two script tags, shadow API/config files, and server/build wiring.

## Health and smoke

`GET /api/shadow-health` requires the dedicated health bearer token. It exposes only flags, sample rate, integration version, frozen Candidate ID/hash, harness version/hash, datastore status, and alert-adapter status. It exposes no event, identity, secret, or nutrition output.

Flag-off smoke must prove zero shadow DOM reads, requests, timers, endpoint execution, Candidate import, harness invocation, datastore calls, and alert calls. Server smoke must confirm a `202 DISABLED` response before body access. Activation smoke is deferred until isolated services exist.
