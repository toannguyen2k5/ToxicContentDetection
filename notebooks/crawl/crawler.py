"""
Crawler thu thập dữ liệu văn bản (comment/bài viết) phục vụ bài toán
phát hiện nội dung vi phạm trên mạng xã hội.

Thiết kế theo hướng "source-driven": mỗi nguồn (VOZ, trang chính phủ, ...)
chỉ cần khai báo selector riêng trong SOURCES, phần logic crawl (retry,
rate limit, pagination, dedup, ghi file) dùng chung.

BẢN NÂNG CẤP TỐC ĐỘ so với bản gốc, gồm 3 thay đổi chính:
  1. Dùng requests.Session() + connection pool + urllib3 Retry thay vì
     mở kết nối mới cho mỗi request -> giảm overhead TCP/TLS handshake.
  2. Flush file theo batch (mỗi N dòng) thay vì flush sau MỖI dòng
     -> giảm số lần ghi đĩa (syscall) trong khi vẫn giới hạn mất mát
     dữ liệu ở mức chấp nhận được nếu crash.
  3. Crawl NHIỀU THREAD SONG SONG bằng ThreadPoolExecutor (mỗi thread
     forum vẫn giữ nguyên delay tuần tự giữa các trang của chính nó)
     -> tăng độ song song giữa các thread khác nhau thay vì giảm delay
     giữa các trang (an toàn hơn cho server nguồn).

Lưu ý:
- Luôn kiểm tra robots.txt và Điều khoản sử dụng của từng trang trước khi crawl.
- Đặt delay hợp lý (mặc định 1-2s) để không gây quá tải cho server nguồn.
- Với dữ liệu dùng để train model, cân nhắc ẩn danh hoá thông tin cá nhân
  (username, số điện thoại, link cá nhân...) trước khi công bố dataset.
- MAX_WORKERS là số THREAD KHÁC NHAU crawl đồng thời, không phải số
  request/giây tới cùng 1 thread. Tăng dần và theo dõi log 429/503 để
  không vượt quá khả năng chịu tải của server nguồn.
"""

import csv
import hashlib
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(threadName)s %(message)s",
    handlers=[
        logging.FileHandler("crawler.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("crawler")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (research-data-collection; contact: your-email@example.com)"
}

# File checkpoint: lưu các thread ĐÃ crawl xong hoàn toàn (hết trang / lỗi
# hẳn), để lần chạy sau bỏ qua, không crawl lại từ đầu.
DONE_THREADS_FILE = "checkpoint_done_threads.txt"

# Số thread forum crawl song song. Đây là độ song song giữa CÁC THREAD
# KHÁC NHAU, không liên quan tới delay giữa các trang trong cùng 1 thread.
# Bắt đầu từ giá trị nhỏ (4), tăng dần nếu log không thấy nhiều 429/503.
MAX_WORKERS = 10


# --------------------------------------------------------------------------
# HTTP Session dùng chung: connection pool + retry tích hợp sẵn của urllib3
# --------------------------------------------------------------------------
def build_session() -> requests.Session:
    """
    Tạo 1 Session dùng chung cho toàn bộ crawler thay vì requests.get() rời
    rạc từng lần. Session tái sử dụng kết nối TCP/TLS (keep-alive) và có
    pool riêng cho từng thread nhờ urllib3 quản lý connection pool theo
    (scheme, host) — an toàn khi nhiều thread Python dùng chung 1 Session.
    """
    session = requests.Session()
    session.headers.update(HEADERS)
    retry = Retry(
        total=3,
        backoff_factor=1.5,          # 1.5s, 3s, 6s... giữa các lần retry
        status_forcelist=[429, 500, 502, 503, 504],
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    # pool_maxsize nên >= MAX_WORKERS để mỗi thread có sẵn 1 connection riêng
    # trong pool, tránh phải chờ nhau khi crawl song song.
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


SESSION = build_session()


# --------------------------------------------------------------------------
# Cấu hình từng nguồn: mỗi nguồn khai báo selector riêng, logic dùng chung
# --------------------------------------------------------------------------
@dataclass
class SourceConfig:
    name: str
    post_selector: str                       # selector cho từng bài/post
    text_selector: str                        # selector lấy text chính bên trong post
    next_page_selector: Optional[str] = None   # selector nút "trang sau" (nếu có)

    # Các trường bổ sung — dữ liệu thô cần thiết để sau này build feature
    # (không phải feature, chỉ là nguyên liệu). Để None nếu nguồn không có.
    author_selector: Optional[str] = None
    time_selector: Optional[str] = None        # selector thẻ <time>, sẽ đọc attribute datetime
    quote_selector: Optional[str] = None        # khối quote/trả lời lồng bên trong text
    reaction_selector: Optional[str] = None      # số lượt react/like
    post_id_selector: Optional[str] = None       # id/số thứ tự bài viết (vd #123)

    # Selector cấp thread (chỉ đọc 1 lần ở trang đầu), không lặp lại mỗi post
    thread_title_selector: Optional[str] = None
    category_selector: Optional[str] = None


SOURCES = {
    "voz": SourceConfig(
        name="voz",
        post_selector="article.message",
        # XenForo (nền tảng VOZ đang dùng) đặt nội dung bài viết trong
        # .message-userContent .bbWrapper, KHÔNG phải .message (đó là
        # class của chính thẻ article, không phải nội dung).
        text_selector=".message-userContent .bbWrapper",
        next_page_selector="a.pageNav-jump--next",
        author_selector=".message-name .username",
        time_selector=".message-attribution-main time",
        quote_selector=".bbCodeBlock--quote",
        reaction_selector=".reactionsBar-link, .likesSummary",
        post_id_selector="a.u-concealed",  # thường chứa href dạng '...post-12345'
        thread_title_selector="h1.p-title-value",
        category_selector=".p-breadcrumbs li:last-child a",
    ),
    # Ví dụ khai báo thêm 1 nguồn khác, chỉ cần đổi selector, để trống
    # trường nào nguồn đó không có:
    # "gov_example": SourceConfig(
    #     name="gov_example",
    #     post_selector="div.comment-item",
    #     text_selector=".comment-content",
    #     next_page_selector="a.next-page",
    #     author_selector=".comment-author",
    #     time_selector=".comment-time",
    # ),
}


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_quote_and_clean_text(post, cfg: "SourceConfig") -> tuple[str, str]:
    """
    Tách phần bị quote/trích dẫn ra khỏi nội dung chính.
    Trả về (text_chinh, text_quote) — text_quote là lời của người KHÁC
    được trích dẫn lại, không nên tính là "lời nói vi phạm" của tác giả
    bài viết này, nhưng vẫn giữ lại làm ngữ cảnh.
    """
    text_el = post.select_one(cfg.text_selector)
    if not text_el:
        return "", ""

    quote_text = ""
    if cfg.quote_selector:
        quote_els = text_el.select(cfg.quote_selector)
        if quote_els:
            quote_text = clean_text(" ".join(q.get_text(" ", strip=True) for q in quote_els))
            for q in quote_els:
                q.decompose()  # xoá khỏi cây để không lẫn vào text chính

    main_text = clean_text(text_el.get_text(" ", strip=True))
    return main_text, quote_text


def extract_field(post, selector: Optional[str], attr: Optional[str] = None) -> str:
    """Lấy text hoặc 1 attribute từ selector, trả '' nếu không tìm thấy."""
    if not selector:
        return ""
    el = post.select_one(selector)
    if not el:
        return ""
    if attr:
        return el.get(attr, "") or ""
    return clean_text(el.get_text(" ", strip=True))


def extract_post_id(post, selector: Optional[str]) -> str:
    """
    Lấy post id dạng số từ href (vd '...post-12345' -> '12345').
    Nếu không match được pattern 'post-<số>', trả về href thô để không
    mất thông tin, nhưng ưu tiên số nếu tìm thấy.
    """
    href = extract_field(post, selector, attr="href")
    if not href:
        return ""
    match = re.search(r"post-(\d+)", href)
    return match.group(1) if match else href


def extract_reaction_count(post, selector: Optional[str]) -> int:
    """Bóc số lượng react/like ra từ text (vd 'Reactions: 12' -> 12)."""
    raw = extract_field(post, selector)
    match = re.search(r"\d+", raw)
    return int(match.group()) if match else 0


# --------------------------------------------------------------------------
# robots.txt — cache theo domain để không phải fetch lại mỗi trang
# --------------------------------------------------------------------------
_robots_cache: dict[str, RobotFileParser] = {}
_robots_cache_lock = threading.Lock()  # nhiều thread có thể check robots.txt cùng lúc


def can_fetch(url: str, user_agent: str = "*") -> bool:
    """Kiểm tra robots.txt trước khi crawl. Trả về True nếu không xác định được
    (fail-open) để không chặn crawl vì lỗi mạng, nhưng sẽ log cảnh báo.
    Kết quả robots.txt được cache theo domain, không fetch lại mỗi lần gọi.
    Cache dùng chung giữa các thread nên được bảo vệ bởi lock khi ghi."""
    parsed = urlparse(url)
    domain = f"{parsed.scheme}://{parsed.netloc}"

    with _robots_cache_lock:
        rp = _robots_cache.get(domain)
        if rp is None:
            rp = RobotFileParser()
            rp.set_url(f"{domain}/robots.txt")
            try:
                rp.read()
            except Exception as e:
                logger.debug("Không đọc được robots.txt cho %s (%s), coi như cho phép.", domain, e)
            _robots_cache[domain] = rp

    try:
        allowed = rp.can_fetch(user_agent, url)
    except Exception:
        allowed = True

    if not allowed:
        logger.warning("robots.txt không cho phép crawl: %s", url)
    return allowed


def fetch_with_retry(url: str, timeout: int = 15) -> Optional[requests.Response]:
    """
    Request qua SESSION dùng chung (connection pool + keep-alive).
    Retry/backoff cho 429/5xx đã được xử lý ở tầng urllib3.Retry gắn vào
    SESSION (xem build_session), nên ở đây chỉ cần bắt lỗi còn sót lại
    (timeout, lỗi kết nối, hoặc hết số lần retry) và log.
    """
    try:
        resp = SESSION.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp
    except requests.RequestException as e:
        logger.error("Bỏ qua URL sau khi retry thất bại: %s (%s)", url, e)
        return None


def debug_inspect(url: str, post_selector: str = "article", n: int = 2):
    """
    Tiện ích debug: in ra cấu trúc HTML thô của n bài đầu tiên khớp
    post_selector, để bạn tự xác định đúng text_selector cần dùng
    thay vì đoán mò. Chạy hàm này riêng khi selector không khớp.
    """
    resp = fetch_with_retry(url)
    if resp is None:
        print("Không fetch được URL.")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    posts = soup.select(post_selector)
    print(f"Tìm thấy {len(posts)} phần tử khớp '{post_selector}'\n")

    for i, post in enumerate(posts[:n]):
        print(f"----- Post #{i+1} (class='{post.get('class')}') -----")
        print(post.prettify()[:1500])  # in giới hạn để dễ đọc
        print()


def debug_extraction(url: str, source_key: str):
    """
    Debug lý do vì sao 1 số bài bị bỏ qua khi extract: in rõ từng post
    tìm được text hay không, text có rỗng không, có bị trùng hash không.
    Dùng khi số bản ghi lưu được ít hơn số bài tìm thấy trong log.
    """
    cfg = SOURCES[source_key]
    resp = fetch_with_retry(url)
    if resp is None:
        print("Không fetch được URL.")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    posts = soup.select(cfg.post_selector)
    print(f"Tìm thấy {len(posts)} post khớp '{cfg.post_selector}'\n")

    seen_local = set()
    for i, post in enumerate(posts):
        main_text, quoted_text = extract_quote_and_clean_text(post, cfg)

        if not main_text:
            print(f"Post #{i+1}: text rỗng / không tìm thấy text_selector '{cfg.text_selector}' -> SKIP")
            continue

        h = text_hash(main_text)
        if h in seen_local:
            print(f"Post #{i+1}: TRÙNG với 1 post trước đó (cùng hash) -> SKIP")
            print(f"   text: {main_text[:80]}")
            continue
        seen_local.add(h)

        author = extract_field(post, cfg.author_selector)
        posted_at = extract_field(post, cfg.time_selector, attr="datetime")
        reactions = extract_reaction_count(post, cfg.reaction_selector)
        post_id = extract_post_id(post, cfg.post_id_selector)

        print(f"Post #{i+1}: OK -> lưu ({len(main_text)} ký tự)")
        print(f"   post_id={post_id!r} author={author!r} posted_at={posted_at!r} reactions={reactions}")
        print(f"   text: {main_text[:80]}")
        if quoted_text:
            print(f"   [quote tách riêng]: {quoted_text[:80]}")


def crawl_thread(
    start_url: str,
    source_key: str,
    max_pages: int = 20,
    delay: float = 1.5,
    seen_hashes: Optional[set] = None,
    seen_lock: Optional[threading.Lock] = None,
) -> Iterable[dict]:
    """
    Crawl 1 thread, tự động lần theo phân trang tới khi hết trang
    hoặc chạm max_pages.

    seen_hashes/seen_lock: khi crawl nhiều thread SONG SONG (nhiều thread
    Python cùng gọi hàm này với chung 1 set seen_hashes), việc kiểm tra
    "h in seen_hashes" rồi "seen_hashes.add(h)" phải được coi là 1 thao
    tác nguyên tử để tránh 2 luồng cùng lúc lưu trùng 1 bản ghi. Nếu
    không truyền seen_lock (chạy đơn luồng như cũ), hàm vẫn hoạt động
    bình thường mà không cần khoá.
    """
    if source_key not in SOURCES:
        raise ValueError(f"Chưa khai báo config cho nguồn '{source_key}'")

    cfg = SOURCES[source_key]
    seen_hashes = seen_hashes if seen_hashes is not None else set()

    url = start_url
    page_count = 0
    thread_title = ""
    category = ""

    while url and page_count < max_pages:
        if not can_fetch(url):
            break

        resp = fetch_with_retry(url)
        if resp is None:
            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Thread title / category chỉ cần lấy 1 lần (ở trang đầu tiên)
        if page_count == 0:
            thread_title = extract_field(soup, cfg.thread_title_selector)
            category = extract_field(soup, cfg.category_selector)

        posts = soup.select(cfg.post_selector)
        logger.info("Trang %d (%s): tìm thấy %d bài", page_count + 1, url, len(posts))

        for post in posts:
            main_text, quoted_text = extract_quote_and_clean_text(post, cfg)
            if not main_text:
                continue

            h = text_hash(main_text)

            if seen_lock is not None:
                with seen_lock:
                    if h in seen_hashes:
                        continue
                    seen_hashes.add(h)
            else:
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)

            yield {
                "source": cfg.name,
                "source_url": url,
                "thread_title": thread_title,
                "category": category,
                "post_id": extract_post_id(post, cfg.post_id_selector),
                "author": extract_field(post, cfg.author_selector),
                "posted_at": extract_field(post, cfg.time_selector, attr="datetime"),
                "reaction_count": extract_reaction_count(post, cfg.reaction_selector),
                "quoted_text": quoted_text,
                "text": main_text,
                "text_hash": h,
            }

        # Tìm link trang kế tiếp (nếu selector có khai báo)
        next_url = None
        if cfg.next_page_selector:
            next_el = soup.select_one(cfg.next_page_selector)
            if next_el and next_el.get("href"):
                next_url = urljoin(url, next_el["href"])

        url = next_url
        page_count += 1

        if url:
            time.sleep(delay)  # rate limiting giữa các trang CỦA CÙNG 1 THREAD
            # Lưu ý: delay này KHÔNG bị ảnh hưởng bởi việc crawl song song
            # nhiều thread forum khác nhau — mỗi worker vẫn tự giữ nhịp độ
            # riêng khi lần lượt sang trang tiếp theo trong thread của nó.


FIELDNAMES = [
    "source", "source_url", "thread_title", "category",
    "post_id", "author", "posted_at", "reaction_count",
    "quoted_text", "text", "text_hash",
]


def save_records(
    records: Iterable[dict],
    out_path: str,
    append: bool = True,
    flush_every: int = 50,
    write_lock: Optional[threading.Lock] = None,
) -> int:
    """
    Ghi incremental ra CSV — an toàn nếu crawl bị gián đoạn giữa chừng.

    Thay vì flush() sau MỖI dòng (tốn 1 syscall ghi đĩa/dòng), giờ flush
    theo batch (mặc định 50 dòng) — vẫn đảm bảo tối đa chỉ mất `flush_every`
    dòng cuối nếu crash, nhưng giảm đáng kể số lần ghi đĩa.

    write_lock: bắt buộc truyền vào khi gọi hàm này từ nhiều thread song
    song và cùng ghi vào 1 file, để tránh các dòng ghi xen kẽ lẫn nhau
    (interleaved) làm hỏng định dạng CSV. Nếu chạy đơn luồng, có thể bỏ qua.
    """
    def _write():
        file_exists = os.path.isfile(out_path)
        mode = "a" if append and file_exists else "w"
        with open(out_path, mode, newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            if mode == "w" or not file_exists:
                writer.writeheader()
            count = 0
            for rec in records:
                writer.writerow(rec)
                count += 1
                if count % flush_every == 0:
                    f.flush()
            f.flush()  # flush nốt phần dư cuối cùng
            return count

    if write_lock is not None:
        with write_lock:
            return _write()
    return _write()


def load_seen_hashes(out_path: str) -> set:
    """Đọc các hash đã crawl từ file cũ để dedup xuyên suốt nhiều lần chạy."""
    seen = set()
    if not os.path.isfile(out_path):
        return seen
    with open(out_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("text_hash"):
                seen.add(row["text_hash"])
    return seen


def load_done_threads(path: str = DONE_THREADS_FILE) -> set:
    """Đọc danh sách các thread URL đã crawl xong hoàn toàn từ lần chạy trước."""
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


_done_threads_lock = threading.Lock()


def mark_thread_done(thread_url: str, path: str = DONE_THREADS_FILE) -> None:
    """Ghi ngay 1 thread vào file checkpoint khi crawl xong, để lần chạy sau
    bỏ qua, không phải crawl lại từ đầu toàn bộ danh sách thread.
    Bọc lock vì nhiều worker có thể ghi vào cùng 1 file checkpoint cùng lúc."""
    with _done_threads_lock:
        with open(path, "a", encoding="utf-8") as f:
            f.write(thread_url + "\n")


def crawl_one_thread_job(
    t_url: str,
    out_path: str,
    seen_hashes: set,
    seen_lock: threading.Lock,
    write_lock: threading.Lock,
) -> int:
    """
    Job chạy trong 1 worker của ThreadPoolExecutor: crawl 1 thread từ đầu
    tới cuối, ghi kết quả, rồi đánh dấu done. Mỗi worker xử lý các thread
    khác nhau song song; bên trong 1 job vẫn crawl tuần tự từng trang với
    delay như cũ.
    """
    records = crawl_thread(
        t_url,
        source_key="voz",
        seen_hashes=seen_hashes,
        seen_lock=seen_lock,
    )
    n = save_records(records, out_path, write_lock=write_lock)
    mark_thread_done(t_url)
    logger.info("Đã lưu %d bản ghi mới từ %s", n, t_url)
    return n


if __name__ == "__main__":
    # Nếu selector không khớp / số bản ghi lưu ít hơn số bài tìm thấy,
    # chạy debug trước để xem chính xác lý do từng bài bị skip:
    #
    # debug_extraction("https://voz.vn/t/ten-thread-that.123456/", source_key="voz")
    # exit()

    OUT_PATH = "data/voz_comments.csv"
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    seen = load_seen_hashes(OUT_PATH)
    done_threads = load_done_threads()
    logger.info(
        "Đã có %d bản ghi trước đó, %d thread đã crawl xong, sẽ dedup theo hash.",
        len(seen), len(done_threads),
    )

    # thread_urls = [
    #     "https://voz.vn/t/tieu-de-bat-buoc-phai-ghi-ro-ngan-sach-muc-dich-su-dung-nen-kem-theo-uu-tien-intel-amd-nvidia-khong-tu-van-laptop-linh-kien-le-vi-pham-se-xu-ly.952/",
    #     # thêm các thread khác ở đây
    # ]
    thread_urls = pd.read_csv("checkpoint_threads.csv")["thread_url"].tolist()  # hoặc đọc từ file CSV

    pending_urls = [u for u in thread_urls if u not in done_threads]
    skipped = len(thread_urls) - len(pending_urls)
    if skipped:
        logger.info("Bỏ qua %d thread đã crawl xong trước đó.", skipped)

    seen_lock = threading.Lock()
    write_lock = threading.Lock()

    total_new = 0
    try:
        # MAX_WORKERS thread khác nhau crawl song song; mỗi thread forum vẫn
        # giữ nguyên delay tuần tự giữa các trang bên trong crawl_thread().
        with ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="crawler") as executor:
            futures = {
                executor.submit(
                    crawl_one_thread_job, t_url, OUT_PATH, seen, seen_lock, write_lock
                ): t_url
                for t_url in pending_urls
            }
            for future in as_completed(futures):
                t_url = futures[future]
                try:
                    total_new += future.result()
                except Exception:
                    logger.exception("Lỗi khi crawl thread %s (đã bỏ qua, tiếp tục các thread khác)", t_url)
    except KeyboardInterrupt:
        logger.warning("Bị dừng thủ công (Ctrl+C). Tổng bản ghi mới đã lưu: %d", total_new)
    else:
        logger.info("Hoàn tất. Tổng bản ghi mới: %d", total_new)