"""Persistent prediction history used by the dashboard."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sqlite3
from typing import Any


DATABASE_PATH = Path(
    os.getenv(
        "TCD_DATABASE_PATH",
        str(Path(__file__).resolve().parents[1] / "data" / "predictions.sqlite3"),
    )
)


def _connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            quote_text TEXT,
            post_title TEXT,
            label TEXT NOT NULL,
            score REAL NOT NULL,
            tier_used INTEGER NOT NULL,
            prob_t1 REAL,
            prob_t2 REAL,
            prob_t3 REAL,
            latency_ms REAL NOT NULL,
            source_url TEXT,
            timestamp TEXT NOT NULL
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON predictions(timestamp)"
    )
    connection.commit()
    return connection


def record_prediction(
    text: str,
    result: dict[str, Any],
    latency_ms: float,
    quote_text: str | None = None,
    post_title: str | None = None,
    source_url: str | None = None,
) -> None:
    tier_name = str(result["tier"]).split("_", 1)[0]
    tier = int(tier_name.removeprefix("tier"))
    stages = {int(stage["tier"]): stage for stage in result.get("stages", [])}
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO predictions (
                text, quote_text, post_title, label, score, tier_used,
                prob_t1, prob_t2, prob_t3, latency_ms, source_url, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text,
                quote_text,
                post_title,
                result["label"].upper(),
                float(result["score"]),
                tier,
                stages.get(1, {}).get("score"),
                stages.get(2, {}).get("score"),
                stages.get(3, {}).get("score"),
                float(latency_ms),
                source_url,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()
    finally:
        connection.close()


def get_logs(limit: int = 10, offset: int = 0) -> dict[str, Any]:
    connection = _connect()
    try:
        total = connection.execute(
            "SELECT COUNT(*) AS count FROM predictions"
        ).fetchone()["count"]
        rows = connection.execute(
            """
            SELECT id, text, label, prob_t1, prob_t2, tier_used, latency_ms,
                   source_url, timestamp
            FROM predictions
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        return {"items": [dict(row) for row in rows], "total": total}
    finally:
        connection.close()


def get_stats() -> dict[str, Any]:
    connection = _connect()
    try:
        total = connection.execute(
            "SELECT COUNT(*) AS count FROM predictions"
        ).fetchone()["count"]
        label_rows = connection.execute(
            "SELECT label, COUNT(*) AS count FROM predictions GROUP BY label"
        ).fetchall()
        tier_rows = connection.execute(
            """
            SELECT tier_used, COUNT(*) AS count, AVG(latency_ms) AS avg_latency_ms
            FROM predictions
            GROUP BY tier_used
            """
        ).fetchall()
        average_latency = connection.execute(
            "SELECT AVG(latency_ms) AS value FROM predictions"
        ).fetchone()["value"]
        labels = {"CLEAN": 0, "OFFENSIVE": 0, "HATE": 0}
        labels.update({row["label"]: row["count"] for row in label_rows})
        tiers = {
            row["tier_used"]: {
                "count": row["count"],
                "avg_latency_ms": round(row["avg_latency_ms"] or 0, 2),
            }
            for row in tier_rows
        }
        return {
            "total": total,
            "labels": labels,
            "tiers": tiers,
            "avg_latency_ms": round(average_latency or 0, 2),
        }
    finally:
        connection.close()


def get_chart_data(days: int = 7) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    first_day = today - timedelta(days=days - 1)
    connection = _connect()
    try:
        label_rows = connection.execute(
            "SELECT label, COUNT(*) AS count FROM predictions GROUP BY label"
        ).fetchall()
        daily_rows = connection.execute(
            """
            SELECT substr(timestamp, 1, 10) AS day, label, COUNT(*) AS count
            FROM predictions
            WHERE substr(timestamp, 1, 10) >= ?
            GROUP BY day, label
            """,
            (first_day.isoformat(),),
        ).fetchall()
        labels = {"CLEAN": 0, "OFFENSIVE": 0, "HATE": 0}
        labels.update({row["label"]: row["count"] for row in label_rows})
        daily: dict[str, dict[str, int | str]] = {}
        for day_offset in range(days):
            current_day = first_day + timedelta(days=day_offset)
            daily[current_day.isoformat()] = {
                "date": current_day.isoformat(),
                "clean": 0,
                "offensive": 0,
                "hate": 0,
            }
        for row in daily_rows:
            label_key = row["label"].lower()
            if label_key in {"clean", "offensive", "hate"}:
                daily[row["day"]][label_key] = row["count"]
        return {
            "labels": labels,
            "daily": list(daily.values()),
            "total": sum(labels.values()),
        }
    finally:
        connection.close()
