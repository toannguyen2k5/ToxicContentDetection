"""Text cleanup matching the preprocessing used to train the TF-IDF model."""
import re
import unicodedata

_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_SPACE_RE = re.compile(r"\s+")
_REPEAT_RE = re.compile(r"(.)\1{3,}")


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = _URL_RE.sub(" ", text)
    text = _REPEAT_RE.sub(r"\1\1\1", text)
    return _SPACE_RE.sub(" ", text).strip()
