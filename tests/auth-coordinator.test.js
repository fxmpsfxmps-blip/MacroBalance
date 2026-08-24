const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isOAuthCancellation,
  createOAuthCoordinator
} = require('../js/auth-coordinator.js');

test('reconoce cancelaciones OAuth que no deben mostrarse como fallo', () => {
  assert.equal(isOAuthCancellation({ code: 'auth/popup-closed-by-user' }), true);
  assert.equal(isOAuthCancellation({ code: 'auth/cancelled-popup-request' }), true);
  assert.equal(isOAuthCancellation({ code: 'auth/network-request-failed' }), false);
});

test('una cancelación libera el proveedor para el siguiente intento', async () => {
  const attempts = [];
  const coordinator = createOAuthCoordinator({
    providers: { Facebook: 'facebook', Google: 'google' },
    signIn: async (_provider, name) => {
      attempts.push(name);
      if (name === 'Facebook') {
        const error = new Error('cancelled');
        error.code = 'auth/popup-closed-by-user';
        throw error;
      }
      return { user: { uid: 'google-user' } };
    },
    waitForAuth: async () => {}
  });

  assert.equal((await coordinator.login('Facebook')).status, 'cancelled');
  assert.equal(coordinator.getActiveProvider(), null);
  assert.equal((await coordinator.login('Google')).status, 'success');
  assert.deepEqual(attempts, ['Facebook', 'Google']);
});

test('Google cancelado no impide un login posterior con Facebook', async () => {
  const attempts = [];
  const coordinator = createOAuthCoordinator({
    providers: { Facebook: 'facebook', Google: 'google' },
    signIn: async (_provider, name) => {
      attempts.push(name);
      if (name === 'Google') {
        const error = new Error('cancelled');
        error.code = 'auth/cancelled-popup-request';
        throw error;
      }
      return { user: { uid: 'facebook-user' } };
    },
    waitForAuth: async () => {}
  });

  assert.equal((await coordinator.login('Google')).status, 'cancelled');
  assert.equal(coordinator.getActiveProvider(), null);
  assert.equal((await coordinator.login('Facebook')).status, 'success');
  assert.deepEqual(attempts, ['Google', 'Facebook']);
});

test('bloquea un segundo popup mientras otro proveedor está activo', async () => {
  let release;
  const firstAttempt = new Promise(resolve => { release = resolve; });
  const coordinator = createOAuthCoordinator({
    providers: { Google: 'google', Facebook: 'facebook' },
    signIn: async () => firstAttempt,
    waitForAuth: async () => {}
  });

  const google = coordinator.login('Google');
  const facebook = await coordinator.login('Facebook');
  assert.deepEqual(facebook, { status: 'busy', provider: 'Google' });
  release({ user: { uid: 'google-user' } });
  assert.equal((await google).status, 'success');
});
