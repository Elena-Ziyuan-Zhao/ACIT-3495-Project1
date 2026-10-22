'use strict';

const express = require('express');
const views = require('./views');

const COOKIE_NAME = 'sr_token';
const USERNAME_MAX = 50;
const PASSWORD_MAX = 128;

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// deps:
//   auth      { login(username, password), verify(token) }  (see authClient.js)
//   getStats  async () => route_stats documents
//   pingDb    async () => resolves if MongoDB is reachable
//   logger    { info, warn, error }
//   config    { cookieSecure, timeZone }
function createApp({ auth, getStats, pingDb, logger, config = {} }) {
  const { cookieSecure = false, timeZone = 'America/Vancouver' } = config;
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' };

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

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

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // Token comes from the session cookie (browser) or a Bearer header (API / load tests).
  function tokenFrom(req) {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) return header.slice(7).trim() || null;
    return readCookie(req.headers.cookie, COOKIE_NAME);
  }

  function requireUser({ api }) {
    return async (req, res, next) => {
      const deny = () =>
        api ? res.status(401).json({ error: 'unauthorized' }) : res.redirect(302, '/login');

      const token = tokenFrom(req);
      if (!token) return deny();

      let user;
      try {
        user = await auth.verify(token);
      } catch (err) {
        logger.error('auth-service unavailable', { message: err.message });
        return api
          ? res.status(503).json({ error: 'auth unavailable' })
          : res
              .status(503)
              .send(views.errorPage('The login service is unavailable right now. Please try again in a moment.'));
      }

      if (!user) {
        res.clearCookie(COOKIE_NAME, cookieOptions);
        return deny();
      }
      req.user = user;
      return next();
    };
  }

  app.get('/health', async (req, res) => {
    try {
      await pingDb();
      res.json({ status: 'ok', db: 'up' });
    } catch (err) {
      logger.warn('health check: database down', { message: err.message });
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.get('/login', (req, res) => {
    res.send(views.loginPage());
  });

  app.post('/login', async (req, res) => {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password || username.length > USERNAME_MAX || password.length > PASSWORD_MAX) {
      logger.warn('login rejected', { reason: 'invalid input' });
      return res.status(400).send(views.loginPage({ error: 'Enter a username and password.', username }));
    }

    let session;
    try {
      session = await auth.login(username, password);
    } catch (err) {
      logger.error('auth-service unavailable', { message: err.message });
      return res.status(503).send(
        views.loginPage({ error: 'The login service is unavailable right now. Please try again shortly.', username })
      );
    }

    if (!session) {
      logger.warn('login failed', { reason: 'bad credentials' });
      return res.status(401).send(views.loginPage({ error: 'Invalid username or password.', username }));
    }

    res.cookie(COOKIE_NAME, session.token, { ...cookieOptions, maxAge: session.expiresIn * 1000 });
    logger.info('login succeeded', { username });
    return res.redirect(303, '/');
  });

  app.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.redirect(303, '/login');
  });

  app.get('/', requireUser({ api: false }), async (req, res) => {
    try {
      const stats = await getStats();
      res.send(views.resultsPage({ stats, user: req.user, timeZone }));
    } catch (err) {
      logger.error('failed to read route_stats', { message: err.message });
      res
        .status(503)
        .send(
          views.errorPage(
            'Results are temporarily unavailable because the analytics database could not be reached. Please try again shortly.',
            req.user
          )
        );
    }
  });

  app.get('/api/stats', requireUser({ api: true }), async (req, res) => {
    try {
      res.json({ stats: await getStats() });
    } catch (err) {
      logger.error('failed to read route_stats', { message: err.message });
      res.status(503).json({ error: 'database unavailable' });
    }
  });

  app.use((req, res) => {
    res.status(404).send(views.errorPage('Page not found.'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    logger.error('request failed', { status, message: err.message });
    res.status(status).send(views.errorPage(status === 500 ? 'Something went wrong.' : 'Bad request.'));
  });

  return app;
}

module.exports = { createApp, readCookie, COOKIE_NAME };
