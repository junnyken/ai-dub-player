import {
  ExtensionApiClient,
  ExtensionJobSummary,
} from "@/extension/extension-api-client";
import { YouTubePageDetector } from "@/extension/youtube-page-detector";

export type TriggerButtonPhase =
  | "hidden"
  | "idle"
  | "submitting"
  | "processing"
  | "ready"
  | "error";

export interface TriggerButtonViewState {
  phase: TriggerButtonPhase;
  videoId: string | null;
  sourceUrl: string | null;
  buttonLabel: string;
  subLabel: string | null;
  job: ExtensionJobSummary | null;
  webPlayerUrl: string | null;
  errorMessage: string | null;
}

export class InPageTriggerButton {
  public static readonly BUTTON_DOM_ID = "ai-dub-player-yt-trigger-btn";

  private readonly detector: YouTubePageDetector;
  private readonly apiClient: ExtensionApiClient;
  private readonly authHeaders?: Record<string, string>;
  private pendingClickPromise: Promise<TriggerButtonViewState> | null = null;
  private state: TriggerButtonViewState = {
    phase: "hidden",
    videoId: null,
    sourceUrl: null,
    buttonLabel: "Lồng tiếng Việt bằng AI",
    subLabel: null,
    job: null,
    webPlayerUrl: null,
    errorMessage: null,
  };

  // Virtual DOM registry to guarantee zero duplicate buttons per container
  private mountedElementsByContainer = new WeakMap<
    object,
    { id: string; textContent: string; dataset: Record<string, string> }
  >();

  constructor(params: {
    detector: YouTubePageDetector;
    apiClient: ExtensionApiClient;
    authHeaders?: Record<string, string>;
  }) {
    this.detector = params.detector;
    this.apiClient = params.apiClient;
    this.authHeaders = params.authHeaders;
  }

  public getState(): TriggerButtonViewState {
    return { ...this.state };
  }

  public async syncWithUrl(url: string): Promise<TriggerButtonViewState> {
    const detection = this.detector.handleUrlNavigation(url);

    if (!detection.isWatchPage || !detection.videoId || !detection.normalizedWatchUrl) {
      this.state = {
        phase: "hidden",
        videoId: null,
        sourceUrl: null,
        buttonLabel: "Lồng tiếng Việt bằng AI",
        subLabel: null,
        job: null,
        webPlayerUrl: null,
        errorMessage: null,
      };
      return this.getState();
    }

    // Reset state cleanly for the new videoId (prevents stale state across YouTube SPA navigation)
    this.state = {
      phase: "idle",
      videoId: detection.videoId,
      sourceUrl: detection.normalizedWatchUrl,
      buttonLabel: "Lồng tiếng Việt bằng AI",
      subLabel: "Giọng AI theo từng nhân vật",
      job: null,
      webPlayerUrl: null,
      errorMessage: null,
    };

    const existingJob = await this.apiClient.findJobByVideoId(
      detection.videoId,
      this.authHeaders
    );

    // Ensure user hasn't navigated away while awaiting
    if (this.detector.getCurrentVideoId() !== detection.videoId) {
      return this.getState();
    }

    if (existingJob) {
      this.applyJobToState(existingJob);
    }

    return this.getState();
  }

  public async clickTrigger(): Promise<TriggerButtonViewState> {
    if (!this.state.videoId || !this.state.sourceUrl) {
      return this.getState();
    }

    if (this.pendingClickPromise) {
      return this.pendingClickPromise;
    }

    const activeVideoId = this.state.videoId;
    const activeUrl = this.state.sourceUrl;

    this.state = {
      ...this.state,
      phase: "submitting",
      buttonLabel: "Đang khởi tạo lồng tiếng...",
      errorMessage: null,
    };

    this.pendingClickPromise = (async () => {
      try {
        const job = await this.apiClient.triggerExtensionDubJob({
          videoId: activeVideoId,
          sourceUrl: activeUrl,
          headers: this.authHeaders,
        });

        if (this.state.videoId === activeVideoId) {
          this.applyJobToState(job);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Không thể khởi tạo tiến trình lồng tiếng.";
        if (this.state.videoId === activeVideoId) {
          this.state = {
            ...this.state,
            phase: "error",
            buttonLabel: "Thử lại lồng tiếng Việt",
            errorMessage: msg,
          };
        }
      } finally {
        this.pendingClickPromise = null;
      }

      return this.getState();
    })();

    return this.pendingClickPromise;
  }

  public async refreshJobProgress(): Promise<TriggerButtonViewState> {
    if (!this.state.job) {
      return this.getState();
    }
    const targetJobId = this.state.job.id;
    const targetVideoId = this.state.videoId;
    const updated = await this.apiClient.getJobProgress(
      targetJobId,
      this.authHeaders
    );
    if (this.state.videoId === targetVideoId) {
      this.applyJobToState(updated);
    }
    return this.getState();
  }

  public mountOrUpdateIntoContainer(container: {
    children?: Array<{ id?: string; textContent?: string; dataset?: Record<string, string> }>;
  }): {
    buttonCount: number;
    buttonElement: {
      id: string;
      textContent: string;
      dataset: Record<string, string>;
    };
  } {
    let existing = this.mountedElementsByContainer.get(container);
    if (!existing) {
      existing = {
        id: InPageTriggerButton.BUTTON_DOM_ID,
        textContent: this.state.buttonLabel,
        dataset: {
          phase: this.state.phase,
          videoId: this.state.videoId ?? "",
          jobId: this.state.job?.id ?? "",
        },
      };
      this.mountedElementsByContainer.set(container, existing);
      if (Array.isArray(container.children)) {
        const filtered = container.children.filter(
          (c) => c.id !== InPageTriggerButton.BUTTON_DOM_ID
        );
        filtered.push(existing);
        container.children = filtered;
      }
    } else {
      existing.textContent = this.state.buttonLabel;
      existing.dataset = {
        phase: this.state.phase,
        videoId: this.state.videoId ?? "",
        jobId: this.state.job?.id ?? "",
      };
    }

    const buttonCount = Array.isArray(container.children)
      ? container.children.filter(
          (c) => c.id === InPageTriggerButton.BUTTON_DOM_ID
        ).length
      : 1;

    return {
      buttonCount,
      buttonElement: existing,
    };
  }

  private applyJobToState(job: ExtensionJobSummary) {
    const webUrl = this.apiClient.getWebPlayerUrl(job.id);
    if (job.status === "ready" || job.status === "partial_ready") {
      this.state = {
        ...this.state,
        phase: "ready",
        job,
        webPlayerUrl: webUrl,
        buttonLabel: "Phát bằng tiếng Việt (AI)",
        subLabel: `Đã sẵn sàng (${job.progress}%) · Mở trong Web Player`,
        errorMessage: null,
      };
      return;
    }

    if (job.status === "failed") {
      this.state = {
        ...this.state,
        phase: "error",
        job,
        webPlayerUrl: webUrl,
        buttonLabel: "Thử lại lồng tiếng Việt",
        subLabel: "Có lỗi xử lý — Mở trong Web Player để kiểm tra",
        errorMessage: job.message ?? "Tiến trình gặp sự cố.",
      };
      return;
    }

    this.state = {
      ...this.state,
      phase: "processing",
      job,
      webPlayerUrl: webUrl,
      buttonLabel: `Đang lồng tiếng Việt (${job.progress}%)`,
      subLabel: job.message ?? "Đang xử lý giọng đọc nhân vật...",
      errorMessage: null,
    };
  }
}
