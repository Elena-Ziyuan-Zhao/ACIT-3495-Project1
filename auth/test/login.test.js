'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');

// All values here are obviously fake and exist only for the tests.
const JWT_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef';
const CONFIG = { jwtSecret: JWT_SECRET, expiresInSeconds: 3600 };
const silentLogger = { info() {}, warn() {}, error() {} };

const ALICE_PASSWORD = 'test-password-123';
const alice = {
  id: 1,
  username: 'alice',
  password_hash: bcrypt.hashSync(ALICE_PASSWORD, 10),
};

function makeApp(db) {
  return createApp({ db, config: CONFIG, logger: silentLogger });
}

function fakeDb(users = []) {
  return {
    async findUserByUsername(username) {
      return users.find((u) => u.username === username) || null;
    },
    async ping() {},
  };
}

test('POST /login with valid credentials returns a token that GET /verify accepts', async () => {
  const app = makeApp(fakeDb([alice]));

  const login = await request(app)
    .post('/login')
    .send({ username: 'alice', password: ALICE_PASSWORD });

  assert.equal(login.status, 200);
  assert.equal(login.body.expires_in, 3600);
  assert.ok(typeof login.body.token === 'string' && login.body.token.length > 0);

  const verify = await request(app)
    .get('/verify')
    .set('Authorization', `Bearer ${login.body.token}`);

  assert.equal(verify.status, 200);
  assert.deepEqual(verify.body, { user: { id: 1, username: 'alice' } });
});

test('POST /login with a wrong password returns 401 invalid credentials', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app)
    .post('/login')
    .send({ username: 'alice', password: 'wrong-password-999' });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'invalid credentials' });
});

test('POST /login with an unknown user returns 401 with the same message', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app)
    .post('/login')
    .send({ username: 'nobody-here', password: ALICE_PASSWORD });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'invalid credentials' });
});

test('POST /login with a missing field returns 400 invalid input', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app).post('/login').send({ username: 'alice' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid input' });
});

test('POST /login with a too-short password returns 400 invalid input', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app).post('/login').send({ username: 'alice', password: 'short' });
  assert.strictEqual(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid input' });
});

test('POST /login with forbidden characters in the username returns 400 invalid input', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app)
    .post('/login')
    .send({ username: 'bad user!', password: ALICE_PASSWORD });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid input' });
});

test('POST /login with a non-JSON body returns 400 invalid input', async () => {
  const app = makeApp(fakeDb([alice]));
  const res = await request(app)
    .post('/login')
    .set('Content-Type', 'application/json')
    .send('this is not json at all');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'invalid input' });
});

test('POST /login when the database throws returns 503', async () => {
  const db = {
    async findUserByUsername() {
      throw new Error('connection refused');
    },
    async ping() {},
  };
  const app = makeApp(db);
  const res = await request(app)
    .post('/login')
    .send({ username: 'alice', password: ALICE_PASSWORD });
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { error: 'auth database unavailable' });
});
