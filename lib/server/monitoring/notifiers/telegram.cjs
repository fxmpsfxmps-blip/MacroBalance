'use strict';

const { sanitizeText, truncate } = require('../sanitize.cjs');

async function sendTelegram(event, options = {}) {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true };
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 3500;
  const text = truncate([
    `MacroBalance · ${event.level}`,
    sanitizeText(event.message, 800),
    `${event.method || ''} ${event.endpoint || ''}`.trim(),
    `Request ID: ${event.requestId || 'n/a'}`,
    sanitizeText(event.stack || '', 2500)
  ].filter(Boolean).join('\n\n'), 4096);
  const response = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!response.ok) throw new Error(`Telegram respondió ${response.status}`);
  return { sent: true };
}

module.exports = { sendTelegram };
