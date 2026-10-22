# show-results-app

Show Results web app for the **Commute & Traffic Time Logger** project.
Authenticated users see the per-route statistics (min, max, average, count)
that `analytics-service` writes to MongoDB (`analytics_db.route_stats`).
Published on host port **8081**.

## How it works

1. `GET /` without a valid session redirects to `/login`.
2. `POST /login` forwards the username/password to `auth-service` (`POST /login`)
   and stores the returned JWT in an `HttpOnly`, `SameSite=Lax` cookie.
3. Every protected request is checked with `auth-service` (`GET /verify`).
4. Stats are read from MongoDB with the least-privilege `analytics_user` (`MONGO_URI`).

## Endpoints

| Method | Path         | Auth                     | Response                                    |
| ------ | ------------ | ------------------------ | ------------------------------------------- |
| GET    | `/`          | session cookie           | HTML results table (refreshes every 30 s)   |
| GET    | `/login`     | –                        | Login form                                  |
| POST   | `/login`     | –                        | Sets cookie, redirects to `/`               |
| POST   | `/logout`    | –                        | Clears cookie, redirects to `/login`        |
| GET    | `/api/stats` | cookie or `Bearer <jwt>` | `{"stats":[...]}` (handy for load tests)     |
| GET    | `/health`    | –                        | `200 {"status":"ok","db":"up"}` or `503`     |

If MongoDB or `auth-service` is down, pages return `503` with a friendly message
instead of crashing, and recover on their own once the dependency is back.

## Environment variables

| Variable           | Default                     | Purpose                                             |
| ------------------ | --------------------------- | --------------------------------------------------- |
| `PORT`             | `8081`                      | HTTP listen port                                    |
| `MONGO_URI`        | – (required)                | MongoDB URI incl. `analytics_db` and `authSource`   |
| `AUTH_URL`         | `http://auth-service:3000`  | auth-service base URL                               |
| `CACHE_TTL_MS`     | `0` (off)                   | In-memory cache for stats (load-test improvement)   |
| `COOKIE_SECURE`    | `false`                     | Set `true` when served over HTTPS                   |
| `DISPLAY_TIMEZONE` | `America/Vancouver`         | Time zone for "Last updated"                        |

## Tests

```sh
cd get
npm ci && npm test
```

Tests use a fake auth service and a fake MongoDB collection, so no containers are needed.
Without Node installed locally, run them in Docker (PowerShell, from the repo root):

```powershell
docker run --rm -v "${PWD}/get:/app" -w /app node:24-alpine sh -c "npm ci && npm test"
```

## Security choices

- Runs as the non-root `node` user; compose adds a read-only filesystem and `no-new-privileges`.
- Multi-stage `node:24-alpine` image with production dependencies only.
- Session token in an `HttpOnly` cookie, so page scripts cannot read it.
- All database values are HTML-escaped before rendering.
- Read access to MongoDB uses the app user, never the root account.
- Logs are JSON lines; passwords, tokens and request bodies are never logged.
