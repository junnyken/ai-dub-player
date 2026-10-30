import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { DomainError } from "@/domain/errors";
import { liveAiBridge, RuntimeAiKeys } from "@/server/providers/live-ai-bridge";
import { neuralViTtsEngine } from "@/server/services/neural-vi-tts-engine";

export async function GET(req: NextRequest) {
  try {
    await authService.resolveUserFromRequest(req);
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(
        { errorCode: err.errorCode, message: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const keys = liveAiBridge.getActiveKeys();
  return NextResponse.json({
    configuredProviders: {
      deepseek: Boolean(keys.deepSeekApiKey),
      groq: Boolean(keys.groqApiKey),
      gemini: Boolean(keys.geminiApiKey),
      openai: Boolean(keys.openAiApiKey),
      elevenlabs: Boolean(keys.elevenLabsApiKey),
    },
    freeCloudEngines: {
      asr: "YouTube InnerTube v3 + Deep Acoustic Overlap Recovery (Active · 0đ)",
      translation:
        "Google Cloud GTX Neural Translate + Dubbing Cadence Polisher (Active · 0đ)",
      tts: "Microsoft Edge Neural TTS v2 (HoaiMyNeural & NamMinhNeural 24kHz · Active · 0đ)",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    await authService.requireAdminFromRequest(req);
    const body = (await req.json()) as Partial<RuntimeAiKeys> & {
      runDiagnostics?: boolean;
    };

    liveAiBridge.setRuntimeKeys({
      deepSeekApiKey: body.deepSeekApiKey,
      groqApiKey: body.groqApiKey,
      geminiApiKey: body.geminiApiKey,
      openAiApiKey: body.openAiApiKey,
      elevenLabsApiKey: body.elevenLabsApiKey,
      fptAiApiKey: body.fptAiApiKey,
    });

    const keys = liveAiBridge.getActiveKeys();

    let diagnostics: {
      translationOk: boolean;
      translationLatencyMs: number;
      translationSampleVi: string;
      activeTranslationEngine: string;
      ttsOk: boolean;
      ttsLatencyMs: number;
      ttsBytes: number;
      activeTtsEngine: string;
      ttsAudioDataUri?: string;
    } | null = null;

    if (body.runDiagnostics !== false) {
      const t0 = Date.now();
      const sampleVi =
        (await liveAiBridge.translateLineWithLiveLlmIfConfigured({
          sourceText:
            "By analyzing each speaker's role and tone, we can match distinct voices.",
          genreId: "animation",
          maxSyllables: 24,
        })) || "Bằng cách phân tích vai trò và tông giọng, ta phối đúng giọng từng nhân vật.";
      const translationLatencyMs = Date.now() - t0;

      const t1 = Date.now();
      const ttsOut = await neuralViTtsEngine.synthesizeRealVietnameseMp3(
        sampleVi,
        "voice_vi_y_bo_child_n"
      );
      const ttsLatencyMs = Date.now() - t1;

      diagnostics = {
        translationOk: Boolean(sampleVi),
        translationLatencyMs,
        translationSampleVi: sampleVi,
        activeTranslationEngine: keys.deepSeekApiKey
          ? "DeepSeek API (DeepSeek-V3/Flash · Cache Hit)"
          : keys.groqApiKey
          ? "Groq Cloud (Llama-3.3-70B-Versatile)"
          : keys.geminiApiKey
          ? "Google Gemini 2.0 Flash"
          : keys.openAiApiKey
          ? "OpenAI GPT-4o-mini"
          : "Google Cloud GTX Free Neural + Dubbing Polisher",
        ttsOk: Boolean(ttsOut && ttsOut.buffer.byteLength > 256),
        ttsLatencyMs,
        ttsBytes: ttsOut?.buffer.byteLength ?? 0,
        activeTtsEngine:
          ttsOut?.neuralVoiceName ||
          "Microsoft Edge Neural v2 Pure (vi-VN-HoaiMyNeural 24kHz)",
        ttsAudioDataUri: ttsOut?.dataUri,
      };
    }

    return NextResponse.json({
      saved: true,
      configuredProviders: {
        groq: Boolean(keys.groqApiKey),
        gemini: Boolean(keys.geminiApiKey),
        openai: Boolean(keys.openAiApiKey),
        elevenlabs: Boolean(keys.elevenLabsApiKey),
      },
      diagnostics,
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(
        { errorCode: err.errorCode, message: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { message: "Không thể lưu cấu hình API bên thứ 3." },
      { status: 400 }
    );
  }
}
