"""Inference for the trained PhoBERT cross-attention classifier."""
from pathlib import Path
from threading import Lock
from typing import Any

SAVED_DIR = Path(__file__).parent / "saved"
MODEL_PATH = SAVED_DIR / "phobert_crossattn_retrained_all.pt"
_MODEL_LOCK = Lock()
_MODEL_BUNDLE: tuple[Any, Any, Any, dict[str, Any], dict[str, int]] | None = None


def load_model() -> tuple[Any, Any, Any, dict[str, Any], dict[str, int]]:
    global _MODEL_BUNDLE

    if _MODEL_BUNDLE is None:
        with _MODEL_LOCK:
            if _MODEL_BUNDLE is None:
                _MODEL_BUNDLE = _load_model()
    return _MODEL_BUNDLE


def _load_model() -> tuple[Any, Any, Any, dict[str, Any], dict[str, int]]:
    import torch
    from transformers import AutoTokenizer

    from src.models.tier2_bert.model import PhoBERTCrossAttention

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Tier 2 PhoBERT model not found: {MODEL_PATH}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
    model_name = checkpoint.get("model_name", "vinai/phobert-base")
    label_to_id = checkpoint.get(
        "label_to_id", {"clean": 0, "offensive": 1, "hate": 2}
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=False)
    model = PhoBERTCrossAttention(
        model_name=model_name,
        num_labels=len(label_to_id),
        heads=checkpoint.get("num_heads", 8),
        attn_dropout=checkpoint.get("attn_dropout", 0.1),
        dropout=checkpoint.get("dropout", 0.3),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    return model, tokenizer, device, checkpoint, label_to_id


def predict(text: str, quote_text: str = "") -> dict:
    import torch

    from src.preprocessing.tokenizer import segment_phobert

    model, tokenizer, device, checkpoint, label_to_id = load_model()
    segmented_text = segment_phobert(text)
    segmented_quote = segment_phobert(quote_text)
    text_inputs = tokenizer(
        segmented_text,
        max_length=checkpoint.get("max_text_len", 160),
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )
    quote_inputs = tokenizer(
        segmented_quote,
        max_length=checkpoint.get("max_quote_len", 96),
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )
    inputs = {
        "text_input_ids": text_inputs["input_ids"].to(device),
        "text_attention_mask": text_inputs["attention_mask"].to(device),
        "quote_input_ids": quote_inputs["input_ids"].to(device),
        "quote_attention_mask": quote_inputs["attention_mask"].to(device),
        "quote_present": torch.tensor(
            [float(bool(segmented_quote.strip()))], device=device
        ),
    }

    with torch.inference_mode():
        probabilities = torch.softmax(model(**inputs), dim=-1)[0]

    clean_index = label_to_id["clean"]
    predicted_index = int(probabilities.argmax().item())
    id_to_label = {index: label for label, index in label_to_id.items()}
    return {
        "label": id_to_label[predicted_index],
        "score": float(1.0 - probabilities[clean_index].item()),
        "tier": 2,
    }
