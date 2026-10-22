'use strict';

// Structured logger: one JSON object per line on stdout.
// Never log passwords, tokens, cookies or raw request bodies.
function createLogger(stream = process.stdout, service = 'post') {
  function write(level, msg, fields = {}) {
    stream.write(`${JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...fields })}\n`);
  }
  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}

module.exports = { createLogger };