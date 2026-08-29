# Protein Policy R1 — implementation report

Date: 2026-08-29
Branch: `codex/protein-policy-r1`
Parent: `9e214733dd2ee958f46f242b67dd1d55ad91d3ca`

## Scope and versioning

This is a versioned Standard overlay. The byte-frozen PATCH3 snapshot and all
production nutrition modules remain unchanged. The active Standard adapter now
uses `PROTEIN_POLICY_R1_2026_08_29` (`protein-policy-r1-0.1.0`) through
`lib/standard/protein-policy-r1.mjs`; it does not replace or edit the frozen
implementation.

## R1 policy

- Ordinary resistance without deficit: preferred `1.4–1.6 g/kg` (unchanged).
- Realized resistance plus LOSS: preferred `1.6–2.0 g/kg` (explicit interaction).
- Realized resistance maintenance/gain: practical supported metadata `1.6–2.0 g/kg`.
- Realized resistance plus LOSS: practical supported metadata `2.0–2.2 g/kg`.
- Practical ranges are metadata only and are never solver constraints or selected points.
- Protected lower remains the frozen policy (`0.83 g/kg` ordinary; `1.0 g/kg` loss/older); no safety upper limit is introduced.

No deficit-severity, sex, body-fat, surplus, frequency, duration, workload,
FFM, or new denominator modifier was added. The BMI30 robustness anchor and
measured-FFM diagnostic-only semantics remain unchanged. Training activation
requires the canonical `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING` state; UNKNOWN
or PARTIAL training cannot activate the interaction.

## Solver and selector

The existing hierarchical region solver and `choosePoint` are retained. R1
rebuilds the protein ranges and A8 region with explicit provenance, preserving
null selected points and the existing energy identity. The downstream
compatibility selector may choose only inside the preferred authorized region.

## Verification

- Focused R1 tests: 9/9 PASS.
- Full repository suite: 92/92 PASS.
- Build: PASS (`npm run build`).
- `git diff --check`: PASS (only normal CRLF conversion warnings).
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Frozen PATCH3 protein source hashes are unchanged from the approved baseline:
  - `proteinParameterRegistry.js` 6f9284e73efcf8cadd26d7cdd2b66411003929f643a105d6752e33fb9ec09a35
  - `proteinLab.js` 42ebdc08c248d1203727cafd795d90f2b902f5ef847d4ed21723a27c86fbcef8
  - `proteinEnvelopeAdapter.js` 2b9b12c92e37d4388490891cad64e93ece68b262046733207a27e4e17e79ba83
  - `challengerFreezeRegistry.js` dd95eeec1bc2f4ada1f869ac19bc02e9a87f70f63b07bbda68091ec891309490
  - `integratedChallenger.js` 6bb7caedd5f00810c7b89f35cdcab7aded09f99d83b2e99e253d500e1a76a850

The existing ordinary maintenance sentinel remains `3190 kcal / 146 g
protein / 97 g fat / 433 g carbohydrate`. The approved loss+resistance
sentinel changes to `2505 kcal / 140 g protein / 77 g fat / 313 g
carbohydrate`, reflecting only the explicit R1 interaction and preserving
energy closure.

## Rollback and boundaries

Rollback is a one-line adapter import/version revert to the parent commit;
the frozen PATCH3 files remain available for comparison. R1 is not connected
to the scientific snapshot's production path and does not alter `engine.js`,
foods, dishes, Firebase, UI, Historical Control, or A1/A2/A3/A6/A7/A8/A9.
