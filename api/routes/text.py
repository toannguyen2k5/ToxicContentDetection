"""
[Owner: A + C]
Route /api/text - endpoint chính extension và dashboard gọi tới.
C-update: thêm latency đo thực, lưu log_store, GET /logs, GET /logs/stats.
C-update2: GET /training-logs → đọc labels_agreed.csv cho LogViewer.
"""
import csv
import hashlib
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header
from pydantic import BaseModel

from api import cache, pipeline, batch, log_store

router = APIRouter()

CSV_PATH = Path("data/labeled/labels_agreed.csv")
_LABEL_MAP = {"clean": "CLEAN", "offensive": "OFFENSIVE", "hate": "HATE"}


class PredictRequest(BaseModel):
    text: str


class PredictBatchRequest(BaseModel):
    texts: list[str]


def _cache_key(text: str) -> str:
    return "tcd:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


@router.post("/predict")
def predict(
    req: PredictRequest,
    x_source_url: Optional[str] = Header(default=""),
):
    """
    Endpoint mà Chrome extension gọi cho từng đoạn text quét được.
    Header X-Source-URL: URL trang hiện tại (extension tự set).
    Trả về: {text, toxic, label, score, tier}
    Tự động lưu log → dashboard Extension Logs tab.
    """
    key = _cache_key(req.text)
    cached = cache.get(key)
    if cached is not None:
        # Cache hit → vẫn log (có thể comment trùng từ nhiều trang)
        log_store.add_log(
            text=req.text,
            label=cached["label"],
            score=cached["score"],
            tier=cached["tier"],
            latency_ms=0,          # từ cache → latency ≈ 0
            source_url=x_source_url or "",
        )
        return cached

    t0 = time.perf_counter()
    result = pipeline.predict_text(req.text)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    cache.set(key, result)

    log_store.add_log(
        text=req.text,
        label=result["label"],
        score=result["score"],
        tier=result["tier"],
        latency_ms=latency_ms,
        source_url=x_source_url or "",
    )

    return result


@router.post("/predict_batch")
def predict_batch_endpoint(req: PredictBatchRequest):
    """
    Endpoint cho dashboard quét log hàng loạt.
    Trả về: {"results": [{text, toxic, label, score, tier}, ...]}
    """
    results = batch.predict_batch(req.texts)
    return {"results": results}


@router.get("/logs")
def get_logs(limit: int = 100):
    """
    [C] Trả về danh sách log classify gần nhất từ extension.
    Dashboard dùng endpoint này cho Extension Logs tab.
    Query param: ?limit=N (mặc định 100, tối đa 500)
    """
    entries = log_store.get_logs(limit=min(limit, 500))
    return {
        "logs":  entries,
        "total": len(entries),
    }


@router.get("/logs/stats")
def get_logs_stats():
    """
    [C] Thống kê nhanh: tổng / clean / offensive / hate.
    Dashboard dùng để hiển thị header counters.
    """
    return log_store.get_stats()


@router.delete("/logs")
def clear_logs():
    """[C] Xóa toàn bộ log (dùng khi demo muốn reset)."""
    log_store.clear()
    return {"message": "Logs cleared"}


# ---------------------------------------------------------------------------
# Training data — đọc labels_agreed.csv cho LogViewer
# ---------------------------------------------------------------------------
def _load_csv() -> list[dict]:
    """
    Đọc labels_agreed.csv và convert sang LogEntry format.
    Cache kết quả trong RAM sau lần đầu.
    """
    if not CSV_PATH.exists():
        return []
    rows = []
    try:
        with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader, start=1):
                label = _LABEL_MAP.get(row.get("label", "").strip().lower(), "CLEAN")
                # Normalize timestamp: cắt timezone offset
                ts = row.get("posted_at", "").strip()
                if "+" in ts:
                    ts = ts[: ts.rfind("+")]
                elif ts.endswith("Z"):
                    ts = ts[:-1]
                rows.append({
                    "id":         i,
                    "text":       row.get("text", "").strip(),
                    "label":      label,
                    "prob_t1":    0.0,
                    "prob_t2":    0.0,
                    "tier_used":  1,
                    "latency_ms": 0,
                    "source_url": row.get("source_url", "").strip(),
                    "timestamp":  ts,
                })
    except Exception:
        pass
    return rows


_csv_cache: list[dict] | None = None


def _get_csv_data() -> list[dict]:
    global _csv_cache
    if _csv_cache is None:
        _csv_cache = _load_csv()
    return _csv_cache


@router.get("/training-logs")
def get_training_logs(
    limit: int = 100,
    skip:  int = 0,
    label: str = "all",
):
    """
    [C] LogViewer: trả về data từ labels_agreed.csv.
    Query params:
      - limit: số rows trả về (mặc định 100)
      - skip:  bỏ qua N rows đầu (dùng cho pagination)
      - label: "all" | "clean" | "offensive" | "hate"
    """
    rows = _get_csv_data()
    if label.lower() != "all":
        rows = [r for r in rows if r["label"] == label.upper()]
    total  = len(rows)
    sliced = rows[skip: skip + min(limit, 500)]
    stats  = {
        "total":     total,
        "clean":     sum(1 for r in rows if r["label"] == "CLEAN"),
        "offensive": sum(1 for r in rows if r["label"] == "OFFENSIVE"),
        "hate":      sum(1 for r in rows if r["label"] == "HATE"),
    }
    return {"logs": sliced, "total": total, "stats": stats}
