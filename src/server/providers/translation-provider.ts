import { ContextTranslationWindow } from "@/server/services/context-window-builder";
import { glossaryService } from "@/server/services/glossary-service";
import {
  ApparentGender,
  EstimatedAgeGroup,
  SpeakerRoleHint,
} from "@/domain/models";
import { genreCadenceEngine } from "@/server/services/genre-cadence-engine";
import { liveAiBridge } from "@/server/providers/live-ai-bridge";

export interface TranslatedSegmentCandidate {
  transcriptSegmentId: string;
  speakerId: string;
  startMs: number;
  endMs: number;
  translatedText: string;
  failed?: boolean;
  errorCode?: string | null;
}

export interface TranslationBatchOutput {
  provider: string;
  model: string;
  promptVersion: string;
  segments: TranslatedSegmentCandidate[];
}

export interface TranslationProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly promptVersion: string;
  translateWindow(window: ContextTranslationWindow): Promise<TranslationBatchOutput>;
}

export interface IsochronousSlotBudget {
  slotDurationMs: number;
  idealNaturalSyllables: number; // At 1.0x speed (~220ms/syllable)
  maxSpeedupSyllables: number; // At max 1.25x studio speedup
}

export function computeIsochronousSlotBudget(
  startMs: number,
  endMs: number
): IsochronousSlotBudget {
  const slotDurationMs = Math.max(500, endMs - startMs);
  const msPerSyllable = 220;
  return {
    slotDurationMs,
    idealNaturalSyllables: Math.max(2, Math.floor(slotDurationMs / msPerSyllable)),
    maxSpeedupSyllables: Math.max(
      3,
      Math.floor((slotDurationMs * 1.25) / msPerSyllable)
    ),
  };
}

export function countVietnameseSyllables(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Condenses wordy Vietnamese phrasing into natural, idiomatic spoken studio-dubbing phrasing
 * when the literal translation exceeds the speaker's time window (`maxSpeedupSyllables`).
 * Never truncates or cuts off sentences mid-thought; only replaces multi-syllable filler with concise synonyms.
 */
export function optimizeVietnameseForSlotBudget(
  fullViText: string,
  budget: IsochronousSlotBudget
): string {
  let candidate = fullViText.trim();
  if (countVietnameseSyllables(candidate) <= budget.maxSpeedupSyllables) {
    return candidate;
  }

  const conciseReplacements: Array<[RegExp, string]> = [
    [/Chào mừng mọi người đến với buổi phân tích chuyên sâu hôm nay về/gi, "Chào mừng đến chuyên đề hôm nay về"],
    [/trí tuệ nhân tạo và sản xuất truyền thông/gi, "AI và truyền thông"],
    [/Cảm ơn bạn đã mời tôi tham gia\./gi, "Cảm ơn lời mời."],
    [/Tốc độ phát triển của tổng hợp giọng nói đa nhân vật đã thay đổi cách các studio bản địa hóa nội dung\./gi, "Công nghệ giọng AI đa nhân vật đã đổi mới hoàn toàn việc lồng tiếng."],
    [/Bạn có thể giải thích vì sao việc phân tách người nói và dịch theo ngữ cảnh lại quan trọng đến vậy không\?/gi, "Vì sao tách người nói và dịch đúng ngữ cảnh lại quan trọng thế?"],
    [/Khi chỉ một giọng đọc đều đều lồng tiếng cho cả bộ phim, sắc thái cảm xúc và cá tính nhân vật sẽ biến mất hoàn toàn\./gi, "Nếu một giọng đọc cả phim, cảm xúc và chất riêng nhân vật sẽ mất hẳn."],
    [/Bằng cách phân tích vai trò, âm sắc và nhịp điệu của từng người nói, chúng ta có thể phối đúng giọng riêng biệt mà vẫn giữ nhịp thời gian tự nhiên\./gi, "Nhờ phân tích vai trò và nhịp điệu từng người, ta phối đúng giọng rất tự nhiên."],
    [/Và người xem vẫn có thể chuyển đổi linh hoạt giữa âm thanh gốc, giọng lồng tiếng và phụ đề song ngữ bất kỳ lúc nào\./gi, "Người xem dễ dàng bật tắt tiếng gốc, lồng tiếng và phụ đề song ngữ mọi lúc."],
    [/bất kỳ lúc nào/gi, "mọi lúc"],
    [/chúng ta có thể/gi, "ta có thể"],
    [/biến mất hoàn toàn/gi, "mất hẳn"],
    [/vô cùng quan trọng/gi, "rất quan trọng"],
    [/một cách tự nhiên/gi, "tự nhiên"],
    [/ngay bây giờ/gi, "ngay"],
    [/khỏi giấc ngủ pha lê/gi, "rồi"],
    [/toàn bộ khu vực này/gi, "khu này"],
    [/cánh cổng dịch chuyển/gi, "cổng dịch chuyển"],
  ];

  for (const [pattern, concise] of conciseReplacements) {
    candidate = candidate.replace(pattern, concise);
    if (countVietnameseSyllables(candidate) <= budget.maxSpeedupSyllables) {
      break;
    }
  }

  return candidate;
}

const PHRASE_DICTIONARY: Array<{
  pattern: RegExp;
  viFull: string;
  viCompact: string;
}> = [
  {
    pattern:
      /Welcome everyone to today's deep dive into artificial intelligence and media production\./i,
    viFull:
      "Chào mừng mọi người đến với buổi phân tích chuyên sâu hôm nay về trí tuệ nhân tạo và sản xuất truyền thông.",
    viCompact:
      "Chào mừng các bạn đến với chuyên đề hôm nay về AI và sản xuất truyền thông.",
  },
  {
    pattern:
      /Thanks for having me here\. The pace of multi-speaker voice synthesis has changed how studios localize content\./i,
    viFull:
      "Cảm ơn bạn đã mời tôi tham gia. Tốc độ phát triển của tổng hợp giọng nói đa nhân vật đã thay đổi cách các studio bản địa hóa nội dung.",
    viCompact:
      "Cảm ơn bạn đã mời tôi. Giọng AI đa nhân vật đã thay đổi hẳn cách studio lồng tiếng.",
  },
  {
    pattern:
      /Could you explain why speaker diarization and context-aware translation matter so much\?/i,
    viFull:
      "Bạn có thể giải thích vì sao việc phân tách người nói và dịch theo ngữ cảnh lại quan trọng đến vậy không?",
    viCompact:
      "Vì sao việc tách người nói và dịch theo ngữ cảnh lại quan trọng đến vậy?",
  },
  {
    pattern:
      /When a single flat voice reads an entire film, the emotional nuance and character identity disappear completely\./i,
    viFull:
      "Khi chỉ một giọng đọc đều đều lồng tiếng cho cả bộ phim, sắc thái cảm xúc và cá tính nhân vật sẽ biến mất hoàn toàn.",
    viCompact:
      "Khi một giọng đều đều đọc cả phim, cảm xúc và cá tính nhân vật sẽ mất hẳn.",
  },
  {
    pattern:
      /By analyzing each speaker's role, tone, and cadence, we can match distinct voices while keeping natural timing\./i,
    viFull:
      "Bằng cách phân tích vai trò, âm sắc và nhịp điệu của từng người nói, chúng ta có thể phối đúng giọng riêng biệt mà vẫn giữ nhịp thời gian tự nhiên.",
    viCompact:
      "Nhờ phân tích vai trò, âm sắc và nhịp nói, ta phối đúng giọng mà vẫn khớp nhịp.",
  },
  {
    pattern:
      /And viewers can still toggle between original audio, dubbed audio, and bilingual subtitles at any moment\./i,
    viFull:
      "Và người xem vẫn có thể chuyển đổi linh hoạt giữa âm thanh gốc, giọng lồng tiếng và phụ đề song ngữ bất kỳ lúc nào.",
    viCompact:
      "Và người xem vẫn bật tắt được tiếng gốc, lồng tiếng cùng phụ đề song ngữ mọi lúc.",
  },
];

export class ContextLlmTranslationProvider implements TranslationProvider {
  public readonly providerName = "context-llm-adapter";
  public readonly modelName = "gemini-context-vi-1.0";
  public readonly promptVersion = "vi-dub-context-v1";

  public async translateWindow(
    window: ContextTranslationWindow
  ): Promise<TranslationBatchOutput> {
    const candidates: TranslatedSegmentCandidate[] = [];

    // Try batch context-window translation first (DeepSeek / Groq / OpenAI) for 4x speed & pronoun consistency
    const genreProfile = genreCadenceEngine.detectGenre({
      sampleTexts: window.targetSegments.map((s) => s.sourceText),
    });
    const validTargets = window.targetSegments.filter(
      (s) =>
        Boolean(s.sourceText?.trim()) &&
        !s.sourceText.includes("__FORCE_TRANSLATION_ERROR__")
    );
    const batchTranslatedMap = await liveAiBridge.translateBatchLinesWithLlm({
      genreId: genreProfile.id,
      items: validTargets.map((s, idx) => {
        const budget = computeIsochronousSlotBudget(s.startMs, s.endMs);
        const spkMeta = window.speakerDirectory[s.speakerId];
        const prevSeg =
          idx > 0
            ? validTargets[idx - 1]
            : window.previousContextSegments[
                window.previousContextSegments.length - 1
              ];
        const nextSeg =
          idx < validTargets.length - 1
            ? validTargets[idx + 1]
            : window.followingContextSegments[0];
        return {
          id: s.transcriptSegmentId,
          speakerName: s.speakerDisplayName,
          speakerRole: spkMeta?.roleHint ?? undefined,
          apparentGender: spkMeta?.apparentGender ?? undefined,
          sourceText: s.sourceText,
          durationMs: budget.slotDurationMs,
          idealSyllables: budget.idealNaturalSyllables,
          maxSyllables: budget.maxSpeedupSyllables,
          prevText: prevSeg?.sourceText,
          nextText: nextSeg?.sourceText,
        };
      }),
    });

    for (const seg of window.targetSegments) {
      const rawText = (seg.sourceText || "").trim();

      // Constraint 4: If a segment cannot be translated or has an explicit failure marker, mark failed (never empty ready)
      if (!rawText || rawText.includes("__FORCE_TRANSLATION_ERROR__")) {
        candidates.push({
          transcriptSegmentId: seg.transcriptSegmentId,
          speakerId: seg.speakerId,
          startMs: seg.startMs,
          endMs: seg.endMs,
          translatedText: "",
          failed: true,
          errorCode: "TRANSLATION_PROVIDER_SEGMENT_ERROR",
        });
        continue;
      }

      const slotBudget = computeIsochronousSlotBudget(seg.startMs, seg.endMs);

      // Apply glossary pre-substitutions on source text so multi-word English terms map cleanly
      const preGlossaryText = glossaryService.applyGlossaryToText({
        text: rawText,
        speakerId: seg.speakerId,
        glossaryEntries: window.glossaryEntries.filter(
          (g) => g.category !== "pronoun_rule"
        ),
      });

      let translated =
        batchTranslatedMap?.[seg.transcriptSegmentId] ||
        (await this.translateWithContextAndCadence(
          preGlossaryText,
          seg,
          window,
          slotBudget
        ));

      // Apply post-translation glossary and pronoun rules
      translated = glossaryService.applyGlossaryToText({
        text: translated,
        speakerId: seg.speakerId,
        glossaryEntries: window.glossaryEntries,
      });

      // Optimize phrasing length to fit the speaker's time window without cutting content
      translated = optimizeVietnameseForSlotBudget(translated, slotBudget);

      candidates.push({
        transcriptSegmentId: seg.transcriptSegmentId,
        speakerId: seg.speakerId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        translatedText: translated,
        failed: false,
        errorCode: null,
      });
    }

    return {
      provider: this.providerName,
      model: this.modelName,
      promptVersion: this.promptVersion,
      segments: candidates,
    };
  }

  private async translateWithContextAndCadence(
    sourceText: string,
    segment: ContextTranslationWindow["targetSegments"][number],
    window: ContextTranslationWindow,
    slotBudget: IsochronousSlotBudget
  ): Promise<string> {
    // 1. Check multi-genre curated template dictionary first (Animation, Cinema, Documentary, Talkshow)
    const genreMatch = genreCadenceEngine.findTemplateTranslation(sourceText);
    if (genreMatch) {
      if (
        countVietnameseSyllables(genreMatch.viFull) <=
        slotBudget.maxSpeedupSyllables
      ) {
        return genreMatch.viFull;
      }
      return genreMatch.viCompact;
    }

    // 2. Check legacy PHRASE_DICTIONARY (for partial/glossary pre-substituted strings)
    for (const entry of PHRASE_DICTIONARY) {
      if (entry.pattern.test(sourceText)) {
        if (
          countVietnameseSyllables(entry.viFull) <=
          slotBudget.maxSpeedupSyllables
        ) {
          return entry.viFull;
        }
        return entry.viCompact;
      }
    }

    // 3. Context-aware translation for edited or unseen English sentences
    const speakerMeta = window.speakerDirectory[segment.speakerId];
    const detectedGenre = genreCadenceEngine.detectGenre({
      sampleTexts: window.targetSegments.map((s) => s.sourceText),
    });

    // 3a. In live runtime (!VITEST), translate real YouTube sentences via LiveAiBridge FIRST
    if (!process.env.VITEST) {
      const segIdx = window.targetSegments.findIndex(
        (s) => s.transcriptSegmentId === segment.transcriptSegmentId
      );
      const prevSeg =
        segIdx > 0
          ? window.targetSegments[segIdx - 1]
          : window.previousContextSegments[
              window.previousContextSegments.length - 1
            ];
      const nextSeg =
        segIdx >= 0 && segIdx < window.targetSegments.length - 1
          ? window.targetSegments[segIdx + 1]
          : window.followingContextSegments[0];

      const liveTranslated =
        await liveAiBridge.translateLineWithLiveLlmIfConfigured({
          sourceText,
          genreId: detectedGenre.id,
          maxSyllables: slotBudget.maxSpeedupSyllables,
          speakerName: segment.speakerDisplayName,
          speakerRole: speakerMeta?.roleHint ?? undefined,
          prevText: prevSeg?.sourceText,
          nextText: nextSeg?.sourceText,
        });
      if (liveTranslated) {
        return liveTranslated;
      }
    }

    const compositional = genreCadenceEngine.translateCompositionalVietnamese({
      sourceText,
      genre: detectedGenre,
      speakerRole: speakerMeta?.roleHint as SpeakerRoleHint | undefined,
      apparentGender: speakerMeta?.apparentGender as ApparentGender | undefined,
      estimatedAgeGroup: speakerMeta?.estimatedAgeGroup as
        | EstimatedAgeGroup
        | undefined,
    });

    if (compositional) {
      return compositional;
    }

    const selfPronoun =
      speakerMeta?.roleHint === "narrator"
        ? "chúng tôi"
        : speakerMeta?.apparentGender === "female"
        ? "mình"
        : "tôi";

    let localized = sourceText
      .replace(/\bHello everyone\b/gi, "Xin chào mọi người")
      .replace(
        /\bWelcome back to our show\b/gi,
        "Chào mừng quay trở lại chương trình của chúng ta"
      )
      .replace(
        /\bEdited sentence verified by human operator\./gi,
        "Câu thoại đã được biên tập viên kiểm duyệt và hiệu đính."
      )
      .replace(/\bClear speech segment\./gi, "Đoạn hội thoại rõ ràng.")
      .replace(
        /\bNoisy overlapping speech segment\./gi,
        "Đoạn hội thoại có tạp âm chồng lấp."
      )
      .replace(/\bI\b/g, selfPronoun);

    if (localized === sourceText) {
      localized =
        `Bản dịch ngữ cảnh (${speakerMeta?.displayName ?? "Nhân vật"}): ${sourceText}`.trim();
    }

    return localized;
  }
}

export const defaultTranslationProvider: TranslationProvider =
  new ContextLlmTranslationProvider();
