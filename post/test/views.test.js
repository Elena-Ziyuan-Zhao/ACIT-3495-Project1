'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { esc, loginPage, entryPage } = require('../src/views');

test('esc escapes HTML special characters', () => {
  assert.equal(esc('<script>"x"&\'y\'</script>'), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});

test('login page shows the error message escaped', () => {
  const html = loginPage('<b>bad</b>');
  assert.match(html, /&lt;b&gt;bad&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>bad<\/b>/);
});

test('entry page lists routes and escapes usernames (XSS)', () => {
  const html = entryPage({
    username: '<img src=x onerror=alert(1)>',
    routes: [{ id: 1, origin: 'Burnaby', destination: 'BCIT' }],
    recent: [],
  });
  assert.match(html, /<option value="1">Burnaby → BCIT<\/option>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /No trips yet/);
});

test('entry page shows recent trips', () => {
  const html = entryPage({
    username: 'demo',
    routes: [],
    recent: [{ origin: 'Richmond', destination: 'BCIT', duration_minutes: 42, created_at: new Date() }],
  });
  assert.match(html, /Richmond → BCIT/);
  assert.match(html, /42 min/);
});