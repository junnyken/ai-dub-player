import { prisma } from "@/server/db/prisma";
import {
  EstimatedAgeGroup,
  VoiceDomain,
  VoiceGenderPresentation,
} from "@/domain/models";

export function synthesizePlayableWavDataUri(params: {
  frequencyHz: number;
  durationMs: number;
}): { buffer: Buffer; dataUri: string } {
  const sampleRate = 8000;
  const numSamples = Math.max(
    400,
    Math.floor((params.durationMs / 1000) * sampleRate)
  );
  const dataBytes = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / 200, (numSamples - i) / 200);
    const sample =
      Math.sin(2 * Math.PI * params.frequencyHz * t) * 0.35 * envelope;
    const intVal = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intVal, 44 + i * 2);
  }

  return {
    buffer,
    dataUri: `data:audio/wav;base64,${buffer.toString("base64")}`,
  };
}

const DEFAULT_VI_VOICES: Array<{
  id: string;
  provider: string;
  providerVoiceId: string;
  language: string;
  displayName: string;
  genderPresentation: VoiceGenderPresentation;
  ageGroup: EstimatedAgeGroup;
  styleTags: string[];
  freqHz: number;
}> = [
  {
    id: "voice_vi_minh_adult_m",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Minh-Studio",
    language: "vi",
    displayName: "Minh - Trầm, tự tin",
    genderPresentation: "male",
    ageGroup: "adult",
    styleTags: ["trầm", "tự tin", "phỏng vấn", "thuyết trình"],
    freqHz: 220,
  },
  {
    id: "voice_vi_linh_young_f",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Linh-Studio",
    language: "vi",
    displayName: "Linh - Trẻ trung, gần gũi",
    genderPresentation: "female",
    ageGroup: "young_adult",
    styleTags: ["trẻ trung", "gần gũi", "biểu cảm", "nhân vật chính"],
    freqHz: 330,
  },
  {
    id: "voice_vi_quoc_neutral",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Quoc-Narrator",
    language: "vi",
    displayName: "Quốc - Trung tính, rõ ràng",
    genderPresentation: "neutral",
    ageGroup: "adult",
    styleTags: ["trung tính", "rõ ràng", "dẫn chuyện", "điềm tĩnh"],
    freqHz: 262,
  },
  {
    id: "voice_vi_ha_adult_f",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Ha-Studio",
    language: "vi",
    displayName: "Hà - Ấm áp, truyền cảm",
    genderPresentation: "female",
    ageGroup: "adult",
    styleTags: ["ấm áp", "truyền cảm", "chuyên gia"],
    freqHz: 294,
  },
  {
    id: "voice_vi_khoi_young_m",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Khoi-Studio",
    language: "vi",
    displayName: "Khôi - Năng động, hiện đại",
    genderPresentation: "male",
    ageGroup: "young_adult",
    styleTags: ["năng động", "hiện đại", "sôi nổi"],
    freqHz: 247,
  },
  {
    id: "voice_vi_an_senior_m",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-An-Senior",
    language: "vi",
    displayName: "An - Điềm đạm, từng trải",
    genderPresentation: "male",
    ageGroup: "senior",
    styleTags: ["điềm đạm", "từng trải", "sâu lắng"],
    freqHz: 196,
  },
  {
    id: "voice_vi_y_bo_child_n",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Bo-Animation",
    language: "vi",
    displayName: "Bé Bo - Hoạt hình, nhí nhảnh",
    genderPresentation: "neutral",
    ageGroup: "child",
    styleTags: ["hoạt hình", "nhí nhảnh", "năng động", "nhân vật chính"],
    freqHz: 392,
  },
  {
    id: "voice_vi_z_vy_teen_f",
    provider: "studio-tts-vi",
    providerVoiceId: "vi-VN-Vy-Anime",
    language: "vi",
    displayName: "Vy - Anime, trong trẻo",
    genderPresentation: "female",
    ageGroup: "teen",
    styleTags: ["hoạt hình", "anime", "trong trẻo", "biểu cảm", "nhân vật chính"],
    freqHz: 360,
  },
];

export class VoiceCatalogService {
  public async ensureDefaultVoicesSeeded(): Promise<void> {
    const existingCount = await prisma.voice.count({
      where: { language: "vi", isActive: true },
    });

    if (existingCount >= DEFAULT_VI_VOICES.length) {
      return;
    }

    for (const v of DEFAULT_VI_VOICES) {
      const preview = synthesizePlayableWavDataUri({
        frequencyHz: v.freqHz,
        durationMs: 600,
      });

      await prisma.voice.upsert({
        where: { id: v.id },
        update: {
          displayName: v.displayName,
          genderPresentation: v.genderPresentation,
          ageGroup: v.ageGroup,
          styleTagsJson: JSON.stringify(v.styleTags),
          previewUrl: preview.dataUri,
          isActive: true,
        },
        create: {
          id: v.id,
          provider: v.provider,
          providerVoiceId: v.providerVoiceId,
          language: v.language,
          displayName: v.displayName,
          genderPresentation: v.genderPresentation,
          ageGroup: v.ageGroup,
          styleTagsJson: JSON.stringify(v.styleTags),
          previewUrl: preview.dataUri,
          isActive: true,
        },
      });
    }
  }

  public async listVoices(filters?: {
    language?: string;
    genderPresentation?: VoiceGenderPresentation;
    ageGroup?: EstimatedAgeGroup;
    styleTag?: string;
  }): Promise<VoiceDomain[]> {
    await this.ensureDefaultVoicesSeeded();

    const language = filters?.language ?? "vi";

    const rows = await prisma.voice.findMany({
      where: {
        language,
        isActive: true,
        ...(filters?.genderPresentation
          ? { genderPresentation: filters.genderPresentation }
          : {}),
        ...(filters?.ageGroup ? { ageGroup: filters.ageGroup } : {}),
      },
      orderBy: { id: "asc" },
    });

    const mapped: VoiceDomain[] = rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      providerVoiceId: r.providerVoiceId,
      language: r.language,
      displayName: r.displayName,
      genderPresentation: r.genderPresentation as VoiceGenderPresentation,
      ageGroup: r.ageGroup as EstimatedAgeGroup,
      styleTags: JSON.parse(r.styleTagsJson || "[]"),
      previewUrl: r.previewUrl,
      isActive: r.isActive,
    }));

    if (filters?.styleTag) {
      const tagLower = filters.styleTag.toLowerCase();
      return mapped.filter((v) =>
        v.styleTags.some((t) => t.toLowerCase().includes(tagLower))
      );
    }

    return mapped;
  }
}

export const voiceCatalogService = new VoiceCatalogService();
