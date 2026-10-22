'use strict';

const { MongoClient } = require('mongodb');
const { createApp } = require('./app');
const { createAuthClient } = require('./authClient');
const { createStatsReader } = require('./stats');
const { createLogger } = require('./logger');

function readConfig(env = process.env) {
  return {
    port: Number.parseInt(env.PORT, 10) || 8081,
    mongoUri: env.MONGO_URI,
    authUrl: env.AUTH_URL || 'http://auth-service:3000',
    cacheTtlMs: Number.parseInt(env.CACHE_TTL_MS, 10) || 0,
    cookieSecure: env.COOKIE_SECURE === 'true',
    timeZone: env.DISPLAY_TIMEZONE || 'America/Vancouver',
  };
}

function main() {
  const logger = createLogger();
  const config = readConfig();

  if (!config.mongoUri) {
    logger.error('MONGO_URI is required');
    process.exit(1);
  }

  let client;
  try {
    // The driver connects lazily and reconnects on its own if MongoDB restarts.
    client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 10 });
  } catch (err) {
    logger.error('invalid MONGO_URI', { message: err.message });
    process.exit(1);
  }
  const db = client.db(); // database name comes from the URI (analytics_db)

  const app = createApp({
    auth: createAuthClient({ baseUrl: config.authUrl }),
    getStats: createStatsReader({ collection: db.collection('route_stats'), ttlMs: config.cacheTtlMs }),
    pingDb: () => db.command({ ping: 1 }),
    logger,
    config,
  });

  const server = app.listen(config.port, () => {
    logger.info('show-results-app listening', { port: config.port, cache_ttl_ms: config.cacheTtlMs });
  });

  const shutdown = (signal) => {
    logger.info('shutting down', { signal });
    server.close(() => {
      client.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main();
}

module.exports = { readConfig };
