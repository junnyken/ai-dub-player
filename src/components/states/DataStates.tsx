"use client";

import React from "react";
import {
  AlertTriangle,
  Coins,
  FileVideo,
  Lock,
  PlayCircle,
  RefreshCw,
} from "lucide-react";

export function LoadingSkeletonState({
  label = "Đang phân tích metadata và kiểm tra thời lượng...",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-surface-2 bg-surface p-space-4"
    >
      <div className="flex items-center justify-between gap-space-3">
        <div className="h-4 w-48 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-5 w-24 animate-pulse rounded-sm bg-surface-2" />
      </div>
      <div className="mt-space-3 h-3 w-3/4 animate-pulse rounded-sm bg-surface-2" />
      <p className="mt-space-2 text-xs text-text-muted">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  reason,
  nextAction,
  actionButton,
}: {
  title: string;
  reason: string;
  nextAction: string;
  actionButton?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-surface-2 bg-surface p-space-4 text-left">
      <div className="flex items-start gap-space-3">
        <FileVideo className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="space-y-space-1">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="text-xs text-text-secondary">{reason}</p>
          <p className="text-xs text-text-muted">Bước tiếp theo: {nextAction}</p>
          {actionButton && <div className="pt-space-2">{actionButton}</div>}
        </div>
      </div>
    </div>
  );
}

export function ErrorState({
  whatHappened,
  whyItHappened,
  nextStep,
  onRetry,
}: {
  whatHappened: string;
  whyItHappened: string;
  nextStep: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/50 bg-surface p-space-4 text-left"
    >
      <div className="flex items-start gap-space-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div className="flex-1 space-y-space-1">
          <p className="text-sm font-semibold text-text-primary">{whatHappened}</p>
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Nguyên nhân:</span> {whyItHappened}
          </p>
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Hành động tiếp theo:</span> {nextStep}
          </p>
          {onRetry && (
            <div className="pt-space-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-space-2 rounded-sm bg-surface-2 px-space-3 py-space-1 text-xs font-medium text-text-primary hover:bg-primary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Thử kiểm tra lại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InsufficientCreditState({
  requiredCredits,
  currentCredits,
  onUpgradeClick,
}: {
  requiredCredits: number;
  currentCredits: number;
  onUpgradeClick?: () => void;
}) {
  const deficit = Math.max(0, requiredCredits - currentCredits);
  return (
    <div
      role="alert"
      className="rounded-md border border-warning/60 bg-surface p-space-4 text-left"
    >
      <div className="flex items-start gap-space-3">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex-1 space-y-space-2">
          <p className="text-sm font-semibold text-text-primary">
            Không đủ credit để tạo bản lồng tiếng này
          </p>
          <div className="grid grid-cols-3 gap-space-2 rounded-sm bg-surface-2 p-space-3 text-xs tabular-nums">
            <div>
              <span className="block text-text-muted">Cần sử dụng</span>
              <span className="font-semibold text-warning">{requiredCredits} credit</span>
            </div>
            <div>
              <span className="block text-text-muted">Hiện có</span>
              <span className="font-semibold text-text-primary">{currentCredits} credit</span>
            </div>
            <div>
              <span className="block text-text-muted">Còn thiếu</span>
              <span className="font-semibold text-danger">{deficit} credit</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-space-1">
            <span className="text-xs text-text-secondary">
              Nâng cấp lên gói Pro (300 credit/tháng) để tiếp tục ngay.
            </span>
            <button
              type="button"
              onClick={onUpgradeClick}
              className="rounded-sm bg-primary px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Nâng gói Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PartialReadyState({
  readyFromMs,
  readyToMs,
  onOpenPlayer,
}: {
  readyFromMs: number;
  readyToMs: number;
  onOpenPlayer?: () => void;
}) {
  const readySec = Math.floor(readyToMs / 1000);
  const fromSec = Math.floor(readyFromMs / 1000);
  return (
    <div className="rounded-md border border-success/50 bg-surface p-space-4 text-left">
      <div className="flex items-start justify-between gap-space-3">
        <div className="flex items-start gap-space-3">
          <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div className="space-y-space-1">
            <p className="text-sm font-semibold text-text-primary">
              Một phần bản lồng tiếng đã sẵn sàng để xem trước
            </p>
            <p className="text-xs text-text-secondary tabular-nums">
              Đoạn từ {fromSec}s đến {readySec}s đã hoàn tất tổng hợp giọng nói. Phần còn lại đang tiếp tục xử lý.
            </p>
          </div>
        </div>
        {onOpenPlayer && (
          <button
            type="button"
            onClick={onOpenPlayer}
            className="shrink-0 rounded-sm bg-primary px-space-4 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Mở Dub Player
          </button>
        )}
      </div>
    </div>
  );
}

export function UnauthorizedState({
  contextMessage = "Vui lòng đăng nhập để giữ nguyên đường dẫn video và tiếp tục tạo bản lồng tiếng.",
  onLoginClick,
}: {
  contextMessage?: string;
  onLoginClick?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-primary/50 bg-surface p-space-4 text-left"
    >
      <div className="flex items-start justify-between gap-space-3">
        <div className="flex items-start gap-space-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-space-1">
            <p className="text-sm font-semibold text-text-primary">
              Cần đăng nhập để thực hiện thao tác này
            </p>
            <p className="text-xs text-text-secondary">{contextMessage}</p>
          </div>
        </div>
        {onLoginClick && (
          <button
            type="button"
            onClick={onLoginClick}
            className="shrink-0 rounded-sm bg-primary px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Đăng nhập ngay
          </button>
        )}
      </div>
    </div>
  );
}
