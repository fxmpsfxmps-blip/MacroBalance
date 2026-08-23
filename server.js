const express = require('express');
const path = require('path');
const { run } = require('./lib/server/menu-service.cjs');

const app = express();
const port = Number(process.env.PORT) || 3000;
const staticDirectory = path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function endpoint(operation) {
  return (request, response) => {
    const result = run(operation, request.body || {});
    response
      .status(result.status)
      .set('Cache-Control', operation === 'foods' ? 'public, max-age=3600' : 'no-store')
      .set('Server-Timing', `menu-engine;dur=${result.durationMs}`)
      .json(result.payload);
  };
}

app.get('/api/foods', endpoint('foods'));
app.post('/api/generar-menu', endpoint('daily'));
app.post('/api/generar-menu-semanal', endpoint('weekly'));
app.post('/api/generar-plan-dos-semanas', endpoint('fortnight'));

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
app.get('/plan', (_request, response) => response.sendFile(path.join(staticDirectory, 'plan.html')));

app.use((_request, response) => {
  response.status(404).json({ success: false, error: 'Ruta no encontrada.' });
});

app.listen(port, () => {
  console.log(`MacroBalance disponible en http://localhost:${port}`);
});
