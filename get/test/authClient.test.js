'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createAuthClient, AuthUnavailableError } = require('../src/authClient');
const { listen } = require('./helpers');

// Fake auth-service that follows the contract in auth/README.md.
function fakeAuthService(req, res) {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/login') {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* invalid JSON */ }
      if (typeof body.username !== 'string' || typeof body.password !== 'string') {
        res.statusCode = 400;
        return res.end('{"error":"invalid input"}');
      }
      if (body.username === 'demo' && body.password === 'correct-password') {
        return res.end('{"token":"t1","expires_in":120}');
      }
      res.statusCode = 401;
      return res.end('{"error":"invalid credentials"}');
    }
    if (req.method === 'GET' && req.url === '/verify') {
      if (req.headers.authorization === 'Bearer t1') return res.end('{"user":{"id":1,"username":"demo"}}');
      res.statusCode = 401;
      return res.end('{"error":"unauthorized"}');
    }
    if (req.url === '/boom') {
      res.statusCode = 500;
      return res.end('{"error":"internal error"}');
    }
    res.statusCode = 404;
    return res.end('{"error":"not found"}');
  });
}

test('login returns token and expiry on success', async (t) => {
  const srv = await listen(fakeAuthService);
  t.after(srv.close);
  const client = createAuthClient({ baseUrl: `${srv.url}/` });
  assert.deepEqual(await client.login('demo', 'correct-password'), { token: 't1', expiresIn: 120 });
});

test('login returns null on bad credentials', async (t) => {
  const srv = await listen(fakeAuthService);
  t.after(srv.close);
  const client = createAuthClient({ baseUrl: srv.url });
  assert.equal(await client.login('demo', 'wrong-password'), null);
});

test('verify returns the user for a valid token and null otherwise', async (t) => {
  const srv = await listen(fakeAuthService);
  t.after(srv.close);
  const client = createAuthClient({ baseUrl: srv.url });
  assert.deepEqual(await client.verify('t1'), { id: 1, username: 'demo' });
  assert.equal(await client.verify('forged'), null);
});

test('unreachable auth-service throws AuthUnavailableError', async () => {
  const client = createAuthClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 500 });
  await assert.rejects(client.verify('t1'), AuthUnavailableError);
  await assert.rejects(client.login('demo', 'correct-password'), AuthUnavailableError);
});

test('5xx from auth-service throws AuthUnavailableError', async (t) => {
  const srv = await listen(fakeAuthService);
  t.after(srv.close);
  const client = createAuthClient({ baseUrl: `${srv.url}/boom` });
  await assert.rejects(client.verify('t1'), AuthUnavailableError);
});
