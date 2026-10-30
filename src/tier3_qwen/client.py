"""Qwen client for the OpenAI-compatible Ollama endpoint."""
import asyncio
import json
import math
import os
import time
from typing import Any

import httpx

from .prompts import TOXIC_CLASSIFICATION_PROMPT

QWEN_API_URL = os.getenv(
    "QWEN_API_URL", "http://localhost:11434/v1/chat/completions"
)
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "not-needed")
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "qwen3-4b-local")
QWEN_CONFIDENCE_THRESHOLD = float(os.getenv("QWEN_CONFIDENCE_THRESHOLD", "0.8"))

_VALID_LABELS = {"CLEAN", "OFFENSIVE", "HATE"}
_HEADERS = {
    "Authorization": f"Bearer {QWEN_API_KEY}",
    "Content-Type": "application/json",
}


class QwenServiceError(RuntimeError):
    """Raised when the configured Qwen endpoint cannot classify a comment."""


def _payload(text: str) -> dict[str, Any]:
    return {
        "model": QWEN_MODEL_NAME,
        "messages": [
            {"role": "user", "content": TOXIC_CLASSIFICATION_PROMPT.format(text=text)}
        ],
        "temperature": 0,
        "max_tokens": 150,
    }


def _response_text(response: httpx.Response) -> str:
    content = response.json()["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise ValueError("Qwen response content must be a string")
    return content.strip()


async def classify_with_qwen(text: str) -> dict:
    """Classify text asynchronously; raises QwenServiceError on service failures."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(2):
            try:
                response = await client.post(
                    QWEN_API_URL, json=_payload(text), headers=_HEADERS
                )
                response.raise_for_status()
                return _parse_response(_response_text(response))
            except (
                httpx.RequestError,
                httpx.HTTPStatusError,
                KeyError,
                IndexError,
                TypeError,
                ValueError,
            ) as exc:
                if attempt == 1:
                    raise QwenServiceError(
                        f"Qwen classification request failed: {exc}"
                    ) from exc
                await asyncio.sleep(1)

    raise QwenServiceError("Qwen classification request failed without a response")


def classify_with_qwen_sync(text: str) -> dict:
    """Classify text synchronously for the API's synchronous routes."""
    with httpx.Client(timeout=30.0) as client:
        for attempt in range(2):
            try:
                response = client.post(
                    QWEN_API_URL, json=_payload(text), headers=_HEADERS
                )
                response.raise_for_status()
                return _parse_response(_response_text(response))
            except (
                httpx.RequestError,
                httpx.HTTPStatusError,
                KeyError,
                IndexError,
                TypeError,
                ValueError,
            ) as exc:
                if attempt == 1:
                    raise QwenServiceError(
                        f"Qwen classification request failed: {exc}"
                    ) from exc
                time.sleep(1)

    raise QwenServiceError("Qwen classification request failed without a response")


def _parse_response(raw: str) -> dict:
    if "<think>" in raw and "</think>" in raw:
        raw = raw.split("</think>")[-1].strip()

    if "```" in raw:
        for part in raw.split("```"):
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{"):
                raw = stripped
                break

    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Qwen response must be a JSON object")
        label = str(data["label"]).upper()
        if label not in _VALID_LABELS:
            raise ValueError(f"Unexpected Qwen label: {label}")
        confidence = float(data["confidence"])
        if not math.isfinite(confidence):
            raise ValueError("Qwen confidence must be a finite number")
        confidence = max(0.0, min(1.0, confidence))
        return {
            "label": label,
            "confidence": confidence,
            "reason": str(data.get("reason", "")),
            "tier": 3,
        }
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid Qwen classification response: {exc}") from exc


def apply_conflict_resolution(tier2_result: dict, qwen_result: dict) -> dict:
    """Use Qwen only when it returns a valid, sufficiently confident result."""
    if qwen_result["confidence"] >= QWEN_CONFIDENCE_THRESHOLD:
        return qwen_result
    return tier2_result
