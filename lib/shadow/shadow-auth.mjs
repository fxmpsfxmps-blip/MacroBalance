import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_JWKS = new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
const remoteJwks = createRemoteJWKSet(FIREBASE_JWKS);

export class ShadowAuthError extends Error {
  constructor(code, status = 401) {
    super(code);
    this.name = 'ShadowAuthError';
    this.code = code;
    this.status = status;
  }
}

export function bearerToken(header) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(header || ''));
  if (!match) throw new ShadowAuthError('SHADOW_AUTH_TOKEN_REQUIRED');
  return match[1];
}

export function createFirebaseTokenVerifier({ projectId, verify = jwtVerify, jwks = remoteJwks } = {}) {
  if (!projectId) throw new ShadowAuthError('SHADOW_AUTH_PROJECT_REQUIRED', 503);
  return async function verifyFirebaseAuthorization(header) {
    const token = bearerToken(header);
    let result;
    try {
      result = await verify(token, jwks, {
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        algorithms: ['RS256'],
      });
    } catch {
      throw new ShadowAuthError('SHADOW_AUTH_TOKEN_INVALID');
    }
    const uid = result?.payload?.sub;
    if (typeof uid !== 'string' || uid.length < 1 || uid.length > 128) {
      throw new ShadowAuthError('SHADOW_AUTH_SUBJECT_INVALID');
    }
    return { uid };
  };
}

export function pseudonymizeUid(uid, secret, version = 'hmac-sha256-v1') {
  if (typeof uid !== 'string' || !uid) throw new ShadowAuthError('SHADOW_UID_REQUIRED', 500);
  if (typeof secret !== 'string' || secret.length < 32) throw new ShadowAuthError('SHADOW_PSEUDONYM_SECRET_INVALID', 503);
  const digest = crypto.createHmac('sha256', secret).update(`${version}:${uid}`).digest('hex');
  return Object.freeze({ pseudonymousParticipantId: digest, pseudonymizationVersion: version });
}

export function deterministicSample(pseudonymousParticipantId, sampleBps) {
  if (!Number.isInteger(sampleBps) || sampleBps <= 0) return false;
  if (sampleBps >= 10000) return true;
  const bucket = Number.parseInt(pseudonymousParticipantId.slice(0, 8), 16) % 10000;
  return bucket < sampleBps;
}
