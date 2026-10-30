export interface YouTubeDetectionResult {
  isWatchPage: boolean;
  videoId: string | null;
  normalizedWatchUrl: string | null;
}

export type VideoChangeListener = (result: YouTubeDetectionResult) => void;

export class YouTubePageDetector {
  private currentVideoId: string | null = null;
  private listeners: VideoChangeListener[] = [];

  public detectFromUrl(rawUrl: string): YouTubeDetectionResult {
    try {
      const parsed = new URL(rawUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isYouTubeDomain =
        hostname === "www.youtube.com" ||
        hostname === "youtube.com" ||
        hostname === "m.youtube.com";

      if (!isYouTubeDomain || parsed.pathname !== "/watch") {
        return {
          isWatchPage: false,
          videoId: null,
          normalizedWatchUrl: null,
        };
      }

      const vParam = parsed.searchParams.get("v")?.trim() ?? "";
      if (!/^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return {
          isWatchPage: false,
          videoId: null,
          normalizedWatchUrl: null,
        };
      }

      return {
        isWatchPage: true,
        videoId: vParam,
        normalizedWatchUrl: `https://www.youtube.com/watch?v=${vParam}`,
      };
    } catch {
      return {
        isWatchPage: false,
        videoId: null,
        normalizedWatchUrl: null,
      };
    }
  }

  public onVideoChange(listener: VideoChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public handleUrlNavigation(nextUrl: string): YouTubeDetectionResult {
    const result = this.detectFromUrl(nextUrl);
    if (result.videoId !== this.currentVideoId) {
      this.currentVideoId = result.videoId;
      for (const listener of this.listeners) {
        listener(result);
      }
    }
    return result;
  }

  public getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }
}

export const youTubePageDetector = new YouTubePageDetector();
