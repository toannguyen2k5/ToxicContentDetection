# Hướng dẫn Docker cho pbl6-toxic-detector

## Cấu trúc file cần thêm vào project

Copy các file/thư mục sau vào **thư mục gốc** của project (ngang hàng với `README.md`, `requirements.txt`):

```
pbl6-toxic-detector/
├── docker-compose.yml
├── .dockerignore
├── .env.example
└── docker/
    ├── api.Dockerfile
    ├── image_service.Dockerfile
    ├── dashboard.Dockerfile
    └── nginx.dashboard.conf
```

## Trước khi chạy

1. Copy `.env.example` → `.env`, điền `QWEN_API_KEY`, `QWEN_API_URL`.
2. Tạo file `image_service/requirements.txt` (torch, open-clip-torch/clip, fastapi, uvicorn, pillow...) — hiện tại `requirements.txt` gốc dùng chung cho `api`, nhưng CLIP thường cần version torch khác nên tách riêng cho nhẹ.
3. Đảm bảo model weights đã có trong:
   - `src/models/tier1_svm/saved/` (tfidf.pkl, svm.pkl)
   - `src/models/tier2_bert/saved/` (model weights BERT)
   - `image_service/saved/` (CLIP cache)
   → Những thư mục này **không** nằm trong image, chỉ mount volume, nên nhớ có sẵn trước khi `docker compose up`.

## Chạy

```bash
docker compose build
docker compose up -d
docker compose logs -f api
```

- API: http://localhost:8000
- Image service: http://localhost:8001
- Dashboard: http://localhost:3000

## Tier 3 - Qwen chạy bằng vLLM NGOÀI Docker (trên máy host)

vLLM **không** nằm trong `docker-compose.yml` — bạn tự cài và chạy trực tiếp trên máy host (Windows/Linux có GPU), Docker chỉ có container `api` gọi ra ngoài tới nó.

**Cài và chạy vLLM trên host** (cần Python + GPU NVIDIA, khuyến khích chạy trong WSL2 nếu bạn dùng Windows vì vLLM official chỉ hỗ trợ Linux):

```bash
pip install vllm
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000
```

Lệnh này tự tải model từ HuggingFace vào cache của máy host (`~/.cache/huggingface`) và serve API chuẩn OpenAI tại `http://localhost:8000/v1/chat/completions`.

**Container `api` gọi ra máy host bằng cách nào?**

Container không dùng được `localhost` để trỏ về máy host (localhost trong container là chính nó). Docker Desktop (Windows/Mac) cung cấp sẵn tên miền đặc biệt `host.docker.internal` để container gọi ra host — đây là giá trị mặc định trong `QWEN_API_URL` ở `.env.example`. Nếu chạy trên Linux server, `docker-compose.yml` đã có sẵn dòng `extra_hosts: host.docker.internal:host-gateway` để hỗ trợ tương tự.

Kiểm tra vLLM trên host đã chạy trước khi build container:
```bash
curl http://localhost:8000/v1/models
```

Nếu bạn đổi port vLLM chạy trên host (không phải 8000), nhớ sửa lại `QWEN_API_URL` trong `.env` cho khớp.

## Một vài lưu ý riêng cho project này

- **`extension/`**: KHÔNG đóng gói Docker. Đây là Chrome extension, load thủ công qua `chrome://extensions` → "Load unpacked". `content.js` sẽ gọi API ở `localhost:8000` (CORS cần bật trong `api/main.py`).
- **`notebooks/`**: không đưa vào Docker, chỉ dùng lúc research/training. Sau khi train xong ở notebook, export weights vào `src/models/.../saved/` rồi mount vào container như trên.
- **redis**: `api/cache.py` nếu hiện đang cache bằng dict trong RAM hoặc file, có thể bỏ hẳn service `redis` trong compose. Nếu sau này muốn cache đa tiến trình / share giữa nhiều worker uvicorn thì giữ lại.
- **GPU cho BERT/CLIP**: nếu máy có GPU NVIDIA, cài `nvidia-container-toolkit` trên host, rồi bật phần `deploy.resources.reservations.devices` (đã comment sẵn trong `image_service`, có thể thêm tương tự cho `api`), và đổi base image torch sang bản CUDA phù hợp.
- **Dashboard gọi API**: `dashboard/src/api/client.js` nên đọc URL từ biến môi trường build-time (`REACT_APP_API_URL`) thay vì hardcode `localhost:8000`, để dễ đổi khi deploy lên server thật.

## Dev nhanh không cần rebuild image mỗi lần sửa code (optional)

Thêm vào service `api` trong `docker-compose.yml` (chỉ dùng lúc dev):

```yaml
    volumes:
      - ./api:/app/api
      - ./src:/app/src
    command: uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```
