"""
[Owner: A]
Chuẩn hoá text tiếng Việt trước khi đưa vào model: lowercase, bỏ dấu câu thừa,
chuẩn hoá teencode, unicode NFC...
"""


def normalize_text(text: str) -> str:
    # TODO(A): implement chuẩn hoá thật (unicodedata.normalize, regex teencode...)
    return text.strip()
