# pbl6-toxic-detector

Hệ thống phát hiện bình luận độc hại tiếng Việt, pipeline 3 tier: SVM → BERT (ViSoBERT/BAMIBERT) → Qwen API.

## Chạy bằng Docker

```bash
cp .env.example .env
# điền QWEN_API_KEY, QWEN_API_URL vào .env

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

## Việc cần làm tiếp (đã có placeholder, tìm `TODO(...)` trong code)

- [ ] A: `src/preprocessing/normalizer.py`, `tokenizer.py` — implement chuẩn hoá thật
- [ ] A: `extension/content.js` — scan DOM + gọi API + blur
- [ ] B: `src/models/tier1_svm/predict.py`, `tier2_bert/predict.py` — load model đã train
- [ ] C: `src/tier3_qwen/client.py` — gọi Qwen API thật
- [ ] C: `image_service/clip_service.py` — load CLIP model
- [ ] C: `dashboard/src/components/*.jsx` — nối vào API thật, vẽ chart
