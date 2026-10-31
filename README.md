# pbl6-toxic-detector

Hệ thống phát hiện bình luận độc hại tiếng Việt, pipeline 3 tier: TF-IDF + Linear SVM → PhoBERT cross-attention → Qwen3 qua Ollama.

## Chạy bằng Docker

```bash
cp .env.example .env
# Cài Qwen GGUF từ Modelfile và chạy Ollama trên máy host trước khi cần Tier 3:
ollama create qwen3-4b-local -f Modelfile

docker compose build
docker compose up -d
```

- API: http://localhost:8000/health
- Image service: http://localhost:8001/health
- Dashboard: http://localhost:3000

Chi tiết đầy đủ (mount volume model, dev mode, GPU...) xem `DOCKER_README.md`.

## Phân công (theo cấu trúc thư mục)

| Khu vực | Owner |
|---|---|
| `data/`, `src/preprocessing/`, `api/`, `extension/` | A |
| `notebooks/annotation`, `notebooks/models`, `src/models/` | B |
| `notebooks/visualization`, `src/tier3_qwen/`, `dashboard/`, `image_service/` | C |

Tier 1 và Tier 2 sử dụng checkpoint trong `src/models/.../saved/`. PhoBERT và VnCoreNLP
có thể tải dữ liệu lần đầu chạy; Qwen chỉ được gọi khi hai tier đầu chưa đủ chắc chắn.
Nếu chạy API ngoài Docker, cần cài Java 8+ cho VnCoreNLP. Điểm `score` của SVM là
điểm phục vụ định tuyến, không phải xác suất đã hiệu chuẩn.
Chi tiết mount model và cấu hình Qwen xem `DOCKER_README.md`.

Dashboard đọc lịch sử dự đoán thật từ các endpoint `/api/text/logs`, `/stats` và
`/charts`. API lưu lịch sử trong `data/predictions.sqlite3`; Docker đã mount `data/`
để giữ lịch sử qua lần khởi động lại. Thống kê và biểu đồ sẽ trống cho đến khi có
dự đoán đầu tiên; lịch sử mẫu không còn được dùng làm fallback.

- [ ] A: `extension/content.js` — scan DOM + gọi API + blur
- [ ] C: `image_service/clip_service.py` — load CLIP model
- [ ] C: `dashboard/src/components/*.jsx` — nối vào API thật, vẽ chart
