"""
Sửa file voz_comments.csv: thêm lại dòng header bị mất ở đầu file,
đồng thời loại bỏ mọi dòng header "thật" bị lẫn ở giữa file (nếu có).

Đọc/ghi theo kiểu STREAM (từng dòng một), không load toàn bộ file vào
RAM — an toàn với file lớn (600MB+).

Chạy:
    python repair_csv.py <file_vao.csv> <file_ra.csv>

Ví dụ trên Colab:
    !python repair_csv.py \
        "/content/drive/MyDrive/data/voz_comments.csv" \
        "/content/drive/MyDrive/data/voz_comments_repaired.csv"

Sau khi kiểm tra file mới ổn, đổi tên lại thành voz_comments.csv để
crawler.py (dùng mode='a' để append) tiếp tục ghi thêm vào đúng file.
"""

import csv
import sys

EXPECTED_COLUMNS = [
    "source", "source_url", "thread_title", "category",
    "post_id", "author", "posted_at", "reaction_count",
    "quoted_text", "text", "text_hash",
]


def repair(in_path: str, out_path: str, report_every: int = 100_000):
    total_read = 0
    total_written = 0
    embedded_headers_removed = 0

    with open(in_path, newline="", encoding="utf-8", errors="replace") as fin, \
         open(out_path, "w", newline="", encoding="utf-8") as fout:

        reader = csv.reader(fin)
        writer = csv.writer(fout)

        # Luôn ghi header đúng lên đầu file trước tiên.
        writer.writerow(EXPECTED_COLUMNS)
        total_written += 1

        for row in reader:
            total_read += 1

            # Bỏ mọi dòng trùng khớp với header (dù đây là dòng đầu tiên
            # vốn không phải header thật, hay dòng header thật bị lẫn
            # giữa file do từng có lần ghi header giữa chừng).
            if row == EXPECTED_COLUMNS:
                embedded_headers_removed += 1
                continue

            writer.writerow(row)
            total_written += 1

            if total_read % report_every == 0:
                print(f"[TIẾN ĐỘ] Đã xử lý {total_read} dòng...")

    print()
    print(f"[XONG] Đọc {total_read} dòng dữ liệu gốc.")
    print(f"[XONG] Bỏ {embedded_headers_removed} dòng trùng header lẫn giữa file.")
    print(f"[XONG] Ghi {total_written} dòng (kể cả 1 dòng header mới) vào: {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Dùng: python repair_csv.py <file_vao.csv> <file_ra.csv>")
        sys.exit(1)
    repair(sys.argv[1], sys.argv[2])
