"""
[Owner: C] — Task C-09, C-10
Tier 3: gọi Qwen chạy LOCAL qua Ollama (OpenAI-compat API /v1/chat/completions).
Dùng cho case khó nhất mà Tier 1 + 2 vẫn không chắc chắn (vùng xám 0.3-0.7).
"""
import asyncio
import json
import os

import httpx

from .prompts import TOXIC_CLASSIFICATION_PROMPT

# ---------------------------------------------------------------------------
# Config — đọc từ .env, fallback về Ollama local
# ---------------------------------------------------------------------------
QWEN_API_URL = os.getenv(
    "QWEN_API_URL", "http://localhost:11434/v1/chat/completions"
)
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "not-needed")
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "qwen3-4b-local")

# Ngưỡng tin cậy: Qwen thắng Tier 2 chỉ khi confidence >= threshold
QWEN_CONFIDENCE_THRESHOLD = float(os.getenv("QWEN_CONFIDENCE_THRESHOLD", "0.8"))

_VALID_LABELS = {"CLEAN", "OFFENSIVE", "HATE"}
_HEADERS = {
    "Authorization": f"Bearer {QWEN_API_KEY}",
    "Content-Type": "application/json",
}


# ---------------------------------------------------------------------------
# C-09: Async Ollama client
# ---------------------------------------------------------------------------
async def classify_with_qwen(text: str) -> dict:
    """
    Gọi Qwen qua Ollama OpenAI-compat API để phân loại comment.

    Returns (thành công):
        {"label": str, "confidence": float, "reason": str, "tier": 3}
    Returns (lỗi):
        {"label": "unknown", "confidence": 0.0, "tier": 3, "error": str}
    """
    prompt = TOXIC_CLASSIFICATION_PROMPT.format(text=text)
    payload = {
        "model": QWEN_MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 150,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(2):  # thử tối đa 2 lần (retry 1 lần)
            try:
                resp = await client.post(
                    QWEN_API_URL, json=payload, headers=_HEADERS
                )
                resp.raise_for_status()
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                return _parse_response(raw)
            except (httpx.RequestError, httpx.HTTPStatusError, KeyError) as e:
                if attempt == 1:
                    return {
                        "label": "unknown",
                        "confidence": 0.0,
                        "tier": 3,
                        "error": str(e),
                    }
                await asyncio.sleep(1)  # chờ 1s trước khi retry


# ---------------------------------------------------------------------------
# Parse response
# ---------------------------------------------------------------------------
def _parse_response(raw: str) -> dict:
    """
    Parse JSON từ Qwen. Xử lý các trường hợp:
    - JSON thuần: {"label": ..., "confidence": ..., "reason": ...}
    - Bọc trong ```json ... ```
    - Qwen3 có <think>...</think> trước JSON (thinking mode)
    """
    # Xóa thinking block của Qwen3 nếu có
    if "<think>" in raw and "</think>" in raw:
        raw = raw.split("</think>")[-1].strip()

    # Xóa markdown code block nếu có
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{"):
                raw = stripped
                break

    try:
        data = json.loads(raw)
        label = str(data.get("label", "CLEAN")).upper()
        if label not in _VALID_LABELS:
            label = "CLEAN"
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))
        reason = str(data.get("reason", ""))
        return {
            "label": label,
            "confidence": confidence,
            "reason": reason,
            "tier": 3,
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        # Không parse được → fallback safe
        return {"label": "CLEAN", "confidence": 0.5, "tier": 3, "raw": raw}


# ---------------------------------------------------------------------------
# C-10: Conflict resolution
# ---------------------------------------------------------------------------
def apply_conflict_resolution(tier2_result: dict, qwen_result: dict) -> dict:
    """
    Quyết định kết quả cuối cùng giữa Tier 2 và Tier 3.

    Rule:
    - Qwen lỗi (label="unknown") → giữ Tier 2
    - Qwen confidence >= threshold (0.8) → dùng Qwen
    - Qwen confidence < threshold → giữ Tier 2 (Qwen không chắc)
    """
    if qwen_result.get("label") == "unknown":
        return tier2_result

    if qwen_result.get("confidence", 0.0) >= QWEN_CONFIDENCE_THRESHOLD:
        return qwen_result

    return tier2_result
