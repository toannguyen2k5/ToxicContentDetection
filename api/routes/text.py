"""
[Owner: A]
Route /api/text - endpoint chính extension và dashboard gọi tới.
"""
import hashlib
import json
from time import perf_counter
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api import cache, history, pipeline
from src.tier3_qwen.client import QwenServiceError

router = APIRouter()


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
            **({"quote_text": req.quote_text} if req.quote_text is not None else {}),
            **({"post_title": req.post_title} if req.post_title else {}),
        }
    return result


@router.post("/predict_batch")
def predict_batch_endpoint(req: PredictBatchRequest):
    """
    Endpoint cho dashboard quét log hàng loạt.
    Trả về: {"results": [ {"text", "toxic", "label", "score", "tier"}, ... ]}
    """
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
    return history.get_logs(limit=limit, offset=offset)


@router.get("/stats")
def get_prediction_stats():
    return history.get_stats()


@router.get("/charts")
def get_prediction_charts(days: int = Query(default=7, ge=1, le=90)):
    return history.get_chart_data(days=days)
