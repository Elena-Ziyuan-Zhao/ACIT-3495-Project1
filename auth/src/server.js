'use strict';

const { createApp, ISSUER } = require('./app');
const { createDb } = require('./db');
const { createLogger } = require('./logger');

const SEED_MAX_ATTEMPTS = 10;
const SEED_RETRY_MS = 3000;

function readConfig(env = process.env) {
  return {
    port: Number.parseInt(env.PORT, 10) || 3000,
    jwtSecret: env.JWT_SECRET,
    expiresInSeconds: Number.parseInt(env.JWT_EXPIRES_IN_SECONDS, 10) || 3600,
    db: {
      host: env.DB_HOST || 'mysql-db',
      port: Number.parseInt(env.DB_PORT, 10) || 3306,
      database: env.DB_NAME || 'commute_db',
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    seedUsername: env.AUTH_SEED_USERNAME,
    seedPassword: env.AUTH_SEED_PASSWORD,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// MySQL may still be starting when the auth-service boots, so the seed is
// retried. After the last attempt the error is logged and the server keeps
// running (the health endpoint will report the database as down).
async function seedWithRetry(db, config, logger) {
  for (let attempt = 1; attempt <= SEED_MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.seedUser(config.seedUsername, config.seedPassword);
      logger.info('seed user ready', { username: config.seedUsername });
      return;
    } catch (err) {
      logger.warn('seed attempt failed', { attempt, message: err.message });
    }
    if (attempt < SEED_MAX_ATTEMPTS) {
      await sleep(SEED_RETRY_MS);
    }
  }
  logger.error('could not seed user, giving up', { attempts: SEED_MAX_ATTEMPTS });
}

async function main() {
  const logger = createLogger();
  const config = readConfig();

  if (typeof config.jwtSecret !== 'string' || config.jwtSecret.length < 32) {
    logger.error('JWT_SECRET is missing or shorter than 32 characters, refusing to start');
    process.exit(1);
  }

  const db = createDb(config.db);
  const app = createApp({ db, config, logger });

  const server = app.listen(config.port, () => {
    logger.info('auth-service started', { port: config.port, issuer: ISSUER });
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('auth-service stopping', { signal });
    server.closeIdleConnections();
    server.close(() => {
      db.close()
        .catch((err) => logger.error('failed to close database pool', { message: err.message }))
        .then(() => process.exit(0));
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  // Seed after listening, so /health answers and signals are handled while MySQL is still starting.
  if (config.seedUsername && config.seedPassword) {
    await seedWithRetry(db, config, logger);
  }
}

main().catch((err) => {
  const logger = createLogger();
  logger.error('fatal startup error', { message: err && err.message });
  process.exit(1);
});
