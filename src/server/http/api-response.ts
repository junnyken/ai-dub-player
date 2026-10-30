import { NextResponse } from "next/server";
import { DomainError, InsufficientCreditError } from "@/domain/errors";

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof InsufficientCreditError) {
    return NextResponse.json(
      {
        errorCode: err.errorCode,
        message: err.message,
        requiredCredits: err.requiredCredits,
        currentCredits: err.currentCredits,
      },
      { status: 402 }
    );
  }

  if (err instanceof DomainError) {
    return NextResponse.json(
      {
        errorCode: err.errorCode,
        message: err.message,
        ...(err.details ?? {}),
      },
      { status: err.statusCode }
    );
  }

  const fallbackMessage =
    err instanceof Error
      ? err.message
      : "Đã xảy ra lỗi hệ thống không mong muốn. Vui lòng thử lại.";

  return NextResponse.json(
    {
      errorCode: "INTERNAL_SERVER_ERROR",
      message: fallbackMessage,
    },
    { status: 500 }
  );
}
