"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SchedulableSegment } from "@/server/services/audio-mixer";
import { Eye, Film, Mic, Sparkles, Video } from "lucide-react";

export type MouthViseme = "A" | "O" | "E" | "U" | "MBP" | "REST";

export interface WordVisemeToken {
  word: string;
  startMs: number;
  endMs: number;
  viseme: MouthViseme;
}

const VISEME_META: Record<
  MouthViseme,
  { code: string; label: string; desc: string; color: string }
> = {
  A: {
    code: "A / Ă / Â",
    label: "Mở rộng hàm",
    desc: "Nguyên âm mở (a, ai, ao, ay, au)",
    color: "text-success border-success/50 bg-success/15",
  },
  O: {
    code: "O / Ô / Ơ",
    label: "Tròn môi",
    desc: "Nguyên âm tròn môi (o, ô, ơ, đôi, đợi)",
    color: "text-primary border-primary/50 bg-primary/15",
  },
  E: {
    code: "E / Ê / I",
    label: "Miệng hẹp ngang",
    desc: "Nguyên âm dẹt (e, ê, i, y, đi, thành)",
    color: "text-warning border-warning/50 bg-warning/15",
  },
  U: {
    code: "U / Ư",
    label: "Chu môi nhỏ",
    desc: "Nguyên âm khép tròn (u, ư, thuật, lượng)",
    color: "text-primary border-primary/50 bg-primary/15",
  },
  MBP: {
    code: "M / B / P",
    label: "Khép môi bật",
    desc: "Phụ âm hai môi (m, b, p, phép, mà, bật)",
    color: "text-warning border-warning/50 bg-warning/15",
  },
  REST: {
    code: "NGHỈ",
    label: "Khép miệng tự nhiên",
    desc: "Nhân vật ngừng thoại / Đóng khẩu hình",
    color: "text-text-muted border-surface-2 bg-surface-2",
  },
};

export function classifyVietnameseSyllableViseme(word: string): MouthViseme {
  const norm = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z]/g, "");

  if (!norm) return "REST";
  if (/^(m|b|p)/.test(norm) || /(m|p)$/.test(norm)) {
    return "MBP";
  }
  if (/(o|oo|oa|oe)/.test(norm)) {
    return "O";
  }
  if (/(u|uu|uy)/.test(norm)) {
    return "U";
  }
  if (/(e|i|y)/.test(norm)) {
    return "E";
  }
  return "A";
}

export function buildSegmentWordVisemeTimeline(
  seg: SchedulableSegment | null
): WordVisemeToken[] {
  if (!seg || !seg.translatedText) return [];
  const words = seg.translatedText
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const slotMs = Math.max(400, seg.endMs - seg.startMs);
  // Leave a natural 80ms closing margin at the end so mouth closes right at endMs
  const activeSpanMs = Math.max(300, slotMs - 80);
  const totalWeight = words.reduce(
    (acc: number, w: string) =>
      acc + Math.max(2, w.replace(/[^a-zA-ZÀ-ỹ]/g, "").length),
    0
  );

  let cursorMs = seg.startMs;
  return words.map((word: string, idx: number) => {
    const charWeight = Math.max(2, word.replace(/[^a-zA-ZÀ-ỹ]/g, "").length);
    const wordDur =
      idx === words.length - 1
        ? Math.max(90, seg.startMs + activeSpanMs - cursorMs)
        : Math.max(85, Math.round((charWeight / totalWeight) * activeSpanMs));
    const token: WordVisemeToken = {
      word,
      startMs: cursorMs,
      endMs: cursorMs + wordDur,
      viseme: classifyVietnameseSyllableViseme(word),
    };
    cursorMs += wordDur;
    return token;
  });
}

function CharacterAvatarSvg({
  characterIndex,
  displayName,
  voiceName,
  isSpeaking,
  viseme,
  audioLevel,
  subPhase,
  large = false,
}: {
  characterIndex: number;
  displayName: string;
  voiceName: string;
  isSpeaking: boolean;
  viseme: MouthViseme;
  audioLevel: number;
  subPhase: number;
  large?: boolean;
}) {
  const isChildOrFemale =
    characterIndex === 0 ||
    voiceName.toLowerCase().includes("bé bo") ||
    voiceName.toLowerCase().includes("vy") ||
    voiceName.toLowerCase().includes("linh") ||
    voiceName.toLowerCase().includes("hà");

  // Rapid natural jaw oscillation within a syllable so mouth moves organically
  const microPulse = isSpeaking
    ? 0.72 + 0.28 * Math.sin(subPhase * Math.PI * 2)
    : 0;
  const effectiveOpen = isSpeaking
    ? Math.max(0.25, Math.min(1, audioLevel * 0.65 + microPulse * 0.55))
    : 0;

  // Render mouth geometry according to active Vietnamese Viseme
  const renderMouth = () => {
    if (!isSpeaking || viseme === "REST") {
      // Closed relaxed smile
      return (
        <g>
          <path
            d="M 86 132 Q 100 137 114 132"
            fill="none"
            stroke="#3B1D1A"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M 92 136 Q 100 138 108 136"
            fill="none"
            stroke="#D97B73"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      );
    }

    if (viseme === "MBP") {
      // Pressed bilabial lips (M / B / P)
      return (
        <g>
          <path
            d="M 84 132 Q 100 130 116 132"
            fill="none"
            stroke="#9E2A2B"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <line
            x1="86"
            y1="132"
            x2="114"
            y2="132"
            stroke="#2B1110"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    }

    if (viseme === "O") {
      // Rounded wide O / Ô / Ơ mouth
      const rx = 10 + effectiveOpen * 3;
      const ry = 9 + effectiveOpen * 6;
      return (
        <g>
          <ellipse
            cx="100"
            cy="134"
            rx={rx}
            ry={ry}
            fill="#4A1215"
            stroke="#C84B4B"
            strokeWidth="2.8"
          />
          {/* Upper teeth */}
          <path
            d={`M ${100 - rx + 3} ${134 - ry + 3} Q 100 ${134 - ry + 5} ${
              100 + rx - 3
            } ${134 - ry + 3}`}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          {/* Tongue */}
          <ellipse
            cx="100"
            cy={134 + ry - 4}
            rx={rx * 0.65}
            ry={ry * 0.38}
            fill="#E06377"
          />
        </g>
      );
    }

    if (viseme === "U") {
      // Small pursed U / Ư mouth
      const rx = 6.5 + effectiveOpen * 2;
      const ry = 6.5 + effectiveOpen * 3.5;
      return (
        <g>
          <ellipse
            cx="100"
            cy="134"
            rx={rx}
            ry={ry}
            fill="#3D0E11"
            stroke="#B83B3B"
            strokeWidth="3.2"
          />
          <ellipse
            cx="100"
            cy={134 + 2}
            rx={rx * 0.55}
            ry={ry * 0.35}
            fill="#E06377"
          />
        </g>
      );
    }

    if (viseme === "E") {
      // Wide horizontal smile E / Ê / I with visible teeth
      const openH = 5 + effectiveOpen * 6;
      return (
        <g>
          <rect
            x="83"
            y={131 - openH / 2}
            width="34"
            height={openH + 4}
            rx="6"
            fill="#4A1215"
            stroke="#C84B4B"
            strokeWidth="2.4"
          />
          {/* Upper teeth bar */}
          <rect
            x="86"
            y={131 - openH / 2 + 1}
            width="28"
            height="3.5"
            rx="1.5"
            fill="#FFFFFF"
          />
          {/* Tongue */}
          <ellipse
            cx="100"
            cy={131 + openH / 2 + 1}
            rx="10"
            ry="2.8"
            fill="#E06377"
          />
        </g>
      );
    }

    // Default "A" Viseme: Wide open jaw (A / Ă / Â / AI / AO)
    const jawDrop = 10 + effectiveOpen * 10;
    return (
      <g>
        <path
          d={`M 82 128 Q 100 125 118 128 Q 116 ${128 + jawDrop} 100 ${
            130 + jawDrop
          } Q 84 ${128 + jawDrop} 82 128 Z`}
          fill="#4A1215"
          stroke="#C84B4B"
          strokeWidth="2.6"
        />
        {/* Upper teeth */}
        <path
          d="M 86 129 Q 100 131 114 129 L 113 133 Q 100 134 87 133 Z"
          fill="#FFFFFF"
        />
        {/* Tongue */}
        <ellipse
          cx="100"
          cy={127 + jawDrop * 0.72}
          rx="10"
          ry="4.5"
          fill="#E56B7E"
        />
      </g>
    );
  };

  const headBobY = isSpeaking ? Math.sin(subPhase * Math.PI * 2) * -2.5 : 0;

  return (
    <div
      className={`relative flex flex-col items-center transition-all duration-200 ${
        isSpeaking ? "scale-105 opacity-100" : "scale-95 opacity-75"
      }`}
    >
      {/* Speaking Aura Ring */}
      <div
        className={`relative rounded-full p-1 transition-all ${
          isSpeaking
            ? "ring-2 ring-primary shadow-[0_0_25px_rgba(99,102,241,0.45)]"
            : "ring-1 ring-surface-2"
        }`}
      >
        <svg
          viewBox="0 0 200 200"
          className={large ? "h-44 w-44" : "h-32 w-32 sm:h-36 sm:w-36"}
          aria-label={`Khẩu hình nhân vật ${displayName}`}
        >
          <defs>
            <linearGradient
              id={`bgGrad_${characterIndex}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor={isChildOrFemale ? "#312E81" : "#1E293B"}
              />
              <stop
                offset="100%"
                stopColor={isChildOrFemale ? "#4C1D95" : "#0F172A"}
              />
            </linearGradient>
          </defs>

          {/* Stage Avatar Backdrop */}
          <circle
            cx="100"
            cy="100"
            r="94"
            fill={`url(#bgGrad_${characterIndex})`}
          />

          {/* Shoulders / Costume */}
          <path
            d="M 38 188 Q 100 155 162 188"
            fill={isChildOrFemale ? "#EC4899" : "#3B82F6"}
          />
          <path
            d="M 68 168 L 100 186 L 132 168"
            fill={isChildOrFemale ? "#F472B6" : "#60A5FA"}
          />

          {/* Neck */}
          <rect
            x="88"
            y="146"
            width="24"
            height="24"
            rx="8"
            fill={isChildOrFemale ? "#FDE0C8" : "#F5CBA7"}
          />

          {/* Animated Head Group */}
          <g transform={`translate(0, ${headBobY.toFixed(2)})`}>
            {/* Ears */}
            <circle
              cx="53"
              cy="108"
              r="10"
              fill={isChildOrFemale ? "#FDE0C8" : "#F5CBA7"}
            />
            <circle
              cx="147"
              cy="108"
              r="10"
              fill={isChildOrFemale ? "#FDE0C8" : "#F5CBA7"}
            />

            {/* Face Base */}
            <ellipse
              cx="100"
              cy="106"
              rx="46"
              ry="50"
              fill={isChildOrFemale ? "#FFE5D0" : "#F5CBA7"}
            />

            {/* Hair / Dragon Knight Crest */}
            {isChildOrFemale ? (
              <g>
                <path
                  d="M 50 96 Q 52 44 100 44 Q 148 44 150 96 Q 134 68 100 72 Q 66 68 50 96 Z"
                  fill="#6D28D9"
                />
                {/* Magic Star Hairpin */}
                <circle cx="66" cy="68" r="7" fill="#FBBF24" />
                <circle cx="134" cy="68" r="7" fill="#FBBF24" />
              </g>
            ) : (
              <g>
                <path
                  d="M 52 92 Q 56 42 100 40 Q 144 42 148 92 Q 125 65 100 68 Q 75 65 52 92 Z"
                  fill="#1E293B"
                />
                {/* Knight Headband */}
                <path
                  d="M 55 76 Q 100 84 145 76"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            )}

            {/* Expressive Eyebrows */}
            <path
              d={
                isSpeaking
                  ? "M 68 84 Q 78 77 88 83"
                  : "M 68 87 Q 78 84 88 87"
              }
              fill="none"
              stroke="#331812"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d={
                isSpeaking
                  ? "M 112 83 Q 122 77 132 84"
                  : "M 112 87 Q 122 84 132 87"
              }
              fill="none"
              stroke="#331812"
              strokeWidth="3.2"
              strokeLinecap="round"
            />

            {/* Eyes */}
            <ellipse cx="78" cy="99" rx="7.5" ry="8.5" fill="#1E1B18" />
            <ellipse cx="122" cy="99" rx="7.5" ry="8.5" fill="#1E1B18" />
            {/* Eye Sparkles */}
            <circle cx="75.5" cy="96" r="2.6" fill="#FFFFFF" />
            <circle cx="119.5" cy="96" r="2.6" fill="#FFFFFF" />

            {/* Cheeks */}
            <ellipse
              cx="67"
              cy="115"
              rx="7"
              ry="4"
              fill="#F43F5E"
              opacity={isSpeaking ? 0.45 : 0.22}
            />
            <ellipse
              cx="133"
              cy="115"
              rx="7"
              ry="4"
              fill="#F43F5E"
              opacity={isSpeaking ? 0.45 : 0.22}
            />

            {/* Nose */}
            <path
              d="M 100 103 L 97 115 L 103 116"
              fill="none"
              stroke="#C98A6B"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dynamic Lip-Sync Mouth (6 Visemes) */}
            {renderMouth()}
          </g>
        </svg>

        {/* Live Viseme Pill Badge on Avatar Corner */}
        <span
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold shadow-sm ${
            VISEME_META[viseme].color
          }`}
        >
          Khẩu hình: [{VISEME_META[viseme].code}]
        </span>
      </div>

      {/* Character Name & Voice Tag */}
      <div className="mt-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <span
            className={`h-2 w-2 rounded-full ${
              isSpeaking ? "animate-ping bg-success" : "bg-surface-2"
            }`}
          />
          <span className="text-xs font-bold text-text-primary">
            {displayName}
          </span>
        </div>
        <span className="block text-[10px] text-text-secondary">
          {voiceName}
        </span>
      </div>
    </div>
  );
}

export function CharacterLipSyncStage({
  jobTitle,
  sourceVideoId,
  videoUrl,
  isPlaying,
  currentTimeMs,
  activeSegment,
  allSegments,
  effectiveDubPlaybackRate,
  effectiveOriginalVolume,
  effectiveDubVolume,
  subtitleOverlay,
}: {
  jobTitle?: string | null;
  sourceVideoId?: string | null;
  videoUrl?: string | null;
  isPlaying: boolean;
  currentTimeMs: number;
  activeSegment:
    | (SchedulableSegment & { voiceDisplayName?: string })
    | null;
  allSegments: Array<SchedulableSegment & { voiceDisplayName?: string }>;
  effectiveDubPlaybackRate: number;
  effectiveOriginalVolume: number;
  effectiveDubVolume: number;
  subtitleOverlay: {
    sourceLine: string | null;
    targetLine: string | null;
  };
}) {
  const isRealYoutubeId =
    Boolean(sourceVideoId) &&
    /^[a-zA-Z0-9_-]{11}$/.test(sourceVideoId || "") &&
    sourceVideoId !== "animDragon1";

  const [viewMode, setViewMode] = useState<
    "stage_lipsync" | "closeup_inspector" | "real_video"
  >("stage_lipsync");
  const [customVideoUrl, setCustomVideoUrl] = useState<string>("");
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastYtSeekSecRef = useRef<number>(0);

  // Extract distinct characters in the scene
  const characters = useMemo(() => {
    const map = new Map<
      string,
      { speakerId: string; displayName: string; voiceDisplayName: string }
    >();
    for (const seg of allSegments) {
      if (!map.has(seg.speakerId)) {
        map.set(seg.speakerId, {
          speakerId: seg.speakerId,
          displayName: seg.speakerDisplayName || "Nhân vật",
          voiceDisplayName:
            (seg as SchedulableSegment & { voiceDisplayName?: string })
              .voiceDisplayName || "Giọng Neural Studio",
        });
      }
    }
    if (map.size === 0) {
      return [
        {
          speakerId: "spk_1",
          displayName: "Speaker 1",
          voiceDisplayName: "Bé Bo (HoaiMyNeural)",
        },
      ];
    }
    return Array.from(map.values());
  }, [allSegments]);

  // Build millisecond-accurate word & viseme timeline for the active segment
  const wordTimeline = useMemo(
    () => buildSegmentWordVisemeTimeline(activeSegment),
    [activeSegment]
  );

  // Find current spoken word & viseme at currentTimeMs
  const activeWordState = useMemo(() => {
    if (!activeSegment || wordTimeline.length === 0) {
      return {
        currentWord: null as WordVisemeToken | null,
        wordIndex: -1,
        viseme: "REST" as MouthViseme,
        subPhase: 0,
        audioLevel: 0,
      };
    }

    const foundIdx = wordTimeline.findIndex(
      (w) => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs
    );

    if (foundIdx === -1) {
      // In brief pause or closing margin at the end of segment
      return {
        currentWord: null,
        wordIndex:
          currentTimeMs > wordTimeline[wordTimeline.length - 1].endMs
            ? wordTimeline.length
            : -1,
        viseme: "REST" as MouthViseme,
        subPhase: 0,
        audioLevel: 0.05,
      };
    }

    const token = wordTimeline[foundIdx];
    const progressInWord = Math.max(
      0,
      Math.min(
        1,
        (currentTimeMs - token.startMs) /
          Math.max(40, token.endMs - token.startMs)
      )
    );
    // Natural syllable envelope: rises quickly in vowel nucleus, closes slightly at syllable tail
    const envelope = Math.sin(progressInWord * Math.PI);
    const dynamicViseme: MouthViseme =
      progressInWord > 0.88 ? "REST" : token.viseme;

    return {
      currentWord: token,
      wordIndex: foundIdx,
      viseme: isPlaying ? dynamicViseme : token.viseme,
      subPhase: progressInWord,
      audioLevel: isPlaying ? Math.max(0.25, envelope) : 0.35,
    };
  }, [activeSegment, wordTimeline, currentTimeMs, isPlaying]);

  // Keep background HTML5 video synchronized when in real_video mode
  useEffect(() => {
    const vid = bgVideoRef.current;
    if (!vid) return;
    vid.volume = Math.max(0, Math.min(1, effectiveOriginalVolume));
    const targetSec = (currentTimeMs / 1000) % Math.max(10, vid.duration || 36);
    if (Math.abs(vid.currentTime - targetSec) > 0.6) {
      try {
        vid.currentTime = targetSec;
      } catch {
        // Ignore seek before metadata loaded
      }
    }
    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [currentTimeMs, isPlaying, effectiveOriginalVolume, viewMode]);

  // Synchronize YouTube IFrame via postMessage API without reloading iframe src
  useEffect(() => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win || !isRealYoutubeId) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: "command",
          func: "setVolume",
          args: [Math.round(effectiveOriginalVolume * 100)],
        }),
        "*"
      );
      if (isPlaying) {
        win.postMessage(
          JSON.stringify({ event: "command", func: "playVideo", args: [] }),
          "*"
        );
      } else {
        win.postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
          "*"
        );
      }
    } catch {
      // Ignore cross-origin postMessage errors
    }
  }, [isPlaying, effectiveOriginalVolume, isRealYoutubeId, viewMode]);

  useEffect(() => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win || !isRealYoutubeId) return;
    const targetSec = Math.floor(currentTimeMs / 1000);
    if (Math.abs(targetSec - lastYtSeekSecRef.current) >= 2) {
      lastYtSeekSecRef.current = targetSec;
      try {
        win.postMessage(
          JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [targetSec, true],
          }),
          "*"
        );
      } catch {
        // Ignore
      }
    } else {
      lastYtSeekSecRef.current = targetSec;
    }
  }, [currentTimeMs, isRealYoutubeId]);

  const activeVisemeInfo = VISEME_META[activeWordState.viseme];

  return (
    <div className="relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-md border border-surface-2 bg-bg">
      {/* Top Mode Switcher & Lip-Sync Telemetry Header */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-surface-2/80 bg-bg/90 px-space-3 py-space-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("stage_lipsync")}
            className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === "stage_lipsync"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Sân khấu Khẩu hình 2D
          </button>

          <button
            type="button"
            onClick={() => setViewMode("closeup_inspector")}
            className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === "closeup_inspector"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            Soi Cận Cảnh Khẩu Hình & Âm Tiết
          </button>

          <button
            type="button"
            onClick={() => setViewMode("real_video")}
            className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              viewMode === "real_video"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Film className="h-3 w-3" aria-hidden="true" />
            Video & PiP Khẩu Hình
          </button>
        </div>

        {/* Real-time Lip-Sync Status Pill */}
        <div className="flex items-center gap-2 text-[11px] tabular-nums">
          <span
            className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-semibold ${activeVisemeInfo.color}`}
          >
            <Mic className="h-3 w-3" aria-hidden="true" />
            {activeVisemeInfo.code}: {activeVisemeInfo.label}
          </span>
          <span className="hidden rounded-sm bg-surface-2 px-2 py-0.5 text-text-secondary sm:inline-block">
            Tốc độ khớp môi: {effectiveDubPlaybackRate}x
          </span>
        </div>
      </div>

      {/* CENTER STAGE CONTENT */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-space-4 py-space-2">
        {viewMode === "stage_lipsync" && (
          <div className="flex w-full flex-col items-center justify-center gap-3">
            {/* Characters Side-by-Side Stage */}
            <div className="flex w-full flex-wrap items-center justify-around gap-4">
              {characters.map((char, idx) => {
                const isThisCharSpeaking =
                  activeSegment?.speakerId === char.speakerId;
                return (
                  <CharacterAvatarSvg
                    key={char.speakerId}
                    characterIndex={idx}
                    displayName={char.displayName}
                    voiceName={char.voiceDisplayName}
                    isSpeaking={isThisCharSpeaking}
                    viseme={
                      isThisCharSpeaking ? activeWordState.viseme : "REST"
                    }
                    audioLevel={
                      isThisCharSpeaking ? activeWordState.audioLevel : 0
                    }
                    subPhase={
                      isThisCharSpeaking ? activeWordState.subPhase : 0
                    }
                  />
                );
              })}
            </div>

            {/* Live Word-by-Word Karaoke & Viseme Articulation Bar */}
            <div className="w-full max-w-2xl rounded-md border border-surface-2 bg-surface/90 px-space-3 py-space-2 shadow-sm">
              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <span className="font-semibold uppercase tracking-wider text-primary">
                  {activeSegment
                    ? `Đang khớp khẩu hình: ${activeSegment.speakerDisplayName} (${activeSegment.voiceDisplayName})`
                    : "Nhân vật đang khép môi (Giữa 2 câu thoại)"}
                </span>
                <span className="tabular-nums">
                  {activeWordState.currentWord
                    ? `Âm tiết: "${activeWordState.currentWord.word}" → [${activeWordState.viseme}]`
                    : "Khẩu hình: [NGHỈ - Khép môi]"}
                </span>
              </div>

              {wordTimeline.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
                  {wordTimeline.map((token, idx) => {
                    const isCurrent = idx === activeWordState.wordIndex;
                    const isPast = idx < activeWordState.wordIndex;
                    return (
                      <span
                        key={`${token.word}_${idx}`}
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium transition-all ${
                          isCurrent
                            ? "scale-110 bg-primary font-bold text-text-primary shadow-sm"
                            : isPast
                            ? "bg-surface-2/80 text-text-primary"
                            : "text-text-muted"
                        }`}
                      >
                        <span>{token.word}</span>
                        {isCurrent && (
                          <span className="ml-0.5 rounded bg-bg/40 px-1 text-[9px] font-bold">
                            {token.viseme}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 text-center text-xs text-text-muted">
                  Bấm nút Phát (▶) hoặc click vào câu thoại bên phải để xem nhân vật cử động khẩu hình theo từng chữ tiếng Việt.
                </p>
              )}
            </div>
          </div>
        )}

        {viewMode === "closeup_inspector" && (
          <div className="grid w-full max-w-2xl grid-cols-1 items-center gap-4 sm:grid-cols-12">
            {/* Left: Zoomed-in Active Character Face */}
            <div className="flex flex-col items-center justify-center sm:col-span-5">
              <CharacterAvatarSvg
                characterIndex={
                  characters.findIndex(
                    (c) => c.speakerId === activeSegment?.speakerId
                  ) >= 0
                    ? characters.findIndex(
                        (c) => c.speakerId === activeSegment?.speakerId
                      )
                    : 0
                }
                displayName={
                  activeSegment?.speakerDisplayName ||
                  characters[0]?.displayName ||
                  "Speaker 1"
                }
                voiceName={
                  activeSegment?.voiceDisplayName ||
                  characters[0]?.voiceDisplayName ||
                  "Giọng Neural Studio"
                }
                isSpeaking={Boolean(activeSegment)}
                viseme={activeWordState.viseme}
                audioLevel={activeWordState.audioLevel}
                subPhase={activeWordState.subPhase}
                large
              />
            </div>

            {/* Right: 6-Viseme Matrix & Syllable Sync Inspector */}
            <div className="space-y-2.5 sm:col-span-7">
              <div className="rounded-sm border border-surface-2 bg-surface p-2.5">
                <div className="text-[11px] font-bold text-text-primary">
                  Bảng 6 Pha Khẩu Hình Chuẩn Tiếng Việt (Real-time Viseme)
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(["A", "O", "E", "U", "MBP", "REST"] as MouthViseme[]).map(
                    (v) => {
                      const active = activeWordState.viseme === v;
                      return (
                        <div
                          key={v}
                          className={`rounded border p-1.5 text-center transition-all ${
                            active
                              ? "border-primary bg-primary/20 font-bold text-text-primary shadow-sm"
                              : "border-surface-2 bg-bg/50 text-text-muted"
                          }`}
                        >
                          <div className="text-[11px] font-bold">
                            [{VISEME_META[v].code}]
                          </div>
                          <div className="text-[10px]">
                            {VISEME_META[v].label}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="rounded-sm border border-surface-2 bg-surface p-2.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-secondary">
                    Kiểm tra khớp mở/đóng miệng:
                  </span>
                  <span className="font-bold text-success">
                    {activeSegment
                      ? `Đang mở khẩu hình (${activeSegment.startMs}ms – ${activeSegment.endMs}ms)`
                      : "Đã khép môi đúng nhịp nghỉ"}
                  </span>
                </div>
                <p className="mt-1 text-text-muted">
                  {activeSegment
                    ? `Câu gốc: "${activeSegment.sourceText}"`
                    : "Khi hết câu thoại, nhân vật lập tức chuyển về trạng thái [NGHỈ - Khép miệng], đảm bảo tiếng Việt không bị tràn lời."}
                </p>
              </div>
            </div>
          </div>
        )}

        {viewMode === "real_video" && (
          <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded">
            {isRealYoutubeId ? (
              <iframe
                ref={ytIframeRef}
                title={jobTitle || "YouTube Video"}
                src={`https://www.youtube.com/embed/${sourceVideoId}?enablejsapi=1&playsinline=1&rel=0`}
                className="h-full min-h-[260px] w-full rounded border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <video
                ref={bgVideoRef}
                src={
                  customVideoUrl.trim() ||
                  (videoUrl && !videoUrl.includes("youtube.com")
                    ? videoUrl
                    : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")
                }
                className="h-full max-h-[270px] w-full rounded object-cover"
                muted={effectiveOriginalVolume === 0}
                playsInline
                loop
              />
            )}

            {/* Picture-in-Picture Lip-Sync Character Overlay in Bottom-Right */}
            <div className=" absolute right-3 top-2 z-20 rounded-md border border-surface-2 bg-bg/90 p-2 shadow-lg backdrop-blur-sm">
              <CharacterAvatarSvg
                characterIndex={
                  characters.findIndex(
                    (c) => c.speakerId === activeSegment?.speakerId
                  ) >= 0
                    ? characters.findIndex(
                        (c) => c.speakerId === activeSegment?.speakerId
                      )
                    : 0
                }
                displayName={
                  activeSegment?.speakerDisplayName ||
                  characters[0]?.displayName ||
                  "Speaker 1"
                }
                voiceName={
                  activeSegment?.voiceDisplayName || "Giọng Neural Studio"
                }
                isSpeaking={Boolean(activeSegment)}
                viseme={activeWordState.viseme}
                audioLevel={activeWordState.audioLevel}
                subPhase={activeWordState.subPhase}
              />
            </div>

            {/* Custom Video URL input bar at top-left of video mode */}
            <div className="absolute left-3 top-2 z-20 flex items-center gap-1.5 rounded bg-bg/90 px-2 py-1 text-[10px] backdrop-blur-sm">
              <Video className="h-3 w-3 text-primary" />
              <input
                type="url"
                value={customVideoUrl}
                onChange={(e) => setCustomVideoUrl(e.target.value)}
                placeholder="Dán link file .mp4 tùy chọn để test hình..."
                className="w-48 rounded border border-surface-2 bg-surface px-1.5 py-0.5 text-[10px] text-text-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bilingual Subtitle Overlay */}
      {(subtitleOverlay.sourceLine || subtitleOverlay.targetLine) && (
        <div
          aria-live="polite"
          className="z-20 flex flex-col items-center border-t border-surface-2/60 bg-bg/95 px-space-4 py-space-2 text-center"
        >
          {subtitleOverlay.targetLine && (
            <p className="text-sm font-semibold text-text-primary">
              {subtitleOverlay.targetLine}
            </p>
          )}
          {subtitleOverlay.sourceLine && (
            <p className="mt-0.5 text-xs text-text-secondary">
              {subtitleOverlay.sourceLine}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
