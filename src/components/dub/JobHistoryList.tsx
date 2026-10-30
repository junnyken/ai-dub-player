"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Film, RefreshCw } from "lucide-react";
import { DubJobStatus } from "@/domain/models";
import { formatDurationVi } from "@/lib/format";

interface JobSummaryDto {
  id: string;
  title: string;
  sourceType: "youtube" | "upload";
  durationSeconds: number;
  status: DubJobStatus;
  progress: number;
  currentStageMessage?: string | null;
  creditEstimated: number;
  creditSpent: number;
  createdAt: string;
}

export function JobHistoryList({ refreshSignal }: { refreshSignal?: number }) {
  const [jobs, setJobs] = useState<JobSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dub-jobs", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
      }
    } catch {
      // Ignore network error on home history list
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshSignal]);

  if (!isLoading && jobs.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="job-history-heading"
      className="mx-auto mt-space-8 max-w-2xl rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex items-center justify-between border-b border-surface-2 pb-space-3">
        <div className="flex items-center gap-space-2">
          <Film className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2
            id="job-history-heading"
            className="text-base font-bold text-text-primary"
          >
            Video đã lồng tiếng gần đây
          </h2>
        </div>

        <button
          type="button"
          onClick={loadJobs}
          className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface-2 px-space-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Làm mới
        </button>
      </div>

      <div className="mt-space-4 space-y-space-3">
        {jobs.map((job) => {
          const isReady =
            job.status === "ready" || job.status === "partial_ready";
          const isCanceledOrFailed =
            job.status === "canceled" || job.status === "failed";

          return (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-space-3 rounded-md border border-surface-2 bg-surface-2 p-space-4"
            >
              <div className="space-y-space-1">
                <div className="flex items-center gap-space-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {job.title}
                  </span>
                  <span
                    className={`rounded-sm px-space-2 py-0.5 text-[11px] font-semibold ${
                      isReady
                        ? "bg-success/15 text-success"
                        : isCanceledOrFailed
                        ? "bg-danger/15 text-danger"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {job.status} · {job.progress}%
                  </span>
                </div>
                <p className="flex items-center gap-space-2 text-xs text-text-secondary tabular-nums">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{formatDurationVi(job.durationSeconds)}</span>
                  <span>·</span>
                  <span>
                    Chi phí: {job.creditSpent || job.creditEstimated} credit
                  </span>
                </p>
              </div>

              <Link
                href={`/jobs/${job.id}`}
                className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-space-1.5 text-xs font-semibold text-text-primary hover:bg-primary-hover"
              >
                <span>{isReady ? "Xem bằng tiếng Việt" : "Mở tiến trình"}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
