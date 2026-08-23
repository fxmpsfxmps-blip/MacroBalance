# MacroBalance

MacroBalance reúne en una sola aplicación la portada, autenticación Firebase, calculadora de macros, objetivo activo, configurador de preferencias, motor nutricional de 14 días, Dashboard y listas de compras.

## Flujo del producto

`Auth → Profile → Calculator → Current Goal → Configurator → Menu Engine → Generated Plan → Dashboard → Shopping List`

- `index.html` contiene la portada, acceso y calculadora.
- `plan.html` contiene preferencias, Dashboard y compras.
- Firebase conserva la identidad, el perfil y el historial de objetivos.
- Las funciones de `/api` ejecutan el motor estable en el servidor.
- El plan generado se mantiene temporalmente por pestaña en `sessionStorage`, asociado al usuario y al objetivo que lo originó.

## Requisitos y ejecución local

- Node.js 20 o superior.
- Una conexión de red para cargar el SDK web de Firebase y las fuentes de Google.

```bash
npm install
npm run dev
```

El sitio queda disponible en `http://localhost:3000`. Si ese puerto está ocupado:

```powershell
$env:PORT=3100
npm run dev
```

Comprobación completa:

```bash
npm run check
```

## Estructura principal

```text
api/                         Cuatro entradas serverless públicas
assets/foods/                197 imágenes de alimentos por food.id
docs/                        Arquitectura, auditoría, deployment y device lab
js/                          Navegación, resolución de assets y aplicación del menú
lib/menu-engine/             Engine, sustituciones, Dashboard y JSON estables
lib/server/                  Validación y handler compartidos por local/Vercel
media/                       Hero y fotografías de la calculadora
styles/                      Estilos compartidos y del menú
tests/                       Contratos, equivalencia, assets y fixtures locales
PLT_*.jpg                    193 fotografías por dish_id (URL /{dish_id}.jpg)
index.html                   Inicio + calculadora
plan.html                    Configurador + Dashboard + compras
firebase-init.js             Auth y persistencia Firestore
server.js                    Servidor local, no servidor de producción
vercel.json                  Build estático y funciones Node en Vercel
```

## Firebase

La configuración web pública está en `firebase-init.js`; no es una credencial de Firebase Admin. No hay secretos de servidor en el proyecto.

La estructura existente se conserva:

```text
users/{uid}
users/{uid}/profile/current
users/{uid}/goals_history/{goalId}
```

`users/{uid}.currentObjectiveId` apunta al objetivo activo. Al guardar uno nuevo, el anterior se marca como `completed`, se crea un documento histórico nuevo y se actualiza el puntero.

Antes de probar un dominio de Vercel, agrégalo en Firebase Console → Authentication → Settings → Authorized domains. Revisa también que las reglas de Firestore permitan únicamente el acceso del usuario autenticado a su propio `uid`.

## API

| Método | Ruta | Responsabilidad |
| --- | --- | --- |
| `GET` | `/api/foods` | Catálogo de 197 alimentos |
| `POST` | `/api/generar-menu` | Menú de un día y Dashboard |
| `POST` | `/api/generar-menu-semanal` | Semana y lista de compras |
| `POST` | `/api/generar-plan-dos-semanas` | Plan de 14 días, Dashboard y compras |

El endpoint de 14 días requiere un objetivo explícito:

```json
{
  "objetivo": {
    "kcal": 1800,
    "proteina": 125,
    "carbos": 190,
    "grasa": 60
  },
  "numeroComidas": 4,
  "diasSinRepetir": 2,
  "excludedIngredients": ["salmon_cocido"]
}
```

No se aplican macros ficticios si falta el objetivo. El API valida tipos, rangos e identificadores y devuelve errores `400` legibles.

## Assets

- Alimento: `/assets/foods/{food.id}.jpe`.
- Platillo: `/{dish_id}.jpg`.
- `js/asset-resolver.js` es el único helper de URL del frontend.

Las 390 imágenes migradas están optimizadas a un máximo de 1280 px, conservando su proporción. Para repetir el proceso sobre nuevas copias:

```bash
npm run optimize:images
```

## Vercel

La compilación copia únicamente el frontend publicable a `dist/`; engine, pruebas y documentación no se sirven como archivos estáticos. Las funciones `.mjs` usan el runtime Node y cargan `lib/menu-engine/**` mediante `includeFiles`.

```bash
npm run check
npx vercel login
npx vercel pull
npx vercel build
npx vercel deploy
```

No hay variables obligatorias en esta versión. `.env.example` documenta la política de secretos. Consulta [docs/security-and-deployment.md](docs/security-and-deployment.md) antes del primer despliegue.

## P7

P7 sigue siendo contexto experimental y no fue promovido. El único punto preparado es `#custom-recipe-extension` en `plan.html`; está vacío, oculto y fuera del motor estable. No se añadieron swaps P7 ni recetas personalizadas a la generación actual.

Más detalle: [docs/architecture.md](docs/architecture.md), [docs/integration-audit.md](docs/integration-audit.md) y [docs/device-lab.md](docs/device-lab.md).
