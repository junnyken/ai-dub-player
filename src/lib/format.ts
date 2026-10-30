export function formatDurationVi(durationSeconds?: number | null): string {
  if (
    durationSeconds === undefined ||
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return "Chưa xác minh thời lượng";
  }

  const totalSec = Math.floor(durationSeconds);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} giờ`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} phút`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} giây`);
  }

  return parts.join(" ");
}

export function formatTimestampMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00.0";
  }
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}.${tenths}`;
}

