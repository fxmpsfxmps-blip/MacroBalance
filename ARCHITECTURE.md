# Arquitectura de MacroBalance

`index.html` → Firebase Auth y perfil → Standard → objetivo activo → `plan.html` → API de menús → plan de 14 días → Dashboard y compras.

| Frente | Entradas y responsabilidades |
| --- | --- |
| Entrada, sesión y datos | `index.html`, `firebase-init.js`, `js/auth-coordinator.js` y `js/navigation.js` coordinan acceso, navegación, perfil y objetivo activo. Firebase Auth identifica al usuario. Firestore conserva perfil e historial. |
| Calculadoras | `calculadora.js` coordina la UI. `lib/standard/` adapta PATCH3 a Standard. `js/calculator-core.js` conserva Precision V2.1. Ver [contratos y pruebas](CALCULATORS.md). |
| Preferencias y exclusiones | `plan.html` y `js/menu-app.js` recogen exclusiones y preferencias y envían el objetivo al API. El plan se conserva en `sessionStorage` por usuario y objetivo. |
| Catálogo y motor | `lib/menu-engine/data/` contiene alimentos, recetas y datos de preparación. `lib/menu-engine/engine.js` selecciona platos y porciones y aplica las exclusiones. `lib/server/menu-service.cjs` valida solicitudes y registra diagnósticos de exclusión en los resultados. |
| Dashboard y compras | `lib/menu-engine/dashboard.js` deriva las vistas de los datos del plan. `js/menu-app.js` las renderiza. `js/plan-export.js` y `lib/export/` participan en la exportación. |
| Medios y frontend | `multimedia.html`, `styles/`, `media/`, `assets/foods/` y fotos `PLT_*.jpg`. `js/asset-resolver.js` resuelve las rutas de imágenes. |
| Operación | `server.js` sirve `dist/` y el API en local. En Vercel las funciones `api/*.mjs` ejecutan sus propios manejadores. `lib/shadow/` y `lib/longitudinal/` contienen infraestructura condicionada por configuración. |

Los frentes comparten contratos y datos dentro de un mismo repositorio. El mapa de [estado y persistencia](docs/architecture.md) amplía el flujo. Consulte [despliegue](DEPLOYMENT.md) para distinguir el servidor local y Vercel.

## API de catálogo y menús

| Método y ruta | Entrada y resultado |
| --- | --- |
| `GET /api/foods` | Devuelve el array del catálogo que usa el motor. |
| `POST /api/generar-menu` | Contrato diario legacy. Recibe `objetivos: { kcal, p, c, f }` y devuelve `menu`, `totales`, `diferencia_vs_objetivo` y `dashboard`. |
| `POST /api/generar-menu-semanal` | Recibe `objetivo: { kcal, proteina, carbos, grasa }` y devuelve los días, `dashboard_dias` y `lista_compras_semana`. |
| `POST /api/generar-plan-dos-semanas` | Usa el mismo formato de objetivo que la ruta semanal. Devuelve dos semanas, los dashboards de cada semana y las listas de compras. |

Las tres rutas POST requieren JSON y un objetivo explícito con cuatro valores finitos y positivos. `kcal` expresa energía diaria y los restantes valores son gramos por día. `numeroComidas` acepta enteros de 2 a 5 (5 por defecto) y `diasSinRepetir` de 1 a 3 (2 por defecto). `excludedIngredients` admite un array de identificadores de alimentos del catálogo. `seed` es texto opcional no vacío de hasta 120 caracteres. Los errores de validación del contrato devuelven HTTP 400 con `success: false` y un mensaje en `error`.

Ejemplo de cuerpo para el plan de 14 días:

```json
{
  "objetivo": { "kcal": 1800, "proteina": 125, "carbos": 190, "grasa": 60 },
  "numeroComidas": 4,
  "diasSinRepetir": 2,
  "excludedIngredients": ["salmon_cocido"]
}
```

Las rutas de shadow tienen su propio [runbook](docs/shadow-deployment-runbook.md).

## Convenciones de imágenes y medios

- Alimentos: `/assets/foods/{food.id}.jpe`.
- Platillos: `/{dish_id}.jpg`. El build copia las fotos `PLT_*.jpg` a la raíz pública. El resolver usa el identificador en lugar del campo histórico `dishes.image`.
- Los videos, posters y la vista previa social se sirven bajo `/media/`. Se versionan las variantes web utilizadas por la aplicación. Las fuentes grandes ignoradas se recuperan por separado según [Recuperación](RECOVERY.md).
- `npm run optimize:images` es una herramienta de mantenimiento de activos. La instalación normal usa los archivos ya versionados.
