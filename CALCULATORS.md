# Calculadoras y contratos

| | Standard PATCH3 | Precision V2.1 |
| --- | --- | --- |
| Entrada | Opción visible en `index.html`, invocada desde `calculadora.js`. | Ruta conservada en `calculadora.js` y `js/calculator-core.js`. Los campos de rollback están ocultos en la UI actual. |
| Implementación | `calculatePatch3Standard` en `lib/standard/patch3-standard-adapter.mjs`. Usa contrato de perfil/actividad, objetivo y políticas aplicables. Puede producir un objetivo o informar que el caso requiere datos adicionales o no está disponible. | `calculatePrecisionTargets` estima gasto con metabolismo basal, movimiento, ejercicio neto y TEF. Las entradas de actividad y ritmos están descritas en el [documento histórico V2.1](docs/v2/calculator-precision.md). |
| Resultado | Al resolver el objetivo, proyecta `kcal` en kcal/día y `proteina`, `carbos`, `grasa` en gramos/día al contrato del motor. | Expone las mismas cuatro cantidades de compatibilidad y metadatos de método y coherencia energética. |

El bloque P7 conservado para rollback es una referencia histórica adicional. La sección «Estándar preservada» del documento V2.1 describe ese bloque. Standard PATCH3 se verifica por separado.

## Sentinelas vigentes

| Prueba existente | Qué protege |
| --- | --- |
| [standard-patch3-promotion](tests/standard-patch3-promotion.test.js) | Promoción desde UI, objetivo finito, distinción entre entrenamiento desconocido y ausencia declarada, pasos condicionales y compatibilidad con el motor. |
| [low-body-muscle-gain-r1-integration](tests/low-body-muscle-gain-r1-integration.test.js) | F23 de 8,000 pasos y preflight NO/NO da 2,037 kcal, P64/C306/G62. El fixture de 2,000 pasos y 4×66 min da 1,892 kcal, P65/C278/G58. El caso que requiere respuestas y carece de ellas conserva objetivo nulo. |
| [calculator-precision](tests/calculator-precision.test.js) | SHA-256 del bloque P7 legacy, matriz determinista de adultos, coherencia energética, efecto de pasos y entrenamiento, ritmo limitado por recuperación y consumo de `NutritionTarget` por el motor. |
| [numeric sentinel addendum](NUMERIC_SENTINEL_FIXTURE_ADDENDUM.md) | Contexto de las referencias numéricas y cómo interpretar los fixtures. |

Los sentinelas protegen resultados del software. Toda modificación científica futura requiere una misión independiente y revisión de entradas, resultados y unidades con los fixtures correspondientes.
