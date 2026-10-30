export type ProsodyEmotionType =
  | "excited"
  | "questioning"
  | "dramatic"
  | "calm_narrative";

export interface ProsodyAnalysisResult {
  emotion: ProsodyEmotionType;
  emotionLabelVi: string;
  syllableCount: number;
  pitchContourMultiplier: number;
  energyGain: number;
  lipSyncScore: number;
}

export class ProsodyEmotionEngine {
  public analyzeSentenceProsody(params: {
    text: string;
    slotDurationMs: number;
    voiceGender?: string;
  }): ProsodyAnalysisResult {
    const cleaned = (params.text || "").trim();
    const syllables = cleaned.split(/\s+/).filter(Boolean);
    const syllableCount = Math.max(1, syllables.length);

    let emotion: ProsodyEmotionType = "calm_narrative";
    let emotionLabelVi = "Điềm tĩnh / Tự nhiên";
    let pitchContourMultiplier = 1.0;
    let energyGain = 0.36;

    if (
      cleaned.includes("!") ||
      /\b(kìa|ơi|tuyệt|nhanh lên|bám chắc|cố lên|đợi tớ)\b/i.test(cleaned)
    ) {
      emotion = "excited";
      emotionLabelVi = "Hào hứng / Biểu cảm cao";
      pitchContourMultiplier = 1.14;
      energyGain = 0.42;
    } else if (
      cleaned.includes("?") ||
      /\b(vì sao|tại sao|thế nào|được không|sao vậy|gì thế)\b/i.test(cleaned)
    ) {
      emotion = "questioning";
      emotionLabelVi = "Nghi vấn (Ngữ điệu lên cuối câu)";
      pitchContourMultiplier = 1.12;
      energyGain = 0.38;
    } else if (
      /\b(cúi xuống|yểm trợ|tường lửa|sập nguồn|nguy hiểm|khẩn cấp|cẩn thận)\b/i.test(
        cleaned
      )
    ) {
      emotion = "dramatic";
      emotionLabelVi = "Kịch tính / Dứt khoát";
      pitchContourMultiplier = 1.06;
      energyGain = 0.44;
    }

    const idealMs = syllableCount * 220;
    const slotMs = Math.max(500, params.slotDurationMs);
    const ratio = idealMs / slotMs;
    const lipSyncScore =
      ratio <= 1.05
        ? 0.99
        : ratio <= 1.25
        ? Number((0.98 - (ratio - 1.05) * 0.35).toFixed(2))
        : 0.82;

    return {
      emotion,
      emotionLabelVi,
      syllableCount,
      pitchContourMultiplier,
      energyGain,
      lipSyncScore,
    };
  }

  /**
   * Synthesizes a multi-formant syllabic PCM WAV buffer where each Vietnamese syllable
   * creates a natural vowel-envelope pulse and intonation contour (question rise, excited vibrato, etc.).
   */
  public synthesizeExpressiveSpeechWav(params: {
    baseFrequencyHz: number;
    durationMs: number;
    text: string;
    slotDurationMs: number;
    voiceGender?: string;
  }): {
    buffer: Buffer;
    dataUri: string;
    prosody: ProsodyAnalysisResult;
  } {
    const prosody = this.analyzeSentenceProsody({
      text: params.text,
      slotDurationMs: params.slotDurationMs,
      voiceGender: params.voiceGender,
    });

    const sampleRate = 8000;
    const numSamples = Math.max(
      400,
      Math.floor((params.durationMs / 1000) * sampleRate)
    );
    const dataBytes = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataBytes);

    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(dataBytes, 40);

    const syllableRateHz = Math.max(
      2.5,
      Math.min(6.0, prosody.syllableCount / Math.max(0.4, params.durationMs / 1000))
    );

    let phase1 = 0;
    let phase2 = 0;
    let phase3 = 0;

    for (let i = 0; i < numSamples; i++) {
      const progress = i / numSamples;
      const t = i / sampleRate;

      // Dynamic F0 pitch contour based on sentence emotion
      let pitchFactor = 1.0;
      if (prosody.emotion === "questioning") {
        // Rising intonation in the final 35% of the sentence
        pitchFactor =
          progress > 0.65 ? 1.0 + ((progress - 0.65) / 0.35) * 0.18 : 1.0;
      } else if (prosody.emotion === "excited") {
        pitchFactor = 1.05 + 0.08 * Math.sin(2 * Math.PI * 3.5 * t);
      } else if (prosody.emotion === "dramatic") {
        pitchFactor = 1.04 - 0.06 * progress;
      }

      const instFreq = params.baseFrequencyHz * pitchFactor;
      phase1 += (2 * Math.PI * instFreq) / sampleRate;
      phase2 += (2 * Math.PI * instFreq * 2.0) / sampleRate;
      phase3 += (2 * Math.PI * instFreq * 3.0) / sampleRate;

      // Syllabic mouth-opening envelope + edge fade-in/out
      const edgeFade = Math.min(1, i / 160, (numSamples - i) / 160);
      const syllablePulse =
        0.65 + 0.35 * Math.pow(Math.sin(Math.PI * syllableRateHz * t), 2);

      // 3-harmonic vocal timbre (F0 + F1 + F2)
      const harmonicWave =
        Math.sin(phase1) * 0.68 +
        Math.sin(phase2) * 0.22 +
        Math.sin(phase3) * 0.1;

      const sample =
        harmonicWave * prosody.energyGain * syllablePulse * edgeFade;
      const intVal = Math.max(
        -32768,
        Math.min(32767, Math.floor(sample * 32767))
      );
      buffer.writeInt16LE(intVal, 44 + i * 2);
    }

    return {
      buffer,
      dataUri: `data:audio/wav;base64,${buffer.toString("base64")}`,
      prosody,
    };
  }
}

export const prosodyEmotionEngine = new ProsodyEmotionEngine();
