import { GlossaryEntryDomain, SpeakerDomain } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";

export interface ContextWindowSegmentItem {
  transcriptSegmentId: string;
  segmentIndex: number;
  speakerId: string;
  speakerDisplayName: string;
  speakerRoleHint?: string | null;
  speakerApparentGender?: string | null;
  speakerAgeGroup?: string | null;
  startMs: number;
  endMs: number;
  sourceText: string;
}

export interface ContextTranslationWindow {
  windowIndex: number;
  previousContextSegments: ContextWindowSegmentItem[];
  targetSegments: ContextWindowSegmentItem[];
  followingContextSegments: ContextWindowSegmentItem[];
  speakerDirectory: Record<
    string,
    {
      displayName: string;
      roleHint?: string | null;
      apparentGender?: string | null;
      estimatedAgeGroup?: string | null;
    }
  >;
  glossaryEntries: GlossaryEntryDomain[];
}

export class ContextWindowBuilder {
  public buildWindows(params: {
    segments: ContextWindowSegmentItem[];
    speakers: SpeakerDomain[];
    glossaryEntries: GlossaryEntryDomain[];
    batchSize?: number;
    overlapSize?: number;
  }): ContextTranslationWindow[] {
    const batchSize = Math.max(1, params.batchSize ?? 4);
    const overlapSize = Math.max(1, params.overlapSize ?? 2);

    if (!params.segments || params.segments.length === 0) {
      throw new ValidationDomainError(
        "EMPTY_TRANSCRIPT_FOR_TRANSLATION",
        "Không có câu thoại nào trong transcript để xây dựng cửa sổ ngữ cảnh dịch."
      );
    }

    const sortedSegments = [...params.segments].sort(
      (a, b) => a.segmentIndex - b.segmentIndex
    );

    const speakerDirectory: ContextTranslationWindow["speakerDirectory"] = {};
    for (const spk of params.speakers) {
      speakerDirectory[spk.id] = {
        displayName: spk.displayName,
        roleHint: spk.roleHint,
        apparentGender: spk.apparentGender,
        estimatedAgeGroup: spk.estimatedAgeGroup,
      };
    }

    const windows: ContextTranslationWindow[] = [];
    for (let i = 0; i < sortedSegments.length; i += batchSize) {
      const targetSegments = sortedSegments.slice(i, i + batchSize);
      const prevStart = Math.max(0, i - overlapSize);
      const previousContextSegments = sortedSegments.slice(prevStart, i);
      const nextStart = i + batchSize;
      const followingContextSegments = sortedSegments.slice(
        nextStart,
        nextStart + overlapSize
      );

      windows.push({
        windowIndex: windows.length,
        previousContextSegments,
        targetSegments,
        followingContextSegments,
        speakerDirectory,
        glossaryEntries: params.glossaryEntries,
      });
    }

    return windows;
  }
}

export const contextWindowBuilder = new ContextWindowBuilder();
