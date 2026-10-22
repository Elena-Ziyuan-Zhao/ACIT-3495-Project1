'use strict';

const test = require('node:test');
const assert = require('node:assert');
const views = require('../src/views');

test('esc escapes HTML special characters', () => {
  assert.equal(views.esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('formatNumber handles numbers, numeric strings and junk', () => {
  assert.equal(views.formatNumber(38.456, 1), '38.5');
  assert.equal(views.formatNumber('22', 0), '22');
  assert.equal(views.formatNumber(undefined, 0), '–');
});

test('formatDate accepts Date objects and ISO strings', () => {
  const d = new Date('2026-10-22T19:00:00Z');
  assert.equal(views.formatDate(d, 'UTC'), views.formatDate('2026-10-22T19:00:00Z', 'UTC'));
  assert.equal(views.formatDate(null, 'UTC'), '–');
  assert.equal(views.formatDate('not a date', 'UTC'), 'not a date');
});

test('loginPage keeps the typed username but escapes it', () => {
  const html = views.loginPage({ username: '"><b>x', error: 'Invalid' });
  assert.match(html, /value="&quot;&gt;&lt;b&gt;x"/);
  assert.match(html, /Invalid/);
});
