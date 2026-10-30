import { describe, expect, it } from "vitest";
import { SegmentMerger } from "@/server/services/segment-merger";
import {
  AcousticDiarizationProvider,
  formatExternalSpeakerId,
  formatSpeakerDisplayName,
} from "@/server/providers/diarization-provider";
import { AcousticAsrProvider } from "@/server/providers/asr-provider";
import { ValidationDomainError } from "@/domain/errors";

describe("MINI-SPEC D2 — Unit Tests", () => {
  describe("SegmentMerger", () => {
    const merger = new SegmentMerger();

    it("merges adjacent short segments from the same speaker and preserves weighted confidence", () => {
      const merged = merger.alignAndNormalize({
        utterances: [
          {
            startMs: 500,
            endMs: 2500,
            text: "Hello everyone.",
            confidence: 0.9,
          },
          {
            startMs: 2700,
            endMs: 4700,
            text: "Welcome back to our show.",
            confidence: 0.8,
          },
        ],
        turns: [{ startMs: 0, endMs: 5000, externalSpeakerId: "SPEAKER_00" }],
      });

      expect(merged).toHaveLength(1);
      expect(merged[0].externalSpeakerId).toBe("SPEAKER_00");
      expect(merged[0].startMs).toBe(500);
      expect(merged[0].endMs).toBe(4700);
      expect(merged[0].sourceText).toBe(
        "Hello everyone. Welcome back to our show."
      );
      expect(merged[0].confidence).toBeCloseTo(0.85, 2);
      expect(merged[0].needsReview).toBe(false);
    });

    it("flags needsReview = true when confidence is below threshold (0.75)", () => {
      const merged = merger.alignAndNormalize({
        utterances: [
          {
            startMs: 1000,
            endMs: 4000,
            text: "Clear speech segment.",
            confidence: 0.92,
          },
          {
            startMs: 5000,
            endMs: 8000,
            text: "Noisy overlapping speech segment.",
            confidence: 0.64,
          },
        ],
        turns: [
          { startMs: 1000, endMs: 4000, externalSpeakerId: "SPEAKER_00" },
          { startMs: 5000, endMs: 8000, externalSpeakerId: "SPEAKER_01" },
        ],
      });

      expect(merged).toHaveLength(2);
      expect(merged[0].needsReview).toBe(false);
      expect(merged[1].needsReview).toBe(true);
    });

    it("splits overly long segments (> 12000ms) into valid smaller segments for TTS and subtitles", () => {
      const longText =
        "This is a very long continuous explanation about neural speech synthesis and speaker diarization that spans more than twenty four seconds without a speaker change so it must be split properly.";
      const merged = merger.alignAndNormalize({
        utterances: [
          {
            startMs: 0,
            endMs: 25000,
            text: longText,
            confidence: 0.91,
          },
        ],
        turns: [{ startMs: 0, endMs: 25000, externalSpeakerId: "SPEAKER_00" }],
      });

      expect(merged.length).toBeGreaterThanOrEqual(3);
      for (const seg of merged) {
        expect(seg.endMs).toBeGreaterThan(seg.startMs);
        expect(seg.sourceText.trim().length).toBeGreaterThan(0);
      }
      expect(merged[0].startMs).toBe(0);
      expect(merged[merged.length - 1].endMs).toBe(25000);
    });

    it("rejects empty segment text or invalid timestamps (startMs >= endMs)", () => {
      expect(() =>
        merger.alignAndNormalize({
          utterances: [
            { startMs: 1000, endMs: 3000, text: "   ", confidence: 0.9 },
          ],
          turns: [],
        })
      ).toThrowError(ValidationDomainError);

      expect(() =>
        merger.alignAndNormalize({
          utterances: [
            { startMs: 3000, endMs: 2000, text: "Invalid time", confidence: 0.9 },
          ],
          turns: [],
        })
      ).toThrowError(ValidationDomainError);
    });
  });

  describe("Speaker Mapping & Diarization", () => {
    it("maps speaker IDs strictly to Speaker 1, Speaker 2 without inventing character names", async () => {
      expect(formatExternalSpeakerId(0)).toBe("SPEAKER_00");
      expect(formatSpeakerDisplayName(0)).toBe("Speaker 1");
      expect(formatExternalSpeakerId(1)).toBe("SPEAKER_01");
      expect(formatSpeakerDisplayName(1)).toBe("Speaker 2");

      const provider = new AcousticDiarizationProvider();
      const result = await provider.diarize({
        jobId: "job_test",
        durationMs: 30000,
        utteranceWindows: [
          { startMs: 0, endMs: 5000 },
          { startMs: 5500, endMs: 10000 },
          { startMs: 10500, endMs: 15000 },
        ],
        expectedSpeakerCount: 3,
      });

      expect(result.speakers.map((s) => s.displayName)).toEqual([
        "Speaker 1",
        "Speaker 2",
        "Speaker 3",
      ]);
      expect(result.speakers.every((s) => s.isEstimated === true)).toBe(true);
    });
  });

  describe("AsrProvider Caption Fallback Policy", () => {
    const asr = new AcousticAsrProvider();

    it("always uses ASR (source='asr') when audio is available, ignoring captions", async () => {
      const res = await asr.transcribe({
        jobId: "job_1",
        durationMs: 18000,
        audioAvailable: true,
        captionFallbackUtterances: [
          { startMs: 0, endMs: 2000, text: "Caption text", confidence: 0.8 },
        ],
      });
      expect(res.source).toBe("asr");
    });

    it("falls back to captions and labels source='captions' only when audio is unavailable", async () => {
      const res = await asr.transcribe({
        jobId: "job_2",
        durationMs: 18000,
        audioAvailable: false,
        captionFallbackUtterances: [
          { startMs: 0, endMs: 4000, text: "Fallback caption", confidence: 0.72 },
        ],
      });
      expect(res.source).toBe("captions");
      expect(res.utterances[0].text).toBe("Fallback caption");
    });
  });
});
