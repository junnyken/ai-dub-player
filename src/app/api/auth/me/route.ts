import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      creditBalance: user.creditBalance,
      createdAt: user.createdAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
