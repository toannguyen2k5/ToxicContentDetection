// [Owner: A + C] Service worker — quản lý badge & proxy API requests
// C-update: tách count thành tcd_offensive_count + tcd_hate_count

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({
    tcd_enabled:         true,
    tcd_blocked_count:   0,
    tcd_offensive_count: 0,
    tcd_hate_count:      0,
  }, (data) => {
    chrome.storage.local.set(data);
  });
  updateBadge();
});

console.info("[Toxic Detector] Service worker started");

// ── Messages từ Content Script ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script đã sẵn sàng
  if (message?.type === "CONTENT_SCRIPT_READY") {
    console.info("[Toxic Detector] Content script ready", {
      host:            message.host,
      platformMatched: message.platformMatched,
      source:          sender.url,
    });
    sendResponse({ success: true });
    return false;
  }

  // Tăng count và cập nhật badge — tách theo label
  if (message?.type === "TCD_BLOCKED") {
    const label    = (message.label || "offensive").toLowerCase();
    const countKey = label === "hate" ? "tcd_hate_count" : "tcd_offensive_count";

    chrome.storage.local.get({
      tcd_blocked_count:   0,
      tcd_offensive_count: 0,
      tcd_hate_count:      0,
    }, (data) => {
      const newTotal  = data.tcd_blocked_count + 1;
      const newLabel  = data[countKey] + 1;
      chrome.storage.local.set({
        tcd_blocked_count: newTotal,
        [countKey]:        newLabel,
      }, () => updateBadge(newTotal));
    });
    return false;
  }

  // Proxy request kiểm tra toxic (tránh CORS từ content script)
  if (message?.type === "CHECK_TOXIC") {
    console.debug("[Toxic Detector] Proxy predict request", {
      textLength:  typeof message.text       === "string" ? message.text.length : 0,
      quoteLength: typeof message.quote_text === "string" ? message.quote_text.length : 0,
    });
    fetch("http://localhost:8000/api/text/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        text:       message.text,
        quote_text: message.quote_text  || "",
        post_title: message.post_title  || "",
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => {
        console.error("[Toxic Detector] API failed:", err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true;  // giữ sendResponse async
  }

  return false;
});

// ── Badge ─────────────────────────────────────────────────────────────────
function updateBadge(count) {
  const set = (c) => {
    chrome.action.setBadgeText({ text: c > 0 ? String(c) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  };
  if (typeof count === "number") {
    set(count);
  } else {
    chrome.storage.local.get({ tcd_blocked_count: 0 }, (d) => set(d.tcd_blocked_count));
  }
}