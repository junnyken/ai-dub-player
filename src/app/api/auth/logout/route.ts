import { NextRequest, NextResponse } from "next/server";
import { authService, SESSION_COOKIE_NAME } from "@/server/auth/auth-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(req: NextRequest) {
  try {
    const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    await authService.logout(cookieToken);
    const res = NextResponse.json({ success: true }, { status: 200 });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
