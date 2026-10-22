'use strict';

// Server-rendered HTML. Every value from the database or the user goes
// through esc() so a route name like <script> cannot run in the browser.

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function formatNumber(value, digits) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '–';
}

function formatDate(value, timeZone) {
  if (value === undefined || value === null || value === '') return '–';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString('en-CA', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toISOString();
  }
}

function layout({ title, body, user, refreshSeconds }) {
  const header = user
    ? `<form method="POST" action="/logout" class="d-flex align-items-center justify-content-between mb-4">
  <span class="text-muted">Logged in as <strong>${esc(user.username)}</strong></span>
  <button class="btn btn-sm btn-outline-secondary">Log out</button>
</form>`
    : '';
  const refresh = refreshSeconds ? `<meta http-equiv="refresh" content="${Number(refreshSeconds)}">` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${refresh}<title>${esc(title)} · Commute Logger</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head><body class="bg-light"><div class="container py-5" style="max-width:860px">
<h1 class="h3 mb-4">Commute &amp; Traffic Time Logger — Results</h1>
${header}
${body}
</div></body></html>`;
}

function loginPage({ error = '', username = '' } = {}) {
  return layout({
    title: 'Log in',
    body: `${error ? `<div class="alert alert-danger">${esc(error)}</div>` : ''}
<form method="POST" action="/login" class="card card-body" style="max-width:420px">
  <div class="mb-3">
    <label class="form-label" for="username">Username</label>
    <input id="username" name="username" class="form-control" maxlength="50" required autofocus value="${esc(username)}">
  </div>
  <div class="mb-3">
    <label class="form-label" for="password">Password</label>
    <input id="password" name="password" type="password" class="form-control" maxlength="128" required>
  </div>
  <button class="btn btn-primary">Log in</button>
</form>`,
  });
}

function resultsPage({ stats, user, timeZone = 'America/Vancouver' }) {
  const rows = stats
    .map(
      (s) => `<tr>
  <td>${esc(s.route_name)}</td>
  <td class="text-end">${esc(s.total_trips ?? '–')}</td>
  <td class="text-end">${esc(formatNumber(s.min_duration, 0))}</td>
  <td class="text-end">${esc(formatNumber(s.avg_duration, 1))}</td>
  <td class="text-end">${esc(formatNumber(s.max_duration, 0))}</td>
  <td class="text-muted">${esc(formatDate(s.last_updated, timeZone))}</td>
</tr>`
    )
    .join('\n');

  const table = stats.length
    ? `<div class="table-responsive"><table class="table table-striped align-middle bg-white">
<thead><tr><th>Route</th><th class="text-end">Trips</th><th class="text-end">Min (min)</th><th class="text-end">Avg (min)</th><th class="text-end">Max (min)</th><th>Last updated</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>`
    : '<div class="alert alert-info">No statistics yet. Log some commutes in the Enter Data app; the analytics service updates results every few seconds.</div>';

  return layout({
    title: 'Results',
    user,
    refreshSeconds: 30,
    body: `${table}<p class="small text-muted">This page refreshes every 30 seconds.</p>`,
  });
}

function errorPage(message, user) {
  return layout({
    title: 'Unavailable',
    user,
    body: `<div class="alert alert-warning">${esc(message)}</div><a href="/" class="btn btn-secondary">Try again</a>`,
  });
}

module.exports = { esc, formatNumber, formatDate, loginPage, resultsPage, errorPage };
