'use strict';

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 10;

// Builds the real db object on a mysql2 connection pool. All queries are
// parameterized; values never get interpolated into SQL strings.
function createDb(dbConfig) {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectionLimit: 10,
    waitForConnections: true,
  });

  return {
    async findUserByUsername(username) {
      const [rows] = await pool.query(
        'SELECT id, username, password_hash FROM users WHERE username = ?',
        [username]
      );
      return rows.length > 0 ? rows[0] : null;
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    // INSERT IGNORE so restarts neither duplicate nor overwrite the user.
    async seedUser(username, password) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      await pool.query(
        'INSERT IGNORE INTO users (username, password_hash) VALUES (?, ?)',
        [username, passwordHash]
      );
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createDb };
