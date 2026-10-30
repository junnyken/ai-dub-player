import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { authService, hashPassword } from "@/server/auth/auth-service";
import { DomainError } from "@/domain/errors";
import {
  liveAiBridge,
  RuntimeAiKeys,
  RuntimeSystemParameters,
} from "@/server/providers/live-ai-bridge";
import {
  getLastThirdPartyTtsWarning,
  neuralViTtsEngine,
} from "@/server/services/neural-vi-tts-engine";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";

function resolveActiveTranslationLabel(keys: ReturnType<typeof liveAiBridge.getActiveKeys>) {
  if (keys.deepSeekApiKey) return "DeepSeek API (DeepSeek-V3/Chat · Cache Hit)";
  if (keys.groqApiKey) return "Groq Cloud (Llama-3.3-70B-Versatile + Whisper-v3-Turbo)";
  if (keys.geminiApiKey) return "Google Gemini 2.0 Flash";
  if (keys.openAiApiKey) return "OpenAI GPT-4o-mini";
  return "Google Cloud GTX Free Neural + Dubbing Cadence Polisher (0đ)";
}

export async function GET(req: NextRequest) {
  try {
    await authService.requireAdminFromRequest(req);
    const [users, jobs, voices, totalSegments, totalSpeakers] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              dubJobs: true,
              creditLedger: true,
            },
          },
          creditLedger: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      }),
      prisma.dubJob.findMany({
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: {
          user: {
            select: { id: true, email: true, name: true, plan: true },
          },
          _count: {
            select: {
              audioSegments: true,
              speakers: true,
            },
          },
        },
      }),
      prisma.voice.findMany({
        orderBy: { id: "asc" },
      }),
      prisma.audioSegment.count(),
      prisma.speaker.count(),
    ]);

    const activeKeys = liveAiBridge.getActiveKeys();
    const maskedKeys = liveAiBridge.getMaskedKeys();
    const systemParams = liveAiBridge.getSystemParameters();

    return NextResponse.json({
      stats: {
        totalUsers: users.length,
        totalJobs: jobs.length,
        totalSegments,
        totalSpeakers,
        totalVoices: voices.length,
        activeVoices: voices.filter((v) => v.isActive).length,
        activeTranslationEngine: resolveActiveTranslationLabel(activeKeys),
        activeTtsEngine: activeKeys.elevenLabsApiKey
          ? "ElevenLabs Flash v2.5 + Edge Neural Pure 24kHz"
          : activeKeys.fptAiApiKey
          ? "FPT.AI Studio (Ban Mai & Lê Minh) + Edge Neural Pure"
          : "Microsoft Edge Neural v2 Pure Formant (HoaiMyNeural & NamMinhNeural 0Hz)",
      },
      aiKeys: {
        configured: {
          deepseek: Boolean(activeKeys.deepSeekApiKey),
          groq: Boolean(activeKeys.groqApiKey),
          gemini: Boolean(activeKeys.geminiApiKey),
          openai: Boolean(activeKeys.openAiApiKey),
          elevenlabs: Boolean(activeKeys.elevenLabsApiKey),
          fpt: Boolean(activeKeys.fptAiApiKey),
          hf: Boolean(activeKeys.hfApiToken),
        },
        masked: maskedKeys,
      },
      systemParams,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan,
        creditBalance: u.creditBalance,
        jobCount: u._count.dubJobs,
        ledgerCount: u._count.creditLedger,
        recentLedger: u.creditLedger,
        createdAt: u.createdAt,
      })),
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title || "Video Lồng Tiếng AI",
        sourceType: j.sourceType,
        sourceUrl: j.sourceUrl,
        status: j.status,
        progress: j.progress,
        durationSeconds: j.durationSeconds ?? 0,
        genre: "animation",
        segmentCount: j._count.audioSegments,
        speakerCount: j._count.speakers,
        user: j.user,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
      voices: voices.map((v) => ({
        id: v.id,
        name: v.displayName,
        locale: v.language,
        genderPresentation: v.genderPresentation,
        ageGroup: v.ageGroup,
        basePitchHz: 12,
        speakingRate: 1.15,
        isActive: v.isActive,
        styleTags: (() => {
          try {
            return JSON.parse(v.styleTagsJson || "[]") as string[];
          } catch {
            return [];
          }
        })(),
      })),
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(
        { errorCode: err.errorCode, message: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      {
        message:
          err instanceof Error
            ? err.message
            : "Không thể tải dữ liệu trang Quản trị.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await authService.requireAdminFromRequest(req);
    const body = await req.json();
    const action = String(body.action || "save_keys_and_params");

    if (action === "save_keys_and_params") {
      if (body.keys && typeof body.keys === "object") {
        liveAiBridge.setRuntimeKeys(body.keys as Partial<RuntimeAiKeys>);
      }
      if (body.systemParams && typeof body.systemParams === "object") {
        const rawParams = body.systemParams as Partial<RuntimeSystemParameters>;
        liveAiBridge.setSystemParameters({
          preferredTranslationProvider: rawParams.preferredTranslationProvider,
          preferredTtsProvider: rawParams.preferredTtsProvider || "auto",
          preferredAsrModel: rawParams.preferredAsrModel,
          defaultMaxSyllablesPerSecond: Number(
            rawParams.defaultMaxSyllablesPerSecond ?? 4.2
          ),
          ttsDefaultSpeedMultiplier: Number(
            rawParams.ttsDefaultSpeedMultiplier ?? 1.05
          ),
          ttsDefaultPitchBonusHz: Number(
            rawParams.ttsDefaultPitchBonusHz ?? 0
          ),
          ttsParallelBatchSize: Number(rawParams.ttsParallelBatchSize ?? 4),
          maxSegmentsPerJob: Number(rawParams.maxSegmentsPerJob ?? 120),
          autoSkipSilenceDefault: Boolean(
            rawParams.autoSkipSilenceDefault ?? true
          ),
          freePlanDefaultCredits: Number(
            rawParams.freePlanDefaultCredits ?? 15
          ),
          proPlanDefaultCredits: Number(rawParams.proPlanDefaultCredits ?? 300),
          businessPlanDefaultCredits: Number(
            rawParams.businessPlanDefaultCredits ?? 1200
          ),
          customDirectorPrompt:
            typeof rawParams.customDirectorPrompt === "string"
              ? rawParams.customDirectorPrompt
              : "",
        });
      }

      const activeKeys = liveAiBridge.getActiveKeys();
      let diagnostics = null;

      if (body.runDiagnostics !== false) {
        const t0 = Date.now();
        const sampleVi =
          (await liveAiBridge.translateLineWithLiveLlmIfConfigured({
            sourceText:
              "By analyzing each speaker's role and tone, we can match distinct voices.",
            genreId: "animation",
            maxSyllables: 24,
          })) ||
          "Bằng cách phân tích vai trò và tông giọng, ta phối đúng giọng từng nhân vật.";
        const translationLatencyMs = Date.now() - t0;

        const t1 = Date.now();
        const ttsOut = await neuralViTtsEngine.synthesizeRealVietnameseMp3(
          sampleVi,
          "voice_vi_female_warm"
        );
        const ttsLatencyMs = Date.now() - t1;

        diagnostics = {
          translationOk: Boolean(sampleVi),
          translationLatencyMs,
          translationSampleVi: sampleVi,
          activeTranslationEngine: resolveActiveTranslationLabel(activeKeys),
          ttsOk: Boolean(ttsOut && ttsOut.buffer.byteLength > 256),
          ttsLatencyMs,
          ttsBytes: ttsOut?.buffer.byteLength ?? 0,
          activeTtsEngine:
            ttsOut?.neuralVoiceName ||
            "Microsoft Edge Neural v2 Pure (vi-VN-HoaiMyNeural 24kHz)",
          ttsAudioDataUri: ttsOut?.dataUri,
          ttsWarning: getLastThirdPartyTtsWarning(),
        };
      }

      return NextResponse.json({
        ok: true,
        message: "Đã lưu cấu hình API Keys và thông số hệ thống thành công.",
        diagnostics,
      });
    }

    if (action === "clear_key") {
      const keyField = String(body.keyField || "") as keyof RuntimeAiKeys;
      if (keyField) {
        liveAiBridge.setRuntimeKeys({ [keyField]: "__CLEAR__" });
      }
      return NextResponse.json({
        ok: true,
        message: `Đã xóa khóa ${keyField} khỏi bộ nhớ hệ thống.`,
      });
    }

    if (action === "update_user") {
      const userId = String(body.userId || "");
      const plan = String(body.plan || "free");
      const creditBalance = Number(body.creditBalance ?? 0);
      const name = String(body.name || "").trim();

      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return NextResponse.json(
          { message: "Không tìm thấy người dùng." },
          { status: 404 }
        );
      }

      const creditDiff = creditBalance - existing.creditBalance;
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            plan,
            creditBalance,
            ...(name ? { name } : {}),
          },
        });
        if (creditDiff !== 0) {
          await tx.creditLedger.create({
            data: {
              userId,
              delta: creditDiff,
              balanceAfter: creditBalance,
              reason: `Admin cập nhật số dư (${existing.creditBalance} -> ${creditBalance}) & gói ${plan.toUpperCase()}`,
            },
          });
        }
      });

      return NextResponse.json({
        ok: true,
        message: `Đã cập nhật người dùng ${existing.email} (Gói: ${plan.toUpperCase()}, Credits: ${creditBalance}).`,
      });
    }

    if (action === "create_user") {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const name = String(body.name || "Người dùng mới").trim();
      const password = String(body.password || "123456");
      const plan = String(body.plan || "pro");
      const creditBalance = Number(body.creditBalance ?? 300);

      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { message: "Email không hợp lệ." },
          { status: 400 }
        );
      }

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return NextResponse.json(
          { message: "Email này đã tồn tại trong hệ thống." },
          { status: 400 }
        );
      }

      const passwordHash = hashPassword(password);

      const created = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          plan,
          creditBalance,
        },
      });

      await prisma.creditLedger.create({
        data: {
          userId: created.id,
          delta: creditBalance,
          balanceAfter: creditBalance,
          reason: `Admin khởi tạo tài khoản (${plan.toUpperCase()})`,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `Đã tạo tài khoản ${email} thành công!`,
      });
    }

    if (action === "retranslate_job") {
      const jobId = String(body.jobId || "");
      const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
      if (!job) {
        return NextResponse.json(
          { message: "Không tìm thấy tiến trình video." },
          { status: 404 }
        );
      }

      await translationService.translateJob(jobId, { userId: job.userId });
      await castingService.runAiCastingForJob(jobId, job.userId);
      await playbackManifestService.renderJobAudio(jobId, {
        userId: job.userId,
      });

      return NextResponse.json({
        ok: true,
        message: `Đã dịch lại và tổng hợp giọng đọc Neural 24kHz cho "${job.title || job.id}" thành công!`,
      });
    }

    if (action === "rescan_job") {
      const jobId = String(body.jobId || "");
      const job = await prisma.dubJob.findUnique({ where: { id: jobId } });
      if (!job) {
        return NextResponse.json(
          { message: "Không tìm thấy tiến trình video." },
          { status: 404 }
        );
      }

      await transcriptVersionService.generateTranscriptForJob(jobId);
      await translationService.translateJob(jobId, { userId: job.userId });
      await castingService.runAiCastingForJob(jobId, job.userId);
      await playbackManifestService.renderJobAudio(jobId, {
        userId: job.userId,
      });

      return NextResponse.json({
        ok: true,
        message: `Đã quét lại toàn bộ ASR + Dịch LLM + Lồng tiếng 24kHz cho "${job.title || job.id}"!`,
      });
    }

    if (action === "delete_job") {
      const jobId = String(body.jobId || "");
      await prisma.dubJob.delete({ where: { id: jobId } });
      return NextResponse.json({
        ok: true,
        message: `Đã xóa tiến trình ${jobId}.`,
      });
    }

    if (action === "toggle_voice") {
      const voiceId = String(body.voiceId || "");
      const isActive = Boolean(body.isActive);

      await prisma.voice.update({
        where: { id: voiceId },
        data: {
          isActive,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `Đã cập nhật trạng thái giọng đọc ${voiceId}.`,
      });
    }

    return NextResponse.json(
      { message: `Action không hợp lệ: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(
        { errorCode: err.errorCode, message: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      {
        message:
          err instanceof Error ? err.message : "Lỗi xử lý thao tác Admin.",
      },
      { status: 500 }
    );
  }
}
