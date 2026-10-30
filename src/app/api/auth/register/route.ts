import { NextRequest, NextResponse } from "next/server";
import { authService, SESSION_COOKIE_NAME } from "@/server/auth/auth-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Security hardening (F-04): Public self-registration always starts on the "free" plan
    const result = await authService.register({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
      plan: "free",
    });

    const res = NextResponse.json(result, { status: 201 });
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
