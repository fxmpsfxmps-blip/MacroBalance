(function initializeErrorMonitoring(windowObject) {
  'use strict';

  const endpoint = '/api/report-error';
  let reportsInFlight = 0;

  function text(value, maximum) {
    const result = String(value ?? '');
    return result.length <= maximum ? result : result.slice(0, maximum);
  }

  function send(payload) {
    if (reportsInFlight >= 3 || !windowObject.fetch) return;
    reportsInFlight += 1;
    windowObject.fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventType: payload.eventType,
        message: text(payload.message, 500),
        path: text(windowObject.location?.pathname || '/', 200),
        source: text(payload.source || '', 300),
        line: Number.isFinite(payload.line) ? payload.line : null,
        column: Number.isFinite(payload.column) ? payload.column : null,
        stack: text(payload.stack || '', 3000),
        userAgent: text(windowObject.navigator?.userAgent || '', 300),
        timestamp: new Date().toISOString()
      })
    }).catch(function () {}).finally(function () { reportsInFlight -= 1; });
  }

  windowObject.addEventListener('error', function (event) {
    send({
      eventType: 'window.error',
      message: event.message || event.error?.message || 'Error de navegador',
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack
    });
  });

  windowObject.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    send({
      eventType: 'unhandledrejection',
      message: reason?.message || String(reason || 'Promesa rechazada sin manejar'),
      stack: reason?.stack
    });
  });
})(window);
