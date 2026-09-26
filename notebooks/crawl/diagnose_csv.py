"""
Chẩn đoán lỗi cấu trúc trong voz_comments.csv — dùng khi pandas báo
KeyError khi đọc 1 cột nào đó (vd 'text'), thường do file có dòng bị
lệch số cột (do ghi đè/interleave giữa nhiều tiến trình cùng lúc, hoặc
dòng bị cắt giữa chừng).

Chạy trên Colab (đã mount Drive):
    !python diagnose_csv.py /content/drive/MyDrive/data/voz_comments.csv
"""

import csv
import sys

EXPECTED_COLUMNS = [
    "source", "source_url", "thread_title", "category",
    "post_id", "author", "posted_at", "reaction_count",
    "quoted_text", "text", "text_hash",
]
EXPECTED_NCOLS = len(EXPECTED_COLUMNS)


def diagnose(path: str, max_report: int = 20):
    print(f"Đang kiểm tra: {path}")
    print(f"Số cột kỳ vọng: {EXPECTED_NCOLS} -> {EXPECTED_COLUMNS}\n")

    bad_rows = []
    total = 0
    header = None

    # Dùng csv module đọc thô, không qua pandas, để bắt lỗi ở mức dòng
    # thay vì để pandas tự "đoán" và gây lỗi khó hiểu.
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i == 0:
                header = row
                if header != EXPECTED_COLUMNS:
                    print(f"[CẢNH BÁO] Header dòng đầu KHÔNG khớp kỳ vọng:")
                    print(f"  Thực tế : {header}")
                    print(f"  Kỳ vọng : {EXPECTED_COLUMNS}\n")
                continue

            total += 1
            if len(row) != EXPECTED_NCOLS:
                bad_rows.append((i + 1, len(row), row[:3]))  # +1 vì dòng 1 là header

            # Phát hiện header bị lặp lại giữa file (dấu hiệu 2 process
            # cùng ghi và cả 2 đều tưởng file chưa tồn tại nên ghi header)
            if row == header:
                print(f"[CẢNH BÁO] Header bị LẶP LẠI ở dòng {i + 1} (giữa file).")

    print(f"Tổng số dòng dữ liệu (không tính header): {total}")
    print(f"Số dòng SAI số cột: {len(bad_rows)}")

    if bad_rows:
        print(f"\nVí dụ {min(max_report, len(bad_rows))} dòng lỗi đầu tiên "
              f"(số dòng trong file, số cột thực tế, 3 cột đầu):")
        for line_no, ncols, preview in bad_rows[:max_report]:
            print(f"  Dòng {line_no}: {ncols} cột (kỳ vọng {EXPECTED_NCOLS}) -> {preview}")
    else:
        print("\n[OK] Không có dòng nào sai số cột theo cách đọc thô csv module.")
        print("Nếu pandas vẫn báo lỗi, có thể do:")
        print("  - File có BOM (byte order mark) ở đầu làm lệch tên cột đầu tiên")
        print("  - Ký tự xuống dòng (\\n) nằm trong nội dung text không được quote đúng cách")
        print("  - pandas dùng engine C và cách xử lý quote khác với csv module chuẩn")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/voz_comments.csv"
    diagnose(path)
