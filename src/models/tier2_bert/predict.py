"""
[Owner: B]
Tier 2: ViSoBERT/BAMIBERT - dùng khi Tier 1 không chắc chắn (score nằm gần threshold).
"""
from pathlib import Path

SAVED_DIR = Path(__file__).parent / "saved"


def load_model():
    # TODO(B): load model + tokenizer từ SAVED_DIR (transformers.AutoModel...)
    return None


def predict(text: str) -> dict:
    # TODO(B): return {"label": ..., "score": ..., "tier": 2}
    return {"label": "clean", "score": 0.0, "tier": 2}
