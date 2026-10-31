"""
[Owner: A + C]
Route /api/text - endpoint chính extension và dashboard gọi tới.
C-update: GET /training-logs → đọc labels_agreed.csv cho LogViewer tab.
"""
import csv
import hashlib
import json
from pathlib import Path
from time import perf_counter
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api import cache, history, pipeline
from src.tier3_qwen.client import QwenServiceError

router = APIRouter()

CSV_PATH = Path("data/labeled/labels_agreed.csv")
_LABEL_MAP = {"clean": "CLEAN", "offensive": "OFFENSIVE", "hate": "HATE"}


class PredictRequest(BaseModel):
    text: str
    quote_text: Optional[str] = None
    post_title: Optional[str] = None
    source_url: Optional[str] = None


class PredictBatchRequest(BaseModel):
    texts: list[str]


def _cache_key(text: str, quote_text: Optional[str] = None) -> str:
    payload = json.dumps(
        [text, quote_text], ensure_ascii=False, separators=(",", ":")
    )
    return "tcd:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


@router.post("/predict")
def predict(req: PredictRequest):
    """
    Endpoint mà Chrome extension gọi cho từng đoạn text quét được trên trang.
    Trả về nhãn 3 lớp, kết quả tương thích extension và thời gian từng tier.
    """
    key = _cache_key(req.text, req.quote_text)
    started_at = perf_counter()
    result = cache.get(key)
    if result is None:
        try:
            result = pipeline.predict_text(req.text, req.quote_text or "")
        except QwenServiceError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        cache.set(key, result)
    latency_ms = round((perf_counter() - started_at) * 1000, 2)
    history.record_prediction(
        req.text,
        result,
        latency_ms,
        req.quote_text,
        req.post_title,
        req.source_url,
    )
    result = {**result, "latency_ms": latency_ms}
    if req.quote_text is not None or req.post_title is not None:
        result = {
            **result,
            **({} if req.quote_text is None else {"quote_text": req.quote_text}),
            **({} if not req.post_title else {"post_title": req.post_title}),
        }
    return result


@router.post("/predict_batch")
def predict_batch_endpoint(req: PredictBatchRequest):
    """Endpoint cho dashboard quét log hàng loạt."""
    try:
        results = []
        for text in req.texts:
            started_at = perf_counter()
            result = pipeline.predict_text(text)
            latency_ms = round((perf_counter() - started_at) * 1000, 2)
            result = {**result, "latency_ms": latency_ms}
            history.record_prediction(text, result, latency_ms)
            results.append(result)
    except QwenServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"results": results}


@router.get("/logs")
def get_prediction_logs(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """[A] Extension Logs: lịch sử predict từ SQLite (persistent)."""
    return history.get_logs(limit=limit, offset=offset)


@router.get("/stats")
def get_prediction_stats():
    """[A] Thống kê tổng hợp từ SQLite."""
    return history.get_stats()


@router.get("/charts")
def get_prediction_charts(days: int = Query(default=7, ge=1, le=90)):
    """[A] Dữ liệu charts theo ngày."""
    return history.get_chart_data(days=days)


# ---------------------------------------------------------------------------
# [C] Training data — đọc labels_agreed.csv cho LogViewer tab
# ---------------------------------------------------------------------------
_csv_cache: list[dict] | None = None


def _load_csv() -> list[dict]:
    if not CSV_PATH.exists():
        return []
    rows: list[dict] = []
    try:
        with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader, start=1):
                label = _LABEL_MAP.get(row.get("label", "").strip().lower(), "CLEAN")
                ts = row.get("posted_at", "").strip()
                if "+" in ts:
                    ts = ts[: ts.rfind("+")]
                elif ts.endswith("Z"):
                    ts = ts[:-1]
                text = row.get("text", "").strip()
                if not text:
                    continue
                rows.append({
                    "id":         i,
                    "text":       text,
                    "label":      label,
                    "prob_t1":    None,
                    "prob_t2":    None,
                    "tier_used":  1,
                    "latency_ms": 0,
                    "source_url": row.get("source_url", "").strip() or None,
                    "timestamp":  ts,
                })
    except Exception:
        pass
    return rows


def _get_csv_data() -> list[dict]:
    global _csv_cache
    if _csv_cache is None:
        _csv_cache = _load_csv()
    return _csv_cache


@router.get("/training-logs")
def get_training_logs(
    limit: int = Query(default=100, ge=1, le=500),
    skip:  int = Query(default=0, ge=0),
    label: str = "all",
):
    """
    [C] LogViewer: trả về data từ labels_agreed.csv (33k rows thật).
    Query params:
      - limit: số rows trả về (mặc định 100, tối đa 500)
      - skip:  bỏ qua N rows đầu (server-side pagination)
      - label: "all" | "clean" | "offensive" | "hate"
    """
    rows = _get_csv_data()
    if label.lower() != "all":
        rows = [r for r in rows if r["label"] == label.upper()]
    total  = len(rows)
    sliced = rows[skip: skip + limit]
    stats  = {
        "total":     total,
        "clean":     sum(1 for r in rows if r["label"] == "CLEAN"),
        "offensive": sum(1 for r in rows if r["label"] == "OFFENSIVE"),
        "hate":      sum(1 for r in rows if r["label"] == "HATE"),
    }
    return {"logs": sliced, "total": total, "stats": stats}
