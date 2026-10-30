import { describe, expect, it } from "vitest";
import { SpeakerAnalyzer } from "@/server/services/speaker-analyzer";
import { VoiceMatcher } from "@/server/services/voice-matcher";
import { VoiceDomain } from "@/domain/models";

describe("MINI-SPEC D4 — Unit Tests", () => {
  describe("SpeakerAnalyzer", () => {
    const analyzer = new SpeakerAnalyzer();

    it("analyzes speaker role, keeps isEstimated=true, and builds accurate Vietnamese labels", () => {
      const profile = analyzer.analyzeSpeaker({
        speakerId: "spk_1",
        externalSpeakerId: "SPEAKER_00",
        displayName: "Speaker 1",
        currentAgeGroup: "adult",
        currentApparentGender: "male",
        currentRoleHint: "interviewer",
        segments: [
          {
            startMs: 0,
            endMs: 4000,
            sourceText: "Could you explain how AI voice casting works today?",
            confidence: 0.92,
          },
          {
            startMs: 8000,
            endMs: 12000,
            sourceText: "What makes multi-speaker synthesis different?",
            confidence: 0.9,
          },
        ],
        totalJobSegmentsCount: 5,
      });

      expect(profile.isEstimated).toBe(true);
      expect(profile.insufficientDataFallback).toBe(false);
      expect(profile.roleHint).toBe("interviewer");
      expect(profile.vietnameseSummaryLabel).toBe(
        "Nam trưởng thành · Ước lượng"
      );
    });

    it("falls back to apparentGender='unknown' when insufficient speech data exists", () => {
      const fallback = analyzer.analyzeSpeaker({
        speakerId: "spk_short",
        externalSpeakerId: "SPEAKER_02",
        displayName: "Speaker 3",
        segments: [
          {
            startMs: 1000,
            endMs: 1500,
            sourceText: "Hi",
            confidence: 0.7,
          },
        ],
        totalJobSegmentsCount: 10,
      });

      expect(fallback.isEstimated).toBe(true);
      expect(fallback.insufficientDataFallback).toBe(true);
      expect(fallback.apparentGender).toBe("unknown");
      expect(fallback.vietnameseSummaryLabel).toContain("unknown");
    });
  });

  describe("VoiceMatcher", () => {
    const matcher = new VoiceMatcher();
    const analyzer = new SpeakerAnalyzer();

    const catalog: VoiceDomain[] = [
      {
        id: "v_male_adult",
        provider: "studio-tts-vi",
        providerVoiceId: "vi-Minh",
        language: "vi",
        displayName: "Minh - Trầm, tự tin",
        genderPresentation: "male",
        ageGroup: "adult",
        styleTags: ["trầm", "tự tin", "phỏng vấn"],
        isActive: true,
      },
      {
        id: "v_female_young",
        provider: "studio-tts-vi",
        providerVoiceId: "vi-Linh",
        language: "vi",
        displayName: "Linh - Trẻ trung, gần gũi",
        genderPresentation: "female",
        ageGroup: "young_adult",
        styleTags: ["trẻ trung", "gần gũi", "nhân vật chính"],
        isActive: true,
      },
      {
        id: "v_neutral_narrator",
        provider: "studio-tts-vi",
        providerVoiceId: "vi-Quoc",
        language: "vi",
        displayName: "Quốc - Trung tính, rõ ràng",
        genderPresentation: "neutral",
        ageGroup: "adult",
        styleTags: ["trung tính", "rõ ràng", "dẫn chuyện"],
        isActive: true,
      },
      {
        id: "v_en_ignored",
        provider: "en-tts",
        providerVoiceId: "en-John",
        language: "en",
        displayName: "John English",
        genderPresentation: "male",
        ageGroup: "adult",
        styleTags: ["confident"],
        isActive: true,
      },
    ];

    it("assigns distinct Vietnamese voices to 3 different speakers and ignores non-Vietnamese voices", () => {
      const p1 = analyzer.analyzeSpeaker({
        speakerId: "s1",
        externalSpeakerId: "SPEAKER_00",
        displayName: "Speaker 1",
        currentAgeGroup: "adult",
        currentApparentGender: "male",
        currentRoleHint: "interviewer",
        segments: [
          {
            startMs: 0,
            endMs: 4000,
            sourceText: "Welcome everyone to our studio discussion today.",
            confidence: 0.95,
          },
        ],
        totalJobSegmentsCount: 3,
      });

      const p2 = analyzer.analyzeSpeaker({
        speakerId: "s2",
        externalSpeakerId: "SPEAKER_01",
        displayName: "Speaker 2",
        currentAgeGroup: "young_adult",
        currentApparentGender: "female",
        currentRoleHint: "main_character",
        segments: [
          {
            startMs: 4500,
            endMs: 9000,
            sourceText: "Thank you so much for inviting me to share our story.",
            confidence: 0.94,
          },
        ],
        totalJobSegmentsCount: 3,
      });

      const p3 = analyzer.analyzeSpeaker({
        speakerId: "s3",
        externalSpeakerId: "SPEAKER_02",
        displayName: "Speaker 3",
        segments: [], // Insufficient data -> unknown -> neutral voice
        totalJobSegmentsCount: 3,
      });

      const matched = matcher.matchVoicesForSpeakers({
        profiles: [p1, p2, p3],
        availableVoices: catalog,
      });

      expect(matched).toHaveLength(3);
      const uniqueVoiceIds = new Set(matched.map((m) => m.voiceId));
      expect(uniqueVoiceIds.size).toBe(3);
      expect(uniqueVoiceIds.has("v_en_ignored")).toBe(false);

      expect(matched.find((m) => m.speakerId === "s1")?.voiceId).toBe(
        "v_male_adult"
      );
      expect(matched.find((m) => m.speakerId === "s2")?.voiceId).toBe(
        "v_female_young"
      );
      expect(matched.find((m) => m.speakerId === "s3")?.voiceId).toBe(
        "v_neutral_narrator"
      );
    });
  });
});
