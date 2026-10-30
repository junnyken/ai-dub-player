import { describe, expect, it } from "vitest";
import { ContextWindowBuilder } from "@/server/services/context-window-builder";
import { GlossaryService } from "@/server/services/glossary-service";
import { TranslationConsistencyChecker } from "@/server/services/translation-consistency-checker";
import { ValidationDomainError } from "@/domain/errors";

describe("MINI-SPEC D3 — Unit Tests", () => {
  describe("ContextWindowBuilder", () => {
    const builder = new ContextWindowBuilder();

    it("builds batch context windows with sliding previous and following context overlap", () => {
      const segments = Array.from({ length: 6 }).map((_, idx) => ({
        transcriptSegmentId: `seg_${idx}`,
        segmentIndex: idx,
        speakerId: idx % 2 === 0 ? "spk_1" : "spk_2",
        speakerDisplayName: idx % 2 === 0 ? "Speaker 1" : "Speaker 2",
        startMs: idx * 3000,
        endMs: (idx + 1) * 3000 - 200,
        sourceText: `Sentence number ${idx}`,
      }));

      const windows = builder.buildWindows({
        segments,
        speakers: [
          {
            id: "spk_1",
            jobId: "job_1",
            externalSpeakerId: "SPEAKER_00",
            displayName: "Speaker 1",
            appearanceCount: 3,
            isEstimated: true,
          },
          {
            id: "spk_2",
            jobId: "job_1",
            externalSpeakerId: "SPEAKER_01",
            displayName: "Speaker 2",
            appearanceCount: 3,
            isEstimated: true,
          },
        ],
        glossaryEntries: [],
        batchSize: 3,
        overlapSize: 2,
      });

      expect(windows).toHaveLength(2);
      expect(windows[0].previousContextSegments).toHaveLength(0);
      expect(windows[0].targetSegments).toHaveLength(3);
      expect(windows[0].followingContextSegments).toHaveLength(2);

      expect(windows[1].previousContextSegments).toHaveLength(2);
      expect(windows[1].targetSegments).toHaveLength(3);
      expect(windows[1].followingContextSegments).toHaveLength(0);
    });
  });

  describe("GlossaryService", () => {
    const glossary = new GlossaryService();

    it("applies proper nouns, technical terms, and speaker-scoped pronoun rules", () => {
      const raw =
        "Chào mừng đến với trí tuệ nhân tạo. Hôm nay tôi sẽ hướng dẫn bạn.";
      const applied = glossary.applyGlossaryToText({
        text: raw,
        speakerId: "spk_1",
        glossaryEntries: [
          {
            id: "g1",
            jobId: "j1",
            userId: "u1",
            category: "term",
            sourceTerm: "trí tuệ nhân tạo",
            targetTerm: "AI Đa Phương Thức",
            createdAt: new Date(),
          },
          {
            id: "g2",
            jobId: "j1",
            userId: "u1",
            category: "pronoun_rule",
            sourceTerm: "tôi",
            targetTerm: "mình",
            speakerId: "spk_1",
            createdAt: new Date(),
          },
        ],
      });

      expect(applied).toContain("AI Đa Phương Thức");
      expect(applied).toContain("Hôm nay mình sẽ hướng dẫn bạn.");
    });
  });

  describe("TranslationConsistencyChecker", () => {
    const checker = new TranslationConsistencyChecker();

    it("enforces 1-to-1 segment mapping and marks failed/empty candidates as status='failed'", () => {
      const inputs = [
        {
          transcriptSegmentId: "s1",
          segmentIndex: 0,
          speakerId: "spk_1",
          speakerDisplayName: "Speaker 1",
          startMs: 0,
          endMs: 2000,
          sourceText: "Hello",
        },
        {
          transcriptSegmentId: "s2",
          segmentIndex: 1,
          speakerId: "spk_2",
          speakerDisplayName: "Speaker 2",
          startMs: 2200,
          endMs: 4000,
          sourceText: "Corrupt",
        },
      ];

      const verified = checker.verifyAndNormalize({
        inputSegments: inputs,
        outputCandidates: [
          {
            transcriptSegmentId: "s1",
            speakerId: "spk_1",
            startMs: 0,
            endMs: 2000,
            translatedText: "Xin chào",
          },
          {
            transcriptSegmentId: "s2",
            speakerId: "spk_2",
            startMs: 2200,
            endMs: 4000,
            translatedText: "   ",
            failed: true,
            errorCode: "PROVIDER_TIMEOUT",
          },
        ],
      });

      expect(verified).toHaveLength(2);
      expect(verified[0].status).toBe("ready");
      expect(verified[1].status).toBe("failed");
      expect(verified[1].errorCode).toBe("PROVIDER_TIMEOUT");
    });

    it("throws when input segment count does not match output segment count", () => {
      expect(() =>
        checker.verifyAndNormalize({
          inputSegments: [
            {
              transcriptSegmentId: "s1",
              segmentIndex: 0,
              speakerId: "spk_1",
              speakerDisplayName: "Speaker 1",
              startMs: 0,
              endMs: 2000,
              sourceText: "Hello",
            },
          ],
          outputCandidates: [],
        })
      ).toThrowError(ValidationDomainError);
    });
  });
});
