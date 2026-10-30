// [Owner: A] Service worker - quản lý settings/badge & proxy API requests

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ tcd_enabled: true, tcd_blocked_count: 0 }, (data) => {
    chrome.storage.local.set({
      tcd_enabled: data.tcd_enabled,
      tcd_blocked_count: data.tcd_blocked_count
    });
  });
  updateBadge();
});

console.info("[Toxic Detector] Service worker started");

// ---------- Xử lý Messages từ Content Script ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONTENT_SCRIPT_READY") {
    console.info("[Toxic Detector] Content script ready", {
      host: message.host,
      platformMatched: message.platformMatched,
      source: sender.url
    });
    sendResponse({ success: true });
    return false;
  }

  // 1. Tăng số lượng tin nhắn bị chặn & Cập nhật Badge
  if (message?.type === "TCD_BLOCKED") {
    chrome.storage.local.get({ tcd_blocked_count: 0 }, (data) => {
      const newCount = data.tcd_blocked_count + 1;
      chrome.storage.local.set({ tcd_blocked_count: newCount }, () => {
        updateBadge(newCount);
      });
    });
    return false;
  }

  // 2. Proxy request kiểm tra toxic về Local API (Tránh lỗi Mixed Content/CORS ở content.js)
  if (message?.type === "CHECK_TOXIC") {
    console.info("[Toxic Detector] Received prediction request", {
      source: sender.url,
      textLength: typeof message.text === "string" ? message.text.length : 0,
      text: message.text,
      quoteTextLength: typeof message.quote_text === "string" ? message.quote_text.length : 0,
      quote_text: message.quote_text || "",
      postTitleLength: typeof message.post_title === "string" ? message.post_title.length : 0,
      post_title: message.post_title || ""
    });
    fetch("http://localhost:8000/api/text/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        quote_text: message.quote_text || "",
        post_title: message.post_title || ""
      })
    })
      .then((res) => {
      if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
      console.info("[Toxic Detector] API responded with HTTP", res.status);
      return res.json();
    })
    .then((data) => sendResponse({ success: true, data }))
    .catch((err) => {
      console.error("[Toxic Detector] API request failed:", err);
      sendResponse({ success: false, error: err.toString() });
    });

    // Bắt buộc return true để giữ giao tiếp bất đồng bộ (async) cho sendResponse
    return true; 
  }

  return false;
});

// ---------- Quản lý Badge Icon ----------
function updateBadge(count) {
  const setBadge = (c) => {
    chrome.action.setBadgeText({ text: c > 0 ? String(c) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  };

  if (typeof count === "number") {
    setBadge(count);
  } else {
    chrome.storage.local.get({ tcd_blocked_count: 0 }, (data) => setBadge(data.tcd_blocked_count));
  }
}