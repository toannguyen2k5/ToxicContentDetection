"""
[Owner: A]
Xử lý batch nhiều comment cùng lúc (dùng cho dashboard quét log hàng loạt).
"""
from api import pipeline


def predict_batch(texts: list[str]) -> list[dict]:
    # Chạy tuần tự qua pipeline 3 tier cho từng text.
    # TODO(A): chạy song song (asyncio.gather / ThreadPoolExecutor) khi cần
    # xử lý số lượng lớn, và cân nhắc dùng cache.py để tránh tính lại text trùng.
    return [pipeline.predict_text(t) for t in texts]
