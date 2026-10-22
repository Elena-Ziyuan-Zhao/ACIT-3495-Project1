'use strict';

// Minimal structured logger: one JSON object per line on stdout.
// Never pass secrets, passwords, tokens or raw headers/bodies as fields.

function createLogger(stream = process.stdout) {
  function write(level, msg, fields = {}) {
    const entry = { ts: new Date().toISOString(), level, service: 'show-results-app', msg, ...fields };
    stream.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}

module.exports = { createLogger };
