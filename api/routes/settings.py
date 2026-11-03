"""
[Owner: C] — Sprint 7
Settings API: GET/PUT /api/settings
Lưu vào JSON file trên disk (data/settings.json) — persist qua container restart.
Hot-reload pipeline thresholds VÀ tier flags ngay khi lưu.
"""
import json
import logging
from pathlib import Path
from threading import Lock

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Storage ─────────────────────────────────────────────────────────────────
_SETTINGS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "settings.json"
_LOCK = Lock()

DEFAULT_SETTINGS = {
    "threshold_toxic":      0.6,
    "threshold_clean":      0.15,
    "confidence_threshold": 0.80,
    "tier1_enabled":        True,
    "tier2_enabled":        True,
    "tier3_enabled":        False,
}


class SettingsPayload(BaseModel):
    threshold_toxic:       float = Field(default=0.6,   ge=0.0, le=1.0)
    threshold_clean:       float = Field(default=0.15,  ge=0.0, le=1.0)
    confidence_threshold:  float = Field(default=0.80,  ge=0.0, le=1.0)
    tier1_enabled:         bool  = Field(default=True)
    tier2_enabled:         bool  = Field(default=True)
    tier3_enabled:         bool  = Field(default=False)


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _read() -> dict:
    try:
        if _SETTINGS_PATH.exists():
            with open(_SETTINGS_PATH, encoding="utf-8") as f:
                saved = json.load(f)
            return {**DEFAULT_SETTINGS, **saved}
    except Exception as exc:
        logger.warning("[Settings] Failed to read settings.json: %s", exc)
    return dict(DEFAULT_SETTINGS)


def _write(data: dict) -> None:
    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as exc:
        logger.error("[Settings] Failed to write settings.json: %s", exc)


def get_settings() -> dict:
    """Đọc settings hiện tại."""
    with _LOCK:
        return _read()


# ─── Routes ──────────────────────────────────────────────────────────────────
@router.get("")
def read_settings():
    with _LOCK:
        return _read()


@router.put("")
def update_settings(payload: SettingsPayload):
    data = payload.model_dump()
    with _LOCK:
        existing = _read()
        merged = {**existing, **data}
        _write(merged)
    logger.info("[Settings] Updated: %s", data)

    # Hot-reload pipeline thresholds + tier flags ngay lập tức
    try:
        from api import pipeline
        _HOT_RELOAD_MAP = {
            "THRESHOLD_TOXIC": "threshold_toxic",
            "THRESHOLD_CLEAN": "threshold_clean",
            "TIER1_ENABLED":   "tier1_enabled",
            "TIER2_ENABLED":   "tier2_enabled",
            "TIER3_ENABLED":   "tier3_enabled",
        }
        for attr, key in _HOT_RELOAD_MAP.items():
            if hasattr(pipeline, attr):
                setattr(pipeline, attr, merged[key])
        logger.info(
            "[Settings] Pipeline hot-reload: toxic=%.2f clean=%.2f T1=%s T2=%s T3=%s",
            merged["threshold_toxic"], merged["threshold_clean"],
            merged["tier1_enabled"], merged["tier2_enabled"], merged["tier3_enabled"],
        )
    except Exception as exc:
        logger.warning("[Settings] Could not hot-reload pipeline: %s", exc)

    return {"ok": True, "settings": merged}
