# Monitoring V2

Estado: capa pequeña para pruebas controladas. No sustituye una plataforma de observabilidad de alto volumen.

## Flujo

- `js/error-monitor.js` captura `error` y `unhandledrejection` y sólo llama a `/api/report-error` en el mismo origen.
- `api/report-error.mjs` valida campos y tamaños, aplica un límite básico en memoria y emite eventos `ERROR`.
- `lib/server/handler.mjs` observa todas las APIs Vercel, incluidos los resultados 500 que `menu-service.cjs` devuelve sin lanzar.
- `server.js` replica el comportamiento para desarrollo local.
- `hard_exclusion_violation` se observa como `WARNING`; la detección nutricional no fue modificada.

## Niveles

- `INFO`: log estructurado.
- `WARNING`: log y Discord.
- `ERROR`: log y Discord.
- `CRITICAL`: log, Discord y Telegram.

Todos los notifiers tienen timeout y se ejecutan mediante una capa fail-safe. Una caída, 429 o credencial inválida no altera la respuesta funcional de MacroBalance.

## Variables

Configurar sólo en backend:

```text
DISCORD_WEBHOOK_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
MONITORING_IP_SALT
MONITORING_ALERT_ALL_REQUESTS=false
```

`MONITORING_IP_SALT` habilita un hash HMAC truncado de IP para correlación sin enviar la IP original. Si falta, la IP no se registra. Los accesos normales se registran como JSON y no generan alertas externas.

## Privacidad y límites

No se envían cuerpos completos, formularios nutricionales, cookies, encabezados de autorización ni tokens. La sanitización redacta claves sensibles y patrones de credenciales. El rate limit del endpoint frontend es por instancia serverless y sólo mitiga ráfagas; para tráfico público de alto volumen debe reemplazarse por un límite distribuido.
