"""
[Owner: C]
Tier 3: gọi Qwen chạy LOCAL qua vLLM (API chuẩn OpenAI /v1/chat/completions),
dùng cho case khó nhất mà Tier 1 + 2 vẫn không chắc chắn.
"""
import os
import requests

from .prompts import TOXIC_CLASSIFICATION_PROMPT

QWEN_API_URL = os.getenv("QWEN_API_URL", "http://vllm:8000/v1/chat/completions")
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "not-needed")
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "Qwen/Qwen2.5-7B-Instruct")


def classify_with_qwen(text: str) -> dict:
    prompt = TOXIC_CLASSIFICATION_PROMPT.format(text=text)

    try:
        response = requests.post(
            QWEN_API_URL,
            headers={
                "Authorization": f"Bearer {QWEN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": QWEN_MODEL_NAME,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": 100,
            },
            timeout=30,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

        # TODO(C): parse content (model trả JSON dạng {"label": ..., "confidence": ...})
        # thành {"label": ..., "score": ...} thật thay vì trả raw text như dưới đây.
        return {"label": "clean", "score": 0.0, "tier": 3, "raw": content}

    except requests.exceptions.RequestException as e:
        # Sẽ rơi vào đây nếu vLLM chưa load xong model, container chưa lên, hoặc GPU lỗi
        return {"label": "unknown", "score": 0.0, "tier": 3, "error": str(e)}
