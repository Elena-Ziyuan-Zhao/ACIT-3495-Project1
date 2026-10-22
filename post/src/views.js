'use strict';

const { MIN_DURATION, MAX_DURATION } = require('./validation');

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function layout(body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commute Logger</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head><body class="bg-light"><main class="container py-5" style="max-width:640px">
<h1 class="h3 mb-4">Commute &amp; Traffic Time Logger</h1>
${body}
</main></body></html>`;
}

function alert(kind, message) {
  return message ? `<div class="alert alert-${kind}" role="alert">${esc(message)}</div>` : '';
}

function loginPage(error = '') {
  return layout(`
${alert('danger', error)}
<form method="POST" action="/login" class="card card-body">
  <div class="mb-3">
    <label class="form-label" for="username">Username</label>
    <input id="username" name="username" class="form-control" required autocomplete="username">
  </div>
  <div class="mb-3">
    <label class="form-label" for="password">Password</label>
    <input id="password" name="password" type="password" class="form-control" required autocomplete="current-password">
  </div>
  <button class="btn btn-primary">Log in</button>
</form>`);
}

function routeLabel(r) {
  return `${esc(r.origin)} → ${esc(r.destination)}`;
}

function entryPage({ username, routes, recent, error = '', success = '' }) {
  const options = routes.map((r) => `<option value="${Number(r.id)}">${routeLabel(r)}</option>`).join('');
  const rows = recent.map((r) => `<tr><td>${routeLabel(r)}</td><td>${Number(r.duration_minutes)} min</td>
    <td>${esc(new Date(r.created_at).toLocaleString())}</td></tr>`).join('');

  return layout(`
<form method="POST" action="/logout" class="d-flex justify-content-between align-items-center mb-3">
  <span class="text-muted">Logged in as <strong>${esc(username)}</strong></span>
  <button class="btn btn-sm btn-outline-secondary">Log out</button>
</form>
${alert('danger', error)}
${alert('success', success)}
<form method="POST" action="/entries" class="card card-body mb-4">
  <div class="mb-3">
    <label class="form-label" for="route_id">Route</label>
    <select id="route_id" name="route_id" class="form-select" required>${options}</select>
  </div>
  <div class="mb-3">
    <label class="form-label" for="duration_minutes">Duration (minutes)</label>
    <input id="duration_minutes" name="duration_minutes" type="number"
           min="${MIN_DURATION}" max="${MAX_DURATION}" step="1" class="form-control" required>
  </div>
  <button class="btn btn-primary">Save commute</button>
</form>
<h2 class="h5">Your recent trips</h2>
<table class="table table-sm"><tbody>${rows || '<tr><td class="text-muted">No trips yet</td></tr>'}</tbody></table>`);
}

function unavailablePage(message) {
  return layout(`${alert('warning', message)}<a href="/" class="btn btn-secondary">Back</a>`);
}

module.exports = { esc, loginPage, entryPage, unavailablePage };