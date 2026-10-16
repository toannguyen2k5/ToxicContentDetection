"""
[Owner: A]
Pipeline phát hiện toxic content - kiến trúc 3 tier:
  Tier 1: TF-IDF (hiện tại: placeholder bằng blacklist, sẽ thay bằng model TF-IDF thật)
  Tier 2: ML model (PhoBERT / ViSoBERT) - TODO(A)
  Tier 3: LLM (Qwen3-4B) - TODO(A)

Ý tưởng: tier nhanh (rẻ) chạy trước; chỉ khi kết quả không đủ "chắc chắn"
thì mới leo lên tier tiếp theo (chậm hơn, chính xác hơn). Hiện tại chỉ Tier 1
hoạt động thật, Tier 2/3 là stub trả về None để dễ cắm model vào sau mà
không phải sửa lại API hay extension.
"""
import re
import unicodedata

# Ngưỡng quyết định (0.0 - 1.0)
THRESHOLD_TOXIC = 0.6   # >= ngưỡng này -> chắc chắn toxic, không cần leo tier
THRESHOLD_CLEAN = 0.15  # <= ngưỡng này -> chắc chắn sạch, không cần leo tier

# Danh sách từ khóa placeholder cho Tier 1 - CHỈ ĐỂ TEST LUỒNG HOẠT ĐỘNG,
# thay bằng model TF-IDF đã train thật khi có dữ liệu.
_BLACKLIST = {
    "đồ ngu", "ngu", "óc chó", "súc vật", "đồ chó", "con chó",
    "đĩ", "đm", "dm", "vcl", "vl", "clgt", "cút", "thằng khốn",
    "đồ khốn", "rác rưởi", "thằng ngu", "con điên", "đồ điên",
    "địt", "cặc", "lồn", "buồi",
}


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def tier1_score(text: str) -> float:
    """
    PLACEHOLDER cho TF-IDF classifier.
    Hiện tại: đếm số từ khóa toxic khớp trên tổng số từ, chuẩn hoá về [0, 1].
    TODO(A): thay bằng vectorizer + classifier TF-IDF đã train.
    """
    norm = _normalize(text)
    words = norm.split()
    if not words:
        return 0.0

    hits = sum(1 for kw in _BLACKLIST if kw in norm)
    if hits == 0:
        return 0.0

    # Càng nhiều từ khóa khớp trên câu ngắn thì điểm càng cao
    score = min(1.0, hits / max(3, len(words) * 0.3))
    return round(max(score, 0.75), 3)  # đã khớp blacklist thì luôn coi là khá chắc toxic


def tier2_score(text: str):
    """
    TODO(A): PhoBERT / ViSoBERT.
    Trả về float [0,1] khi đã có model, hoặc None nếu chưa implement (bỏ qua tier này).
    """
    return None


def tier3_score(text: str):
    """
    TODO(A): Qwen3-4B (LLM), dùng cho các case tier 1 + tier 2 không chắc chắn.
    Trả về float [0,1] khi đã có model, hoặc None nếu chưa implement (bỏ qua tier này).
    """
    return None


def predict_text(text: str) -> dict:
    """
    Chạy pipeline 3 tier cho 1 đoạn text, trả về kết quả chuẩn hoá.
    """
    text = text or ""
    tier_used = "tier1_tfidf"
    score = tier1_score(text)

    if not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN):
        t2 = tier2_score(text)
        if t2 is not None:
            tier_used = "tier2_ml"
            score = t2

        if not (score >= THRESHOLD_TOXIC or score <= THRESHOLD_CLEAN):
            t3 = tier3_score(text)
            if t3 is not None:
                tier_used = "tier3_llm"
                score = t3

    toxic = score >= 0.5
    return {
        "text": text,
        "toxic": toxic,
        "label": "toxic" if toxic else "clean",
        "score": score,
        "tier": tier_used,
    }
