import crypto from "crypto";
import { prisma } from "@/server/db/prisma";
import {
  ACTIVE_DUB_JOB_STATUSES,
  ClientType,
  DubJobStatus,
  SOURCE_RETENTION_DAYS,
  SourceType,
  TargetLanguage,
  UserPlan,
} from "@/domain/models";
import {
  DomainError,
  DuplicateJobError,
  ValidationDomainError,
} from "@/domain/errors";
import {
  YouTubeUrlResolver,
  youTubeUrlResolver,
} from "@/server/services/youtube-url-resolver";
import { uploadedFileValidator } from "@/server/services/uploaded-file-validator";
import { mediaMetadataExtractor } from "@/server/services/media-metadata-extractor";
import { creditEstimator } from "@/server/services/credit-estimator";
import { storageAdapter } from "@/server/storage/storage-adapter";
import { jobQueueService } from "@/server/services/job-queue";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { recordJobObservabilityEvent } from "@/server/observability/logger";

export interface StageUploadInput {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  rightsConfirmed: boolean;
}

export interface EstimateJobInput {
  userId: string;
  sourceType: SourceType;
  sourceUrl?: string;
  sourceFileId?: string;
  targetLanguage?: string;
}

export interface CreateDubJobInput {
  userId: string;
  sourceType: SourceType;
  sourceUrl?: string;
  sourceFileId?: string;
  targetLanguage: TargetLanguage;
  clientType?: ClientType;
}

export class DubJobOrchestrator {
  private readonly ytResolver: YouTubeUrlResolver;

  constructor(ytResolver: YouTubeUrlResolver = youTubeUrlResolver) {
    this.ytResolver = ytResolver;
  }

  public async stageUpload(input: StageUploadInput) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new DomainError(401, "UNAUTHORIZED", "Vui lòng đăng nhập để tải video lên.");
    }

    const validated = uploadedFileValidator.validate({
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      userPlan: user.plan as UserPlan,
      rightsConfirmed: input.rightsConfirmed,
    });

    const extracted = mediaMetadataExtractor.extractFromBuffer(
      input.buffer,
      validated.extension
    );

    const fileId = `file_${crypto.randomBytes(8).toString("hex")}`;
    const storageKey = `uploads/${user.id}/${fileId}.${validated.extension}`;

    await storageAdapter.putObject({
      storageKey,
      body: input.buffer,
      mimeType: validated.normalizedMimeType,
    });

    const expiresAt = new Date(
      Date.now() + SOURCE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        id: fileId,
        userId: user.id,
        originalName: input.fileName,
        storageKey,
        mimeType: validated.normalizedMimeType,
        extension: validated.extension,
        sizeBytes: validated.sizeBytes,
        durationSeconds: extracted.durationSeconds,
        hasAudioTrack: extracted.hasAudioTrack,
        rightsConfirmed: Boolean(input.rightsConfirmed),
        expiresAt,
      },
    });

    const estimate = creditEstimator.evaluateForUser({
      durationSeconds: uploadedFile.durationSeconds,
      userPlan: user.plan as UserPlan,
      creditBalance: user.creditBalance,
    });

    return {
      sourceFileId: uploadedFile.id,
      fileName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
      sizeBytes: uploadedFile.sizeBytes,
      durationSeconds: uploadedFile.durationSeconds,
      creditEstimated: estimate.creditEstimated,
      currentCredits: user.creditBalance,
      canAfford: estimate.canAfford,
      withinPlanDurationLimit: estimate.withinPlanDurationLimit,
      maxPlanDurationSeconds: estimate.maxPlanDurationSeconds,
    };
  }

  public async estimateJob(input: EstimateJobInput) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new DomainError(401, "UNAUTHORIZED", "Vui lòng đăng nhập để ước lượng credit.");
    }

    let title = "";
    let durationSeconds = 0;
    let sourceVideoId: string | undefined;
    let normalizedUrl: string | undefined;

    if (input.sourceType === "youtube") {
      if (!input.sourceUrl) {
        throw new ValidationDomainError(
          "MISSING_SOURCE_URL",
          "Vui lòng nhập đường dẫn YouTube cần lồng tiếng."
        );
      }
      const ytMeta = await this.ytResolver.resolveMetadata(input.sourceUrl);
      title = ytMeta.title;
      durationSeconds = ytMeta.durationSeconds;
      sourceVideoId = ytMeta.videoId;
      normalizedUrl = ytMeta.normalizedUrl;
    } else if (input.sourceType === "upload") {
      if (!input.sourceFileId) {
        throw new ValidationDomainError(
          "MISSING_SOURCE_FILE_ID",
          "Vui lòng chọn file video hoặc âm thanh từ máy tính."
        );
      }
      const uploadedFile = await prisma.uploadedFile.findUnique({
        where: { id: input.sourceFileId },
      });
      if (!uploadedFile || uploadedFile.userId !== user.id) {
        throw new ValidationDomainError(
          "INVALID_SOURCE_FILE_ID",
          "Không tìm thấy file đã tải lên hoặc bạn không có quyền truy cập file này."
        );
      }
      title = uploadedFile.originalName;
      durationSeconds = uploadedFile.durationSeconds;
    } else {
      throw new ValidationDomainError(
        "INVALID_SOURCE_TYPE",
        "Nguồn video không hợp lệ. Chỉ hỗ trợ 'youtube' hoặc 'upload'."
      );
    }

    const evaluation = creditEstimator.evaluateForUser({
      durationSeconds,
      userPlan: user.plan as UserPlan,
      creditBalance: user.creditBalance,
    });

    return {
      sourceType: input.sourceType,
      sourceUrl: normalizedUrl,
      sourceVideoId,
      sourceFileId: input.sourceFileId,
      title,
      durationSeconds,
      creditEstimated: evaluation.creditEstimated,
      currentCredits: evaluation.currentCredits,
      userPlan: evaluation.userPlan,
      maxPlanDurationSeconds: evaluation.maxPlanDurationSeconds,
      canAfford: evaluation.canAfford,
      withinPlanDurationLimit: evaluation.withinPlanDurationLimit,
      isEstimated: true,
    };
  }

  public async createJob(input: CreateDubJobInput) {
    const startedAt = Date.now();

    if (input.targetLanguage !== "vi") {
      throw new ValidationDomainError(
        "UNSUPPORTED_TARGET_LANGUAGE",
        "Phiên bản MVP chỉ hỗ trợ ngôn ngữ đích là Tiếng Việt (vi)."
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) {
      throw new DomainError(401, "UNAUTHORIZED", "Vui lòng đăng nhập trước khi tạo bản lồng tiếng.");
    }

    const clientType: ClientType = input.clientType ?? "web";
    let title = "";
    let durationSeconds = 0;
    let sourceUrl: string | null = null;
    let sourceVideoId: string | null = null;
    let sourceFileId: string | null = null;
    let sourceLanguage = "en";

    if (input.sourceType === "youtube") {
      if (!input.sourceUrl) {
        throw new ValidationDomainError(
          "MISSING_SOURCE_URL",
          "Vui lòng nhập đường dẫn YouTube hợp lệ."
        );
      }
      const ytMeta = await this.ytResolver.resolveMetadata(input.sourceUrl);
      sourceUrl = ytMeta.normalizedUrl;
      sourceVideoId = ytMeta.videoId;
      title = ytMeta.title;
      durationSeconds = ytMeta.durationSeconds;
      sourceLanguage = ytMeta.sourceLanguage ?? "en";

      // Duplicate active job check
      const existingActiveJob = await prisma.dubJob.findFirst({
        where: {
          userId: user.id,
          sourceVideoId,
          targetLanguage: input.targetLanguage,
          status: { in: ACTIVE_DUB_JOB_STATUSES },
        },
      });

      if (existingActiveJob) {
        throw new DuplicateJobError(existingActiveJob.id);
      }
    } else if (input.sourceType === "upload") {
      if (!input.sourceFileId) {
        throw new ValidationDomainError(
          "MISSING_SOURCE_FILE_ID",
          "Vui lòng tải lên file video hợp lệ trước khi tạo bản lồng tiếng."
        );
      }

      const uploadedFile = await prisma.uploadedFile.findUnique({
        where: { id: input.sourceFileId },
      });

      if (!uploadedFile || uploadedFile.userId !== user.id) {
        throw new ValidationDomainError(
          "INVALID_SOURCE_FILE_ID",
          "Mã file tải lên không tồn tại hoặc không thuộc tài khoản của bạn."
        );
      }

      if (!uploadedFile.rightsConfirmed) {
        throw new ValidationDomainError(
          "RIGHTS_CONFIRMATION_REQUIRED",
          "Bạn cần xác nhận quyền sử dụng nội dung đối với file tải lên."
        );
      }

      if (!uploadedFile.hasAudioTrack || uploadedFile.durationSeconds <= 0) {
        throw new ValidationDomainError(
          "METADATA_EXTRACTION_FAILED",
          "File tải lên không có kênh âm thanh hoặc thời lượng không hợp lệ."
        );
      }

      const existingActiveJob = await prisma.dubJob.findFirst({
        where: {
          userId: user.id,
          sourceFileId: uploadedFile.id,
          targetLanguage: input.targetLanguage,
          status: { in: ACTIVE_DUB_JOB_STATUSES },
        },
      });

      if (existingActiveJob) {
        throw new DuplicateJobError(existingActiveJob.id);
      }

      sourceFileId = uploadedFile.id;
      title = uploadedFile.originalName;
      durationSeconds = uploadedFile.durationSeconds;
    } else {
      throw new ValidationDomainError(
        "INVALID_SOURCE_TYPE",
        "Loại nguồn video không hợp lệ."
      );
    }

    // Enforce plan duration limit & credit balance BEFORE creating job
    const creditCheck = creditEstimator.enforceLimitsOrThrow({
      durationSeconds,
      userPlan: user.plan as UserPlan,
      creditBalance: user.creditBalance,
    });

    const jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
    const initialMessage = "Đã nhận video và xếp vào hàng đợi xử lý";

    const createdJob = await prisma.$transaction(async (tx) => {
      const job = await tx.dubJob.create({
        data: {
          id: jobId,
          userId: user.id,
          sourceType: input.sourceType,
          sourceUrl,
          sourceVideoId,
          sourceFileId,
          title,
          durationSeconds,
          sourceLanguage,
          targetLanguage: input.targetLanguage,
          status: "queued",
          progress: 0,
          currentStageMessage: initialMessage,
          creditEstimated: creditCheck.creditEstimated,
          creditSpent: 0,
          clientType,
        },
      });

      await tx.jobQueueRecord.create({
        data: {
          jobId: job.id,
          queueName: "dub-ingest-queue",
          stage: "ingest",
          state: "waiting",
          payloadJson: JSON.stringify({
            jobId: job.id,
            userId: user.id,
            sourceType: input.sourceType,
            clientType,
          }),
        },
      });

      return job;
    });

    await recordJobObservabilityEvent({
      jobId: createdJob.id,
      userId: user.id,
      clientType,
      sourceType: input.sourceType,
      provider: "dub-job-orchestrator",
      stage: "job_queued",
      durationMs: Date.now() - startedAt,
      status: "queued",
      creditSpent: 0,
      message: initialMessage,
    });

    jobEventsBus.publish({
      jobId: createdJob.id,
      status: "queued",
      progress: 0,
      message: initialMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    jobQueueService.triggerWorkerIfEnabled(createdJob.id);

    return {
      id: createdJob.id,
      status: createdJob.status as DubJobStatus,
      creditEstimated: createdJob.creditEstimated,
      targetLanguage: createdJob.targetLanguage as TargetLanguage,
      progress: createdJob.progress,
      title: createdJob.title,
      durationSeconds: createdJob.durationSeconds,
    };
  }

  public async getJobDetails(jobId: string, userId: string) {
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: {
        mediaAssets: true,
        queueRecords: {
          orderBy: { enqueuedAt: "desc" },
        },
        eventLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!job) {
      throw new DomainError(404, "JOB_NOT_FOUND", "Không tìm thấy tiến trình lồng tiếng này.");
    }

    if (job.userId !== userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền truy cập vào tiến trình lồng tiếng của tài khoản khác."
      );
    }

    return job;
  }

  public async getJobProgress(jobId: string, userId: string) {
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new DomainError(404, "JOB_NOT_FOUND", "Không tìm thấy tiến trình lồng tiếng này.");
    }

    if (job.userId !== userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền xem tiến độ của tiến trình này."
      );
    }

    return {
      jobId: job.id,
      status: job.status as DubJobStatus,
      progress: job.progress,
      message: job.currentStageMessage ?? "Đang xử lý...",
      readyFromMs: job.readyFromMs,
      readyToMs: job.readyToMs,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      creditEstimated: job.creditEstimated,
      creditSpent: job.creditSpent,
      title: job.title,
      durationSeconds: job.durationSeconds,
      sourceType: job.sourceType,
      sourceUrl: job.sourceUrl,
    };
  }

  public async listUserJobs(userId: string) {
    const jobs = await prisma.dubJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return jobs.map((job) => ({
      id: job.id,
      title: job.title ?? "Video chưa đặt tên",
      sourceType: job.sourceType as SourceType,
      sourceUrl: job.sourceUrl,
      sourceVideoId: job.sourceVideoId,
      durationSeconds: job.durationSeconds ?? 0,
      targetLanguage: job.targetLanguage as TargetLanguage,
      status: job.status as DubJobStatus,
      progress: job.progress,
      currentStageMessage: job.currentStageMessage,
      creditEstimated: job.creditEstimated,
      creditSpent: job.creditSpent,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  }

  public async cancelJob(jobId: string, userId: string) {
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
        "Bạn không có quyền hủy tiến trình của tài khoản khác."
      );
    }

    if (job.status === "ready") {
      throw new ValidationDomainError(
        "CANNOT_CANCEL_READY_JOB",
        "Tiến trình đã hoàn tất 100%, không thể hủy."
      );
    }

    if (job.status === "canceled") {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
      });
      return {
        jobId: job.id,
        status: "canceled" as DubJobStatus,
        refundedCredits: 0,
        creditBalance: currentUser?.creditBalance ?? 0,
        message: "Tiến trình đã được hủy trước đó.",
      };
    }

    const cancelMessage =
      job.creditSpent > 0
        ? `Đã hủy tiến trình và hoàn trả ${job.creditSpent} credit vào tài khoản`
        : "Đã hủy tiến trình theo yêu cầu người dùng";

    const result = await prisma.$transaction(async (tx) => {
      const refundableCredits = job.creditSpent > 0 ? job.creditSpent : 0;
      let updatedBalance = 0;

      if (refundableCredits > 0) {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            creditBalance: { increment: refundableCredits },
          },
        });
        updatedBalance = updatedUser.creditBalance;

        await tx.creditLedger.create({
          data: {
            userId,
            jobId: job.id,
            delta: refundableCredits,
            balanceAfter: updatedBalance,
            reason: "job_canceled_refund",
          },
        });
      } else {
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
        });
        updatedBalance = currentUser?.creditBalance ?? 0;
      }

      const updatedJob = await tx.dubJob.update({
        where: { id: job.id },
        data: {
          status: "canceled",
          currentStageMessage: cancelMessage,
          creditSpent: 0,
        },
      });

      return {
        updatedJob,
        refundedCredits: refundableCredits,
        creditBalance: updatedBalance,
      };
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: "canceled",
      progress: result.updatedJob.progress,
      message: cancelMessage,
      readyFromMs: result.updatedJob.readyFromMs,
      readyToMs: result.updatedJob.readyToMs,
    });

    return {
      jobId: job.id,
      status: "canceled" as DubJobStatus,
      refundedCredits: result.refundedCredits,
      creditBalance: result.creditBalance,
      message: cancelMessage,
    };
  }

  public async retryJob(jobId: string, userId: string) {
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
        "Bạn không có quyền chạy lại tiến trình của tài khoản khác."
      );
    }

    if (job.status !== "failed" && job.status !== "canceled") {
      throw new ValidationDomainError(
        "JOB_NOT_RETRYABLE",
        "Chỉ có thể chạy lại tiến trình đang ở trạng thái 'failed' hoặc 'canceled'."
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new DomainError(401, "UNAUTHORIZED", "Tài khoản không hợp lệ.");
    }

    // Ensure user still has enough credit if creditSpent was 0 (refunded or not yet charged)
    if (job.creditSpent === 0) {
      creditEstimator.enforceLimitsOrThrow({
        durationSeconds: job.durationSeconds ?? 60,
        userPlan: user.plan as UserPlan,
        creditBalance: user.creditBalance,
      });
    }

    const retryMessage = "Đã khởi động lại tiến trình xử lý video";
    const updatedJob = await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: "queued",
        progress: 0,
        errorCode: null,
        errorMessage: null,
        currentStageMessage: retryMessage,
      },
    });

    jobEventsBus.publish({
      jobId: updatedJob.id,
      status: "queued",
      progress: 0,
      message: retryMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    jobQueueService.triggerWorkerIfEnabled(updatedJob.id);

    return {
      jobId: updatedJob.id,
      status: updatedJob.status as DubJobStatus,
      progress: updatedJob.progress,
      message: retryMessage,
    };
  }

  public async findLatestJobForYouTubeVideo(userId: string, videoId: string) {
    const cleanId = videoId.trim();
    if (!cleanId) {
      throw new ValidationDomainError(
        "INVALID_YOUTUBE_VIDEO_ID",
        "Mã video YouTube không hợp lệ."
      );
    }

    const job = await prisma.dubJob.findFirst({
      where: {
        userId,
        sourceType: "youtube",
        sourceVideoId: cleanId,
        targetLanguage: "vi",
        status: { notIn: ["canceled"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      sourceVideoId: job.sourceVideoId,
      title: job.title,
      durationSeconds: job.durationSeconds,
      status: job.status as DubJobStatus,
      progress: job.progress,
      message: job.currentStageMessage ?? "Đang xử lý...",
      creditEstimated: job.creditEstimated,
      creditSpent: job.creditSpent,
      clientType: job.clientType as ClientType,
      readyFromMs: job.readyFromMs,
      readyToMs: job.readyToMs,
    };
  }
}

export const dubJobOrchestrator = new DubJobOrchestrator();
