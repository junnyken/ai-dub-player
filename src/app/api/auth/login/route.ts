import { NextRequest, NextResponse } from "next/server";
import { authService, SESSION_COOKIE_NAME } from "@/server/auth/auth-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await authService.login({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    });

    const res = NextResponse.json(result, { status: 200 });
    res.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
