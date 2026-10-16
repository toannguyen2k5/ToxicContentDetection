"""
[Owner: A]
Route /api/text - endpoint chính extension và dashboard gọi tới.
"""
import hashlib

from fastapi import APIRouter
from pydantic import BaseModel

from api import cache , pipeline , batch

router = APIRouter()


class PredictRequest(BaseModel):
    text: str


class PredictBatchRequest(BaseModel):
    texts: list[str]


def _cache_key(text: str) -> str:
    return "tcd:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


@router.post("/predict")
def predict(req: PredictRequest):
    """
    Endpoint mà Chrome extension gọi cho từng đoạn text quét được trên trang.
    Trả về: {"text", "toxic", "label", "score", "tier"}
    """
    key = _cache_key(req.text)
    cached = cache.get(key)
    if cached is not None:
        return cached

    result = pipeline.predict_text(req.text)
    cache.set(key, result)
    return result


@router.post("/predict_batch")
def predict_batch_endpoint(req: PredictBatchRequest):
    """
    Endpoint cho dashboard quét log hàng loạt.
    Trả về: {"results": [ {"text", "toxic", "label", "score", "tier"}, ... ]}
    """
    results = batch.predict_batch(req.texts)
    return {"results": results}
