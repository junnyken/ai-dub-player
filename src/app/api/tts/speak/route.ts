import { NextRequest, NextResponse } from "next/server";
import { neuralViTtsEngine } from "@/server/services/neural-vi-tts-engine";
import { prosodyEmotionEngine } from "@/server/services/prosody-emotion-engine";

const MAX_TTS_TEXT_CHARS = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const ttsRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkTtsRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const bucket = ttsRateLimitBuckets.get(clientKey);
  if (!bucket || now >= bucket.resetAt) {
    ttsRateLimitBuckets.set(clientKey, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") || "").trim();
  const voiceId = (req.nextUrl.searchParams.get("voiceId") || "").trim();
  const format = (req.nextUrl.searchParams.get("format") || "").trim();

  if (!text) {
    return NextResponse.json(
      { errorCode: "EMPTY_TTS_TEXT", message: "Thiếu nội dung văn bản cần đọc." },
      { status: 400 }
    );
  }

  if (text.length > MAX_TTS_TEXT_CHARS) {
    return NextResponse.json(
      {
        errorCode: "TTS_TEXT_TOO_LONG",
        message: `Văn bản cần đọc vượt quá giới hạn cho phép (${MAX_TTS_TEXT_CHARS} ký tự).`,
      },
      { status: 400 }
    );
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local_client";
  if (!checkTtsRateLimit(clientIp)) {
    return NextResponse.json(
      {
        errorCode: "RATE_LIMIT_EXCEEDED",
        message: "Quá nhiều yêu cầu tổng hợp giọng nói. Vui lòng thử lại sau ít giây.",
      },
      { status: 429 }
    );
  }

  const realMp3 = await neuralViTtsEngine.synthesizeRealVietnameseMp3(
    text,
    voiceId
  );
  if (realMp3) {
    if (format === "json") {
      return NextResponse.json({
        audioDataUrl: realMp3.dataUri,
        mimeType: realMp3.mimeType,
        neuralVoiceName: realMp3.neuralVoiceName,
        wordCues: realMp3.wordCues,
      });
    }
    return new NextResponse(new Uint8Array(realMp3.buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Neural-Voice": realMp3.neuralVoiceName,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Offline fallback WAV
  const fallbackWav = prosodyEmotionEngine.synthesizeExpressiveSpeechWav({
    baseFrequencyHz:
      voiceId.includes("female") ||
      voiceId.includes("linh") ||
      voiceId.includes("bo") ||
      voiceId.includes("vy")
        ? 315
        : 220,
    durationMs: 1200,
    text,
    slotDurationMs: 3000,
  });

  return new NextResponse(new Uint8Array(fallbackWav.buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
