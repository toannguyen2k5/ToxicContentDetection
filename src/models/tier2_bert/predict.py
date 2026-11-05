"""Inference for the PhoBERT-CNN model trained by phobert_cnn_and_visobert.ipynb.

Expected default artifacts:
    saved/phobert_cnn_1_recipe_best.pt
    saved/phobert_cnn_1_recipe_calibration.json
"""

import json
import os
from pathlib import Path
from threading import Lock
from typing import Any

SAVED_DIR = Path(__file__).resolve().parent / "saved"
MODEL_PATH = Path(
    os.environ.get(
        "TIER2_MODEL_PATH", str(SAVED_DIR / "phobert_cnn_1_recipe_best.pt")
    )
)
CALIBRATION_PATH = Path(
    os.environ.get(
        "TIER2_CALIBRATION_PATH",
        str(MODEL_PATH.with_name(MODEL_PATH.stem.replace("_best", "_calibration") + ".json")),
    )
)

_MODEL_LOCK = Lock()
_MODEL_BUNDLE: tuple[Any, Any, Any, dict[str, Any], dict[str, int], dict[str, Any]] | None = None


def _load_model():
    import torch
    from transformers import AutoTokenizer

    # Support both package import and running this module from its own folder.
    try:
        from src.models.tier2_bert.model import TextClassifier
    except ImportError:
        from .model import TextClassifier

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Tier 2 PhoBERT-CNN checkpoint not found: {MODEL_PATH}. "
            "Set TIER2_MODEL_PATH or place the notebook's *_best.pt in saved/."
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    try:
        checkpoint = torch.load(
            MODEL_PATH, map_location="cpu", weights_only=True
        )
    except TypeError:  # compatibility with older PyTorch versions
        checkpoint = torch.load(MODEL_PATH, map_location="cpu")

    model_name = checkpoint.get("model_name", "vinai/phobert-base")
    head = checkpoint.get("head", "cnn")
    backbone = checkpoint.get("backbone", "phobert_cnn")
    if backbone != "phobert_cnn" or head != "cnn":
        raise ValueError(
            "Checkpoint is not the PhoBERT-CNN model expected by this module: "
            f"backbone={backbone!r}, head={head!r}."
        )

    label_names = checkpoint.get("label_names", ["clean", "offensive", "hate"])
    label_to_id = {name: i for i, name in enumerate(label_names)}
    if set(label_to_id) != {"clean", "offensive", "hate"}:
        raise ValueError(f"Unexpected label_names in checkpoint: {label_names}")

    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=False)
    model = TextClassifier(
        model_name=model_name,
        head="cnn",
        num_labels=len(label_names),
        kernel_sizes=tuple(checkpoint.get("kernel_sizes", [2, 3, 4])),
        num_filters=int(checkpoint.get("num_filters", 128)),
        dropout=float(checkpoint.get("dropout", 0.3)),
        last_k=int(checkpoint.get("last_k", 4)),
    )
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    model.to(device).eval()

    calibration = {"temperature": 1.0, "threshold": 0.99}
    if CALIBRATION_PATH.is_file():
        with CALIBRATION_PATH.open("r", encoding="utf-8") as f:
            calibration.update(json.load(f))

    return model, tokenizer, device, checkpoint, label_to_id, calibration


def load_model():
    global _MODEL_BUNDLE
    if _MODEL_BUNDLE is None:
        with _MODEL_LOCK:
            if _MODEL_BUNDLE is None:
                _MODEL_BUNDLE = _load_model()
    return _MODEL_BUNDLE


def predict(text: str) -> dict:
    """Classify one Vietnamese comment using the notebook's text-only setup."""
    import torch

    if not isinstance(text, str) or not text.strip():
        raise ValueError("text must be a non-empty string")

    model, tokenizer, device, checkpoint, label_to_id, calibration = load_model()

    # Notebook preprocessing: PhoBERT input is word-segmented with VnCoreNLP.
    from src.preprocessing.tokenizer import segment_phobert

    segmented_text = segment_phobert(text)
    max_len = int(checkpoint.get("max_len", 160))
    encoded = tokenizer(
        segmented_text,
        max_length=max_len,
        truncation=True,
        padding=False,  # notebook uses dynamic padding; batch size is one here
        return_tensors="pt",
    )
    input_ids = encoded["input_ids"].to(device)
    attention_mask = encoded["attention_mask"].to(device)

    with torch.inference_mode():
        logits = model(input_ids=input_ids, attention_mask=attention_mask)[0]
        temperature = max(float(calibration.get("temperature", 1.0)), 1e-6)
        probabilities = torch.softmax(logits / temperature, dim=-1)

    id_to_label = {idx: label for label, idx in label_to_id.items()}
    predicted_index = int(probabilities.argmax().item())
    probability_dict = {
        id_to_label[i]: float(probabilities[i].item())
        for i in range(len(id_to_label))
    }
    clean_probability = probability_dict["clean"]

    return {
        "label": id_to_label[predicted_index],
        "score": float(1.0 - clean_probability),
        "confidence": float(probabilities[predicted_index].item()),
        "probabilities": probability_dict,
        "threshold": float(calibration.get("threshold", 0.99)),
        "tier": 2,
    }
