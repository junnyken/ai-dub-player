import { ExtensionApiClient } from "@/extension/extension-api-client";
import { YouTubePageDetector } from "@/extension/youtube-page-detector";

export class ExtensionPopupController {
  private readonly detector: YouTubePageDetector;
  private readonly apiClient: ExtensionApiClient;
  private readonly authHeaders?: Record<string, string>;

  constructor(params: {
    detector: YouTubePageDetector;
    apiClient: ExtensionApiClient;
    authHeaders?: Record<string, string>;
  }) {
    this.detector = params.detector;
    this.apiClient = params.apiClient;
    this.authHeaders = params.authHeaders;
  }

  public async inspectActiveTab(tabUrl: string) {
    const detection = this.detector.detectFromUrl(tabUrl);
    if (!detection.isWatchPage || !detection.videoId || !detection.normalizedWatchUrl) {
      return {
        canDub: false,
        videoId: null,
        statusMessage:
          "Hãy mở một trang xem video YouTube (youtube.com/watch?v=...) để sử dụng AI Dub Player.",
        existingJob: null,
        webPlayerUrl: null,
      };
    }

    const existingJob = await this.apiClient.findJobByVideoId(
      detection.videoId,
      this.authHeaders
    );

    return {
      canDub: true,
      videoId: detection.videoId,
      sourceUrl: detection.normalizedWatchUrl,
      statusMessage: existingJob
        ? `Trạng thái: ${existingJob.status} (${existingJob.progress}%)`
        : "Sẵn sàng tạo bản lồng tiếng Việt AI cho video này.",
      existingJob,
      webPlayerUrl: existingJob
        ? this.apiClient.getWebPlayerUrl(existingJob.id)
        : null,
    };
  }
}
