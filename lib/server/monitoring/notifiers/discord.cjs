'use strict';

const { sanitizeText } = require('../sanitize.cjs');

const COLORS = { WARNING: 0xf2c94c, ERROR: 0xeb5757, CRITICAL: 0x8b0000 };

async function sendDiscord(event, options = {}) {
  const webhook = options.webhook ?? process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { skipped: true };
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 3500;
  const response = await fetchFn(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      embeds: [{
        title: `MacroBalance · ${event.level}`,
        color: COLORS[event.level] || COLORS.ERROR,
        description: sanitizeText(event.message, 1000),
        fields: [
          { name: 'Ruta', value: sanitizeText(`${event.method || ''} ${event.endpoint || ''}`, 250), inline: true },
          { name: 'Request ID', value: sanitizeText(event.requestId || 'n/a', 100), inline: true },
          { name: 'Cliente', value: sanitizeText([event.client?.browser, event.client?.os, event.client?.device].filter(Boolean).join(' · ') || 'n/a', 200) },
          { name: 'Stack', value: sanitizeText(event.stack || 'n/a', 900) }
        ],
        timestamp: event.timestamp
      }]
    })
  });
  if (!response.ok) throw new Error(`Discord respondió ${response.status}`);
  return { sent: true };
}

module.exports = { sendDiscord };
