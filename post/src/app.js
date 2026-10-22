'use strict';

const express = require('express');
const { validateEntry } = require('./validation');
const views = require('./views');

const COOKIE_NAME = 'token';

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieHeader(value, maxAgeSeconds) {
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

const DB_DOWN = 'The database is temporarily unavailable. Please try again shortly.';
const AUTH_DOWN = 'The authentication service is temporarily unavailable. Please try again shortly.';

function createApp({ db, auth, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // One log line per request. No headers, cookies or bodies.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
      });
    });
    next();
  });

  // Every protected route asks auth-service whether the token is valid.
  async function requireAuth(req, res, next) {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return res.redirect('/login');
    try {
      const user = await auth.verify(token);
      if (!user) {
        res.setHeader('Set-Cookie', cookieHeader('', 0));
        return res.redirect('/login');
      }
      req.user = user;
      return next();
    } catch (err) {
      logger.error('auth-service unreachable', { message: err.message });
      return res.status(503).send(views.unavailablePage(AUTH_DOWN));
    }
  }

  async function renderEntryPage(req, res, { status = 200, error = '', success = '' } = {}) {
    try {
      const [routes, recent] = await Promise.all([
        db.listRoutes(),
        db.recentEntries(req.user.username),
      ]);
      return res.status(status).send(views.entryPage({
        username: req.user.username, routes, recent, error, success,
      }));
    } catch (err) {
      logger.error('database error', { operation: 'renderEntryPage', code: err.code, message: err.message });
      return res.status(503).send(views.unavailablePage(DB_DOWN));
    }
  }

  app.get('/health', async (req, res) => {
    try {
      await db.ping();
      return res.status(200).json({ status: 'ok', db: 'up' });
    } catch (err) {
      logger.warn('health check failed', { code: err.code, message: err.message });
      return res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.get('/login', (req, res) => res.send(views.loginPage()));

  app.post('/login', async (req, res) => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).send(views.loginPage('Please enter a username and password.'));
    }
    try {
      const result = await auth.login(username, password);
      if (!result.ok) {
        logger.warn('login rejected', { username });
        return res.status(401).send(views.loginPage('Invalid username or password.'));
      }
      res.setHeader('Set-Cookie', cookieHeader(encodeURIComponent(result.token), result.expiresIn));
      logger.info('login succeeded', { username });
      return res.redirect('/');
    } catch (err) {
      logger.error('auth-service unreachable', { operation: 'login', message: err.message });
      return res.status(503).send(views.loginPage(AUTH_DOWN));
    }
  });

  app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    res.redirect('/login');
  });

  app.get('/', requireAuth, (req, res) => {
    renderEntryPage(req, res, { success: req.query.ok ? 'Commute saved.' : '' });
  });

  app.post('/entries', requireAuth, async (req, res) => {
    const input = validateEntry(req.body);
    if (!input.ok) {
      logger.warn('entry rejected', { user: req.user.username, reason: input.error });
      return renderEntryPage(req, res, { status: 400, error: input.error });
    }
    try {
      if (!(await db.routeExists(input.routeId))) {
        logger.warn('entry rejected', { user: req.user.username, reason: 'unknown route', route_id: input.routeId });
        return renderEntryPage(req, res, { status: 400, error: 'Route does not exist.' });
      }
      await db.insertEntry(req.user.username, input.routeId, input.duration);
      logger.info('commute saved', { user: req.user.username, route_id: input.routeId, duration: input.duration });
      return res.redirect('/?ok=1');
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        logger.warn('entry rejected', { user: req.user.username, reason: 'foreign key', code: err.code });
        return renderEntryPage(req, res, { status: 400, error: 'Unknown user or route.' });
      }
      logger.error('database error', { operation: 'insertEntry', code: err.code, message: err.message });
      return res.status(503).send(views.unavailablePage(DB_DOWN));
    }
  });

  app.use((req, res) => res.status(404).send(views.unavailablePage('Page not found.')));

  // Never leak stack traces.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.status === 400) {
      return res.status(400).send(views.unavailablePage('Invalid request.'));
    }
    logger.error('internal error', { message: err.message });
    return res.status(500).send(views.unavailablePage('Something went wrong.'));
  });

  return app;
}

module.exports = { createApp, readCookie };