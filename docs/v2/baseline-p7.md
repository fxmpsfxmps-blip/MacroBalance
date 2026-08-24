# Baseline reproducible P7/V1

## Origen

- Repositorio: `https://github.com/fxmpsfxmps-blip/MacroBalance.git`
- Commit: `44ce48573981462005387dd1f016661201b36e37`
- Rama estable observada: `main`
- Copia V2: clon limpio, dependencias recreadas con `npm ci`.
- Baseline V1: `npm run check`, 20/20 pruebas y build correctos antes de implementar V2.1.

## Conducta P7 registrada

| Flujo | Baseline |
| --- | --- |
| Login/restauración | Firebase Auth con `browserLocalPersistence` y seis proveedores |
| Calculadora | Fórmulas P7 conservadas en modalidad Estándar |
| Objetivo | Firestore `goals_history` + puntero `currentObjectiveId` |
| Preferencias | Consume objetivo activo de solo lectura |
| Semanas 1 y 2 | Endpoint de plan de dos semanas, engine determinista probado |
| Dashboard | Render del plan por semana/día/comida |
| Compras | Derivada del plan para semana 1, semana 2 o 14 días |
| Historial | Lee objetivos del usuario y marca el activo |
| Borrado | UI existente; el ruleset remoto rechaza ciertos `delete` |
| Logout | `signOut`, memoria y sesión del plan se limpian según el flujo existente |
| Restauración | Auth/objetivo persistentes; plan generado permanece solo por pestaña |

El baseline automatizado usa la seed `integration-baseline-v1`; su salida semanal conserva hash y totales exactos. Los hashes del engine, dashboard y JSON protegen el runtime P7 contra cambios accidentales.

## Diagnóstico del historial Firestore

- Documento solicitado: `users/{auth.uid}/goals_history/{goalId}`.
- Propietario efectivo: el UID autenticado forma parte de la ruta.
- Operación que falla: `delete` de un objetivo histórico.
- Lectura: permitida en la sesión observada.
- Estado de reglas V1: no estaban versionadas en el repositorio. Firebase CLI respondió que requiere `firebase login`, por lo que el texto exacto del ruleset remoto no se puede auditar desde esta copia.
- Conclusión sustentada: el cliente usa la ruta del propietario, pero la política remota vigente no concede ese `delete` o exige una condición que los documentos legacy no satisfacen. No es válido afirmar una línea exacta de una regla remota no disponible.

V2 agrega reglas explícitas basadas en la ruta/UID, compatibles con documentos legacy y sin depender de un campo `ownerUid` redundante. El borrado se ejecuta en transacción: vuelve a leer `users/{uid}.currentObjectiveId`, exige que el objetivo exista y cancela si es el activo. La misma prohibición existe en reglas, evitando una carrera entre UI y servidor.

Estas reglas quedan preparadas, no desplegadas al Firebase compartido de V1. Su validación remota requiere staging o autorización separada.

## Persistencia de planes auditada

`js/menu-app.js` guarda el plan y preferencias en `sessionStorage`, con clave asociada al UID y objetivo. Es un artefacto generado temporal:

- otra pestaña no lo comparte;
- cerrar la pestaña elimina el plan;
- el objetivo sí persiste en Firestore;
- al volver se restaura usuario/objetivo y se debe generar un plan nuevo.

Para V2.7 será necesario crear una entidad de plan con estado `draft/generated` o `saved`, propietario, versión de engine/objetivo, fechas y copia inmutable suficiente para reproducibilidad. V2.1 no implementa ese modelo.

## Matriz V2.1

La suite añade casos sintéticos de ambos sexos, edades 22–63, pesos 55–91 kg, alturas 160–183 cm, con y sin grasa corporal, distintos pasos, actividad, sueño, estrés, entrenamiento y cardio. Verifica determinismo, finitud, positividad, coherencia 4/4/9, orden lógico déficit/mantenimiento/volumen, respuesta a movimiento/ejercicio, restricción de recuperación y contrato común.

La validación manual/responsive debe cubrir la ruta de prueba y, con una sesión Firebase real, login, guardado, historial, logout y restauración. El ruleset remoto no se cambia en esta rama.
