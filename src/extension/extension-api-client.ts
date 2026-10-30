import { DubJobStatus } from "@/domain/models";
import { SchedulableSegment } from "@/server/services/audio-mixer";

export interface ExtensionPlaybackManifest {
  jobId: string;
  title?: string | null;
  durationSeconds?: number | null;
  status: DubJobStatus;
  readyFromMs: number;
  readyToMs: number;
  audioSegments: Array<
    SchedulableSegment & {
      version?: number;
      voiceDisplayName?: string;
    }
  >;
  subtitles: {
    sourceVtt: string;
    targetVtt: string;
    bilingualVtt: string;
  };
}

export interface ExtensionSpeakerItem {
  id: string;
  displayName: string;
  estimatedLabelVi?: string;
  voiceAssignment?: {
    voiceId: string;
    assignedBy: "ai" | "user";
    voice?: {
      id: string;
      displayName: string;
    };
  } | null;
}

export interface ExtensionJobSummary {
  id: string;
  sourceVideoId?: string | null;
  title?: string | null;
  durationSeconds?: number | null;
  status: DubJobStatus;
  progress: number;
  message?: string;
  creditEstimated: number;
  creditSpent?: number;
  readyFromMs?: number;
  readyToMs?: number;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export class ExtensionApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly inFlightTriggers = new Map<
    string,
    Promise<ExtensionJobSummary>
  >();

  constructor(options?: { baseUrl?: string; fetchImpl?: FetchLike }) {
    this.baseUrl = (options?.baseUrl ?? "http://localhost:3000").replace(
      /\/+$/,
      ""
    );
    this.fetchImpl = options?.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  public getWebPlayerUrl(jobId: string): string {
    return `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`;
  }

  public async findJobByVideoId(
    videoId: string,
    headers?: Record<string, string>
  ): Promise<ExtensionJobSummary | null> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/dub-jobs/by-video?videoId=${encodeURIComponent(
        videoId
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      }
    );

    if (!res.ok) {
      return null;
    }

    const body = await res.json();
    return body.job ?? null;
  }

  public async triggerExtensionDubJob(params: {
    videoId: string;
    sourceUrl: string;
    headers?: Record<string, string>;
  }): Promise<ExtensionJobSummary> {
    // Prevent duplicate rapid clicks on the same videoId in the extension
    const existingLock = this.inFlightTriggers.get(params.videoId);
    if (existingLock) {
      return existingLock;
    }

    const task = (async () => {
      try {
        // First check if a non-canceled job already exists for this videoId
        const existing = await this.findJobByVideoId(
          params.videoId,
          params.headers
        );
        if (existing && existing.status !== "failed") {
          return existing;
        }

        const res = await this.fetchImpl(`${this.baseUrl}/api/dub-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...params.headers,
          },
          body: JSON.stringify({
            sourceType: "youtube",
            sourceUrl: params.sourceUrl,
            targetLanguage: "vi",
            clientType: "extension",
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          // If 409 duplicate active job, fetch the existing job cleanly
          if (res.status === 409 && data.existingJobId) {
            return this.getJobProgress(data.existingJobId, params.headers);
          }
          const err = new Error(
            data.message || "Không thể khởi tạo tiến trình lồng tiếng từ Extension."
          ) as Error & { errorCode?: string; status?: number };
          err.errorCode = data.errorCode;
          err.status = res.status;
          throw err;
        }

        return {
          id: data.id,
          sourceVideoId: params.videoId,
          title: data.title,
          durationSeconds: data.durationSeconds,
          status: data.status as DubJobStatus,
          progress: data.progress ?? 0,
          message: "Đã khởi tạo lồng tiếng từ YouTube Extension",
          creditEstimated: data.creditEstimated,
        };
      } finally {
        this.inFlightTriggers.delete(params.videoId);
      }
    })();

    this.inFlightTriggers.set(params.videoId, task);
    return task;
  }

  public async getJobProgress(
    jobId: string,
    headers?: Record<string, string>
  ): Promise<ExtensionJobSummary> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/dub-jobs/${encodeURIComponent(jobId)}/progress`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Không thể tải tiến độ lồng tiếng.");
    }

    return {
      id: data.jobId,
      title: data.title,
      durationSeconds: data.durationSeconds,
      status: data.status as DubJobStatus,
      progress: data.progress,
      message: data.message,
      creditEstimated: data.creditEstimated ?? 0,
      creditSpent: data.creditSpent ?? 0,
      readyFromMs: data.readyFromMs,
      readyToMs: data.readyToMs,
    };
  }

  public async getPlaybackManifest(
    jobId: string,
    headers?: Record<string, string>
  ): Promise<ExtensionPlaybackManifest> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/dub-jobs/${encodeURIComponent(jobId)}/playback`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.message || "Không thể tải Playback Manifest cho trình phát YouTube."
      );
    }

    return data as ExtensionPlaybackManifest;
  }

  public async getJobSpeakers(
    jobId: string,
    headers?: Record<string, string>
  ): Promise<ExtensionSpeakerItem[]> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/dub-jobs/${encodeURIComponent(jobId)}/speakers`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Không thể tải danh sách nhân vật.");
    }

    return (data.speakers ?? []) as ExtensionSpeakerItem[];
  }

  public async changeSpeakerVoice(params: {
    speakerId: string;
    voiceId: string;
    headers?: Record<string, string>;
  }): Promise<ExtensionSpeakerItem> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/speakers/${encodeURIComponent(
        params.speakerId
      )}/voice`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...params.headers,
        },
        body: JSON.stringify({ voiceId: params.voiceId }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Không thể đổi giọng nhân vật.");
    }

    return data as ExtensionSpeakerItem;
  }
}
