import { TimingStrategy } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";

export interface TimingAlignmentInput {
  startMs: number;
  endMs: number;
  rawDurationMs: number;
  translatedText: string;
}

export interface TimingAlignmentOutput {
  startMs: number;
  endMs: number;
  slotDurationMs: number;
  rawDurationMs: number;
  alignedDurationMs: number;
  playbackRate: number;
  timingStrategy: TimingStrategy;
  textPreserved: string;
  syllableCount: number;
  effectiveSyllablesPerSecond: number;
  fitsWithinSpeakerSlot: boolean;
}

export class TimingAligner {
  public alignSegment(input: TimingAlignmentInput): TimingAlignmentOutput {
    if (input.endMs <= input.startMs || input.startMs < 0) {
      throw new ValidationDomainError(
        "INVALID_ALIGNMENT_WINDOW",
        `Khung thời gian gốc không hợp lệ (${input.startMs}ms -> ${input.endMs}ms).`
      );
    }

    if (input.rawDurationMs <= 0) {
      throw new ValidationDomainError(
        "INVALID_RAW_TTS_DURATION",
        "Thời lượng âm thanh TTS phải lớn hơn 0ms."
      );
    }

    const slotDurationMs = input.endMs - input.startMs;
    const ratio = input.rawDurationMs / slotDurationMs;
    const syllableCount = input.translatedText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    // Constraint 3 & 4: NEVER truncate or cut dialogue text (`textPreserved = input.translatedText`)
    if (ratio <= 1.0) {
      const alignedDurationMs = input.rawDurationMs;
      return {
        startMs: input.startMs,
        endMs: input.endMs,
        slotDurationMs,
        rawDurationMs: input.rawDurationMs,
        alignedDurationMs,
        playbackRate: 1.0,
        timingStrategy: "natural",
        textPreserved: input.translatedText,
        syllableCount,
        effectiveSyllablesPerSecond: Number(
          ((syllableCount * 1000) / alignedDurationMs).toFixed(2)
        ),
        fitsWithinSpeakerSlot: alignedDurationMs <= slotDurationMs,
      };
    }

    if (ratio <= 1.15) {
      // Silence compression trims leading/trailing pauses to fit within slotDurationMs
      const alignedDurationMs = slotDurationMs;
      return {
        startMs: input.startMs,
        endMs: input.endMs,
        slotDurationMs,
        rawDurationMs: input.rawDurationMs,
        alignedDurationMs,
        playbackRate: Number(Math.min(1.08, ratio).toFixed(2)),
        timingStrategy: "silence_compression",
        textPreserved: input.translatedText,
        syllableCount,
        effectiveSyllablesPerSecond: Number(
          ((syllableCount * 1000) / alignedDurationMs).toFixed(2)
        ),
        fitsWithinSpeakerSlot: true,
      };
    }

    if (ratio <= 1.35) {
      // Slight speedup up to 1.25x
      const speedupRate = Number(Math.min(1.25, ratio).toFixed(2));
      const alignedDurationMs = Math.min(
        slotDurationMs,
        Math.round(input.rawDurationMs / speedupRate)
      );
      return {
        startMs: input.startMs,
        endMs: input.endMs,
        slotDurationMs,
        rawDurationMs: input.rawDurationMs,
        alignedDurationMs,
        playbackRate: speedupRate,
        timingStrategy: "slight_speedup",
        textPreserved: input.translatedText,
        syllableCount,
        effectiveSyllablesPerSecond: Number(
          ((syllableCount * 1000) / alignedDurationMs).toFixed(2)
        ),
        fitsWithinSpeakerSlot: alignedDurationMs <= slotDurationMs,
      };
    }

    // Over 1.35x -> mark timing_conflict, cap speedup at 1.25x, never cut dialogue words!
    const maxSafeRate = 1.25;
    const alignedDurationMs = Math.round(input.rawDurationMs / maxSafeRate);
    return {
      startMs: input.startMs,
      endMs: input.endMs,
      slotDurationMs,
      rawDurationMs: input.rawDurationMs,
      alignedDurationMs,
      playbackRate: maxSafeRate,
      timingStrategy: "timing_conflict",
      textPreserved: input.translatedText,
      syllableCount,
      effectiveSyllablesPerSecond: Number(
        ((syllableCount * 1000) / alignedDurationMs).toFixed(2)
      ),
      fitsWithinSpeakerSlot: alignedDurationMs <= slotDurationMs,
    };
  }
}

export const timingAligner = new TimingAligner();
