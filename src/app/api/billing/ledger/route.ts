import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { billingService } from "@/server/services/billing-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const ledger = await billingService.getUserLedger(user.id);
    return NextResponse.json(ledger, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
