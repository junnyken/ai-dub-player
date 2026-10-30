import { describe, expect, it } from "vitest";
import {
  YouTubePlayerSyncBridge,
  YouTubeVideoElementLike,
  YouTubeVideoEventName,
} from "@/extension/youtube-player-sync-bridge";
import { ExtensionAudioController } from "@/extension/extension-audio-controller";
import { SchedulableSegment } from "@/server/services/audio-mixer";

function createFakeYouTubeVideo(): YouTubeVideoElementLike & {
  trigger: (evt: YouTubeVideoEventName) => void;
} {
  const listeners = new Map<YouTubeVideoEventName, Set<() => void>>();
  return {
    currentTime: 0,
    paused: true,
    seeking: false,
    playbackRate: 1.0,
    volume: 0.9,
    muted: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    trigger(type) {
      for (const fn of listeners.get(type) ?? []) {
        fn();
      }
    },
  };
}

describe("E2 Unit: YouTubePlayerSyncBridge, ExtensionAudioController & Subtitle Overlay", () => {
  const sampleSegments: SchedulableSegment[] = [
    {
      id: "seg_1",
      startMs: 0,
      endMs: 4000,
      durationMs: 3800,
      playbackRate: 1.0,
      voiceId: "voice_vi_minh_adult_m",
      speakerId: "spk_1",
      speakerDisplayName: "Speaker 1",
      audioUrl: "data:audio/wav;base64,AAA",
      status: "ready",
      timingStrategy: "natural",
      sourceText: "Welcome to our YouTube channel.",
      translatedText: "Chào mừng đến kênh YouTube của chúng tôi.",
    },
    {
      id: "seg_2_failed",
      startMs: 5000,
      endMs: 9000,
      durationMs: 4000,
      playbackRate: 1.0,
      voiceId: "voice_vi_linh_young_f",
      speakerId: "spk_2",
      speakerDisplayName: "Speaker 2",
      audioUrl: "",
      status: "failed",
      timingStrategy: "natural",
      sourceText: "Let us dive right in.",
      translatedText: "Hãy cùng bắt đầu ngay.",
    },
  ];

  it("synchronizes play, pause, seek, playbackRate, and restores original YouTube video volume on disable/teardown", () => {
    const fakeVideo = createFakeYouTubeVideo();
    const bridge = new YouTubePlayerSyncBridge();
    const controller = new ExtensionAudioController({ bridge });

    bridge.attach(fakeVideo);
    controller.loadSegments(sampleSegments);

    // Initially paused at 1.0s -> dub audio must NOT play while YouTube video is paused
    fakeVideo.currentTime = 1.0;
    fakeVideo.paused = true;
    fakeVideo.trigger("timeupdate");
    expect(controller.getState().isDubAudioPlaying).toBe(false);

    // Play YouTube video at 1.5s -> dub audio plays, original YouTube volume is ducked to 0.2, bilingual subtitle visible
    fakeVideo.paused = false;
    fakeVideo.currentTime = 1.5;
    fakeVideo.trigger("play");

    const playingState = controller.getState();
    expect(playingState.isDubAudioPlaying).toBe(true);
    expect(playingState.activeSegmentId).toBe("seg_1");
    expect(fakeVideo.volume).toBeCloseTo(0.2, 2);
    expect(playingState.subtitleState.visible).toBe(true);
    expect(playingState.subtitleState.targetLine).toBe(
      "Chào mừng đến kênh YouTube của chúng tôi."
    );
    expect(playingState.subtitleState.sourceLine).toBe(
      "Welcome to our YouTube channel."
    );

    // Change YouTube playbackRate to 1.5x -> effectiveDubPlaybackRate updates immediately
    fakeVideo.playbackRate = 1.5;
    fakeVideo.trigger("ratechange");
    expect(controller.getState().effectiveDubPlaybackRate).toBe(1.5);

    // Pause YouTube video -> dub audio stops immediately
    fakeVideo.paused = true;
    fakeVideo.trigger("pause");
    expect(controller.getState().isDubAudioPlaying).toBe(false);

    // Seek to 6.0s (failed segment) while playing -> fallback activates, dub audio stops, original YouTube volume restored >= 0.8
    fakeVideo.paused = false;
    fakeVideo.currentTime = 6.0;
    fakeVideo.trigger("seeked");
    const fallbackState = controller.getState();
    expect(fallbackState.fallbackActive).toBe(true);
    expect(fallbackState.isDubAudioPlaying).toBe(false);
    expect(fakeVideo.volume).toBeGreaterThanOrEqual(0.8);

    // Teardown restores exact initial YouTube video volume (0.9) and hides subtitle overlay
    controller.teardown();
    expect(fakeVideo.volume).toBe(0.9);
    expect(controller.getState().subtitleState.visible).toBe(false);
  });

  it("activates degradedFallback with Web Player guidance when YouTube <video> element is missing", () => {
    const bridge = new YouTubePlayerSyncBridge();
    const snap = bridge.attach(null);

    expect(snap.attached).toBe(false);
    expect(snap.degradedFallback).toBe(true);
    expect(snap.fallbackMessage).toContain("Mở trong Web Player");
  });
});
