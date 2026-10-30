import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { GET as getPlansRoute } from "@/app/api/billing/plans/route";
import { POST as postCheckoutRoute } from "@/app/api/billing/checkout/route";
import { GET as getLedgerRoute } from "@/app/api/billing/ledger/route";
import { GET as getJobsRoute } from "@/app/api/dub-jobs/route";
import { POST as cancelJobRoute } from "@/app/api/dub-jobs/[id]/cancel/route";
import { POST as retryJobRoute } from "@/app/api/dub-jobs/[id]/retry/route";

describe("D6 Integration & Regression: Billing, Credit Ledger, Job Cancel Refund & Plan Upgrade", () => {
  const mock25MinYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `Long 25-Min Documentary (${videoId})`,
    durationSeconds: 1500, // 25 minutes -> 25 credits (exceeds Free 15m limit, fits Pro 60m limit)
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mock25MinYtResolver);
  let userId = "";

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
    await prisma.audioSegment.deleteMany();
    await prisma.subtitleTrack.deleteMany();
    await prisma.voiceAssignment.deleteMany();
    await prisma.voicePreset.deleteMany();
    await prisma.translationSegment.deleteMany();
    await prisma.translation.deleteMany();
    await prisma.glossaryEntry.deleteMany();
    await prisma.transcriptSegmentRevision.deleteMany();
    await prisma.transcriptSegment.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.speaker.deleteMany();
    await prisma.jobEventLog.deleteMany();
    await prisma.creditLedger.deleteMany();
    await prisma.jobQueueRecord.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.dubJob.deleteMany();
    await prisma.uploadedFile.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: "d6-tester@aidub.vn",
        name: "D6 Billing Tester",
        passwordHash: "hashed",
        plan: "free",
        creditBalance: 10,
      },
    });
    userId = user.id;
  });

  it("Regression: blocks Free user on 25-min video, upgrades to Pro via Billing Checkout, creates job, cancels with atomic credit refund, and blocks double refund", async () => {
    // 1. GET /api/billing/plans
    const plansRes = await getPlansRoute();
    expect(plansRes.status).toBe(200);
    const plansData = await plansRes.json();
    expect(plansData.plans.length).toBe(3);

    // 2. Free user cannot create a 25-min (1500s) video job (exceeds 900s limit)
    await expect(
      orchestrator.createJob({
        userId,
        sourceType: "youtube",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        targetLanguage: "vi",
      })
    ).rejects.toMatchObject({
      errorCode: "VIDEO_DURATION_EXCEEDS_PLAN_LIMIT",
    });

    // 3. Upgrade to Pro via POST /api/billing/checkout (+120 credits -> balance = 130)
    const checkoutReq = new NextRequest(
      "http://localhost:3000/api/billing/checkout",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          kind: "plan_upgrade",
          targetPlan: "pro",
        }),
      }
    );
    const checkoutRes = await postCheckoutRoute(checkoutReq);
    expect(checkoutRes.status).toBe(200);
    const checkoutBody = await checkoutRes.json();
    expect(checkoutBody.user.plan).toBe("pro");
    expect(checkoutBody.user.creditBalance).toBe(130);

    // 4. Now creating the 25-min job succeeds (estimated 25 credits)
    const job = await orchestrator.createJob({
      userId,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });
    expect(job.creditEstimated).toBe(25);

    // Run ingest worker -> deducts 25 credits (balance becomes 105, creditSpent = 25)
    await jobQueueService.processIngestJob(job.id);
    const userAfterIngest = await prisma.user.findUnique({
      where: { id: userId },
    });
    expect(userAfterIngest?.creditBalance).toBe(105);

    // 5. Cancel job mid-pipeline -> refunds 25 credits back to 130
    const cancelReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/cancel`,
      {
        method: "POST",
        headers: { "x-user-id": userId },
      }
    );
    const cancelRes = await cancelJobRoute(cancelReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody.status).toBe("canceled");
    expect(cancelBody.refundedCredits).toBe(25);
    expect(cancelBody.creditBalance).toBe(130);

    // Calling cancel a second time is idempotent and does NOT refund a second time
    const cancelReq2 = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/cancel`,
      {
        method: "POST",
        headers: { "x-user-id": userId },
      }
    );
    const cancelRes2 = await cancelJobRoute(cancelReq2, {
      params: Promise.resolve({ id: job.id }),
    });
    const cancelBody2 = await cancelRes2.json();
    expect(cancelBody2.refundedCredits).toBe(0);
    expect(cancelBody2.creditBalance).toBe(130);

    // 6. Verify CreditLedger via GET /api/billing/ledger
    const ledgerReq = new NextRequest(
      "http://localhost:3000/api/billing/ledger",
      {
        method: "GET",
        headers: { "x-user-id": userId },
      }
    );
    const ledgerRes = await getLedgerRoute(ledgerReq);
    expect(ledgerRes.status).toBe(200);
    const ledgerBody = await ledgerRes.json();
    expect(ledgerBody.entries.length).toBe(3); // plan_upgrade (+120), ingest_completed_reservation (-25), job_canceled_refund (+25)
    expect(ledgerBody.entries[0].reason).toBe("job_canceled_refund");
    expect(ledgerBody.entries[0].delta).toBe(25);

    // 7. Retry canceled job via POST /api/dub-jobs/:id/retry and list jobs via GET /api/dub-jobs
    const retryReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/retry`,
      {
        method: "POST",
        headers: { "x-user-id": userId },
      }
    );
    const retryRes = await retryJobRoute(retryReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(retryRes.status).toBe(200);
    const retryBody = await retryRes.json();
    expect(retryBody.status).toBe("queued");

    const listReq = new NextRequest("http://localhost:3000/api/dub-jobs", {
      method: "GET",
      headers: { "x-user-id": userId },
    });
    const listRes = await getJobsRoute(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.jobs).toHaveLength(1);
    expect(listBody.jobs[0].id).toBe(job.id);
  });
});
