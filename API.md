# AI Dub Player — API Contract (`API.md`)

## 1. Auth Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

---

## 2. Media Upload & Pre-Check Endpoints (D1)
- `POST /api/uploads`
- `POST /api/dub-jobs/estimate`

---

## 3. Dub Job, Lifecycle, Extension Lookup & Realtime Progress Endpoints (D1, D6 & E1)
- `GET /api/dub-jobs` (Danh sách lịch sử `DubJob` của người dùng)
- `GET /api/dub-jobs/by-video?videoId=xxx` (Tra cứu tiến trình `DubJob` gần nhất của người dùng cho một mã video YouTube `videoId` — phục vụ Chrome Extension E1/E2)
- `POST /api/dub-jobs` (Tạo tiến trình lồng tiếng mới, hỗ trợ `clientType: "web" | "extension"`)
- `GET /api/dub-jobs/:id`
- `GET /api/dub-jobs/:id/progress`
- `GET /api/dub-jobs/:id/events` (SSE)
- `POST /api/dub-jobs/:id/cancel`
- `POST /api/dub-jobs/:id/retry`

---

## 4. Transcript & Speaker Diarization Endpoints (D2)
- `GET /api/dub-jobs/:id/transcript`
- `PATCH /api/transcripts/:id/segments/:segmentId`

---

## 5. Context Translation & Glossary Endpoints (D3)
- `POST /api/dub-jobs/:id/translate`
- `GET /api/dub-jobs/:id/translation`
- `PATCH /api/translations/:id/segments/:segmentId`

---

## 6. AI Character Casting, Voices & Presets Endpoints (D4)
- `GET /api/dub-jobs/:id/speakers`
- `PATCH /api/speakers/:id/voice`
- `POST /api/speakers/:id/voice-preview`
- `GET /api/voices?language=vi`
- `POST /api/voice-presets`
- `GET /api/voice-presets`

---

## 7. TTS Synthesis, Playback Manifest & Subtitles Endpoints (D5)
- `POST /api/dub-jobs/:id/render`
- `GET /api/dub-jobs/:id/playback`
- `GET /api/dub-jobs/:id/subtitles?format=vtt&kind=target`

---

## 8. Billing & Credit Ledger Endpoints (D6)
- `GET /api/billing/plans`
- `POST /api/billing/checkout`
- `GET /api/billing/ledger`
