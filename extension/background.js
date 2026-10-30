"use strict";

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const ALLOWED_TAB_ORIGIN = "https://www.youtube.com";
const STORAGE_KEY_API_BASE_URL = "aidub_api_base_url";

function isTrustedSender(sender) {
  if (!sender) return false;
  if (
    sender.id &&
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    sender.id === chrome.runtime.id
  ) {
    if (!sender.tab) {
      // Sent from extension popup
      return true;
    }
    const tabUrl = sender.tab.url || "";
    return tabUrl.startsWith(ALLOWED_TAB_ORIGIN + "/watch");
  }
  return false;
}

function normalizeServerBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE_URL;
  try {
    const parsed = new URL(trimmed);
    const isLocal =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocal)) {
      return parsed.origin;
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_API_BASE_URL;
}

function getConfiguredApiBaseUrl() {
  return new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      resolve(DEFAULT_API_BASE_URL);
      return;
    }
    chrome.storage.local.get([STORAGE_KEY_API_BASE_URL], (items) => {
      const saved = items && items[STORAGE_KEY_API_BASE_URL];
      resolve(normalizeServerBaseUrl(saved || DEFAULT_API_BASE_URL));
    });
  });
}

function setConfiguredApiBaseUrl(nextUrl) {
  const normalized = normalizeServerBaseUrl(nextUrl);
  return new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      resolve(normalized);
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY_API_BASE_URL]: normalized }, () => {
      resolve(normalized);
    });
  });
}

async function callBackendApi(path, options) {
  const baseUrl = await getConfiguredApiBaseUrl();
  const res = await fetch(baseUrl + path, {
    method: (options && options.method) || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options && options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || "Lỗi kết nối máy chủ AI Dub Player.");
    err.status = res.status;
    err.errorCode = data.errorCode;
    throw err;
  }
  return data;
}

if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.onMessage
) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isTrustedSender(sender)) {
      sendResponse({ ok: false, error: "Untrusted message sender blocked." });
      return false;
    }

    (async () => {
      try {
        if (message.type === "GET_SERVER_CONFIG") {
          const apiBaseUrl = await getConfiguredApiBaseUrl();
          sendResponse({ ok: true, apiBaseUrl });
          return;
        }

        if (message.type === "SET_SERVER_CONFIG") {
          const apiBaseUrl = await setConfiguredApiBaseUrl(message.apiBaseUrl);
          sendResponse({ ok: true, apiBaseUrl });
          return;
        }

        if (message.type === "PING_SERVER") {
          const apiBaseUrl = await getConfiguredApiBaseUrl();
          const health = await callBackendApi("/api/health");
          sendResponse({ ok: true, apiBaseUrl, health });
          return;
        }

        if (
          message.type === "CHECK_VIDEO_JOB" &&
          typeof message.videoId === "string"
        ) {
          const apiBaseUrl = await getConfiguredApiBaseUrl();
          const data = await callBackendApi(
            "/api/dub-jobs/by-video?videoId=" +
              encodeURIComponent(message.videoId)
          );
          sendResponse({ ok: true, job: data.job || null, apiBaseUrl });
          return;
        }

        if (
          message.type === "TRIGGER_DUB_JOB" &&
          typeof message.videoId === "string" &&
          typeof message.sourceUrl === "string"
        ) {
          const apiBaseUrl = await getConfiguredApiBaseUrl();
          const job = await callBackendApi("/api/dub-jobs", {
            method: "POST",
            body: {
              sourceType: "youtube",
              sourceUrl: message.sourceUrl,
              targetLanguage: "vi",
              clientType: "extension",
            },
          });
          sendResponse({ ok: true, job, apiBaseUrl });
          return;
        }

        if (
          message.type === "GET_JOB_PROGRESS" &&
          typeof message.jobId === "string"
        ) {
          const progress = await callBackendApi(
            "/api/dub-jobs/" + encodeURIComponent(message.jobId) + "/progress"
          );
          sendResponse({ ok: true, job: progress });
          return;
        }

        if (
          message.type === "GET_PLAYBACK_MANIFEST" &&
          typeof message.jobId === "string"
        ) {
          const manifest = await callBackendApi(
            "/api/dub-jobs/" + encodeURIComponent(message.jobId) + "/playback"
          );
          sendResponse({ ok: true, manifest });
          return;
        }

        sendResponse({ ok: false, error: "Unsupported message type." });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : "Lỗi xử lý Extension.",
        });
      }
    })();

    return true;
  });
}
