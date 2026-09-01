# Numeric sentinel fixture addendum — 2026-08-31

## Scope

This addendum clarifies fixture provenance only. It does not change the
Standard calculator, energy policy, hydration behavior, scientific surfaces,
or any historical audit artifact.

## Three distinct executable sentinels

| Sentinel | Input facts that distinguish it | Rounded Standard output |
|---|---|---|
| `F23-low-body-muscle-gain-r1` compatibility sentinel | Female; 23 y; 42.5 kg; 153 cm; BF 21% visual; **8,000 steps**; 7 observed days; `MOSTLY_CONSISTENT`; realized resistance 4 x 60 min `MODERATE`; `MUSCLE_GAIN`; low-body answers `NO` / `NO` | **2037 kcal / 64 g P / 62 g F / 306 g C** |
| Production-equivalent low-step sentinel | Female; 23 y; 43 kg; 153 cm; BF not provided; **2,000 steps**; 7 observed days; `MOSTLY_CONSISTENT`; realized resistance 4 x 66 min `MODERATE`; `MUSCLE_GAIN`; low-body answers `NO` / `NO` | **1892 kcal / 65 g P / 58 g F / 278 g C** |
| Controlled low-step contrast sentinel | Female; 23 y; 42.5 kg; 153 cm; BF 21% visual; **2,000 steps**; 7 observed days; `MOSTLY_CONSISTENT`; realized resistance 4 x 60 min `MODERATE`; `MUSCLE_GAIN`; low-body answers `NO` / `NO` | **1886 kcal / 64 g P / 58 g F / 277 g C** |

All three use the same authoritative Standard selector:
`DOWNSTREAM_COMPATIBILITY_LOWER_ENERGY_ENDPOINT_WITH_REVALIDATION`.

## Historical-report clarification

`LOW_BODY_MUSCLE_GAIN_R1_INTEGRATION_REPORT.md` reports the first fixture's
2037 result. Its original table did not enumerate steps; the executable test
fixture uses 8,000 steps. Other historic F23 records mentioning 2,000 steps
describe distinct routing/preflight cases and do not establish a 2037-kcal
result. They are preserved as immutable audit artifacts; this addendum is the
correction layer rather than a rewrite of their history.

## Classification

- `CALCULATOR_BUG = NO`
- `FIXTURE_DOCUMENTATION_ERROR = YES`
- `NUMERIC_BEHAVIOR_CHANGED = NO`

The 2037 versus 1892 difference is explained by materially different fixture
inputs, primarily 8,000 versus 2,000 observed steps, not by a divergent
calculator route.
