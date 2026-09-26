import csv
import os
import random
import time
import re
from collections import deque
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://voz.vn/"
PATH_FOLDER = "E:\\PythonAI\\PBL6\\ToxicContentDetection\\data\\raw\\url\\"
OUTPUT_FILE = PATH_FOLDER +"voz_thread_urls.csv"

# --- File checkpoint/resume — cho phép chạy lại mà không mất tiến độ ---
VISITED_PAGES_FILE = PATH_FOLDER+"checkpoint_visited_pages.txt"
FAILED_PAGES_FILE = PATH_FOLDER+"checkpoint_failed_pages.txt"
THREADS_CHECKPOINT_FILE = PATH_FOLDER+"checkpoint_threads.csv"  # ghi incremental, không đợi crawl xong mới lưu

# Giới hạn số trang forum tối đa trong một forum.
MAX_FORUM_PAGES = 1000

REQUEST_DELAY = 1.0          # delay cơ bản giữa các request
MAX_RETRIES = 3              # số lần retry khi 1 request thất bại
RETRY_BACKOFF_BASE = 3.0     # giây, nhân dần theo số lần retry (backoff)
TIMEOUT = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive",
}

session = requests.Session()
session.headers.update(HEADERS)


# ---------------------------------------------------------------------------
# Checkpoint helpers — lưu/đọc tiến độ ra file, để resume khi bị ngắt giữa chừng
# ---------------------------------------------------------------------------
def load_line_set(path):
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


def append_line(path, value):
    with open(path, "a", encoding="utf-8") as f:
        f.write(value + "\n")


def append_thread_checkpoint(thread_url):
    """Ghi ngay từng thread mới phát hiện ra file, không đợi crawl xong hết
    mới ghi 1 lần — nếu script bị ngắt giữa chừng, dữ liệu đã ghi không mất."""
    file_exists = os.path.isfile(THREADS_CHECKPOINT_FILE)
    with open(THREADS_CHECKPOINT_FILE, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["thread_url"])
        writer.writerow([thread_url])


def is_voz_url(url):
    parsed = urlparse(url)
    return (
        parsed.scheme in ("http", "https")
        and parsed.netloc.lower() in ("voz.vn", "www.voz.vn")
    )


def get_thread_url(url):
    if not url:
        return None
    url = urljoin(BASE_URL, url)
    parsed = urlparse(url)
    if parsed.netloc.lower() not in ("voz.vn", "www.voz.vn"):
        return None
    match = re.match(r"^(/t/[^/]+\.\d+)(?:/.*)?/?$", parsed.path, re.IGNORECASE)
    if not match:
        return None
    return urlunparse(("https", "voz.vn", match.group(1) + "/", "", "", ""))


def is_forum_url(url):
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.netloc.lower() not in ("voz.vn", "www.voz.vn"):
        return False
    path = parsed.path.rstrip("/")
    return path == "/f" or path.startswith("/f/")


def normalize_forum_page_url(url):
    if not url:
        return None
    url = urljoin(BASE_URL, url)
    parsed = urlparse(url)
    if parsed.netloc.lower() not in ("voz.vn", "www.voz.vn"):
        return None
    path = parsed.path.rstrip("/")
    if not (path == "/f" or path.startswith("/f/")):
        return None
    return urlunparse(("https", "voz.vn", path + "/", "", "", ""))


# ---------------------------------------------------------------------------
# fetch với retry + backoff — SỬA CHÍNH: luôn sleep dù thành công hay thất bại,
# và thử lại vài lần trước khi bỏ cuộc hẳn với 1 URL
# ---------------------------------------------------------------------------
def fetch(url):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(url, timeout=TIMEOUT, allow_redirects=True)
            print(f"[HTTP {response.status_code}] {response.url}")

            if response.status_code == 429:
                wait = RETRY_BACKOFF_BASE * attempt
                print(f"[RATE-LIMIT] 429 tại {url}, chờ {wait:.1f}s rồi thử lại "
                      f"({attempt}/{MAX_RETRIES})")
                time.sleep(wait)
                continue

            if response.status_code != 200:
                return None

            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type:
                print(f"[SKIP] Không phải HTML: {content_type}")
                return None

            return response.text

        except requests.RequestException as exc:
            wait = RETRY_BACKOFF_BASE * attempt
            print(f"[ERROR] Request thất bại (lần {attempt}/{MAX_RETRIES}): {url}")
            print(f"        {exc}")
            print(f"        Thử lại sau {wait:.1f}s...")
            time.sleep(wait)

    print(f"[FAILED] Bỏ cuộc với URL sau {MAX_RETRIES} lần thử: {url}")
    return None


def extract_links(html, current_url):
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for tag in soup.find_all("a", href=True):
        href = tag.get("href")
        if not href:
            continue
        href = href.strip()
        if href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        absolute_url = urljoin(current_url, href)
        if not is_voz_url(absolute_url):
            continue
        links.add(absolute_url)
    return links


def extract_thread_urls(html, current_url):
    raw_links = extract_links(html, current_url)
    threads = set()
    for url in raw_links:
        thread_url = get_thread_url(url)
        if thread_url:
            threads.add(thread_url)
    return threads


def extract_forum_urls(html, current_url):
    raw_links = extract_links(html, current_url)
    forums = set()
    for url in raw_links:
        if not is_forum_url(url):
            continue
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        path = re.sub(r"/page-\d+$", "", path, flags=re.IGNORECASE)
        forum_url = urlunparse(("https", "voz.vn", path + "/", "", "", ""))
        forums.add(forum_url)
    return forums


def extract_pagination_urls(html, current_url):
    raw_links = extract_links(html, current_url)
    pages = set()
    for url in raw_links:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        if re.search(r"/f/.*/page-\d+$", path, re.IGNORECASE):
            pages.add(urlunparse(("https", "voz.vn", path + "/", "", "", "")))
    return pages


def discover_forums():
    print("=" * 70)
    print("DISCOVER FORUMS")
    print("=" * 70)

    html = fetch(BASE_URL)
    if not html:
        print("[ERROR] Không tải được trang chủ VOZ.")
        return set()

    forums = extract_forum_urls(html, BASE_URL)
    print(f"[INFO] Tìm được {len(forums)} forum URL.")
    for forum in sorted(forums):
        print(f"  [FORUM] {forum}")
    return forums


def crawl_forum(start_url, global_threads, visited_pages, failed_pages):
    queue = deque([start_url])
    local_pages = 0

    while queue:
        if MAX_FORUM_PAGES is not None and local_pages >= MAX_FORUM_PAGES:
            print("[LIMIT] Đạt MAX_FORUM_PAGES.")
            break

        url = queue.popleft()
        normalized_forum = normalize_forum_page_url(url)

        if not normalized_forum or normalized_forum in visited_pages:
            continue

        print()
        print("-" * 70)
        print(f"[FORUM PAGE {local_pages + 1}] {normalized_forum}")
        print("-" * 70)

        html = fetch(normalized_forum)

        # SỬA: dù thành công hay thất bại đều phải đánh dấu đã xử lý + sleep,
        # tránh bắn request dồn dập không nghỉ khi gặp lỗi liên tiếp.
        if not html:
            failed_pages.add(normalized_forum)
            append_line(FAILED_PAGES_FILE, normalized_forum)
            time.sleep(REQUEST_DELAY + random.uniform(0, 1.5))  # thêm jitter, nghỉ lâu hơn khi lỗi
            continue

        visited_pages.add(normalized_forum)
        append_line(VISITED_PAGES_FILE, normalized_forum)
        local_pages += 1

        threads = extract_thread_urls(html, normalized_forum)
        new_threads = 0
        for thread in threads:
            if thread not in global_threads:
                global_threads.add(thread)
                append_thread_checkpoint(thread)  # ghi ngay, không đợi cuối mới lưu
                new_threads += 1
                print(f"[THREAD +] {thread}")

        print(f"[INFO] Page có {len(threads)} thread, mới {new_threads}.")
        print(f"[INFO] Tổng thread hiện tại: {len(global_threads)}")

        next_pages = extract_pagination_urls(html, normalized_forum)
        for next_page in sorted(next_pages):
            normalized_next = normalize_forum_page_url(next_page)
            if normalized_next and normalized_next not in visited_pages:
                queue.append(normalized_next)

        print(f"[INFO] Pagination phát hiện: {len(next_pages)}")

        time.sleep(REQUEST_DELAY + random.uniform(0, 0.5))  # jitter nhẹ kể cả khi thành công


def save_urls(urls):
    """Lưu file tổng hợp cuối cùng (checkpoint_threads.csv đã có sẵn dữ liệu
    incremental, file này chỉ để xuất bản sạch/đã sort theo đúng format cũ)."""
    urls = sorted(set(urls))
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.writer(file)
        writer.writerow(["id", "thread_url"])
        for index, url in enumerate(urls, start=1):
            writer.writerow([index, url])

    print()
    print("=" * 70)
    print("SAVE RESULT")
    print("=" * 70)
    print(f"[DONE] Đã lưu {len(urls)} thread.")
    print(f"[FILE] {OUTPUT_FILE}")


def retry_failed_pages(failed_pages, global_threads, visited_pages):
    """Chạy riêng để crawl lại CHỈ những trang lỗi lần trước, thay vì crawl lại
    từ đầu toàn bộ 52 forum. Gọi hàm này khi muốn resume sau khi mạng ổn định."""
    if not failed_pages:
        print("[INFO] Không có trang nào cần retry.")
        return

    print(f"[RETRY] Thử lại {len(failed_pages)} trang từng lỗi...")
    still_failed = set()

    for url in sorted(failed_pages):
        if url in visited_pages:
            continue

        html = fetch(url)
        if not html:
            still_failed.add(url)
            time.sleep(REQUEST_DELAY + random.uniform(0, 1.5))
            continue

        visited_pages.add(url)
        append_line(VISITED_PAGES_FILE, url)

        threads = extract_thread_urls(html, url)
        for thread in threads:
            if thread not in global_threads:
                global_threads.add(thread)
                append_thread_checkpoint(thread)

        time.sleep(REQUEST_DELAY + random.uniform(0, 0.5))

    # Ghi đè lại file failed_pages chỉ còn những trang vẫn thất bại
    with open(FAILED_PAGES_FILE, "w", encoding="utf-8") as f:
        for url in sorted(still_failed):
            f.write(url + "\n")

    print(f"[RETRY DONE] Còn lại {len(still_failed)} trang vẫn lỗi sau khi retry.")


def main():
    print()
    print("=" * 70)
    print("VOZ REAL URL CRAWLER")
    print("=" * 70)
    print(f"Nguồn: {BASE_URL}")
    print()

    # --- Nạp checkpoint cũ (nếu có) để resume, không crawl lại từ đầu ---
    visited_pages = load_line_set(VISITED_PAGES_FILE)
    failed_pages = load_line_set(FAILED_PAGES_FILE)
    global_threads = set()
    if os.path.isfile(THREADS_CHECKPOINT_FILE):
        with open(THREADS_CHECKPOINT_FILE, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            global_threads = {row["thread_url"] for row in reader}

    print(f"[RESUME] Đã có {len(visited_pages)} trang đã crawl, "
          f"{len(failed_pages)} trang lỗi từ trước, "
          f"{len(global_threads)} thread đã thu thập.")

    forums = discover_forums()
    if not forums:
        print("[ERROR] Không tìm thấy forum.")
        return

    print()
    print("=" * 70)
    print("START CRAWLING")
    print("=" * 70)

    for index, forum in enumerate(sorted(forums), start=1):
        print()
        print("#" * 70)
        print(f"FORUM {index}/{len(forums)}")
        print(forum)
        print("#" * 70)

        crawl_forum(forum, global_threads, visited_pages, failed_pages)

    # Sau khi crawl xong 1 lượt, tự động thử lại các trang bị lỗi 1 lần
    print()
    print("=" * 70)
    print("RETRY CÁC TRANG LỖI")
    print("=" * 70)
    retry_failed_pages(failed_pages, global_threads, visited_pages)

    save_urls(global_threads)

    print()
    print("=" * 70)
    print("CRAWL SUMMARY")
    print("=" * 70)
    print(f"Forum discovered : {len(forums)}")
    print(f"Forum pages      : {len(visited_pages)}")
    print(f"Threads          : {len(global_threads)}")
    print(f"Pages vẫn lỗi    : {len(load_line_set(FAILED_PAGES_FILE))}")
    print()
    print("Crawler hoàn tất.")


if __name__ == "__main__":
    main()