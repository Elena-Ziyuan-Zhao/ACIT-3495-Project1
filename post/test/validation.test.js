'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEntry } = require('../src/validation');

test('accepts a valid route and duration', () => {
  assert.deepEqual(validateEntry({ route_id: '2', duration_minutes: '45' }), { ok: true, routeId: 2, duration: 45 });
});

test('accepts the boundary values 1 and 600', () => {
  assert.equal(validateEntry({ route_id: '1', duration_minutes: '1' }).ok, true);
  assert.equal(validateEntry({ route_id: '1', duration_minutes: '600' }).ok, true);
});

test('rejects durations outside 1-600', () => {
  for (const d of ['0', '601', '99999']) {
    assert.equal(validateEntry({ route_id: '1', duration_minutes: d }).ok, false, d);
  }
});

test('rejects non-integer durations', () => {
  for (const d of ['', 'abc', '12.5', '-3', '1e2', '5; DROP TABLE users']) {
    assert.equal(validateEntry({ route_id: '1', duration_minutes: d }).ok, false, d);
  }
});

test('rejects missing or invalid route ids', () => {
  for (const r of [undefined, '', '0', 'abc', '1.5', '-1']) {
    assert.equal(validateEntry({ route_id: r, duration_minutes: '30' }).ok, false, String(r));
  }
});

test('rejects non-string input such as arrays', () => {
  assert.equal(validateEntry({ route_id: ['1'], duration_minutes: ['30'] }).ok, false);
});