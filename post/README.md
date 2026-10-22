# enter-data app (`post`)

Enter Data web app for the **Commute & Traffic Time Logger** project, published on host port **8080**.
Authenticated users pick a route and enter a commute duration (whole minutes, 1–600); entries are
stored in MySQL `commute_db.commute_logs`.

- Login goes through `auth-service` (`POST /login`, `GET /verify`); the JWT is kept in an `HttpOnly` cookie.
- Input is validated in the browser and again on the server; MySQL also enforces the 1–600 range.
- Uses a MySQL connection pool, so it recovers on its own after a MySQL restart.
- `GET /health` returns `200` when MySQL answers, `503` otherwise.
- Multi-stage `node:24-alpine` image, runs as the non-root `node` user, read-only filesystem in compose.
