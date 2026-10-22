'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

const LOGGED_IN = 'token=valid-token';

test('health returns 200 when the database is up and 503 when it is down', async () => {
  const t = await startApp();
  try {
    assert.equal((await t.request('/health')).status, 200);
    t.db.down = true;
    assert.equal((await t.request('/health')).status, 503);
  } finally { await t.close(); }
});

test('protected page redirects to /login without a token', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  } finally { await t.close(); }
});

test('an invalid token is cleared and redirected to /login', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/', { cookie: 'token=forged' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  } finally { await t.close(); }
});

test('wrong password is rejected with 401', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/login', { method: 'POST', form: { username: 'demo', password: 'nope-nope' } });
    assert.equal(res.status, 401);
    assert.match(res.text, /Invalid username or password/);
  } finally { await t.close(); }
});

test('successful login sets an HttpOnly cookie and redirects home', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/login', { method: 'POST', form: { username: 'demo', password: 'correct-password' } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /token=valid-token/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  } finally { await t.close(); }
});

test('logged-in user sees the form with routes', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/', { cookie: LOGGED_IN });
    assert.equal(res.status, 200);
    assert.match(res.text, /Logged in as <strong>demo<\/strong>/);
    assert.match(res.text, /Burnaby → BCIT/);
  } finally { await t.close(); }
});

test('a valid entry is saved for the logged-in user', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/entries', { method: 'POST', cookie: LOGGED_IN, form: { route_id: '1', duration_minutes: '35' } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/?ok=1');
    assert.deepEqual(t.db.entries, [{ username: 'demo', routeId: 1, duration: 35 }]);
  } finally { await t.close(); }
});

test('invalid duration is rejected and nothing is saved', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/entries', { method: 'POST', cookie: LOGGED_IN, form: { route_id: '1', duration_minutes: '9999' } });
    assert.equal(res.status, 400);
    assert.match(res.text, /between 1 and 600/);
    assert.equal(t.db.entries.length, 0);
  } finally { await t.close(); }
});

test('unknown route is rejected', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/entries', { method: 'POST', cookie: LOGGED_IN, form: { route_id: '99', duration_minutes: '20' } });
    assert.equal(res.status, 400);
    assert.match(res.text, /Route does not exist/);
    assert.equal(t.db.entries.length, 0);
  } finally { await t.close(); }
});

test('entries cannot be posted without logging in', async () => {
  const t = await startApp();
  try {
    const res = await t.request('/entries', { method: 'POST', form: { route_id: '1', duration_minutes: '20' } });
    assert.equal(res.status, 302);
    assert.equal(t.db.entries.length, 0);
  } finally { await t.close(); }
});

test('database outage shows a 503 page instead of crashing', async () => {
  const t = await startApp();
  try {
    t.db.down = true;
    const res = await t.request('/entries', { method: 'POST', cookie: LOGGED_IN, form: { route_id: '1', duration_minutes: '20' } });
    assert.equal(res.status, 503);
    assert.match(res.text, /database is temporarily unavailable/);
    t.db.down = false;
    assert.equal((await t.request('/', { cookie: LOGGED_IN })).status, 200, 'recovers once the database is back');
  } finally { await t.close(); }
});

test('auth-service outage shows a 503 page on login and on protected pages', async () => {
  const t = await startApp();
  try {
    t.auth.down = true;
    const login = await t.request('/login', { method: 'POST', form: { username: 'demo', password: 'correct-password' } });
    assert.equal(login.status, 503);
    const home = await t.request('/', { cookie: LOGGED_IN });
    assert.equal(home.status, 503);
    assert.match(home.text, /authentication service is temporarily unavailable/);
  } finally { await t.close(); }
});

test('logs never contain passwords or tokens', async () => {
  const t = await startApp();
  try {
    await t.request('/login', { method: 'POST', form: { username: 'demo', password: 'correct-password' } });
    await t.request('/', { cookie: LOGGED_IN });
    const all = JSON.stringify(t.logger.lines);
    assert.doesNotMatch(all, /correct-password/);
    assert.doesNotMatch(all, /valid-token/);
  } finally { await t.close(); }
});