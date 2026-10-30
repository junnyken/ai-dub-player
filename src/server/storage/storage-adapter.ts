import fs from "fs/promises";
import path from "path";
import { ValidationDomainError } from "@/domain/errors";

export interface StoragePutInput {
  storageKey: string;
  body: Buffer;
  mimeType: string;
}

export interface ObjectStorageAdapter {
  putObject(input: StoragePutInput): Promise<{ storageKey: string; sizeBytes: number }>;
  getObject(storageKey: string): Promise<Buffer>;
  exists(storageKey: string): Promise<boolean>;
  deleteObject(storageKey: string): Promise<void>;
}

export class LocalS3CompatibleStorage implements ObjectStorageAdapter {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = path.resolve(rootDir ?? process.env.STORAGE_ROOT ?? "./.storage");
  }

  public resolveSafePath(storageKey: string): string {
    if (!storageKey || storageKey.includes("\0")) {
      throw new ValidationDomainError(
        "PATH_TRAVERSAL_BLOCKED",
        "Đường dẫn lưu trữ không hợp lệ."
      );
    }
    const rawTrimmed = storageKey.trim();
    if (
      rawTrimmed.includes("..") ||
      path.isAbsolute(rawTrimmed) ||
      /^[a-zA-Z]:/.test(rawTrimmed)
    ) {
      throw new ValidationDomainError(
        "PATH_TRAVERSAL_BLOCKED",
        "Phát hiện truy cập vượt khỏi thư mục lưu trữ an toàn (Path Traversal)."
      );
    }
    const targetPath = path.resolve(this.rootDir, rawTrimmed.replace(/^[/\\]+/, ""));
    const rootWithSep = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : this.rootDir + path.sep;
    if (!targetPath.startsWith(rootWithSep)) {
      throw new ValidationDomainError(
        "PATH_TRAVERSAL_BLOCKED",
        "Đường dẫn lưu trữ vượt khỏi thư mục gốc cho phép."
      );
    }
    return targetPath;
  }

  async putObject(input: StoragePutInput): Promise<{ storageKey: string; sizeBytes: number }> {
    const targetPath = this.resolveSafePath(input.storageKey);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, input.body);
    return {
      storageKey: input.storageKey,
      sizeBytes: input.body.byteLength,
    };
  }

  async getObject(storageKey: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(storageKey);
    return fs.readFile(targetPath);
  }

  async exists(storageKey: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(storageKey);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    const targetPath = this.resolveSafePath(storageKey);
    try {
      await fs.unlink(targetPath);
    } catch {
      // Ignore if already deleted
    }
  }
}

export const storageAdapter: ObjectStorageAdapter = new LocalS3CompatibleStorage();
