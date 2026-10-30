import {
  LOW_CONFIDENCE_THRESHOLD,
  MAX_SEGMENT_CHARS,
  MAX_SEGMENT_DURATION_MS,
} from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";
import { RawAsrUtterance } from "@/server/providers/asr-provider";
import { DiarizedTurn } from "@/server/providers/diarization-provider";

export interface MergedTranscriptSegmentDraft {
  segmentIndex: number;
  externalSpeakerId: string;
  startMs: number;
  endMs: number;
  sourceText: string;
  confidence: number;
  needsReview: boolean;
}

export class SegmentMerger {
  public alignAndNormalize(params: {
    utterances: RawAsrUtterance[];
    turns: DiarizedTurn[];
    maxDurationMs?: number;
    maxChars?: number;
    confidenceThreshold?: number;
  }): MergedTranscriptSegmentDraft[] {
    const maxDurationMs = params.maxDurationMs ?? MAX_SEGMENT_DURATION_MS;
    const maxChars = params.maxChars ?? MAX_SEGMENT_CHARS;
    const confidenceThreshold =
      params.confidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD;

    if (!params.utterances || params.utterances.length === 0) {
      throw new ValidationDomainError(
        "EMPTY_ASR_UTTERANCES",
        "Không có câu thoại nào được trích xuất từ âm thanh."
      );
    }

    // 1. Pair each utterance with its best-overlapping diarization turn
    const attributed: Array<{
      externalSpeakerId: string;
      startMs: number;
      endMs: number;
      sourceText: string;
      confidence: number;
    }> = [];

    for (const utt of params.utterances) {
      const cleanedText = (utt.text || "").trim();
      if (!cleanedText) {
        throw new ValidationDomainError(
          "INVALID_EMPTY_SEGMENT_TEXT",
          "Segment không được phép có nội dung rỗng."
        );
      }

      if (
        !Number.isFinite(utt.startMs) ||
        !Number.isFinite(utt.endMs) ||
        utt.startMs < 0 ||
        utt.endMs <= utt.startMs
      ) {
        throw new ValidationDomainError(
          "INVALID_SEGMENT_TIMELINE",
          `Mốc thời gian segment không hợp lệ (${utt.startMs}ms -> ${utt.endMs}ms).`
        );
      }

      const bestSpeakerId = this.findDominantSpeaker(
        utt.startMs,
        utt.endMs,
        params.turns
      );

      attributed.push({
        externalSpeakerId: bestSpeakerId,
        startMs: Math.round(utt.startMs),
        endMs: Math.round(utt.endMs),
        sourceText: cleanedText,
        confidence: Math.min(1, Math.max(0, Number(utt.confidence.toFixed(4)))),
      });
    }

    // 2. Merge very short consecutive utterances by the same speaker if gap <= 400ms
    const mergedSameSpeaker: typeof attributed = [];
    for (const item of attributed) {
      const prev = mergedSameSpeaker[mergedSameSpeaker.length - 1];
      if (
        prev &&
        prev.externalSpeakerId === item.externalSpeakerId &&
        item.startMs - prev.endMs <= 400 &&
        item.endMs - prev.startMs <= maxDurationMs &&
        prev.sourceText.length + 1 + item.sourceText.length <= maxChars
      ) {
        const prevDur = prev.endMs - prev.startMs;
        const itemDur = item.endMs - item.startMs;
        const totalDur = prevDur + itemDur;
        prev.endMs = item.endMs;
        prev.sourceText = `${prev.sourceText} ${item.sourceText}`;
        prev.confidence = Number(
          (
            (prev.confidence * prevDur + item.confidence * itemDur) /
            Math.max(1, totalDur)
          ).toFixed(4)
        );
      } else {
        mergedSameSpeaker.push({ ...item });
      }
    }

    // 3. Constraint 6: Split overly long segments (> maxDurationMs or > maxChars)
    const splitNormalized: typeof attributed = [];
    for (const seg of mergedSameSpeaker) {
      const chunks = this.splitLongSegment(seg, maxDurationMs, maxChars);
      splitNormalized.push(...chunks);
    }

    // 4. Final pass: assign segmentIndex and needsReview flag
    return splitNormalized.map((seg, index) => ({
      segmentIndex: index,
      externalSpeakerId: seg.externalSpeakerId,
      startMs: seg.startMs,
      endMs: seg.endMs,
      sourceText: seg.sourceText,
      confidence: seg.confidence,
      needsReview: seg.confidence < confidenceThreshold,
    }));
  }

  private findDominantSpeaker(
    startMs: number,
    endMs: number,
    turns: DiarizedTurn[]
  ): string {
    if (!turns || turns.length === 0) {
      return "SPEAKER_00";
    }

    let bestSpeaker = turns[0].externalSpeakerId || "SPEAKER_00";
    let maxOverlap = -1;

    for (const turn of turns) {
      const overlapStart = Math.max(startMs, turn.startMs);
      const overlapEnd = Math.min(endMs, turn.endMs);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSpeaker = turn.externalSpeakerId;
      }
    }

    return bestSpeaker;
  }

  private splitLongSegment(
    segment: {
      externalSpeakerId: string;
      startMs: number;
      endMs: number;
      sourceText: string;
      confidence: number;
    },
    maxDurationMs: number,
    maxChars: number
  ) {
    const duration = segment.endMs - segment.startMs;
    const textLen = segment.sourceText.length;

    if (duration <= maxDurationMs && textLen <= maxChars) {
      return [segment];
    }

    const words = segment.sourceText.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      return [segment];
    }

    const partsCount = Math.max(
      Math.ceil(duration / maxDurationMs),
      Math.ceil(textLen / maxChars)
    );
    const wordsPerPart = Math.max(1, Math.ceil(words.length / partsCount));
    const actualParts: string[] = [];

    for (let i = 0; i < words.length; i += wordsPerPart) {
      actualParts.push(words.slice(i, i + wordsPerPart).join(" "));
    }

    const totalCharacters = actualParts.reduce((acc, p) => acc + p.length, 0);
    const results: Array<typeof segment> = [];
    let cursorMs = segment.startMs;

    for (let i = 0; i < actualParts.length; i++) {
      const partText = actualParts[i];
      const isLast = i === actualParts.length - 1;
      const proportionalDuration = Math.max(
        250,
        Math.round((partText.length / Math.max(1, totalCharacters)) * duration)
      );
      const nextEndMs = isLast
        ? segment.endMs
        : Math.min(segment.endMs - (actualParts.length - 1 - i) * 100, cursorMs + proportionalDuration);

      results.push({
        externalSpeakerId: segment.externalSpeakerId,
        startMs: cursorMs,
        endMs: Math.max(cursorMs + 100, nextEndMs),
        sourceText: partText,
        confidence: segment.confidence,
      });

      cursorMs = Math.max(cursorMs + 100, nextEndMs);
    }

    return results;
  }
}

export const segmentMerger = new SegmentMerger();
