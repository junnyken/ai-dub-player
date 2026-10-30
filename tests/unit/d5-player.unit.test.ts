import { describe, expect, it } from "vitest";
import { TimingAligner } from "@/server/services/timing-aligner";
import { AudioSegmentScheduler, SchedulableSegment } from "@/server/services/audio-mixer";
import { SubtitleService, formatVttTimestamp } from "@/server/services/subtitle-service";

describe("D5 Unit: TimingAligner, AudioSegmentScheduler & SubtitleService", () => {
  const aligner = new TimingAligner();
  const scheduler = new AudioSegmentScheduler();
  const subtitleService = new SubtitleService();

  it("classifies natural, silence_compression, slight_speedup, and timing_conflict without cutting text", () => {
    const fullSentence =
      "Xin chào các bạn, hôm nay chúng ta sẽ đi sâu vào kiến trúc lồng tiếng AI đa nhân vật chuẩn phòng thu.";

    // 1. Natural (raw <= slot)
    const naturalRes = aligner.alignSegment({
      startMs: 0,
      endMs: 5000,
      rawDurationMs: 4200,
      translatedText: fullSentence,
    });
    expect(naturalRes.timingStrategy).toBe("natural");
    expect(naturalRes.playbackRate).toBe(1.0);
    expect(naturalRes.textPreserved).toBe(fullSentence);

    // 2. Silence compression (1.0 < ratio <= 1.15)
    const silenceRes = aligner.alignSegment({
      startMs: 0,
      endMs: 4000,
      rawDurationMs: 4400, // ratio = 1.10
      translatedText: fullSentence,
    });
    expect(silenceRes.timingStrategy).toBe("silence_compression");
    expect(silenceRes.alignedDurationMs).toBe(4000);
    expect(silenceRes.textPreserved).toBe(fullSentence);

    // 3. Slight speedup (1.15 < ratio <= 1.35)
    const speedupRes = aligner.alignSegment({
      startMs: 0,
      endMs: 4000,
      rawDurationMs: 5000, // ratio = 1.25
      translatedText: fullSentence,
    });
    expect(speedupRes.timingStrategy).toBe("slight_speedup");
    expect(speedupRes.playbackRate).toBeLessThanOrEqual(1.25);
    expect(speedupRes.textPreserved).toBe(fullSentence);

    // 4. Timing conflict (ratio > 1.35) -> caps rate at 1.25x, NEVER cuts text
    const conflictRes = aligner.alignSegment({
      startMs: 0,
      endMs: 2000,
      rawDurationMs: 3600, // ratio = 1.80
      translatedText: fullSentence,
    });
    expect(conflictRes.timingStrategy).toBe("timing_conflict");
    expect(conflictRes.playbackRate).toBe(1.25);
    expect(conflictRes.textPreserved).toBe(fullSentence);
  });

  it("synchronizes seek, speed, dual subtitle overlay, and safe fallback on failed segment", () => {
    const segments: SchedulableSegment[] = [
      {
        id: "seg_1",
        startMs: 0,
        endMs: 4000,
        durationMs: 3900,
        playbackRate: 1.05,
        voiceId: "voice_1",
        speakerId: "spk_1",
        speakerDisplayName: "Speaker 1",
        audioUrl: "data:audio/wav;base64,AAA",
        status: "ready",
        timingStrategy: "silence_compression",
        sourceText: "Welcome to our studio.",
        translatedText: "Chào mừng đến phòng thu của chúng tôi.",
      },
      {
        id: "seg_2_failed",
        startMs: 4500,
        endMs: 8000,
        durationMs: 3500,
        playbackRate: 1.0,
        voiceId: "voice_2",
        speakerId: "spk_2",
        speakerDisplayName: "Speaker 2",
        audioUrl: "",
        status: "failed",
        timingStrategy: "natural",
        sourceText: "This segment encountered a synthesis glitch.",
        translatedText: "Đoạn này gặp trục trặc khi tổng hợp.",
      },
    ];

    // Normal playback at 2000ms with 1.25x player speed & bilingual subtitles
    const state1 = scheduler.resolvePlaybackStateAtTime({
      currentTimeMs: 2000,
      playbackSpeed: 1.25,
      originalVolume: 0.2,
      dubVolume: 1.0,
      dubEnabled: true,
      originalAudioEnabled: true,
      subtitleMode: "bilingual",
      segments,
    });

    expect(state1.activeSegment?.id).toBe("seg_1");
    expect(state1.fallbackActive).toBe(false);
    expect(state1.effectiveDubVolume).toBe(1.0);
    expect(state1.effectiveOriginalVolume).toBe(0.2);
    expect(state1.effectiveDubPlaybackRate).toBeCloseTo(1.31, 1);
    expect(state1.subtitleOverlay.sourceLine).toBe("Welcome to our studio.");
    expect(state1.subtitleOverlay.targetLine).toBe(
      "Chào mừng đến phòng thu của chúng tôi."
    );

    // Seek to 5500ms (failed segment) -> safe fallback activates, mutes dub, boosts original audio, never throws
    const stateFallback = scheduler.resolvePlaybackStateAtTime({
      currentTimeMs: 5500,
      playbackSpeed: 1.0,
      originalVolume: 0.2,
      dubVolume: 1.0,
      dubEnabled: true,
      originalAudioEnabled: true,
      subtitleMode: "target",
      segments,
    });

    expect(stateFallback.activeSegment?.id).toBe("seg_2_failed");
    expect(stateFallback.fallbackActive).toBe(true);
    expect(stateFallback.fallbackWarningMessage).toContain("tự động chuyển về âm thanh gốc");
    expect(stateFallback.effectiveDubVolume).toBe(0);
    expect(stateFallback.effectiveOriginalVolume).toBeGreaterThanOrEqual(0.8);
    expect(stateFallback.subtitleOverlay.sourceLine).toBeNull();
    expect(stateFallback.subtitleOverlay.targetLine).toBe(
      "Đoạn này gặp trục trặc khi tổng hợp."
    );
  });

  it("formats WEBVTT timestamps and generates valid source, target, and bilingual VTT tracks", () => {
    expect(formatVttTimestamp(65432)).toBe("00:01:05.432");

    const vttBilingual = subtitleService.generateVttString(
      [
        {
          index: 0,
          startMs: 1000,
          endMs: 4500,
          speakerDisplayName: "Speaker 1",
          sourceText: "Hello world.",
          translatedText: "Xin chào thế giới.",
        },
      ],
      "bilingual"
    );

    expect(vttBilingual).toContain("WEBVTT");
    expect(vttBilingual).toContain("00:00:01.000 --> 00:00:04.500");
    expect(vttBilingual).toContain("[Speaker 1] Xin chào thế giới.");
    expect(vttBilingual).toContain("Hello world.");
  });
});
