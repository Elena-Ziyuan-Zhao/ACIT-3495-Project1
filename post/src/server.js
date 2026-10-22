'use strict';

const { createApp } = require('./app');
const { createDb } = require('./db');
const { createAuthClient } = require('./authClient');
const { createLogger } = require('./logger');

function readConfig(env = process.env) {
  return {
    port: Number.parseInt(env.PORT, 10) || 8080,
    authUrl: env.AUTH_URL || 'http://auth-service:3000',
    db: {
      host: env.MYSQL_HOST || 'mysql-db',
      port: Number.parseInt(env.MYSQL_PORT, 10) || 3306,
      database: env.MYSQL_DATABASE || 'commute_db',
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
    },
  };
}

function main() {
  const logger = createLogger();
  const config = readConfig();

  if (!config.db.user || !config.db.password) {
    logger.error('MYSQL_USER / MYSQL_PASSWORD are not set, refusing to start');
    process.exit(1);
  }

  const db = createDb(config.db);
  const auth = createAuthClient(config.authUrl);
  const app = createApp({ db, auth, logger });

  const server = app.listen(config.port, () => {
    logger.info('enter-data app started', { port: config.port, auth_url: config.authUrl, db_host: config.db.host });
  });

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info('enter-data app stopping', { signal });
    server.closeIdleConnections();
    server.close(() => {
      db.close()
        .catch((err) => logger.error('failed to close database pool', { message: err.message }))
        .then(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main();