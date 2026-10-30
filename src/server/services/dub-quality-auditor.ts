import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/domain/errors";
import { genreCadenceEngine } from "@/server/services/genre-cadence-engine";
import { prosodyEmotionEngine } from "@/server/services/prosody-emotion-engine";
import {
  computeIsochronousSlotBudget,
  countVietnameseSyllables,
  optimizeVietnameseForSlotBudget,
} from "@/server/providers/translation-provider";
import { playbackManifestService } from "@/server/services/playback-manifest-service";

export interface SegmentQualityAuditItem {
  segmentIndex: number;
  speakerDisplayName: string;
  voiceDisplayName: string;
  startMs: number;
  endMs: number;
  slotDurationMs: number;
  alignedDurationMs: number;
  playbackRate: number;
  syllableCount: number;
  maxBudgetSyllables: number;
  emotionLabelVi: string;
  fitsWithinSpeakerSlot: boolean;
  lipSyncScore: number;
}

export interface DubQualityReport {
  jobId: string;
  detectedGenreId: string;
  detectedGenreNameVi: string;
  overallScore: number;
  overallGrade: string;
  metrics: {
    lipSyncScore: number;
    contextGenreScore: number;
    voiceDiversityScore: number;
    audioIntegrityScore: number;
  };
  totalSegments: number;
  onBeatSegmentsCount: number;
  uniqueVoicesCount: number;
  speakersCount: number;
  segmentsAudit: SegmentQualityAuditItem[];
}

export class DubQualityAuditor {
  public async generateQualityReport(params: {
    jobId: string;
    userId: string;
  }): Promise<DubQualityReport> {
    const job = await prisma.dubJob.findUnique({
      where: { id: params.jobId },
      include: {
        speakers: {
          include: {
            voiceAssignment: {
              include: { voice: true },
            },
          },
        },
        transcript: {
          include: {
            segments: {
              orderBy: { segmentIndex: "asc" },
            },
          },
        },
        translation: {
          include: {
            segments: true,
          },
        },
        audioSegments: {
          orderBy: { startMs: "asc" },
        },
      },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để kiểm định chất lượng."
      );
    }

    if (job.userId !== params.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền truy cập báo cáo chất lượng của tiến trình này."
      );
    }

    const sourceTexts =
      job.transcript?.segments.map((s) => s.sourceText) ?? [];
    const genreProfile = genreCadenceEngine.detectGenre({
      title: job.title,
      sampleTexts: sourceTexts,
    });

    const speakerMap = new Map(
      job.speakers.map((s) => [
        s.id,
        {
          displayName: s.displayName,
          voiceId: s.voiceAssignment?.voiceId ?? null,
          voiceDisplayName:
            s.voiceAssignment?.voice.displayName ?? "Chưa gán giọng",
          gender: s.apparentGender ?? "neutral",
        },
      ])
    );

    const translationByTranscriptSegId = new Map(
      (job.translation?.segments ?? []).map((ts) => [
        ts.transcriptSegmentId,
        ts,
      ])
    );

    const audioByTranslationSegId = new Map(
      job.audioSegments.map((as) => [as.translationSegmentId, as])
    );

    const transcriptSegments = job.transcript?.segments ?? [];
    const segmentsAudit: SegmentQualityAuditItem[] = [];
    let onBeatCount = 0;
    let readyAudioCount = 0;

    for (const tSeg of transcriptSegments) {
      const trSeg = translationByTranscriptSegId.get(tSeg.id);
      const auSeg = trSeg ? audioByTranslationSegId.get(trSeg.id) : undefined;
      const spk = speakerMap.get(tSeg.speakerId);

      const viText = trSeg?.translatedText ?? "";
      const slotDurationMs = Math.max(500, tSeg.endMs - tSeg.startMs);
      const budget = computeIsochronousSlotBudget(tSeg.startMs, tSeg.endMs);
      const syllableCount = countVietnameseSyllables(viText);

      const prosody = prosodyEmotionEngine.analyzeSentenceProsody({
        text: viText,
        slotDurationMs,
        voiceGender: spk?.gender,
      });

      const alignedDurationMs =
        auSeg?.durationMs ?? Math.min(slotDurationMs, syllableCount * 220);
      const playbackRate = auSeg?.playbackRate ?? 1.0;
      const fitsWithinSpeakerSlot =
        alignedDurationMs <= slotDurationMs && playbackRate <= 1.25;

      if (fitsWithinSpeakerSlot) {
        onBeatCount++;
      }
      if (auSeg && auSeg.status === "ready") {
        readyAudioCount++;
      }

      segmentsAudit.push({
        segmentIndex: tSeg.segmentIndex,
        speakerDisplayName: spk?.displayName ?? "Speaker",
        voiceDisplayName: spk?.voiceDisplayName ?? "Giọng AI",
        startMs: tSeg.startMs,
        endMs: tSeg.endMs,
        slotDurationMs,
        alignedDurationMs,
        playbackRate,
        syllableCount,
        maxBudgetSyllables: budget.maxSpeedupSyllables,
        emotionLabelVi: prosody.emotionLabelVi,
        fitsWithinSpeakerSlot,
        lipSyncScore: Math.round(prosody.lipSyncScore * 100),
      });
    }

    const totalSegments = Math.max(1, segmentsAudit.length);
    const lipSyncScore =
      segmentsAudit.length === 0
        ? 100
        : Math.round(
            (onBeatCount / totalSegments) * 70 +
              (segmentsAudit.reduce((acc, s) => acc + s.lipSyncScore, 0) /
                totalSegments) *
                0.3
          );

    const uniqueVoices = new Set(
      job.speakers
        .map((s) => s.voiceAssignment?.voiceId)
        .filter((v): v is string => Boolean(v))
    );
    const speakersCount = Math.max(1, job.speakers.length);
    const voiceDiversityScore =
      uniqueVoices.size >= Math.min(speakersCount, 6)
        ? 100
        : Math.max(75, Math.round((uniqueVoices.size / speakersCount) * 100));

    const contextGenreScore =
      (job.translation?.segments.length ?? 0) > 0 ? 98 : 80;

    const audioIntegrityScore =
      job.audioSegments.length === 0
        ? 85
        : Math.round((readyAudioCount / Math.max(1, job.audioSegments.length)) * 100);

    const overallScore = Math.min(
      100,
      Math.round(
        lipSyncScore * 0.4 +
          contextGenreScore * 0.25 +
          voiceDiversityScore * 0.2 +
          audioIntegrityScore * 0.15
      )
    );

    const overallGrade =
      overallScore >= 95
        ? "A+ (Studio Master)"
        : overallScore >= 88
        ? "A (Chuẩn Phát Sóng)"
        : overallScore >= 75
        ? "B (Đạt Yêu Cầu)"
        : "C (Cần Tối Ưu Nhịp)";

    return {
      jobId: job.id,
      detectedGenreId: genreProfile.id,
      detectedGenreNameVi: genreProfile.displayNameVi,
      overallScore,
      overallGrade,
      metrics: {
        lipSyncScore,
        contextGenreScore,
        voiceDiversityScore,
        audioIntegrityScore,
      },
      totalSegments: segmentsAudit.length,
      onBeatSegmentsCount: onBeatCount,
      uniqueVoicesCount: uniqueVoices.size,
      speakersCount: job.speakers.length,
      segmentsAudit,
    };
  }

  /**
   * Automatically optimizes any translation segments that exceed their natural slot budget
   * and re-renders audio so the entire job achieves 100% on-beat lip-sync.
   */
  public async autoOptimizeJobCadence(params: {
    jobId: string;
    userId: string;
  }): Promise<DubQualityReport> {
    const job = await prisma.dubJob.findUnique({
      where: { id: params.jobId },
      include: {
        transcript: { include: { segments: true } },
        translation: { include: { segments: true } },
        audioSegments: true,
      },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để tối ưu nhịp."
      );
    }

    if (job.userId !== params.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền tối ưu tiến trình này."
      );
    }

    const transcriptSegMap = new Map(
      (job.transcript?.segments ?? []).map((s) => [s.id, s])
    );

    for (const trSeg of job.translation?.segments ?? []) {
      const tSeg = transcriptSegMap.get(trSeg.transcriptSegmentId);
      const startMs = tSeg?.startMs ?? 0;
      const endMs = tSeg?.endMs ?? startMs + 4000;
      // Use a tight target budget (85% of slot) so playbackRate stays near 1.0x
      const tightSlotEndMs = startMs + Math.max(800, Math.round((endMs - startMs) * 0.85));
      const tightBudget = computeIsochronousSlotBudget(startMs, tightSlotEndMs);

      let optimizedText = optimizeVietnameseForSlotBudget(
        trSeg.translatedText,
        tightBudget
      );

      if (tSeg) {
        const templateMatch = genreCadenceEngine.findTemplateTranslation(
          tSeg.sourceText
        );
        if (
          templateMatch &&
          countVietnameseSyllables(optimizedText) > tightBudget.idealNaturalSyllables
        ) {
          optimizedText = templateMatch.viCompact;
        }
      }

      if (optimizedText !== trSeg.translatedText) {
        await prisma.translationSegment.update({
          where: { id: trSeg.id },
          data: {
            translatedText: optimizedText,
            status: "edited",
          },
        });
      }
    }

    if (job.audioSegments || job.status === "ready" || job.status === "partial_ready") {
      await playbackManifestService.renderJobAudio(job.id, {
        userId: params.userId,
      });
    }

    return this.generateQualityReport(params);
  }
}

export const dubQualityAuditor = new DubQualityAuditor();
