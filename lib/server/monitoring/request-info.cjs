'use strict';

const crypto = require('node:crypto');
const { sanitizeText } = require('./sanitize.cjs');

function header(request, name) {
  return request?.headers?.get?.(name) || request?.get?.(name) || request?.headers?.[name.toLowerCase()] || '';
}

function classifyUserAgent(userAgent) {
  const ua = String(userAgent || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const device = /Mobile|Android|iPhone/.test(ua) ? 'mobile' : /iPad|Tablet/.test(ua) ? 'tablet' : 'desktop';
  return { browser, os, device };
}

function anonymizeIp(request, salt = process.env.MONITORING_IP_SALT) {
  if (!salt) return null;
  const raw = header(request, 'x-forwarded-for').split(',')[0].trim();
  if (!raw) return null;
  return crypto.createHmac('sha256', salt).update(raw).digest('hex').slice(0, 12);
}

function requestIdFrom(request) {
  const candidate = header(request, 'x-request-id');
  return /^[A-Za-z0-9._:-]{1,100}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function requestInfo(request, requestId) {
  let path = '/unknown';
  try {
    const rawUrl = request?.url || request?.originalUrl || request?.path;
    path = rawUrl ? new URL(rawUrl, 'http://localhost').pathname : path;
  } catch {}
  const userAgent = sanitizeText(header(request, 'user-agent'), 300);
  return {
    requestId,
    endpoint: sanitizeText(path, 200),
    method: sanitizeText(request?.method || 'UNKNOWN', 12),
    userAgent,
    client: classifyUserAgent(userAgent),
    ipHash: anonymizeIp(request)
  };
}

module.exports = { anonymizeIp, classifyUserAgent, requestIdFrom, requestInfo };
