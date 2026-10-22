# analytics-service

Python worker for the **Commute & Traffic Time Logger** project. Every
`POLL_SECONDS` (default 15) it reads `commute_db.commute_logs` joined with
`routes` in MySQL, calculates **min, max, average and count** per route, and
upserts one document per route into MongoDB `analytics_db.route_stats`:

```json
{
  "route_name": "Burnaby to BCIT",
  "min_duration": 22,
  "max_duration": 65,
  "avg_duration": 38.5,
  "total_trips": 14,
  "last_updated": ISODate("2026-10-22T19:00:00Z")
}
```

It has no ports; it only talks to `mysql-db` and `mongo-db` on `backend-net`.

## Environment variables

| Variable         | Default          | Purpose                                                    |
| ---------------- | ---------------- | ---------------------------------------------------------- |
| `MYSQL_HOST`     | `mysql-db`       | MySQL host                                                 |
| `MYSQL_USER`     | –                | MySQL user                                                 |
| `MYSQL_PASSWORD` | –                | MySQL password                                             |
| `MYSQL_DATABASE` | `commute_db`     | MySQL database                                             |
| `MONGO_URI`      | – (required)     | App-user URI incl. `/analytics_db?authSource=analytics_db` |
| `POLL_SECONDS`   | `15`             | Seconds between runs                                       |

## Reliability

- If MySQL or MongoDB is down, the error is logged and the next run retries; the worker never exits.
- After each successful run it touches `/tmp/heartbeat`; the Docker healthcheck marks the
  container unhealthy if no run has succeeded for 60 seconds.
- Logs are JSON lines (`docker compose logs analytics`).

## Security

- Runs as the non-root `appuser`; compose makes the filesystem read-only (only `/tmp` is writable).
- Writes to MongoDB as the least-privilege `analytics_user` (readWrite on `analytics_db` only), not root.
