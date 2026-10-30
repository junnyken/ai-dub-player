import {
  audioSegmentScheduler,
  PlaybackSyncState,
  SchedulableSegment,
} from "@/server/services/audio-mixer";
import { YouTubePlayerSyncBridge } from "@/extension/youtube-player-sync-bridge";
import {
  ExtensionSubtitleMode,
  InPageSubtitleOverlay,
  SubtitleOverlayRenderState,
} from "@/extension/in-page-subtitle-overlay";

export interface ExtensionAudioState {
  dubEnabled: boolean;
  originalAudioEnabled: boolean;
  originalVolume: number;
  dubVolume: number;
  subtitleMode: ExtensionSubtitleMode;
  isDubAudioPlaying: boolean;
  activeSegmentId: string | null;
  activeSpeakerId: string | null;
  activeVoiceId: string | null;
  effectiveDubPlaybackRate: number;
  effectiveOriginalVolume: number;
  effectiveDubVolume: number;
  fallbackActive: boolean;
  fallbackWarningMessage: string | null;
  subtitleState: SubtitleOverlayRenderState;
}

export class ExtensionAudioController {
  private readonly bridge: YouTubePlayerSyncBridge;
  private readonly subtitleOverlay: InPageSubtitleOverlay;
  private segments: SchedulableSegment[] = [];

  private dubEnabled = true;
  private originalAudioEnabled = true;
  private originalVolume = 0.2;
  private dubVolume = 1.0;
  private subtitleMode: ExtensionSubtitleMode = "bilingual";

  private isDubAudioPlaying = false;
  private lastSyncState: PlaybackSyncState | null = null;
  private unsubscribeBridge: (() => void) | null = null;

  constructor(params: {
    bridge: YouTubePlayerSyncBridge;
    subtitleOverlay?: InPageSubtitleOverlay;
  }) {
    this.bridge = params.bridge;
    this.subtitleOverlay =
      params.subtitleOverlay ?? new InPageSubtitleOverlay();

    this.unsubscribeBridge = this.bridge.onSyncChange(() => {
      this.syncNow();
    });
  }

  public loadSegments(segments: SchedulableSegment[]): ExtensionAudioState {
    this.segments = [...segments].sort((a, b) => a.startMs - b.startMs);
    return this.syncNow();
  }

  public setPreferences(prefs: {
    dubEnabled?: boolean;
    originalAudioEnabled?: boolean;
    originalVolume?: number;
    dubVolume?: number;
    subtitleMode?: ExtensionSubtitleMode;
  }): ExtensionAudioState {
    if (prefs.dubEnabled !== undefined) {
      this.dubEnabled = prefs.dubEnabled;
    }
    if (prefs.originalAudioEnabled !== undefined) {
      this.originalAudioEnabled = prefs.originalAudioEnabled;
    }
    if (prefs.originalVolume !== undefined) {
      this.originalVolume = Math.max(0, Math.min(1, prefs.originalVolume));
    }
    if (prefs.dubVolume !== undefined) {
      this.dubVolume = Math.max(0, Math.min(1, prefs.dubVolume));
    }
    if (prefs.subtitleMode !== undefined) {
      this.subtitleMode = prefs.subtitleMode;
    }

    if (!this.dubEnabled) {
      this.isDubAudioPlaying = false;
      this.bridge.restoreOriginalVideoAudio();
    }

    return this.syncNow();
  }

  public syncNow(): ExtensionAudioState {
    const videoSnap = this.bridge.getSnapshot();
    if (!videoSnap.attached) {
      this.isDubAudioPlaying = false;
      this.subtitleOverlay.clear();
      return this.getState();
    }

    const sync = audioSegmentScheduler.resolvePlaybackStateAtTime({
      currentTimeMs: videoSnap.currentTimeMs,
      playbackSpeed: videoSnap.playbackRate,
      originalVolume: this.originalVolume,
      dubVolume: this.dubVolume,
      dubEnabled: this.dubEnabled,
      originalAudioEnabled: this.originalAudioEnabled,
      subtitleMode: this.subtitleMode,
      segments: this.segments,
    });

    this.lastSyncState = sync;

    // Apply ducked or fallback original audio volume to YouTube's <video> element
    if (this.dubEnabled) {
      this.bridge.applyEffectiveOriginalVolume(sync.effectiveOriginalVolume);
    } else {
      this.bridge.restoreOriginalVideoAudio();
    }

    // Critical invariant: if YouTube <video> is paused, seeking, or segment is failed/absent -> dub audio MUST NOT play
    if (
      !videoSnap.isPlaying ||
      !this.dubEnabled ||
      !sync.activeSegment ||
      sync.fallbackActive ||
      sync.effectiveDubVolume <= 0
    ) {
      this.isDubAudioPlaying = false;
    } else {
      this.isDubAudioPlaying = true;
    }

    this.subtitleOverlay.updateCue({
      mode: this.subtitleMode,
      speakerDisplayName: sync.activeSegment?.speakerDisplayName ?? null,
      sourceLine: sync.subtitleOverlay.sourceLine,
      targetLine: sync.subtitleOverlay.targetLine,
    });

    return this.getState();
  }

  public teardown(): void {
    this.isDubAudioPlaying = false;
    this.lastSyncState = null;
    this.subtitleOverlay.clear();
    this.bridge.detach();
  }

  public getState(): ExtensionAudioState {
    const activeSeg = this.lastSyncState?.activeSegment ?? null;
    return {
      dubEnabled: this.dubEnabled,
      originalAudioEnabled: this.originalAudioEnabled,
      originalVolume: this.originalVolume,
      dubVolume: this.dubVolume,
      subtitleMode: this.subtitleMode,
      isDubAudioPlaying: this.isDubAudioPlaying,
      activeSegmentId: activeSeg?.id ?? null,
      activeSpeakerId: activeSeg?.speakerId ?? null,
      activeVoiceId: activeSeg?.voiceId ?? null,
      effectiveDubPlaybackRate:
        this.lastSyncState?.effectiveDubPlaybackRate ?? 1.0,
      effectiveOriginalVolume:
        this.lastSyncState?.effectiveOriginalVolume ?? this.originalVolume,
      effectiveDubVolume:
        this.lastSyncState?.effectiveDubVolume ?? this.dubVolume,
      fallbackActive: this.lastSyncState?.fallbackActive ?? false,
      fallbackWarningMessage:
        this.lastSyncState?.fallbackWarningMessage ?? null,
      subtitleState: this.subtitleOverlay.getState(),
    };
  }
}
