"""
[Owner: A]
Cache đơn giản trong RAM (dict + TTL thủ công). Nâng cấp lên Redis sau nếu cần
share cache giữa nhiều worker/instance.
"""
import time

_cache: dict[str, tuple[float, dict]] = {}
DEFAULT_TTL = 300  # giây


def get(key: str):
    item = _cache.get(key)
    if not item:
        return None
    expires_at, value = item
    if time.time() > expires_at:
        _cache.pop(key, None)
        return None
    return value


def set(key: str, value: dict, ttl: int = DEFAULT_TTL):
    _cache[key] = (time.time() + ttl, value)
