"use strict";

(function () {
  const BUTTON_ID = "ai-dub-player-yt-trigger-btn";
  const SUBTITLE_BOX_ID = "ai-dub-player-yt-subtitle-overlay";
  const CONTROL_BAR_ID = "ai-dub-player-yt-control-bar";

  let webBaseUrl = "http://localhost:3000";
  let currentVideoId = null;
  let activeJob = null;
  let playbackManifest = null;
  let activeAudioEl = null;
  let lastPlayedSegmentId = null;
  let originalVideoVolume = null;
  let audioMode = "mixed"; // "mixed" | "dubbed" | "original"
  let subtitleMode = "vi"; // "vi" | "bilingual" | "off"

  function findPrimaryVideoElement() {
    return (
      document.querySelector("video.html5-main-video") ||
      document.querySelector(".bpx-player-video-wrap video") ||
      document.querySelector("video")
    );
  }

  function hashString11(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    const combined =
      (h1 >>> 0).toString(36).padStart(6, "0") +
      (h2 >>> 0).toString(36).padStart(6, "0");
    return combined.replace(/[^a-zA-Z0-9_-]/g, "x").slice(0, 11);
  }

  function extractYouTubeVideoId(urlStr) {
    try {
      const parsed = new URL(urlStr);
      if (parsed.hostname.includes("youtube.com")) {
        if (parsed.pathname === "/watch") {
          const v = (parsed.searchParams.get("v") || "").trim();
          return /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null;
        }
        if (parsed.pathname.startsWith("/shorts/")) {
          const s = (parsed.pathname.split("/").filter(Boolean)[1] || "").trim();
          return /^[a-zA-Z0-9_-]{11}$/.test(s) ? s : null;
        }
        return null;
      }
      if (findPrimaryVideoElement()) {
        return hashString11(parsed.hostname + parsed.pathname + parsed.search);
      }
      return null;
    } catch {
      return null;
    }
  }

  function sendExtMessage(payload) {
    return new Promise((resolve) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        !chrome.runtime.sendMessage
      ) {
        resolve({ ok: false });
        return;
      }
      chrome.runtime.sendMessage(payload, (response) => {
        if (response && response.apiBaseUrl) {
          webBaseUrl = response.apiBaseUrl;
        }
        resolve(response || { ok: false });
      });
    });
  }

  function ensureTriggerButton() {
    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.style.cssText =
        "margin-left:8px;padding:8px 14px;border-radius:18px;border:1px solid #2563EB;background:#2563EB;color:#F9FAFB;font-family:'Be Vietnam Pro',sans-serif;font-size:13px;font-weight:600;cursor:pointer;";
      btn.textContent = "Lồng tiếng Việt bằng AI";
      btn.addEventListener("click", onTriggerClick);

      const targetBar =
        document.querySelector("#top-level-buttons-computed") ||
        document.querySelector("#owner") ||
        document.body;
      targetBar.appendChild(btn);
    }
    return btn;
  }

  function ensureControlBar() {
    let bar = document.getElementById(CONTROL_BAR_ID);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = CONTROL_BAR_ID;
      bar.style.cssText =
        "position:absolute;top:14px;right:14px;z-index:65;display:none;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(11,15,23,0.9);border:1px solid #1F2937;color:#F9FAFB;font-family:'Be Vietnam Pro',sans-serif;font-size:12px;";

      const modeBtn = document.createElement("button");
      modeBtn.id = CONTROL_BAR_ID + "-mode-btn";
      modeBtn.type = "button";
      modeBtn.style.cssText =
        "border:0;border-radius:999px;padding:4px 10px;background:#2563EB;color:#F9FAFB;font-size:11px;font-weight:600;cursor:pointer;";
      modeBtn.textContent = "Âm thanh: Trộn 80/20";
      modeBtn.addEventListener("click", () => {
        if (audioMode === "mixed") {
          audioMode = "dubbed";
          modeBtn.textContent = "Âm thanh: 100% AI Việt";
        } else if (audioMode === "dubbed") {
          audioMode = "original";
          modeBtn.textContent = "Âm thanh: Tiếng gốc";
        } else {
          audioMode = "mixed";
          modeBtn.textContent = "Âm thanh: Trộn 80/20";
        }
      });

      const subBtn = document.createElement("button");
      subBtn.id = CONTROL_BAR_ID + "-sub-btn";
      subBtn.type = "button";
      subBtn.style.cssText =
        "border:0;border-radius:999px;padding:4px 10px;background:#1F2937;color:#F9FAFB;font-size:11px;font-weight:600;cursor:pointer;";
      subBtn.textContent = "Phụ đề: Tiếng Việt";
      subBtn.addEventListener("click", () => {
        if (subtitleMode === "vi") {
          subtitleMode = "bilingual";
          subBtn.textContent = "Phụ đề: Song ngữ";
        } else if (subtitleMode === "bilingual") {
          subtitleMode = "off";
          subBtn.textContent = "Phụ đề: Tắt";
        } else {
          subtitleMode = "vi";
          subBtn.textContent = "Phụ đề: Tiếng Việt";
        }
      });

      const studioBtn = document.createElement("button");
      studioBtn.id = CONTROL_BAR_ID + "-studio-btn";
      studioBtn.type = "button";
      studioBtn.style.cssText =
        "border:0;border-radius:999px;padding:4px 10px;background:#0F766E;color:#F9FAFB;font-size:11px;font-weight:600;cursor:pointer;";
      studioBtn.textContent = "Mở Studio";
      studioBtn.addEventListener("click", () => {
        if (activeJob && activeJob.id) {
          window.open(
            webBaseUrl + "/jobs/" + encodeURIComponent(activeJob.id),
            "_blank",
            "noopener,noreferrer"
          );
        }
      });

      bar.appendChild(modeBtn);
      bar.appendChild(subBtn);
      bar.appendChild(studioBtn);

      const playerContainer =
        document.querySelector("#movie_player") || document.body;
      playerContainer.appendChild(bar);
    }
    return bar;
  }

  function ensureSubtitleOverlay() {
    let box = document.getElementById(SUBTITLE_BOX_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = SUBTITLE_BOX_ID;
      box.style.cssText =
        "position:absolute;left:10%;right:10%;bottom:64px;z-index:60;text-align:center;pointer-events:none;display:none;";

      const inner = document.createElement("div");
      inner.style.cssText =
        "display:inline-block;padding:6px 14px;border-radius:8px;background:rgba(11,15,23,0.88);color:#F9FAFB;font-family:'Be Vietnam Pro',sans-serif;font-size:15px;font-weight:600;";
      inner.id = SUBTITLE_BOX_ID + "-text";
      box.appendChild(inner);

      const playerContainer =
        document.querySelector("#movie_player") || document.body;
      playerContainer.appendChild(box);
    }
    return box;
  }

  function updateSubtitleText(speakerName, viText, enText) {
    const box = ensureSubtitleOverlay();
    const inner = document.getElementById(SUBTITLE_BOX_ID + "-text");
    if (!inner) return;
    if (!viText || subtitleMode === "off") {
      box.style.display = "none";
      inner.textContent = "";
      return;
    }
    box.style.display = "block";
    const prefix = speakerName ? "[" + speakerName + "] " : "";
    if (subtitleMode === "bilingual" && enText) {
      inner.textContent = prefix + viText + "  •  " + enText;
    } else {
      inner.textContent = prefix + viText;
    }
  }

  async function onTriggerClick() {
    if (!currentVideoId) return;
    const btn = ensureTriggerButton();

    if (
      activeJob &&
      (activeJob.status === "ready" || activeJob.status === "partial_ready")
    ) {
      window.open(
        webBaseUrl + "/jobs/" + encodeURIComponent(activeJob.id),
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    btn.textContent = "Đang khởi tạo lồng tiếng...";
    const res = await sendExtMessage({
      type: "TRIGGER_DUB_JOB",
      videoId: currentVideoId,
      sourceUrl: "https://www.youtube.com/watch?v=" + currentVideoId,
    });

    if (res.ok && res.job) {
      activeJob = res.job;
      if (
        res.job.status === "ready" ||
        res.job.status === "partial_ready"
      ) {
        btn.textContent = "Phát bằng tiếng Việt (AI)";
        const mf = await sendExtMessage({
          type: "GET_PLAYBACK_MANIFEST",
          jobId: res.job.id,
        });
        if (mf.ok && mf.manifest) {
          playbackManifest = mf.manifest;
          ensureControlBar().style.display = "flex";
        }
      } else {
        btn.textContent = "Đang xử lý (" + (res.job.progress || 0) + "%)";
      }
    } else {
      btn.textContent = "Thử lại lồng tiếng Việt";
    }
  }

  async function pollActiveJobProgress() {
    if (!currentVideoId || !activeJob) return;
    if (
      activeJob.status === "ready" ||
      activeJob.status === "partial_ready" ||
      activeJob.status === "failed" ||
      activeJob.status === "cancelled"
    ) {
      return;
    }

    const res = await sendExtMessage({
      type: "CHECK_VIDEO_JOB",
      videoId: currentVideoId,
    });
    if (!res.ok || !res.job) return;

    activeJob = res.job;
    const btn = ensureTriggerButton();

    if (res.job.status === "ready" || res.job.status === "partial_ready") {
      btn.textContent = "Phát bằng tiếng Việt (AI)";
      const mf = await sendExtMessage({
        type: "GET_PLAYBACK_MANIFEST",
        jobId: res.job.id,
      });
      if (mf.ok && mf.manifest) {
        playbackManifest = mf.manifest;
        ensureControlBar().style.display = "flex";
      }
    } else if (res.job.status === "failed") {
      btn.textContent = "Thử lại lồng tiếng Việt";
    } else {
      btn.textContent = "Đang lồng tiếng (" + (res.job.progress || 0) + "%)";
    }
  }

  function syncWithYouTubeVideoElement() {
    if (!playbackManifest || !Array.isArray(playbackManifest.audioSegments))
      return;
    const videoEl = findPrimaryVideoElement();
    if (!videoEl) return;

    if (originalVideoVolume === null) {
      originalVideoVolume = videoEl.volume;
    }

    if (videoEl.paused || videoEl.seeking) {
      if (activeAudioEl) {
        activeAudioEl.pause();
      }
      return;
    }

    const timeMs = Math.round(videoEl.currentTime * 1000);
    const seg = playbackManifest.audioSegments.find(
      (s) => timeMs >= s.startMs && timeMs <= s.endMs
    );

    if (!seg) {
      updateSubtitleText(null, null, null);
      return;
    }

    updateSubtitleText(
      seg.speakerDisplayName,
      seg.translatedText,
      seg.sourceText
    );

    if (audioMode === "original") {
      videoEl.volume = originalVideoVolume !== null ? originalVideoVolume : 1.0;
      if (activeAudioEl) {
        activeAudioEl.pause();
      }
      return;
    }

    if (seg.status === "failed" || !seg.audioUrl) {
      videoEl.volume = Math.max(0.8, originalVideoVolume || 0.8);
      return;
    }

    videoEl.volume = audioMode === "dubbed" ? 0.05 : 0.2;
    if (lastPlayedSegmentId !== seg.id) {
      lastPlayedSegmentId = seg.id;
      if (activeAudioEl) {
        activeAudioEl.pause();
      }
      const audioSrc =
        seg.audioUrl && seg.audioUrl.startsWith("data:audio/mpeg")
          ? seg.audioUrl
          : webBaseUrl +
            "/api/tts/speak?text=" +
            encodeURIComponent(seg.translatedText || "") +
            "&voiceId=" +
            encodeURIComponent(seg.voiceId || "");
      activeAudioEl = new Audio(audioSrc);
      activeAudioEl.playbackRate =
        (seg.playbackRate || 1.0) * (videoEl.playbackRate || 1.0);
      activeAudioEl.play().catch(() => {});
    }
  }

  async function handleUrlChange() {
    const nextId = extractYouTubeVideoId(window.location.href);
    if (nextId === currentVideoId) return;

    // Reset state on SPA video change
    currentVideoId = nextId;
    activeJob = null;
    playbackManifest = null;
    lastPlayedSegmentId = null;
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl = null;
    }
    const videoEl = document.querySelector("video.html5-main-video");
    if (videoEl && originalVideoVolume !== null) {
      videoEl.volume = originalVideoVolume;
    }
    updateSubtitleText(null, null, null);
    const bar = document.getElementById(CONTROL_BAR_ID);
    if (bar) {
      bar.style.display = "none";
    }

    if (!currentVideoId) return;
    const btn = ensureTriggerButton();
    btn.textContent = "Lồng tiếng Việt bằng AI";

    const existing = await sendExtMessage({
      type: "CHECK_VIDEO_JOB",
      videoId: currentVideoId,
    });
    if (existing.ok && existing.job) {
      activeJob = existing.job;
      if (
        existing.job.status === "ready" ||
        existing.job.status === "partial_ready"
      ) {
        btn.textContent = "Phát bằng tiếng Việt (AI)";
        const mf = await sendExtMessage({
          type: "GET_PLAYBACK_MANIFEST",
          jobId: existing.job.id,
        });
        if (mf.ok && mf.manifest) {
          playbackManifest = mf.manifest;
          ensureControlBar().style.display = "flex";
        }
      } else {
        btn.textContent =
          "Đang lồng tiếng (" + (existing.job.progress || 0) + "%)";
      }
    }
  }

  window.addEventListener("yt-navigate-finish", handleUrlChange);
  setInterval(handleUrlChange, 2000);
  setInterval(pollActiveJobProgress, 1500);
  setInterval(syncWithYouTubeVideoElement, 200);
  handleUrlChange();
})();
