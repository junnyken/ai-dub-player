import {
  ApparentGender,
  EstimatedAgeGroup,
  SpeakerRoleHint,
} from "@/domain/models";

export interface SpeakerAnalysisInput {
  speakerId: string;
  externalSpeakerId: string;
  displayName: string;
  currentAgeGroup?: string | null;
  currentApparentGender?: string | null;
  currentRoleHint?: string | null;
  currentEmotionProfile?: string[];
  segments: Array<{
    startMs: number;
    endMs: number;
    sourceText: string;
    confidence: number;
  }>;
  totalJobSegmentsCount: number;
}

export interface AnalyzedSpeakerProfile {
  speakerId: string;
  externalSpeakerId: string;
  displayName: string;
  estimatedAgeGroup: EstimatedAgeGroup;
  apparentGender: ApparentGender;
  roleHint: SpeakerRoleHint;
  emotionProfile: string[];
  appearanceCount: number;
  isEstimated: true;
  insufficientDataFallback: boolean;
  vietnameseSummaryLabel: string;
}

export class SpeakerAnalyzer {
  public analyzeSpeaker(input: SpeakerAnalysisInput): AnalyzedSpeakerProfile {
    const appearanceCount = input.segments.length;
    const totalWords = input.segments.reduce(
      (acc, s) => acc + s.sourceText.trim().split(/\s+/).filter(Boolean).length,
      0
    );

    // Constraint 2 & 7: Never treat age/gender as certain; always use isEstimated = true.
    // If insufficient data (0 segments or < 3 words total), fallback to "unknown" gender and safe neutral profile.
    if (appearanceCount === 0 || totalWords < 3) {
      return {
        speakerId: input.speakerId,
        externalSpeakerId: input.externalSpeakerId,
        displayName: input.displayName,
        estimatedAgeGroup: "adult",
        apparentGender: "unknown",
        roleHint: "background",
        emotionProfile: ["neutral"],
        appearanceCount,
        isEstimated: true,
        insufficientDataFallback: true,
        vietnameseSummaryLabel: "Chưa đủ dữ liệu (unknown) · Ước lượng",
      };
    }

    const questionCount = input.segments.filter((s) =>
      s.sourceText.includes("?")
    ).length;
    const shareOfDialogue =
      appearanceCount / Math.max(1, input.totalJobSegmentsCount);

    let roleHint: SpeakerRoleHint =
      (input.currentRoleHint as SpeakerRoleHint) || "main_character";
    if (questionCount > 0 && questionCount >= Math.ceil(appearanceCount * 0.4)) {
      roleHint = "interviewer";
    } else if (input.totalJobSegmentsCount > 2 && shareOfDialogue >= 0.7) {
      roleHint = "narrator";
    } else if (shareOfDialogue < 0.2) {
      roleHint = "background";
    }

    const apparentGender: ApparentGender =
      (input.currentApparentGender as ApparentGender) || "neutral";
    const estimatedAgeGroup: EstimatedAgeGroup =
      (input.currentAgeGroup as EstimatedAgeGroup) || "adult";
    const emotionProfile =
      input.currentEmotionProfile && input.currentEmotionProfile.length > 0
        ? input.currentEmotionProfile
        : roleHint === "interviewer"
        ? ["tự tin", "rõ ràng"]
        : roleHint === "narrator"
        ? ["điềm tĩnh", "truyền cảm"]
        : ["tự nhiên", "biểu cảm"];

    return {
      speakerId: input.speakerId,
      externalSpeakerId: input.externalSpeakerId,
      displayName: input.displayName,
      estimatedAgeGroup,
      apparentGender,
      roleHint,
      emotionProfile,
      appearanceCount,
      isEstimated: true,
      insufficientDataFallback: false,
      vietnameseSummaryLabel: this.buildVietnameseLabel(
        apparentGender,
        estimatedAgeGroup,
        roleHint
      ),
    };
  }

  public buildVietnameseLabel(
    gender: ApparentGender,
    age: EstimatedAgeGroup,
    role: SpeakerRoleHint
  ): string {
    if (gender === "unknown") {
      return "Chưa đủ dữ liệu (unknown) · Ước lượng";
    }
    if (role === "narrator") {
      return "Người dẫn chuyện · Ước lượng";
    }

    const genderVi =
      gender === "female" ? "Nữ" : gender === "male" ? "Nam" : "Trung tính";
    const ageVi =
      age === "child"
        ? "thiếu nhi (hoạt hình)"
        : age === "young_adult" || age === "teen"
        ? "trẻ"
        : age === "senior"
        ? "cao niên"
        : "trưởng thành";

    return `${genderVi} ${ageVi} · Ước lượng`;
  }
}

export const speakerAnalyzer = new SpeakerAnalyzer();
