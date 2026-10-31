"""Inference for the trained TF-IDF + Linear SVM classifier."""
import math
from pathlib import Path
from threading import Lock
from typing import Any

from src.preprocessing.normalizer import normalize_text
from src.preprocessing.tokenizer import tokenize

SAVED_DIR = Path(__file__).parent / "saved"
MODEL_PATH = SAVED_DIR / "model_svm.pkl"
_ID_TO_LABEL = {0: "clean", 1: "offensive", 2: "hate"}
_MODEL_LOCK = Lock()
_MODEL: Any = None


def load_model() -> Any:
    global _MODEL

    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                _MODEL = _load_model()
    return _MODEL


def _load_model() -> Any:
    import joblib

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Tier 1 SVM model not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def _label_name(label) -> str:
    try:
        return _ID_TO_LABEL[int(label)]
    except (KeyError, TypeError, ValueError):
        name = str(label).strip().lower()
        if name not in {"clean", "offensive", "hate"}:
            raise ValueError(f"Unexpected Tier 1 class label: {label!r}")
        return name


def predict(text: str) -> dict:
    cleaned = normalize_text(text)
    if not cleaned:
        return {"label": "clean", "score": 0.0, "tier": 1}
    model = load_model()
    segmented = " ".join(tokenize(cleaned))

    classes = list(model.classes_)
    margins = model.decision_function([segmented])[0]
    if len(classes) != len(margins):
        raise ValueError("Tier 1 SVM returned an unexpected number of class scores")

    max_margin = max(float(margin) for margin in margins)
    exp_margins = [
        math.exp(max(-50.0, float(margin) - max_margin)) for margin in margins
    ]
    denominator = sum(exp_margins)
    # Softmax converts SVM margins to a routing score; it is not probability calibration.
    class_scores = [value / denominator for value in exp_margins]
    predicted_index = max(range(len(class_scores)), key=class_scores.__getitem__)
    labels = [_label_name(label) for label in classes]
    toxic_score = min(
        1.0,
        max(
            0.0,
            sum(
                probability
                for label, probability in zip(labels, class_scores)
                if label != "clean"
            ),
        ),
    )

    return {
        "label": labels[predicted_index],
        "score": toxic_score,
        "tier": 1,
    }
