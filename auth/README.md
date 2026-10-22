# auth-service

JWT authentication service for the **Commute & Traffic Time Logger** project.
It checks username/password logins against the MySQL `users` table and issues
stateless JWTs. The two web apps (`enter-data-app`, `show-results-app`) call it
over the internal Docker network `backend-net`; it is never published to the host. It listens on port 3000.

## Endpoints

| Method | Path      | Body / Header                                   | Success response                                  |
| ------ | --------- | ----------------------------------------------- | ------------------------------------------------- |
| POST   | `/login`  | JSON `{"username","password"}`                  | `200 {"token":"<jwt>","expires_in":3600}`         |
| GET    | `/verify` | `Authorization: Bearer <jwt>`                   | `200 {"user":{"id":1,"username":"demo"}}`         |
| GET    | `/health` | –                                               | `200 {"status":"ok","db":"up"}`                   |

`/verify` is fully stateless (it only checks the JWT signature, expiry and
issuer), so it keeps working even while MySQL is down. Errors come back as
`{"error":"..."}` with status 400 (invalid input), 401 (bad credentials or bad
token), 404 (unknown route), 500 (internal error) or 503 (database
unavailable / degraded health).

## Trying it out

The service has no host port, so test it from inside the container
(the image is Alpine, which ships BusyBox `wget`):

```sh
# health
docker compose exec auth-service wget -qO- http://127.0.0.1:3000/health

# log in with the seed account from .env
docker compose exec auth-service wget -qO- \
  --header 'Content-Type: application/json' \
  --post-data '{"username":"demo","password":"<AUTH_SEED_PASSWORD>"}' \
  http://127.0.0.1:3000/login

# verify a token (paste the token from the login response)
docker compose exec auth-service wget -qO- \
  --header 'Authorization: Bearer <token>' \
  http://127.0.0.1:3000/verify
```

From the web apps, call `http://auth-service:3000/login` and `http://auth-service:3000/verify`.

## Environment variables

| Variable                   | Default      | Purpose                                              |
| -------------------------- | ------------ | ---------------------------------------------------- |
| `PORT`                     | `3000`       | HTTP listen port                                     |
| `JWT_SECRET`               | – (required) | HS256 signing secret, at least 32 characters        |
| `JWT_EXPIRES_IN_SECONDS`   | `3600`       | Token lifetime in seconds                            |
| `DB_HOST`                  | `mysql-db`   | MySQL host                                           |
| `DB_PORT`                  | `3306`       | MySQL port                                           |
| `DB_NAME`                  | `commute_db` | MySQL database                                       |
| `DB_USER`                  | –            | MySQL user                                           |
| `DB_PASSWORD`              | –            | MySQL password                                       |
| `AUTH_SEED_USERNAME`       | –            | If set (with password), user is created at startup   |
| `AUTH_SEED_PASSWORD`       | –            | Seed password, stored only as a bcrypt hash          |

Values come from the project `.env` file through `compose.yaml`.

## Running the tests

```sh
cd auth
npm ci && npm test
```

The tests use a fake in-memory database, so no MySQL instance is needed.

## Security choices

- Passwords are stored as bcrypt hashes (cost 10); plain passwords never touch the database.
- JWTs use HS256 with the algorithm pinned on verify and the `auth-service` issuer checked.
- No host port is published: the service is reachable only on the internal `backend-net` network.
- The container runs as the non-root `node` user, with a read-only filesystem and `no-new-privileges`.
- Logs are JSON lines with usernames and reasons only — never passwords, tokens, headers or bodies.
- Login failures for unknown user and wrong password return the same error, so responses do not reveal which one was wrong.
- Request bodies are limited to 10 kB and unknown routes get a plain `404`, so nothing about the stack leaks.
