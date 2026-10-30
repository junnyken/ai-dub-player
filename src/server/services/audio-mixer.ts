import { AudioSegmentStatus, TimingStrategy } from "@/domain/models";

export interface SchedulableSegment {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  playbackRate: number;
  voiceId: string;
  speakerId: string;
  speakerDisplayName?: string;
  audioUrl: string;
  status: AudioSegmentStatus;
  timingStrategy?: TimingStrategy | null;
  sourceText: string;
  translatedText: string;
}

export interface PlaybackSyncState {
  currentTimeMs: number;
  activeSegment: SchedulableSegment | null;
  effectiveDubPlaybackRate: number;
  effectiveOriginalVolume: number;
  effectiveDubVolume: number;
  fallbackActive: boolean;
  fallbackWarningMessage: string | null;
  subtitleOverlay: {
    sourceLine: string | null;
    targetLine: string | null;
  };
}

export class AudioSegmentScheduler {
  public resolvePlaybackStateAtTime(params: {
    currentTimeMs: number;
    playbackSpeed: number;
    originalVolume: number; // 0.0 - 1.0
    dubVolume: number; // 0.0 - 1.0
    dubEnabled: boolean;
    originalAudioEnabled: boolean;
    subtitleMode: "off" | "source" | "target" | "bilingual";
    segments: SchedulableSegment[];
  }): PlaybackSyncState {
    const timeMs = Math.max(0, params.currentTimeMs);

    const activeSegment =
      params.segments.find(
        (seg) => timeMs >= seg.startMs && timeMs <= seg.endMs
      ) ?? null;

    let fallbackActive = false;
    let fallbackWarningMessage: string | null = null;
    let effectiveOriginalVolume = params.originalAudioEnabled
      ? params.originalVolume
      : 0;
    let effectiveDubVolume = params.dubEnabled ? params.dubVolume : 0;

    if (activeSegment && params.dubEnabled) {
      // Constraint 8: When a segment fails, player falls back safely to original audio with a warning (never crashes)
      if (activeSegment.status === "failed" || !activeSegment.audioUrl) {
        fallbackActive = true;
        fallbackWarningMessage =
          "Đoạn lồng tiếng này gặp sự cố — tự động chuyển về âm thanh gốc an toàn.";
        effectiveDubVolume = 0;
        effectiveOriginalVolume = Math.max(0.8, params.originalVolume);
      }
    }

    const baseSegmentRate = activeSegment?.playbackRate ?? 1.0;
    const effectiveDubPlaybackRate = Number(
      (baseSegmentRate * params.playbackSpeed).toFixed(2)
    );

    const showSource =
      params.subtitleMode === "source" || params.subtitleMode === "bilingual";
    const showTarget =
      params.subtitleMode === "target" || params.subtitleMode === "bilingual";

    return {
      currentTimeMs: timeMs,
      activeSegment,
      effectiveDubPlaybackRate,
      effectiveOriginalVolume,
      effectiveDubVolume,
      fallbackActive,
      fallbackWarningMessage,
      subtitleOverlay: {
        sourceLine:
          activeSegment && showSource ? activeSegment.sourceText : null,
        targetLine:
          activeSegment && showTarget ? activeSegment.translatedText : null,
      },
    };
  }
}

export type PlayerShortcutAction =
  | "toggle_play"
  | "toggle_original_audio"
  | "toggle_dub_audio"
  | "cycle_subtitle_mode"
  | "seek_backward_5s"
  | "seek_forward_5s"
  | null;

export function resolvePlayerShortcutAction(params: {
  key: string;
  targetTagName?: string | null;
  isContentEditable?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): PlayerShortcutAction {
  if (params.ctrlKey || params.metaKey || params.altKey) {
    return null;
  }

  const tag = (params.targetTagName ?? "").toUpperCase();
  if (
    params.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  ) {
    return null;
  }

  const k = params.key.toLowerCase();
  if (k === " " || k === "k") {
    return "toggle_play";
  }
  if (k === "m") {
    return "toggle_original_audio";
  }
  if (k === "v") {
    return "toggle_dub_audio";
  }
  if (k === "c") {
    return "cycle_subtitle_mode";
  }
  if (k === "arrowleft" || k === "j") {
    return "seek_backward_5s";
  }
  if (k === "arrowright" || k === "l") {
    return "seek_forward_5s";
  }

  return null;
}

export const audioSegmentScheduler = new AudioSegmentScheduler();
