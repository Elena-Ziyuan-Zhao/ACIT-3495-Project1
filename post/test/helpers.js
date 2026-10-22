'use strict';

const { createApp } = require('../src/app');

const ROUTES = [
  { id: 1, origin: 'Burnaby', destination: 'BCIT' },
  { id: 2, origin: 'Richmond', destination: 'BCIT' },
];

// In-memory stand-in for the MySQL layer. Set `down = true` to simulate an outage.
function fakeDb() {
  const entries = [];
  const db = {
    down: false,
    entries,
    check() {
      if (db.down) {
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }
    },
    async ping() { db.check(); },
    async listRoutes() { db.check(); return ROUTES; },
    async routeExists(id) { db.check(); return ROUTES.some((r) => r.id === id); },
    async recentEntries(username) {
      db.check();
      return entries.filter((e) => e.username === username).slice(-5).reverse().map((e) => {
        const route = ROUTES.find((r) => r.id === e.routeId);
        return { ...route, duration_minutes: e.duration, created_at: new Date() };
      });
    },
    async insertEntry(username, routeId, duration) { db.check(); entries.push({ username, routeId, duration }); },
    async close() {},
  };
  return db;
}

// Stand-in for auth-service: password "correct-password" works, token "valid-token" is valid.
function fakeAuth() {
  const auth = {
    down: false,
    async login(username, password) {
      if (auth.down) throw new Error('fetch failed');
      return password === 'correct-password'
        ? { ok: true, token: 'valid-token', expiresIn: 3600 }
        : { ok: false };
    },
    async verify(token) {
      if (auth.down) throw new Error('fetch failed');
      return token === 'valid-token' ? { username: 'demo' } : null;
    },
  };
  return auth;
}

function silentLogger() {
  const lines = [];
  const write = (level) => (msg, fields) => lines.push({ level, msg, ...fields });
  return { lines, info: write('info'), warn: write('warn'), error: write('error') };
}

// Starts the app on a random free port; returns helpers for making requests.
async function startApp(overrides = {}) {
  const db = overrides.db || fakeDb();
  const auth = overrides.auth || fakeAuth();
  const logger = overrides.logger || silentLogger();
  const app = createApp({ db, auth, logger });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = 'GET', form, cookie } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    return { status: res.status, headers: res.headers, text: await res.text() };
  }

  return {
    db, auth, logger, request,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { fakeDb, fakeAuth, silentLogger, startApp, ROUTES };