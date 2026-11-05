"""Inference for the trained TF-IDF classifier."""
import math
from pathlib import Path
from threading import Lock
from typing import Any

from src.preprocessing.normalizer import normalize_text
from src.preprocessing.tokenizer import tokenize

SAVED_DIR = Path(__file__).resolve().parent / "saved"
MODEL_PATH = SAVED_DIR / "tier1_tfidf.joblib"
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

    if isinstance(model, dict):
        classifier = model.get("clf")
        vectorizers = model.get("vectorizers")
        model_labels = model.get("labels")
        if classifier is None or not vectorizers or not model_labels:
            raise ValueError("Tier 1 model bundle is missing classifier metadata")

        from scipy.sparse import hstack

        features = hstack(
            [vectorizer.transform([segmented]) for _, vectorizer in vectorizers],
            format="csr",
        )
        classes = list(classifier.classes_)
        margins = classifier.decision_function(features)[0]
        labels = [
            _label_name(model_labels[int(label)])
            for label in classes
        ]
        temperature = float(model.get("temperature", 1.0))
        if not math.isfinite(temperature) or temperature <= 0:
            raise ValueError("Tier 1 model temperature must be a positive finite number")
    else:
        classes = list(model.classes_)
        margins = model.decision_function([segmented])[0]
        labels = [_label_name(label) for label in classes]
        temperature = 1.0

    if len(classes) != len(margins):
        raise ValueError("Tier 1 classifier returned an unexpected number of class scores")

    max_margin = max(float(margin) for margin in margins)
    exp_margins = [
        math.exp(max(-50.0, (float(margin) - max_margin) / temperature))
        for margin in margins
    ]
    denominator = sum(exp_margins)
    class_scores = [value / denominator for value in exp_margins]
    predicted_index = max(range(len(class_scores)), key=class_scores.__getitem__)
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
