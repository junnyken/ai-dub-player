"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Captions,
  Download,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  audioSegmentScheduler,
  resolvePlayerShortcutAction,
  SchedulableSegment,
} from "@/server/services/audio-mixer";
import { formatTimestampMs } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  LoadingSkeletonState,
} from "@/components/states/DataStates";
import { CharacterLipSyncStage } from "@/components/dub/CharacterLipSyncStage";

interface PlaybackManifestDto {
  jobId: string;
  title?: string | null;
  sourceType: "youtube" | "upload";
  sourceVideoId?: string | null;
  durationSeconds?: number | null;
  status: string;
  readyFromMs: number;
  readyToMs: number;
  videoUrl: string;
  audioSegments: Array<
    SchedulableSegment & {
      voiceDisplayName?: string;
    }
  >;
  subtitles: {
    sourceVtt: string;
    targetVtt: string;
    bilingualVtt: string;
  };
}

function resolveVoicePitchMultiplier(voiceId?: string): number {
  const id = (voiceId || "").toLowerCase();
  if (id.includes("bo_child")) return 1.18;
  if (id.includes("vy_teen")) return 1.09;
  if (id.includes("linh_young")) return 1.03;
  if (id.includes("ha_adult")) return 0.99;
  if (id.includes("quoc_neutral")) return 0.94;
  if (id.includes("khoi_young")) return 0.91;
  if (id.includes("minh_adult")) return 0.87;
  if (id.includes("an_senior")) return 0.83;
  return 1.0;
}

function resolveSegmentSpeechSrc(seg: SchedulableSegment): string {
  if (seg.audioUrl && seg.audioUrl.startsWith("data:audio/mpeg")) {
    return seg.audioUrl;
  }
  return `/api/tts/speak?text=${encodeURIComponent(
    seg.translatedText
  )}&voiceId=${encodeURIComponent(seg.voiceId || "")}`;
}

export function SubtitleLayer({
  sourceLine,
  targetLine,
  speakerDisplayName,
}: {
  sourceLine: string | null;
  targetLine: string | null;
  speakerDisplayName?: string;
}) {
  if (!sourceLine && !targetLine) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col items-center text-center"
    >
      <div className="max-w-xl rounded-md bg-bg/90 px-space-4 py-space-2 shadow-sm">
        {speakerDisplayName && (
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-primary">
            {speakerDisplayName}
          </span>
        )}
        {targetLine && (
          <p className="text-sm font-semibold text-text-primary sm:text-base">
            {targetLine}
          </p>
        )}
        {sourceLine && (
          <p className="mt-0.5 text-xs text-text-secondary">{sourceLine}</p>
        )}
      </div>
    </div>
  );
}

export function PlayerControlBar({
  isPlaying,
  currentTimeMs,
  totalDurationMs,
  playbackSpeed,
  originalVolume,
  dubVolume,
  dubEnabled,
  originalAudioEnabled,
  subtitleMode,
  onTogglePlay,
  onSeek,
  onSpeedChange,
  onOriginalVolumeChange,
  onDubVolumeChange,
  onToggleDub,
  onToggleOriginalAudio,
  onSubtitleModeChange,
  onOpenVoiceDrawer,
}: {
  isPlaying: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  playbackSpeed: number;
  originalVolume: number;
  dubVolume: number;
  dubEnabled: boolean;
  originalAudioEnabled: boolean;
  subtitleMode: "off" | "source" | "target" | "bilingual";
  onTogglePlay: () => void;
  onSeek: (nextMs: number) => void;
  onSpeedChange: (speed: number) => void;
  onOriginalVolumeChange: (val: number) => void;
  onDubVolumeChange: (val: number) => void;
  onToggleDub: () => void;
  onToggleOriginalAudio: () => void;
  onSubtitleModeChange: (mode: "off" | "source" | "target" | "bilingual") => void;
  onOpenVoiceDrawer?: () => void;
}) {
  return (
    <div className="space-y-space-3 rounded-md border border-surface-2 bg-surface-2 p-space-4">
      {/* Row 1: Play/Pause + Seek Bar + Clock */}
      <div className="flex items-center gap-space-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Tạm dừng phát video" : "Xem bằng tiếng Việt"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary text-text-primary hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <div className="flex-1">
          <label htmlFor="dub-player-seekbar" className="sr-only">
            Thanh tua thời gian video
          </label>
          <input
            id="dub-player-seekbar"
            type="range"
            min={0}
            max={Math.max(1000, totalDurationMs)}
            value={Math.min(totalDurationMs, currentTimeMs)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full cursor-pointer accent-primary"
          />
        </div>

        <span className="shrink-0 text-xs font-medium text-text-secondary tabular-nums">
          {formatTimestampMs(currentTimeMs)} /{" "}
          {formatTimestampMs(totalDurationMs)}
        </span>
      </div>

      {/* Row 2: Speed + Dual Volume Sliders */}
      <div className="flex flex-wrap items-center justify-between gap-space-4 border-t border-surface pt-space-3 text-xs">
        <div className="flex items-center gap-space-2">
          <label
            htmlFor="player-speed-select"
            className="font-medium text-text-secondary"
          >
            Tốc độ:
          </label>
          <select
            id="player-speed-select"
            value={playbackSpeed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="rounded-sm border border-surface-2 bg-surface px-space-2 py-1 font-semibold text-text-primary tabular-nums"
          >
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-space-4 tabular-nums">
          <div className="flex items-center gap-space-2">
            <label
              htmlFor="orig-vol-slider"
              className="text-text-secondary"
            >
              Tiếng gốc: {Math.round(originalVolume * 100)}%
            </label>
            <input
              id="orig-vol-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={originalVolume}
              onChange={(e) => onOriginalVolumeChange(Number(e.target.value))}
              className="w-20 accent-primary"
            />
          </div>

          <div className="flex items-center gap-space-2">
            <label
              htmlFor="dub-vol-slider"
              className="font-semibold text-text-primary"
            >
              Lồng tiếng: {Math.round(dubVolume * 100)}%
            </label>
            <input
              id="dub-vol-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={dubVolume}
              onChange={(e) => onDubVolumeChange(Number(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>
        </div>
      </div>

      {/* Row 3: Quick Toggles (Audio + Dual Subtitles + Character Drawer) */}
      <div className="flex flex-wrap items-center justify-between gap-space-2 border-t border-surface pt-space-3">
        <div className="flex flex-wrap items-center gap-space-2">
          <button
            type="button"
            onClick={onToggleDub}
            aria-pressed={dubEnabled}
            className={`inline-flex items-center gap-space-1 rounded-sm px-space-3 py-space-1 text-xs font-semibold ${
              dubEnabled
                ? "bg-primary text-text-primary"
                : "border border-surface bg-surface text-text-secondary"
            }`}
          >
            {dubEnabled ? (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Giọng lồng tiếng
          </button>

          <button
            type="button"
            onClick={onToggleOriginalAudio}
            aria-pressed={originalAudioEnabled}
            className={`inline-flex items-center gap-space-1 rounded-sm px-space-3 py-space-1 text-xs font-medium ${
              originalAudioEnabled
                ? "border border-primary/50 bg-surface text-text-primary"
                : "border border-surface bg-surface text-text-muted"
            }`}
          >
            Tiếng gốc
          </button>

          <button
            type="button"
            onClick={() =>
              onSubtitleModeChange(
                subtitleMode === "source" ? "off" : "source"
              )
            }
            aria-pressed={subtitleMode === "source"}
            className={`inline-flex items-center gap-space-1 rounded-sm px-space-3 py-space-1 text-xs font-medium ${
              subtitleMode === "source"
                ? "bg-primary text-text-primary"
                : "border border-surface bg-surface text-text-secondary"
            }`}
          >
            <Captions className="h-3.5 w-3.5" aria-hidden="true" />
            Phụ đề gốc
          </button>

          <button
            type="button"
            onClick={() =>
              onSubtitleModeChange(
                subtitleMode === "target" ? "off" : "target"
              )
            }
            aria-pressed={subtitleMode === "target"}
            className={`inline-flex items-center gap-space-1 rounded-sm px-space-3 py-space-1 text-xs font-medium ${
              subtitleMode === "target"
                ? "bg-primary text-text-primary"
                : "border border-surface bg-surface text-text-secondary"
            }`}
          >
            Phụ đề Việt
          </button>

          <button
            type="button"
            onClick={() =>
              onSubtitleModeChange(
                subtitleMode === "bilingual" ? "off" : "bilingual"
              )
            }
            aria-pressed={subtitleMode === "bilingual"}
            className={`inline-flex items-center gap-space-1 rounded-sm px-space-3 py-space-1 text-xs font-semibold ${
              subtitleMode === "bilingual"
                ? "bg-primary text-text-primary"
                : "border border-surface bg-surface text-text-secondary"
            }`}
          >
            Song ngữ
          </button>
        </div>

        {onOpenVoiceDrawer && (
          <button
            type="button"
            onClick={onOpenVoiceDrawer}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <Mic2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Nhân vật & giọng
          </button>
        )}
      </div>
    </div>
  );
}

export function DubPlayer({
  jobId,
  onOpenVoiceDrawer,
}: {
  jobId: string;
  onOpenVoiceDrawer?: () => void;
}) {
  const [manifest, setManifest] = useState<PlaybackManifestDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [originalVolume, setOriginalVolume] = useState(0.3);
  const [dubVolume, setDubVolume] = useState(1.0);
  const [dubEnabled, setDubEnabled] = useState(true);
  const [originalAudioEnabled, setOriginalAudioEnabled] = useState(true);
  const [subtitleMode, setSubtitleMode] = useState<
    "off" | "source" | "target" | "bilingual"
  >("bilingual");
  const [voiceEngineMode, setVoiceEngineMode] = useState<
    "cloud_neural_autofit" | "browser_natural_vi"
  >("cloud_neural_autofit");
  const [asrModelMode, setAsrModelMode] = useState<
    "whisper_v3_turbo_deep" | "gemini_2_audio_omni"
  >("whisper_v3_turbo_deep");
  const [isRescanningAsr, setIsRescanningAsr] = useState(false);
  const [autoSkipSilence, setAutoSkipSilence] = useState(true);
  const [showApiHub, setShowApiHub] = useState(false);
  const [deepSeekKeyInput, setDeepSeekKeyInput] = useState("");
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [openAiKeyInput, setOpenAiKeyInput] = useState("");
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState("");
  const [fptAiKeyInput, setFptAiKeyInput] = useState("");
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [rescanStatusMsg, setRescanStatusMsg] = useState<string | null>(null);
  const [apiDiagnostics, setApiDiagnostics] = useState<{
    translationOk: boolean;
    translationLatencyMs: number;
    translationSampleVi: string;
    activeTranslationEngine: string;
    ttsOk: boolean;
    ttsLatencyMs: number;
    ttsBytes: number;
    activeTtsEngine: string;
    ttsAudioDataUri?: string;
  } | null>(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedSegIdRef = useRef<string | null>(null);

  const fetchPlaybackManifest = useCallback(async () => {
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/playback`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Không thể tải dữ liệu phát Dub Player.");
        setIsLoading(false);
        return;
      }
      setManifest(data);
      setErrorMsg(null);
    } catch {
      setErrorMsg("Mất kết nối khi tải manifest trình phát.");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Initial load once per jobId
  useEffect(() => {
    fetchPlaybackManifest();
  }, [fetchPlaybackManifest]);

  const isManifestReady =
    Boolean(manifest) &&
    (manifest?.audioSegments.length ?? 0) > 0 &&
    (manifest?.status === "ready" || manifest?.status === "partial_ready");

  // Poll only while job is still synthesizing
  useEffect(() => {
    if (isManifestReady) return;
    const interval = setInterval(() => {
      fetchPlaybackManifest();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchPlaybackManifest, isManifestReady]);

  const handleRenderNow = async () => {
    setIsRendering(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Không thể tổng hợp giọng nói.");
        return;
      }
      setManifest(data);
    } catch {
      setErrorMsg("Lỗi kết nối khi gọi dịch vụ tổng hợp TTS.");
    } finally {
      setIsRendering(false);
    }
  };

  const handleRescanFullAudio = async () => {
    setIsRescanningAsr(true);
    setErrorMsg(null);
    setRescanStatusMsg(
      `⏳ Đang dịch lại toàn bộ câu thoại bằng ${
        apiDiagnostics?.activeTranslationEngine || "AI Cloud Engine"
      } & tổng hợp giọng đọc Neural 24kHz...`
    );
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/rescan-asr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: asrModelMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Không thể quét lại toàn bộ âm thanh.");
        setRescanStatusMsg(null);
        return;
      }
      setManifest(data);
      setCurrentTimeMs(0);
      setRescanStatusMsg(
        `✅ ĐÃ HOÀN TẤT! Toàn bộ ${
          data.audioSegments?.length || 32
        } câu thoại vừa được dịch mới bằng ${
          apiDiagnostics?.activeTranslationEngine || "AI Cloud Engine"
        } & tạo giọng đọc Neural 24kHz — Bấm Phát (▶) để nghe ngay!`
      );
    } catch {
      setErrorMsg("Lỗi kết nối khi quét lại toàn bộ âm thanh.");
      setRescanStatusMsg(null);
    } finally {
      setIsRescanningAsr(false);
    }
  };

  const handleSaveAndTestApi = async () => {
    setIsTestingApi(true);
    try {
      const res = await fetch("/api/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deepSeekApiKey: deepSeekKeyInput,
          groqApiKey: groqKeyInput,
          geminiApiKey: geminiKeyInput,
          openAiApiKey: openAiKeyInput,
          elevenLabsApiKey: elevenLabsKeyInput,
          fptAiApiKey: fptAiKeyInput,
          runDiagnostics: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.diagnostics) {
        setApiDiagnostics(data.diagnostics);
      }
    } catch {
      // Ignore transient error
    } finally {
      setIsTestingApi(false);
    }
  };

  const lastSegmentEndMs =
    manifest && manifest.audioSegments.length > 0
      ? manifest.audioSegments[manifest.audioSegments.length - 1].endMs
      : 30000;

  const totalDurationMs =
    manifest && manifest.audioSegments.length > 0
      ? Math.max(lastSegmentEndMs, Math.min((manifest.durationSeconds ?? 0) * 1000, lastSegmentEndMs + 2000))
      : (manifest?.durationSeconds ?? 30) * 1000;

  // Advance playhead timer when playing (and auto-skip long music/silence gaps if enabled)
  useEffect(() => {
    if (!isPlaying) return;
    const tickMs = 100;
    const segments = manifest?.audioSegments ?? [];
    const timer = setInterval(() => {
      setCurrentTimeMs((prev) => {
        const next = prev + tickMs * playbackSpeed;
        if (next >= totalDurationMs) {
          setIsPlaying(false);
          return 0;
        }
        if (autoSkipSilence && segments.length > 0) {
          const inActiveSeg = segments.some(
            (s) => next >= s.startMs - 150 && next <= s.endMs + 250
          );
          if (!inActiveSeg) {
            const upcoming = segments.find((s) => s.startMs > next);
            if (upcoming && upcoming.startMs - next > 1400) {
              return upcoming.startMs + 20;
            }
            if (!upcoming && next > lastSegmentEndMs + 400) {
              setIsPlaying(false);
              return 0;
            }
          }
        }
        return next;
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [
    isPlaying,
    playbackSpeed,
    totalDurationMs,
    autoSkipSilence,
    manifest?.audioSegments,
    lastSegmentEndMs,
  ]);

  const syncState = audioSegmentScheduler.resolvePlaybackStateAtTime({
    currentTimeMs,
    playbackSpeed,
    originalVolume,
    dubVolume,
    dubEnabled,
    originalAudioEnabled,
    subtitleMode,
    segments: manifest?.audioSegments ?? [],
  });

  const playSegmentSpeech = useCallback(
    (
      seg: SchedulableSegment,
      volume: number,
      basePlaybackRate: number
    ) => {
      if (seg.status !== "ready") return;
      lastPlayedSegIdRef.current = seg.id;

      const slotMs = Math.max(800, (seg.endMs - seg.startMs) * 0.92);
      const wordsCount = seg.translatedText.trim().split(/\s+/).filter(Boolean).length;

      // Option B: Native Windows / Edge Natural Vietnamese Voice (HoaiMy / NamMinh / An)
      if (
        voiceEngineMode === "browser_natural_vi" &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        try {
          if (audioElementRef.current) {
            audioElementRef.current.pause();
          }
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(seg.translatedText);
          utter.lang = "vi-VN";
          const voices = window.speechSynthesis.getVoices();
          const viVoices = voices.filter((v) =>
            v.lang.toLowerCase().includes("vi")
          );
          const isFemaleOrChild =
            (seg.voiceId || "").includes("bo") ||
            (seg.voiceId || "").includes("vy") ||
            (seg.voiceId || "").includes("linh") ||
            (seg.voiceId || "").includes("ha") ||
            (seg.speakerDisplayName || "").includes("1");

          if (viVoices.length > 0) {
            const preferred =
              viVoices.find((v) =>
                isFemaleOrChild
                  ? v.name.toLowerCase().includes("hoaimy") ||
                    v.name.toLowerCase().includes("female")
                  : v.name.toLowerCase().includes("namminh") ||
                    v.name.toLowerCase().includes("an")
              ) || viVoices[0];
            utter.voice = preferred;
          }

          const estNaturalMs = wordsCount * 255;
          const autoFitRate = Math.max(
            0.95,
            Math.min(1.4, Number(((estNaturalMs / slotMs) * playbackSpeed).toFixed(2)))
          );
          utter.rate = autoFitRate;
          utter.pitch = isFemaleOrChild ? 1.12 : 0.94;
          utter.volume = Math.max(0.1, Math.min(1, volume));
          window.speechSynthesis.speak(utter);
          return;
        } catch {
          // Fall through to HTMLAudioElement
        }
      }

      try {
        let audio = audioElementRef.current;
        if (!audio) {
          audio = new Audio();
          audioElementRef.current = audio;
        }
        audio.pause();
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }

        audio.src = resolveSegmentSpeechSrc(seg);
        audio.volume = Math.max(0.05, Math.min(1, volume));

        // Keep preservesPitch = true so voice timbre stays 100% natural (no chipmunk/robotic warping)
        const audioWithPitch = audio as HTMLAudioElement & {
          preservesPitch?: boolean;
          mozPreservesPitch?: boolean;
          webkitPreservesPitch?: boolean;
        };
        audioWithPitch.preservesPitch = true;
        audioWithPitch.mozPreservesPitch = true;
        audioWithPitch.webkitPreservesPitch = true;

        // Start at pure 1.0x natural studio speed (no WSOLA time-stretch distortion)
        const initialFitRate = Number(playbackSpeed.toFixed(2));
        audio.playbackRate = initialFitRate;

        // Only apply a gentle micro-adjustment (max 1.12x) if audio is slightly longer than slot
        audio.onloadedmetadata = () => {
          if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
            return;
          }
          const actualRawMs = audio.duration * 1000;
          const rawRatio = actualRawMs / slotMs;
          const gentleRatio =
            rawRatio > 1.04 ? Math.min(1.12, 1 + (rawRatio - 1) * 0.5) : 1.0;
          audio.playbackRate = Number((gentleRatio * playbackSpeed).toFixed(2));
        };

        audio.play().catch(() => {
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(seg.translatedText);
            utter.lang = "vi-VN";
            utter.rate = initialFitRate;
            utter.volume = Math.max(0.1, Math.min(1, volume));
            window.speechSynthesis.speak(utter);
          }
        });
      } catch {
        // Ignore audio element errors in headless tests
      }
    },
    [voiceEngineMode, playbackSpeed]
  );

  // Trigger segment audio playback when activeSegment changes while playing
  useEffect(() => {
    if (!isPlaying || !dubEnabled) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      lastPlayedSegIdRef.current = null;
      return;
    }

    const activeSeg = syncState.activeSegment;
    if (
      activeSeg &&
      activeSeg.status === "ready" &&
      lastPlayedSegIdRef.current !== activeSeg.id
    ) {
      playSegmentSpeech(
        activeSeg,
        syncState.effectiveDubVolume,
        syncState.effectiveDubPlaybackRate
      );
    }
  }, [
    isPlaying,
    dubEnabled,
    syncState.activeSegment,
    syncState.effectiveDubVolume,
    syncState.effectiveDubPlaybackRate,
    playSegmentSpeech,
  ]);

  const handleTogglePlay = useCallback(() => {
    const segments = manifest?.audioSegments ?? [];
    if (isPlaying) {
      setIsPlaying(false);
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      return;
    }

    let nextTimeMs = currentTimeMs;
    let targetSeg =
      segments.find(
        (s) => nextTimeMs >= s.startMs && nextTimeMs <= s.endMs
      ) ?? null;

    if (!targetSeg && segments.length > 0) {
      const upcoming =
        segments.find((s) => s.startMs >= nextTimeMs) ?? segments[0];
      nextTimeMs = upcoming.startMs + 20;
      targetSeg = upcoming;
      setCurrentTimeMs(nextTimeMs);
    }

    setIsPlaying(true);
    if (targetSeg && dubEnabled) {
      playSegmentSpeech(
        targetSeg,
        dubVolume,
        (targetSeg.playbackRate || 1.0) * playbackSpeed
      );
    }
  }, [
    manifest,
    isPlaying,
    currentTimeMs,
    dubEnabled,
    dubVolume,
    playbackSpeed,
    playSegmentSpeech,
  ]);

  const handleSeek = useCallback(
    (nextMs: number, autoPlaySegment?: SchedulableSegment) => {
      lastPlayedSegIdRef.current = null;
      const clamped = Math.max(0, Math.min(totalDurationMs, nextMs));
      setCurrentTimeMs(clamped);
      if (autoPlaySegment) {
        setIsPlaying(true);
        if (dubEnabled) {
          playSegmentSpeech(
            autoPlaySegment,
            dubVolume,
            (autoPlaySegment.playbackRate || 1.0) * playbackSpeed
          );
        }
      }
    },
    [totalDurationMs, dubEnabled, dubVolume, playbackSpeed, playSegmentSpeech]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const action = resolvePlayerShortcutAction({
        key: e.key,
        targetTagName: target?.tagName,
        isContentEditable: target?.isContentEditable,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });

      if (!action) return;
      e.preventDefault();

      if (action === "toggle_play") {
        handleTogglePlay();
      } else if (action === "toggle_original_audio") {
        setOriginalAudioEnabled((prev) => !prev);
      } else if (action === "toggle_dub_audio") {
        setDubEnabled((prev) => !prev);
      } else if (action === "cycle_subtitle_mode") {
        setSubtitleMode((prev) => {
          const order: Array<"off" | "source" | "target" | "bilingual"> = [
            "bilingual",
            "target",
            "source",
            "off",
          ];
          const idx = order.indexOf(prev);
          return order[(idx + 1) % order.length];
        });
      } else if (action === "seek_backward_5s") {
        handleSeek(currentTimeMs - 5000);
      } else if (action === "seek_forward_5s") {
        handleSeek(currentTimeMs + 5000);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTimeMs, handleSeek, handleTogglePlay]);

  if (isLoading) {
    return (
      <LoadingSkeletonState label="Đang chuẩn bị Dub Player và phụ đề song ngữ..." />
    );
  }

  if (errorMsg) {
    return (
      <ErrorState
        whatHappened="Không thể khởi chạy Dub Player"
        whyItHappened={errorMsg}
        nextStep="Hãy kiểm tra tiến trình dịch/casting và bấm Thử kiểm tra lại."
        onRetry={fetchPlaybackManifest}
      />
    );
  }

  if (!manifest || manifest.audioSegments.length === 0) {
    return (
      <EmptyState
        title="Dub Player đang chờ tổng hợp âm thanh (TTS)"
        reason="Các đoạn lồng tiếng sẽ được tổng hợp theo từng nhân vật ngay sau khi hoàn tất AI Casting."
        nextAction="Bấm nút bên dưới để tổng hợp âm thanh và mở Dub Player ngay."
        actionButton={
          <button
            type="button"
            disabled={isRendering}
            onClick={handleRenderNow}
            className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-4 py-space-2 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {isRendering
              ? "Đang tổng hợp giọng nói..."
              : "Xem bằng tiếng Việt (Render TTS)"}
          </button>
        }
      />
    );
  }

  return (
    <section
      aria-labelledby="dub-player-heading"
      className="rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <div className="flex items-center gap-space-2">
            <h2
              id="dub-player-heading"
              className="text-lg font-bold text-text-primary"
            >
              Dub Player — Xem bằng tiếng Việt
            </h2>
            <span className="rounded-sm bg-success/15 px-space-2 py-0.5 text-[11px] font-semibold text-success">
              {manifest.status === "ready" ? "Sẵn sàng 100%" : "Preview sẵn sàng"}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            {manifest.title || `Video ${manifest.jobId}`} · Đồng bộ giọng lồng tiếng theo nhân vật và phụ đề song ngữ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-2">
          <a
            href={`/api/dub-jobs/${jobId}/export?format=mp4&stem=bgm_isolated`}
            download={`ai_dub_video_${jobId}.mp4`}
            className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:bg-primary-hover"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Tải Video .MP4 (Đã tách BGM)
          </a>

          <a
            href={`/api/dub-jobs/${jobId}/export?format=wav&stem=bgm_isolated`}
            download={`ai_dub_master_${jobId}.wav`}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Tải Audio .WAV
          </a>

          <button
            type="button"
            disabled={isRendering}
            onClick={handleRenderNow}
            className="inline-flex items-center gap-space-2 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRendering ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {isRendering ? "Đang cập nhật..." : "Làm mới Audio"}
          </button>
        </div>
      </div>

      {/* Fallback Warning Banner if current segment failed */}
      {syncState.fallbackActive && (
        <div
          role="status"
          className="mt-space-4 flex items-center gap-space-2 rounded-sm border border-warning/50 bg-warning/10 px-space-3 py-space-2 text-xs text-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{syncState.fallbackWarningMessage}</span>
        </div>
      )}

      <div className="mt-space-6 grid grid-cols-1 gap-space-6 lg:grid-cols-12">
        {/* Center Video + Character Lip-Sync Stage + Control Bar (8 cols) */}
        <div className="space-y-space-4 lg:col-span-8">
          <CharacterLipSyncStage
            jobTitle={manifest.title}
            sourceVideoId={manifest.sourceVideoId}
            videoUrl={manifest.videoUrl}
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            activeSegment={syncState.activeSegment}
            allSegments={manifest.audioSegments}
            effectiveDubPlaybackRate={syncState.effectiveDubPlaybackRate}
            effectiveOriginalVolume={syncState.effectiveOriginalVolume}
            effectiveDubVolume={syncState.effectiveDubVolume}
            subtitleOverlay={syncState.subtitleOverlay}
          />

          {/* Voice & ASR Model Selector Strip */}
          <div className="space-y-2 rounded-sm border border-surface-2 bg-surface-2/60 px-space-3 py-space-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-text-secondary">
                Model Thu Âm & Tách Thoại (ASR):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAsrModelMode("whisper_v3_turbo_deep")}
                  className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    asrModelMode === "whisper_v3_turbo_deep"
                      ? "bg-primary text-text-primary"
                      : "bg-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Whisper Large-v3-Turbo (Quét sâu 100% + Khôi phục thoại chồng)
                </button>
                <button
                  type="button"
                  onClick={() => setAsrModelMode("gemini_2_audio_omni")}
                  className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    asrModelMode === "gemini_2_audio_omni"
                      ? "bg-primary text-text-primary"
                      : "bg-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Gemini 2.0 Audio Omni
                </button>
                <button
                  type="button"
                  disabled={isRescanningAsr}
                  onClick={handleRescanFullAudio}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary hover:text-text-primary disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isRescanningAsr ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {isRescanningAsr
                    ? "Đang thu & dịch toàn bộ..."
                    : `Quét lại 100% âm thanh (${manifest.audioSegments.length} câu)`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApiHub((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-sm border border-surface bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-primary hover:border-primary"
                >
                  ⚡ Kết nối API Bên Thứ 3 & Test Ổn Định
                </button>
              </div>
            </div>

            {showApiHub && (
              <div className="mt-2 space-y-2.5 rounded-sm border border-primary/40 bg-bg/95 p-space-3 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-text-primary">
                      Trung tâm Kết nối AI Bên Thứ 3 (Dịch thuật &amp; Giọng đọc Studio)
                    </p>
                    <p className="text-text-muted">
                      Dán nhanh các khóa API Dịch thuật (DeepSeek, Groq, Gemini, OpenAI) và Giọng đọc (FPT.AI, ElevenLabs), hoặc bấm sang Trang Quản Trị (/admin) để cấu hình toàn diện:
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="/admin"
                      className="rounded-sm border border-primary/60 bg-primary/15 px-3 py-1.5 font-bold text-primary hover:bg-primary hover:text-text-primary"
                    >
                      ⚙️ Mở Trang Quản Trị Đầy Đủ (/admin)
                    </a>
                    <button
                      type="button"
                      disabled={isTestingApi}
                      onClick={handleSaveAndTestApi}
                      className="rounded-sm bg-primary px-3 py-1.5 font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      {isTestingApi
                        ? "Đang Ping Engine..."
                        : "Lưu & Test Độ Ổn Định Live"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block font-semibold text-primary">
                      1. DeepSeek API Key (Dịch thuật · $1 ~ 2.000 video)
                    </label>
                    <input
                      type="password"
                      value={deepSeekKeyInput}
                      onChange={(e) => setDeepSeekKeyInput(e.target.value)}
                      placeholder="sk-... (platform.deepseek.com)"
                      className="mt-1 w-full rounded border border-primary/50 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-text-secondary">
                      2. Groq API Key (Free · Whisper-v3 + Llama-3.3-70B)
                    </label>
                    <input
                      type="password"
                      value={groqKeyInput}
                      onChange={(e) => setGroqKeyInput(e.target.value)}
                      placeholder="gsk_... (console.groq.com)"
                      className="mt-1 w-full rounded border border-surface-2 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-text-secondary">
                      3. Google Gemini API Key (Gemini 2.0 Flash)
                    </label>
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder="AIza... (aistudio.google.com)"
                      className="mt-1 w-full rounded border border-surface-2 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-success">
                      4. FPT.AI TTS Key (Giọng đọc Việt 3 miền: Ban Mai / Lê Minh)
                    </label>
                    <input
                      type="password"
                      value={fptAiKeyInput}
                      onChange={(e) => setFptAiKeyInput(e.target.value)}
                      placeholder="API Key từ console.fpt.ai (Free 100k ký tự)"
                      className="mt-1 w-full rounded border border-success/50 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-success">
                      5. ElevenLabs API Key (Giọng điện ảnh Multilingual v2)
                    </label>
                    <input
                      type="password"
                      value={elevenLabsKeyInput}
                      onChange={(e) => setElevenLabsKeyInput(e.target.value)}
                      placeholder="xi-api-key từ elevenlabs.io (Free 10k ký tự)"
                      className="mt-1 w-full rounded border border-success/50 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-text-secondary">
                      6. OpenAI API Key (GPT-4o-mini + Giọng đọc Nova/Onyx)
                    </label>
                    <input
                      type="password"
                      value={openAiKeyInput}
                      onChange={(e) => setOpenAiKeyInput(e.target.value)}
                      placeholder="sk-proj-... (platform.openai.com)"
                      className="mt-1 w-full rounded border border-surface-2 bg-surface px-2 py-1 text-text-primary"
                    />
                  </div>
                </div>

                {apiDiagnostics && (
                  <div className="space-y-2 rounded border border-success/40 bg-success/10 p-2.5 text-text-primary">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-success">
                      <span>
                        ✓ Dịch thuật ({apiDiagnostics.activeTranslationEngine}):{" "}
                        {apiDiagnostics.translationLatencyMs}ms
                      </span>
                      <span>
                        ✓ Giọng đọc ({apiDiagnostics.activeTtsEngine}):{" "}
                        {apiDiagnostics.ttsLatencyMs}ms ({apiDiagnostics.ttsBytes}{" "}
                        bytes MP3)
                      </span>
                    </div>
                    {apiDiagnostics.ttsAudioDataUri && (
                      <audio
                        controls
                        src={apiDiagnostics.ttsAudioDataUri}
                        className="h-8 w-full"
                      />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-text-secondary">
                        Mẫu dịch kiểm thử: &ldquo;{apiDiagnostics.translationSampleVi}&rdquo;
                      </p>
                      <button
                        type="button"
                        disabled={isRescanningAsr}
                        onClick={handleRescanFullAudio}
                        className="inline-flex items-center gap-1.5 rounded-sm bg-success px-3 py-1.5 text-[11px] font-bold text-bg hover:opacity-90 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            isRescanningAsr ? "animate-spin" : ""
                          }`}
                        />
                        {isRescanningAsr
                          ? `⏳ Đang dịch bằng ${apiDiagnostics.activeTranslationEngine}...`
                          : `🚀 Áp dụng ${apiDiagnostics.activeTranslationEngine} dịch lại toàn bộ Video này ngay`}
                      </button>
                    </div>
                  </div>
                )}

                {rescanStatusMsg && (
                  <div
                    role="status"
                    className="rounded border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-bold text-text-primary"
                  >
                    {rescanStatusMsg}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-2/80 pt-1.5">
              <span className="font-semibold text-text-secondary">
                Chế độ Giọng đọc & Khớp môi:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVoiceEngineMode("cloud_neural_autofit")}
                  className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    voiceEngineMode === "cloud_neural_autofit"
                      ? "bg-primary text-text-primary"
                      : "bg-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Neural Studio (HoaiMy / NamMinh Neural 24kHz)
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceEngineMode("browser_natural_vi")}
                  className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    voiceEngineMode === "browser_natural_vi"
                      ? "bg-primary text-text-primary"
                      : "bg-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Giọng Windows/Edge Natural
                </button>
                <button
                  type="button"
                  onClick={() => setAutoSkipSilence((prev) => !prev)}
                  className={`rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    autoSkipSilence
                      ? "border-success/50 bg-success/15 text-success"
                      : "border-surface-2 bg-surface text-text-secondary"
                  }`}
                >
                  {autoSkipSilence
                    ? "✓ Tự qua khoảng nhạc không lời"
                    : "Giữ khoảng lặng gốc"}
                </button>
              </div>
            </div>
          </div>

          <PlayerControlBar
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            totalDurationMs={totalDurationMs}
            playbackSpeed={playbackSpeed}
            originalVolume={originalVolume}
            dubVolume={dubVolume}
            dubEnabled={dubEnabled}
            originalAudioEnabled={originalAudioEnabled}
            subtitleMode={subtitleMode}
            onTogglePlay={handleTogglePlay}
            onSeek={(ms) => handleSeek(ms)}
            onSpeedChange={setPlaybackSpeed}
            onOriginalVolumeChange={setOriginalVolume}
            onDubVolumeChange={setDubVolume}
            onToggleDub={() => setDubEnabled((d) => !d)}
            onToggleOriginalAudio={() => setOriginalAudioEnabled((o) => !o)}
            onSubtitleModeChange={setSubtitleMode}
            onOpenVoiceDrawer={onOpenVoiceDrawer}
          />
          <audio ref={audioElementRef} className="hidden" preload="auto" />

          <p className="text-[11px] text-text-muted">
            Phím tắt Studio:{" "}
            <span className="font-semibold text-text-secondary">Space</span>{" "}
            Phát/Dừng ·{" "}
            <span className="font-semibold text-text-secondary">V</span> Bật/Tắt
            giọng AI ·{" "}
            <span className="font-semibold text-text-secondary">M</span> Tiếng
            gốc · <span className="font-semibold text-text-secondary">C</span>{" "}
            Đổi phụ đề ·{" "}
            <span className="font-semibold text-text-secondary">←/→</span> Tua 5
            giây
          </p>
        </div>

        {/* Transcript Side Panel: Click any line to seek (4 cols) */}
        <aside
          aria-label="Danh sách lời thoại đồng bộ theo trình phát"
          className="flex max-h-[460px] flex-col rounded-md border border-surface-2 bg-surface-2 p-space-4 lg:col-span-4"
        >
          <div className="flex items-center justify-between border-b border-surface pb-space-2">
            <span className="text-xs font-bold text-text-primary">
              Lời thoại đồng bộ (Click để tua)
            </span>
            <span className="text-[11px] text-text-muted tabular-nums">
              {manifest.audioSegments.length} đoạn
            </span>
          </div>

          <div className="mt-space-3 flex-1 space-y-space-2 overflow-y-auto pr-1">
            {manifest.audioSegments.map((seg) => {
              const isActive = syncState.activeSegment?.id === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => handleSeek(seg.startMs + 50, seg)}
                  className={`w-full rounded-sm border p-space-3 text-left transition-colors ${
                    isActive
                      ? "border-primary bg-surface"
                      : "border-transparent bg-surface/50 hover:border-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-primary">
                      {seg.speakerDisplayName}
                    </span>
                    <span className="text-text-muted tabular-nums">
                      {formatTimestampMs(seg.startMs)} –{" "}
                      {formatTimestampMs(seg.endMs)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-text-primary">
                    {seg.translatedText}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {seg.sourceText}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
