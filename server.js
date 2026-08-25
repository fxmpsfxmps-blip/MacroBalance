const express = require('express');
const path = require('path');
const { run } = require('./lib/server/menu-service.cjs');
const { reportEvent } = require('./lib/server/monitoring/logger.cjs');
const { requestIdFrom, requestInfo } = require('./lib/server/monitoring/request-info.cjs');
const { sanitizeError } = require('./lib/server/monitoring/sanitize.cjs');

const app = express();
const port = Number(process.env.PORT) || 3000;
const staticDirectory = path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function endpoint(operation) {
  return async (request, response) => {
    const startedAt = Date.now();
    const requestId = requestIdFrom(request);
    const info = requestInfo(request, requestId);
    try {
      const result = run(operation, request.body || {});
      const durationMs = Date.now() - startedAt;
      await reportEvent({ level: 'INFO', message: 'API request', ...info, durationMs, status: result.status });
      if (result.status >= 500) {
        await reportEvent({ level: 'ERROR', message: result.payload?.error || 'Error interno de API', ...info, durationMs, status: result.status });
      } else if (result.payload?.hard_exclusion_violation) {
        await reportEvent({ level: 'WARNING', message: 'hard_exclusion_violation detectada', ...info, durationMs, status: result.status });
      }
      response
        .status(result.status)
        .set('Cache-Control', operation === 'foods' ? 'public, max-age=3600' : 'no-store')
        .set('Server-Timing', `menu-engine;dur=${result.durationMs}`)
        .set('X-Request-ID', requestId)
        .json(result.payload);
    } catch (error) {
      const clean = sanitizeError(error);
      await reportEvent({ level: 'CRITICAL', message: clean.message, stack: clean.stack, ...info, durationMs: Date.now() - startedAt, status: 500 });
      response.status(500).set('Cache-Control', 'no-store').set('X-Request-ID', requestId).json({ success: false, error: 'Error interno al generar el plan.' });
    }
  };
}

app.get('/api/foods', endpoint('foods'));
app.post('/api/generar-menu', endpoint('daily'));
app.post('/api/generar-menu-semanal', endpoint('weekly'));
app.post('/api/generar-plan-dos-semanas', endpoint('fortnight'));
app.post('/api/report-error', async (request, response) => {
  const module = await import('./api/report-error.mjs');
  const webRequest = new Request(`${request.protocol || 'http'}://${request.get('host')}${request.originalUrl}`, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body || {})
  });
  const result = await module.POST(webRequest);
  response.status(result.status);
  result.headers.forEach((value, name) => response.set(name, value));
  response.send(await result.text());
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/__test__/firebase-session.js', (_request, response) => {
    response.type('application/javascript').sendFile(
      path.join(__dirname, 'tests', 'fixtures', 'firebase-session.js')
    );
  });
  app.get('/__test__/plan', (_request, response) => {
    const fs = require('fs');
    const source = fs.readFileSync(path.join(__dirname, 'plan.html'), 'utf8');
    response.type('html').send(
      source.replace(
        '<script type="module" src="/firebase-init.js"></script>',
        '<script src="/__test__/firebase-session.js"></script>'
      )
    );
  });
  app.get('/__test__/calculator', (_request, response) => {
    const fs = require('fs');
    const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    response.type('html').send(
      source
        .replace('<head>', '<head><base href="/">')
        .replace(
          '<script type="module" src="firebase-init.js"></script>',
          '<script src="/__test__/firebase-session.js"></script>'
        )
    );
  });
}

app.use(express.static(staticDirectory, {
  dotfiles: 'ignore',
  fallthrough: true,
  index: 'index.html'
}));
app.get('/macros', (_request, response) => response.sendFile(path.join(staticDirectory, 'index.html')));
app.get('/plan', (_request, response) => response.sendFile(path.join(staticDirectory, 'plan.html')));
app.get('/multimedia', (_request, response) => response.sendFile(path.join(staticDirectory, 'multimedia.html')));

app.use((_request, response) => {
  response.status(404).json({ success: false, error: 'Ruta no encontrada.' });
});

app.listen(port, () => {
  console.log(`MacroBalance disponible en http://localhost:${port}`);
});
