import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { genreCadenceEngine } from "@/server/services/genre-cadence-engine";
import {
  computeIsochronousSlotBudget,
  countVietnameseSyllables,
} from "@/server/providers/translation-provider";

describe("LIVE MULTI-GENRE DUBBING ENGINE — Animation (Hoạt hình), Cinema, Documentary & Talkshow", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => {
    if (videoId === "animDragon1") {
      return {
        title: "Star Dragon Kingdom - Kids Animation Cartoon Episode 1",
        durationSeconds: 24, // 4 fast 6s slots
        playabilityStatus: "OK",
        sourceLanguage: "en",
      };
    }
    if (videoId === "cinemaAct01") {
      return {
        title: "Sector Zero - Sci-Fi Action Movie Trailer",
        durationSeconds: 24,
        playabilityStatus: "OK",
        sourceLanguage: "en",
      };
    }
    if (videoId === "docOcean001") {
      return {
        title: "Deep Sea Bioluminescence - Nature Science Documentary",
        durationSeconds: 24,
        playabilityStatus: "OK",
        sourceLanguage: "en",
      };
    }
    return {
      title: `Tech Talkshow (${videoId})`,
      durationSeconds: 24,
      playabilityStatus: "OK",
      sourceLanguage: "en",
    };
  });

  const orchestrator = new DubJobOrchestrator(mockYtResolver);

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
    await prisma.audioSegment.deleteMany();
    await prisma.subtitleTrack.deleteMany();
    await prisma.voiceAssignment.deleteMany();
    await prisma.voicePreset.deleteMany();
    await prisma.translationSegment.deleteMany();
    await prisma.translation.deleteMany();
    await prisma.glossaryEntry.deleteMany();
    await prisma.transcriptSegmentRevision.deleteMany();
    await prisma.transcriptSegment.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.speaker.deleteMany();
    await prisma.jobEventLog.deleteMany();
    await prisma.creditLedger.deleteMany();
    await prisma.jobQueueRecord.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.dubJob.deleteMany();
    await prisma.uploadedFile.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("runs all 4 genres (Animation/Hoạt hình, Cinema, Documentary, Talkshow) end-to-end with genre-specific voices, pronouns, and 100% synced cadence", async () => {
    const user = await prisma.user.create({
      data: {
        email: "multi-genre@aidub.vn",
        name: "Multi-Genre Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 500,
      },
    });

    const genreTestCases = [
      {
        genre: "animation" as const,
        videoId: "animDragon1",
        expectedPronounRegex: /(cậu|tớ|chúng mình|nhé|đấy)/i,
        expectedVoiceIds: ["voice_vi_y_bo_child_n", "voice_vi_z_vy_teen_f"],
      },
      {
        genre: "cinema" as const,
        videoId: "cinemaAct01",
        expectedPronounRegex: /(tôi|chúng ta|yểm trợ|tường lửa|cửa chắn)/i,
        expectedVoiceIds: ["voice_vi_minh_adult_m", "voice_vi_linh_young_f"],
      },
      {
        genre: "documentary" as const,
        videoId: "docOcean001",
        expectedPronounRegex: /(đại dương|biển|sinh vật|khoa học|sinh cảnh)/i,
        expectedVoiceIds: ["voice_vi_quoc_neutral", "voice_vi_an_senior_m"],
      },
      {
        genre: "talkshow" as const,
        videoId: "talkShow001",
        expectedPronounRegex: /(chào mừng|cảm ơn|ngữ cảnh|lồng tiếng)/i,
        expectedVoiceIds: ["voice_vi_minh_adult_m", "voice_vi_linh_young_f"],
      },
    ];

    const summaryRows: Array<{
      "Thể loại": string;
      "Giọng nhân vật AI": string;
      "Câu thoại dịch theo ngữ cảnh": string;
      "Tốc độ phát": string;
      "Trạng thái nhịp": string;
    }> = [];

    for (const tc of genreTestCases) {
      const job = await orchestrator.createJob({
        userId: user.id,
        sourceType: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${tc.videoId}`,
        targetLanguage: "vi",
        clientType: "extension",
      });

      await jobQueueService.processIngestJob(job.id);
      await transcriptVersionService.generateTranscriptForJob(job.id);
      await translationService.translateJob(job.id, {
        userId: user.id,
      });

      const casting = await castingService.runAiCastingForJob(job.id, user.id);

      const assignedVoiceIds = casting.speakers.map(
        (s) => s.voiceAssignment?.voiceId
      );
      for (const expectedVoiceId of tc.expectedVoiceIds) {
        expect(assignedVoiceIds).toContain(expectedVoiceId);
      }

      const manifest = await playbackManifestService.renderJobAudio(job.id, {
        userId: user.id,
      });

      expect(manifest.status).toBe("ready");
      expect(manifest.audioSegments.length).toBeGreaterThanOrEqual(4);

      for (const seg of manifest.audioSegments) {
        const slotDurationMs = seg.endMs - seg.startMs;
        expect(seg.status).toBe("ready");
        expect(seg.playbackRate).toBeGreaterThanOrEqual(0.85);
        expect(seg.playbackRate).toBeLessThanOrEqual(1.25);
        // Never overflows character's speaking window
        expect(seg.durationMs).toBeLessThanOrEqual(slotDurationMs);
      }

      const combinedVi = manifest.audioSegments
        .map((s) => s.translatedText)
        .join(" ");
      expect(combinedVi).toMatch(tc.expectedPronounRegex);

      const firstSeg = manifest.audioSegments[0];
      summaryRows.push({
        "Thể loại": tc.genre.toUpperCase(),
        "Giọng nhân vật AI": casting.speakers
          .map((s) => s.voiceAssignment?.voice.displayName.split(" - ")[0])
          .join(" & "),
        "Câu thoại dịch theo ngữ cảnh": firstSeg.translatedText,
        "Tốc độ phát": `${firstSeg.playbackRate}x`,
        "Trạng thái nhịp": `KHỚP 100% (${firstSeg.durationMs}ms / ${firstSeg.endMs - firstSeg.startMs}ms)`,
      });
    }

    console.log("\n=== KẾT QUẢ TEST ĐA THỂ LOẠI (HOẠT HÌNH, ĐIỆN ẢNH, TÀI LIỆU, TALKSHOW) ===");
    console.table(summaryRows);
  });

  it("translates unseen arbitrary English animation & action sentences into natural Vietnamese within slot budget", () => {
    const animProfile = genreCadenceEngine.detectGenre({
      title: "Little Dragon Cartoon - Animation",
    });
    expect(animProfile.id).toBe("animation");

    const unseenAnimationSentence =
      "Hold on tight! Look over there, that little dragon is trying to fly right now!";
    const viAnim = genreCadenceEngine.translateCompositionalVietnamese({
      sourceText: unseenAnimationSentence,
      genre: animProfile,
      estimatedAgeGroup: "child",
    });

    expect(viAnim).toContain("Bám chắc vào nhé");
    expect(viAnim).toContain("nhìn đằng kia kìa");
    expect(viAnim).toContain("chú rồng nhỏ");

    const slotBudget = computeIsochronousSlotBudget(0, 4200);
    expect(countVietnameseSyllables(viAnim)).toBeLessThanOrEqual(
      slotBudget.maxSpeedupSyllables
    );
  });
});
