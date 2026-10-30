import { prisma } from "@/server/db/prisma";
import {
  ClientType,
  DubJobStatus,
  SourceType,
  SpeakerDomain,
  TranslationSegmentStatus,
} from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import { contextWindowBuilder } from "@/server/services/context-window-builder";
import {
  defaultTranslationProvider,
  TranslatedSegmentCandidate,
  TranslationProvider,
} from "@/server/providers/translation-provider";
import {
  GlossaryRuleInput,
  glossaryService,
} from "@/server/services/glossary-service";
import { translationConsistencyChecker } from "@/server/services/translation-consistency-checker";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { recordJobObservabilityEvent } from "@/server/observability/logger";

export interface TranslateJobOptions {
  userId?: string;
  glossaryEntries?: GlossaryRuleInput[];
}

export interface UpdateTranslationSegmentInput {
  translationId: string;
  segmentId: string;
  userId: string;
  translatedText: string;
}

export class TranslationService {
  private readonly provider: TranslationProvider;

  constructor(provider: TranslationProvider = defaultTranslationProvider) {
    this.provider = provider;
  }

  public async translateJob(jobId: string, options?: TranslateJobOptions) {
    const startedAt = Date.now();
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: {
        transcript: {
          include: {
            segments: {
              orderBy: { segmentIndex: "asc" },
              include: { speaker: true },
            },
          },
        },
        speakers: {
          orderBy: { externalSpeakerId: "asc" },
        },
      },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để dịch."
      );
    }

    if (options?.userId && job.userId !== options.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền dịch tiến trình lồng tiếng của tài khoản khác."
      );
    }

    if (!job.transcript || job.transcript.segments.length === 0) {
      throw new ValidationDomainError(
        "TRANSCRIPT_NOT_READY",
        "Transcript chưa sẵn sàng hoặc không có câu thoại nào để dịch sang tiếng Việt."
      );
    }

    if (options?.glossaryEntries) {
      await glossaryService.replaceJobGlossary({
        jobId: job.id,
        userId: job.userId,
        entries: options.glossaryEntries,
      });
    }

    const glossaryEntries = await glossaryService.getJobGlossary(job.id);

    const translatingMsg = "Đang dịch hội thoại sang tiếng Việt theo ngữ cảnh";
    await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: "translating",
        progress: 50,
        currentStageMessage: translatingMsg,
      },
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: "translating",
      progress: 50,
      message: translatingMsg,
      readyFromMs: 0,
      readyToMs: 0,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: this.provider.providerName,
      stage: "translation_start",
      durationMs: Date.now() - startedAt,
      status: "translating",
      creditSpent: job.creditSpent,
      message: translatingMsg,
    });

    const inputWindowSegments = job.transcript.segments.map((seg) => ({
      transcriptSegmentId: seg.id,
      segmentIndex: seg.segmentIndex,
      speakerId: seg.speakerId,
      speakerDisplayName: seg.speaker.displayName,
      speakerRoleHint: seg.speaker.roleHint,
      speakerApparentGender: seg.speaker.apparentGender,
      speakerAgeGroup: seg.speaker.estimatedAgeGroup,
      startMs: seg.startMs,
      endMs: seg.endMs,
      sourceText: seg.sourceText,
    }));

    const speakerDomains: SpeakerDomain[] = job.speakers.map((s) => ({
      id: s.id,
      jobId: s.jobId,
      externalSpeakerId: s.externalSpeakerId,
      displayName: s.displayName,
      estimatedAgeGroup: s.estimatedAgeGroup as SpeakerDomain["estimatedAgeGroup"],
      apparentGender: s.apparentGender as SpeakerDomain["apparentGender"],
      roleHint: s.roleHint as SpeakerDomain["roleHint"],
      emotionProfile: s.emotionProfile ? JSON.parse(s.emotionProfile) : [],
      appearanceCount: s.appearanceCount,
      isEstimated: s.isEstimated,
    }));

    const windows = contextWindowBuilder.buildWindows({
      segments: inputWindowSegments,
      speakers: speakerDomains,
      glossaryEntries,
      batchSize: 4,
      overlapSize: 2,
    });

    const allCandidates: TranslatedSegmentCandidate[] = [];
    for (const win of windows) {
      const batchOut = await this.provider.translateWindow(win);
      allCandidates.push(...batchOut.segments);
    }

    const verifiedSegments = translationConsistencyChecker.verifyAndNormalize({
      inputSegments: inputWindowSegments,
      outputCandidates: allCandidates,
    });

    const hasAnyFailedSegment = verifiedSegments.some(
      (s) => s.status === "failed"
    );
    const nextJobStatus: DubJobStatus = "casting";
    const doneMessage = hasAnyFailedSegment
      ? "Đã dịch hội thoại sang tiếng Việt (có câu cần kiểm tra lại)"
      : "Đã dịch hoàn tất hội thoại sang tiếng Việt. Sẵn sàng phân vai giọng nói";

    await prisma.$transaction(async (tx) => {
      await tx.translation.deleteMany({ where: { jobId: job.id } });

      const createdTranslation = await tx.translation.create({
        data: {
          jobId: job.id,
          targetLanguage: "vi",
          status: "ready",
          provider: this.provider.providerName,
          model: this.provider.modelName,
          promptVersion: this.provider.promptVersion,
        },
      });

      for (const seg of verifiedSegments) {
        await tx.translationSegment.create({
          data: {
            translationId: createdTranslation.id,
            transcriptSegmentId: seg.transcriptSegmentId,
            translatedText: seg.translatedText,
            originalTranslatedText: seg.translatedText,
            status: seg.status,
            errorCode: seg.errorCode ?? null,
            version: 1,
          },
        });
      }

      await tx.dubJob.update({
        where: { id: job.id },
        data: {
          status: nextJobStatus,
          progress: 60,
          currentStageMessage: doneMessage,
        },
      });
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: nextJobStatus,
      progress: 60,
      message: doneMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: this.provider.providerName,
      stage: "translation_ready",
      durationMs: Date.now() - startedAt,
      status: nextJobStatus,
      creditSpent: job.creditSpent,
      message: doneMessage,
    });

    return this.getTranslationByJobId(job.id, job.userId);
  }

  public async getTranslationByJobId(jobId: string, userId: string) {
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng này."
      );
    }

    if (job.userId !== userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền xem bản dịch của tài khoản khác."
      );
    }

    const translation = await prisma.translation.findUnique({
      where: { jobId },
      include: {
        segments: {
          include: {
            transcriptSegment: {
              include: {
                speaker: true,
              },
            },
          },
        },
      },
    });

    const glossaryEntries = await glossaryService.getJobGlossary(jobId);

    if (!translation) {
      return {
        jobId,
        jobStatus: job.status,
        translation: null,
        segments: [],
        glossaryEntries,
      };
    }

    const sortedSegments = [...translation.segments].sort(
      (a, b) =>
        a.transcriptSegment.segmentIndex - b.transcriptSegment.segmentIndex
    );

    return {
      jobId,
      jobStatus: job.status,
      translation: {
        id: translation.id,
        jobId: translation.jobId,
        targetLanguage: translation.targetLanguage,
        status: translation.status,
        provider: translation.provider,
        model: translation.model,
        promptVersion: translation.promptVersion,
        createdAt: translation.createdAt,
        updatedAt: translation.updatedAt,
      },
      segments: sortedSegments.map((seg) => ({
        id: seg.id,
        translationId: seg.translationId,
        transcriptSegmentId: seg.transcriptSegmentId,
        segmentIndex: seg.transcriptSegment.segmentIndex,
        speakerId: seg.transcriptSegment.speakerId,
        speakerDisplayName: seg.transcriptSegment.speaker.displayName,
        externalSpeakerId: seg.transcriptSegment.speaker.externalSpeakerId,
        startMs: seg.transcriptSegment.startMs,
        endMs: seg.transcriptSegment.endMs,
        sourceText: seg.transcriptSegment.sourceText,
        translatedText: seg.translatedText,
        originalTranslatedText: seg.originalTranslatedText,
        status: seg.status as TranslationSegmentStatus,
        errorCode: seg.errorCode,
        editedBy: seg.editedBy,
        version: seg.version,
        updatedAt: seg.updatedAt,
      })),
      glossaryEntries,
    };
  }

  public async updateTranslationSegment(input: UpdateTranslationSegmentInput) {
    const translation = await prisma.translation.findUnique({
      where: { id: input.translationId },
      include: { job: true },
    });

    if (!translation) {
      throw new DomainError(
        404,
        "TRANSLATION_NOT_FOUND",
        "Không tìm thấy bản dịch cần chỉnh sửa."
      );
    }

    if (translation.job.userId !== input.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_TRANSLATION_EDIT",
        "Bạn không có quyền chỉnh sửa bản dịch của tiến trình này."
      );
    }

    const segment = await prisma.translationSegment.findUnique({
      where: { id: input.segmentId },
      include: {
        transcriptSegment: {
          include: { speaker: true },
        },
      },
    });

    if (!segment || segment.translationId !== translation.id) {
      throw new DomainError(
        404,
        "TRANSLATION_SEGMENT_NOT_FOUND",
        "Không tìm thấy câu dịch cần chỉnh sửa."
      );
    }

    const cleanedText = (input.translatedText || "").trim();
    if (!cleanedText) {
      throw new ValidationDomainError(
        "EMPTY_TRANSLATED_TEXT",
        "Nội dung bản dịch tiếng Việt không được để trống."
      );
    }

    const updated = await prisma.translationSegment.update({
      where: { id: segment.id },
      data: {
        translatedText: cleanedText,
        status: "edited",
        errorCode: null,
        editedBy: input.userId,
        version: { increment: 1 },
      },
      include: {
        transcriptSegment: {
          include: { speaker: true },
        },
      },
    });

    return {
      id: updated.id,
      translationId: updated.translationId,
      transcriptSegmentId: updated.transcriptSegmentId,
      segmentIndex: updated.transcriptSegment.segmentIndex,
      speakerId: updated.transcriptSegment.speakerId,
      speakerDisplayName: updated.transcriptSegment.speaker.displayName,
      externalSpeakerId: updated.transcriptSegment.speaker.externalSpeakerId,
      startMs: updated.transcriptSegment.startMs,
      endMs: updated.transcriptSegment.endMs,
      sourceText: updated.transcriptSegment.sourceText,
      translatedText: updated.translatedText,
      originalTranslatedText: updated.originalTranslatedText,
      status: updated.status as TranslationSegmentStatus,
      errorCode: updated.errorCode,
      editedBy: updated.editedBy,
      version: updated.version,
      updatedAt: updated.updatedAt,
    };
  }
}

export const translationService = new TranslationService();
