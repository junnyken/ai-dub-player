import { PLAN_LIMITS, UserPlan } from "@/domain/models";
import { InsufficientCreditError, ValidationDomainError } from "@/domain/errors";

export interface CreditEstimateResult {
  durationSeconds: number;
  creditEstimated: number;
  userPlan: UserPlan;
  maxPlanDurationSeconds: number;
  currentCredits: number;
  canAfford: boolean;
  withinPlanDurationLimit: boolean;
}

export class CreditEstimator {
  public calculateCredits(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new ValidationDomainError(
        "INVALID_DURATION_FOR_CREDIT",
        "Không thể tính credit khi thời lượng video chưa xác định hoặc bằng 0."
      );
    }
    // 1 credit per started minute (60s)
    return Math.max(1, Math.ceil(durationSeconds / 60));
  }

  public evaluateForUser(params: {
    durationSeconds: number;
    userPlan: UserPlan;
    creditBalance: number;
  }): CreditEstimateResult {
    const creditEstimated = this.calculateCredits(params.durationSeconds);
    const planLimits = PLAN_LIMITS[params.userPlan];
    const withinPlanDurationLimit =
      params.durationSeconds <= planLimits.maxDurationSeconds;
    const canAfford = params.creditBalance >= creditEstimated;

    return {
      durationSeconds: params.durationSeconds,
      creditEstimated,
      userPlan: params.userPlan,
      maxPlanDurationSeconds: planLimits.maxDurationSeconds,
      currentCredits: params.creditBalance,
      canAfford,
      withinPlanDurationLimit,
    };
  }

  public enforceLimitsOrThrow(params: {
    durationSeconds: number;
    userPlan: UserPlan;
    creditBalance: number;
  }): CreditEstimateResult {
    const evaluation = this.evaluateForUser(params);

    if (!evaluation.withinPlanDurationLimit) {
      const maxMinutes = Math.floor(evaluation.maxPlanDurationSeconds / 60);
      const actualMinutes = Math.ceil(params.durationSeconds / 60);
      throw new ValidationDomainError(
        "VIDEO_DURATION_EXCEEDS_PLAN_LIMIT",
        `Thời lượng video (${actualMinutes} phút) vượt quá giới hạn gói ${params.userPlan.toUpperCase()} (tối đa ${maxMinutes} phút/video). Vui lòng chọn video ngắn hơn hoặc nâng cấp gói.`,
        {
          userPlan: params.userPlan,
          maxDurationSeconds: evaluation.maxPlanDurationSeconds,
          actualDurationSeconds: params.durationSeconds,
        }
      );
    }

    if (!evaluation.canAfford) {
      throw new InsufficientCreditError(
        evaluation.creditEstimated,
        params.creditBalance
      );
    }

    return evaluation;
  }
}

export const creditEstimator = new CreditEstimator();
