# GitHub, Preview y producción

`main` alimenta producción. El punto de partida de MB-02 es el SHA de producción registrado en [Versiones](VERSIONS.md). Los cambios se revisan en ramas `codex/<tarea>` y pasan por Preview antes de una promoción aprobada.

`vercel.json` define `npm run build`, salida estática `dist/`, URLs limpias y el rewrite de `/macros`. Las rutas `api/*.mjs` se ejecutan como funciones Node. El servidor Express de desarrollo se inicia desde `server.js` y sirve la misma salida estática en local.

Para un despliegue autorizado:

1. Ejecuta `npm ci` y `npm run check` en un checkout limpio con la configuración base.
2. En el proyecto asociado de Vercel, verifica el SHA y el entorno de Preview. Confirma dominios Firebase, proveedores, reglas, índices y flags de ese entorno.
3. Valida con datos y cuenta de prueba el acceso, objetivo, exclusiones, plan, compras, exportación y medios. Usa la [guía de dispositivos](docs/device-lab.md).
4. Tras aprobación, promueve mediante el flujo de `main` y confirma el SHA del dominio de producción. Registra el despliegue anterior para reversión. Revertir una publicación de código es independiente de restaurar datos, reglas o índices de Firebase.

Para controles existentes consulta [Seguridad](docs/security-and-deployment.md). La configuración opcional se describe en `.env.example` y el [runbook de shadow](docs/shadow-deployment-runbook.md). Gestiona secretos mediante las consolas del entorno correspondiente.
