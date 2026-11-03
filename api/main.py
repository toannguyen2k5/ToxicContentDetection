"""
[Owner: A]
FastAPI entrypoint - chạy trên localhost:8000
"""
import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
load_dotenv()

from api.routes import text as text_routes
from api.routes import settings as settings_routes

app = FastAPI(title="Toxic Content Detection API", version="0.1.0")

# TODO(A): giới hạn allow_origins lại khi deploy (hiện để "*" cho dễ dev với extension/dashboard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(text_routes.router,     prefix="/api/text",     tags=["text"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["settings"])


@app.on_event("startup")
def _preload_csv():
    """Preload CSV vào cache ngay khi khởi động (background thread)."""
    def _load():
        import logging
        log = logging.getLogger("api.startup")
        log.info("[Startup] Preloading training CSV in background...")
        text_routes._get_csv_data()
        log.info("[Startup] CSV preload done: %d rows", len(text_routes._csv_cache or []))
    threading.Thread(target=_load, daemon=True, name="csv-preloader").start()


@app.get("/health")
def health():
    return {"status": "ok"}
