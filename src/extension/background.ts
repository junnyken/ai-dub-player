import {
  ExtensionApiClient,
  ExtensionJobSummary,
} from "@/extension/extension-api-client";

export interface ExtensionMessage {
  type: "CHECK_VIDEO_JOB" | "TRIGGER_DUB_JOB" | "GET_JOB_PROGRESS";
  videoId?: string;
  sourceUrl?: string;
  jobId?: string;
}

export class ExtensionBackgroundRouter {
  private readonly apiClient: ExtensionApiClient;
  private readonly authHeaders?: Record<string, string>;

  constructor(
    apiClient: ExtensionApiClient,
    authHeaders?: Record<string, string>
  ) {
    this.apiClient = apiClient;
    this.authHeaders = authHeaders;
  }

  public async handleMessage(
    msg: ExtensionMessage
  ): Promise<{ ok: boolean; job?: ExtensionJobSummary | null; error?: string }> {
    try {
      if (msg.type === "CHECK_VIDEO_JOB" && msg.videoId) {
        const job = await this.apiClient.findJobByVideoId(
          msg.videoId,
          this.authHeaders
        );
        return { ok: true, job };
      }

      if (msg.type === "TRIGGER_DUB_JOB" && msg.videoId && msg.sourceUrl) {
        const job = await this.apiClient.triggerExtensionDubJob({
          videoId: msg.videoId,
          sourceUrl: msg.sourceUrl,
          headers: this.authHeaders,
        });
        return { ok: true, job };
      }

      if (msg.type === "GET_JOB_PROGRESS" && msg.jobId) {
        const job = await this.apiClient.getJobProgress(
          msg.jobId,
          this.authHeaders
        );
        return { ok: true, job };
      }

      return { ok: false, error: "Thông điệp Extension không hợp lệ." };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Lỗi xử lý Extension.",
      };
    }
  }
}
