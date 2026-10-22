const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 8080;

// 连接池：mysql2 会在每次查询时自动拿/重建连接，MySQL 挂掉再回来也能自动恢复
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-db',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'commute_db',
  waitForConnections: true,
  connectionLimit: 10,
});

// 结构化日志（JSON），不打印密码
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: 'post', msg, ...extra }));
}

const AUTH_URL = process.env.AUTH_URL || 'http://auth-service:3000';
const COOKIE_NAME = 'token';

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// 每个受保护的请求都去问 auth-service：这个 token 有效吗？
async function requireAuth(req, res, next) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return res.redirect('/login');

  try {
    const r = await fetch(`${AUTH_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (r.status === 401) {
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      return res.redirect('/login');
    }
    if (!r.ok) throw new Error(`auth responded ${r.status}`);
    const data = await r.json();
    req.user = { username: data.user.username };
    next();
  } catch (err) {
    log('error', 'auth service unreachable', { message: err.message });
    res.status(503).send(page(
      `<div class="alert alert-warning">Authentication service is temporarily unavailable. Please try again shortly.</div>`));
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commute Logger</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head><body class="bg-light"><div class="container py-5" style="max-width:640px">
<h1 class="h3 mb-4">Commute &amp; Traffic Time Logger</h1>
${body}
</div></body></html>`;
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    log('error', 'health check failed: database unreachable', { code: err.code });
    res.status(503).json({ status: 'db_unavailable' });
  }
});

async function renderForm(req, res, { status = 200, error = '', success = '' } = {}) {
  try {
    const [routes] = await pool.query('SELECT id, origin, destination FROM routes ORDER BY id');
    const [recent] = await pool.query(
      `SELECT r.origin, r.destination, c.duration_minutes, c.created_at
         FROM commute_logs c JOIN routes r ON c.route_id = r.id
        WHERE c.username = ? ORDER BY c.created_at DESC LIMIT 5`,
      [req.user.username]
    );

    const options = routes.map(r =>
      `<option value="${r.id}">${esc(r.origin)} → ${esc(r.destination)}</option>`).join('');
    const rows = recent.map(r =>
      `<tr><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${r.duration_minutes} min</td>
       <td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('');

    res.status(status).send(page(`
<form method="POST" action="/logout" class="d-flex justify-content-between align-items-center mb-3">
  <span class="text-muted">Logged in as <strong>${esc(req.user.username)}</strong></span>
  <button class="btn btn-sm btn-outline-secondary">Log out</button>
</form>
${error ? `<div class="alert alert-danger">${esc(error)}</div>` : ''}
${success ? `<div class="alert alert-success">${esc(success)}</div>` : ''}
<form method="POST" action="/entries" class="card card-body mb-4">
  <div class="mb-3">
    <label class="form-label">Route</label>
    <select name="route_id" class="form-select" required>${options}</select>
  </div>
  <div class="mb-3">
    <label class="form-label">Duration (minutes)</label>
    <input name="duration_minutes" type="number" min="1" max="600" step="1" class="form-control" required>
  </div>
  <button class="btn btn-primary">Save commute</button>
</form>
<h2 class="h5">Your recent trips</h2>
<table class="table table-sm"><tbody>${rows || '<tr><td class="text-muted">No trips yet</td></tr>'}</tbody></table>`));
  } catch (err) {
    log('error', 'failed to load form data', { code: err.code });
    res.status(503).send(page(
      `<div class="alert alert-warning">Database is temporarily unavailable. Please try again in a moment.</div>`));
  }
}

function loginPage(error = '') {
  return page(`
${error ? `<div class="alert alert-danger">${esc(error)}</div>` : ''}
<form method="POST" action="/login" class="card card-body">
  <div class="mb-3">
    <label class="form-label">Username</label>
    <input name="username" class="form-control" required autocomplete="username">
  </div>
  <div class="mb-3">
    <label class="form-label">Password</label>
    <input name="password" type="password" class="form-control" required autocomplete="current-password">
  </div>
  <button class="btn btn-primary">Log in</button>
</form>`);
}

app.get('/login', (req, res) => res.send(loginPage()));

app.post('/login', async (req, res) => {
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  try {
    const r = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 400 || r.status === 401) {
      log('warn', 'login rejected', { username });
      return res.status(401).send(loginPage('Invalid username or password.'));
    }
    if (!r.ok) throw new Error(`auth responded ${r.status}`);
    const { token, expires_in } = await r.json();
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expires_in || 3600}`);
    log('info', 'login succeeded', { username });
    res.redirect('/');
  } catch (err) {
    log('error', 'login failed: auth service unavailable', { message: err.message });
    res.status(503).send(loginPage('Authentication service is unavailable. Please try again shortly.'));
  }
});

app.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.redirect('/login');
});

app.get('/', requireAuth, (req, res) => {
  renderForm(req, res, { success: req.query.ok ? 'Commute saved.' : '' });
});

app.post('/entries', requireAuth, async (req, res) => {
  const routeId = Number(req.body.route_id);
  const duration = Number(req.body.duration_minutes);

  // 输入验证：必须是整数，时长 1–600
  if (!Number.isInteger(routeId) || routeId < 1) {
    log('warn', 'rejected entry: invalid route_id', { user: req.user.username });
    return renderForm(req, res, { status: 400, error: 'Please choose a valid route.' });
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    log('warn', 'rejected entry: invalid duration', { user: req.user.username });
    return renderForm(req, res, { status: 400, error: 'Duration must be a whole number between 1 and 600.' });
  }

  try {
    const [found] = await pool.query('SELECT id FROM routes WHERE id = ?', [routeId]);
    if (found.length === 0) {
      return renderForm(req, res, { status: 400, error: 'Route does not exist.' });
    }
    await pool.query(
      'INSERT INTO commute_logs (username, route_id, duration_minutes) VALUES (?, ?, ?)',
      [req.user.username, routeId, duration]
    );
    log('info', 'commute saved', { user: req.user.username, route_id: routeId, duration });
    res.redirect('/?ok=1');
  } catch (err) {
    log('error', 'failed to save commute', { code: err.code });
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return renderForm(req, res, { status: 400, error: 'Unknown user or route.' });
    }
    res.status(503).send(page(
      `<div class="alert alert-warning">Could not save right now — the database is unavailable. Please try again shortly.</div>
       <a href="/" class="btn btn-secondary">Back</a>`));
  }
});

const server = app.listen(PORT, () => log('info', `enter-data app listening on ${PORT}`));

// docker stop 时优雅退出
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down');
  server.close(() => pool.end().then(() => process.exit(0)));
});