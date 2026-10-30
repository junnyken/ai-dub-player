import { VoiceDomain } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";
import { AnalyzedSpeakerProfile } from "@/server/services/speaker-analyzer";

export interface MatchedVoiceRecommendation {
  speakerId: string;
  voiceId: string;
  voiceDisplayName: string;
  assignedBy: "ai";
  matchScore: number;
  matchReason: string;
}

export class VoiceMatcher {
  public matchVoicesForSpeakers(params: {
    profiles: AnalyzedSpeakerProfile[];
    availableVoices: VoiceDomain[];
  }): MatchedVoiceRecommendation[] {
    const validViVoices = params.availableVoices.filter(
      (v) =>
        v.language === "vi" &&
        v.isActive &&
        v.provider !== "f5-tts-vi-clone"
    );

    if (validViVoices.length === 0) {
      throw new ValidationDomainError(
        "NO_ACTIVE_VIETNAMESE_VOICES",
        "Không có giọng đọc tiếng Việt (language='vi') nào đang hoạt động trong kho giọng."
      );
    }

    // Sort speakers by appearanceCount descending so main speakers get primary distinct voices first
    const orderedProfiles = [...params.profiles].sort(
      (a, b) => b.appearanceCount - a.appearanceCount
    );

    const usedVoiceIds = new Set<string>();
    const recommendationsBySpeakerId = new Map<
      string,
      MatchedVoiceRecommendation
    >();

    for (const profile of orderedProfiles) {
      // Constraint 7: If insufficient data (unknown gender), pick safe neutral default voice
      if (
        profile.insufficientDataFallback ||
        profile.apparentGender === "unknown"
      ) {
        const neutralDefault =
          validViVoices.find(
            (v) =>
              v.genderPresentation === "neutral" && !usedVoiceIds.has(v.id)
          ) ??
          validViVoices.find((v) => v.genderPresentation === "neutral") ??
          validViVoices[0];

        usedVoiceIds.add(neutralDefault.id);
        recommendationsBySpeakerId.set(profile.speakerId, {
          speakerId: profile.speakerId,
          voiceId: neutralDefault.id,
          voiceDisplayName: neutralDefault.displayName,
          assignedBy: "ai",
          matchScore: 0.7,
          matchReason:
            "Không đủ dữ liệu phân tích giọng gốc (unknown) — sử dụng giọng trung tính an toàn mặc định.",
        });
        continue;
      }

      const scored = validViVoices.map((voice) => {
        let score = 0.5;

        // Gender presentation alignment
        if (profile.roleHint === "narrator" && voice.genderPresentation === "neutral") {
          score += 0.35;
        } else if (voice.genderPresentation === profile.apparentGender) {
          score += 0.3;
        } else if (voice.genderPresentation === "neutral") {
          score += 0.1;
        }

        // Age group alignment
        if (voice.ageGroup === profile.estimatedAgeGroup) {
          score += 0.25;
        }

        // Animation / child / teen expressive voice bonus
        if (
          (profile.estimatedAgeGroup === "child" ||
            profile.estimatedAgeGroup === "teen" ||
            profile.emotionProfile.some(
              (e) => e.includes("hoạt hình") || e.includes("anime")
            )) &&
          voice.styleTags.some(
            (t) => t.includes("hoạt hình") || t.includes("anime")
          )
        ) {
          score += 0.2;
        }

        // Role & style tag bonus
        if (
          profile.roleHint === "interviewer" &&
          voice.styleTags.some((t) => t.includes("tự tin") || t.includes("phỏng vấn"))
        ) {
          score += 0.1;
        }
        if (
          profile.roleHint === "main_character" &&
          voice.styleTags.some((t) => t.includes("gần gũi") || t.includes("nhân vật chính"))
        ) {
          score += 0.1;
        }

        // Strongly prefer distinct voices across speakers in the same video
        if (!usedVoiceIds.has(voice.id)) {
          score += 0.25;
        }

        return {
          voice,
          rawScore: score,
          score: Math.min(0.99, Number(score.toFixed(2))),
        };
      });

      scored.sort((a, b) => b.rawScore - a.rawScore);
      const chosen = scored[0];
      usedVoiceIds.add(chosen.voice.id);

      recommendationsBySpeakerId.set(profile.speakerId, {
        speakerId: profile.speakerId,
        voiceId: chosen.voice.id,
        voiceDisplayName: chosen.voice.displayName,
        assignedBy: "ai",
        matchScore: chosen.score,
        matchReason: `Đề xuất AI theo hồ sơ ước lượng (${profile.vietnameseSummaryLabel})`,
      });
    }

    return params.profiles.map(
      (p) => recommendationsBySpeakerId.get(p.speakerId)!
    );
  }
}

export const voiceMatcher = new VoiceMatcher();
