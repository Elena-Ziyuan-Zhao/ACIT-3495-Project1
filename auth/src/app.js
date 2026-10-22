'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,50}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const ISSUER = 'auth-service';
// Compared against when the user does not exist, so an unknown username takes
// as long as a wrong password and response time does not reveal which it was.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 10);

function isValidLoginBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const { username, password } = body;
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return false;
  }
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return false;
  }
  return true;
}

function createApp({ db, config, logger }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  // One log line per request: method, path, status, duration. No headers, no bodies.
  app.use((req, res, next) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
      });
    });
    next();
  });

  app.post('/login', async (req, res, next) => {
    try {
      if (!isValidLoginBody(req.body)) {
        logger.warn('login failed', { reason: 'invalid input' });
        return res.status(400).json({ error: 'invalid input' });
      }

      const { username, password } = req.body;
      let user;
      try {
        user = await db.findUserByUsername(username);
      } catch (err) {
        logger.error('database error', { operation: 'findUserByUsername', message: err.message });
        return res.status(503).json({ error: 'auth database unavailable' });
      }

      const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
      if (!user) {
        logger.warn('login failed', { username, reason: 'unknown user' });
        return res.status(401).json({ error: 'invalid credentials' });
      }
      if (!passwordMatches) {
        logger.warn('login failed', { username, reason: 'wrong password' });
        return res.status(401).json({ error: 'invalid credentials' });
      }

      const token = jwt.sign({ username: user.username }, config.jwtSecret, {
        subject: String(user.id),
        issuer: ISSUER,
        expiresIn: config.expiresInSeconds,
      });

      logger.info('login succeeded', { username });
      return res.status(200).json({ token, expires_in: config.expiresInSeconds });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/verify', (req, res) => {
    const header = req.get('authorization');
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      logger.warn('verify failed', { reason: 'missing or malformed authorization header' });
      return res.status(401).json({ error: 'unauthorized' });
    }

    const token = header.slice('Bearer '.length).trim();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
    } catch (err) {
      logger.warn('verify failed', { reason: err.message });
      return res.status(401).json({ error: 'unauthorized' });
    }

    return res.status(200).json({ user: { id: Number(payload.sub), username: payload.username } });
  });

  app.get('/health', async (req, res) => {
    try {
      await db.ping();
      return res.status(200).json({ status: 'ok', db: 'up' });
    } catch (err) {
      logger.warn('health check failed', { message: err.message });
      return res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use((req, res) => {
    return res.status(404).json({ error: 'not found' });
  });

  // Final error handler: never leak stack traces or internal details.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const badBody =
      err &&
      (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' || err.status === 400);
    if (badBody) {
      return res.status(400).json({ error: 'invalid input' });
    }
    logger.error('internal error', { message: err.message });
    return res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp, ISSUER };
