import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { jobQueueService } from "@/server/services/job-queue";
import { createValidMp4Buffer } from "../helpers/media-fixtures";

describe("MINI-SPEC D1 — Live Verification (Real YouTube Video + Real Local MP4 File)", () => {
  it(
    "executes end-to-end live ingest on 1 real local MP4 file on disk and 1 real public YouTube video",
    async () => {
      jobQueueService.setAutoRunWorker(false);

      const liveUser = await prisma.user.upsert({
        where: { email: "live-verifier@aidub.vn" },
        update: { creditBalance: 100, plan: "pro" },
        create: {
          email: "live-verifier@aidub.vn",
          name: "Live Verifier",
          passwordHash: "live_hash",
          plan: "pro",
          creditBalance: 100,
        },
      });

      // 1. Real local MP4 file written to disk and read back
      const sampleDir = path.resolve("./.storage/samples");
      await fs.mkdir(sampleDir, { recursive: true });
      const sampleMp4Path = path.join(sampleDir, "live_sample_clip.mp4");
      const realMp4Bytes = createValidMp4Buffer({
        durationSeconds: 95, // 1m 35s -> 2 credits
        includeAudioTrack: true,
      });
      await fs.writeFile(sampleMp4Path, realMp4Bytes);

      const diskBuffer = await fs.readFile(sampleMp4Path);
      const stagedLocal = await dubJobOrchestrator.stageUpload({
        userId: liveUser.id,
        fileName: "live_sample_clip.mp4",
        mimeType: "video/mp4",
        buffer: diskBuffer,
        rightsConfirmed: true,
      });

      expect(stagedLocal.durationSeconds).toBe(95);
      expect(stagedLocal.creditEstimated).toBe(2);

      const localJob = await dubJobOrchestrator.createJob({
        userId: liveUser.id,
        sourceType: "upload",
        sourceFileId: stagedLocal.sourceFileId,
        targetLanguage: "vi",
        clientType: "web",
      });

      await jobQueueService.processIngestJob(localJob.id);
      const localJobVerified = await dubJobOrchestrator.getJobDetails(
        localJob.id,
        liveUser.id
      );
      expect(localJobVerified.status).toBe("transcribing");
      expect(localJobVerified.creditSpent).toBe(2);

      // 2. Real public YouTube video ("Me at the zoo" - 19 seconds public video: jNQXAC9IVRw)
      const ytUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
      const ytEstimate = await dubJobOrchestrator.estimateJob({
        userId: liveUser.id,
        sourceType: "youtube",
        sourceUrl: ytUrl,
        targetLanguage: "vi",
      });

      expect(ytEstimate.sourceVideoId).toBe("jNQXAC9IVRw");
      expect(ytEstimate.durationSeconds).toBeGreaterThan(0);
      expect(ytEstimate.creditEstimated).toBeGreaterThanOrEqual(1);

      const ytJob = await dubJobOrchestrator.createJob({
        userId: liveUser.id,
        sourceType: "youtube",
        sourceUrl: ytUrl,
        targetLanguage: "vi",
        clientType: "web",
      });

      await jobQueueService.processIngestJob(ytJob.id);
      const ytJobVerified = await dubJobOrchestrator.getJobDetails(
        ytJob.id,
        liveUser.id
      );

      expect(ytJobVerified.status).toBe("transcribing");
      expect(ytJobVerified.progress).toBe(25);
      expect(ytJobVerified.mediaAssets.length).toBe(3);

      // Invariant check: no queued jobs exist without a queue record
      const queuedJobsWithoutQueue = await prisma.dubJob.findMany({
        where: {
          status: "queued",
          queueRecords: { none: {} },
        },
      });
      expect(queuedJobsWithoutQueue).toHaveLength(0);
    },
    30000
  );
});
