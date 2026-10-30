import { prisma } from "@/server/db/prisma";
import {
  ClientType,
  DubJobStatus,
  SOURCE_RETENTION_DAYS,
  SourceType,
} from "@/domain/models";
import { recordJobObservabilityEvent } from "@/server/observability/logger";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { storageAdapter } from "@/server/storage/storage-adapter";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";

export interface QueueJobPayload {
  jobId: string;
  userId: string;
  sourceType: SourceType;
  clientType: ClientType;
}

export class JobQueueService {
  private autoRunWorker = true;
  private autoAdvanceToD2 = true;
  private autoAdvanceToD3 = true;
  private autoAdvanceToD4 = true;
  private autoAdvanceToD5 = true;

  public setAutoRunWorker(enabled: boolean): void {
    this.autoRunWorker = enabled;
  }

  public setAutoAdvanceToD2(enabled: boolean): void {
    this.autoAdvanceToD2 = enabled;
  }

  public setAutoAdvanceToD3(enabled: boolean): void {
    this.autoAdvanceToD3 = enabled;
  }

  public setAutoAdvanceToD4(enabled: boolean): void {
    this.autoAdvanceToD4 = enabled;
  }

  public setAutoAdvanceToD5(enabled: boolean): void {
    this.autoAdvanceToD5 = enabled;
  }

  public triggerWorkerIfEnabled(jobId: string): void {
    if (!this.autoRunWorker) {
      return;
    }
    setTimeout(() => {
      this.processIngestJob(jobId)
        .then(async () => {
          if (this.autoAdvanceToD2) {
            await this.processTranscriptionJob(jobId);
          }
          if (this.autoAdvanceToD3) {
            await this.processTranslationJob(jobId);
          }
          if (this.autoAdvanceToD4) {
            await this.processCastingJob(jobId);
          }
          if (this.autoAdvanceToD5) {
            await this.processSynthesisJob(jobId);
          }
        })
        .catch((err) => {
          console.error("[JobQueueService] Worker error:", err);
        });
    }, 30);
  }

  public async processTranscriptionJob(jobId: string): Promise<void> {
    const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "transcribing") {
      return;
    }
    await transcriptVersionService.generateTranscriptForJob(jobId);
  }

  public async processTranslationJob(jobId: string): Promise<void> {
    const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "translating") {
      return;
    }
    await translationService.translateJob(jobId);
  }

  public async processCastingJob(jobId: string): Promise<void> {
    const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "casting") {
      return;
    }
    await castingService.runAiCastingForJob(jobId);
  }

  public async processSynthesisJob(jobId: string): Promise<void> {
    const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "synthesizing") {
      return;
    }
    await playbackManifestService.renderJobAudio(jobId);
  }

  public async processIngestJob(jobId: string): Promise<void> {
    const startedAt = Date.now();

    const queueRecord = await prisma.jobQueueRecord.findFirst({
      where: { jobId, stage: "ingest" },
      orderBy: { enqueuedAt: "desc" },
    });

    if (!queueRecord) {
      return;
    }

    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: { uploadedFile: true, user: true },
    });

    if (!job || job.status === "canceled" || job.status === "failed") {
      return;
    }

    await prisma.jobQueueRecord.update({
      where: { id: queueRecord.id },
      data: {
        state: "active",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });

    // Transition to ingesting
    const ingestingMessage = "Đang phân tích âm thanh và chuẩn bị tài nguyên media";
    await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: "ingesting",
        progress: 12,
        currentStageMessage: ingestingMessage,
      },
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: "ingesting",
      progress: 12,
      message: ingestingMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: job.sourceType === "youtube" ? "youtube-resolver" : "local-upload-storage",
      stage: "ingest_start",
      durationMs: Date.now() - startedAt,
      status: "ingesting",
      creditSpent: 0,
      message: ingestingMessage,
    });

    let creditDeducted = 0;

    try {
      const expiresAt = new Date(
        Date.now() + SOURCE_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );
      const durationMs = (job.durationSeconds ?? 0) * 1000;

      if (durationMs <= 0) {
        throw new Error("METADATA_DURATION_INVALID");
      }

      if (job.sourceType === "upload") {
        if (!job.uploadedFile) {
          throw new Error("UPLOADED_FILE_NOT_FOUND");
        }
        const exists = await storageAdapter.exists(job.uploadedFile.storageKey);
        if (!exists || !job.uploadedFile.hasAudioTrack) {
          throw new Error("UPLOADED_MEDIA_UNREADABLE");
        }

        await prisma.mediaAsset.createMany({
          data: [
            {
              jobId: job.id,
              kind: job.uploadedFile.mimeType.startsWith("audio/")
                ? "source_audio"
                : "source_video",
              storageKey: job.uploadedFile.storageKey,
              mimeType: job.uploadedFile.mimeType,
              sizeBytes: job.uploadedFile.sizeBytes,
              durationMs,
              expiresAt,
            },
            {
              jobId: job.id,
              kind: "source_audio",
              storageKey: `${job.uploadedFile.storageKey}.audio.track`,
              mimeType: "audio/wav",
              sizeBytes: job.uploadedFile.sizeBytes,
              durationMs,
              expiresAt,
            },
          ],
        });
      } else {
        if (!job.sourceVideoId || !job.sourceUrl) {
          throw new Error("YOUTUBE_SOURCE_MISSING");
        }

        const manifestKey = `jobs/${job.id}/youtube_${job.sourceVideoId}.json`;
        const manifestBuffer = Buffer.from(
          JSON.stringify({
            videoId: job.sourceVideoId,
            sourceUrl: job.sourceUrl,
            title: job.title,
            durationSeconds: job.durationSeconds,
            ingestedAt: new Date().toISOString(),
          }),
          "utf-8"
        );
        await storageAdapter.putObject({
          storageKey: manifestKey,
          body: manifestBuffer,
          mimeType: "application/json",
        });

        await prisma.mediaAsset.createMany({
          data: [
            {
              jobId: job.id,
              kind: "source_video",
              storageKey: manifestKey,
              mimeType: "video/mp4",
              sizeBytes: manifestBuffer.byteLength,
              durationMs,
              expiresAt,
            },
            {
              jobId: job.id,
              kind: "source_audio",
              storageKey: `jobs/${job.id}/source_audio_${job.sourceVideoId}.m4a`,
              mimeType: "audio/mp4",
              durationMs,
              expiresAt,
            },
            {
              jobId: job.id,
              kind: "thumbnail",
              storageKey: `https://i.ytimg.com/vi/${job.sourceVideoId}/hqdefault.jpg`,
              mimeType: "image/jpeg",
              expiresAt,
            },
          ],
        });
      }

      // Deduct credit only when ingest processing actually runs
      creditDeducted = job.creditEstimated;
      const nextStatus: DubJobStatus = "transcribing";
      const nextMessage =
        "Đã trích xuất âm thanh. Sẵn sàng nhận diện người nói và tạo transcript";

      await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.findUniqueOrThrow({
          where: { id: job.userId },
        });
        const newBalance = Math.max(0, freshUser.creditBalance - creditDeducted);

        await tx.user.update({
          where: { id: job.userId },
          data: { creditBalance: newBalance },
        });

        await tx.creditLedger.create({
          data: {
            userId: job.userId,
            jobId: job.id,
            delta: -creditDeducted,
            reason: "job_ingest_deduct",
            balanceAfter: newBalance,
          },
        });

        await tx.dubJob.update({
          where: { id: job.id },
          data: {
            status: nextStatus,
            progress: 25,
            creditSpent: creditDeducted,
            currentStageMessage: nextMessage,
          },
        });

        await tx.jobQueueRecord.update({
          where: { id: queueRecord.id },
          data: {
            state: "completed",
            finishedAt: new Date(),
          },
        });
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: nextStatus,
        progress: 25,
        message: nextMessage,
        readyFromMs: 0,
        readyToMs: 0,
      });

      await recordJobObservabilityEvent({
        jobId: job.id,
        userId: job.userId,
        clientType: job.clientType as ClientType,
        sourceType: job.sourceType as SourceType,
        provider:
          job.sourceType === "youtube" ? "youtube-resolver" : "local-upload-storage",
        stage: "ingest_complete",
        durationMs: Date.now() - startedAt,
        status: nextStatus,
        creditSpent: creditDeducted,
        message: nextMessage,
      });
    } catch (err) {
      const errorCode =
        err instanceof Error ? err.message : "INGEST_PROCESSING_FAILED";
      const failMessage =
        "Không thể trích xuất âm thanh từ nguồn media. Credit đã được bảo toàn.";

      await prisma.$transaction(async (tx) => {
        if (creditDeducted > 0) {
          const freshUser = await tx.user.findUniqueOrThrow({
            where: { id: job.userId },
          });
          const refundedBalance = freshUser.creditBalance + creditDeducted;
          await tx.user.update({
            where: { id: job.userId },
            data: { creditBalance: refundedBalance },
          });
          await tx.creditLedger.create({
            data: {
              userId: job.userId,
              jobId: job.id,
              delta: creditDeducted,
              reason: "job_refund",
              balanceAfter: refundedBalance,
            },
          });
        }

        await tx.dubJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorCode,
            errorMessage: failMessage,
            currentStageMessage: failMessage,
            creditSpent: 0,
          },
        });

        await tx.jobQueueRecord.update({
          where: { id: queueRecord.id },
          data: {
            state: "failed",
            error: errorCode,
            finishedAt: new Date(),
          },
        });
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: "failed",
        progress: job.progress,
        message: failMessage,
        readyFromMs: 0,
        readyToMs: 0,
        errorCode,
      });

      await recordJobObservabilityEvent({
        jobId: job.id,
        userId: job.userId,
        clientType: job.clientType as ClientType,
        sourceType: job.sourceType as SourceType,
        provider:
          job.sourceType === "youtube" ? "youtube-resolver" : "local-upload-storage",
        stage: "ingest_failed",
        durationMs: Date.now() - startedAt,
        status: "failed",
        errorCode,
        creditSpent: 0,
        message: failMessage,
      });
    }
  }
}

export const jobQueueService = new JobQueueService();
