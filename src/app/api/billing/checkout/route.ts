import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { billingService } from "@/server/services/billing-service";
import { handleApiError } from "@/server/http/api-response";
import { UserPlan } from "@/domain/models";
import { DomainError } from "@/domain/errors";

export async function POST(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const body = await req.json();

    // Security hardening (F-04): Block unverified self-checkout in production unless sandbox is explicitly enabled
    if (
      process.env.NODE_ENV === "production" &&
      process.env.BILLING_SANDBOX_ENABLED !== "true"
    ) {
      const expectedWebhookSecret = process.env.BILLING_WEBHOOK_SECRET?.trim();
      const providedSignature = req.headers.get("x-billing-signature")?.trim();
      if (!expectedWebhookSecret || providedSignature !== expectedWebhookSecret) {
        throw new DomainError(
          402,
          "PAYMENT_VERIFICATION_REQUIRED",
          "Giao dịch nâng cấp gói trong môi trường Production yêu cầu xác thực cổng thanh toán hợp lệ."
        );
      }
    }

    const result = await billingService.executeCheckout({
      userId: user.id,
      kind: body.kind,
      targetPlan: body.targetPlan as UserPlan | undefined,
      creditPackId: body.creditPackId as string | undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
