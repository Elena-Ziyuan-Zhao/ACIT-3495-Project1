'use strict';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');

const JWT_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef';
const CONFIG = { jwtSecret: JWT_SECRET, expiresInSeconds: 3600 };
const silentLogger = { info() {}, warn() {}, error() {} };

const fakeDb = {
  async findUserByUsername() {
    return null;
  },
  async ping() {},
};

const brokenDb = {
  async findUserByUsername() {
    return null;
  },
  async ping() {
    throw new Error('database is down');
  },
};

function makeApp(db) {
  return createApp({ db, config: CONFIG, logger: silentLogger });
}

test('GET /health returns 200 when the database answers', async () => {
  const res = await request(makeApp(fakeDb)).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', db: 'up' });
});

test('GET /health returns 503 when the database is down', async () => {
  const res = await request(makeApp(brokenDb)).get('/health');
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, { status: 'degraded', db: 'down' });
});

test('an unknown route returns 404 not found', async () => {
  const res = await request(makeApp(fakeDb)).get('/does-not-exist');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'not found' });
});

test('responses do not carry the x-powered-by header', async () => {
  const res = await request(makeApp(fakeDb)).get('/health');
  assert.equal(res.headers['x-powered-by'], undefined);
});
