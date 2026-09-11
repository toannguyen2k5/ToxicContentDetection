"""
[Owner: A]
FastAPI entrypoint - chạy trên localhost:8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import text as text_routes

app = FastAPI(title="Toxic Content Detection API", version="0.1.0")

# TODO(A): giới hạn allow_origins lại khi deploy (hiện để "*" cho dễ dev với extension/dashboard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(text_routes.router, prefix="/api/text", tags=["text"])


@app.get("/health")
def health():
    return {"status": "ok"}
