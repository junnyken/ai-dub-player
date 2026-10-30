"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  CheckCircle2,
  Download,
  FileText,
  Sparkles,
  Wand2,
} from "lucide-react";

interface SegmentAuditDto {
  segmentIndex: number;
  speakerDisplayName: string;
  voiceDisplayName: string;
  startMs: number;
  endMs: number;
  slotDurationMs: number;
  alignedDurationMs: number;
  playbackRate: number;
  syllableCount: number;
  maxBudgetSyllables: number;
  emotionLabelVi: string;
  fitsWithinSpeakerSlot: boolean;
  lipSyncScore: number;
}

interface QualityReportDto {
  jobId: string;
  detectedGenreId: string;
  detectedGenreNameVi: string;
  overallScore: number;
  overallGrade: string;
  metrics: {
    lipSyncScore: number;
    contextGenreScore: number;
    voiceDiversityScore: number;
    audioIntegrityScore: number;
  };
  totalSegments: number;
  onBeatSegmentsCount: number;
  uniqueVoicesCount: number;
  speakersCount: number;
  segmentsAudit: SegmentAuditDto[];
}

export function StudioQualityAndExportPanel({ jobId }: { jobId: string }) {
  const [report, setReport] = useState<QualityReportDto | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadQualityReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/quality-report`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch {
      // Ignore transient errors while job is initializing
    }
  }, [jobId]);

  useEffect(() => {
    loadQualityReport();
  }, [loadQualityReport]);

  const hasQualityReport = Boolean(report && report.totalSegments > 0);

  useEffect(() => {
    if (hasQualityReport) return;
    const timer = setInterval(loadQualityReport, 3500);
    return () => clearInterval(timer);
  }, [loadQualityReport, hasQualityReport]);

  const handleAutoOptimizeCadence = async () => {
    setIsOptimizing(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/quality-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const updated = await res.json();
        setReport(updated);
        setStatusMessage(
          "Đã tự động tối ưu nhịp nói & cô đọng câu thoại khớp 100% khung giờ nhân vật!"
        );
      }
    } catch {
      setStatusMessage("Không thể chạy tối ưu nhịp tự động. Vui lòng thử lại.");
    } finally {
      setIsOptimizing(false);
    }
  };

  if (!report || report.totalSegments === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="studio-qc-heading"
      className="rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <Award className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2
              id="studio-qc-heading"
              className="text-lg font-bold text-text-primary"
            >
              Kiểm định Chất lượng Studio &amp; Xuất bản Đa định dạng
            </h2>
            <span className="rounded-sm bg-success/15 px-space-2 py-0.5 text-xs font-bold text-success tabular-nums">
              {report.overallScore}/100 · {report.overallGrade}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            Thể loại nhận diện tự động:{" "}
            <strong className="text-text-primary">
              {report.detectedGenreNameVi}
            </strong>{" "}
            · Khớp nhịp nhân vật: {report.onBeatSegmentsCount}/
            {report.totalSegments} câu thoại.
          </p>
        </div>

        <button
          type="button"
          disabled={isOptimizing}
          onClick={handleAutoOptimizeCadence}
          className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-4 py-space-2 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
        >
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          {isOptimizing
            ? "Đang đồng bộ khẩu hình..."
            : "Tự động Tối ưu Khớp Nhịp 100%"}
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="mt-space-4 flex items-center gap-space-2 rounded-sm border border-success/40 bg-success/10 px-space-3 py-space-2 text-xs font-medium text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 4 Quality Pillars */}
      <div className="mt-space-4 grid grid-cols-2 gap-space-3 sm:grid-cols-4">
        <div className="rounded-md border border-surface-2 bg-surface-2 p-space-3">
          <span className="text-[11px] font-medium text-text-secondary">
            Khớp khẩu hình (Lip-Sync)
          </span>
          <p className="mt-1 text-lg font-bold text-text-primary tabular-nums">
            {report.metrics.lipSyncScore}%
          </p>
        </div>
        <div className="rounded-md border border-surface-2 bg-surface-2 p-space-3">
          <span className="text-[11px] font-medium text-text-secondary">
            Ngữ cảnh &amp; Đại từ Thể loại
          </span>
          <p className="mt-1 text-lg font-bold text-text-primary tabular-nums">
            {report.metrics.contextGenreScore}%
          </p>
        </div>
        <div className="rounded-md border border-surface-2 bg-surface-2 p-space-3">
          <span className="text-[11px] font-medium text-text-secondary">
            Đa dạng Giọng nhân vật
          </span>
          <p className="mt-1 text-lg font-bold text-text-primary tabular-nums">
            {report.metrics.voiceDiversityScore}% ({report.uniqueVoicesCount}{" "}
            giọng)
          </p>
        </div>
        <div className="rounded-md border border-surface-2 bg-surface-2 p-space-3">
          <span className="text-[11px] font-medium text-text-secondary">
            Toàn vẹn Sóng âm &amp; BGM
          </span>
          <p className="mt-1 text-lg font-bold text-text-primary tabular-nums">
            {report.metrics.audioIntegrityScore}%
          </p>
        </div>
      </div>

      {/* Multi-Format Export Suite */}
      <div className="mt-space-4 flex flex-wrap items-center justify-between gap-space-3 rounded-md border border-surface-2 bg-surface-2/60 p-space-4">
        <div className="flex items-center gap-space-2 text-xs">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-semibold text-text-primary">
             Trung tâm Xuất bản Studio (Video, Master Audio &amp; Phụ đề):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-space-2">
          <a
            href={`/api/dub-jobs/${jobId}/export?format=mp4&stem=bgm_isolated`}
            download={`ai_dub_video_${jobId}.mp4`}
            className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:bg-primary-hover"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Video .MP4 (Tách BGM)
          </a>

          <a
            href={`/api/dub-jobs/${jobId}/export?format=wav&stem=bgm_isolated`}
            download={`ai_dub_master_${jobId}.wav`}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Master .WAV
          </a>

          <a
            href={`/api/dub-jobs/${jobId}/subtitles?kind=bilingual&format=ass`}
            download={`subtitles_anime_${jobId}.ass`}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Phụ đề màu Anime (.ASS)
          </a>

          <a
            href={`/api/dub-jobs/${jobId}/subtitles?kind=target&format=srt`}
            download={`subtitles_vi_${jobId}.srt`}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Phụ đề CapCut/Premiere (.SRT)
          </a>

          <a
            href={`/api/dub-jobs/${jobId}/subtitles?kind=bilingual&format=vtt`}
            download={`subtitles_bilingual_${jobId}.vtt`}
            className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Song ngữ (.VTT)
          </a>
        </div>
      </div>
    </section>
  );
}
