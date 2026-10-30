import { prisma } from "@/server/db/prisma";
import {
  AudioSegmentStatus,
  ClientType,
  DubJobStatus,
  SourceType,
  TimingStrategy,
} from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import {
  defaultTtsProvider,
  TtsProvider,
} from "@/server/providers/tts-provider";
import { neuralViTtsEngine } from "@/server/services/neural-vi-tts-engine";
import { timingAligner } from "@/server/services/timing-aligner";
import { subtitleService } from "@/server/services/subtitle-service";
import { storageAdapter } from "@/server/storage/storage-adapter";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { recordJobObservabilityEvent } from "@/server/observability/logger";

export interface RenderJobAudioOptions {
  userId?: string;
  onlySpeakerId?: string;
}

export class PlaybackManifestService {
  private readonly ttsProvider: TtsProvider;

  constructor(ttsProvider: TtsProvider = defaultTtsProvider) {
    this.ttsProvider = ttsProvider;
  }

  public async renderJobAudio(jobId: string, options?: RenderJobAudioOptions) {
    const startedAt = Date.now();
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: {
        translation: {
          include: {
            segments: {
              include: {
                transcriptSegment: {
                  include: {
                    speaker: true,
                  },
                },
                audioSegment: true,
              },
            },
          },
        },
        voiceAssignments: {
          include: {
            voice: true,
          },
        },
      },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để tổng hợp âm thanh."
      );
    }

    if (options?.userId && job.userId !== options.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền tổng hợp âm thanh cho tiến trình này."
      );
    }

    if (!job.translation || job.translation.segments.length === 0) {
      throw new ValidationDomainError(
        "TRANSLATION_NOT_READY_FOR_RENDER",
        "Bản dịch tiếng Việt chưa sẵn sàng để tổng hợp giọng nói (TTS)."
      );
    }

    if (job.voiceAssignments.length === 0) {
      throw new ValidationDomainError(
        "VOICE_ASSIGNMENTS_MISSING",
        "Chưa có giọng đọc nào được gán cho các nhân vật. Vui lòng hoàn tất AI Casting trước."
      );
    }

    const assignmentBySpeakerId = new Map(
      job.voiceAssignments.map((va) => [va.speakerId, va])
    );

    const sortedTransSegments = [...job.translation.segments].sort(
      (a, b) =>
        a.transcriptSegment.segmentIndex - b.transcriptSegment.segmentIndex
    );

    // Filter segments if only re-rendering a specific speaker after a voice swap
    const targetSegments = options?.onlySpeakerId
      ? sortedTransSegments.filter(
          (seg) => seg.transcriptSegment.speakerId === options.onlySpeakerId
        )
      : sortedTransSegments;

    if (!options?.onlySpeakerId) {
      const synthMsg = "Đang tổng hợp giọng nói AI theo từng nhân vật (TTS)";
      await prisma.dubJob.update({
        where: { id: job.id },
        data: {
          status: "synthesizing",
          progress: 80,
          currentStageMessage: synthMsg,
        },
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: "synthesizing",
        progress: 80,
        message: synthMsg,
        readyFromMs: 0,
        readyToMs: 0,
      });
    }

    const halfIndex = Math.max(1, Math.floor(targetSegments.length / 2));

    // Pre-warm Microsoft Edge Neural TTS v2 cache in parallel batches of 4 in live mode
    if (!process.env.VITEST && targetSegments.length > 1) {
      const batchSize = 4;
      for (let b = 0; b < targetSegments.length; b += batchSize) {
        const chunk = targetSegments.slice(b, b + batchSize);
        await Promise.all(
          chunk.map((seg) => {
            const va = assignmentBySpeakerId.get(
              seg.transcriptSegment.speakerId
            );
            if (!va || seg.status === "failed") return Promise.resolve(null);
            return neuralViTtsEngine.synthesizeRealVietnameseMp3(
              seg.translatedText,
              va.voiceId
            );
          })
        );
      }
    }

    for (let idx = 0; idx < targetSegments.length; idx++) {
      const transSeg = targetSegments[idx];
      const origSeg = transSeg.transcriptSegment;
      const va = assignmentBySpeakerId.get(origSeg.speakerId);

      if (!va) {
        throw new ValidationDomainError(
          "SPEAKER_VOICE_UNASSIGNED",
          `Nhân vật ${origSeg.speaker.displayName} chưa được gán giọng đọc.`
        );
      }

      const slotDurationMs = Math.max(200, origSeg.endMs - origSeg.startMs);

      // If translation segment itself failed or text forces TTS error -> mark AudioSegment failed safely
      if (transSeg.status === "failed") {
        await prisma.audioSegment.upsert({
          where: { translationSegmentId: transSeg.id },
          update: {
            voiceId: va.voiceId,
            status: "failed",
            errorCode: transSeg.errorCode || "UPSTREAM_TRANSLATION_FAILED",
            version: { increment: 1 },
          },
          create: {
            jobId: job.id,
            translationSegmentId: transSeg.id,
            speakerId: origSeg.speakerId,
            voiceId: va.voiceId,
            startMs: origSeg.startMs,
            endMs: origSeg.endMs,
            durationMs: slotDurationMs,
            rawDurationMs: 0,
            playbackRate: 1.0,
            storageKey: `jobs/${job.id}/segments/${transSeg.id}_failed.wav`,
            audioDataUrl: null,
            status: "failed",
            timingStrategy: "natural",
            errorCode: transSeg.errorCode || "UPSTREAM_TRANSLATION_FAILED",
            version: 1,
          },
        });
        continue;
      }

      const ttsOut = await this.ttsProvider.synthesizeSegment({
        jobId: job.id,
        translationSegmentId: transSeg.id,
        speakerId: origSeg.speakerId,
        voiceId: va.voiceId,
        voiceGender: va.voice.genderPresentation,
        text: transSeg.translatedText,
        slotDurationMs,
      });

      if (ttsOut.failed || ttsOut.rawDurationMs <= 0) {
        await prisma.audioSegment.upsert({
          where: { translationSegmentId: transSeg.id },
          update: {
            voiceId: va.voiceId,
            status: "failed",
            errorCode: ttsOut.errorCode || "TTS_SYNTHESIS_FAILED",
            version: { increment: 1 },
          },
          create: {
            jobId: job.id,
            translationSegmentId: transSeg.id,
            speakerId: origSeg.speakerId,
            voiceId: va.voiceId,
            startMs: origSeg.startMs,
            endMs: origSeg.endMs,
            durationMs: slotDurationMs,
            rawDurationMs: 0,
            playbackRate: 1.0,
            storageKey: `jobs/${job.id}/segments/${transSeg.id}_failed.wav`,
            audioDataUrl: null,
            status: "failed",
            timingStrategy: "natural",
            errorCode: ttsOut.errorCode || "TTS_SYNTHESIS_FAILED",
            version: 1,
          },
        });
        continue;
      }

      const alignment = timingAligner.alignSegment({
        startMs: origSeg.startMs,
        endMs: origSeg.endMs,
        rawDurationMs: ttsOut.rawDurationMs,
        translatedText: transSeg.translatedText,
      });

      const storageKey = `jobs/${job.id}/segments/${transSeg.id}_${va.voiceId}.wav`;
      await storageAdapter.putObject({
        storageKey,
        body: ttsOut.audioBuffer,
        mimeType: ttsOut.mimeType,
      });

      await prisma.audioSegment.upsert({
        where: { translationSegmentId: transSeg.id },
        update: {
          voiceId: va.voiceId,
          startMs: alignment.startMs,
          endMs: alignment.endMs,
          durationMs: alignment.alignedDurationMs,
          rawDurationMs: alignment.rawDurationMs,
          playbackRate: alignment.playbackRate,
          storageKey,
          audioDataUrl: ttsOut.audioDataUrl,
          status: "ready",
          timingStrategy: alignment.timingStrategy,
          errorCode: null,
          version: { increment: 1 },
        },
        create: {
          jobId: job.id,
          translationSegmentId: transSeg.id,
          speakerId: origSeg.speakerId,
          voiceId: va.voiceId,
          startMs: alignment.startMs,
          endMs: alignment.endMs,
          durationMs: alignment.alignedDurationMs,
          rawDurationMs: alignment.rawDurationMs,
          playbackRate: alignment.playbackRate,
          storageKey,
          audioDataUrl: ttsOut.audioDataUrl,
          status: "ready",
          timingStrategy: alignment.timingStrategy,
          errorCode: null,
          version: 1,
        },
      });

      // Emit partial_ready when first half of segments finish during full render
      if (!options?.onlySpeakerId && idx + 1 === halfIndex) {
        const partialReadyMsg =
          "Một phần video đã lồng tiếng xong — có thể mở Dub Player xem ngay";
        await prisma.dubJob.update({
          where: { id: job.id },
          data: {
            status: "partial_ready",
            progress: 90,
            readyFromMs: 0,
            readyToMs: origSeg.endMs,
            currentStageMessage: partialReadyMsg,
          },
        });

        jobEventsBus.publish({
          jobId: job.id,
          status: "partial_ready",
          progress: 90,
          message: partialReadyMsg,
          readyFromMs: 0,
          readyToMs: origSeg.endMs,
        });
      }
    }

    // Generate VTT subtitle tracks (source, target, bilingual)
    const cues = sortedTransSegments.map((seg, index) => ({
      index,
      startMs: seg.transcriptSegment.startMs,
      endMs: seg.transcriptSegment.endMs,
      speakerDisplayName: seg.transcriptSegment.speaker.displayName,
      sourceText: seg.transcriptSegment.sourceText,
      translatedText: seg.translatedText,
    }));

    await subtitleService.generateAndSaveJobSubtitles(job.id, cues);

    const lastEndMs =
      sortedTransSegments[sortedTransSegments.length - 1]?.transcriptSegment
        .endMs ?? (job.durationSeconds ?? 0) * 1000;
    const readyStatus: DubJobStatus = "ready";
    const readyMessage =
      "Bản lồng tiếng đã hoàn tất 100% — Sẵn sàng xem bằng tiếng Việt";

    await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: readyStatus,
        progress: 100,
        readyFromMs: 0,
        readyToMs: lastEndMs,
        currentStageMessage: readyMessage,
      },
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: readyStatus,
      progress: 100,
      message: readyMessage,
      readyFromMs: 0,
      readyToMs: lastEndMs,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: this.ttsProvider.providerName,
      stage: options?.onlySpeakerId
        ? `speaker_resynthesized:${options.onlySpeakerId}`
        : "render_ready",
      durationMs: Date.now() - startedAt,
      status: readyStatus,
      creditSpent: job.creditSpent,
      message: readyMessage,
      readyFromMs: 0,
      readyToMs: lastEndMs,
    });

    return this.getPlaybackManifest(job.id, job.userId);
  }

  public async resynthesizeSpeakerSegmentsIfRendered(
    jobId: string,
    speakerId: string
  ): Promise<void> {
    const existingCount = await prisma.audioSegment.count({
      where: { jobId },
    });
    if (existingCount === 0) {
      return;
    }
    await this.renderJobAudio(jobId, { onlySpeakerId: speakerId });
  }

  public async getPlaybackManifest(jobId: string, userId: string) {
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: {
        audioSegments: {
          orderBy: { startMs: "asc" },
          include: {
            speaker: true,
            voice: true,
            translationSegment: {
              include: {
                transcriptSegment: true,
              },
            },
          },
        },
        subtitleTracks: true,
      },
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
        "Bạn không có quyền xem bản lồng tiếng của tài khoản khác."
      );
    }

    const videoUrl =
      job.sourceType === "youtube" && job.sourceUrl
        ? job.sourceUrl
        : `/api/dub-jobs/${job.id}/source-media`;

    return {
      jobId: job.id,
      title: job.title,
      sourceType: job.sourceType,
      sourceVideoId: job.sourceVideoId,
      durationSeconds: job.durationSeconds,
      status: job.status as DubJobStatus,
      readyFromMs: job.readyFromMs,
      readyToMs: job.readyToMs,
      videoUrl,
      audioSegments: job.audioSegments.map((seg) => ({
        id: seg.id,
        translationSegmentId: seg.translationSegmentId,
        speakerId: seg.speakerId,
        speakerDisplayName: seg.speaker.displayName,
        voiceId: seg.voiceId,
        voiceDisplayName: seg.voice.displayName,
        startMs: seg.startMs,
        endMs: seg.endMs,
        durationMs: seg.durationMs,
        rawDurationMs: seg.rawDurationMs,
        playbackRate: seg.playbackRate,
        audioUrl:
          seg.audioDataUrl || `/api/dub-jobs/${job.id}/segments/${seg.id}.wav`,
        status: seg.status as AudioSegmentStatus,
        timingStrategy: seg.timingStrategy as TimingStrategy | null,
        errorCode: seg.errorCode,
        version: seg.version,
        sourceText: seg.translationSegment.transcriptSegment.sourceText,
        translatedText: seg.translationSegment.translatedText,
      })),
      subtitles: {
        sourceVtt: `/api/dub-jobs/${job.id}/subtitles?format=vtt&kind=source`,
        targetVtt: `/api/dub-jobs/${job.id}/subtitles?format=vtt&kind=target`,
        bilingualVtt: `/api/dub-jobs/${job.id}/subtitles?format=vtt&kind=bilingual`,
      },
    };
  }
}

export const playbackManifestService = new PlaybackManifestService();
