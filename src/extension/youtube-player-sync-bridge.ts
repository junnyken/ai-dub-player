export type YouTubeVideoEventName =
  | "play"
  | "pause"
  | "seeking"
  | "seeked"
  | "ratechange"
  | "timeupdate";

export interface YouTubeVideoElementLike {
  currentTime: number; // in seconds
  paused: boolean;
  seeking?: boolean;
  playbackRate: number;
  volume: number; // 0.0 - 1.0
  muted: boolean;
  addEventListener?: (
    type: YouTubeVideoEventName,
    listener: () => void
  ) => void;
  removeEventListener?: (
    type: YouTubeVideoEventName,
    listener: () => void
  ) => void;
}

export interface VideoSyncSnapshot {
  attached: boolean;
  degradedFallback: boolean;
  fallbackMessage: string | null;
  currentTimeMs: number;
  isPlaying: boolean;
  playbackRate: number;
  originalVolumeRestored: boolean;
}

export class YouTubePlayerSyncBridge {
  private videoEl: YouTubeVideoElementLike | null = null;
  private initialVolume = 1.0;
  private initialMuted = false;
  private boundListeners: Array<{
    type: YouTubeVideoEventName;
    fn: () => void;
  }> = [];
  private subscribers: Array<(snapshot: VideoSyncSnapshot) => void> = [];

  public attach(
    videoElement: YouTubeVideoElementLike | null | undefined
  ): VideoSyncSnapshot {
    this.detach();

    if (!videoElement) {
      const degraded: VideoSyncSnapshot = {
        attached: false,
        degradedFallback: true,
        fallbackMessage:
          "Không tìm thấy trình phát video gốc trên trang YouTube — Vui lòng bấm 'Mở trong Web Player' để xem bản lồng tiếng.",
        currentTimeMs: 0,
        isPlaying: false,
        playbackRate: 1.0,
        originalVolumeRestored: true,
      };
      this.notifySubscribers(degraded);
      return degraded;
    }

    this.videoEl = videoElement;
    this.initialVolume = videoElement.volume;
    this.initialMuted = videoElement.muted;

    const events: YouTubeVideoEventName[] = [
      "play",
      "pause",
      "seeking",
      "seeked",
      "ratechange",
      "timeupdate",
    ];

    for (const evt of events) {
      const fn = () => {
        this.notifySubscribers(this.getSnapshot());
      };
      this.boundListeners.push({ type: evt, fn });
      videoElement.addEventListener?.(evt, fn);
    }

    const snap = this.getSnapshot();
    this.notifySubscribers(snap);
    return snap;
  }

  public detach(): VideoSyncSnapshot {
    if (this.videoEl) {
      for (const item of this.boundListeners) {
        this.videoEl.removeEventListener?.(item.type, item.fn);
      }
      // Restore original YouTube video volume & mute state cleanly
      this.videoEl.volume = this.initialVolume;
      this.videoEl.muted = this.initialMuted;
    }
    this.boundListeners = [];
    this.videoEl = null;

    const snap: VideoSyncSnapshot = {
      attached: false,
      degradedFallback: false,
      fallbackMessage: null,
      currentTimeMs: 0,
      isPlaying: false,
      playbackRate: 1.0,
      originalVolumeRestored: true,
    };
    return snap;
  }

  public applyEffectiveOriginalVolume(effectiveVolume: number) {
    if (!this.videoEl) return;
    const clamped = Math.max(0, Math.min(1, effectiveVolume));
    this.videoEl.volume = clamped;
    this.videoEl.muted = clamped === 0;
  }

  public restoreOriginalVideoAudio() {
    if (!this.videoEl) return;
    this.videoEl.volume = this.initialVolume;
    this.videoEl.muted = this.initialMuted;
  }

  public getSnapshot(): VideoSyncSnapshot {
    if (!this.videoEl) {
      return {
        attached: false,
        degradedFallback: true,
        fallbackMessage:
          "Trình phát YouTube chưa gắn kết — Hãy sử dụng nút 'Mở trong Web Player'.",
        currentTimeMs: 0,
        isPlaying: false,
        playbackRate: 1.0,
        originalVolumeRestored: true,
      };
    }

    const isPlaying = !this.videoEl.paused && !this.videoEl.seeking;
    return {
      attached: true,
      degradedFallback: false,
      fallbackMessage: null,
      currentTimeMs: Math.max(0, Math.round(this.videoEl.currentTime * 1000)),
      isPlaying,
      playbackRate: this.videoEl.playbackRate || 1.0,
      originalVolumeRestored:
        this.videoEl.volume === this.initialVolume &&
        this.videoEl.muted === this.initialMuted,
    };
  }

  public onSyncChange(cb: (snapshot: VideoSyncSnapshot) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  public emitVideoEvent(event?: YouTubeVideoEventName): VideoSyncSnapshot {
    const snap = this.getSnapshot();
    this.notifySubscribers(snap);
    return snap;
  }

  private notifySubscribers(snapshot: VideoSyncSnapshot) {
    for (const sub of this.subscribers) {
      sub(snapshot);
    }
  }
}
