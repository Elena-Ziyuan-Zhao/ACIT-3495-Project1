const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 8080;


const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-db',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'commute_db',
  waitForConnections: true,
  connectionLimit: 10,
});


function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: 'post', msg, ...extra }));
}


function requireAuth(req, res, next) {
  req.user = { username: process.env.DEV_USERNAME || 'demo' };
  next();
}
// =====================================================

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
<p class="text-muted">Logged in as <strong>${esc(req.user.username)}</strong></p>
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
    res.status(503).send(page(
      `<div class="alert alert-warning">Could not save right now — the database is unavailable. Please try again shortly.</div>
       <a href="/" class="btn btn-secondary">Back</a>`));
  }
});

const server = app.listen(PORT, () => log('info', `enter-data app listening on ${PORT}`));


process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down');
  server.close(() => pool.end().then(() => process.exit(0)));
});