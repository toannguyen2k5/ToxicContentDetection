"""
[Owner: A]
Xử lý batch nhiều comment cùng lúc (dùng cho dashboard quét log hàng loạt).
"""


def predict_batch(texts: list[str]) -> list[dict]:
    # TODO(A): gọi pipeline 3 tier cho từng text, có thể chạy song song
    return [{"text": t, "label": "clean", "score": 0.0} for t in texts]
