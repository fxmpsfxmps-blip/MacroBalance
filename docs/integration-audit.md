# Auditoría de integración

## Repositorio real

- Proyecto principal: `MacroBalance-repo`.
- Rama de trabajo: `codex/integration-menu-engine`.
- Remoto válido: `https://github.com/fxmpsfxmps-blip/MacroBalance.git`.
- El Git del directorio padre tiene un remoto de ejemplo y cambios ajenos; no se modificó.
- `menu-engine/` externo se trató como fuente de sólo lectura y permanece intacto.

## Inventario de entrada

| Fuente | Estado final |
| --- | --- |
| `MacroBalance-repo/index.html` | Conservado e integrado con navegación y flujo de sesión |
| `calculadora.js` | Conservado; conexión al objetivo/plan y accesibilidad añadidas |
| `firebase-init.js` | Conserva estructura Firestore; restaura sesión/objetivo y añade logout |
| `menu-engine/engine.js` | Copiado byte por byte a `lib/menu-engine/engine.js` |
| `menu-engine/sustitucion.js` | Copiado byte por byte |
| `menu-engine/dashboard.js` | Copiado byte por byte |
| `foods.json`, `dishes.json` | Copiados byte por byte |
| UI monolítica del menú | Separada en `plan.html`, `styles/menu.css` y `js/menu-app.js` |
| 197 imágenes foods | Migradas por `food.id` y optimizadas en el repo principal |
| 193 imágenes dishes | Migradas por `dish_id` y optimizadas en el repo principal |
| `menu-engine/server.js` | No copiado como servidor de producción; responsabilidades llevadas a API compartida |
| `menu-engine/node_modules` | Excluido |
| Resultados/artefactos P0–P7 | No incorporados al runtime |

## Evidencia de equivalencia

Hashes SHA-256 de los archivos estables migrados:

| Archivo | SHA-256 |
| --- | --- |
| `engine.js` | `7cf556ccf0cadec588734cd6f615e2077f90d08405a2a196be90da2a17913a6c` |
| `sustitucion.js` | `adecd395e3c15ef8fb6c86d0ede89a806814226c212081408914ede50530deaa` |
| `dashboard.js` | `bf37e8222839fdb213e1f2193b74cacd13a0ad70c3546a736fab92a5ed90a730` |
| `foods.json` | `551f8303447dd6295425dae234dff1577cd0381e39f6344730989a9ceac199fd` |
| `dishes.json` | `2d6301faf4f1b12f27eefdf8c09c0f5817cacbe684b9a80ef7245de937ecb273` |

Baseline reproducible:

- Objetivo: 1800 kcal, 125 P, 190 C, 60 G.
- 4 comidas, 7 días, 2 días sin repetir, exclusión `salmon_cocido`.
- Seed: `integration-baseline-v1`.
- Hash antes y después: `c0d8190ddc0e0a30841089ea516aa918df4d7d8edb3e07cca6ff180fa67efd72`.
- Totales semanales antes y después: 12,592 kcal; 876 g P; 1,328 g C; 422 g G.
- Diferencia semanal: -8 kcal, +1 g P, -2 g C, +2 g G.

Resultado: mover archivos no modificó platos ni nutrición.

## Decisiones conservadoras

- No se creó una segunda aplicación anidada.
- El objetivo del configurador no es editable y no tiene defaults nutricionales.
- `dishes.json` conserva rutas históricas inconsistentes; el helper usa la convención estable `/{dish_id}.jpg`.
- `cost_tier` puede existir internamente en el Dashboard migrado, pero no se muestra como etiqueta de presupuesto.
- El plan no se añadió a Firestore para no cambiar costos, reglas o modelo de datos sin una decisión posterior.
- La generación de 14 días midió 9.16 s localmente en una corrida instrumentada; no se optimizó el engine.
- Las imágenes copiadas bajaron de 681.3 MB a 36.1 MB conservando proporción y rutas. Los originales externos no se tocaron.

## Fuera de alcance / no incorporado

- Promoción de P7, swaps o recetas personalizadas.
- Migración de framework.
- Cambios nutricionales por rendimiento.
- Despliegue remoto o push a GitHub.
- Cambios a reglas/configuración en Firebase Console.
