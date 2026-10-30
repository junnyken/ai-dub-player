import { prisma } from "@/server/db/prisma";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import {
  synthesizePlayableWavDataUri,
  voiceCatalogService,
} from "@/server/services/voice-catalog-service";
import { neuralViTtsEngine } from "@/server/services/neural-vi-tts-engine";
import { storageAdapter } from "@/server/storage/storage-adapter";

export interface GenerateVoicePreviewInput {
  speakerId: string;
  userId: string;
  voiceId?: string;
  sampleText?: string;
}

export class VoicePreviewService {
  public async generateSpeakerVoicePreview(input: GenerateVoicePreviewInput) {
    await voiceCatalogService.ensureDefaultVoicesSeeded();

    const speaker = await prisma.speaker.findUnique({
      where: { id: input.speakerId },
      include: {
        job: true,
        voiceAssignment: true,
        segments: {
          orderBy: { segmentIndex: "asc" },
          take: 1,
          include: {
            translationSegment: true,
          },
        },
      },
    });

    if (!speaker) {
      throw new DomainError(
        404,
        "SPEAKER_NOT_FOUND",
        "Không tìm thấy nhân vật/người nói để nghe thử giọng."
      );
    }

    if (speaker.job.userId !== input.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_SPEAKER_ACCESS",
        "Bạn không có quyền nghe thử giọng của tiến trình này."
      );
    }

    const targetVoiceId = input.voiceId ?? speaker.voiceAssignment?.voiceId;
    if (!targetVoiceId) {
      throw new ValidationDomainError(
        "MISSING_VOICE_ID_FOR_PREVIEW",
        "Vui lòng chọn một giọng đọc tiếng Việt để nghe thử."
      );
    }

    const voice = await prisma.voice.findUnique({
      where: { id: targetVoiceId },
    });

    if (!voice || !voice.isActive || voice.language !== "vi") {
      throw new ValidationDomainError(
        "INVALID_OR_UNSUPPORTED_VOICE",
        "Giọng đọc được chọn không tồn tại hoặc không hỗ trợ tiếng Việt."
      );
    }

    const firstSegment = speaker.segments[0];
    const sampleText =
      input.sampleText?.trim() ||
      firstSegment?.translationSegment?.translatedText ||
      firstSegment?.sourceText ||
      `Xin chào, đây là giọng thử nghiệm của ${voice.displayName} cho nhân vật ${speaker.displayName}.`;

    const freqHz =
      voice.genderPresentation === "female"
        ? 320
        : voice.genderPresentation === "male"
        ? 215
        : 260;
    const durationMs = Math.min(
      4000,
      Math.max(1200, sampleText.length * 45)
    );

    if (!process.env.VITEST) {
      const voiceHint = `${voice.providerVoiceId}_${voice.id}_${voice.genderPresentation}`;
      const realMp3 =
        await neuralViTtsEngine.synthesizeRealVietnameseMp3(
          sampleText,
          voiceHint
        );
      if (realMp3) {
        const storageKey = `previews/${speaker.jobId}/${speaker.id}_${voice.id}.mp3`;
        await storageAdapter.putObject({
          storageKey,
          body: realMp3.buffer,
          mimeType: "audio/mpeg",
        });

        return {
          speakerId: speaker.id,
          speakerDisplayName: speaker.displayName,
          voiceId: voice.id,
          voiceDisplayName: voice.displayName,
          sampleText,
          durationMs,
          storageKey,
          previewAudioUrl: realMp3.dataUri,
        };
      }
    }

    const wav = synthesizePlayableWavDataUri({
      frequencyHz: freqHz,
      durationMs,
    });

    const storageKey = `previews/${speaker.jobId}/${speaker.id}_${voice.id}.wav`;
    await storageAdapter.putObject({
      storageKey,
      body: wav.buffer,
      mimeType: "audio/wav",
    });

    return {
      speakerId: speaker.id,
      speakerDisplayName: speaker.displayName,
      voiceId: voice.id,
      voiceDisplayName: voice.displayName,
      sampleText,
      durationMs,
      storageKey,
      previewAudioUrl: wav.dataUri,
    };
  }
}

export const voicePreviewService = new VoicePreviewService();
