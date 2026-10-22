'use strict';

const mysql = require('mysql2/promise');

// mysql2 pool: connections are reused across requests and re-created
// automatically after MySQL restarts. All queries are parameterized.
function createDb(config) {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
  });

  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async listRoutes() {
      const [rows] = await pool.query('SELECT id, origin, destination FROM routes ORDER BY id');
      return rows;
    },

    async routeExists(routeId) {
      const [rows] = await pool.query('SELECT id FROM routes WHERE id = ?', [routeId]);
      return rows.length > 0;
    },

    async recentEntries(username, limit = 5) {
      const [rows] = await pool.query(
        `SELECT r.origin, r.destination, c.duration_minutes, c.created_at
           FROM commute_logs c JOIN routes r ON c.route_id = r.id
          WHERE c.username = ?
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ?`,
        [username, limit]
      );
      return rows;
    },

    async insertEntry(username, routeId, durationMinutes) {
      await pool.query(
        'INSERT INTO commute_logs (username, route_id, duration_minutes) VALUES (?, ?, ?)',
        [username, routeId, durationMinutes]
      );
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createDb };