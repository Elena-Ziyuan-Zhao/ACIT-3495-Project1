"""analytics-service

Every POLL_SECONDS: aggregate commute_logs per route in MySQL (min, max, avg,
count) and upsert one document per route into MongoDB analytics_db.route_stats.
A heartbeat file is touched after every successful run; the Docker healthcheck
uses it, so the container reports unhealthy if either database is unreachable.
"""
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import mysql.connector
from pymongo import MongoClient, UpdateOne
from pymongo.errors import PyMongoError

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "mysql-db"),
    "user": os.getenv("MYSQL_USER"),
    "password": os.getenv("MYSQL_PASSWORD"),
    "database": os.getenv("MYSQL_DATABASE", "commute_db"),
    "connection_timeout": 5,
}
MONGO_URI = os.getenv("MONGO_URI")  # must include /analytics_db and authSource
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "15"))
HEARTBEAT_FILE = Path(os.getenv("HEARTBEAT_FILE", "/tmp/heartbeat"))

QUERY = """
    SELECT
        CONCAT(r.origin, ' to ', r.destination) AS route_name,
        MIN(c.duration_minutes)                 AS min_duration,
        MAX(c.duration_minutes)                 AS max_duration,
        AVG(c.duration_minutes)                 AS avg_duration,
        COUNT(c.id)                             AS total_trips
    FROM commute_logs c
    JOIN routes r ON c.route_id = r.id
    GROUP BY r.id, r.origin, r.destination
"""


def log(level, msg, **fields):
    """One JSON object per line on stdout. Never log passwords or URIs."""
    entry = {"ts": datetime.now(timezone.utc).isoformat(), "level": level,
             "service": "analytics-service", "msg": msg, **fields}
    print(json.dumps(entry), flush=True)


def fetch_stats():
    """Run the aggregation in MySQL. A fresh connection per run recovers on its own after a MySQL restart."""
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    try:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(QUERY)
            return cursor.fetchall()
        finally:
            cursor.close()
    finally:
        conn.close()


def to_document(row, now):
    """Convert one MySQL row to the agreed route_stats shape.

    MySQL returns AVG() as Decimal, which BSON cannot store, so it becomes a float.
    last_updated must be a real date: the collection's validator rejects strings.
    """
    return {
        "route_name": row["route_name"],
        "min_duration": int(row["min_duration"]),
        "max_duration": int(row["max_duration"]),
        "avg_duration": round(float(row["avg_duration"]), 2),
        "total_trips": int(row["total_trips"]),
        "last_updated": now,
    }


def run_once(collection):
    rows = fetch_stats()
    now = datetime.now(timezone.utc)
    ops = [
        UpdateOne({"route_name": doc["route_name"]}, {"$set": doc}, upsert=True)
        for doc in (to_document(row, now) for row in rows)
    ]
    if ops:
        collection.bulk_write(ops, ordered=False)
    return len(ops)


def main():
    if not MONGO_URI:
        log("error", "MONGO_URI is required")
        sys.exit(1)

    # One client for the whole process; it pools connections and reconnects by itself.
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    collection = client.get_default_database()["route_stats"]  # database name comes from the URI

    stopping = False

    def stop(signum, _frame):
        nonlocal stopping
        stopping = True
        log("info", "shutting down", signal=signal.Signals(signum).name)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log("info", "analytics service started", poll_seconds=POLL_SECONDS)
    while not stopping:
        started = time.monotonic()
        try:
            count = run_once(collection)
            HEARTBEAT_FILE.touch()
            log("info", "route stats updated", routes=count,
                duration_ms=round((time.monotonic() - started) * 1000, 1))
        except mysql.connector.Error as err:
            log("error", "MySQL unavailable, will retry", message=str(err))
        except PyMongoError as err:
            log("error", "MongoDB unavailable, will retry", message=str(err))
        except Exception as err:  # keep the worker alive; the next run may succeed
            log("error", "analytics run failed", message=str(err))

        # Sleep in short steps so `docker stop` is handled quickly.
        deadline = time.monotonic() + POLL_SECONDS
        while not stopping and time.monotonic() < deadline:
            time.sleep(0.5)

    client.close()


if __name__ == "__main__":
    main()
