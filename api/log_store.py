"""
[Owner: C] — Task A-19c (làm thay A, A bận)
Log store: lưu kết quả classify từ extension vào RAM (deque FIFO).
Tối đa MAX_LOGS entries; thread-safe với Lock.

Không dùng DB để giữ đơn giản — nếu restart server thì log mất,
nhưng đủ dùng cho demo và dev. Nâng cấp SQLite sau nếu cần.
"""
import threading
import time
from collections import deque

MAX_LOGS = 500   # giữ tối đa 500 entry gần nhất

_lock    = threading.Lock()
_logs: deque[dict] = deque(maxlen=MAX_LOGS)
_counter = 0

# Map tier string → số tier để dashboard hiển thị
_TIER_MAP = {"tier1_tfidf": 1, "tier2_ml": 2, "tier3_llm": 3}


def _next_id() -> int:
    global _counter
    _counter += 1
    return _counter


def add_log(
    text: str,
    label: str,
    score: float,
    tier: str,
    latency_ms: int,
    source_url: str = "",
) -> dict:
    """
    Thêm một entry log mới (newest-first).
    Trả về entry đã lưu (để API trả về cùng kèm response nếu muốn).
    """
    tier_num = _TIER_MAP.get(tier, 1)
    entry = {
        "id":          _next_id(),
        "text":        text,
        "label":       label.upper(),
        # prob_t1/t2 lấy từ score của tier tương ứng, còn lại = 0
        "prob_t1":     round(score, 3) if tier_num == 1 else 0.0,
        "prob_t2":     round(score, 3) if tier_num == 2 else 0.0,
        "tier_used":   tier_num,
        "latency_ms":  latency_ms,
        "source_url":  source_url or "",
        "timestamp":   time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    with _lock:
        _logs.appendleft(entry)   # newest first
    return entry


def get_logs(limit: int = 100) -> list[dict]:
    """Trả về `limit` entries gần nhất (đã sorted newest-first)."""
    with _lock:
        return list(_logs)[: min(limit, MAX_LOGS)]


def get_stats() -> dict:
    """Thống kê nhanh để hiển thị trên dashboard."""
    with _lock:
        entries = list(_logs)
    total = len(entries)
    if total == 0:
        return {"total": 0, "clean": 0, "offensive": 0, "hate": 0}
    return {
        "total":     total,
        "clean":     sum(1 for e in entries if e["label"] == "CLEAN"),
        "offensive": sum(1 for e in entries if e["label"] == "OFFENSIVE"),
        "hate":      sum(1 for e in entries if e["label"] == "HATE"),
    }


def clear() -> None:
    """Xóa toàn bộ log (dùng cho testing)."""
    with _lock:
        _logs.clear()
