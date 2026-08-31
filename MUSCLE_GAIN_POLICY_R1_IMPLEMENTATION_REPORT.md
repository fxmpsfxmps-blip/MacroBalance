# MUSCLE_GAIN intent + eligibility routing — implementation report

## Scope

This implementation adds a product intent and routing boundary. It does not alter the frozen Standard energy model, Protein Policy R1, fat surface, carbohydrate semantics, low-BMI/reference-size behavior, Foods, Dishes, or the retired Precision architecture.

## Semantic split

The UI label **“Subir masa muscular”** now emits `MUSCLE_GAIN`. It is not an alias for historical generic `GAIN` and cannot fall through to `MAINTENANCE`.

The new `lib/standard/muscle-gain-eligibility.mjs` runs before generic goal normalization. Only after it positively establishes ordinary realized resistance eligibility does the adapter call the frozen core with downstream `GAIN`.

| Canonical training state | Result |
|---|---|
| `PARTIAL_OR_UNKNOWN_TRAINING` | `MUSCLE_GAIN_MISSING_TRAINING_INFORMATION`; no target |
| `CONFIRMED_NONE` | `MUSCLE_GAIN_TARGET_NOT_CONFIRMED`; no target |
| `PLANNED_FUTURE_NOT_REALIZED` | `MUSCLE_GAIN_TARGET_NOT_CONFIRMED`; no preview |
| sufficiently observed realized ordinary `RESISTANCE` | `MUSCLE_GAIN_ELIGIBLE`; execute frozen generic GAIN path |
| sufficiently observed `HIGH`/`EXTREME` workload | `ROUTED_TARGET_NOT_IDENTIFIED`; no target |

Eligibility uses canonical `trainingInput.state` plus actual `RESISTANCE` modality. It deliberately does not use the older protein-context `realizedTraining` field, because that field means “not planned” and can be true for confirmed NONE.

## Downstream policy reuse

For the eligible branch, the adapter adds `goalIntent: MUSCLE_GAIN` and `method.targetRole: MUSCLE_GAIN_INITIAL_TARGET` provenance. It reuses only the existing frozen generic-GAIN initializer and preserves its caveats:

- `GAIN_TEE_RELATIVE_INITIALIZER_NOT_TISSUE_ENERGY_CONVERSION`
- `FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN`

No new energy percentage, rate, tissue partition model, protein floor, protein multiplier, body-fat rule, FFM rule, fat formula, or carbohydrate g/kg target is introduced.

Protein R1 remains envelope-native. For the validated 43 kg ordinary realized-resistance case it remains 1.4–1.6 g/kg (60.2–68.8 g/day), practical 1.6–2.0 g/kg metadata only, and downstream compatibility presentation at 65 g. Fat and carbohydrate retain existing A6/A7 semantics; ordinary resistance remains `TRANSITION` with no numeric carbohydrate constraint.

## UI and explicit actions

The Standard training selector now includes **“Voy a empezar”**, which maps only to `PLANNED_FUTURE_NOT_REALIZED`; it is not a realized YES response and does not expose training-detail fields or affect current energy/protein/carbohydrate execution.

Reason-specific unavailable states expose explicit actions rather than silently changing the objective:

- missing training information → complete information;
- confirmed none → declare planned training, calculate maintenance, or change goal;
- planned training → calculate maintenance, change goal, or provide realized training after it starts.

The maintenance path is an explicit button action that sets the selected goal to `MAINTENANCE` before calculating. It never mutates a MUSCLE_GAIN request implicitly.

## Preserved routes and guards

- High-demand resistance remains routed with `ROUTED_TARGET_NOT_IDENTIFIED`; Professional remains future work.
- Low-BMI/reference-size R1 behavior remains authoritative. An otherwise eligible 40 kg / 150 cm realized-resistance case is still `UNRESOLVED_PHYSIOLOGY`.
- The real-case fixture (female, 23 y, 42.5 kg, 153 cm, visual BF 21%, 4×60 moderate realized resistance) preserves the MUSCLE_GAIN intent and realized training state but remains `UNRESOLVED_PHYSIOLOGY` because of the frozen reference-size guard, not because of training.
- Existing MAINTENANCE, LOSS, and generic GAIN fixtures remain unchanged.
- No MUSCLE_GAIN route imports or invokes old Precision/MET/series-rest code.

## Files

- `lib/standard/muscle-gain-eligibility.mjs`
- `lib/standard/patch3-standard-adapter.mjs`
- `lib/standard/standard-resolution-ux.mjs`
- `lib/standard/standard-intake-preflight.mjs`
- `calculadora.js`
- `index.html`
- `tests/muscle-gain-intent.test.js`

## Known limits

This creates an initial target only for the narrow eligible Standard domain. It does not predict muscle gain, optimize a surplus, establish a rate, create a Professional mode, or resolve the independent low-BMI/reference-size policy question.
