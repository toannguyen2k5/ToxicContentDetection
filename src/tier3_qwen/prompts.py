"""
[Owner: C]
Prompt template dùng cho Qwen ở tier 3.
"""

TOXIC_CLASSIFICATION_PROMPT = """\
Bạn là bộ phân loại nội dung độc hại tiếng Việt.
Hãy phân loại đoạn văn bản sau: {text}
Trả lời JSON: {{"label": "toxic|clean", "confidence": 0-1}}
"""
