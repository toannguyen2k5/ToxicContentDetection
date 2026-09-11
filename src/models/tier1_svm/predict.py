"""
[Owner: B]
Tier 1: SVM + TF-IDF - model nhanh, chạy đầu tiên để lọc các case rõ ràng.
"""
from pathlib import Path

SAVED_DIR = Path(__file__).parent / "saved"


def load_model():
    # TODO(B): joblib.load(SAVED_DIR / "svm.pkl"), joblib.load(SAVED_DIR / "tfidf.pkl")
    return None


def predict(text: str) -> dict:
    # TODO(B): return {"label": ..., "score": ..., "tier": 1}
    return {"label": "clean", "score": 0.0, "tier": 1}
