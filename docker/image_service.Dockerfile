# docker/image_service.Dockerfile
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# requirements riêng cho image_service (CLIP/torch có thể khác version với api)
COPY image_service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY image_service/ ./image_service/

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["uvicorn", "image_service.clip_service:app", "--host", "0.0.0.0", "--port", "8001"]
