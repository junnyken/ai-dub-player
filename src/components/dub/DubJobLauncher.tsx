"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  FileUp,
  Globe,
  Link2,
  Sparkles,
} from "lucide-react";
import { formatDurationVi } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  InsufficientCreditState,
  LoadingSkeletonState,
  UnauthorizedState,
} from "@/components/states/DataStates";

interface EstimateResponseDto {
  sourceType: "youtube" | "upload";
  sourceUrl?: string;
  sourceVideoId?: string;
  sourceFileId?: string;
  title: string;
  durationSeconds: number;
  creditEstimated: number;
  currentCredits: number;
  userPlan: string;
  maxPlanDurationSeconds: number;
  canAfford: boolean;
  withinPlanDurationLimit: boolean;
  isEstimated: boolean;
}

export function DubJobLauncher({
  onJobCreated,
}: {
  onJobCreated?: (jobId: string) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceMode, setSourceMode] = useState<"youtube" | "upload">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<"vi">("vi");
  const [rightsConfirmed, setRightsConfirmed] = useState(true);

  const [isInspecting, setIsInspecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponseDto | null>(null);

  const [errorState, setErrorState] = useState<{
    what: string;
    why: string;
    next: string;
  } | null>(null);
  const [insufficientCredit, setInsufficientCredit] = useState<{
    required: number;
    current: number;
  } | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const resetStates = () => {
    setErrorState(null);
    setInsufficientCredit(null);
    setIsUnauthorized(false);
  };

  const handleInspectYouTube = async (urlToInspect?: string) => {
    const targetUrl = (urlToInspect ?? youtubeUrl).trim();
    if (!targetUrl) {
      setEstimate(null);
      return;
    }

    resetStates();
    setSourceMode("youtube");
    setIsInspecting(true);

    try {
      const res = await fetch("/api/dub-jobs/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "youtube",
          sourceUrl: targetUrl,
          targetLanguage,
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        setIsUnauthorized(true);
        setEstimate(null);
        return;
      }

      if (!res.ok) {
        setEstimate(null);
        setErrorState({
          what: "Không thể xác minh đường dẫn YouTube",
          why: data.message || "Đường dẫn không hợp lệ hoặc không truy cập được.",
          next: "Hãy kiểm tra lại link YouTube công khai (không DRM/riêng tư) hoặc chọn tải lên video từ máy.",
        });
        return;
      }

      setEstimate(data);
      if (!data.canAfford) {
        setInsufficientCredit({
          required: data.creditEstimated,
          current: data.currentCredits,
        });
      } else if (!data.withinPlanDurationLimit) {
        const limitMin = Math.floor(data.maxPlanDurationSeconds / 60);
        setErrorState({
          what: "Thời lượng video vượt quá giới hạn gói hiện tại",
          why: `Video dài ${formatDurationVi(data.durationSeconds)}, trong khi gói ${String(data.userPlan).toUpperCase()} giới hạn tối đa ${limitMin} phút/video.`,
          next: "Vui lòng chọn video ngắn hơn hoặc nâng cấp lên gói cao hơn.",
        });
      }
    } catch {
      setErrorState({
        what: "Không thể kết nối máy chủ kiểm tra video",
        why: "Yêu cầu mạng bị gián đoạn khi đọc metadata.",
        next: "Vui lòng kiểm tra kết nối mạng và bấm Thử kiểm tra lại.",
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetStates();
    setSourceMode("upload");
    setIsInspecting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("rightsConfirmed", rightsConfirmed ? "true" : "false");

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.status === 401) {
        setIsUnauthorized(true);
        setEstimate(null);
        return;
      }

      if (!res.ok) {
        setEstimate(null);
        setErrorState({
          what: "File tải lên không hợp lệ",
          why: data.message || "Không thể đọc được metadata từ file đã chọn.",
          next: "Hãy chọn file thuộc định dạng hỗ trợ (mp4, mov, mkv, webm, mp3, wav, m4a) có kênh âm thanh hợp lệ.",
        });
        return;
      }

      const nextEstimate: EstimateResponseDto = {
        sourceType: "upload",
        sourceFileId: data.sourceFileId,
        title: data.fileName,
        durationSeconds: data.durationSeconds,
        creditEstimated: data.creditEstimated,
        currentCredits: data.currentCredits,
        userPlan: "pro",
        maxPlanDurationSeconds: data.maxPlanDurationSeconds,
        canAfford: data.canAfford,
        withinPlanDurationLimit: data.withinPlanDurationLimit,
        isEstimated: true,
      };

      setEstimate(nextEstimate);
      if (!data.canAfford) {
        setInsufficientCredit({
          required: data.creditEstimated,
          current: data.currentCredits,
        });
      }
    } catch {
      setErrorState({
        what: "Tải file lên thất bại",
        why: "Kết nối bị ngắt trong quá trình truyền tải file media.",
        next: "Vui lòng chọn lại file từ máy và thử lại.",
      });
    } finally {
      setIsInspecting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCreateDubJob = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStates();

    if (sourceMode === "youtube" && !youtubeUrl.trim()) {
      setErrorState({
        what: "Chưa có nguồn video để lồng tiếng",
        why: "Bạn chưa dán đường dẫn YouTube hoặc chọn file video từ máy.",
        next: "Hãy dán link YouTube vào ô nhập hoặc bấm 'Chọn video từ máy'.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload =
        sourceMode === "upload" && estimate?.sourceFileId
          ? {
              sourceType: "upload",
              sourceFileId: estimate.sourceFileId,
              targetLanguage,
              clientType: "web",
            }
          : {
              sourceType: "youtube",
              sourceUrl: youtubeUrl.trim(),
              targetLanguage,
              clientType: "web",
            };

      const res = await fetch("/api/dub-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 401) {
        setIsUnauthorized(true);
        return;
      }

      if (res.status === 402) {
        setInsufficientCredit({
          required: Number(data.requiredCredits ?? estimate?.creditEstimated ?? 1),
          current: Number(data.currentCredits ?? 0),
        });
        return;
      }

      if (res.status === 409 && data.existingJobId) {
        onJobCreated?.(data.existingJobId);
        router.push(`/jobs/${data.existingJobId}`);
        return;
      }

      if (!res.ok) {
        setErrorState({
          what: "Không thể khởi tạo tiến trình lồng tiếng",
          why: data.message || "Dữ liệu nguồn không vượt qua bước kiểm tra hợp lệ.",
          next: "Hãy kiểm tra lại link YouTube hoặc file tải lên rồi bấm thử lại.",
        });
        return;
      }

      onJobCreated?.(data.id);
      router.push(`/jobs/${data.id}`);
    } catch {
      setErrorState({
        what: "Lỗi kết nối khi tạo bản lồng tiếng",
        why: "Không nhận được phản hồi từ máy chủ Dub Engine.",
        next: "Vui lòng thử bấm lại nút Tạo bản lồng tiếng.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="launcher-heading"
      className="mx-auto max-w-2xl rounded-lg border border-surface-2 bg-surface p-space-6 shadow-sm"
    >
      <div className="space-y-space-2 text-center">
        <h1
          id="launcher-heading"
          className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl"
        >
          Xem bất kỳ video nào bằng tiếng Việt
        </h1>
        <p className="text-sm text-text-secondary">
          AI tự nhận diện người nói và chọn giọng phù hợp cho từng nhân vật.
        </p>
      </div>

      <form onSubmit={handleCreateDubJob} className="mt-space-6 space-y-space-4">
        <div>
          <label
            htmlFor="youtube-url-input"
            className="block text-xs font-semibold text-text-secondary"
          >
            Đường dẫn YouTube
          </label>
          <div className="mt-space-2 flex flex-col gap-space-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                id="youtube-url-input"
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setSourceMode("youtube");
                }}
                onBlur={() => {
                  if (youtubeUrl.trim()) {
                    handleInspectYouTube(youtubeUrl);
                  }
                }}
                placeholder="Dán link YouTube (ví dụ: https://www.youtube.com/watch?v=...)"
                className="w-full rounded-sm border border-surface-2 bg-surface-2 py-space-2 pl-9 pr-space-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => handleInspectYouTube(youtubeUrl)}
              disabled={!youtubeUrl.trim() || isInspecting}
              className="rounded-sm border border-surface-2 bg-surface-2 px-space-4 py-space-2 text-xs font-semibold text-text-primary hover:border-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Kiểm tra thời lượng
            </button>
          </div>

          {/* Multi-Genre 1-Click Showcase Presets */}
          <div className="mt-space-2 flex flex-wrap items-center gap-space-1.5 text-[11px]">
            <span className="text-text-muted">Thử nhanh theo thể loại:</span>
            {[
              {
                label: "Hoạt hình / Anime (Bé Bo & Vy)",
                url: "https://www.youtube.com/watch?v=animDragon1",
              },
              {
                label: "Điện ảnh / Hành động (Minh & Linh)",
                url: "https://www.youtube.com/watch?v=cinemaAct01",
              },
              {
                label: "Tài liệu Khoa học (Quốc & An)",
                url: "https://www.youtube.com/watch?v=docOcean001",
              },
              {
                label: "YouTube Thực tế (jNQXAC9IVRw)",
                url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
              },
            ].map((sample) => (
              <button
                key={sample.url}
                type="button"
                onClick={() => {
                  setYoutubeUrl(sample.url);
                  setSourceMode("youtube");
                  handleInspectYouTube(sample.url);
                }}
                className="rounded-sm border border-surface-2 bg-surface-2 px-2 py-0.5 font-medium text-text-secondary hover:border-primary hover:text-text-primary"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-space-3 rounded-md border border-surface-2 bg-surface-2/60 p-space-3 sm:flex-row sm:items-center">
          <div className="space-y-space-1">
            <span className="block text-xs font-medium text-text-primary">
              Hoặc tải lên file video / âm thanh từ máy
            </span>
            <span className="block text-[11px] text-text-muted">
              Hỗ trợ: mp4, mov, mkv, webm, mp3, wav, m4a
            </span>
          </div>

          <div className="flex items-center gap-space-3">
            <input
              ref={fileInputRef}
              id="local-video-upload"
              type="file"
              accept=".mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a"
              onChange={handleFileChange}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-space-2 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <FileUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Chọn video từ máy
            </button>
          </div>
        </div>

        <div className="flex items-start gap-space-2">
          <input
            id="rights-confirm-checkbox"
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-surface-2 accent-primary"
          />
          <label
            htmlFor="rights-confirm-checkbox"
            className="text-xs text-text-secondary"
          >
            Tôi xác nhận video thuộc phạm vi công khai hoặc tôi có quyền hợp pháp để xử lý lồng tiếng nội dung này (không chứa DRM).
          </label>
        </div>

        <div className="flex flex-col justify-between gap-space-3 pt-space-1 sm:flex-row sm:items-center">
          <div className="flex items-center gap-space-2">
            <Globe className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            <label
              htmlFor="target-language-select"
              className="text-xs font-medium text-text-secondary"
            >
              Ngôn ngữ đích:
            </label>
            <select
              id="target-language-select"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value as "vi")}
              className="rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>

          <span className="text-[11px] text-text-muted">
            Quyết định · Nhượng quyền · Thiết lập · Ướt
          </span>
        </div>

        {/* Data States */}
        <div className="pt-space-2">
          {isInspecting && <LoadingSkeletonState />}

          {!isInspecting && isUnauthorized && <UnauthorizedState />}

          {!isInspecting && insufficientCredit && (
            <InsufficientCreditState
              requiredCredits={insufficientCredit.required}
              currentCredits={insufficientCredit.current}
            />
          )}

          {!isInspecting && errorState && (
            <ErrorState
              whatHappened={errorState.what}
              whyItHappened={errorState.why}
              nextStep={errorState.next}
              onRetry={
                sourceMode === "youtube" && youtubeUrl.trim()
                  ? () => handleInspectYouTube(youtubeUrl)
                  : undefined
              }
            />
          )}

          {!isInspecting &&
            !errorState &&
            !insufficientCredit &&
            !isUnauthorized &&
            estimate && (
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <div className="flex flex-wrap items-center justify-between gap-space-2">
                  <div className="flex items-center gap-space-2">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold text-text-primary">
                      {estimate.title}
                    </span>
                  </div>
                  <span className="rounded-sm bg-surface px-space-2 py-0.5 text-[11px] font-medium text-text-secondary">
                    Ước tính
                  </span>
                </div>

                <div className="mt-space-2 flex flex-wrap items-center gap-space-3 text-xs text-text-secondary tabular-nums">
                  <span className="inline-flex items-center gap-space-1">
                    <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    Ước lượng:{" "}
                    <strong className="text-text-primary">
                      {formatDurationVi(estimate.durationSeconds)}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    khoảng{" "}
                    <strong className="text-text-primary">
                      {estimate.creditEstimated} credit
                    </strong>
                  </span>
                </div>
              </div>
            )}

          {!isInspecting &&
            !errorState &&
            !insufficientCredit &&
            !isUnauthorized &&
            !estimate && (
              <EmptyState
                title="Chưa chọn video nguồn"
                reason="Hệ thống cần xác minh thời lượng video để tính chính xác số credit dự kiến trước khi khởi tạo."
                nextAction="Dán đường dẫn YouTube hợp lệ hoặc bấm 'Chọn video từ máy' để xem ước lượng credit."
              />
            )}
        </div>

        <div className="pt-space-2">
          <button
            type="submit"
            disabled={
              isSubmitting ||
              isInspecting ||
              Boolean(insufficientCredit) ||
              (estimate !== null && !estimate.withinPlanDurationLimit)
            }
            className="inline-flex w-full items-center justify-center gap-space-2 rounded-md bg-primary px-space-6 py-space-3 text-sm font-bold text-text-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? "Đang khởi tạo bản lồng tiếng..." : "Tạo bản lồng tiếng"}
          </button>
        </div>
      </form>
    </section>
  );
}
