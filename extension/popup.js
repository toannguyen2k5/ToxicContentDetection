// [Owner: A] Logic cho popup (bật/tắt extension, xem thống kê nhanh)

const toggleEl = document.getElementById("tcd-toggle");
const countEl = document.getElementById("tcd-count");
const resetBtn = document.getElementById("tcd-reset");

function render() {
  chrome.storage.local.get({ tcd_enabled: true, tcd_blocked_count: 0 }, (data) => {
    toggleEl.checked = data.tcd_enabled;
    countEl.textContent = data.tcd_blocked_count;
  });
}

toggleEl.addEventListener("change", () => {
  const enabled = toggleEl.checked;
  chrome.storage.local.set({ tcd_enabled: enabled });
});

resetBtn.addEventListener("click", () => {
  chrome.storage.local.set({ tcd_blocked_count: 0 }, () => {
    countEl.textContent = "0";
    chrome.action.setBadgeText({ text: "" });
  });
});

document.addEventListener("DOMContentLoaded", render);
