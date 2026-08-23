# Arquitectura de MacroBalance

## Flujo y fuentes de verdad

```text
Firebase Auth
    ↓
users/{uid}/profile/current
    ↓
Calculadora (calculadora.js)
    ↓
users/{uid}.currentObjectiveId → goals_history/{id}
    ↓
Configurador (plan.html + js/menu-app.js)
    ↓
/api/generar-plan-dos-semanas
    ↓
lib/menu-engine/engine.js
    ↓
Plan temporal de la pestaña
    ↓
Dashboard
    ↓
Lista de compras
```

| Estado | Fuente de verdad | Persistencia |
| --- | --- | --- |
| Sesión | Firebase Auth | Firebase |
| Perfil y sexo | `users/{uid}/profile/current` | Firestore |
| Objetivo activo | `users/{uid}.currentObjectiveId` + `goals_history/{id}` | Firestore |
| Objetivo mostrado en configurador | `window.macroBalanceState.currentGoal.result` | Memoria, procedente de Firestore |
| Exclusiones | `seleccionActual` (`Set`) | Memoria; se guarda junto al plan de la pestaña |
| Preferencias de generación | selects de comidas y repetición | DOM; copia temporal por pestaña |
| Lógica nutricional | `lib/menu-engine/engine.js` | Código y JSON versionados |
| Plan generado | respuesta del API | `sessionStorage` por `uid` y `goalId` |
| Dashboard/compras | transformación de `dashboard.js` incluida en la respuesta | Derivado del plan |

## Límites de responsabilidad

### Cliente

- Restaura la sesión y el objetivo.
- Impide configurar el menú sin autenticación u objetivo válido.
- Mantiene las exclusiones en una sola colección.
- Muestra un loading indeterminado solamente durante una petición real.
- Renderiza semanas, días, comidas, fotos, resúmenes y compras.
- No calcula ni corrige macros del motor.

### Firebase

- Autenticación Google/Facebook.
- Perfil actual mutable.
- Historial de objetivos y puntero al objetivo activo.
- Foto de perfil y datos de cuenta existentes.

### API serverless

- Valida cuerpos JSON y no inventa objetivos.
- Ejecuta el engine estable.
- Construye Dashboard y listas con el módulo migrado.
- Instrumenta `generation_ms` y `Server-Timing` sin cambiar nutrición.
- Comprueba si algún `food_id` excluido reaparece y lo expone como diagnóstico.

### Engine

- Selecciona platos, ajusta cantidades, controla repetición y calcula cierres diarios/semanales.
- Conserva sus archivos migrados byte por byte; la integración no cambió su lógica.

### Vercel

- Publica `dist/` como sitio estático.
- Ejecuta `api/*.mjs` en Node.
- Incluye el engine y sus datos sólo en el paquete de funciones.

### `server.js`

Es exclusivamente el adaptador local para desarrollar y probar. Replica las rutas serverless mediante el mismo `lib/server/menu-service.cjs`; no es necesario en producción.

## Rutas de aplicación

- `/`: hero y flujo de acceso.
- `/#macros`: calculadora autenticada.
- `/plan#config` (o `/plan.html#config` local): objetivo activo y preferencias.
- `/plan#plan`: Dashboard.
- `/plan#compras`: lista de compras.

## Punto de extensión P7

`plan.html` contiene `#custom-recipe-extension`. No está montado, no modifica solicitudes y no forma parte de la lógica nutricional. Una promoción futura deberá tener pruebas de equivalencia y un contrato separado antes de activarlo.
