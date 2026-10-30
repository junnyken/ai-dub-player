export type UserPlan = "free" | "pro" | "business";

export type SourceType = "youtube" | "upload";

export type ClientType = "web" | "extension";

export type TargetLanguage = "vi";

export type DubJobStatus =
  | "queued"
  | "ingesting"
  | "transcribing"
  | "diarizing"
  | "translating"
  | "casting"
  | "synthesizing"
  | "partial_ready"
  | "ready"
  | "failed"
  | "canceled";

export const ACTIVE_DUB_JOB_STATUSES: DubJobStatus[] = [
  "queued",
  "ingesting",
  "transcribing",
  "diarizing",
  "translating",
  "casting",
  "synthesizing",
];

export type MediaAssetKind =
  | "source_video"
  | "source_audio"
  | "dub_audio_segment"
  | "subtitle"
  | "thumbnail";

export type CreditReason =
  | "initial_grant"
  | "job_ingest_deduct"
  | "job_refund"
  | "topup";

export type TranscriptStatus = "processing" | "ready" | "failed";

export type TranscriptSource = "asr" | "captions";

export type TranslationStatus = "processing" | "ready" | "failed";

export type TranslationSegmentStatus = "ready" | "failed" | "edited";

export type GlossaryCategory = "proper_noun" | "term" | "pronoun_rule";

export type VoiceGenderPresentation = "female" | "male" | "neutral";

export type VoiceAssignedBy = "ai" | "user";

export type AudioSegmentStatus = "queued" | "ready" | "failed";

export type TimingStrategy =
  | "natural"
  | "slight_speedup"
  | "silence_compression"
  | "timing_conflict";

export type SubtitleTrackKind = "source" | "target" | "bilingual";

export interface AudioSegmentDomain {
  id: string;
  jobId: string;
  translationSegmentId: string;
  speakerId: string;
  voiceId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  rawDurationMs: number;
  playbackRate: number;
  storageKey: string;
  audioDataUrl?: string | null;
  status: AudioSegmentStatus;
  timingStrategy?: TimingStrategy | null;
  errorCode?: string | null;
  version: number;
}

export interface SubtitleTrackDomain {
  id: string;
  jobId: string;
  kind: SubtitleTrackKind;
  language: string;
  format: "vtt";
  storageKey: string;
  vttContent: string;
}

export interface VoiceDomain {
  id: string;
  provider: string;
  providerVoiceId: string;
  language: string;
  displayName: string;
  genderPresentation: VoiceGenderPresentation;
  ageGroup: EstimatedAgeGroup;
  styleTags: string[];
  previewUrl?: string | null;
  isActive: boolean;
}

export interface VoiceAssignmentDomain {
  id: string;
  jobId: string;
  speakerId: string;
  voiceId: string;
  assignedBy: VoiceAssignedBy;
  matchScore: number;
  matchReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoicePresetAssignmentItem {
  speakerSignature: string;
  voiceId: string;
}

export interface VoicePresetDomain {
  id: string;
  userId: string;
  name: string;
  assignments: VoicePresetAssignmentItem[];
  createdAt: Date;
}

export interface TranslationDomain {
  id: string;
  jobId: string;
  targetLanguage: TargetLanguage;
  status: TranslationStatus;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: Date;
}

export interface TranslationSegmentDomain {
  id: string;
  translationId: string;
  transcriptSegmentId: string;
  translatedText: string;
  originalTranslatedText: string;
  status: TranslationSegmentStatus;
  errorCode?: string | null;
  editedBy?: string | null;
  version: number;
  updatedAt: Date;
}

export interface GlossaryEntryDomain {
  id: string;
  jobId: string;
  userId: string;
  category: GlossaryCategory;
  sourceTerm: string;
  targetTerm: string;
  speakerId?: string | null;
  notes?: string | null;
  createdAt: Date;
}

export type EstimatedAgeGroup =
  | "child"
  | "teen"
  | "young_adult"
  | "adult"
  | "senior";

export type ApparentGender = "female" | "male" | "neutral" | "unknown";

export type SpeakerRoleHint =
  | "main_character"
  | "narrator"
  | "interviewer"
  | "background";

export const LOW_CONFIDENCE_THRESHOLD = 0.75;
export const MAX_SEGMENT_DURATION_MS = 12000;
export const MAX_SEGMENT_CHARS = 180;

export interface UserDomain {
  id: string;
  email: string;
  name: string;
  plan: UserPlan;
  creditBalance: number;
  createdAt: Date;
}

export interface DubJobDomain {
  id: string;
  userId: string;
  sourceType: SourceType;
  sourceUrl?: string | null;
  sourceVideoId?: string | null;
  sourceFileId?: string | null;
  title?: string | null;
  durationSeconds?: number | null;
  sourceLanguage?: string | null;
  targetLanguage: TargetLanguage;
  status: DubJobStatus;
  progress: number;
  currentStageMessage?: string | null;
  readyFromMs: number;
  readyToMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  creditEstimated: number;
  creditSpent: number;
  clientType: ClientType;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetDomain {
  id: string;
  jobId: string;
  kind: MediaAssetKind;
  storageKey: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface SpeakerDomain {
  id: string;
  jobId: string;
  externalSpeakerId: string;
  displayName: string;
  estimatedAgeGroup?: EstimatedAgeGroup | null;
  apparentGender?: ApparentGender | null;
  roleHint?: SpeakerRoleHint | null;
  emotionProfile?: string[];
  appearanceCount: number;
  isEstimated: boolean;
}

export interface TranscriptDomain {
  id: string;
  jobId: string;
  language: string;
  source: TranscriptSource;
  provider: string;
  status: TranscriptStatus;
  version: number;
  createdAt: Date;
}

export interface TranscriptSegmentDomain {
  id: string;
  transcriptId: string;
  speakerId: string;
  segmentIndex: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  originalSourceText: string;
  originalSpeakerId: string;
  confidence: number;
  needsReview: boolean;
  version: number;
}

export interface JobProgressEvent {
  jobId: string;
  status: DubJobStatus;
  progress: number;
  message: string;
  readyFromMs: number;
  readyToMs: number;
  errorCode?: string | null;
}

export interface PlanLimits {
  maxDurationSeconds: number;
  maxUploadBytes: number;
  monthlyCredits: number;
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    maxDurationSeconds: 15 * 60, // 15 minutes
    maxUploadBytes: 200 * 1024 * 1024, // 200 MB
    monthlyCredits: 15,
  },
  pro: {
    maxDurationSeconds: 60 * 60, // 60 minutes
    maxUploadBytes: 1024 * 1024 * 1024, // 1 GB
    monthlyCredits: 300,
  },
  business: {
    maxDurationSeconds: 180 * 60, // 180 minutes
    maxUploadBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    monthlyCredits: 1200,
  },
};

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "webm",
  "mp3",
  "wav",
  "m4a",
] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export const ALLOWED_UPLOAD_MIME_PREFIXES: Record<AllowedUploadExtension, string[]> = {
  mp4: ["video/mp4", "application/mp4"],
  mov: ["video/quicktime", "video/mov"],
  mkv: ["video/x-matroska", "video/mkv", "application/octet-stream"],
  webm: ["video/webm", "audio/webm"],
  mp3: ["audio/mpeg", "audio/mp3"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  m4a: ["audio/mp4", "audio/x-m4a", "audio/m4a"],
};

export const SOURCE_RETENTION_DAYS = 7;
