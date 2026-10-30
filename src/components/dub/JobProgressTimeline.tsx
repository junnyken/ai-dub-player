"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { DubJobStatus } from "@/domain/models";
import { formatDurationVi } from "@/lib/format";
import {
  ErrorState,
  LoadingSkeletonState,
  PartialReadyState,
  UnauthorizedState,
} from "@/components/states/DataStates";

interface JobProgressSnapshot {
  jobId: string;
  status: DubJobStatus;
  progress: number;
  message: string;
  readyFromMs: number;
  readyToMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  creditEstimated?: number;
  creditSpent?: number;
  title?: string | null;
  durationSeconds?: number | null;
}

interface PipelineStepDefinition {
  key: string;
  label: string;
  completedStatuses: DubJobStatus[];
  activeStatuses: DubJobStatus[];
}

const PIPELINE_STEPS: PipelineStepDefinition[] = [
  {
    key: "queued",
    label: "Đã nhận video",
    completedStatuses: [
      "ingesting",
      "transcribing",
      "diarizing",
      "translating",
      "casting",
      "synthesizing",
      "partial_ready",
      "ready",
    ],
    activeStatuses: ["queued"],
  },
  {
    key: "ingesting",
    label: "Đã phân tích âm thanh",
    completedStatuses: [
      "transcribing",
      "diarizing",
      "translating",
      "casting",
      "synthesizing",
      "partial_ready",
      "ready",
    ],
    activeStatuses: ["ingesting"],
  },
  {
    key: "diarizing",
    label: "Đang nhận diện người nói",
    completedStatuses: [
      "translating",
      "casting",
      "synthesizing",
      "partial_ready",
      "ready",
    ],
    activeStatuses: ["transcribing", "diarizing"],
  },
  {
    key: "translating",
    label: "Đang dịch sang tiếng Việt",
    completedStatuses: ["casting", "synthesizing", "partial_ready", "ready"],
    activeStatuses: ["translating"],
  },
  {
    key: "casting",
    label: "Đang chọn giọng theo nhân vật",
    completedStatuses: ["synthesizing", "partial_ready", "ready"],
    activeStatuses: ["casting"],
  },
  {
    key: "synthesizing",
    label: "Đang tổng hợp giọng nói",
    completedStatuses: ["ready"],
    activeStatuses: ["synthesizing", "partial_ready"],
  },
];

export function JobProgressTimeline({ jobId }: { jobId: string }) {
  const [snapshot, setSnapshot] = useState<JobProgressSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoOpenPreview, setAutoOpenPreview] = useState(false);
  const [isMutatingJob, setIsMutatingJob] = useState(false);

  const handleCancelJob = async () => {
    setIsMutatingJob(true);
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchProgressSnapshot();
      }
    } finally {
      setIsMutatingJob(false);
    }
  };

  const handleRetryJob = async () => {
    setIsMutatingJob(true);
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchProgressSnapshot();
      }
    } finally {
      setIsMutatingJob(false);
    }
  };

  const fetchProgressSnapshot = async () => {
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/progress`, {
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setIsUnauthorized(true);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.message || "Không tìm thấy tiến trình lồng tiếng.");
        setIsLoading(false);
        return;
      }
      setSnapshot(data);
      setFetchError(null);
    } catch {
      setFetchError("Mất kết nối tới máy chủ theo dõi tiến trình.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProgressSnapshot();
  }, [jobId]);

  const isTerminalSnapshot =
    snapshot?.status === "ready" ||
    snapshot?.status === "failed" ||
    snapshot?.status === "canceled";

  useEffect(() => {
    if (isTerminalSnapshot) return;

    const eventSource = new EventSource(`/api/dub-jobs/${jobId}/events`);
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setSnapshot((prev) => ({
          ...(prev ?? {
            jobId,
            readyFromMs: 0,
            readyToMs: 0,
          }),
          ...parsed,
        }));
        setIsLoading(false);
        if (
          parsed.status === "ready" ||
          parsed.status === "failed" ||
          parsed.status === "canceled"
        ) {
          eventSource.close();
        }
      } catch {
        // Ignore malformed frame
      }
    };

    const pollInterval = setInterval(fetchProgressSnapshot, 2500);

    return () => {
      eventSource.close();
      clearInterval(pollInterval);
    };
  }, [jobId, isTerminalSnapshot]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <LoadingSkeletonState label="Đang tải trạng thái tiến trình lồng tiếng..." />
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className="mx-auto max-w-2xl">
        <UnauthorizedState contextMessage="Bạn cần đăng nhập đúng tài khoản sở hữu tiến trình lồng tiếng này." />
      </div>
    );
  }

  if (fetchError || !snapshot) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          whatHappened="Không thể tải tiến trình lồng tiếng"
          whyItHappened={fetchError || "Mã tiến trình không tồn tại."}
          nextStep="Quay lại trang chủ để kiểm tra hoặc tạo bản lồng tiếng mới."
          onRetry={fetchProgressSnapshot}
        />
      </div>
    );
  }

  const isPlayable =
    snapshot.status === "partial_ready" || snapshot.status === "ready";
  const isFailed = snapshot.status === "failed";
  const isCanceled = snapshot.status === "canceled";
  const canCancel =
    snapshot.status !== "ready" &&
    snapshot.status !== "canceled" &&
    snapshot.status !== "failed";
  const canRetry = isFailed || isCanceled;

  return (
    <section
      aria-labelledby="progress-heading"
      className="mx-auto max-w-2xl space-y-space-6 rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <h1
            id="progress-heading"
            className="text-xl font-bold text-text-primary"
          >
            {isFailed
              ? "Tiến trình lồng tiếng gặp sự cố"
              : isPlayable
              ? "Bản lồng tiếng đã sẵn sàng"
              : "Đang chuẩn bị bản lồng tiếng"}
          </h1>
          <p className="text-xs text-text-secondary">
            {snapshot.title || `Mã tiến trình: ${snapshot.jobId}`} · Thời lượng:{" "}
            <span className="font-medium text-text-primary">
              {formatDurationVi(snapshot.durationSeconds)}
            </span>
          </p>
        </div>

        <span className="rounded-sm bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary tabular-nums">
          Tiến độ: {snapshot.progress}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="space-y-space-2">
        <div
          role="progressbar"
          aria-valuenow={snapshot.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tiến độ xử lý bản lồng tiếng"
          className="h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
        >
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, snapshot.progress))}%` }}
          />
        </div>
        <p className="text-xs text-text-secondary">{snapshot.message}</p>
      </div>

      {/* Stepper */}
      <ol className="space-y-space-3">
        {PIPELINE_STEPS.map((step) => {
          const isCompleted = step.completedStatuses.includes(snapshot.status);
          const isActive = step.activeStatuses.includes(snapshot.status);

          return (
            <li
              key={step.key}
              className="flex items-center justify-between rounded-sm border border-surface-2 bg-surface-2/60 px-space-4 py-space-3"
            >
              <div className="flex items-center gap-space-3">
                {isCompleted ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : isActive ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-primary"
                    aria-hidden="true"
                  />
                ) : isFailed ? (
                  <XCircle
                    className="h-4 w-4 shrink-0 text-danger"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="h-4 w-4 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`text-sm ${
                    isCompleted || isActive
                      ? "font-semibold text-text-primary"
                      : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              <span className="text-xs text-text-secondary">
                {isCompleted
                  ? "Hoàn tất"
                  : isActive
                  ? "Đang xử lý"
                  : "Chờ lượt"}
              </span>
            </li>
          );
        })}
      </ol>

      {snapshot.status === "partial_ready" && (
        <PartialReadyState
          readyFromMs={snapshot.readyFromMs}
          readyToMs={snapshot.readyToMs}
        />
      )}

      {isFailed && (
        <ErrorState
          whatHappened="Tiến trình xử lý video không thành công"
          whyItHappened={
            snapshot.errorMessage ||
            `Mã lỗi: ${snapshot.errorCode || "INGEST_FAILED"}`
          }
          nextStep="Số credit chưa sử dụng được bảo toàn. Hãy kiểm tra lại nguồn video và tạo lại bản lồng tiếng."
        />
      )}

      <div className="flex flex-col items-center justify-between gap-space-3 border-t border-surface-2 pt-space-4 sm:flex-row">
        <button
          type="button"
          onClick={() => setAutoOpenPreview((v) => !v)}
          className="text-xs text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {autoOpenPreview
            ? "Đã bật: Tự động mở bản preview ngay khi sẵn sàng"
            : "Bỏ qua phần chờ và xem bản preview khi sẵn sàng"}
        </button>

        <div className="flex flex-wrap items-center gap-space-3">
          <Link
            href="/"
            className="rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Tạo video khác
          </Link>

          {canCancel && (
            <button
              type="button"
              disabled={isMutatingJob}
              onClick={handleCancelJob}
              className="rounded-sm border border-danger/50 bg-danger/10 px-space-3 py-space-2 text-xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
            >
              Hủy tiến trình
            </button>
          )}

          {canRetry && (
            <button
              type="button"
              disabled={isMutatingJob}
              onClick={handleRetryJob}
              className="rounded-sm border border-primary bg-surface-2 px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary disabled:opacity-50"
            >
              Thử lại tiến trình
            </button>
          )}

          <button
            type="button"
            disabled={!isPlayable}
            aria-label="Mở Dub Player để xem bằng tiếng Việt"
            className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-4 py-space-2 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Mở Dub Player
          </button>
        </div>
      </div>
    </section>
  );
}
