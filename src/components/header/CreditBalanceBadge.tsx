"use client";

import React from "react";
import { Coins } from "lucide-react";

export function CreditBalanceBadge({
  creditBalance,
  plan,
  isLoading,
}: {
  creditBalance?: number | null;
  plan?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div
        aria-label="Đang tải số dư credit"
        className="h-8 w-28 animate-pulse rounded-sm bg-surface-2"
      />
    );
  }

  const hasValidCredit =
    typeof creditBalance === "number" && Number.isFinite(creditBalance);

  return (
    <div
      className="inline-flex items-center gap-space-2 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-medium text-text-primary tabular-nums"
      title="Số dư credit khả dụng (1 credit = 1 phút video)"
    >
      <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
      <span>
        Credit:{" "}
        <strong className="font-semibold">
          {hasValidCredit ? creditBalance : "Chưa xác minh"}
        </strong>
      </span>
      {plan && (
        <span className="rounded-sm bg-surface-2 px-space-2 py-0.5 text-[11px] uppercase text-text-secondary">
          {plan}
        </span>
      )}
    </div>
  );
}
