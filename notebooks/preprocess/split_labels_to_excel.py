#!/usr/bin/env python3
"""
Tách file CSV lớn (vd: 5.5 triệu dòng) theo cột nhãn (clean/offensive/hate)
thành các sheet riêng trong 1 file Excel để kiểm lại.

Cách chạy:
    python split_labels_to_excel.py input.csv output.xlsx \
        --label-col label --text-col text --encoding utf-8 --delimiter ,

Nếu không truyền --label-col / --text-col, script sẽ mặc định cột tên là
"label" và giữ nguyên toàn bộ các cột khác.

Do Excel giới hạn 1,048,576 dòng/sheet, nếu 1 nhãn có nhiều hơn giới hạn này,
script sẽ tự động tách thành nhiều sheet: vd hate, hate_2, hate_3, ...
"""

import argparse
import csv
import os
import sys
import tempfile

from openpyxl import Workbook

MAX_ROWS_PER_SHEET = 1_048_575  # trừ 1 dòng cho header


def normalize_label(raw_label: str) -> str:
    """Chuẩn hoá nhãn để gom nhóm (bỏ khoảng trắng thừa, hạ chữ thường)."""
    return raw_label.strip().lower()


def safe_sheet_name(label: str, part: int) -> str:
    """Excel giới hạn tên sheet <= 31 ký tự và không cho vài ký tự đặc biệt."""
    base = "".join(c for c in label if c not in r'[]:*?/\\')[:25] or "sheet"
    return base if part == 1 else f"{base}_{part}"[:31]


def split_by_label(input_csv, label_col, encoding, delimiter, tmp_dir):
    """
    Đọc file CSV gốc 1 lần duy nhất (streaming), ghi mỗi dòng vào 1 file CSV
    tạm riêng theo nhãn. Trả về dict: label -> (tmp_path, row_count).
    """
    label_files = {}   # label -> (file_handle, csv_writer, path, row_count)
    header = None

    with open(input_csv, "r", encoding=encoding, newline="") as f:
        reader = csv.reader(f, delimiter=delimiter)
        header = next(reader)
        try:
            label_idx = header.index(label_col)
        except ValueError:
            raise SystemExit(
                f"Không tìm thấy cột '{label_col}' trong header: {header}\n"
                f"-> Truyền đúng tên cột qua --label-col"
            )

        total = 0
        for row in reader:
            total += 1
            if total % 500_000 == 0:
                print(f"  Đã đọc {total:,} dòng...", file=sys.stderr)

            if len(row) <= label_idx:
                continue  # dòng lỗi format, bỏ qua

            label = normalize_label(row[label_idx])

            if label not in label_files:
                path = os.path.join(tmp_dir, f"{label}.csv")
                fh = open(path, "w", encoding="utf-8", newline="")
                writer = csv.writer(fh)
                writer.writerow(header)
                label_files[label] = [fh, writer, path, 0]

            entry = label_files[label]
            entry[1].writerow(row)
            entry[3] += 1

    for entry in label_files.values():
        entry[0].close()

    print(f"Tổng số dòng đã xử lý: {total:,}", file=sys.stderr)
    return {label: (v[2], v[3]) for label, v in label_files.items()}, header


def write_label_to_sheets(wb, label, tmp_path, header, row_count):
    """Đọc file CSV tạm của 1 nhãn, ghi vào 1 hoặc nhiều sheet (write-only)."""
    with open(tmp_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        next(reader)  # bỏ header cũ, sẽ tự ghi lại cho từng sheet

        part = 1
        ws = wb.create_sheet(title=safe_sheet_name(label, part))
        ws.append(header)
        count_in_sheet = 0

        for row in reader:
            if count_in_sheet >= MAX_ROWS_PER_SHEET:
                part += 1
                ws = wb.create_sheet(title=safe_sheet_name(label, part))
                ws.append(header)
                count_in_sheet = 0
            ws.append(row)
            count_in_sheet += 1

    n_sheets = part
    print(f"  Nhãn '{label}': {row_count:,} dòng -> {n_sheets} sheet")
    return n_sheets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", help="Đường dẫn file CSV gốc")
    parser.add_argument("output_xlsx", help="Đường dẫn file Excel kết quả")
    parser.add_argument("--label-col", default="label", help="Tên cột chứa nhãn (default: label)")
    parser.add_argument("--encoding", default="utf-8", help="Encoding file gốc (default: utf-8)")
    parser.add_argument("--delimiter", default=",", help="Ký tự phân cách (default: ,)")
    args = parser.parse_args()

    if not os.path.exists(args.input_csv):
        raise SystemExit(f"Không tìm thấy file: {args.input_csv}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        print("Bước 1/2: Đang tách dữ liệu theo nhãn (streaming)...", file=sys.stderr)
        label_files, header = split_by_label(
            args.input_csv, args.label_col, args.encoding, args.delimiter, tmp_dir
        )

        if not label_files:
            raise SystemExit("Không đọc được dòng dữ liệu nào.")

        print(f"Tìm thấy {len(label_files)} nhãn: {list(label_files.keys())}", file=sys.stderr)

        print("Bước 2/2: Đang ghi ra file Excel (mỗi nhãn 1+ sheet)...", file=sys.stderr)
        wb = Workbook(write_only=True)
        total_sheets = 0
        # Ưu tiên thứ tự quen thuộc nếu có, còn lại xếp theo alphabet
        preferred_order = ["clean", "offensive", "hate"]
        ordered_labels = [l for l in preferred_order if l in label_files] + \
                          sorted(l for l in label_files if l not in preferred_order)

        for label in ordered_labels:
            tmp_path, row_count = label_files[label]
            total_sheets += write_label_to_sheets(wb, label, tmp_path, header, row_count)

        wb.save(args.output_xlsx)

    print(f"\nHoàn tất! Đã tạo {total_sheets} sheet trong: {args.output_xlsx}")


if __name__ == "__main__":
    main()