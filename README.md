# MacroBalance

MacroBalance calcula un objetivo de calorías y macronutrientes y lo usa para generar un plan de comidas de 14 días. El usuario inicia sesión, calcula su objetivo, ajusta preferencias y exclusiones y consulta su plan y lista de compras.

## Arranque local

Usa Git, Node.js y npm. La [guía de instalación](SETUP.md) indica la versión comprobada y distingue el `main` publicado, la rama local de revisión y el estado posterior a una integración.

En un checkout que ya incluye la corrección MB-02:

```sh
npm ci
npm run check
npm start
```

Abre `http://localhost:3000`. `npm run check` construye `dist/` y ejecuta después la suite completa. Para reconstruir e iniciar en un paso usa `npm run dev`.

## Guías del proyecto

| Documento | Contenido |
| --- | --- |
| [Arquitectura](ARCHITECTURE.md) | Páginas, Firebase, catálogo, API y motor. |
| [Instalación](SETUP.md) | Segunda PC, validación local y requisitos externos. |
| [Despliegue](DEPLOYMENT.md) | GitHub, Vercel, Preview y producción. |
| [Versiones](VERSIONS.md) | Línea base, convención de ramas y preservación de legacy. |
| [Pendientes](BACKLOG.md) | Experimentos y verificaciones abiertas. |
| [Calculadoras](CALCULATORS.md) | Standard PATCH3, Precision V2.1 y pruebas de referencia. |
| [Recuperación](RECOVERY.md) | Reconstrucción desde Git o respaldos privados. |

El build y la suite base se pueden ejecutar sin credenciales. Para validar login y persistencia usa un entorno Firebase de prueba. La [guía de proveedores](docs/auth-providers.md) documenta la configuración externa.
