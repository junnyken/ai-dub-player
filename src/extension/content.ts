import { YouTubePageDetector } from "@/extension/youtube-page-detector";
import { ExtensionApiClient } from "@/extension/extension-api-client";
import { InPageTriggerButton } from "@/extension/in-page-trigger-button";
import { InPageControlWidget } from "@/extension/in-page-control-widget";
import {
  YouTubePlayerSyncBridge,
  YouTubeVideoElementLike,
} from "@/extension/youtube-player-sync-bridge";
import { ExtensionAudioController } from "@/extension/extension-audio-controller";

export class YouTubeExtensionContentSession {
  public readonly detector: YouTubePageDetector;
  public readonly apiClient: ExtensionApiClient;
  public readonly triggerButton: InPageTriggerButton;
  public readonly syncBridge: YouTubePlayerSyncBridge;
  public readonly audioController: ExtensionAudioController;
  public readonly controlWidget: InPageControlWidget;

  constructor(options?: {
    baseUrl?: string;
    apiClient?: ExtensionApiClient;
    authHeaders?: Record<string, string>;
  }) {
    this.detector = new YouTubePageDetector();
    this.apiClient =
      options?.apiClient ??
      new ExtensionApiClient({ baseUrl: options?.baseUrl });
    this.triggerButton = new InPageTriggerButton({
      detector: this.detector,
      apiClient: this.apiClient,
      authHeaders: options?.authHeaders,
    });
    this.syncBridge = new YouTubePlayerSyncBridge();
    this.audioController = new ExtensionAudioController({
      bridge: this.syncBridge,
    });
    this.controlWidget = new InPageControlWidget({
      apiClient: this.apiClient,
      bridge: this.syncBridge,
      audioController: this.audioController,
      authHeaders: options?.authHeaders,
    });

    // Whenever YouTube SPA switches videoId, teardown active in-page playback cleanly
    this.detector.onVideoChange(() => {
      this.controlWidget.teardown();
    });
  }

  public async navigateToYouTubeUrl(url: string) {
    return this.triggerButton.syncWithUrl(url);
  }

  public async startDubPlaybackOnPage(
    videoElement: YouTubeVideoElementLike | null | undefined
  ) {
    const triggerState = this.triggerButton.getState();
    if (!triggerState.job?.id) {
      throw new Error("Video này chưa có bản lồng tiếng sẵn sàng.");
    }
    return this.controlWidget.activateInPageDubbing({
      jobId: triggerState.job.id,
      videoElement,
    });
  }
}
