// [Owner: A] Scan DOM, gửi text tới API :8000, phủ overlay mờ nếu toxic.
//
// Bản này tối ưu hiệu năng để KHÔNG cạnh tranh main thread với việc render
// News Feed của Facebook (nguyên nhân khiến feed từng bị trống dù không có
// lỗi JS nào):
//   1) Xác định "phần tử lá" theo kiểu duyệt-lên-tổ-tiên (O(n * độ sâu))
//      thay vì mỗi phần tử tự gọi querySelector xuống toàn bộ subtree của nó
//      (có thể thành O(n^2) trên feed nhiều bài viết/comment lồng nhau).
//   2) MutationObserver chỉ đẩy các node MỚI được thêm vào hàng đợi, thay vì
//      quét lại toàn bộ document.body mỗi lần có thay đổi bất kỳ ở đâu đó.
//   3) Việc xử lý hàng đợi luôn chạy trong requestIdleCallback (có time-slicing
//      qua deadline.timeRemaining()), nên không bao giờ chiếm main thread liên
//      tục đủ lâu để chen ngang lúc Facebook đang render/batch update.
//   4) Hiển thị bằng overlay riêng (không mutate DOM gốc của Facebook) như
//      bản trước, để React của Facebook không bị "hiểu lầm" có thay đổi lạ.

(() => {
  const MIN_TEXT_LENGTH = 4;
  const MAX_TEXT_LENGTH = 500;
  const REQUEST_GAP_MS = 120;      // giãn cách giữa các lần gọi API
  const OVERLAY_SYNC_MS = 200;     // tần suất cập nhật lại vị trí overlay
  const IDLE_TIMEOUT_MS = 1000;    // ép chạy idle callback trong tối đa 1s nếu trình duyệt bận liên tục
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "CANVAS",
    "INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "CODE", "PRE"
  ]);

  const TEXT_SELECTOR = 'div[dir="auto"], div[data-ad-preview="message"], span[dir="auto"]';

  // Chỉ quét trong phạm vi khu vực nội dung chính nếu tìm được (hẹp hơn hẳn
  // document.body toàn trang, ví dụ khung chat/story/sidebar sẽ không bị quét).
  function getScanRoot() {
    return (
      document.querySelector('[role="feed"]') ||
      document.querySelector('[role="main"]') ||
      document.body
    );
  }

  let enabled = true;
  const processed = new WeakSet();
  const overlayMap = new WeakMap();
  const activeOverlays = new Set();

  const nodeQueue = [];          // các node MỚI cần quét (từ MutationObserver)
  const apiQueue = [];           // các {el, text} cần gọi API kiểm tra toxic
  let isSending = false;
  let idleScheduled = false;
  let syncTimer = null;

  // ---------- Storage: đọc trạng thái bật/tắt ----------
  chrome.storage.local.get({ tcd_enabled: true }, (data) => {
    enabled = data.tcd_enabled;
    if (enabled) queueNode(getScanRoot());
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "tcd_enabled" in changes) {
      enabled = changes.tcd_enabled.newValue;
      if (!enabled) removeAllOverlays();
      else queueNode(getScanRoot());
    }
  });

  // ---------- requestIdleCallback với fallback ----------
  const scheduleIdle =
    window.requestIdleCallback ||
    ((cb) => setTimeout(() => cb({ timeRemaining: () => 16, didTimeout: false }), 32));

  function ensureIdleScheduled() {
    if (idleScheduled) return;
    idleScheduled = true;
    scheduleIdle(runIdleWork, { timeout: IDLE_TIMEOUT_MS });
  }

  function runIdleWork(deadline) {
    idleScheduled = false;

    // Xử lý các node mới trong hàng đợi, dừng lại nếu hết thời gian rảnh
    // và tự lên lịch tiếp tục ở lần idle kế tiếp (time-slicing).
    while (nodeQueue.length > 0 && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      const node = nodeQueue.shift();
      scanNode(node);
    }

    if (nodeQueue.length > 0) {
      ensureIdleScheduled();
    } else if (apiQueue.length > 0) {
      processApiQueue();
    }
  }

  function queueNode(node) {
    if (!node || !enabled) return;
    nodeQueue.push(node);
    ensureIdleScheduled();
  }

  // ---------- Xác định phần tử "lá" chứa text — tránh O(n^2) ----------
  function scanNode(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;

    const candidates = [];
    if (root.matches && root.matches(TEXT_SELECTOR)) candidates.push(root);
    root.querySelectorAll(TEXT_SELECTOR).forEach((el) => candidates.push(el));

    const filtered = candidates.filter(
      (el) => !processed.has(el) && !SKIP_TAGS.has(el.tagName)
    );
    if (filtered.length === 0) return;

    const matchedSet = new Set(filtered);
    const hasMatchedDescendant = new Set();

    // Duyệt lên tổ tiên từ mỗi phần tử: nếu tổ tiên gần nhất cũng khớp
    // selector, đánh dấu tổ tiên đó là "container" (có con khớp) — chi phí
    // tỉ lệ với độ sâu lồng nhau, KHÔNG tỉ lệ với kích thước subtree.
    for (const el of filtered) {
      let p = el.parentElement;
      while (p && p !== root.parentElement) {
        if (matchedSet.has(p)) {
          hasMatchedDescendant.add(p);
          break;
        }
        p = p.parentElement;
      }
    }

    for (const el of filtered) {
      if (hasMatchedDescendant.has(el)) continue;
      const text = el.textContent.trim();
      processed.add(el);
      if (text.length >= MIN_TEXT_LENGTH) {
        apiQueue.push({ el, text: text.slice(0, MAX_TEXT_LENGTH) });
      }
    }
  }

  // ---------- Gọi API kiểm tra toxic (qua Background.js), tuần tự ----------
  async function checkToxic(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CHECK_TOXIC", text }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          resolve(null);
          return;
        }
        const data = response.data;
        if (typeof data.toxic === "boolean") resolve(data.toxic);
        else if (typeof data.is_toxic === "boolean") resolve(data.is_toxic);
        else if (typeof data.label === "string") resolve(/toxic|độc hại|1/i.test(data.label));
        else if (typeof data.prediction !== "undefined") resolve(Number(data.prediction) === 1 || data.prediction === true);
        else if (typeof data.score === "number") resolve(data.score >= 0.5);
        else resolve(null);
      });
    });
  }

  async function processApiQueue() {
    if (isSending) return;
    isSending = true;

    while (apiQueue.length > 0) {
      if (!enabled) break;
      const { el, text } = apiQueue.shift();
      const isToxic = await checkToxic(text);
      if (isToxic) createOverlay(el);
      await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
    }

    isSending = false;
  }

  // ---------- Overlay (không mutate DOM gốc của Facebook) ----------
  function createOverlay(target) {
    if (overlayMap.has(target) || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const overlay = document.createElement("div");
    overlay.className = "tcd-overlay";
    overlay.title = "Nội dung có thể độc hại — nhấn để hiện";
    positionOverlay(overlay, rect);
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      removeOverlay(target);
    });

    document.body.appendChild(overlay);
    overlayMap.set(target, overlay);
    activeOverlays.add(target);
    startSyncLoop();

    chrome.runtime.sendMessage({ type: "TCD_BLOCKED" }).catch(() => {});
  }

  function positionOverlay(overlay, rect) {
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function removeOverlay(target) {
    const overlay = overlayMap.get(target);
    if (overlay) {
      overlay.remove();
      overlayMap.delete(target);
    }
    activeOverlays.delete(target);
    if (activeOverlays.size === 0) stopSyncLoop();
  }

  function removeAllOverlays() {
    activeOverlays.forEach((target) => removeOverlay(target));
  }

  function syncOverlays() {
    activeOverlays.forEach((target) => {
      const overlay = overlayMap.get(target);
      if (!overlay) return;
      if (!target.isConnected) {
        removeOverlay(target);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        overlay.style.display = "none";
      } else {
        overlay.style.display = "block";
        positionOverlay(overlay, rect);
      }
    });
  }

  function startSyncLoop() {
    if (syncTimer) return;
    syncTimer = setInterval(syncOverlays, OVERLAY_SYNC_MS);
    window.addEventListener("scroll", syncOverlays, { passive: true });
    window.addEventListener("resize", syncOverlays, { passive: true });
  }

  function stopSyncLoop() {
    if (!syncTimer) return;
    clearInterval(syncTimer);
    syncTimer = null;
    window.removeEventListener("scroll", syncOverlays);
    window.removeEventListener("resize", syncOverlays);
  }

  // ---------- Theo dõi DOM: chỉ đẩy đúng các node MỚI vào hàng đợi ----------
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      if (!m.addedNodes) continue;
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.classList?.contains("tcd-overlay")) continue; // bỏ qua overlay của chính mình
        queueNode(node);
      }
    }
  });

  function start() {
    const root = getScanRoot();
    queueNode(root);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();