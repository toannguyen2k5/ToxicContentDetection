"""
Three-tier toxic-content pipeline:
  Tier 1: TF-IDF + Linear SVM
  Tier 2: PhoBERT cross-attention
  Tier 3: Qwen through an OpenAI-compatible API
"""
from time import perf_counter

from src.models.tier1_svm import predict as tier1_model
from src.models.tier2_bert import predict as tier2_model

THRESHOLD_TOXIC = 0.6
THRESHOLD_CLEAN = 0.15


def tier1_score(text: str) -> float:
    return tier1_model.predict(text)["score"]


def tier2_score(text: str, quote_text: str = "") -> float:
    return tier2_model.predict(text, quote_text)["score"]


def tier3_score(text: str):
    from src.tier3_qwen.client import (
        QWEN_CONFIDENCE_THRESHOLD,
        classify_with_qwen_sync,
    )

    result = classify_with_qwen_sync(text)
    if result["confidence"] < QWEN_CONFIDENCE_THRESHOLD:
        return None

    if result["label"] == "CLEAN":
        return 1.0 - result["confidence"]
    return result["confidence"]


def predict_text(text: str, quote_text: str = "") -> dict:
    text = text or ""
    quote_text = quote_text or ""
    stages = []
    started_at = perf_counter()
    stage_started_at = perf_counter()
    tier1_result = tier1_model.predict(text)
    prob_t1 = float(tier1_result["score"])
    stages.append(
        {
            "tier": 1,
            "label": tier1_result["label"].upper(),
            "score": prob_t1,
            "latency_ms": round((perf_counter() - stage_started_at) * 1000, 2),
        }
    )
    tier_used = "tier1_tfidf"
    score = prob_t1
    final_label = tier1_result["label"].upper()
    prob_t2 = None
    prob_t3 = None

    if not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN):
        stage_started_at = perf_counter()
        tier2_result = tier2_model.predict(text, quote_text)
        score = float(tier2_result["score"])
        prob_t2 = score
        final_label = tier2_result["label"].upper()
        stages.append(
            {
                "tier": 2,
                "label": final_label,
                "score": score,
                "latency_ms": round((perf_counter() - stage_started_at) * 1000, 2),
            }
        )
        tier_used = "tier2_ml"

        if not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN):
            from src.tier3_qwen.client import (
                QWEN_CONFIDENCE_THRESHOLD,
                classify_with_qwen_sync,
            )

            stage_started_at = perf_counter()
            qwen_result = classify_with_qwen_sync(text)
            qwen_label = qwen_result["label"].lower()
            prob_t3 = (
                1.0 - qwen_result["confidence"]
                if qwen_label == "clean"
                else qwen_result["confidence"]
            )
            stages.append(
                {
                    "tier": 3,
                    "label": qwen_label.upper(),
                    "score": prob_t3,
                    "confidence": qwen_result["confidence"],
                    "reason": qwen_result.get("reason", ""),
                    "latency_ms": round((perf_counter() - stage_started_at) * 1000, 2),
                }
            )
            if qwen_result["confidence"] >= QWEN_CONFIDENCE_THRESHOLD:
                tier_used = "tier3_llm"
                score = prob_t3
                final_label = qwen_label.upper()

    toxic = final_label != "CLEAN"
    return {
        "text": text,
        "toxic": toxic,
        "label": final_label.lower(),
        "score": score,
        "tier": tier_used,
        "prob_t1": prob_t1,
        "prob_t2": prob_t2,
        "prob_t3": prob_t3,
        "latency_ms": round((perf_counter() - started_at) * 1000, 2),
        "stages": stages,
    }
