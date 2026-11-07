"""
[Owner: A + C]
Route /api/text - endpoint chính extension và dashboard gọi tới.
C-update: GET /training-logs → đọc dataset_full_5_3_2.csv cho LogViewer tab.
"""
import csv
import hashlib
import json
import logging
from pathlib import Path
from time import perf_counter
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api import cache, history, pipeline
from src.tier3_qwen.client import QwenServiceError

logger = logging.getLogger(__name__)
router = APIRouter()

# Absolute path — không bị ảnh hưởng bởi cwd thay đổi lúc runtime
_ROUTES_DIR = Path(__file__).resolve().parent        # api/routes/
_APP_DIR    = _ROUTES_DIR.parent.parent              # /app
CSV_PATH = _APP_DIR / "data" / "labeled" / "dataset_full_5_3_2.csv"
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


@router.post("/predict-debug")
def predict_debug(req: PredictRequest):
    """
    [C] Debug endpoint: chạy CẢ 3 TẦNG bất kể score cascade.
    Dùng cho ModelTester debug mode — xem kết quả từng tầng độc lập.
    KHÔNG cache, KHÔNG ghi history.
    """
    from src.models.tier1_svm import predict as tier1_model
    from src.models.tier2_bert import predict as tier2_model
    from src.tier3_qwen.client import QwenServiceError as QwenErr
    from src.tier3_qwen.client import classify_with_qwen_sync

    text = (req.text or "").strip()
    quote_text = (req.quote_text or "").strip()
    overall_start = perf_counter()
    stages = []

    # --- Tầng 1: SVM (luôn chạy) ---
    t1_start = perf_counter()
    t1 = tier1_model.predict(text)
    stages.append({
        "tier": 1,
        "label": t1["label"].upper(),
        "score": float(t1["score"]),
        "confidence": float(t1["score"]),
        "latency_ms": round((perf_counter() - t1_start) * 1000, 2),
    })

    # --- Tầng 2: PhoBERT (luôn chạy, bỏ qua threshold) ---
    t2_start = perf_counter()
    t2 = tier2_model.predict(text)
    stages.append({
        "tier": 2,
        "label": t2["label"].upper(),
        "score": float(t2["score"]),
        "confidence": float(t2["score"]),
        "latency_ms": round((perf_counter() - t2_start) * 1000, 2),
    })

    # --- Tầng 3: Qwen/Ollama (luôn chạy) ---
    t3_start = perf_counter()
    try:
        t3 = classify_with_qwen_sync(text)
        stages.append({
            "tier": 3,
            "label": t3["label"].upper(),
            "score": t3["confidence"],
            "confidence": t3["confidence"],
            "reason": t3.get("reason", ""),
            "latency_ms": round((perf_counter() - t3_start) * 1000, 2),
        })
    except (QwenErr, Exception) as exc:
        stages.append({
            "tier": 3,
            "label": "ERROR",
            "score": 0.0,
            "confidence": 0.0,
            "reason": f"Qwen error: {exc}",
            "latency_ms": round((perf_counter() - t3_start) * 1000, 2),
        })

    # Cascade result (từ normal pipeline — dùng cache sẵn có)
    cascade = pipeline.predict_text(text, quote_text)

    return {
        "text": text,
        "stages": stages,
        "label":  cascade["label"],
        "score":  cascade["score"],
        "tier":   cascade["tier"],
        "toxic":  cascade["toxic"],
        "latency_ms": round((perf_counter() - overall_start) * 1000, 2),
        "debug": True,
    }


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
# [C] Training data — đọc dataset_full_5_3_2.csv cho LogViewer tab
# ---------------------------------------------------------------------------
_csv_cache: list[dict] | None = None


def _load_csv() -> list[dict]:
    if not CSV_PATH.exists():
        logger.error("[LogViewer] CSV NOT FOUND at %s", CSV_PATH)
        return []
    rows: list[dict] = []
    try:
        with open(CSV_PATH, encoding="utf-8-sig", errors="replace") as f:
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
                    "id":            i,
                    "text":          text,
                    "label":         label,
                    "quoted_text":   row.get("quoted_text", "").strip() or None,
                    "pass_7_level":  row.get("pass_7_level", "").strip() or None,
                    "pass_7_reason": row.get("pass_7_reason", "").strip() or None,
                    "hate_category": row.get("hate_category", "").strip() or None,
                    "source_url":    row.get("source_url", "").strip() or None,
                    "timestamp":     ts,
                })
        logger.info("[LogViewer] CSV loaded: %d rows from %s", len(rows), CSV_PATH)
    except Exception as exc:
        logger.error("[LogViewer] CSV load FAILED after %d rows: %s", len(rows), exc, exc_info=True)
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
    [C] LogViewer: trả về data từ dataset_full_5_3_2.csv (61k rows thật).
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


# ---------------------------------------------------------------------------
# [C] Dataset Statistics — aggregate 61k rows cho Charts tab
# ---------------------------------------------------------------------------
_dataset_stats_cache: dict | None = None


def _compute_dataset_stats() -> dict:
    rows = _get_csv_data()
    if not rows:
        return {}

    label_counts:    dict[str, int] = {}
    source_counts:   dict[str, int] = {}
    hate_cat_counts: dict[str, int] = {}
    pass7_counts:    dict[str, int] = {}

    for row in rows:
        # Label
        lbl = row.get("label", "CLEAN")
        label_counts[lbl] = label_counts.get(lbl, 0) + 1

        # Source domain
        url = row.get("source_url") or ""
        if "voz.vn" in url:
            src = "voz.vn"
        elif "facebook.com" in url:
            src = "Facebook"
        elif "youtube.com" in url:
            src = "YouTube"
        elif url:
            src = "Khác"
        else:
            src = "Không rõ"
        source_counts[src] = source_counts.get(src, 0) + 1

        # Hate category (chỉ có ở HATE rows)
        hc = row.get("hate_category") or ""
        if hc:
            hate_cat_counts[hc] = hate_cat_counts.get(hc, 0) + 1

        # Pass-7 level
        pl = row.get("pass_7_level") or ""
        if pl:
            pass7_counts[pl] = pass7_counts.get(pl, 0) + 1

    def _sorted(d: dict, top: int = 20) -> list[dict]:
        return [{"name": k, "count": v}
                for k, v in sorted(d.items(), key=lambda x: -x[1])[:top]]

    return {
        "total":           len(rows),
        "labels":          label_counts,
        "sources":         _sorted(source_counts),
        "hate_categories": _sorted(hate_cat_counts, top=15),
        "pass7_levels":    _sorted(pass7_counts),
    }


@router.get("/dataset-stats")
def get_dataset_stats():
    """[C] Charts Dataset tab: thống kê tổng hợp từ 61k CSV rows."""
    global _dataset_stats_cache
    if _dataset_stats_cache is None:
        _dataset_stats_cache = _compute_dataset_stats()
    return _dataset_stats_cache
