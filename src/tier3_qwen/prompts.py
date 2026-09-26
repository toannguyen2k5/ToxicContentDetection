"""
[Owner: C]
Prompt template dùng cho Qwen ở Tier 3.
Hỗ trợ phân loại 3 nhãn: CLEAN / OFFENSIVE / HATE cho tiếng Việt.
"""

TOXIC_CLASSIFICATION_PROMPT = """\
Bạn là chuyên gia phân loại nội dung độc hại trong bình luận mạng xã hội tiếng Việt.

Phân loại bình luận sau vào MỘT trong 3 nhãn:
- CLEAN: bình luận bình thường, không có nội dung xúc phạm hay thù ghét
- OFFENSIVE: xúc phạm, chửi bới một người hoặc nhóm cụ thể (không phân biệt đối xử)
- HATE: kích động thù ghét, kỳ thị theo vùng miền, dân tộc, giới tính, tôn giáo

Hướng dẫn thêm:
- Mia mai, ẩn dụ có ý định xúc phạm rõ ràng → OFFENSIVE hoặc HATE
- Teencode (vl, vcl, dm, cl...) kết hợp xúc phạm → OFFENSIVE
- Chỉ kỳ thị cả một nhóm người theo đặc điểm nhân khẩu → HATE
- Nếu không chắc chắn, thiên về CLEAN thay vì false alarm

Bình luận cần phân loại:
{text}

Trả lời ĐÚNG định dạng JSON sau (không thêm text nào khác):
{{"label": "CLEAN|OFFENSIVE|HATE", "confidence": 0.0-1.0, "reason": "giải thích ngắn 1 câu tiếng Việt"}}
"""
