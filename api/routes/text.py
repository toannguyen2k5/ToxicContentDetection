"""
[Owner: A]
Route chính /api/text/predict - pipeline 3 tier (SVM -> BERT -> Qwen).
"""
from fastapi import APIRouter
from pydantic import BaseModel

from src.models.tier1_svm import predict as tier1
from src.models.tier2_bert import predict as tier2
from src.tier3_qwen.client import classify_with_qwen

router = APIRouter()


class PredictRequest(BaseModel):
    text: str


class PredictResponse(BaseModel):
    label: str
    score: float
    tier: int


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    result = tier1.predict(req.text)

    # TODO(A/B): định nghĩa threshold thật để quyết định leo tier
    UNCERTAIN_THRESHOLD = 0.5
    if result["score"] < UNCERTAIN_THRESHOLD:
        result = tier2.predict(req.text)

    if result["score"] < UNCERTAIN_THRESHOLD:
        result = classify_with_qwen(req.text)

    return result
