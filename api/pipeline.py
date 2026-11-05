"""
Three-tier toxic-content pipeline:
  Tier 1: TF-IDF + Linear SVM
  Tier 2: PhoBERT cross-attention
  Tier 3: Qwen through an OpenAI-compatible API

C-update: thêm TIER*_ENABLED flags — hot-reload qua PUT /api/settings.
"""
from time import perf_counter

from src.models.tier1_svm import predict as tier1_model
from src.models.tier2_bert import predict as tier2_model

# ─── Cascade thresholds ── hot-reload bởi settings.py ────────────────────────
THRESHOLD_TOXIC = 0.6
THRESHOLD_CLEAN = 0.15

# ─── Tier enable/disable ── hot-reload bởi settings.py ───────────────────────
TIER1_ENABLED = True
TIER2_ENABLED = True
TIER3_ENABLED = False   # Qwen mặc định tắt (chậm)


def predict_text(text: str, quote_text: str = "") -> dict:
    text       = text       or ""
    quote_text = quote_text or ""

    stages        = []
    started_at    = perf_counter()
    final_label   = "CLEAN"
    score         = 0.5
    tier_used     = "none"
    prob_t1 = prob_t2 = prob_t3 = None

    # Nếu không tier nào được bật → coi là CLEAN ngay
    need_escalate = True   # True nghĩa là "chưa đủ tự tin, cần tầng tiếp theo"

    # ── Tầng 1: SVM ──────────────────────────────────────────────────────────
    if TIER1_ENABLED:
        t_start      = perf_counter()
        t1           = tier1_model.predict(text)
        prob_t1      = float(t1["score"])
        final_label  = t1["label"].upper()
        score        = prob_t1
        tier_used    = "tier1_tfidf"
        stages.append({
            "tier":       1,
            "label":      final_label,
            "score":      prob_t1,
            "latency_ms": round((perf_counter() - t_start) * 1000, 2),
        })
        need_escalate = not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN)

    # ── Tầng 2: PhoBERT ───────────────────────────────────────────────────────
    if need_escalate and TIER2_ENABLED:
        t_start      = perf_counter()
        t2           = tier2_model.predict(text)
        prob_t2      = float(t2["score"])
        final_label  = t2["label"].upper()
        score        = prob_t2
        tier_used    = "tier2_ml"
        stages.append({
            "tier":       2,
            "label":      final_label,
            "score":      prob_t2,
            "latency_ms": round((perf_counter() - t_start) * 1000, 2),
        })
        need_escalate = not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN)

    # ── Tầng 3: Qwen ──────────────────────────────────────────────────────────
    if need_escalate and TIER3_ENABLED:
        from src.tier3_qwen.client import (
            QWEN_CONFIDENCE_THRESHOLD,
            classify_with_qwen_sync,
        )
        t_start     = perf_counter()
        qwen        = classify_with_qwen_sync(text)
        qwen_label  = qwen["label"].lower()
        prob_t3     = (
            1.0 - qwen["confidence"]
            if qwen_label == "clean"
            else qwen["confidence"]
        )
        stages.append({
            "tier":       3,
            "label":      qwen_label.upper(),
            "score":      prob_t3,
            "confidence": qwen["confidence"],
            "reason":     qwen.get("reason", ""),
            "latency_ms": round((perf_counter() - t_start) * 1000, 2),
        })
        if qwen["confidence"] >= QWEN_CONFIDENCE_THRESHOLD:
            tier_used   = "tier3_llm"
            score       = prob_t3
            final_label = qwen_label.upper()

    return {
        "text":       text,
        "toxic":      final_label != "CLEAN",
        "label":      final_label.lower(),
        "score":      score,
        "tier":       tier_used,
        "prob_t1":    prob_t1,
        "prob_t2":    prob_t2,
        "prob_t3":    prob_t3,
        "latency_ms": round((perf_counter() - started_at) * 1000, 2),
        "stages":     stages,
    }
