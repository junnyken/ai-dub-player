import { describe, expect, it } from "vitest";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { UploadedFileValidator } from "@/server/services/uploaded-file-validator";
import { MediaMetadataExtractor } from "@/server/services/media-metadata-extractor";
import { CreditEstimator } from "@/server/services/credit-estimator";
import { InsufficientCreditError, ValidationDomainError } from "@/domain/errors";
import {
  createValidMp4Buffer,
  createValidWavBuffer,
} from "../helpers/media-fixtures";

describe("MINI-SPEC D1 — Unit Tests", () => {
  describe("YouTubeUrlResolver", () => {
    const resolver = new YouTubeUrlResolver();

    it("parses standard watch URL, short youtu.be URL, and shorts URL", () => {
      const watch = resolver.parseUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s"
      );
      expect(watch.videoId).toBe("dQw4w9WgXcQ");
      expect(watch.normalizedUrl).toBe(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );

      const short = resolver.parseUrl("https://youtu.be/jNQXAC9IVRw?si=abc");
      expect(short.videoId).toBe("jNQXAC9IVRw");

      const shorts = resolver.parseUrl(
        "https://www.youtube.com/shorts/aqz-KE-bpKQ"
      );
      expect(shorts.videoId).toBe("aqz-KE-bpKQ");
    });

    it("rejects DRM streaming platforms (Netflix, Disney+)", () => {
      expect(() =>
        resolver.parseUrl("https://www.netflix.com/watch/80057281")
      ).toThrowError(ValidationDomainError);

      try {
        resolver.parseUrl("https://www.netflix.com/watch/80057281");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "DRM_CONTENT_UNSUPPORTED"
        );
      }
    });

    it("rejects TikTok URLs in MVP D1", () => {
      try {
        resolver.parseUrl("https://www.tiktok.com/@user/video/123456");
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "UNSUPPORTED_SOURCE_PLATFORM"
        );
      }
    });

    it("rejects malformed or missing YouTube video IDs", () => {
      expect(() =>
        resolver.parseUrl("https://www.youtube.com/watch?v=short")
      ).toThrowError(ValidationDomainError);
      expect(() => resolver.parseUrl("not-a-url")).toThrowError(
        ValidationDomainError
      );
    });
  });

  describe("UploadedFileValidator", () => {
    const validator = new UploadedFileValidator();

    it("accepts all 7 allowed media extensions within plan size limit", () => {
      const allowed = ["mp4", "mov", "mkv", "webm", "mp3", "wav", "m4a"];
      for (const ext of allowed) {
        const res = validator.validate({
          fileName: `sample.${ext}`,
          mimeType: "application/octet-stream",
          sizeBytes: 15 * 1024 * 1024,
          userPlan: "free",
          rightsConfirmed: true,
        });
        expect(res.extension).toBe(ext);
      }
    });

    it("rejects unsupported file extensions (.avi, .exe)", () => {
      try {
        validator.validate({
          fileName: "movie.avi",
          mimeType: "video/x-msvideo",
          sizeBytes: 1024,
          userPlan: "pro",
          rightsConfirmed: true,
        });
        expect.fail("Should fail for .avi");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "UNSUPPORTED_FILE_EXTENSION"
        );
      }
    });

    it("rejects upload when file size exceeds free plan limit (200MB)", () => {
      try {
        validator.validate({
          fileName: "large.mp4",
          mimeType: "video/mp4",
          sizeBytes: 250 * 1024 * 1024,
          userPlan: "free",
          rightsConfirmed: true,
        });
        expect.fail("Should fail for 250MB on free plan");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "FILE_TOO_LARGE_FOR_PLAN"
        );
      }
    });

    it("rejects upload when copyright/rights confirmation is false", () => {
      try {
        validator.validate({
          fileName: "clip.mp4",
          mimeType: "video/mp4",
          sizeBytes: 1024 * 1024,
          userPlan: "pro",
          rightsConfirmed: false,
        });
        expect.fail("Should require rights confirmation");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "RIGHTS_CONFIRMATION_REQUIRED"
        );
      }
    });
  });

  describe("MediaMetadataExtractor", () => {
    const extractor = new MediaMetadataExtractor();

    it("extracts accurate durationSeconds and audio track from valid MP4 and WAV", () => {
      const mp4Buf = createValidMp4Buffer({
        durationSeconds: 504, // 8m 24s
        includeAudioTrack: true,
      });
      const mp4Meta = extractor.extractFromBuffer(mp4Buf, "mp4");
      expect(mp4Meta.durationSeconds).toBe(504);
      expect(mp4Meta.hasAudioTrack).toBe(true);

      const wavBuf = createValidWavBuffer(180);
      const wavMeta = extractor.extractFromBuffer(wavBuf, "wav");
      expect(wavMeta.durationSeconds).toBe(180);
      expect(wavMeta.hasAudioTrack).toBe(true);
    });

    it("rejects MP4 without audio track", () => {
      const silentMp4 = createValidMp4Buffer({
        durationSeconds: 60,
        includeAudioTrack: false,
      });
      try {
        extractor.extractFromBuffer(silentMp4, "mp4");
        expect.fail("Should fail when no audio track exists");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe("NO_AUDIO_TRACK");
      }
    });

    it("rejects corrupt media buffers", () => {
      const corrupt = Buffer.from("corrupt_random_bytes_not_media_header");
      expect(() => extractor.extractFromBuffer(corrupt, "mp4")).toThrowError(
        ValidationDomainError
      );
    });
  });

  describe("CreditEstimator", () => {
    const estimator = new CreditEstimator();

    it("computes 9 credits for 8m 24s (504s)", () => {
      expect(estimator.calculateCredits(504)).toBe(9);
      expect(estimator.calculateCredits(60)).toBe(1);
      expect(estimator.calculateCredits(61)).toBe(2);
    });

    it("throws InsufficientCreditError (402) when creditBalance < creditEstimated", () => {
      expect(() =>
        estimator.enforceLimitsOrThrow({
          durationSeconds: 504, // 9 credits
          userPlan: "free",
          creditBalance: 5,
        })
      ).toThrowError(InsufficientCreditError);
    });

    it("throws VIDEO_DURATION_EXCEEDS_PLAN_LIMIT (422) when duration > plan limit", () => {
      try {
        estimator.enforceLimitsOrThrow({
          durationSeconds: 20 * 60, // 20 mins > 15 mins free limit
          userPlan: "free",
          creditBalance: 100,
        });
        expect.fail("Should reject 20 min video on free plan");
      } catch (err) {
        expect((err as ValidationDomainError).errorCode).toBe(
          "VIDEO_DURATION_EXCEEDS_PLAN_LIMIT"
        );
      }
    });
  });
});
