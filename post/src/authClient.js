'use strict';

// Talks to auth-service. Throws when the service is unreachable so the
// caller can show a "temporarily unavailable" page instead of crashing.
function createAuthClient(baseUrl, fetchImpl = fetch) {
  return {
    // -> { ok: true, token, expiresIn } | { ok: false }
    async login(username, password) {
      const res = await fetchImpl(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 400 || res.status === 401) return { ok: false };
      if (!res.ok) throw new Error(`auth-service responded ${res.status}`);
      const body = await res.json();
      return { ok: true, token: body.token, expiresIn: body.expires_in || 3600 };
    },

    // -> { username } when the token is valid, null when it is not
    async verify(token) {
      const res = await fetchImpl(`${baseUrl}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`auth-service responded ${res.status}`);
      const body = await res.json();
      return { username: body.user.username };
    },
  };
}

module.exports = { createAuthClient };