# Technical Report — Commute & Traffic Time Logger

---

## 1. Functionality & Architecture

### 1.1 Services

| Service | Language / base image | Host port | Responsibility |
|---|---|---|---|
| `post` | Node.js 20 · `node:20-alpine` | 8080 | Login, enter commute duration, write to MySQL |
| `show-results-app` | Node.js · `node:24-alpine` | 8081 | Login, read statistics from MongoDB |
| `auth-service` | Node.js | internal | Verify credentials (bcrypt), issue and verify JWTs |
| `analytics` | Python 3.11 | internal | Every 15 s: aggregate MySQL → upsert MongoDB |
| `mysql-db` | `mysql:8.0` | internal | Users, routes, raw commute logs |
| `mongo-db` | `mongo:7.0` | internal | Aggregated route statistics |

Two languages are used: **Node.js** (three services) and **Python** (analytics).


### 1.2 Networks

| Network | Members | Purpose |
|---|---|---|
| `frontend-net` (bridge) | post, show-results-app | Lets the two web apps publish their host ports (8080, 8081). Nothing else is attached, so no other service is reachable from outside. |
| `backend-net` (`internal: true`) | post, show-results-app, auth-service, analytics, mysql-db, mongo-db | All service-to-service traffic. Marked internal, so it has no route to the host or the internet. |

### 1.3 Data model

- **MySQL `commute_db`**: stores commute_log, users and route

`commute_log`: the log info itself

![screenshot - commute_log schema](evidence/mysql_log_schema.png)

`users`: stores the user info for authentication

![screenshot - users schema](evidence/users_schema.png)

`route`: the sample route for the traffic

![screenshot - routes](evidence/dummy_routes.png)

### 1.4 Workflow

> Start from a clean state (`docker compose down -v && docker compose up -d --build`).
> 1. `01-login.png` — http://localhost:8080 redirects to the login page
> 2. `01-entry.png` — after logging in, the form with a saved trip in "Your recent trips"
> 3. `01-results.png` — ~15 s later, http://localhost:8081 showing the statistics table

![Login page](evidence/01-login.png)
![Entering a commute](evidence/01-entry.png)
![Results page](evidence/01-results.png)

---

## 2. Docker & Optimization

## 3. Security

### 3.1 Secret handling

- All credentials come from environment variables; Compose reads them from `.env`.
- `.env` is in `.gitignore`; only `.env.example` with `change_me` placeholders is committed.
- CI uses GitHub Actions Secrets / `GITHUB_TOKEN`; no credentials appear in the workflow file.
- `auth-service` refuses to start if `JWT_SECRET` is shorter than 32 characters.


![Secret handling](evidence/03-secrets.png)

### 3.2 Private internal services

Only the two web apps publish ports. `backend-net` is `internal: true`, so even the
databases cannot make outbound internet connections.


![Only two ports published](evidence/03-ports.png)

### 3.3 Least privilege

- Custom images run as a non-root user.
- Applications connect with dedicated database users (`commute_app`, `analytics_user`), not root.
- Core services are running with read_only previledge

> ```bash
> for s in post show-results-app auth-service analytics; do echo -n "$s: "; docker compose exec $s whoami; done
> ```

![Non-root containers](evidence/03-nonroot.png)

![Non-root containers](evidence/03-read_only.png)

### 3.4 Access control

1. Passwords are stored as bcrypt hashes. An unknown username is checked against a dummy hash,
   so response time does not reveal whether the user exists.
2. On login, `auth-service` returns a signed JWT (HS256, issuer-checked, 1-hour expiry).
3. An invalid or expired token clears the cookie and redirects to `/login`.


![Access control](evidence/03-access-denied.png)

### 3.5 Vulnerability scan

**Image scanned:** `auth-service` — the most security-sensitive service, since it handles
passwords and signs tokens.


![Trivy scan](evidence/03-trivy.png)

Result: 0 HIGH and 0 CRITICAL vulnerabilities.

---

## 4. Reliability

### 4.1 Health checks

| Service | Health check | Meaning of "healthy" |
|---|---|---|
| `mysql-db` | `mysqladmin ping` | Server accepts connections |
| `mongo-db` | `mongosh --eval "db.adminCommand('ping')"` | Server accepts connections |
| `auth-service`, `post`, `show-results-app` | `GET /health` | App is up **and** its database answers (`503` otherwise) |

Startup order uses `depends_on: condition: service_healthy`. The apps also retry their database
connections, so a slow database start does not crash them. All services use `restart: unless-stopped`.

> 📸 **Evidence 4.1** — `04-healthy.png`
> `docker compose ps` with every service showing `(healthy)`.

![All services healthy](evidence/04-healthy.png)

## 5. Failure test

### 4.2 Failure test 1 — MySQL stops

### 4.3 Failure test 2 — auth-service stops

### 4.4 Failure test 3 (optional) — analytics stops


---

## 5. Performance & Observability
---

## 6. Persistence

## 7. CI/CD Evidence

