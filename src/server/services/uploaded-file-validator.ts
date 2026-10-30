import path from "path";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_PREFIXES,
  AllowedUploadExtension,
  PLAN_LIMITS,
  UserPlan,
} from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";

export interface FileValidationInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  userPlan: UserPlan;
  rightsConfirmed?: boolean;
}

export interface ValidatedFileDescriptor {
  extension: AllowedUploadExtension;
  normalizedMimeType: string;
  sizeBytes: number;
}

export class UploadedFileValidator {
  public validate(input: FileValidationInput): ValidatedFileDescriptor {
    if (input.rightsConfirmed === false) {
      throw new ValidationDomainError(
        "RIGHTS_CONFIRMATION_REQUIRED",
        "Bạn cần xác nhận có quyền sử dụng nội dung video/audio này trước khi tải lên."
      );
    }

    const rawExt = path
      .extname(input.fileName || "")
      .replace(/^\./, "")
      .toLowerCase();

    if (
      !rawExt ||
      !ALLOWED_UPLOAD_EXTENSIONS.includes(rawExt as AllowedUploadExtension)
    ) {
      throw new ValidationDomainError(
        "UNSUPPORTED_FILE_EXTENSION",
        `Định dạng file "${rawExt || "không xác định"}" không được hỗ trợ. Chỉ nhận các định dạng: ${ALLOWED_UPLOAD_EXTENSIONS.join(", ")}.`,
        { allowedExtensions: ALLOWED_UPLOAD_EXTENSIONS }
      );
    }

    const extension = rawExt as AllowedUploadExtension;
    const rawMime = (input.mimeType || "").toLowerCase().split(";")[0].trim();

    const allowedMimes = ALLOWED_UPLOAD_MIME_PREFIXES[extension];
    const isGenericOctetStream = rawMime === "application/octet-stream" || rawMime === "";
    const isMimeAllowed =
      isGenericOctetStream || allowedMimes.some((allowed) => rawMime === allowed);

    if (!isMimeAllowed) {
      throw new ValidationDomainError(
        "INVALID_FILE_MIME_TYPE",
        `Kiểu MIME "${rawMime}" không khớp với định dạng .${extension}. Vui lòng chọn đúng file media hợp lệ.`,
        { extension, mimeType: rawMime }
      );
    }

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new ValidationDomainError(
        "EMPTY_UPLOAD_FILE",
        "File tải lên đang trống (0 byte). Vui lòng chọn một file video hoặc âm thanh hợp lệ."
      );
    }

    const planLimits = PLAN_LIMITS[input.userPlan];
    if (input.sizeBytes > planLimits.maxUploadBytes) {
      const limitMb = Math.round(planLimits.maxUploadBytes / (1024 * 1024));
      const actualMb = Math.ceil(input.sizeBytes / (1024 * 1024));
      throw new ValidationDomainError(
        "FILE_TOO_LARGE_FOR_PLAN",
        `Dung lượng file (${actualMb} MB) vượt quá giới hạn gói ${input.userPlan.toUpperCase()} (${limitMb} MB). Vui lòng nén video hoặc nâng cấp gói.`,
        {
          userPlan: input.userPlan,
          maxUploadBytes: planLimits.maxUploadBytes,
          actualBytes: input.sizeBytes,
        }
      );
    }

    return {
      extension,
      normalizedMimeType: isGenericOctetStream ? allowedMimes[0] : rawMime,
      sizeBytes: input.sizeBytes,
    };
  }
}

export const uploadedFileValidator = new UploadedFileValidator();
