# Seguridad y deployment

Consulta [Despliegue](../DEPLOYMENT.md) para el flujo vigente de GitHub y Vercel. Los resultados de auditoría, CLI y rendimiento de este documento corresponden a la integración inicial.

## Auditoría local

- `npm audit`: 0 vulnerabilidades en dependencias instaladas.
- No se encontraron llaves privadas, Firebase Admin, service accounts, tokens Bearer ni secretos `.env` en el repo.
- La `apiKey` de `firebaseConfig` es configuración pública del SDK web. La autorización real depende de Auth, reglas Firestore y dominios autorizados.
- `.gitignore` excluye `.env*`, `.vercel`, logs, reportes, `node_modules` y `dist`.
- `.env.example` no contiene valores secretos.
- El servidor desactiva `X-Powered-By`, limita JSON a 256 KB y no sirve engine/tests/documentos.
- Vercel añade `nosniff`, `DENY` para framing, política de referencia, permisos restringidos y COOP compatible con popups de autenticación.

## Antes del primer deployment

1. Revisar las reglas e índices versionados en `firestore.rules` y `firestore.indexes.json`. Confirmar por separado qué versión está desplegada en el entorno.
2. Agregar el dominio final de Vercel a Firebase Authentication → Authorized domains.
3. Confirmar los proveedores de [la guía de Auth](auth-providers.md) que deban habilitarse y sus URI de redirección.
4. Ejecutar `npm ci && npm run check`.
5. Ejecutar `vercel pull` y `vercel build` con una sesión válida.
6. Desplegar primero como Preview y completar `docs/device-lab.md` en dispositivos reales.

## Estado de la comprobación Vercel

- `vercel.json` se validó por estructura y el build estático local termina correctamente.
- Los cuatro handlers serverless se importaron y ejecutaron mediante `Request`/`Response` estándar de Node.
- `npx vercel@latest build --yes` alcanzó Vercel CLI 59.5.0, pero se detuvo antes del build porque el token local existente no es válido.
- No se intentó login, no se creó proyecto y no se hizo deployment.

Para resolverlo:

```bash
npx vercel login
npx vercel pull
npx vercel build
```

Después de un build exitoso:

```bash
npx vercel deploy
```

## Rendimiento y límites

- `maxDuration` del API está configurado en 60 s.
- La corrida local instrumentada de 14 días tardó 9.16 s.
- El frontend aborta a los 70 s y siempre limpia el overlay en `finally`.
- Las 390 imágenes migradas pesan 36.1 MB en total, frente a 681.3 MB antes de optimización.

Si producción se acerca a 60 s, primero captura `Server-Timing` y `integration_meta.generation_ms`; no cambies heurísticas nutricionales sin una fase separada de equivalencia.
