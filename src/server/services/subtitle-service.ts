import { prisma } from "@/server/db/prisma";
import { SubtitleTrackKind } from "@/domain/models";
import { DomainError } from "@/domain/errors";
import { storageAdapter } from "@/server/storage/storage-adapter";

export interface SubtitleCueInput {
  index: number;
  startMs: number;
  endMs: number;
  speakerDisplayName: string;
  sourceText: string;
  translatedText: string;
}

export function formatVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatSrtTimestamp(ms: number): string {
  return formatVttTimestamp(ms).replace(".", ",");
}

export function formatAssTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export class SubtitleService {
  public generateVttString(
    cues: SubtitleCueInput[],
    kind: SubtitleTrackKind
  ): string {
    const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
    const lines: string[] = ["WEBVTT", ""];

    for (let i = 0; i < sorted.length; i++) {
      const cue = sorted[i];
      const start = formatVttTimestamp(cue.startMs);
      const end = formatVttTimestamp(Math.max(cue.startMs + 100, cue.endMs));

      lines.push(`${i + 1}`);
      lines.push(`${start} --> ${end}`);

      if (kind === "source") {
        lines.push(`[${cue.speakerDisplayName}] ${cue.sourceText}`);
      } else if (kind === "target") {
        lines.push(`[${cue.speakerDisplayName}] ${cue.translatedText}`);
      } else {
        lines.push(`[${cue.speakerDisplayName}] ${cue.translatedText}`);
        lines.push(`${cue.sourceText}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  public async generateAndSaveJobSubtitles(
    jobId: string,
    cues: SubtitleCueInput[]
  ) {
    const kinds: Array<{ kind: SubtitleTrackKind; language: string }> = [
      { kind: "source", language: "en" },
      { kind: "target", language: "vi" },
      { kind: "bilingual", language: "vi+en" },
    ];

    for (const item of kinds) {
      const vttContent = this.generateVttString(cues, item.kind);
      const storageKey = `subtitles/${jobId}/${item.kind}.vtt`;

      await storageAdapter.putObject({
        storageKey,
        body: Buffer.from(vttContent, "utf-8"),
        mimeType: "text/vtt",
      });

      await prisma.subtitleTrack.upsert({
        where: {
          jobId_kind: {
            jobId,
            kind: item.kind,
          },
        },
        update: {
          storageKey,
          vttContent,
          language: item.language,
        },
        create: {
          jobId,
          kind: item.kind,
          language: item.language,
          format: "vtt",
          storageKey,
          vttContent,
        },
      });
    }
  }

  public async getJobSubtitleVtt(params: {
    jobId: string;
    userId: string;
    kind?: SubtitleTrackKind;
  }): Promise<string> {
    const job = await prisma.dubJob.findUnique({
      where: { id: params.jobId },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng này."
      );
    }

    if (job.userId !== params.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền tải phụ đề của tiến trình này."
      );
    }

    const kind = params.kind ?? "target";
    const track = await prisma.subtitleTrack.findUnique({
      where: {
        jobId_kind: {
          jobId: params.jobId,
          kind,
        },
      },
    });

    if (!track) {
      throw new DomainError(
        404,
        "SUBTITLE_TRACK_NOT_FOUND",
        "Phụ đề chưa được tạo. Vui lòng chạy bước tổng hợp bản lồng tiếng trước."
      );
    }

    return track.vttContent;
  }

  public convertVttToSrt(vttContent: string): string {
    const cleaned = vttContent
      .replace(/^WEBVTT\s*\n+/, "")
      .trim();
    return cleaned.replace(
      /(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})/g,
      "$1,$2 --> $3,$4"
    );
  }

  public async getJobSubtitleFormatted(params: {
    jobId: string;
    userId: string;
    kind?: SubtitleTrackKind;
    format?: "vtt" | "srt" | "ass";
  }): Promise<{ content: string; mimeType: string; extension: string }> {
    const vttContent = await this.getJobSubtitleVtt({
      jobId: params.jobId,
      userId: params.userId,
      kind: params.kind,
    });

    const format = params.format ?? "vtt";
    if (format === "srt") {
      return {
        content: this.convertVttToSrt(vttContent),
        mimeType: "application/x-subrip; charset=utf-8",
        extension: "srt",
      };
    }

    if (format === "ass") {
      const audioSegs = await prisma.audioSegment.findMany({
        where: { jobId: params.jobId },
        include: {
          speaker: true,
          translationSegment: {
            include: { transcriptSegment: true },
          },
        },
        orderBy: { startMs: "asc" },
      });

      const header = [
        "[Script Info]",
        "Title: AI Dub Player Multi-Character Vietnamese Subtitles",
        "ScriptType: v4.00+",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Speaker1,Be Vietnam Pro,52,&H00FFFFFF,&H0000FFFF,&H00170F0B,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,48,1",
        "Style: Speaker2,Be Vietnam Pro,52,&H0090EEFF,&H0000FFFF,&H00170F0B,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,48,1",
        "Style: Speaker3,Be Vietnam Pro,52,&H00FFD89B,&H0000FFFF,&H00170F0B,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,48,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      ];

      const events = audioSegs.map((seg, idx) => {
        const spkName = seg.speaker.displayName || `Speaker ${idx + 1}`;
        const styleName = spkName.includes("2")
          ? "Speaker2"
          : spkName.includes("3")
          ? "Speaker3"
          : "Speaker1";
        const startAss = formatAssTimestamp(seg.startMs);
        const endAss = formatAssTimestamp(Math.max(seg.startMs + 200, seg.endMs));
        const viLine = (seg.translationSegment.translatedText || "").replace(/\r?\n/g, " ");
        const enLine = (
          seg.translationSegment.transcriptSegment?.sourceText || ""
        ).replace(/\r?\n/g, " ");

        const textBody =
          params.kind === "bilingual" && enLine
            ? `[${spkName}] ${viLine}\\N{\\fs36\\c&H00B0B0B0&}${enLine}`
            : params.kind === "source" && enLine
            ? `[${spkName}] ${enLine}`
            : `[${spkName}] ${viLine}`;

        return `Dialogue: 0,${startAss},${endAss},${styleName},${spkName},0,0,0,,${textBody}`;
      });

      return {
        content: [...header, ...events, ""].join("\n"),
        mimeType: "text/x-ssa; charset=utf-8",
        extension: "ass",
      };
    }

    return {
      content: vttContent,
      mimeType: "text/vtt; charset=utf-8",
      extension: "vtt",
    };
  }
}

export const subtitleService = new SubtitleService();
