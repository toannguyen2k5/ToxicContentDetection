"""
[Owner: C] — Task C-10
Prompt template dùng cho Qwen ở Tier 3.
Viết theo đúng guideline_gan_nhan_tieng_viet.md (không bịa thêm rule).
Cập nhật: Oct 2026 — full 8-bước + quy tắc đặc biệt.
"""

# ---------------------------------------------------------------------------
# Prompt chính — xây dựng theo guideline Section 9 (7 quy tắc cốt lõi)
# và Section 12 (quy trình 8 bước đầy đủ).
# "/no_think" cuối prompt tắt thinking mode của Qwen3 → giảm 2-4s latency.
# ---------------------------------------------------------------------------
TOXIC_CLASSIFICATION_PROMPT = """\
Bạn là hệ thống phân loại nội dung tiếng Việt. Phân loại bình luận sau vào \
đúng một nhãn theo quy trình dưới đây.

## NHÃN
- CLEAN: Nội dung sạch/an toàn, hoặc có từ thô tục dạng viết tắt/phủ định/\
cảm thán nhẹ nhưng không công kích cá nhân/nhóm.
- OFFENSIVE: Nội dung thô tục, xúc phạm, lăng mạ hoặc công kích cá nhân/\
nhóm nhỏ không dựa trên đặc tính bảo vệ.
- HATE: Kích động/đe dọa gây hại hoặc miệt thị/thù ghét nhóm người dựa trên \
đặc tính nhóm.

Thứ tự ưu tiên: HATE > OFFENSIVE > CLEAN. Nếu thỏa nhiều điều kiện, \
chọn nhãn có mức ưu tiên cao hơn.

## QUY TRÌNH QUYẾT ĐỊNH (kiểm tra đúng thứ tự)

Bước 1: Có kích động/đe dọa bạo lực hoặc đe dọa tính mạng/thương tích?
  → Có: HATE

Bước 2: Có miệt thị/thù ghét/phi nhân hóa nhóm người dựa trên đặc tính nhóm \
(vùng miền, chủng tộc, quốc tịch, giới tính, tôn giáo, khuyết tật, địa vị xã hội)?
  Gồm cả mỉa mai/châm biếm nhắm vào nhóm (vd: "À vâng, dân vùng X thì giỏi \
lừa đảo lắm nhỉ" → HATE).
  → Có: HATE

Bước 3: Có xúc phạm/lăng mạ/công kích một cá nhân cụ thể?
  → Có: OFFENSIVE

Bước 4: Có công kích nhóm nhỏ được xác định theo hành vi/ngữ cảnh \
(không phải đặc tính nhóm)?
  Vd: "Mấy đứa gian lận thi cử" → OFFENSIVE (nhóm theo hành vi).
  → Có: OFFENSIVE

Bước 5: Có quấy rối/gạ gẫm tình dục hoặc bình phẩm thân thể mang tính \
objectification nhắm vào cá nhân?
  → Có: OFFENSIVE

Bước 6: Có mỉa mai/châm biếm công kích cá nhân (không dựa trên đặc tính nhóm)?
  → Có: OFFENSIVE

Bước 7: Có từ tục trần trụi/viết đầy đủ (lồn, cặc, địt, buồi, chịch, cứt...)?
  Kể cả khi chỉ dùng làm cảm thán hay chê đồ vật, không công kích ai.
  Vd: "Màn hình này vãi lồn thật" → OFFENSIVE vì có từ tục trần trụi "lồn".
  → Có: OFFENSIVE

Bước 8: Không thỏa bất kỳ điều kiện nào trên → CLEAN

## QUY TẮC ĐẶC BIỆT — CÁC TRƯỜNG HỢP LÀ CLEAN

1. Từ tục viết tắt (vl, vcl, đm, cc, cl, vkl, dm) + không công kích cá nhân/nhóm → CLEAN
   Vd: "Đcm cay thật" → CLEAN (cảm thán viết tắt).
   Vd: "Sản phẩm này như cc" → CLEAN (chê đồ vật, từ viết tắt).

2. "Vãi" đứng một mình, không đi kèm từ tục trần trụi → CLEAN
   Vd: "Ngon vãi", "Hay vãi", "Đắt vãi" → CLEAN.
   Nhưng: "Vãi lồn" → OFFENSIVE (có từ tục trần trụi "lồn").

3. "Đéo" dùng làm từ phủ định → CLEAN
   Vd: "Đéo biết", "Đéo quan tâm", "Đéo có tiền" → CLEAN.

4. Banter/trash-talk trong game, esports, thể thao + không kèm điều kiện hate khác → CLEAN
   Vd: "SEA là vùng trũng esports" → CLEAN.

5. Phê phán chính sách/chính phủ/tổ chức + không phi nhân hóa/miệt thị con người → CLEAN

6. Mỉa mai tình huống, sản phẩm, sự việc, hiện tượng (không nhắm vào cá nhân/nhóm) → CLEAN

## PHÂN BIỆT DỄ NHẦM

| Ví dụ | Nhãn | Lý do |
|---|---|---|
| "Game này như cc" | CLEAN | Viết tắt, chê sản phẩm |
| "Game này như cứt" | OFFENSIVE | Từ tục trần trụi |
| "Thằng này ngu như chó" | OFFENSIVE | Xúc phạm cá nhân |
| "Dân vùng X toàn bọn lừa đảo" | HATE | Nhóm theo vùng miền |
| "Mấy đứa gian lận thi cử" | OFFENSIVE | Nhóm theo hành vi |
| "À vâng, dân X thì giỏi lừa đảo" | HATE | Mỉa mai về nhóm |

## BÌNH LUẬN CẦN PHÂN LOẠI
{text}

Trả lời ĐÚNG ĐỊNH DẠNG JSON sau (không thêm text nào khác ngoài JSON):
{{"label": "CLEAN|OFFENSIVE|HATE", "confidence": 0.0-1.0, "reason": "giải thích ngắn 1 câu tiếng Việt"}}

/no_think"""
