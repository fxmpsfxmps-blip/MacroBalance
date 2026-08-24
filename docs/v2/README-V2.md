# MacroBalance V2

## Alcance de esta rama

Esta rama parte del commit P7/V1 `44ce48573981462005387dd1f016661201b36e37` y contiene exclusivamente V2.0 y V2.1. La copia de trabajo está en `MacroBalance-V2`; el repositorio V1 permanece separado e intacto.

V2.1 conserva la Calculadora Estándar e incorpora una modalidad adicional, Calculadora de Precisión. Ambas producen el mismo contrato mínimo que consume el engine: `kcal`, `proteina`, `carbos` y `grasa`. No se modificaron el engine, los catálogos, recetas, sustituciones ni el flujo de generación P7.

## Arquitectura encontrada

- `index.html` + `calculadora.js`: landing, autenticación y calculadora.
- `js/calculator-core.js`: núcleo puro y comprobable de la modalidad Precisión y del contrato común.
- `firebase-init.js`: Firebase Auth, perfil, objetivo activo e historial.
- `plan.html` + `js/menu-app.js`: preferencias, generación, Dashboard y lista de compras.
- `lib/menu-engine/`: engine P7 y JSON nutricionales canónicos.
- `api/` + `services/`: adaptadores HTTP del engine.
- `tests/`: contratos, baseline determinista, UI, Auth y cálculo.
- `scripts/build-static.js`: build estático para Vercel.

Flujo común:

`inputs -> normalización -> energía -> objetivo -> macros -> NutritionTarget -> Firestore -> engine`

## Contrato común

```js
{
  schemaVersion: '2.1',
  calculationMode: 'standard' | 'precision',
  calculatorVersion: '...',
  goalType: 'deficit' | 'mantenimiento' | 'volumen',
  kcal: 2100,
  proteina: 140,
  carbos: 245,
  grasa: 62,
  energyCheck: { macroKcal: 2098, differenceKcal: -2 },
  method: { /* trazabilidad del cálculo */ },
  weeklyTarget: {
    strategy: 'uniform',
    dailyTarget: { kcal: 2100, proteina: 140, carbos: 245, grasa: 62 },
    variableDays: null
  }
}
```

`weeklyTarget` prepara una futura interfaz, pero V2.1 entrega un objetivo diario uniforme. No existe calorie cycling y el engine no cambió.

## Persistencia y compatibilidad

- Auth usa `browserLocalPersistence`; la sesión se conserva entre recargas y reinicios cuando el navegador permite almacenamiento local.
- No existe bypass de autenticación, usuario falso, token ni secreto de desarrollo.
- El perfil permanece en `users/{uid}/profile/current`.
- Cada objetivo se guarda en `users/{uid}/goals_history/{goalId}` y el puntero activo en `users/{uid}.currentObjectiveId`.
- Los documentos nuevos añaden `calculationMode`, `calculatorVersion`, `nutritionTargetVersion` y `nutritionTarget`.
- Los documentos legacy siguen leyéndose; si no tienen modalidad, la UI los presenta como Estándar.
- Los planes generados continúan en `sessionStorage`, aislados por usuario/objetivo/pestaña. La distinción futura `draft/generated` frente a `saved` queda aplazada a V2.7.

## Desarrollo local

```powershell
npm ci
npm run check
npm run dev
```

La ruta de prueba de la calculadora permite revisar la UI sin relajar Auth. Para flujos reales se inicia sesión normalmente una vez; Firebase restaura esa sesión. El Auth Emulator no se añadió porque la persistencia actual cubre la necesidad y un emulador incompleto aumentaría complejidad.

## Seguridad y despliegue

`firestore.rules` versiona por primera vez las reglas necesarias para esta rama. Toda lectura/escritura se limita a `request.auth.uid == userId`; el documento raíz de usuario no puede borrarse y un objetivo histórico solo puede borrarse si no coincide con `currentObjectiveId`.

Las reglas remotas del proyecto compartido no se publican desde esta rama: hacerlo alteraría la producción V1. Firebase CLI requiere login para inspeccionar o desplegar el ruleset remoto. Antes de usar V2 con datos reales debe validarse en un proyecto Firebase de staging o aprobarse explícitamente el despliegue coordinado.

## Roadmap documentado, no implementado

- V2.2: expansión de foods/recetas.
- V2.3: candidatos/scoring.
- V2.4: sustituciones inteligentes.
- V2.5: saciedad/densidad energética.
- V2.6: suplementos/micronutrientes bajo diseño aprobado.
- V2.7: persistencia formal de planes.
- V2.8: PDF profesional.
- V2.9: stress tests y release.
- V3: multiusuario profesional, seguimiento longitudinal y lógica clínica.

Ninguna de esas fases está implementada aquí.
