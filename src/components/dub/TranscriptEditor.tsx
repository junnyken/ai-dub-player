"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Edit3,
  History,
  Pause,
  Play,
  Users,
  Volume2,
} from "lucide-react";
import { formatTimestampMs } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  LoadingSkeletonState,
} from "@/components/states/DataStates";

interface SpeakerItemDto {
  id: string;
  externalSpeakerId: string;
  displayName: string;
  estimatedAgeGroup?: string | null;
  apparentGender?: string | null;
  roleHint?: string | null;
  appearanceCount: number;
  isEstimated: boolean;
}

interface TranscriptSegmentDto {
  id: string;
  transcriptId: string;
  speakerId: string;
  speakerDisplayName: string;
  externalSpeakerId: string;
  segmentIndex: number;
  startMs: number;
  endMs: number;
  sourceText: string;
  originalSourceText: string;
  originalSpeakerId: string;
  confidence: number;
  needsReview: boolean;
  version: number;
}

interface TranscriptPayloadDto {
  jobId: string;
  jobStatus: string;
  transcript: {
    id: string;
    language: string;
    source: "asr" | "captions";
    provider: string;
    status: string;
    version: number;
  } | null;
  speakers: SpeakerItemDto[];
  segments: TranscriptSegmentDto[];
}

export function TranscriptEditor({ jobId }: { jobId: string }) {
  const [data, setData] = useState<TranscriptPayloadDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftSpeakerId, setDraftSpeakerId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPlayingMini, setIsPlayingMini] = useState(false);

  const fetchTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/transcript`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || "Không thể tải dữ liệu transcript.");
        setIsLoading(false);
        return;
      }
      setData(json);
      if (json.segments?.length > 0) {
        setSelectedSegmentId((prev) => prev ?? json.segments[0].id);
      }
      setErrorMsg(null);
    } catch {
      setErrorMsg("Mất kết nối khi tải dữ liệu transcript.");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchTranscript();
  }, [fetchTranscript]);

  const hasTranscriptLoaded = Boolean(data?.transcript);

  useEffect(() => {
    if (hasTranscriptLoaded) return;
    const interval = setInterval(() => {
      fetchTranscript();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchTranscript, hasTranscriptLoaded]);

  const startEditing = (seg: TranscriptSegmentDto) => {
    setEditingSegmentId(seg.id);
    setSelectedSegmentId(seg.id);
    setDraftText(seg.sourceText);
    setDraftSpeakerId(seg.speakerId);
    setSaveError(null);
  };

  const handleSaveSegment = async (seg: TranscriptSegmentDto) => {
    if (!data?.transcript) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(
        `/api/transcripts/${data.transcript.id}/segments/${seg.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceText: draftText,
            speakerId: draftSpeakerId,
            needsReview: false,
          }),
        }
      );
      const updated = await res.json();
      if (!res.ok) {
        setSaveError(updated.message || "Không thể lưu chỉnh sửa câu thoại.");
        return;
      }

      setEditingSegmentId(null);
      await fetchTranscript();
    } catch {
      setSaveError("Lỗi kết nối khi lưu chỉnh sửa segment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <LoadingSkeletonState label="Đang tải danh sách câu thoại và thông tin người nói..." />
    );
  }

  if (errorMsg) {
    return (
      <ErrorState
        whatHappened="Không thể tải Transcript Editor"
        whyItHappened={errorMsg}
        nextStep="Hãy bấm thử kiểm tra lại để nạp lại danh sách câu thoại."
        onRetry={fetchTranscript}
      />
    );
  }

  if (!data?.transcript || data.segments.length === 0) {
    return (
      <EmptyState
        title="Transcript đang được xử lý"
        reason="Hệ thống đang tách âm thanh và nhận diện từng người nói (ASR + Speaker Diarization)."
        nextAction="Danh sách câu thoại sẽ tự động xuất hiện ngay khi bước nhận diện người nói hoàn tất."
      />
    );
  }

  const activeSegment =
    data.segments.find((s) => s.id === selectedSegmentId) ?? data.segments[0];
  const needsReviewCount = data.segments.filter((s) => s.needsReview).length;

  return (
    <section
      aria-labelledby="transcript-editor-heading"
      className="rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <div className="flex items-center gap-space-2">
            <h2
              id="transcript-editor-heading"
              className="text-lg font-bold text-text-primary"
            >
              Transcript & Phân tách người nói
            </h2>
            <span className="rounded-sm bg-surface-2 px-space-2 py-0.5 text-[11px] font-semibold uppercase text-text-secondary">
              {data.transcript.source === "captions"
                ? "source=captions"
                : "ASR gốc"}
            </span>
            <span className="rounded-sm bg-surface-2 px-space-2 py-0.5 text-[11px] text-text-muted tabular-nums">
              v{data.transcript.version}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            Đã nhận diện{" "}
            <strong className="text-text-primary tabular-nums">
              {data.speakers.length} người nói
            </strong>{" "}
            và{" "}
            <strong className="text-text-primary tabular-nums">
              {data.segments.length} câu thoại
            </strong>
            . Bản gốc luôn được lưu giữ khi chỉnh sửa.
          </p>
        </div>

        {needsReviewCount > 0 && (
          <div className="inline-flex items-center gap-space-2 rounded-sm border border-warning/40 bg-surface-2 px-space-3 py-space-1 text-xs font-medium text-warning tabular-nums">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{needsReviewCount} câu cần kiểm tra (confidence thấp)</span>
          </div>
        )}
      </div>

      <div className="mt-space-6 grid grid-cols-1 gap-space-6 lg:grid-cols-12">
        {/* Left column: Segment list */}
        <div className="space-y-space-3 lg:col-span-7">
          {data.segments.map((seg) => {
            const isSelected = activeSegment?.id === seg.id;
            const isEditing = editingSegmentId === seg.id;
            const confidencePct = Math.round(seg.confidence * 100);
            const wasEdited = seg.version > 1;

            return (
              <div
                key={seg.id}
                onClick={() => {
                  if (!isEditing) {
                    setSelectedSegmentId(seg.id);
                  }
                }}
                className={`rounded-md border p-space-4 transition-colors ${
                  isSelected
                    ? "border-primary bg-surface-2"
                    : "border-surface-2 bg-surface-2/40 hover:border-text-muted"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-space-2">
                  <div className="flex flex-wrap items-center gap-space-2">
                    <span className="rounded-sm bg-primary/20 px-space-2 py-0.5 text-xs font-semibold text-text-primary">
                      {seg.speakerDisplayName}
                    </span>
                    <span className="text-xs text-text-secondary tabular-nums">
                      {formatTimestampMs(seg.startMs)} –{" "}
                      {formatTimestampMs(seg.endMs)}
                    </span>
                    <span
                      className={`text-[11px] font-medium tabular-nums ${
                        seg.confidence < 0.75
                          ? "text-warning"
                          : "text-text-muted"
                      }`}
                    >
                      Độ tin cậy: {confidencePct}%
                    </span>
                  </div>

                  <div className="flex items-center gap-space-2">
                    {seg.needsReview && (
                      <span className="inline-flex items-center gap-space-1 rounded-sm border border-warning/50 bg-warning/10 px-space-2 py-0.5 text-[11px] font-semibold text-warning">
                        <AlertCircle
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        Cần kiểm tra
                      </span>
                    )}
                    {wasEdited && (
                      <span
                        title={`Bản gốc ASR: "${seg.originalSourceText}"`}
                        className="inline-flex items-center gap-space-1 rounded-sm bg-surface px-space-2 py-0.5 text-[11px] text-text-secondary"
                      >
                        <History className="h-3 w-3" aria-hidden="true" />
                        Đã chỉnh (v{seg.version})
                      </span>
                    )}
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(seg);
                        }}
                        aria-label={`Chỉnh sửa câu thoại số ${
                          seg.segmentIndex + 1
                        }`}
                        className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-2 py-1 text-xs font-medium text-text-secondary hover:border-primary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Sửa
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div
                    className="mt-space-3 space-y-space-3 border-t border-surface pt-space-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap items-center gap-space-2">
                      <label
                        htmlFor={`speaker-select-${seg.id}`}
                        className="text-xs font-medium text-text-secondary"
                      >
                        Gán người nói:
                      </label>
                      <select
                        id={`speaker-select-${seg.id}`}
                        value={draftSpeakerId}
                        onChange={(e) => setDraftSpeakerId(e.target.value)}
                        className="rounded-sm border border-surface-2 bg-surface px-space-2 py-1 text-xs font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {data.speakers.map((spk) => (
                          <option key={spk.id} value={spk.id}>
                            {spk.displayName} ({spk.externalSpeakerId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`segment-text-${seg.id}`}
                        className="sr-only"
                      >
                        Nội dung câu thoại gốc
                      </label>
                      <textarea
                        id={`segment-text-${seg.id}`}
                        rows={2}
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full rounded-sm border border-surface-2 bg-surface p-space-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      />
                    </div>

                    {saveError && (
                      <p role="alert" className="text-xs text-danger">
                        {saveError}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-muted">
                        Bản gốc: &ldquo;{seg.originalSourceText}&rdquo;
                      </span>
                      <div className="flex items-center gap-space-2">
                        <button
                          type="button"
                          onClick={() => setEditingSegmentId(null)}
                          className="rounded-sm bg-surface px-space-3 py-1 text-xs text-text-secondary hover:text-text-primary"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveSegment(seg)}
                          className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-1 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-space-2 text-sm text-text-primary">
                    {seg.sourceText}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Right column: Audio Waveform & Mini Player + Speaker Summary */}
        <div className="space-y-space-4 lg:col-span-5">
          <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-space-2 text-xs font-semibold text-text-primary">
                <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Audio Waveform & Mini Player
              </span>
              {activeSegment && (
                <span className="text-xs text-text-secondary tabular-nums">
                  {formatTimestampMs(activeSegment.startMs)} –{" "}
                  {formatTimestampMs(activeSegment.endMs)}
                </span>
              )}
            </div>

            {/* Waveform visualization bars */}
            <div
              aria-label="Biểu đồ sóng âm của câu thoại đang chọn"
              className="mt-space-4 flex h-20 items-end justify-between gap-1 rounded-sm bg-surface p-space-3"
            >
              {Array.from({ length: 28 }).map((_, idx) => {
                const seed =
                  ((activeSegment?.segmentIndex ?? 1) + 1) * (idx + 3);
                const heightPct = 20 + ((seed * 17) % 75);
                return (
                  <div
                    key={idx}
                    className={`w-1.5 rounded-sm ${
                      isPlayingMini ? "bg-primary" : "bg-text-muted/60"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>

            {activeSegment && (
              <div className="mt-space-3 space-y-space-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsPlayingMini((p) => !p)}
                    aria-label={
                      isPlayingMini
                        ? "Tạm dừng nghe đoạn thoại"
                        : "Nghe thử đoạn thoại gốc"
                    }
                    className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {isPlayingMini ? (
                      <>
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                        Tạm dừng
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        Nghe đoạn này
                      </>
                    )}
                  </button>
                  <span className="text-xs text-text-secondary">
                    Đang chọn:{" "}
                    <strong className="text-text-primary">
                      {activeSegment.speakerDisplayName}
                    </strong>
                  </span>
                </div>
                <p className="rounded-sm bg-surface p-space-2 text-xs text-text-secondary">
                  &ldquo;{activeSegment.sourceText}&rdquo;
                </p>
              </div>
            )}
          </div>

          <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4">
            <div className="flex items-center gap-space-2 text-xs font-semibold text-text-primary">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Cụm người nói đã tách (Diarization)</span>
            </div>
            <ul className="mt-space-3 space-y-space-2">
              {data.speakers.map((spk) => (
                <li
                  key={spk.id}
                  className="flex items-center justify-between rounded-sm bg-surface px-space-3 py-space-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-text-primary">
                      {spk.displayName}
                    </span>{" "}
                    <span className="text-text-muted">
                      ({spk.externalSpeakerId})
                    </span>
                  </div>
                  <div className="flex items-center gap-space-2 tabular-nums">
                    <span className="rounded-sm bg-surface-2 px-space-2 py-0.5 text-[11px] text-text-secondary">
                      Ước lượng
                    </span>
                    <span className="text-text-secondary">
                      {spk.appearanceCount} câu
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
