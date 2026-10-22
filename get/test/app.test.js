'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createApp, readCookie, COOKIE_NAME } = require('../src/app');
const { AuthUnavailableError } = require('../src/authClient');
const { silentLogger, listen } = require('./helpers');

// All values here are fake and exist only for the tests.
const GOOD_TOKEN = 'good-token';
const STATS = [
  {
    route_name: 'Burnaby to BCIT',
    min_duration: 22,
    max_duration: 65,
    avg_duration: 38.5,
    total_trips: 14,
    last_updated: new Date('2026-10-22T19:00:00Z'),
  },
];

function fakeAuth({ down = false } = {}) {
  return {
    async login(username, password) {
      if (down) throw new AuthUnavailableError('down');
      return username === 'demo' && password === 'correct-password' ? { token: GOOD_TOKEN, expiresIn: 3600 } : null;
    },
    async verify(token) {
      if (down) throw new AuthUnavailableError('down');
      return token === GOOD_TOKEN ? { id: 1, username: 'demo' } : null;
    },
  };
}

async function start(overrides = {}) {
  const app = createApp({
    auth: fakeAuth(),
    getStats: async () => STATS,
    pingDb: async () => {},
    logger: silentLogger,
    ...overrides,
  });
  return listen(app);
}

const authCookie = { Cookie: `${COOKIE_NAME}=${GOOD_TOKEN}` };
const form = (fields) => ({
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

test('GET /health returns 200 when MongoDB answers', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', db: 'up' });
});

test('GET /health returns 503 when MongoDB is down', async (t) => {
  const srv = await start({ pingDb: async () => { throw new Error('no mongo'); } });
  t.after(srv.close);
  const res = await fetch(`${srv.url}/health`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'degraded', db: 'down' });
});

test('GET / without a session redirects to /login', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('GET / with an invalid token clears the cookie and redirects', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/`, { redirect: 'manual', headers: { Cookie: `${COOKIE_NAME}=forged` } });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('set-cookie'), new RegExp(`${COOKIE_NAME}=;`));
});

test('GET / with a valid session shows the stats table', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/`, { headers: authCookie });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Burnaby to BCIT/);
  assert.match(html, /38\.5/);
  assert.match(html, /Logged in as <strong>demo<\/strong>/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('route names are HTML-escaped', async (t) => {
  const srv = await start({ getStats: async () => [{ ...STATS[0], route_name: '<script>alert(1)</script>' }] });
  t.after(srv.close);
  const html = await (await fetch(`${srv.url}/`, { headers: authCookie })).text();
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('GET / shows an empty-state message when there are no stats', async (t) => {
  const srv = await start({ getStats: async () => [] });
  t.after(srv.close);
  const html = await (await fetch(`${srv.url}/`, { headers: authCookie })).text();
  assert.match(html, /No statistics yet/);
});

test('GET / returns 503 with a friendly page when MongoDB is down', async (t) => {
  const srv = await start({ getStats: async () => { throw new Error('no mongo'); } });
  t.after(srv.close);
  const res = await fetch(`${srv.url}/`, { headers: authCookie });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /temporarily unavailable/);
});

test('GET / returns 503 when auth-service is down', async (t) => {
  const srv = await start({ auth: fakeAuth({ down: true }) });
  t.after(srv.close);
  const res = await fetch(`${srv.url}/`, { headers: authCookie });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /login service is unavailable/);
});

test('POST /login with good credentials sets an HttpOnly cookie and redirects to /', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/login`, form({ username: 'demo', password: 'correct-password' }));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`${COOKIE_NAME}=${GOOD_TOKEN}`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('POST /login with bad credentials returns 401 and no cookie', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/login`, form({ username: 'demo', password: 'wrong-password' }));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(await res.text(), /Invalid username or password/);
});

test('POST /login with missing fields returns 400', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/login`, form({ username: 'demo' }));
  assert.equal(res.status, 400);
});

test('POST /login returns 503 when auth-service is down', async (t) => {
  const srv = await start({ auth: fakeAuth({ down: true }) });
  t.after(srv.close);
  const res = await fetch(`${srv.url}/login`, form({ username: 'demo', password: 'correct-password' }));
  assert.equal(res.status, 503);
});

test('POST /logout clears the cookie', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/logout`, { method: 'POST', redirect: 'manual', headers: authCookie });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/login');
  assert.match(res.headers.get('set-cookie'), new RegExp(`${COOKIE_NAME}=;`));
});

test('GET /api/stats accepts a Bearer token and returns JSON', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/api/stats`, { headers: { Authorization: `Bearer ${GOOD_TOKEN}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.stats[0].route_name, 'Burnaby to BCIT');
});

test('GET /api/stats without a token returns 401 JSON', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/api/stats`);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
});

test('unknown routes return 404', async (t) => {
  const srv = await start();
  t.after(srv.close);
  const res = await fetch(`${srv.url}/nope`);
  assert.equal(res.status, 404);
});

test('readCookie finds the named cookie', () => {
  assert.equal(readCookie('a=1; sr_token=abc; b=2', 'sr_token'), 'abc');
  assert.equal(readCookie('a=1', 'sr_token'), null);
  assert.equal(readCookie(undefined, 'sr_token'), null);
});
