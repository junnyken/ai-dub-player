import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import {
  DuplicateJobError,
  InsufficientCreditError,
  ValidationDomainError,
} from "@/domain/errors";
import { createValidMp4Buffer } from "../helpers/media-fixtures";
import { POST as postDubJobsRoute } from "@/app/api/dub-jobs/route";
import { GET as getJobEventsRoute } from "@/app/api/dub-jobs/[id]/events/route";

describe("MINI-SPEC D1 — Integration & Regression Tests", () => {
  const mockYouTubeResolver = new YouTubeUrlResolver(async (videoId) => {
    if (videoId === "ERR_META_00") {
      return {
        title: "Broken Metadata Video",
        durationSeconds: 0,
        playabilityStatus: "UNPLAYABLE",
      };
    }
    if (videoId === "LONG_VID_99") {
      return {
        title: "Very Long Documentary",
        durationSeconds: 45 * 60, // 45 mins
        playabilityStatus: "OK",
      };
    }
    return {
      title: `Tech Keynote (${videoId})`,
      durationSeconds: 504, // 8m 24s -> 9 credits
      playabilityStatus: "OK",
      sourceLanguage: "en",
    };
  });

  const orchestrator = new DubJobOrchestrator(mockYouTubeResolver);

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
    await prisma.jobEventLog.deleteMany();
    await prisma.creditLedger.deleteMany();
    await prisma.jobQueueRecord.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.dubJob.deleteMany();
    await prisma.uploadedFile.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("creates a job from a valid YouTube URL, persists queue record, and runs ingest worker", async () => {
    const user = await prisma.user.create({
      data: {
        email: "yt-user@aidub.vn",
        name: "YouTube Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    const created = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
      clientType: "web",
    });

    expect(created.status).toBe("queued");
    expect(created.creditEstimated).toBe(9);
    expect(created.progress).toBe(0);

    // Regression: Verify queue record exists for queued job
    const queueRecord = await prisma.jobQueueRecord.findFirst({
      where: { jobId: created.id },
    });
    expect(queueRecord).not.toBeNull();
    expect(queueRecord?.state).toBe("waiting");

    // Credit is NOT deducted before worker actually runs
    const userBeforeWorker = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(userBeforeWorker.creditBalance).toBe(50);

    // Run ingest worker
    await jobQueueService.processIngestJob(created.id);

    const jobAfter = await orchestrator.getJobDetails(created.id, user.id);
    expect(jobAfter.status).toBe("transcribing");
    expect(jobAfter.progress).toBe(25);
    expect(jobAfter.creditSpent).toBe(9);
    expect(jobAfter.mediaAssets.length).toBeGreaterThanOrEqual(2);

    const userAfterWorker = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(userAfterWorker.creditBalance).toBe(41);
  });

  it("creates a job from an uploaded MP4 file and extracts media assets with retention policy", async () => {
    const user = await prisma.user.create({
      data: {
        email: "upload-user@aidub.vn",
        name: "Upload Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 30,
      },
    });

    const mp4Buffer = createValidMp4Buffer({
      durationSeconds: 180, // 3 mins -> 3 credits
      includeAudioTrack: true,
    });

    const staged = await orchestrator.stageUpload({
      userId: user.id,
      fileName: "interview_clip.mp4",
      mimeType: "video/mp4",
      buffer: mp4Buffer,
      rightsConfirmed: true,
    });

    expect(staged.sourceFileId).toMatch(/^file_/);
    expect(staged.durationSeconds).toBe(180);
    expect(staged.creditEstimated).toBe(3);

    const created = await orchestrator.createJob({
      userId: user.id,
      sourceType: "upload",
      sourceFileId: staged.sourceFileId,
      targetLanguage: "vi",
      clientType: "web",
    });

    expect(created.status).toBe("queued");
    expect(created.creditEstimated).toBe(3);

    await jobQueueService.processIngestJob(created.id);

    const jobAfter = await orchestrator.getJobDetails(created.id, user.id);
    expect(jobAfter.status).toBe("transcribing");
    expect(jobAfter.mediaAssets.every((a) => a.expiresAt !== null)).toBe(true);
  });

  it("Regression: blocks job creation when credit is insufficient (402) and writes 0 DB job records", async () => {
    const poorUser = await prisma.user.create({
      data: {
        email: "lowcredit@aidub.vn",
        name: "Low Credit User",
        passwordHash: "hash",
        plan: "free",
        creditBalance: 3, // Needs 9 credits
      },
    });

    await expect(
      orchestrator.createJob({
        userId: poorUser.id,
        sourceType: "youtube",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        targetLanguage: "vi",
        clientType: "web",
      })
    ).rejects.toThrowError(InsufficientCreditError);

    const jobCount = await prisma.dubJob.count({
      where: { userId: poorUser.id },
    });
    expect(jobCount).toBe(0);
  });

  it("Regression: blocks duplicate job creation when an active job for the same user+source+language is running", async () => {
    const user = await prisma.user.create({
      data: {
        email: "dup@aidub.vn",
        name: "Dup User",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 100,
      },
    });

    const firstJob = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
      clientType: "web",
    });

    await expect(
      orchestrator.createJob({
        userId: user.id,
        sourceType: "youtube",
        sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
        targetLanguage: "vi",
        clientType: "web",
      })
    ).rejects.toThrowError(DuplicateJobError);

    const jobs = await prisma.dubJob.findMany({ where: { userId: user.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(firstJob.id);
  });

  it("blocks job creation when metadata extraction fails or video exceeds plan limit", async () => {
    const freeUser = await prisma.user.create({
      data: {
        email: "free@aidub.vn",
        name: "Free User",
        passwordHash: "hash",
        plan: "free",
        creditBalance: 100,
      },
    });

    // Metadata failure
    await expect(
      orchestrator.createJob({
        userId: freeUser.id,
        sourceType: "youtube",
        sourceUrl: "https://www.youtube.com/watch?v=ERR_META_00",
        targetLanguage: "vi",
      })
    ).rejects.toThrowError(ValidationDomainError);

    // Plan duration exceeded (45 mins > 15 mins free limit)
    await expect(
      orchestrator.createJob({
        userId: freeUser.id,
        sourceType: "youtube",
        sourceUrl: "https://www.youtube.com/watch?v=LONG_VID_99",
        targetLanguage: "vi",
      })
    ).rejects.toThrowError(ValidationDomainError);

    const count = await prisma.dubJob.count({ where: { userId: freeUser.id } });
    expect(count).toBe(0);
  });

  it("marks job as failed and preserves user credit if storage asset is missing during worker ingest", async () => {
    const user = await prisma.user.create({
      data: {
        email: "failworker@aidub.vn",
        name: "Worker Fail User",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 20,
      },
    });

    const brokenFile = await prisma.uploadedFile.create({
      data: {
        id: "file_missing_on_disk",
        userId: user.id,
        originalName: "missing.mp4",
        storageKey: "uploads/non_existent_key.mp4",
        mimeType: "video/mp4",
        extension: "mp4",
        sizeBytes: 10240,
        durationSeconds: 120,
        hasAudioTrack: true,
        rightsConfirmed: true,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "upload",
      sourceFileId: brokenFile.id,
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);

    const updatedJob = await orchestrator.getJobDetails(job.id, user.id);
    expect(updatedJob.status).toBe("failed");
    expect(updatedJob.errorCode).toBe("UPLOADED_MEDIA_UNREADABLE");
    expect(updatedJob.creditSpent).toBe(0);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updatedUser.creditBalance).toBe(20);
  });

  it("verifies HTTP route status 402 and SSE /events stream contract", async () => {
    const user = await prisma.user.create({
      data: {
        email: "http-user@aidub.vn",
        name: "HTTP Route Tester",
        passwordHash: "hash",
        plan: "free",
        creditBalance: 1,
      },
    });

    const mp4Buffer = createValidMp4Buffer({ durationSeconds: 240 }); // 4 mins -> 4 credits
    const staged = await orchestrator.stageUpload({
      userId: user.id,
      fileName: "four_min.mp4",
      mimeType: "video/mp4",
      buffer: mp4Buffer,
      rightsConfirmed: true,
    });

    const req402 = new NextRequest("http://localhost:3000/api/dub-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
      },
      body: JSON.stringify({
        sourceType: "upload",
        sourceFileId: staged.sourceFileId,
        targetLanguage: "vi",
        clientType: "web",
      }),
    });

    const res402 = await postDubJobsRoute(req402);
    expect(res402.status).toBe(402);
    const body402 = await res402.json();
    expect(body402.requiredCredits).toBe(4);
    expect(body402.currentCredits).toBe(1);

    // Top up user credits and create valid job via HTTP route
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: 20 },
    });

    const req201 = new NextRequest("http://localhost:3000/api/dub-jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
      },
      body: JSON.stringify({
        sourceType: "upload",
        sourceFileId: staged.sourceFileId,
        targetLanguage: "vi",
        clientType: "web",
      }),
    });

    const res201 = await postDubJobsRoute(req201);
    expect(res201.status).toBe(201);
    const body201 = await res201.json();
    expect(body201.id).toMatch(/^job_/);

    // Verify SSE /api/dub-jobs/:id/events emits valid event payload
    const abortController = new AbortController();
    const sseReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${body201.id}/events`,
      {
        headers: { "x-user-id": user.id },
        signal: abortController.signal,
      }
    );

    const sseRes = await getJobEventsRoute(sseReq, {
      params: Promise.resolve({ id: body201.id }),
    });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = sseRes.body?.getReader();
    const firstChunk = await reader?.read();
    abortController.abort();

    const text = new TextDecoder().decode(firstChunk?.value);
    expect(text).toContain("data: ");
    const jsonPayload = JSON.parse(text.replace(/^data:\s*/, "").trim());
    expect(jsonPayload.jobId).toBe(body201.id);
    expect(jsonPayload.status).toBe("queued");
  });
});
