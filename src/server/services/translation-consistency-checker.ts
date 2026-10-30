import { TranslationSegmentStatus } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";
import { ContextWindowSegmentItem } from "@/server/services/context-window-builder";
import { TranslatedSegmentCandidate } from "@/server/providers/translation-provider";

export interface VerifiedTranslationSegment {
  transcriptSegmentId: string;
  speakerId: string;
  startMs: number;
  endMs: number;
  translatedText: string;
  status: TranslationSegmentStatus;
  errorCode?: string | null;
}

export class TranslationConsistencyChecker {
  public verifyAndNormalize(params: {
    inputSegments: ContextWindowSegmentItem[];
    outputCandidates: TranslatedSegmentCandidate[];
  }): VerifiedTranslationSegment[] {
    // Regression Rule: Number of input segments must strictly equal number of output segments
    if (params.inputSegments.length !== params.outputCandidates.length) {
      throw new ValidationDomainError(
        "TRANSLATION_SEGMENT_COUNT_MISMATCH",
        `Số lượng câu dịch đầu ra (${params.outputCandidates.length}) không khớp với số lượng câu transcript gốc (${params.inputSegments.length}).`,
        {
          inputCount: params.inputSegments.length,
          outputCount: params.outputCandidates.length,
        }
      );
    }

    const candidateByTranscriptSegId = new Map<
      string,
      TranslatedSegmentCandidate
    >();
    for (const cand of params.outputCandidates) {
      candidateByTranscriptSegId.set(cand.transcriptSegmentId, cand);
    }

    const verified: VerifiedTranslationSegment[] = [];

    for (const inputSeg of params.inputSegments) {
      const match = candidateByTranscriptSegId.get(
        inputSeg.transcriptSegmentId
      );

      if (!match) {
        throw new ValidationDomainError(
          "MISSING_TRANSLATED_SEGMENT_MAPPING",
          `Không tìm thấy bản dịch khớp với transcriptSegmentId=${inputSeg.transcriptSegmentId}.`
        );
      }

      // Preserve exact speakerId, startMs, endMs from transcript
      if (
        match.speakerId !== inputSeg.speakerId ||
        match.startMs !== inputSeg.startMs ||
        match.endMs !== inputSeg.endMs
      ) {
        throw new ValidationDomainError(
          "TRANSLATION_TIMELINE_OR_SPEAKER_DRIFT",
          "Bản dịch làm thay đổi speakerId hoặc mốc thời gian startMs/endMs của câu thoại gốc."
        );
      }

      const trimmedText = (match.translatedText || "").trim();

      // Constraint 4: If translation failed or text is empty, status MUST be "failed", never "ready" with empty text
      if (match.failed || !trimmedText) {
        verified.push({
          transcriptSegmentId: inputSeg.transcriptSegmentId,
          speakerId: inputSeg.speakerId,
          startMs: inputSeg.startMs,
          endMs: inputSeg.endMs,
          translatedText: "[Lỗi dịch câu thoại — cần biên tập lại]",
          status: "failed",
          errorCode: match.errorCode || "TRANSLATION_SEGMENT_FAILED",
        });
      } else {
        verified.push({
          transcriptSegmentId: inputSeg.transcriptSegmentId,
          speakerId: inputSeg.speakerId,
          startMs: inputSeg.startMs,
          endMs: inputSeg.endMs,
          translatedText: trimmedText,
          status: "ready",
          errorCode: null,
        });
      }
    }

    return verified;
  }
}

export const translationConsistencyChecker =
  new TranslationConsistencyChecker();
