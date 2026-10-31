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

1. Copy `.env.example` → `.env` và kiểm tra URL/model Qwen.
2. Tạo file `image_service/requirements.txt` (torch, open-clip-torch/clip, fastapi, uvicorn, pillow...) — hiện tại `requirements.txt` gốc dùng chung cho `api`, nhưng CLIP thường cần version torch khác nên tách riêng cho nhẹ.
3. Đảm bảo model weights đã có trong:
   - `src/models/tier1_svm/saved/model_svm.pkl`
   - `src/models/tier2_bert/saved/phobert_crossattn_retrained_all.pt`
   PhoBERT base/tokenizer và VnCoreNLP segmenter được tải khi cần.
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

## Tier 3 - Qwen3 chạy bằng Ollama NGOÀI Docker (trên máy host)

Ollama **không** nằm trong `docker-compose.yml`; chạy Ollama trên máy host để API container gọi tới.

Tạo model từ file GGUF trong repository và khởi động Ollama:

```powershell
ollama create qwen3-4b-local -f Modelfile
ollama serve
```

Ollama cung cấp OpenAI-compatible API tại `http://localhost:11434/v1/chat/completions`.

**Container `api` gọi ra máy host bằng cách nào?**

Container không dùng được `localhost` để trỏ về máy host. `host.docker.internal` được cấu hình trong `.env.example`; Linux được hỗ trợ qua `extra_hosts` trong compose.

Tạo file `.env` từ `.env.example`, sau đó kiểm tra Ollama:
```bash
curl http://localhost:11434/api/tags
```

Nếu đổi endpoint hoặc tên model, sửa `QWEN_API_URL` và `QWEN_MODEL_NAME` trong `.env`.

## Một vài lưu ý riêng cho project này

- **`extension/`**: KHÔNG đóng gói Docker. Đây là Chrome extension, load thủ công qua `chrome://extensions` → "Load unpacked". `content.js` sẽ gọi API ở `localhost:8000` (CORS cần bật trong `api/main.py`).
- **`notebooks/`**: không đưa vào Docker, chỉ dùng lúc research/training. Sau khi train xong ở notebook, export weights vào `src/models/.../saved/` rồi mount vào container như trên.
- **redis**: `api/cache.py` nếu hiện đang cache bằng dict trong RAM hoặc file, có thể bỏ hẳn service `redis` trong compose. Nếu sau này muốn cache đa tiến trình / share giữa nhiều worker uvicorn thì giữ lại.
- **VnCoreNLP**: Tier 2 dùng Java để phân đoạn từ; API image đã cài JRE và lưu dữ liệu tải về trong `src/preprocessing/vncorenlp`.
- **GPU cho PhoBERT/CLIP**: nếu máy có GPU NVIDIA, cài `nvidia-container-toolkit` trên host, bật phần `deploy.resources.reservations.devices` và đổi base image torch sang bản CUDA phù hợp.
- **Dashboard gọi API**: `dashboard/src/api/client.js` nên đọc URL từ biến môi trường build-time (`REACT_APP_API_URL`) thay vì hardcode `localhost:8000`, để dễ đổi khi deploy lên server thật.

## Dev nhanh không cần rebuild image mỗi lần sửa code (optional)

Thêm vào service `api` trong `docker-compose.yml` (chỉ dùng lúc dev):

```yaml
    volumes:
      - ./api:/app/api
      - ./src:/app/src
    command: uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```
