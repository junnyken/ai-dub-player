"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, History, Sparkles, X } from "lucide-react";
import { UserPlan } from "@/domain/models";
import { formatDurationVi } from "@/lib/format";

interface PlanItemDto {
  id: UserPlan;
  name: string;
  priceMonthlyUsd: number;
  includedCredits: number;
  maxVideoDurationSeconds: number;
  descriptionVi: string;
}

interface CreditPackDto {
  id: string;
  name: string;
  credits: number;
  priceUsd: number;
  descriptionVi: string;
}

interface LedgerEntryDto {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  jobId?: string | null;
  createdAt: string;
}

export function BillingModal({
  isOpen,
  onClose,
  onBillingSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onBillingSuccess?: () => void;
}) {
  const [plans, setPlans] = useState<PlanItemDto[]>([]);
  const [packs, setPacks] = useState<CreditPackDto[]>([]);
  const [currentPlan, setCurrentPlan] = useState<UserPlan>("free");
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [entries, setEntries] = useState<LedgerEntryDto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadBillingData = useCallback(async () => {
    try {
      const [plansRes, ledgerRes] = await Promise.all([
        fetch("/api/billing/plans", { cache: "no-store" }),
        fetch("/api/billing/ledger", { cache: "no-store" }),
      ]);
      if (plansRes.ok) {
        const cat = await plansRes.json();
        setPlans(cat.plans ?? []);
        setPacks(cat.creditPacks ?? []);
      }
      if (ledgerRes.ok) {
        const led = await ledgerRes.json();
        setCurrentPlan(led.plan);
        setCreditBalance(led.creditBalance);
        setEntries(led.entries ?? []);
      }
    } catch {
      // Ignore network error on modal open
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setFeedbackMsg(null);
      setErrorMsg(null);
      loadBillingData();
    }
  }, [isOpen, loadBillingData]);

  if (!isOpen) return null;

  const handleCheckout = async (params: {
    kind: "plan_upgrade" | "credit_topup";
    targetPlan?: UserPlan;
    creditPackId?: string;
  }) => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Không thể xử lý giao dịch thanh toán.");
        return;
      }
      setFeedbackMsg(
        `Thanh toán thành công (+${data.receipt.creditsGranted} credits). Số dư mới: ${data.user.creditBalance} credits.`
      );
      await loadBillingData();
      onBillingSuccess?.();
    } catch {
      setErrorMsg("Lỗi kết nối tới cổng thanh toán.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-space-4"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-surface-2 bg-surface p-space-6">
        <div className="flex items-center justify-between border-b border-surface-2 pb-space-4">
          <div>
            <h2
              id="billing-modal-title"
              className="flex items-center gap-space-2 text-lg font-bold text-text-primary"
            >
              <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
              Gói cước Studio & Quản lý Credit
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Gói hiện tại:{" "}
              <span className="font-bold uppercase text-primary">
                {currentPlan}
              </span>{" "}
              · Số dư:{" "}
              <span className="font-bold text-text-primary tabular-nums">
                {creditBalance} credits
              </span>{" "}
              (1 credit = 1 phút video lồng tiếng AI)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ gói cước"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-surface-2 bg-surface-2 text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {feedbackMsg && (
          <div
            role="status"
            className="mt-space-4 flex items-center gap-space-2 rounded-sm border border-success/40 bg-success/10 px-space-3 py-space-2 text-xs text-success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-space-4 rounded-sm border border-danger/40 bg-danger/10 px-space-3 py-space-2 text-xs text-danger"
          >
            {errorMsg}
          </div>
        )}

        {/* Section 1: Plan Upgrade */}
        <div className="mt-space-6 space-y-space-3">
          <h3 className="text-sm font-bold text-text-primary">
            1. Nâng cấp gói Studio (Mở khóa giới hạn thời lượng video)
          </h3>
          <div className="grid grid-cols-1 gap-space-4 sm:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col justify-between rounded-md border p-space-4 ${
                    isCurrent
                      ? "border-primary bg-surface-2"
                      : "border-surface-2 bg-surface-2/60"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-text-primary">
                        {plan.name}
                      </span>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        ${plan.priceMonthlyUsd}/tháng
                      </span>
                    </div>
                    <p className="mt-space-2 text-xs text-text-secondary">
                      {plan.descriptionVi}
                    </p>
                    <p className="mt-space-2 text-[11px] text-text-muted tabular-nums">
                      Tối đa:{" "}
                      {formatDurationVi(plan.maxVideoDurationSeconds)}/video · +
                      {plan.includedCredits} credits
                    </p>
                  </div>

                  <div className="mt-space-4">
                    {plan.id === "free" ? (
                      <span className="inline-block w-full rounded-sm border border-surface bg-surface py-space-1.5 text-center text-xs text-text-muted">
                        Gói mặc định
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleCheckout({
                            kind: "plan_upgrade",
                            targetPlan: plan.id,
                          })
                        }
                        className="inline-flex w-full items-center justify-center gap-space-1 rounded-sm bg-primary px-space-3 py-space-1.5 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        {isCurrent
                          ? `Gia hạn ${plan.name}`
                          : `Nâng cấp ${plan.name}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Credit Top-Up Packs */}
        <div className="mt-space-6 space-y-space-3">
          <h3 className="text-sm font-bold text-text-primary">
            2. Nạp thêm gói Credit lẻ (Không giới hạn thời hạn sử dụng)
          </h3>
          <div className="grid grid-cols-1 gap-space-4 sm:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-col justify-between rounded-md border border-surface-2 bg-surface-2/60 p-space-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-text-primary">
                      {pack.name}
                    </span>
                    <span className="text-xs font-bold text-accent tabular-nums">
                      ${pack.priceUsd}
                    </span>
                  </div>
                  <p className="mt-space-2 text-xs text-text-secondary">
                    {pack.descriptionVi}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() =>
                    handleCheckout({
                      kind: "credit_topup",
                      creditPackId: pack.id,
                    })
                  }
                  className="mt-space-4 w-full rounded-sm border border-primary/50 bg-surface py-space-1.5 text-xs font-semibold text-text-primary hover:bg-primary"
                >
                  Nạp +{pack.credits} Credits
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Credit Ledger Audit Trail */}
        <div className="mt-space-6 space-y-space-3 border-t border-surface-2 pt-space-4">
          <h3 className="flex items-center gap-space-2 text-sm font-bold text-text-primary">
            <History className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            Lịch sử biến động Credit (Sổ cái minh bạch)
          </h3>
          {entries.length === 0 ? (
            <p className="text-xs text-text-muted">
              Chưa có giao dịch biến động credit nào.
            </p>
          ) : (
            <div className="max-h-44 space-y-space-1.5 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-xs tabular-nums"
                >
                  <div>
                    <span className="font-medium text-text-primary">
                      {entry.reason}
                    </span>
                    {entry.jobId && (
                      <span className="ml-space-2 text-text-muted">
                        ({entry.jobId})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-space-3">
                    <span
                      className={`font-bold ${
                        entry.delta >= 0 ? "text-success" : "text-warning"
                      }`}
                    >
                      {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}{" "}
                      credits
                    </span>
                    <span className="text-text-secondary">
                      Dư: {entry.balanceAfter}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
