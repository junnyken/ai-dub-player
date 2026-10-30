import crypto from "crypto";
import { UserPlan } from "@/domain/models";

export interface BillingCheckoutRequest {
  userId: string;
  userEmail: string;
  kind: "plan_upgrade" | "credit_topup";
  targetPlan?: UserPlan;
  creditPackId?: string;
  amountUsd: number;
  creditsToGrant: number;
}

export interface BillingCheckoutReceipt {
  provider: string;
  transactionId: string;
  status: "succeeded" | "failed";
  amountUsd: number;
  creditsGranted: number;
  paidAt: string;
}

export interface BillingProvider {
  readonly providerName: string;
  processCheckout(input: BillingCheckoutRequest): Promise<BillingCheckoutReceipt>;
}

export class StudioStripeBillingAdapter implements BillingProvider {
  public readonly providerName = "stripe-lemon-adapter";

  public async processCheckout(
    input: BillingCheckoutRequest
  ): Promise<BillingCheckoutReceipt> {
    const txId = `tx_${crypto
      .createHash("sha1")
      .update(`${input.userId}:${input.kind}:${Date.now()}:${Math.random()}`)
      .digest("hex")
      .slice(0, 14)}`;

    return {
      provider: this.providerName,
      transactionId: txId,
      status: "succeeded",
      amountUsd: input.amountUsd,
      creditsGranted: input.creditsToGrant,
      paidAt: new Date().toISOString(),
    };
  }
}

export const defaultBillingProvider: BillingProvider =
  new StudioStripeBillingAdapter();
