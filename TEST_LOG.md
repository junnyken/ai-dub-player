# AI Dub Player — Test & Live Verification Log (`TEST_LOG.md`)

## MINI-SPEC E2 — Chrome Extension In-Page Dub Playback
- **Ngày chạy kiểm thử:** `2026-10-29`
- **Lệnh kiểm thử:** `npm test`, `npm run lint`, `npm run build`
- **Tổng kết toàn hệ thống (D1–D6 + E1–E2):** `24 test files passed | 65 tests passed (100%)`

### 1. Unit Tests E2 (`tests/unit/e2-extension-playback.unit.test.ts` — 2/2 pass)
- `YouTubePlayerSyncBridge` & `ExtensionAudioController`:
  - Đồng bộ `play`, `pause` (dừng ngay audio lồng tiếng khi thẻ `<video>` của YouTube `pause`), `seek`, `playbackRate` (`1.5x`).
  - Tự động kích hoạt fallback an toàn (`fallbackActive = true`, khôi phục âm lượng gốc của `<video>` YouTube `>= 0.8`) khi gặp segment `status = "failed"`.
  - Khôi phục chính xác âm lượng gốc ban đầu (`0.9`) và ẩn phụ đề khi gọi `teardown()`.
- Degraded Fallback khi thiếu thẻ `<video>` trên trang YouTube:
  - Trả về `degradedFallback = true` kèm hướng dẫn `"Mở trong Web Player"`, không bao giờ crash.

### 2. Integration & Regression Tests E2 (`tests/integration/e2-extension-playback.integration.test.ts` — 1/1 pass)
- `InPageControlWidget`:
  - Tải Playback Manifest từ `GET /api/dub-jobs/:id/playback` và danh sách nhân vật từ `GET /api/dub-jobs/:id/speakers`, phát đồng bộ với thẻ `<video>` YouTube.
  - **Regression (Đổi giọng nhân vật ngay trong trang YouTube):** Gọi `changeCharacterVoiceInPage` cho `Speaker 1` qua `PATCH /api/speakers/:id/voice` chỉ cập nhật và tăng `version = 2` cho các `AudioSegment` của `Speaker 1`, trong khi toàn bộ `AudioSegment` của `Speaker 2` giữ nguyên `version = 1`.

### 3. Live Verification E2 (`tests/live/e2-live-verification.test.ts` — 1/1 pass)
- Chạy trọn vẹn phiên xem YouTube thực tế qua `YouTubeExtensionContentSession` (`E1` + `D1..D5` + `E2`):
  - Mở trang `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → Bấm `"Lồng tiếng Việt bằng AI"` → Hoàn tất pipeline `D1 → D5` → Gắn vào thẻ `<video>` của YouTube → Phát giọng lồng tiếng Việt kèm phụ đề song ngữ (âm lượng gốc YouTube tự động giảm xuống `20%`) → Đổi tốc độ phát `1.25x` và tua tới `12.0s` → Bấm `pause` trên YouTube (audio dub dừng tức thì) → Chuyển SPA sang video YouTube thứ 2 (`v=9bZkp7q19f0`) → Tự động hủy overlay và trả lại nguyên vẹn âm lượng gốc `95%` của trình phát YouTube.

---

## MINI-SPEC E1 — Chrome Extension YouTube Detection & Job Trigger
- **Tổng kết E1:** `3 test files passed | 5 tests passed (100%)`

## MINI-SPEC D6 — UX Hardening, Job Management & Billing
- **Tổng kết D6:** `3 test files passed | 4 tests passed (100%)`

## MINI-SPEC D5 — TTS, Timing Alignment & Dub Player
- **Tổng kết D5:** `3 test files passed | 6 tests passed (100%)`

## MINI-SPEC D4 — AI Casting theo Nhân vật
- **Tổng kết D4:** `3 test files passed | 6 tests passed (100%)`

## MINI-SPEC D3 — Context Translation
- **Tổng kết D3:** `3 test files passed | 7 tests passed (100%)`

## MINI-SPEC D2 — ASR, Speaker Diarization & Transcript
- **Tổng kết D2:** `3 test files passed | 11 tests passed (100%)`

## MINI-SPEC D1 — Ingest Video & Job Creation
- **Tổng kết D1:** `3 test files passed | 22 tests passed (100%)`
