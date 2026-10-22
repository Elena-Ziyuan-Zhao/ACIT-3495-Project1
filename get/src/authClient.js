'use strict';

// Thin client for auth-service (see auth/README.md):
//   POST /login  {username, password} -> 200 {token, expires_in} | 400 | 401
//   GET  /verify Authorization: Bearer <jwt> -> 200 {user: {id, username}} | 401

class AuthUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

// Read and discard a response body so the connection can be reused.
async function drain(res) {
  try {
    await res.arrayBuffer();
  } catch {
    // ignore
  }
}

function createAuthClient({ baseUrl, timeoutMs = 3000, fetchImpl = fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');

  async function call(path, init) {
    try {
      return await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new AuthUnavailableError(`auth-service unreachable: ${err.message}`);
    }
  }

  return {
    // Returns {token, expiresIn} on success, null for bad credentials/input.
    // Throws AuthUnavailableError if auth-service is down or misbehaving.
    async login(username, password) {
      const res = await call('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        if (typeof body.token !== 'string' || body.token === '') {
          throw new AuthUnavailableError('auth-service returned no token');
        }
        return { token: body.token, expiresIn: Number(body.expires_in) || 3600 };
      }
      await drain(res);
      if (res.status === 400 || res.status === 401) return null;
      throw new AuthUnavailableError(`auth-service /login returned ${res.status}`);
    },

    // Returns the user object on success, null for a missing/invalid/expired token.
    async verify(token) {
      const res = await call('/verify', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        return body && body.user && typeof body.user.username === 'string' ? body.user : null;
      }
      await drain(res);
      if (res.status === 400 || res.status === 401) return null;
      throw new AuthUnavailableError(`auth-service /verify returned ${res.status}`);
    },
  };
}

module.exports = { createAuthClient, AuthUnavailableError };
