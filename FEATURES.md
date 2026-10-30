# AI Dub Player — Features & Capabilities

## Tổng quan sản phẩm
**AI Dub Player** là ứng dụng web và Chrome Extension (Phase 2) cho phép người dùng dán link YouTube hoặc tải lên video local để AI tự động nhận diện người nói, dịch ngữ cảnh sang tiếng Việt, phân vai giọng nói (AI Casting theo nhân vật) và phát bản lồng tiếng đồng bộ phụ đề song ngữ.

---

## Trạng thái các Capability (Theo MINI-SPEC — Hoàn thành 100% MVP Phase 1 & Phase 2)

### [x] MINI-SPEC D1 — Ingest Video & Job Creation (Hoàn thành)
- **Xác thực & Quản lý gói/Credit (`AuthService`, `CreditEstimator`)**
- **Xử lý link YouTube (`YouTubeUrlResolver`) & Tải lên file local (`UploadedFileValidator`, `MediaMetadataExtractor`)**
- **Điều phối tiến trình & Hàng đợi (`DubJobOrchestrator`, `JobQueueService`)**

### [x] MINI-SPEC D2 — ASR, Speaker Diarization & Transcript (Hoàn thành)
- **Nhận diện giọng nói & Phụ đề fallback (`AsrProvider`)**
- **Phân tách cụm người nói (`DiarizationProvider`)**
- **Chuẩn hóa & Tách/Gộp câu thoại (`SegmentMerger`) & Quản lý phiên bản (`TranscriptVersionService`, `TranscriptEditor`)**

### [x] MINI-SPEC D3 — Context Translation sang Tiếng Việt (Hoàn thành)
- **Dịch theo cửa sổ ngữ cảnh (`ContextWindowBuilder`, `TranslationProvider`)**
- **Bảng thuật ngữ & Quy tắc xưng hô (`GlossaryService`)**
- **Kiểm định tính nhất quán (`TranslationConsistencyChecker`) & Giao diện biên tập (`TranslationEditor`)**

### [x] MINI-SPEC D4 — AI Casting theo Nhân vật (Hoàn thành)
- **Phân tích hồ sơ người nói (`SpeakerAnalyzer`)**
- **Đề xuất giọng đọc khác biệt theo nhân vật (`VoiceCatalogService`, `VoiceMatcher`, `CastingService`)**
- **Nghe thử giọng đọc & Lưu Preset (`VoicePreviewService`, `VoicePresetService`, `SpeakerVoicePanel`)**

### [x] MINI-SPEC D5 — TTS, Timing Alignment & Dub Player (Hoàn thành)
- **Tổng hợp âm thanh TTS theo từng câu thoại (`TtsProvider`, `StudioViTtsProvider`)**
- **Căn chỉnh thời lượng thông minh không cắt câu thoại (`TimingAligner`)**
- **Trộn âm thanh, Phụ đề WEBVTT & Trình phát đồng bộ (`AudioSegmentScheduler`, `SubtitleService`, `PlaybackManifestService`, `DubPlayer`)**

### [x] MINI-SPEC D6 — UX Hardening, Job Management & Billing (Hoàn thành)
- **Quản lý Gói cước & Nạp Credit qua Adapter (`BillingProvider`, `BillingService`, `BillingModal`)**
- **Quản lý vòng đời tiến trình & Hoàn trả Credit tự động (`cancelJob`, `retryJob`, `JobHistoryList`)**
- **Phím tắt trình phát chuẩn Studio (`resolvePlayerShortcutAction`, `DubPlayer`)**

### [x] MINI-SPEC E1 — Chrome Extension YouTube Detection & Job Trigger (Hoàn thành)
- **Cấu hình Manifest V3 tối giản quyền (`extension/manifest.json`)**
- **Nhận diện trang xem video YouTube & SPA Navigation (`YouTubePageDetector`)**
- **Kích hoạt lồng tiếng trực tiếp từ YouTube (`ExtensionApiClient`, `InPageTriggerButton`, `ExtensionPopupController`)**

### [x] MINI-SPEC E2 — Chrome Extension In-Page Dub Playback (Hoàn thành)
- **Đồng bộ trực tiếp với trình phát `<video>` của YouTube (`YouTubePlayerSyncBridge`, `ExtensionAudioController`):**
  - Tự động giảm âm lượng gốc hoặc mute video YouTube khi bật lồng tiếng; dừng phát audio lồng tiếng ngay lập tức khi video YouTube `pause` hoặc `seeking`.
  - Đồng bộ tức thì khi người dùng tua thời gian (`seek`) hoặc đổi tốc độ phát (`playbackRate = 1.25x, 1.5x`) trên YouTube.
  - Tự động khôi phục nguyên vẹn âm lượng gốc của thẻ `<video>` YouTube khi tắt dub, khi gặp segment lỗi (`status = "failed"`), hoặc khi chuyển trang SPA sang video khác.
- **Overlay phụ đề song ngữ & Đổi giọng nhân vật ngay trên YouTube (`InPageSubtitleOverlay`, `InPageControlWidget`, `YouTubeExtensionContentSession`):**
  - Hiển thị phụ đề (`Tắt` / `Gốc` / `Việt` / `Song ngữ`) phía trên thanh điều khiển YouTube (`bottomOffsetPx = 64`).
  - Cho phép đổi giọng từng nhân vật ngay trong trang YouTube (`changeCharacterVoiceInPage`) mà chỉ tổng hợp lại các `AudioSegment` của nhân vật đó.
  - Hỗ trợ chế độ `degradedFallback` kèm đường dẫn `"Mở trong Web Player"` nếu cấu trúc DOM của YouTube thay đổi.
