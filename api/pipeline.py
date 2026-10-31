"""
[Owner: A + C]
Pipeline phát hiện toxic content - kiến trúc 3 tier:
  Tier 1: TF-IDF placeholder (blacklist) — TODO(A): thay bằng TF-IDF thật
  Tier 2: ML model (PhoBERT / ViSoBERT)  — TODO(A/B): cần model weights
  Tier 3: LLM Qwen3-4B qua Ollama       — ✅ ĐÃ KẾT NỐI (C)

Luồng: tier nhanh (rẻ) chạy trước; chỉ khi kết quả không "chắc chắn"
mới leo lên tier tiếp theo (chậm hơn, chính xác hơn).

Ngưỡng quyết định:
  score >= THRESHOLD_TOXIC (0.6)  → chắc toxic, dừng
  score <= THRESHOLD_CLEAN (0.15) → chắc sạch, dừng
  còn lại                          → không chắc, leo tier
"""
import re
import unicodedata

# ---------------------------------------------------------------------------
# Ngưỡng quyết định (0.0 - 1.0)
# ---------------------------------------------------------------------------
THRESHOLD_TOXIC = 0.6   # >= ngưỡng này → chắc chắn toxic
THRESHOLD_CLEAN = 0.15  # <= ngưỡng này → chắc chắn sạch

# ---------------------------------------------------------------------------
# Danh sách từ khóa placeholder Tier 1 — CHỈ ĐỂ TEST LUỒNG HOẠT ĐỘNG
# TODO(A): thay bằng TF-IDF vectorizer + classifier đã train thật.
# ---------------------------------------------------------------------------
_BLACKLIST = {
    "đồ ngu", "ngu", "óc chó", "súc vật", "đồ chó", "con chó",
    "địt", "đm", "dm", "vcl", "vl", "clgt", "cặt", "thằng khốn",
    "đồ khốn", "rác rưởi", "thằng ngu", "con điên", "đồ điên",
    "đụt", "cặc", "lồn", "buồi", "mày", "tao", "chửi",
    "hack", "cheat", "gian lận",
}


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _is_certain(score: float) -> bool:
    return score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN


# ---------------------------------------------------------------------------
# Tier 1 — Blacklist placeholder
# ---------------------------------------------------------------------------
def tier1_score(text: str) -> float:
    """
    PLACEHOLDER cho TF-IDF classifier.
    - Khớp blacklist  → 0.75+ (chắc toxic → dừng tại T1)
    - Không khớp      → 0.30  (không chắc → leo T2/T3 để kiểm tra kỹ hơn)

    NOTE: Trả về 0.3 (không chắc) thay vì 0.0 (chắc sạch) khi không có
    blacklist match, vì T1 placeholder quá đơn giản — để T3 (Qwen) xác nhận.
    Khi T2/T3 real được cài vào, có thể điều chỉnh lại ngưỡng này.
    """
    norm = _normalize(text)
    words = norm.split()
    if not words:
        return 0.0

    hits = sum(1 for kw in _BLACKLIST if kw in norm)
    if hits == 0:
        # Không chắc sạch → để T3 (Qwen) quyết định
        return 0.30

    # Khớp blacklist → chắc toxic
    score = min(1.0, hits / max(3, len(words) * 0.3))
    return round(max(score, 0.75), 3)


# ---------------------------------------------------------------------------
# Tier 2 — ML model (stub)
# ---------------------------------------------------------------------------
def tier2_score(text: str):
    """
    TODO(A/B): PhoBERT / ViSoBERT.
    Trả về float [0,1] khi đã có model, hoặc None nếu chưa implement.
    """
    return None


# ---------------------------------------------------------------------------
# Tier 3 — Qwen3-4B qua Ollama (✅ đã kết nối)
# ---------------------------------------------------------------------------
def _tier3_classify(text: str) -> dict | None:
    """
    Gọi Qwen3-4B sync qua Ollama.
    Trả về dict {label, confidence, reason} hoặc None nếu Ollama không chạy.
    """
    try:
        from src.tier3_qwen.client import classify_with_qwen_sync
        result = classify_with_qwen_sync(text)
        if result.get("label") == "unknown":
            return None   # Ollama lỗi hoặc chưa chạy → bỏ qua T3
        return result
    except Exception:
        return None       # Import lỗi hoặc Ollama down → không crash API


# ---------------------------------------------------------------------------
# Hàm chính
# ---------------------------------------------------------------------------
def predict_text(text: str) -> dict:
    """
    Chạy pipeline 3 tier cho 1 đoạn text, trả về kết quả chuẩn hoá.

    Returns:
        {
            "text":   str,
            "toxic":  bool,
            "label":  "CLEAN" | "OFFENSIVE" | "HATE",
            "score":  float,    # confidence score [0, 1]
            "tier":   str,      # "tier1_tfidf" | "tier2_ml" | "tier3_llm"
        }
    """
    text = text or ""

    # ── Tier 1 ──────────────────────────────────────────────────────────────
    tier_used = "tier1_tfidf"
    score = tier1_score(text)
    qwen_label = None

    if _is_certain(score):
        # T1 chắc → dừng (không cần leo tier)
        pass

    else:
        # ── Tier 2 ────────────────────────────────────────────────────────
        t2 = tier2_score(text)
        if t2 is not None:
            tier_used = "tier2_ml"
            score = t2

        if not _is_certain(score):
            # ── Tier 3: Qwen ──────────────────────────────────────────────
            qwen = _tier3_classify(text)
            if qwen is not None:
                tier_used = "tier3_llm"
                qwen_label = qwen["label"]          # CLEAN | OFFENSIVE | HATE
                conf = qwen["confidence"]
                # Quy đổi về score [0,1]: CLEAN → score thấp, OFFENSIVE/HATE → score cao
                score = round(1.0 - conf if qwen_label == "CLEAN" else conf, 3)

    # ── Xác định nhãn 3 loại ────────────────────────────────────────────────
    if qwen_label is not None:
        final_label = qwen_label
    elif score >= THRESHOLD_TOXIC:
        final_label = "OFFENSIVE"       # T1 blacklist chỉ phát hiện offensive cơ bản
    else:
        final_label = "CLEAN"

    return {
        "text":  text,
        "toxic": final_label != "CLEAN",
        "label": final_label,
        "score": round(score, 3),
        "tier":  tier_used,
    }
