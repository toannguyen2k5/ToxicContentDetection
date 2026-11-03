// [Owner: A + C] Logic popup: toggle, stats breakdown, API status, threshold sync

const API_BASE = "http://localhost:8000";

const toggleEl         = document.getElementById("tcd-toggle");
const hostEl           = document.getElementById("tcd-host");
const statusDotEl      = document.getElementById("tcd-status-dot");
const statusTextEl     = document.getElementById("tcd-status-text");
const offensiveCountEl = document.getElementById("tcd-offensive-count");
const hateCountEl      = document.getElementById("tcd-hate-count");
const thresholdEl      = document.getElementById("tcd-threshold");
const thresholdPctEl   = document.getElementById("tcd-threshold-pct");
const resetBtn         = document.getElementById("tcd-reset");

// ── Render state ──────────────────────────────────────────────────────────
function render() {
  chrome.storage.local.get({
    tcd_enabled:         true,
    tcd_offensive_count: 0,
    tcd_hate_count:      0,
  }, (data) => {
    toggleEl.checked          = data.tcd_enabled;
    offensiveCountEl.textContent = data.tcd_offensive_count;
    hateCountEl.textContent      = data.tcd_hate_count;
  });
}

// ── Host name của tab hiện tại ────────────────────────────────────────────
function loadHost() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try {
      const url = new URL(tabs[0]?.url || "");
      hostEl.textContent = url.hostname || "—";
    } catch {
      hostEl.textContent = "—";
    }
  });
}

// ── API health check ──────────────────────────────────────────────────────
async function checkApiStatus() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusDotEl.className  = "tcd-status-dot connected";
      statusTextEl.textContent = "API Connected · localhost:8000";
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    statusDotEl.className  = "tcd-status-dot offline";
    statusTextEl.textContent = "API Offline — extension tạm dừng";
  }
}

// ── Threshold: đọc từ API settings ───────────────────────────────────────
async function loadThreshold() {
  try {
    const res  = await fetch(`${API_BASE}/api/settings`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const val  = typeof data.confidence_threshold === "number" ? data.confidence_threshold : 0.8;
    thresholdEl.value       = val;
    thresholdPctEl.textContent = `${Math.round(val * 100)}%`;
  } catch {
    // Offline — giữ default
  }
}

// Lưu threshold về API khi user thay đổi (debounce 600ms)
let _thresholdTimer = null;
thresholdEl.addEventListener("input", () => {
  const val = parseFloat(thresholdEl.value);
  thresholdPctEl.textContent = `${Math.round(val * 100)}%`;
  clearTimeout(_thresholdTimer);
  _thresholdTimer = setTimeout(async () => {
    try {
      const current = await fetch(`${API_BASE}/api/settings`).then(r => r.json());
      await fetch(`${API_BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, confidence_threshold: val }),
      });
    } catch { /* offline, bỏ qua */ }
  }, 600);
});

// ── Toggle ────────────────────────────────────────────────────────────────
toggleEl.addEventListener("change", () => {
  chrome.storage.local.set({ tcd_enabled: toggleEl.checked });
});

// ── Reset ─────────────────────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  chrome.storage.local.set(
    { tcd_blocked_count: 0, tcd_offensive_count: 0, tcd_hate_count: 0 },
    () => {
      offensiveCountEl.textContent = "0";
      hateCountEl.textContent      = "0";
      chrome.action.setBadgeText({ text: "" });
    }
  );
});

// ── Live-update: lắng nghe storage thay đổi từ background (real-time) ───────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("tcd_offensive_count" in changes) {
    offensiveCountEl.textContent = changes.tcd_offensive_count.newValue ?? 0;
  }
  if ("tcd_hate_count" in changes) {
    hateCountEl.textContent = changes.tcd_hate_count.newValue ?? 0;
  }
  if ("tcd_enabled" in changes) {
    toggleEl.checked = changes.tcd_enabled.newValue;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  render();
  loadHost();
  checkApiStatus();
  loadThreshold();
});
