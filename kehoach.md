# PBL6 — Phát hiện & Che mờ Nội dung Độc hại trên Mạng xã hội

> **Đề tài:** Xây dựng hệ thống phát hiện và lọc nội dung độc hại trên mạng xã hội bằng mô hình học máy đa tầng, tích hợp Chrome Extension chạy hoàn toàn local.

---

## Nhóm & Vai trò

| | Vai trò | Domain chính |
|---|---|---|
| **A** | Backend & Extension Engineer | Python, FastAPI, JavaScript |
| **B** | ML Engineer & Data Scientist | PyTorch, HuggingFace, Sklearn |
| **C** | LLM & Frontend Engineer | Ollama, Streamlit/React, CLIP |

---

## Kiến trúc Hệ thống

Toàn bộ chạy **LOCAL** — không gọi API ngoài, không cần internet.

```
┌─────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                         │
│            (content.js chạy trên mọi website)               │
└──────────────────────┬──────────────────────────────────────┘
                       │ scan comment text
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           FastAPI Server  localhost:8000  (A)               │
│                                                             │
│  [Preprocessing]  normalize → teencode → tokenize           │
│       ↓                                                     │
│  [Cache check]   text hash → hit? trả ngay : tiếp tục       │
│       ↓                                                     │
│  [Batch queue]   gom 32 comments → 1 BERT forward pass      │
│       ↓                                                     │
│  TẦNG 1: TF-IDF + SVM  (~5ms)                               │
│    prob > 0.95 "SẠCH"  → trả về SẠCH  (không leo thang)     │
│    còn lại             → TẦNG 2                             │
│       ↓                                                     │
│  TẦNG 2: ViSoBERT  (~200ms)   ← hoặc BAMIBERT (thực nghiệm) │
│    prob > 0.9  → trả về kết quả ngay                        │
│    vùng xám 0.3-0.7  → TẦNG 3                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ chỉ ~20% cases
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Ollama  localhost:11434  (C)                        │
│                                                             │
│  TẦNG 3: Qwen text  (~2-5s, BẤT ĐỒNG BỘ)                    │
│    → Hiển thị kết quả Tầng 2 TRƯỚC                          │
│    → Qwen xử lý mia mai, ẩn dụ, teencode phức tạp           │
│    → Cập nhật lại UI nếu kết quả khác Tầng 2                │
│    → Conflict rule: Qwen > Tầng 2 nếu confidence > 0.8      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         Admin Dashboard  localhost:3000  (C)                │
│  Log viewer | Model stats | Data visualization | Settings   │
└─────────────────────────────────────────────────────────────┘

── SPRINT CUỐI (sau bảo vệ) ──────────────────────────────────
┌─────────────────────────────────────────────────────────────┐
│       CLIP Service  localhost:8001  (C)                     │
│  CLIP ViT-B/32 zero-shot  (~100ms, ~600MB VRAM)             │
│  → Extension scan <img> → gửi URL → CLIP classify → blur    │
│  → Không cần data gán nhãn (zero-shot)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Phân công Chi tiết

### A — Backend & Extension (Toàn bộ)

**FastAPI Server**
- `api/main.py`: entrypoint FastAPI localhost:8000
- `api/cache.py`: hash text → cache kết quả (tránh inference lặp)
- `api/batch.py`: gom 32 comments/batch → 1 forward pass
- `api/routes/text.py`: `POST /classify_text`, `GET /health`

**Preprocessing Pipeline**
- `src/preprocessing/normalizer.py`: Unicode full→half, teencode dict, loại URL/emoji/mention
- `src/preprocessing/tokenizer.py`: wrapper underthesea

**Chrome Extension** (toàn bộ)
- `extension/manifest.json`: config, permissions
- `extension/content.js`: MutationObserver → scan DOM → gọi API → blur CSS
- `extension/background.js`: service worker
- `extension/popup.html + popup.js + styles.css`: UI toggle, thống kê

**Báo cáo:** Chương Thu thập dữ liệu + Triển khai hệ thống

---

### B — ML & Evaluation (Toàn bộ)

**Annotation Lead**
- Viết annotation guideline (CLEAN / OFFENSIVE / HATE + ví dụ edge case)
- Tổng hợp nhãn từ A+B+C, tính Fleiss' Kappa
- Xử lý case conflict qua họp nhóm

**Data**
- Stratified sampling 10,000 comment để gán nhãn
- Data augmentation: synonym replacement, EDA tiếng Việt
- Export `labeled_train.csv`, `labeled_val.csv`, `labeled_test.csv`

**Model Training** (chạy trong notebooks, không vào production)
- `notebooks/05_train_svm.ipynb`: TF-IDF + SVM, tune, export `saved/`
- `notebooks/06_train_visobert.ipynb`: fine-tune ViSoBERT
- `notebooks/07_train_bamibert.ipynb`: fine-tune BAMIBERT (để so sánh)

**Evaluation Notebooks**
- `notebooks/08_compare_models.ipynb`: bảng F1, Precision, Recall
- `notebooks/09_mcnemar_test.ipynb`: kiểm định thống kê → chọn model tốt hơn
- `notebooks/10_error_analysis.ipynb`: phân tích lỗi chi tiết
- `notebooks/11_robustness_test.ipynb`: sai chính tả, teencode cực đoan

**Model production**: Sau thực nghiệm, export 1 model được chọn vào `src/models/`

**Báo cáo:** Chương Mô hình + Thực nghiệm & Đánh giá

---

### C — LLM & Dashboard & Visualization

**Qwen / Tier 3**
- Setup Ollama, tải Qwen model (1.8B hoặc 7B tuỳ VRAM)
- `src/tier3_qwen/client.py`: async Ollama API client
- `src/tier3_qwen/prompts.py`: prompt template cho tiếng Việt (mia mai, ẩn dụ)
- Implement conflict resolution logic

**Admin Dashboard — React**
- `dashboard/` — React app localhost:3000
- `LogViewer.jsx`: bảng log comment, nhãn dự đoán, timestamp, nguồn URL
- `ModelStats.jsx`: F1, Precision, Recall hiển thị từ eval results
- `Charts.jsx`: Recharts pie/line/bar charts
- `Settings.jsx`: slider threshold, toggle bật/tắt tầng
- `api/client.js`: axios gọi FastAPI `:8000` lấy dữ liệu

**Data Visualization** (cho báo cáo + dashboard)
- `notebooks/12_visualization.ipynb`
- Phân phối CLEAN/OFFENSIVE/HATE
- Word cloud, top toxic keywords
- Comment length distribution
- So sánh trước/sau preprocessing

**Báo cáo:** Chương Trực quan hóa + Phân tích kết quả

---

### Shared — Cả 3 người

- **Gán nhãn dữ liệu**: A+B+C cùng label (~3,300 comment/người), B tổng hợp
- **Họp sprint**: Mỗi 2 tuần, review tiến độ + demo nội bộ
- **Viết báo cáo**: Mỗi người viết chương phụ trách của mình

---

## Sprint Plan

### Sprint 1 · Tuần 1-2 · Planning & Setup
> **Deadline: Báo cáo tiến độ lần 1 cuối tuần 2**

| | Nhiệm vụ |
|---|---|
| A | Setup môi trường Python + FastAPI skeleton; crawl test 10 video/kênh |
| B | Đọc paper ViSoBERT, BAMIBERT, McNemar's test; viết tổng quan model |
| C | Đọc paper Qwen, cascade; cài Ollama, test gọi API đơn giản |
| Báo cáo 1 | Tên đề tài + mô tả bài toán + kế hoạch thực hiện |

---

### Sprint 2 · Tuần 3-4 · Data Crawling
| | Nhiệm vụ |
|---|---|
| A | Crawl lớn: 50 video × 4 kênh = 200 video; merge + dedup → mục tiêu 3-5M comment |
| B | Annotation guideline v1 (định nghĩa + ví dụ); tải ViSoBERT/BAMIBERT test inference |
| C | Test Qwen với 100 comment mẫu; viết prompt template v1 |

---

### Sprint 3 · Tuần 5-6 · Preprocessing & Annotation Prep
| | Nhiệm vụ |
|---|---|
| A | `normalizer.py` + `tokenizer.py`; chạy preprocessing toàn bộ raw data |
| B | Annotation guideline v2 (final); stratified sample 10,000 comment; chia batch A/B/C |
| C | Prompt template v2; test Qwen accuracy sơ bộ trên mẫu nhỏ |

---

### Sprint 4 · Tuần 7-8 · Annotation (Cả nhóm)
| | Nhiệm vụ |
|---|---|
| A+B+C | Label ~3,300 comment/người theo batch; họp xử lý case khó |
| A+B+C | Label chung 1,000 comment (inter-annotator agreement) |
| B | Tổng hợp nhãn, tính Fleiss' Kappa; export labeled dataset |
| A | Thiết kế API routes + implement caching layer |

---

### Sprint 5 · Tuần 9-10 · Train Model v1
> **Deadline: Báo cáo tiến độ lần 2 cuối tuần 10**

| | Nhiệm vụ |
|---|---|
| A | FastAPI batch processing (32/batch); setup logging request |
| B | Train SVM v1 → export; fine-tune ViSoBERT v1 → ghi F1 sơ bộ; viết `evaluate.py` |
| C | Hoàn thiện Qwen async + conflict resolution; Dashboard layout + log viewer |
| Báo cáo 2 | Tiến độ theo kế hoạch |

---

### Sprint 6 · Tuần 11-12 · Model Tuning & Comparison
| | Nhiệm vụ |
|---|---|
| A | Tích hợp SVM + ViSoBERT vào FastAPI; test cascade end-to-end |
| B | Fine-tune BAMIBERT; `compare_models.ipynb`; `mcnemar_test.ipynb`; chọn model production |
| C | Dashboard: model stats + charts; `visualization.ipynb` cho báo cáo |

---

### Sprint 7 · Tuần 13-14 · Extension & Dashboard
| | Nhiệm vụ |
|---|---|
| A | `content.js` (MutationObserver + blur CSS) + `background.js` + `manifest.json` + `popup.html/js`; test YouTube, Facebook, VnExpress |
| B | `error_analysis.ipynb`; `robustness_test.ipynb`; data augmentation final |
| C | Dashboard hoàn thiện (settings, model comparison); test Qwen edge cases |

---

### Sprint 8 · Tuần 15-16 · Integration & Polish
> **Deadline: Báo cáo tiến độ lần 3 cuối tuần 16**

| | Nhiệm vụ |
|---|---|
| A | End-to-end system test; đo latency từng tầng; fix bug tích hợp |
| B | Hoàn thiện tất cả evaluation notebooks; viết chương Model + Evaluation |
| C | Polish Dashboard UI; viết chương Visualization; chuẩn bị Q&A |
| Báo cáo 3 | Nội dung đã hoàn thành |

---

### Sprint 9 · Tuần 17 · Defense Prep

| | Nhiệm vụ |
|---|---|
| A | Viết chương Thu thập + Triển khai; kịch bản demo live; đóng gói code + README |
| B | Finalize báo cáo chương Model; chuẩn bị Q&A về model + McNemar's |
| C | Finalize báo cáo chương Visualization; chuẩn bị slides |

---

### Sprint 10 · Sau bảo vệ · Nhánh phát triển: Image Blurring

> Làm sau khi đã bảo vệ xong. CLIP zero-shot — không cần data gán nhãn.

| | Nhiệm vụ |
|---|---|
| C | CLIP service `localhost:8001`: load ViT-B/32, endpoint `/classify_image`; thêm image stats vào Dashboard |
| B | Đánh giá CLIP accuracy trên ảnh mẫu; thêm vào bảng so sánh model |
| A | Sửa `content.js`: thêm detect `<img>` → gửi URL → localhost:8001 → blur ảnh |

---

## Cấu trúc Folder

```
pbl6-toxic-detector/
│
├── README.md                    ← Hướng dẫn setup + chạy toàn bộ hệ thống
├── requirements.txt
├── kehoach.md
├── general.md
├── pbl6_teacher.md
│
├── data/                                          [A quản lý]
│   ├── raw/                                       ← A tự tổ chức (crawl output)
│   ├── processed/
│   │   └── clean.csv                      ← sau preprocessing
│   └── labeled/
│       ├── labeled_train.csv                      ← sau annotation A+B+C
│       ├── labeled_val.csv
│       └── labeled_test.csv
│
├── notebooks/                                     [Research — KHÔNG vào production]
│   │
│   ├── crawl/                                     [A — A tự đặt tên file]
│   │
│   ├── preprocess/                                [A]
│   │   └── preprocess_eda.ipynb
│   │
│   ├── annotation/                                [B — A+B+C cùng label, B lead]
│   │   └── annotation_kappa.ipynb
│   │
│   ├── models/                                    [B]
│   │   ├── train_svm.ipynb
│   │   ├── train_visobert.ipynb
│   │   ├── train_bamibert.ipynb
│   │   ├── compare_models.ipynb                   ← bảng F1 so sánh
│   │   ├── mcnemar_test.ipynb                     ← kiểm định thống kê
│   │   ├── error_analysis.ipynb
│   │   └── robustness_test.ipynb
│   │
│   └── visualization/                             [C]
│       └── visualization.ipynb                    ← charts cho báo cáo
│
├── src/                                           [Production code]
│   ├── preprocessing/                             [A]
│   │   ├── __init__.py
│   │   ├── normalizer.py
│   │   └── tokenizer.py
│   ├── models/                                    [B — chỉ 1 model được chọn]
│   │   ├── tier1_svm/
│   │   │   ├── predict.py
│   │   │   └── saved/                             ← tfidf.pkl, svm.pkl
│   │   └── tier2_bert/
│   │       ├── predict.py
│   │       └── saved/                             ← model weights
│   └── tier3_qwen/                                [C]
│       ├── client.py
│       └── prompts.py
│
├── api/                                           [A]
│   ├── main.py                                    ← FastAPI localhost:8000
│   ├── cache.py
│   ├── batch.py
│   └── routes/
│       └── text.py
│
├── extension/                                     [A — toàn bộ]
│   ├── manifest.json
│   ├── content.js                                 ← scan DOM + blur text
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   └── styles.css
│
├── dashboard/                                     [C — React]
│   ├── package.json                               ← npm: react, recharts, axios
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx                                ← router, layout
│       ├── components/
│       │   ├── LogViewer.jsx                      ← bảng log comment
│       │   ├── ModelStats.jsx                     ← F1, Precision, Recall
│       │   ├── Charts.jsx                         ← Recharts: pie, line, bar
│       │   └── Settings.jsx                       ← threshold, tier toggles
│       └── api/
│           └── client.js                          ← axios gọi FastAPI :8000
│
└── image_service/                                 [C — Sprint 10]
    ├── clip_service.py                            ← FastAPI localhost:8001
    └── saved/                                     ← CLIP model cache
```

---

## Đáp ứng Yêu cầu Thầy

| Yêu cầu (pbl6_teacher.md) | Giải pháp |
|---|---|
| Phải tự crawl data | 5-10M comment |
| Tiền xử lý + giải thích lý do | `src/preprocessing/` + notebook 03 |
| Trực quan hóa trước/sau + giải thích | notebook 12 + Dashboard C |
| Ít nhất 2 mô hình ML, mô hình mới ≤5 năm | SVM (baseline) + ViSoBERT 2023 |
| Giải thích chọn model (lý thuyết + thực nghiệm) | notebook 08 + 09 McNemar's test |
| Chương trình chạy đúng yêu cầu | Extension blur live trên YouTube/Facebook |
| Báo cáo tiến độ 3 lần | Sprint 1 (W2) · Sprint 5 (W10) · Sprint 8 (W16) |

---

## Git & Communication

### Branching Strategy

```
main         ← stable production code; chỉ merge sau mỗi sprint
develop      ← integration branch; mọi feature merge vào đây trước
feature/A-xx ← A làm việc độc lập (A-01, A-02, ...)
feature/B-xx ← B làm việc độc lập
feature/C-xx ← C làm việc độc lập
```

**Quy tắc:**
- Không push thẳng lên `main` hoặc `develop`
- Tạo Pull Request → review 1 người khác → merge
- Cuối mỗi sprint: merge `develop` → `main` sau demo nội bộ

### Communication

| Kênh | Mục đích |
|---|---|
| Zalo/Discord nhóm | Liên lạc hàng ngày |
| Họp sprint (2 tuần/lần) | Review tiến độ + demo nội bộ + lên kế hoạch sprint tiếp |
| File `general.md` | Ghi chú quyết định kỹ thuật, giải thích lựa chọn |
| **Quy tắc quan trọng:** Nếu bị block bởi task của người khác → báo trong **24h**, không tự chờ im lặng |

---

## Timeline Tổng quan

```
W1-2   Sprint 1  Planning + Setup                → Báo cáo 1
W3-4   Sprint 2  Data Crawling
W5-6   Sprint 3  Preprocessing + Annotation Prep
W7-8   Sprint 4  Annotation (A+B+C cùng làm)
W9-10  Sprint 5  Train Model v1                  → Báo cáo 2
W11-12 Sprint 6  Model Tuning + Comparison
W13-14 Sprint 7  Extension + Dashboard
W15-16 Sprint 8  Integration + Polish            → Báo cáo 3
W17    Sprint 9  Defense Prep                    → BẢO VỆ
──────────────────────────────────────────────────────────
       Sprint 10 Image Blurring (bonus)          → Sau bảo vệ
```