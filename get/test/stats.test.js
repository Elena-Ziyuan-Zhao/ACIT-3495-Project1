'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createStatsReader } = require('../src/stats');
const { fakeCollection } = require('./helpers');

const ROWS = [{ route_name: 'Burnaby to BCIT', total_trips: 1 }];

test('without a TTL every call queries MongoDB', async () => {
  const counter = { calls: 0 };
  const getStats = createStatsReader({ collection: fakeCollection(ROWS, counter), ttlMs: 0 });
  await getStats();
  await getStats();
  assert.equal(counter.calls, 2);
});

test('with a TTL results are reused until they expire', async () => {
  const counter = { calls: 0 };
  let clock = 1000;
  const getStats = createStatsReader({ collection: fakeCollection(ROWS, counter), ttlMs: 5000, now: () => clock });
  assert.deepEqual(await getStats(), ROWS);
  clock += 4000;
  await getStats();
  assert.equal(counter.calls, 1);
  clock += 2000;
  await getStats();
  assert.equal(counter.calls, 2);
});

test('concurrent calls share one query', async () => {
  const counter = { calls: 0 };
  const getStats = createStatsReader({ collection: fakeCollection(ROWS, counter), ttlMs: 5000 });
  await Promise.all([getStats(), getStats(), getStats()]);
  assert.equal(counter.calls, 1);
});
