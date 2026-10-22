'use strict';

// Reads analytics_db.route_stats. With ttlMs > 0 the result is kept in memory
// for that long (and concurrent requests share one query), which is one of
// the plan's two load-test improvements. ttlMs = 0 disables the cache.
function createStatsReader({ collection, ttlMs = 0, now = Date.now }) {
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;

  function load() {
    return collection
      .find({}, { projection: { _id: 0 } })
      .sort({ route_name: 1 })
      .toArray();
  }

  return async function getStats() {
    if (ttlMs <= 0) return load();
    if (cached && now() - cachedAt < ttlMs) return cached;
    if (!inFlight) {
      inFlight = load()
        .then((rows) => {
          cached = rows;
          cachedAt = now();
          return rows;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}

module.exports = { createStatsReader };
