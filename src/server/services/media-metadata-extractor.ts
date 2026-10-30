import { AllowedUploadExtension } from "@/domain/models";
import { ValidationDomainError } from "@/domain/errors";

export interface ExtractedMediaMetadata {
  durationSeconds: number;
  hasAudioTrack: boolean;
  containerFormat: AllowedUploadExtension;
}

export class MediaMetadataExtractor {
  public extractFromBuffer(
    buffer: Buffer,
    extension: AllowedUploadExtension
  ): ExtractedMediaMetadata {
    if (!buffer || buffer.byteLength < 16) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "File media quá nhỏ hoặc bị hỏng phần header nên không thể đọc được thời lượng âm thanh."
      );
    }

    switch (extension) {
      case "mp4":
      case "mov":
      case "m4a":
        return this.parseIsoBmffContainer(buffer, extension);
      case "wav":
        return this.parseWavContainer(buffer);
      case "webm":
      case "mkv":
        return this.parseEbmlContainer(buffer, extension);
      case "mp3":
        return this.parseMp3Buffer(buffer);
      default:
        throw new ValidationDomainError(
          "UNSUPPORTED_MEDIA_CONTAINER",
          `Không thể trích xuất metadata cho định dạng .${extension}.`
        );
    }
  }

  private parseIsoBmffContainer(
    buffer: Buffer,
    extension: "mp4" | "mov" | "m4a"
  ): ExtractedMediaMetadata {
    const ftypIndex = buffer.indexOf("ftyp");
    const moovIndex = buffer.indexOf("moov");
    if (ftypIndex === -1 && moovIndex === -1) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        `File .${extension} không có cấu trúc MP4/QuickTime hợp lệ (thiếu box ftyp/moov).`
      );
    }

    const mvhdIndex = buffer.indexOf("mvhd");
    if (mvhdIndex === -1 || mvhdIndex + 24 > buffer.byteLength) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        `Không tìm thấy thông tin thời lượng (mvhd atom) trong file .${extension}.`
      );
    }

    const version = buffer.readUInt8(mvhdIndex + 4);
    let timescale = 0;
    let durationUnits = 0;

    if (version === 1) {
      if (mvhdIndex + 36 > buffer.byteLength) {
        throw new ValidationDomainError(
          "METADATA_EXTRACTION_FAILED",
          "Header mvhd 64-bit bị cắt cụt, không thể đọc thời lượng."
        );
      }
      timescale = buffer.readUInt32BE(mvhdIndex + 24);
      const high = buffer.readUInt32BE(mvhdIndex + 28);
      const low = buffer.readUInt32BE(mvhdIndex + 32);
      durationUnits = high * 0x100000000 + low;
    } else {
      timescale = buffer.readUInt32BE(mvhdIndex + 16);
      durationUnits = buffer.readUInt32BE(mvhdIndex + 20);
    }

    if (timescale <= 0 || durationUnits <= 0) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "Thời lượng video/audio trong file bằng 0 hoặc không hợp lệ."
      );
    }

    const durationSeconds = Math.ceil(durationUnits / timescale);

    // Check audio presence: either m4a audio container or "soun" / "mp4a" / "Opus" marker in tracks
    const hasSounHandler =
      extension === "m4a" ||
      buffer.indexOf("soun") !== -1 ||
      buffer.indexOf("mp4a") !== -1 ||
      buffer.indexOf("smhd") !== -1;

    if (!hasSounHandler) {
      throw new ValidationDomainError(
        "NO_AUDIO_TRACK",
        "Video tải lên không có kênh âm thanh (audio track) nên AI không thể nhận diện giọng nói."
      );
    }

    return {
      durationSeconds,
      hasAudioTrack: true,
      containerFormat: extension,
    };
  }

  private parseWavContainer(buffer: Buffer): ExtractedMediaMetadata {
    const riff = buffer.subarray(0, 4).toString("ascii");
    const wave = buffer.subarray(8, 12).toString("ascii");
    if (riff !== "RIFF" || wave !== "WAVE") {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "File .wav không đúng chuẩn RIFF/WAVE header."
      );
    }

    const fmtIndex = buffer.indexOf("fmt ");
    const dataIndex = buffer.indexOf("data");
    if (fmtIndex === -1 || dataIndex === -1 || fmtIndex + 20 > buffer.byteLength) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "File .wav bị thiếu chunk fmt hoặc data."
      );
    }

    const byteRate = buffer.readUInt32LE(fmtIndex + 16);
    const dataSize =
      dataIndex + 8 <= buffer.byteLength
        ? buffer.readUInt32LE(dataIndex + 4)
        : buffer.byteLength - (dataIndex + 8);

    if (byteRate <= 0 || dataSize <= 0) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "Không đọc được thời lượng hợp lệ từ file .wav."
      );
    }

    const durationSeconds = Math.max(1, Math.ceil(dataSize / byteRate));
    return {
      durationSeconds,
      hasAudioTrack: true,
      containerFormat: "wav",
    };
  }

  private parseEbmlContainer(
    buffer: Buffer,
    extension: "webm" | "mkv"
  ): ExtractedMediaMetadata {
    const isEbml =
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3;

    if (!isEbml) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        `File .${extension} không có EBML header hợp lệ.`
      );
    }

    // Look for explicit duration tag or estimate from non-corrupt stream payload
    // In EBML, Duration element ID is 0x4489 (float32 or float64 in milliseconds)
    let durationSeconds = 0;
    for (let i = 4; i < Math.min(buffer.byteLength - 10, 8192); i++) {
      if (buffer[i] === 0x44 && buffer[i + 1] === 0x89) {
        const sizeByte = buffer[i + 2];
        if (sizeByte === 0x84 && i + 7 <= buffer.byteLength) {
          const ms = buffer.readFloatBE(i + 3);
          if (Number.isFinite(ms) && ms > 0) {
            durationSeconds = Math.max(1, Math.ceil(ms / 1000));
            break;
          }
        } else if (sizeByte === 0x88 && i + 11 <= buffer.byteLength) {
          const ms = buffer.readDoubleBE(i + 3);
          if (Number.isFinite(ms) && ms > 0) {
            durationSeconds = Math.max(1, Math.ceil(ms / 1000));
            break;
          }
        }
      }
    }

    if (durationSeconds <= 0) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        `Không tìm thấy trường Duration hợp lệ trong container .${extension}.`
      );
    }

    return {
      durationSeconds,
      hasAudioTrack: true,
      containerFormat: extension,
    };
  }

  private parseMp3Buffer(buffer: Buffer): ExtractedMediaMetadata {
    const hasId3 = buffer.subarray(0, 3).toString("ascii") === "ID3";
    const hasMpegSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;

    if (!hasId3 && !hasMpegSync) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "File .mp3 không có ID3 tag hoặc MPEG audio frame header hợp lệ."
      );
    }

    // Standard 128kbps CBR/VBR payload calculation when valid MP3 header is present
    const payloadBytes = Math.max(0, buffer.byteLength - (hasId3 ? 128 : 4));
    if (payloadBytes < 256) {
      throw new ValidationDomainError(
        "METADATA_EXTRACTION_FAILED",
        "File .mp3 không chứa dữ liệu khung âm thanh hợp lệ."
      );
    }

    const durationSeconds = Math.max(1, Math.ceil(payloadBytes / 16000));
    return {
      durationSeconds,
      hasAudioTrack: true,
      containerFormat: "mp3",
    };
  }
}

export const mediaMetadataExtractor = new MediaMetadataExtractor();
