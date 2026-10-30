import {
  ExtensionApiClient,
  ExtensionPlaybackManifest,
  ExtensionSpeakerItem,
} from "@/extension/extension-api-client";
import {
  YouTubePlayerSyncBridge,
  YouTubeVideoElementLike,
} from "@/extension/youtube-player-sync-bridge";
import {
  ExtensionAudioController,
  ExtensionAudioState,
} from "@/extension/extension-audio-controller";
import { ExtensionSubtitleMode } from "@/extension/in-page-subtitle-overlay";

export interface InPageWidgetState {
  jobId: string | null;
  manifest: ExtensionPlaybackManifest | null;
  speakers: ExtensionSpeakerItem[];
  degradedFallback: boolean;
  fallbackMessage: string | null;
  webPlayerUrl: string | null;
  audioState: ExtensionAudioState;
}

export class InPageControlWidget {
  private readonly apiClient: ExtensionApiClient;
  private readonly bridge: YouTubePlayerSyncBridge;
  private readonly audioController: ExtensionAudioController;
  private readonly authHeaders?: Record<string, string>;

  private jobId: string | null = null;
  private manifest: ExtensionPlaybackManifest | null = null;
  private speakers: ExtensionSpeakerItem[] = [];

  constructor(params: {
    apiClient: ExtensionApiClient;
    bridge?: YouTubePlayerSyncBridge;
    audioController?: ExtensionAudioController;
    authHeaders?: Record<string, string>;
  }) {
    this.apiClient = params.apiClient;
    this.bridge = params.bridge ?? new YouTubePlayerSyncBridge();
    this.audioController =
      params.audioController ??
      new ExtensionAudioController({ bridge: this.bridge });
    this.authHeaders = params.authHeaders;
  }

  public async activateInPageDubbing(params: {
    jobId: string;
    videoElement: YouTubeVideoElementLike | null | undefined;
  }): Promise<InPageWidgetState> {
    this.jobId = params.jobId;
    const snap = this.bridge.attach(params.videoElement);

    const [manifest, speakers] = await Promise.all([
      this.apiClient.getPlaybackManifest(params.jobId, this.authHeaders),
      this.apiClient.getJobSpeakers(params.jobId, this.authHeaders),
    ]);

    this.manifest = manifest;
    this.speakers = speakers;

    if (snap.attached) {
      this.audioController.loadSegments(manifest.audioSegments);
    }

    return this.getState();
  }

  public async changeCharacterVoiceInPage(params: {
    speakerId: string;
    voiceId: string;
  }): Promise<InPageWidgetState> {
    if (!this.jobId) {
      throw new Error("Chưa kích hoạt tiến trình lồng tiếng trên trang YouTube.");
    }

    await this.apiClient.changeSpeakerVoice({
      speakerId: params.speakerId,
      voiceId: params.voiceId,
      headers: this.authHeaders,
    });

    // Reload playback manifest & speakers (backend re-synthesized ONLY that speaker's segments)
    const [freshManifest, freshSpeakers] = await Promise.all([
      this.apiClient.getPlaybackManifest(this.jobId, this.authHeaders),
      this.apiClient.getJobSpeakers(this.jobId, this.authHeaders),
    ]);

    this.manifest = freshManifest;
    this.speakers = freshSpeakers;
    this.audioController.loadSegments(freshManifest.audioSegments);

    return this.getState();
  }

  public updatePlaybackControls(prefs: {
    dubEnabled?: boolean;
    originalAudioEnabled?: boolean;
    originalVolume?: number;
    dubVolume?: number;
    subtitleMode?: ExtensionSubtitleMode;
  }): InPageWidgetState {
    this.audioController.setPreferences(prefs);
    return this.getState();
  }

  public teardown(): void {
    this.audioController.teardown();
    this.jobId = null;
    this.manifest = null;
    this.speakers = [];
  }

  public getState(): InPageWidgetState {
    const snap = this.bridge.getSnapshot();
    return {
      jobId: this.jobId,
      manifest: this.manifest,
      speakers: [...this.speakers],
      degradedFallback: snap.degradedFallback,
      fallbackMessage: snap.fallbackMessage,
      webPlayerUrl: this.jobId
        ? this.apiClient.getWebPlayerUrl(this.jobId)
        : null,
      audioState: this.audioController.getState(),
    };
  }
}
