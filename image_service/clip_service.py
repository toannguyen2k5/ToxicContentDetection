"""
[Owner: C]
FastAPI service riêng cho CLIP - chạy trên localhost:8001, dùng để check ảnh
độc hại/nhạy cảm kèm text.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Image Service (CLIP)", version="0.1.0")


class EmbedRequest(BaseModel):
    image_url: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest):
    # TODO(C): load CLIP model từ ./saved, tính embedding / classify ảnh
    return {"image_url": req.image_url, "label": "unknown", "score": 0.0}
