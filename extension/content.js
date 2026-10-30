// [Owner: A] Scan DOM, gửi text tới API :8000, phủ overlay mờ nếu toxic.
//
// Tối ưu hiệu năng để KHÔNG cạnh tranh main thread với việc render feed:
//   1) Xác định "phần tử lá" theo kiểu duyệt-lên-tổ-tiên (O(n * độ sâu)).
//   2) MutationObserver chỉ đẩy các node MỚI vào hàng đợi.
//   3) Hàng đợi xử lý trong requestIdleCallback (time-slicing).
//   4) Hiển thị bằng overlay riêng, không mutate DOM gốc của trang.
//
// Bản này sửa việc lấy quote_text / post_title trên Facebook:
//   - Facebook chỉ vẽ tối đa 3 cấp thụt lề, từ cấp 4 trở đi comment bị dồn phẳng,
//     nên KHÔNG thể dựa vào thụt lề hay cấu trúc cây để biết "ai trả lời ai".
//   - Tín hiệu đáng tin ở mọi độ sâu: tên người được mention ở ĐẦU nội dung comment.
//     Comment cha = comment gần nhất phía trên có tác giả trùng với người được mention.
//   - post_title không bao giờ được phép trùng với text của chính comment.

(() => {
  const DEBUG_CHAIN = false;       // bật true để log chuỗi tổ tiên khi quote/post_title bất thường
  const MIN_TEXT_LENGTH = 4;
  const MAX_TEXT_LENGTH = 500;
  const MAX_QUOTE_LENGTH = 2000;
  const MAX_POST_TITLE_LENGTH = 2000;
  const MAX_PARENT_LOOKBACK = 400; // số comment tối đa duyệt ngược khi tìm comment cha
  const REQUEST_GAP_MS = 120;      // giãn cách giữa các lần gọi API
  const OVERLAY_SYNC_MS = 200;     // tần suất cập nhật lại vị trí overlay
  const IDLE_TIMEOUT_MS = 1000;    // ép chạy idle callback trong tối đa 1s nếu trình duyệt bận liên tục
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "CANVAS",
    "INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "CODE", "PRE"
  ]);
  const FACEBOOK_POST_TITLE_SELECTOR = [
    '[data-ad-preview="message"]',
    '[data-ad-comet-preview="message"]',
    '[data-ad-rendering-role="story_message"]'
  ].join(", ");

  const platformConfigs = [
    {
      hosts: ["facebook.com"],
      commentSelector: [
        '[data-testid="comment"]',
        '[data-testid^="comment"]',
        '[aria-label*="comment" i]',
        '[aria-label*="bình luận" i]',
        // Reply cấp sâu có thể mang aria-label khác ("Phản hồi...", "Reply..."):
        // mọi role="article" có aria-label và KHÔNG chứa nội dung bài viết đều là comment.
        // (Bài viết thật không có aria-label và/hoặc chứa phần tử đánh dấu nội dung.)
        '[role="article"][aria-label]:not(:has([data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]))'
      ].join(", "),
      postSelector: '[role="article"], [data-pagelet^="FeedUnit_"]',
      textSelector: '[dir="auto"]'
    },
    {
      hosts: ["youtube.com"],
      commentSelector: [
        "ytd-comment-view-model",
        "ytd-comment-renderer",
        "ytd-comment-thread-renderer #content-text"
      ].join(", "),
      textSelector: "#content-text"
    }
  ];

  function getPlatformConfig() {
    const hostname = location.hostname.toLowerCase();
    return platformConfigs.find((config) =>
      config.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    );
  }

  const platformConfig = getPlatformConfig();
  console.info("[Toxic Detector] Content script injected", {
    host: location.hostname,
    platformMatched: Boolean(platformConfig)
  });
  chrome.runtime.sendMessage({
    type: "CONTENT_SCRIPT_READY",
    host: location.hostname,
    platformMatched: Boolean(platformConfig)
  }).catch((error) => {
    console.error("[Toxic Detector] Could not report content script startup:", error);
  });
  if (!platformConfig) return;
  console.info("[Toxic Detector] Content script active on", location.hostname);

  const IS_FACEBOOK = platformConfig.hosts.includes("facebook.com");
  const IS_YOUTUBE = platformConfig.hosts.includes("youtube.com");

  const MAX_CACHED_PREDICTIONS = 1000;
  const FAILED_PREDICTION_CACHE_MS = 5000;

  function getScanRoot() {
    return document.body;
  }

  let enabled = true;
  const processed = new WeakSet();
  const processedPostTitles = new WeakMap();
  const postTitleRetryCounts = new WeakMap();
  const pendingPostTitleRetries = new WeakSet();
  const pendingScanNodes = new WeakSet();
  const observedFeedPosts = new WeakSet();
  let feedPostObserver = null;
  const overlayMap = new WeakMap();
  const activeOverlays = new Set();
  const predictionCache = new Map();
  const pendingPredictions = new Map();

  const nodeQueue = [];          // các node MỚI cần quét (từ MutationObserver)
  const apiQueue = [];           // các {el, text, quote_text} cần gọi API
  let isSending = false;
  let idleScheduled = false;
  let syncTimer = null;
  let lastRequestAt = 0;

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

    while (nodeQueue.length > 0 && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      const node = nodeQueue.shift();
      pendingScanNodes.delete(node);
      scanNode(node);
    }

    if (apiQueue.length > 0) processApiQueue();
    if (nodeQueue.length > 0) ensureIdleScheduled();
  }

  function queueNode(node) {
    if (!node || !enabled || pendingScanNodes.has(node)) return;
    pendingScanNodes.add(node);
    nodeQueue.push(node);
    ensureIdleScheduled();
  }

  // ---------- Quét node ----------
  function scanNode(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;

    if (IS_FACEBOOK) scanFacebookPostTitles(root);

    const matchedCandidates = [];
    if (root.matches && root.matches(platformConfig.commentSelector)) matchedCandidates.push(root);
    root.querySelectorAll(platformConfig.commentSelector).forEach((el) => matchedCandidates.push(el));

    const candidates = IS_YOUTUBE
      ? [...new Set(matchedCandidates.map((el) => {
          if (el.matches("#content-text")) return el;
          return el.querySelector("#content-text") || el;
        }))]
      : matchedCandidates;

    for (const el of candidates) {
      if (processed.has(el) || !isComment(el)) continue;
      const text = getCommentText(el);
      if (text.length < MIN_TEXT_LENGTH) continue;

      processed.add(el);
      const quote_text = getQuoteText(el);
      const post_title = getPostTitle(el);

      if (DEBUG_CHAIN && IS_FACEBOOK && (!quote_text || post_title === text)) {
        logAncestorChain(el, text);
      }

      apiQueue.push({
        el,
        text: text.slice(0, MAX_TEXT_LENGTH),
        ...(quote_text ? { quote_text: quote_text.slice(0, MAX_QUOTE_LENGTH) } : {}),
        ...(post_title ? { post_title: post_title.slice(0, MAX_POST_TITLE_LENGTH) } : {})
      });
      console.debug("[Toxic Detector] Comment queued for prediction", {
        textLength: Math.min(text.length, MAX_TEXT_LENGTH),
        quoteTextLength: Math.min(quote_text.length, MAX_QUOTE_LENGTH),
        postTitleLength: Math.min(post_title.length, MAX_POST_TITLE_LENGTH)
      });
    }
  }

  function logAncestorChain(el, text) {
    const chain = [];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      chain.push(
        `${a.tagName.toLowerCase()} role=${a.getAttribute("role")} ` +
        `label="${(a.getAttribute("aria-label") || "").slice(0, 60)}" ` +
        `isComment=${a.matches(platformConfig.commentSelector)}`
      );
    }
    console.log("[TCD] chain for:", text.slice(0, 30), "\n" + chain.join("\n"));
  }

  function scanFacebookPostTitles(root) {
    const candidates = [];
    if (root.matches && root.matches('[role="article"]')) candidates.push(root);
    root.querySelectorAll('[role="article"]').forEach((post) => candidates.push(post));
    if (root.matches && root.matches('[data-pagelet^="FeedUnit_"]') &&
        !root.querySelector('[role="article"]')) {
      candidates.push(root);
    }
    root.querySelectorAll('[data-pagelet^="FeedUnit_"]').forEach((post) => {
      if (!post.querySelector('[role="article"]')) candidates.push(post);
    });

    for (const post of candidates) {
      if (post.matches(platformConfig.commentSelector)) continue;
      if (
        post.matches('[role="article"]') &&
        post.parentElement?.closest('[role="article"]')
      ) continue;
      observeFacebookPost(post);
      const post_title = getOwnFacebookPostText(post, FACEBOOK_POST_TITLE_SELECTOR);
      if (post_title.length < MIN_TEXT_LENGTH) {
        schedulePostTitleRetry(post);
        continue;
      }
      if (processedPostTitles.get(post) === post_title) continue;

      postTitleRetryCounts.delete(post);
      processedPostTitles.set(post, post_title);
      apiQueue.push({
        el: post,
        text: post_title.slice(0, MAX_POST_TITLE_LENGTH),
        quote_text: "",
        post_title: post_title.slice(0, MAX_POST_TITLE_LENGTH)
      });
      console.debug("[Toxic Detector] Feed post title queued for classification", {
        postTitleLength: Math.min(post_title.length, MAX_POST_TITLE_LENGTH)
      });
    }
  }

  function schedulePostTitleRetry(post) {
    const retries = postTitleRetryCounts.get(post) || 0;
    if (retries >= 3 || pendingPostTitleRetries.has(post)) return;

    postTitleRetryCounts.set(post, retries + 1);
    pendingPostTitleRetries.add(post);
    setTimeout(() => {
      pendingPostTitleRetries.delete(post);
      if (post.isConnected && enabled) queueNode(post);
    }, 350 * (retries + 1));
  }

  function isComment(el) {
    return !platformConfig.isComment || platformConfig.isComment(el);
  }

  function getCommentText(commentEl) {
    const textElements = getLeafTextElements(commentEl, platformConfig.textSelector);
    const nestedQuote = getNestedQuote(commentEl);
    return textElements
      .filter((el) => !isInsideElement(el, nestedQuote) && !el.closest("a, button, time"))
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function getLeafTextElements(container, selector) {
    const candidates = [];
    if (container.matches && container.matches(selector)) candidates.push(container);
    container.querySelectorAll(selector).forEach((el) => candidates.push(el));

    const matched = new Set(candidates);
    const hasMatchedDescendant = new Set();
    for (const el of candidates) {
      let parent = el.parentElement;
      while (parent && parent !== container.parentElement) {
        if (matched.has(parent)) {
          hasMatchedDescendant.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    }

    return candidates.filter((el) => !hasMatchedDescendant.has(el) && !SKIP_TAGS.has(el.tagName));
  }

  function getNestedQuote(commentEl) {
    const blockquote = commentEl.querySelector("blockquote");
    if (blockquote) return blockquote;
    return null;
  }

  function isInsideElement(el, container) {
    return Boolean(container && (container === el || container.contains(el)));
  }

  // =====================================================================
  //  FACEBOOK: tìm comment cha dựa trên MENTION ở đầu comment
  // =====================================================================

  const normalizeName = (s) => (s || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

  // Khóa định danh profile: bỏ query rác (__cft__, __tn__...), chỉ giữ id nếu là profile.php
  function profileKey(link) {
    try {
      const u = new URL(link.href, location.href);
      return u.pathname + (u.pathname.includes("profile.php") ? "?id=" + u.searchParams.get("id") : "");
    } catch {
      return "";
    }
  }

  // Text thuộc RIÊNG comment này (không lẫn reply con / comment lồng)
  function getFbOwnText(comment) {
    return getLeafTextElements(comment, platformConfig.textSelector)
      .filter((el) =>
        el.closest(platformConfig.commentSelector) === comment &&
        !el.closest("a, button, time"))
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  // Link tên tác giả = link có chữ ĐẦU TIÊN trong comment (header nằm trước nội dung)
  function getFbAuthorLink(comment) {
    return [...comment.querySelectorAll("a[href]")].find((l) =>
      l.closest(platformConfig.commentSelector) === comment && l.textContent.trim()
    );
  }

  // Mention = link (khác link tác giả) có chữ trùng với PHẦN ĐẦU nội dung comment
  function getFbMention(comment) {
    const author = getFbAuthorLink(comment);
    const body = normalizeName(getFbOwnText(comment));
    const link = [...comment.querySelectorAll("a[href]")].find((l) =>
      l !== author &&
      l.closest(platformConfig.commentSelector) === comment &&
      l.textContent.trim() &&
      body.startsWith(normalizeName(l.textContent))
    );
    return link ? { key: profileKey(link), name: normalizeName(link.textContent) } : null;
  }

  // Duyệt NGƯỢC từ comment hiện tại, lấy comment gần nhất có tác giả == người được mention
  function getFbReplyParentText(commentEl, scope) {
    const mention = getFbMention(commentEl);
    if (!mention) return "";                           // comment gốc, không có quote

    const all = [...scope.querySelectorAll(platformConfig.commentSelector)];
    const idx = all.indexOf(commentEl);
    if (idx < 0) return "";

    const stop = Math.max(0, idx - MAX_PARENT_LOOKBACK);
    for (let i = idx - 1; i >= stop; i--) {
      const c = all[i];
      if (c.contains(commentEl)) continue;             // bỏ wrapper chứa chính nó
      const a = getFbAuthorLink(c);
      if (!a) continue;
      if (
        (mention.key && profileKey(a) === mention.key) ||
        normalizeName(a.textContent) === mention.name
      ) {
        const t = getFbOwnText(c);
        if (t.length >= MIN_TEXT_LENGTH) return t;
      }
    }
    return "";
  }

  function getFbScope(commentEl) {
    return commentEl.closest('[role="dialog"]') ||
      commentEl.closest('[data-pagelet^="FeedUnit_"]') ||
      getFacebookPostContainer(commentEl) ||
      document.body;
  }

  // Phương án dự phòng: so sánh thụt lề (chỉ dùng khi không có mention)
  function getFbQuoteByIndent(commentEl, scope) {
    const ownText = (comment) => {
      const textElements = getLeafTextElements(comment, platformConfig.textSelector)
        .filter((el) =>
          el.closest(platformConfig.commentSelector) === comment &&
          !el.closest("a, button, time"));
      const text = textElements.map((el) => el.textContent.trim()).filter(Boolean).join(" ").trim();
      return {
        text,
        left: textElements[0]?.getBoundingClientRect().left ?? comment.getBoundingClientRect().left
      };
    };

    const targetLeft = ownText(commentEl).left;
    let nearestParent = null;
    const comments = [];
    if (scope.matches?.(platformConfig.commentSelector)) comments.push(scope);
    scope.querySelectorAll(platformConfig.commentSelector).forEach((el) => comments.push(el));

    for (const candidate of comments) {
      if (
        candidate === commentEl ||
        candidate.contains(commentEl) ||
        !(candidate.compareDocumentPosition(commentEl) & Node.DOCUMENT_POSITION_FOLLOWING)
      ) continue;

      const candidateText = ownText(candidate);
      if (candidateText.text.length < MIN_TEXT_LENGTH) continue;
      // cha phải thụt lề NÔNG hơn con (có dung sai)
      if (candidateText.left >= targetLeft - 4) continue;
      if (!nearestParent || candidateText.left >= nearestParent.left) {
        nearestParent = candidateText;
      }
    }
    return nearestParent ? nearestParent.text : "";
  }

  // =====================================================================

  function getQuoteText(commentEl) {
    if (IS_YOUTUBE) {
      const thread = commentEl.closest("ytd-comment-thread-renderer");
      const replyGroup = commentEl.closest("ytd-comment-replies-renderer");
      if (!thread || (!replyGroup && !thread.hasAttribute("is-sub-thread"))) return "";

      const textSelector = "ytd-comment-view-model #content-text, ytd-comment-renderer #content-text";
      const getThreadComment = (parentThread) => [...parentThread.querySelectorAll(textSelector)].find((el) =>
        el !== commentEl &&
        el.closest("ytd-comment-thread-renderer") === parentThread
      )?.textContent.trim() || "";

      for (
        let parentThread = thread.parentElement?.closest("ytd-comment-thread-renderer");
        parentThread;
        parentThread = parentThread.parentElement?.closest("ytd-comment-thread-renderer")
      ) {
        const quote = getThreadComment(parentThread);
        if (quote) return quote;
      }

      return "";
    }

    if (IS_FACEBOOK) {
      // 1) Comment cha lồng thật sự trong DOM (nếu có)
      for (let ancestor = commentEl.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (!ancestor.matches(platformConfig.commentSelector)) continue;
        const parentText = getFbOwnText(ancestor);
        if (parentText.length >= MIN_TEXT_LENGTH) return parentText;
      }

      const scope = getFbScope(commentEl);

      // 2) Theo mention ở đầu comment (đúng với mọi độ sâu, kể cả khi bị dồn phẳng)
      const byMention = getFbReplyParentText(commentEl, scope);
      if (byMention) return byMention;

      // 3) Dự phòng: chỉ dùng khi comment KHÔNG có mention nhưng vẫn là reply thụt lề
      if (!getFbMention(commentEl)) {
        const byIndent = getFbQuoteByIndent(commentEl, scope);
        if (byIndent) return byIndent;
      }
      return "";
    }

    return [...commentEl.querySelectorAll("blockquote")]
      .map((quote) => quote.textContent.trim())
      .filter(Boolean)
      .join(" ");
  }

  // ---------- post_title (Facebook) ----------
  function getPostTitle(commentEl) {
    if (!IS_FACEBOOK) return "";

    const sel = platformConfig.commentSelector;
    const ownText = getCommentText(commentEl);

    // Đi lên từng tổ tiên, tìm phần tử được đánh dấu là nội dung bài viết (không nằm trong comment)
    for (let a = commentEl.parentElement; a; a = a.parentElement) {
      const marked = [...a.querySelectorAll(FACEBOOK_POST_TITLE_SELECTOR)]
        .find((el) => !el.closest(sel));
      if (marked) {
        const t = marked.textContent.trim();
        if (t.length >= MIN_TEXT_LENGTH && t !== ownText) return t;
      }
      if (a.matches('[role="dialog"], [data-pagelet^="FeedUnit_"]')) break;
    }

    // Dự phòng: lấy text của bài viết, nhưng loại kết quả thuộc về chính comment
    const post = getFacebookPostContainer(commentEl);
    if (!post || post.matches('[role="dialog"]')) return "";
    const t = getOwnFacebookPostText(post, FACEBOOK_POST_TITLE_SELECTOR);
    if (!t || t === ownText || (post.contains(commentEl) && ownText.includes(t))) return "";
    return t;
  }

  function getFacebookPostContainer(commentEl) {
    let postArticle = null;
    let feedUnit = null;
    let dialog = null;

    for (let ancestor = commentEl.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.matches('[role="dialog"]')) {
        dialog = ancestor;
        break;
      }
      if (ancestor.matches('[data-pagelet^="FeedUnit_"]')) feedUnit = ancestor;
      if (
        ancestor.matches('[role="article"]') &&
        !ancestor.matches(platformConfig.commentSelector)
      ) {
        postArticle = ancestor;
      }
    }

    return feedUnit || postArticle || dialog;
  }

  function getOwnFacebookPostText(post, titleSelector) {
    const markedTitle = post.querySelector(titleSelector);
    if (markedTitle && !markedTitle.closest(platformConfig.commentSelector)) {
      const title = markedTitle.textContent.trim();
      if (title.length >= MIN_TEXT_LENGTH) return title;
    }

    return getLeafTextElements(post, platformConfig.textSelector)
      .filter((el) =>
        !el.closest(platformConfig.commentSelector) &&
        !el.closest("a, button, time") &&
        (!post.matches('[role="article"]') || el.closest('[role="article"]') === post)
      )
      .map((el) => el.textContent.trim())
      .filter((text) => text.length >= MIN_TEXT_LENGTH)
      .join(" ")
      .trim();
  }

  // ---------- Gọi API kiểm tra toxic (qua Background.js) ----------
  async function checkToxic(text, quote_text, post_title) {
    const key = JSON.stringify([text, quote_text || "", post_title || ""]);
    const cached = predictionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    if (cached) predictionCache.delete(key);
    if (pendingPredictions.has(key)) return pendingPredictions.get(key);

    const request = (async () => {
      await waitForRequestGap();
      return new Promise((resolve) => {
        if (!chrome.runtime?.id) {
          console.error("[Toxic Detector] Cannot contact the extension service worker: extension context is unavailable");
          resolve(null);
          return;
        }
        console.debug("[Toxic Detector] Sending prediction request to service worker");
        chrome.runtime.sendMessage({
          type: "CHECK_TOXIC",
          text,
          quote_text: quote_text || "",
          ...(post_title ? { post_title } : {})
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Toxic Detector] Service worker message failed:", chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (!response || !response.success) {
            console.error("[Toxic Detector] Prediction request failed:", response?.error || "No response from service worker");
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
    })();

    const cachedRequest = request.then((result) => {
      pendingPredictions.delete(key);
      if (typeof result === "boolean" || result === null) {
        cachePrediction(key, Promise.resolve(result), result === null ? FAILED_PREDICTION_CACHE_MS : Infinity);
      }
      return result;
    });
    pendingPredictions.set(key, cachedRequest);
    return cachedRequest;
  }

  async function waitForRequestGap() {
    const delay = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
  }

  function cachePrediction(key, promise, ttl) {
    predictionCache.delete(key);
    predictionCache.set(key, {
      promise,
      expiresAt: ttl === Infinity ? Infinity : Date.now() + ttl
    });
    if (predictionCache.size > MAX_CACHED_PREDICTIONS) {
      predictionCache.delete(predictionCache.keys().next().value);
    }
  }

  async function processApiQueue() {
    if (isSending) return;
    isSending = true;

    while (apiQueue.length > 0) {
      if (!enabled) break;
      const { el, text, quote_text, post_title } = apiQueue.shift();
      const isToxic = await checkToxic(text, quote_text, post_title);
      if (isToxic) {
        console.info("[Toxic Detector] Toxic content detected; blurring target");
        createOverlay(el);
      }
    }

    isSending = false;
  }

  // ---------- Overlay (không mutate DOM gốc của trang) ----------
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

    chrome.runtime.sendMessage({ type: "TCD_BLOCKED" }).catch(() => { });
  }

  // CSS dùng position: absolute nên toạ độ tính theo TRANG (cộng scroll).
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
      if (m.type === "characterData") {
        const comment = m.target.parentElement?.closest(platformConfig.commentSelector);
        if (comment) queueNode(comment);
        if (platformConfig.postSelector) {
          const post = m.target.parentElement?.closest(platformConfig.postSelector);
          if (post) queueNode(post);
        }
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList?.contains("tcd-overlay")) continue;
          queueNode(node);

          const comment = node.matches(platformConfig.commentSelector)
            ? node
            : node.closest(platformConfig.commentSelector);
          if (comment) queueNode(comment);

          if (platformConfig.postSelector) {
            const post = node.matches(platformConfig.postSelector)
              ? node
              : node.closest(platformConfig.postSelector);
            if (post) queueNode(post);
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const comment = node.parentElement?.closest(platformConfig.commentSelector);
          if (comment) queueNode(comment);
          if (platformConfig.postSelector) {
            const post = node.parentElement?.closest(platformConfig.postSelector);
            if (post) queueNode(post);
          }
        }
      }
    }
  });

  let feedScrollTimer = null;
  function observeFacebookPost(post) {
    if (!feedPostObserver || observedFeedPosts.has(post)) return;
    observedFeedPosts.add(post);
    feedPostObserver.observe(post);
  }

  function queueVisibleFacebookPosts() {
    if (!IS_FACEBOOK || !enabled) return;
    const posts = document.querySelectorAll('[role="article"], [data-pagelet^="FeedUnit_"]');
    for (const post of posts) {
      const rect = post.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) queueNode(post);
    }
  }

  function handleFeedScroll() {
    if (!IS_FACEBOOK || feedScrollTimer) return;
    feedScrollTimer = setTimeout(() => {
      feedScrollTimer = null;
      queueVisibleFacebookPosts();
    }, 200);
  }

  function start() {
    const root = getScanRoot();
    queueNode(root);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    if (IS_FACEBOOK) {
      feedPostObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) queueNode(entry.target);
        }
      }, { rootMargin: "200px 0px" });
      document.addEventListener("scroll", handleFeedScroll, { capture: true, passive: true });
      queueVisibleFacebookPosts();
    }
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();