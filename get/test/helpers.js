'use strict';

const silentLogger = { info() {}, warn() {}, error() {} };

// Starts an Express app (or any request handler) on a random port.
async function listen(handler) {
  const http = require('node:http');
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Fake MongoDB collection: find().sort().toArray()
function fakeCollection(rows, counter = { calls: 0 }) {
  return {
    find() {
      return {
        sort() {
          return {
            async toArray() {
              counter.calls += 1;
              return rows;
            },
          };
        },
      };
    },
  };
}

module.exports = { silentLogger, listen, fakeCollection };
