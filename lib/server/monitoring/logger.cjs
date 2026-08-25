'use strict';

const { sanitizeValue } = require('./sanitize.cjs');
const { sendDiscord } = require('./notifiers/discord.cjs');
const { sendTelegram } = require('./notifiers/telegram.cjs');

const LEVELS = Object.freeze({ INFO: 10, WARNING: 20, ERROR: 30, CRITICAL: 40 });

function normalizeEvent(event) {
  const level = LEVELS[event?.level] ? event.level : 'ERROR';
  return sanitizeValue({
    service: 'macrobalance-v2',
    level,
    timestamp: event?.timestamp || new Date().toISOString(),
    message: event?.message || 'Evento sin mensaje',
    ...event,
    level
  });
}

function logEvent(event, consoleRef = console) {
  const clean = normalizeEvent(event);
  const method = LEVELS[clean.level] >= LEVELS.ERROR ? 'error' : clean.level === 'WARNING' ? 'warn' : 'log';
  consoleRef[method](JSON.stringify(clean));
  return clean;
}

async function reportEvent(event, options = {}) {
  try {
    const clean = logEvent(event, options.consoleRef || console);
    const tasks = [];
    if (LEVELS[clean.level] >= LEVELS.WARNING || (clean.level === 'INFO' && process.env.MONITORING_ALERT_ALL_REQUESTS === 'true')) {
      tasks.push((options.sendDiscord || sendDiscord)(clean, options.discord));
    }
    if (clean.level === 'CRITICAL') tasks.push((options.sendTelegram || sendTelegram)(clean, options.telegram));
    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === 'rejected') {
        (options.consoleRef || console).warn(JSON.stringify({
          service: 'macrobalance-v2-monitoring',
          level: 'WARNING',
          timestamp: new Date().toISOString(),
          message: 'Notifier no disponible',
          notifierError: sanitizeValue(result.reason?.message || result.reason)
        }));
      }
    }
    return { delivered: results.filter(result => result.status === 'fulfilled').length, failed: results.filter(result => result.status === 'rejected').length };
  } catch (error) {
    try {
      (options.consoleRef || console).warn(JSON.stringify({ service: 'macrobalance-v2-monitoring', level: 'WARNING', message: 'Monitoring fail-safe activado' }));
    } catch {}
    return { delivered: 0, failed: 1 };
  }
}

module.exports = { LEVELS, logEvent, normalizeEvent, reportEvent };
