import { prisma } from "@/server/db/prisma";
import { PLAN_LIMITS, UserPlan } from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import {
  BillingProvider,
  defaultBillingProvider,
} from "@/server/providers/billing-provider";

export interface PlanCatalogItem {
  id: UserPlan;
  name: string;
  priceMonthlyUsd: number;
  includedCredits: number;
  maxVideoDurationSeconds: number;
  maxUploadBytes: number;
  descriptionVi: string;
}

export interface CreditPackItem {
  id: string;
  name: string;
  credits: number;
  priceUsd: number;
  descriptionVi: string;
}

export const PLAN_CATALOG: PlanCatalogItem[] = [
  {
    id: "free",
    name: "Free Studio",
    priceMonthlyUsd: 0,
    includedCredits: 15,
    maxVideoDurationSeconds: PLAN_LIMITS.free.maxDurationSeconds,
    maxUploadBytes: PLAN_LIMITS.free.maxUploadBytes,
    descriptionVi: "Trải nghiệm AI Casting đa nhân vật cho video đến 15 phút.",
  },
  {
    id: "pro",
    name: "Creator Pro",
    priceMonthlyUsd: 19,
    includedCredits: 120,
    maxVideoDurationSeconds: PLAN_LIMITS.pro.maxDurationSeconds,
    maxUploadBytes: PLAN_LIMITS.pro.maxUploadBytes,
    descriptionVi:
      "Lồng tiếng video dài đến 60 phút, lưu Voice Preset và ưu tiên hàng đợi.",
  },
  {
    id: "business",
    name: "Studio Business",
    priceMonthlyUsd: 49,
    includedCredits: 400,
    maxVideoDurationSeconds: PLAN_LIMITS.business.maxDurationSeconds,
    maxUploadBytes: PLAN_LIMITS.business.maxUploadBytes,
    descriptionVi:
      "Dành cho đội ngũ sản xuất nội dung chuyên nghiệp, hỗ trợ video đến 180 phút.",
  },
];

export const CREDIT_PACK_CATALOG: CreditPackItem[] = [
  {
    id: "pack_30",
    name: "Gói 30 Credits",
    credits: 30,
    priceUsd: 5,
    descriptionVi: "Tương đương ~30 phút video lồng tiếng AI đa nhân vật.",
  },
  {
    id: "pack_100",
    name: "Gói 100 Credits",
    credits: 100,
    priceUsd: 14,
    descriptionVi: "Tương đương ~100 phút video lồng tiếng AI (Tiết kiệm 15%).",
  },
  {
    id: "pack_300",
    name: "Gói 300 Credits",
    credits: 300,
    priceUsd: 35,
    descriptionVi: "Dành cho kênh podcast/talkshow dài kỳ (Tiết kiệm 30%).",
  },
];

export class BillingService {
  private readonly provider: BillingProvider;

  constructor(provider: BillingProvider = defaultBillingProvider) {
    this.provider = provider;
  }

  public getCatalog() {
    return {
      plans: PLAN_CATALOG,
      creditPacks: CREDIT_PACK_CATALOG,
    };
  }

  public async executeCheckout(params: {
    userId: string;
    kind: "plan_upgrade" | "credit_topup";
    targetPlan?: UserPlan;
    creditPackId?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      throw new DomainError(
        401,
        "UNAUTHORIZED",
        "Vui lòng đăng nhập để thực hiện thanh toán."
      );
    }

    if (params.kind === "plan_upgrade") {
      const planItem = PLAN_CATALOG.find((p) => p.id === params.targetPlan);
      if (!planItem || planItem.id === "free") {
        throw new ValidationDomainError(
          "INVALID_TARGET_PLAN",
          "Gói nâng cấp không hợp lệ. Chỉ hỗ trợ nâng cấp lên 'pro' hoặc 'business'."
        );
      }

      const receipt = await this.provider.processCheckout({
        userId: user.id,
        userEmail: user.email,
        kind: "plan_upgrade",
        targetPlan: planItem.id,
        amountUsd: planItem.priceMonthlyUsd,
        creditsToGrant: planItem.includedCredits,
      });

      const updated = await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.update({
          where: { id: user.id },
          data: {
            plan: planItem.id,
            creditBalance: { increment: receipt.creditsGranted },
          },
        });

        const ledgerEntry = await tx.creditLedger.create({
          data: {
            userId: user.id,
            delta: receipt.creditsGranted,
            balanceAfter: freshUser.creditBalance,
            reason: `plan_upgrade:${planItem.id}:${receipt.transactionId}`,
          },
        });

        return { freshUser, ledgerEntry };
      });

      return {
        receipt,
        user: {
          id: updated.freshUser.id,
          email: updated.freshUser.email,
          name: updated.freshUser.name,
          plan: updated.freshUser.plan as UserPlan,
          creditBalance: updated.freshUser.creditBalance,
          maxVideoDurationSeconds: planItem.maxVideoDurationSeconds,
        },
        ledgerEntry: updated.ledgerEntry,
      };
    }

    if (params.kind === "credit_topup") {
      const packItem = CREDIT_PACK_CATALOG.find(
        (c) => c.id === params.creditPackId
      );
      if (!packItem) {
        throw new ValidationDomainError(
          "INVALID_CREDIT_PACK",
          "Gói nạp credit không tồn tại."
        );
      }

      const receipt = await this.provider.processCheckout({
        userId: user.id,
        userEmail: user.email,
        kind: "credit_topup",
        creditPackId: packItem.id,
        amountUsd: packItem.priceUsd,
        creditsToGrant: packItem.credits,
      });

      const updated = await prisma.$transaction(async (tx) => {
        const freshUser = await tx.user.update({
          where: { id: user.id },
          data: {
            creditBalance: { increment: receipt.creditsGranted },
          },
        });

        const ledgerEntry = await tx.creditLedger.create({
          data: {
            userId: user.id,
            delta: receipt.creditsGranted,
            balanceAfter: freshUser.creditBalance,
            reason: `credit_topup:${packItem.id}:${receipt.transactionId}`,
          },
        });

        return { freshUser, ledgerEntry };
      });

      const currentPlan = updated.freshUser.plan as UserPlan;
      return {
        receipt,
        user: {
          id: updated.freshUser.id,
          email: updated.freshUser.email,
          name: updated.freshUser.name,
          plan: currentPlan,
          creditBalance: updated.freshUser.creditBalance,
          maxVideoDurationSeconds:
            PLAN_LIMITS[currentPlan]?.maxDurationSeconds ?? 900,
        },
        ledgerEntry: updated.ledgerEntry,
      };
    }

    throw new ValidationDomainError(
      "INVALID_CHECKOUT_KIND",
      "Loại giao dịch thanh toán không hợp lệ."
    );
  }

  public async getUserLedger(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new DomainError(
        401,
        "UNAUTHORIZED",
        "Vui lòng đăng nhập để xem lịch sử giao dịch credit."
      );
    }

    const entries = await prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const userPlan = user.plan as UserPlan;
    return {
      userId: user.id,
      plan: userPlan,
      creditBalance: user.creditBalance,
      maxVideoDurationSeconds:
        PLAN_LIMITS[userPlan]?.maxDurationSeconds ?? 900,
      entries,
    };
  }
}

export const billingService = new BillingService();
