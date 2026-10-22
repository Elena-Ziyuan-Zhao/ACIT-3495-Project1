'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp, ISSUER } = require('../src/app');

// All values here are obviously fake and exist only for the tests.
const JWT_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef';
const OTHER_SECRET = 'another-test-secret-0123456789abcdef01234567';
const CONFIG = { jwtSecret: JWT_SECRET, expiresInSeconds: 3600 };
const silentLogger = { info() {}, warn() {}, error() {} };

const fakeDb = {
  async findUserByUsername() {
    return null;
  },
  async ping() {},
};

function makeApp() {
  return createApp({ db: fakeDb, config: CONFIG, logger: silentLogger });
}

test('GET /verify without an Authorization header returns 401', async () => {
  const res = await request(makeApp()).get('/verify');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});

test('GET /verify with a garbage token returns 401', async () => {
  const res = await request(makeApp())
    .get('/verify')
    .set('Authorization', 'Bearer this-is-not-a-jwt');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});

test('GET /verify with a token signed with another secret returns 401', async () => {
  const token = jwt.sign({ username: 'alice' }, OTHER_SECRET, {
    subject: '1',
    issuer: ISSUER,
    expiresIn: 60,
  });
  const res = await request(makeApp()).get('/verify').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});

test('GET /verify with an expired token returns 401', async () => {
  const token = jwt.sign({ username: 'alice' }, JWT_SECRET, {
    subject: '1',
    issuer: ISSUER,
    expiresIn: -60,
  });
  const res = await request(makeApp()).get('/verify').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});

test('GET /verify with a wrong issuer returns 401', async () => {
  const token = jwt.sign({ username: 'alice' }, JWT_SECRET, {
    subject: '1',
    issuer: 'someone-else',
    expiresIn: 60,
  });
  const res = await request(makeApp()).get('/verify').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});
