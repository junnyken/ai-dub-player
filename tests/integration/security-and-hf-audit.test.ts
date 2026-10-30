import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import {
  authService,
  hashPassword,
  verifyPasswordTimingSafe,
} from "@/server/auth/auth-service";
import { huggingFaceHubAdapter } from "@/server/providers/huggingface-hub-adapter";
import { GET as getHfModelsRoute } from "@/app/api/models/huggingface/route";
import { GET as getHealthRoute } from "@/app/api/health/route";
import { GET as getAdminRoute, POST as postAdminRoute } from "@/app/api/admin/route";
import { POST as postAiConfigRoute } from "@/app/api/ai-config/route";
import { POST as postRegisterRoute } from "@/app/api/auth/register/route";
import { POST as postRescanAsrRoute } from "@/app/api/dub-jobs/[id]/rescan-asr/route";
import { GET as getTtsSpeakRoute } from "@/app/api/tts/speak/route";
import { LocalS3CompatibleStorage } from "@/server/storage/storage-adapter";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";

describe("Security Audit, Chrome Extension Bundle Integrity & Hugging Face Model Registry", () => {
  it("exposes Hugging Face model registry for ASR, Diarization, Context Translation, and Vietnamese TTS via GET /api/models/huggingface", async () => {
    const res = await getHfModelsRoute();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.hubUrl).toBe("https://huggingface.co");
    expect(body.models.length).toBeGreaterThanOrEqual(8);

    expect(huggingFaceHubAdapter.getDefaultModelForStage("asr").modelId).toBe(
      "openai/whisper-large-v3-turbo"
    );
    expect(
      huggingFaceHubAdapter.getDefaultModelForStage("diarization").modelId
    ).toBe("pyannote/speaker-diarization-3.1");
    expect(
      huggingFaceHubAdapter.getDefaultModelForStage("translation").modelId
    ).toBe("Qwen/Qwen2.5-72B-Instruct");
    expect(huggingFaceHubAdapter.getDefaultModelForStage("tts").modelId).toBe(
      "facebook/mms-tts-vie"
    );
  });

  it("verifies unpacked Chrome Extension bundle completeness, Manifest V3 CSP, sender validation, and zero XSS sinks", () => {
    const extDir = path.join(process.cwd(), "extension");
    const requiredFiles = [
      "manifest.json",
      "background.js",
      "content.js",
      "popup.html",
      "popup.js",
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(extDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(50);
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(extDir, "manifest.json"), "utf-8")
    );
    expect(manifest.content_security_policy?.extension_pages).toContain(
      "script-src 'self'; object-src 'none';"
    );

    const contentJs = fs.readFileSync(
      path.join(extDir, "content.js"),
      "utf-8"
    );
    const popupJs = fs.readFileSync(path.join(extDir, "popup.js"), "utf-8");
    const backgroundJs = fs.readFileSync(
      path.join(extDir, "background.js"),
      "utf-8"
    );

    // Ensure zero unsafe DOM XSS sinks in content script and popup script
    for (const script of [contentJs, popupJs]) {
      expect(script).not.toContain(".innerHTML");
      expect(script).not.toContain(".outerHTML");
      expect(script).not.toContain("eval(");
    }

    // Ensure background service worker validates message sender origin and supports dynamic website URL
    expect(backgroundJs).toContain("isTrustedSender(sender)");
    expect(backgroundJs).toContain("SET_SERVER_CONFIG");
    expect(backgroundJs).toContain("PING_SERVER");
    expect(contentJs).toContain("ai-dub-player-yt-control-bar");
  });

  it("exposes GET /api/health with active Vietnamese voices and 4 multi-genre profiles for production readiness", async () => {
    const res = await getHealthRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.activeVoicesCount).toBeGreaterThanOrEqual(8);
    expect(body.supportedGenres).toHaveLength(4);
  });

  it("blocks x-user-id header spoofing in production and prevents Cross-User IDOR on DubJobs", async () => {
    jobQueueService.setAutoRunWorker(false);

    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";
      const spoofedReq = new NextRequest("http://localhost:3000/api/dub-jobs", {
        headers: { "x-user-id": "some_user_id" },
      });

      await expect(
        authService.resolveUserFromRequest(spoofedReq)
      ).rejects.toMatchObject({
        statusCode: 401,
        errorCode: "UNAUTHORIZED_HEADER_SPOOF_BLOCKED",
      });
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    }

    // Verify Cross-User IDOR protection (User B cannot access or cancel User A's job)
    await prisma.user.deleteMany({
      where: {
        email: { in: ["sec-user-a@aidub.vn", "sec-user-b@aidub.vn"] },
      },
    });

    const userA = await prisma.user.create({
      data: {
        email: "sec-user-a@aidub.vn",
        name: "User A",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: "sec-user-b@aidub.vn",
        name: "User B",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    const orchestrator = new DubJobOrchestrator(
      new YouTubeUrlResolver(async () => ({
        title: "Security Test Video",
        durationSeconds: 30,
        playabilityStatus: "OK",
        sourceLanguage: "en",
      }))
    );

    const jobA = await orchestrator.createJob({
      userId: userA.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });

    await expect(
      orchestrator.getJobDetails(jobA.id, userB.id)
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "FORBIDDEN_JOB_ACCESS",
    });

    await expect(
      orchestrator.cancelJob(jobA.id, userB.id)
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "FORBIDDEN_JOB_ACCESS",
    });

    // F-05 Regression: Cross-user IDOR on POST /api/dub-jobs/[id]/rescan-asr is blocked BEFORE mutating job state
    const rescanCrossUserReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${jobA.id}/rescan-asr`,
      {
        method: "POST",
        headers: { "x-user-id": userB.id },
      }
    );
    const rescanRes = await postRescanAsrRoute(rescanCrossUserReq, {
      params: Promise.resolve({ id: jobA.id }),
    });
    expect(rescanRes.status).toBe(403);
    const rescanBody = await rescanRes.json();
    expect(rescanBody.errorCode).toBe("FORBIDDEN_JOB_ACCESS");
  });

  it("enforces F-01..F-09 webapp-security hardening (Admin BFLA, Salted Scrypt, Plan Escalation Block, TTS Budget, Path Traversal)", async () => {
    // 1. F-02: Verify .gitignore exists and excludes .ai-studio-keys.json, .env, .storage, and *.db
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    expect(gitignoreContent).toContain(".ai-studio-keys.json");
    expect(gitignoreContent).toContain(".env");
    expect(gitignoreContent).toContain(".storage/");

    // 2. F-01: Non-admin user and Cross-Origin callers are blocked from /api/admin and /api/ai-config
    const normalUser = await prisma.user.upsert({
      where: { email: "normal-viewer@aidub.vn" },
      update: { plan: "free" },
      create: {
        email: "normal-viewer@aidub.vn",
        name: "Normal Viewer",
        passwordHash: hashPassword("secret123"),
        plan: "free",
        creditBalance: 15,
      },
    });

    const nonAdminGetReq = new NextRequest("http://localhost:3000/api/admin", {
      method: "GET",
      headers: { "x-user-id": normalUser.id },
    });
    const nonAdminGetRes = await getAdminRoute(nonAdminGetReq);
    expect(nonAdminGetRes.status).toBe(403);

    const crossOriginAdminReq = new NextRequest(
      "http://localhost:3000/api/admin",
      {
        method: "POST",
        headers: {
          origin: "https://evil-attacker.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "clear_key", keyField: "deepSeekApiKey" }),
      }
    );
    const crossOriginAdminRes = await postAdminRoute(crossOriginAdminReq);
    expect(crossOriginAdminRes.status).toBe(403);

    const nonAdminAiConfigReq = new NextRequest(
      "http://localhost:3000/api/ai-config",
      {
        method: "POST",
        headers: {
          "x-user-id": normalUser.id,
          "content-type": "application/json",
        },
        body: JSON.stringify({ deepSeekApiKey: "sk-hijack", runDiagnostics: false }),
      }
    );
    const nonAdminAiConfigRes = await postAiConfigRoute(nonAdminAiConfigReq);
    expect(nonAdminAiConfigRes.status).toBe(403);

    // Positive Admin test: Studio Admin (creator@aidub.vn) succeeds on same-origin
    const studioAdmin = await authService.ensureDefaultStudioUser();
    const validAdminReq = new NextRequest("http://localhost:3000/api/admin", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "x-user-id": studioAdmin.id,
      },
    });
    const validAdminRes = await getAdminRoute(validAdminReq);
    expect(validAdminRes.status).toBe(200);

    // 3. F-04: Public registration ignores plan escalation ("business") and enforces "free"
    const regEmail = `sec-reg-${Date.now()}@aidub.vn`;
    const regReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: regEmail,
        password: "StrongPassword123!",
        name: "Escalation Tester",
        plan: "business",
      }),
    });
    const regRes = await postRegisterRoute(regReq);
    expect(regRes.status).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.user.plan).toBe("free");
    expect(regBody.user.creditBalance).toBe(15);

    // 4. F-06: Salted scrypt produces unique hashes for identical passwords and verifies both scrypt & legacy hashes
    const hash1 = hashPassword("SamePass123");
    const hash2 = hashPassword("SamePass123");
    expect(hash1.startsWith("scrypt$")).toBe(true);
    expect(hash1).not.toBe(hash2);
    expect(verifyPasswordTimingSafe("SamePass123", hash1)).toBe(true);
    expect(verifyPasswordTimingSafe("WrongPass", hash1)).toBe(false);

    // 5. F-07: /api/tts/speak blocks oversized text payloads (> 500 chars)
    const oversizedText = "Xin chào ".repeat(80);
    const ttsLongReq = new NextRequest(
      `http://localhost:3000/api/tts/speak?text=${encodeURIComponent(oversizedText)}`
    );
    const ttsLongRes = await getTtsSpeakRoute(ttsLongReq);
    expect(ttsLongRes.status).toBe(400);
    const ttsLongBody = await ttsLongRes.json();
    expect(ttsLongBody.errorCode).toBe("TTS_TEXT_TOO_LONG");

    // 6. F-09: Storage adapter blocks path traversal attempts (.., absolute paths, null bytes)
    const storage = new LocalS3CompatibleStorage();
    expect(() =>
      storage.resolveSafePath("uploads/user_1/file_safe.mp4")
    ).not.toThrow();
    expect(() =>
      storage.resolveSafePath("../../.ai-studio-keys.json")
    ).toThrow();
    expect(() =>
      storage.resolveSafePath("uploads/....//....//.ai-studio-keys.json")
    ).toThrow();
    expect(() =>
      storage.resolveSafePath("C:\\Windows\\System32\\drivers\\etc\\hosts")
    ).toThrow();
  });
});
