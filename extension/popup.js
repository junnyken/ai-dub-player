"use strict";

(function () {
  const statusEl = document.getElementById("popup-status");
  const triggerBtn = document.getElementById("popup-trigger-btn");
  const serverInputEl = document.getElementById("popup-server-url-input");
  const saveServerBtn = document.getElementById("popup-save-server-btn");
  const serverStatusEl = document.getElementById("popup-server-status");

  function setStatusSafe(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function setServerStatusSafe(text) {
    if (serverStatusEl) {
      serverStatusEl.textContent = text;
    }
  }

  function pingServerAndRefreshStatus() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }
    chrome.runtime.sendMessage({ type: "PING_SERVER" }, (res) => {
      if (res && res.ok && res.health) {
        setServerStatusSafe(
          "Đã kết nối: " +
            res.apiBaseUrl +
            " (" +
            (res.health.activeVoicesCount || 8) +
            " giọng AI sẵn sàng)"
        );
      } else {
        setServerStatusSafe(
          "Chưa kết nối được máy chủ. Hãy kiểm tra lại địa chỉ Website."
        );
      }
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "GET_SERVER_CONFIG" }, (res) => {
      if (res && res.ok && serverInputEl) {
        serverInputEl.value = res.apiBaseUrl || "http://localhost:3000";
      }
      pingServerAndRefreshStatus();
    });

    if (saveServerBtn && serverInputEl) {
      saveServerBtn.addEventListener("click", () => {
        const candidateUrl = serverInputEl.value.trim();
        setServerStatusSafe("Đang lưu và kiểm tra kết nối...");
        chrome.runtime.sendMessage(
          { type: "SET_SERVER_CONFIG", apiBaseUrl: candidateUrl },
          (res) => {
            if (res && res.ok && serverInputEl) {
              serverInputEl.value = res.apiBaseUrl;
            }
            pingServerAndRefreshStatus();
          }
        );
      });
    }
  }

  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const url = (tab && tab.url) || "";
      if (!url.startsWith("https://www.youtube.com/watch")) {
        setStatusSafe(
          "Hãy mở một video YouTube (youtube.com/watch?v=...) để bắt đầu lồng tiếng Việt."
        );
        if (triggerBtn) triggerBtn.disabled = true;
        return;
      }

      const parsed = new URL(url);
      const videoId = parsed.searchParams.get("v") || "";
      setStatusSafe(
        "Đã nhận diện video YouTube (" +
          videoId +
          "). Sẵn sàng lồng tiếng AI."
      );

      if (triggerBtn) {
        triggerBtn.addEventListener("click", () => {
          chrome.runtime.sendMessage(
            {
              type: "TRIGGER_DUB_JOB",
              videoId,
              sourceUrl: "https://www.youtube.com/watch?v=" + videoId,
            },
            (res) => {
              if (res && res.ok && res.job) {
                setStatusSafe("Đã khởi tạo tiến trình: " + res.job.id);
              } else {
                setStatusSafe(
                  (res && res.error) || "Không thể khởi tạo tiến trình."
                );
              }
            }
          );
        });
      }
    });
  }
})();
