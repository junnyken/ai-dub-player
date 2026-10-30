export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DomainError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class InsufficientCreditError extends DomainError {
  public readonly requiredCredits: number;
  public readonly currentCredits: number;

  constructor(requiredCredits: number, currentCredits: number) {
    super(
      402,
      "INSUFFICIENT_CREDIT",
      `Số dư credit không đủ. Cần ${requiredCredits} credit nhưng tài khoản hiện có ${currentCredits} credit.`,
      { requiredCredits, currentCredits }
    );
    this.requiredCredits = requiredCredits;
    this.currentCredits = currentCredits;
  }
}

export class ValidationDomainError extends DomainError {
  constructor(errorCode: string, message: string, details?: Record<string, unknown>) {
    super(422, errorCode, message, details);
  }
}

export class DuplicateJobError extends DomainError {
  public readonly existingJobId: string;

  constructor(existingJobId: string) {
    super(
      409,
      "DUPLICATE_ACTIVE_JOB",
      "Video này đang được xử lý trong một tiến trình lồng tiếng khác. Vui lòng theo dõi tiến trình hiện tại.",
      { existingJobId }
    );
    this.existingJobId = existingJobId;
  }
}
