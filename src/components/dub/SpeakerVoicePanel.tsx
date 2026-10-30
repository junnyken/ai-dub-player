"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  Check,
  Mic2,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingSkeletonState,
} from "@/components/states/DataStates";

interface VoiceDto {
  id: string;
  provider?: string;
  providerVoiceId?: string;
  language: string;
  displayName: string;
  genderPresentation: "female" | "male" | "neutral";
  ageGroup: "child" | "teen" | "young_adult" | "adult" | "senior";
  styleTags: string[];
  previewUrl?: string | null;
}

interface SpeakerWithVoiceDto {
  id: string;
  jobId: string;
  externalSpeakerId: string;
  displayName: string;
  estimatedAgeGroup: string;
  apparentGender: string;
  roleHint: string;
  emotionProfile: string[];
  appearanceCount: number;
  isEstimated: boolean;
  estimatedLabelVi: string;
  voiceAssignment: {
    id: string;
    voiceId: string;
    assignedBy: "ai" | "user";
    matchScore: number;
    matchReason?: string | null;
    voice: VoiceDto;
  } | null;
}

interface VoicePresetDto {
  id: string;
  name: string;
  assignments: Array<{ speakerSignature: string; voiceId: string }>;
  createdAt: string;
}

export function VoicePreviewButton({
  speakerId,
  voiceId,
  label = "Nghe thử",
}: {
  speakerId: string;
  voiceId?: string;
  label?: string;
}) {
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setIsLoadingPreview(true);
    try {
      const res = await fetch(`/api/speakers/${speakerId}/voice-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.previewAudioUrl) {
        return;
      }

      const audioSrc = data.previewAudioUrl?.startsWith("data:audio/mpeg")
        ? data.previewAudioUrl
        : `/api/tts/speak?text=${encodeURIComponent(
            data.sampleText || "Xin chào các bạn"
          )}&voiceId=${encodeURIComponent(data.voiceId || voiceId || "")}`;
      const audio = new Audio(audioSrc);
      const audioWithPitch = audio as HTMLAudioElement & {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      audioWithPitch.preservesPitch = true;
      audioWithPitch.mozPreservesPitch = true;
      audioWithPitch.webkitPreservesPitch = true;
      audio.playbackRate = 1.05;
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      await audio.play();
    } catch {
      setIsPlaying(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePreview}
      disabled={isLoadingPreview}
      aria-label={`${label} giọng lồng tiếng`}
      className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {isPlaying ? (
        <Pause className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      ) : (
        <Play className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      )}
      <span>
        {isLoadingPreview ? "Đang tạo mẫu..." : isPlaying ? "Đang phát" : label}
      </span>
    </button>
  );
}

export function VoicePicker({
  speaker,
  voices,
  onSelectVoice,
  onClose,
}: {
  speaker: SpeakerWithVoiceDto;
  voices: VoiceDto[];
  onSelectVoice: (voiceId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [styleQuery, setStyleQuery] = useState<string>("");
  const [applyingVoiceId, setApplyingVoiceId] = useState<string | null>(null);

  const filteredVoices = voices.filter((v) => {
    if (v.language !== "vi") return false;
    if (genderFilter !== "all" && v.genderPresentation !== genderFilter) {
      return false;
    }
    if (ageFilter !== "all" && v.ageGroup !== ageFilter) {
      return false;
    }
    if (styleQuery.trim()) {
      const q = styleQuery.toLowerCase();
      const matchName = v.displayName.toLowerCase().includes(q);
      const matchTag = v.styleTags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchTag) return false;
    }
    return true;
  });

  const handleApply = async (voiceId: string) => {
    setApplyingVoiceId(voiceId);
    try {
      await onSelectVoice(voiceId);
      onClose();
    } finally {
      setApplyingVoiceId(null);
    }
  };

  return (
    <div className="mt-space-3 rounded-md border border-primary/50 bg-surface p-space-4">
      <div className="flex items-center justify-between border-b border-surface-2 pb-space-2">
        <div className="flex items-center gap-space-2">
          <SlidersHorizontal
            className="h-4 w-4 text-primary"
            aria-hidden="true"
          />
          <span className="text-xs font-bold text-text-primary">
            Chọn giọng tiếng Việt cho {speaker.displayName}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          Đóng
        </button>
      </div>

      {/* Filters */}
      <div className="mt-space-3 grid grid-cols-1 gap-space-2 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`filter-gender-${speaker.id}`}
            className="block text-[11px] text-text-muted"
          >
            Giới tính biểu hiện
          </label>
          <select
            id={`filter-gender-${speaker.id}`}
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="mt-0.5 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-2 py-1 text-xs text-text-primary"
          >
            <option value="all">Tất cả</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="neutral">Trung tính</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`filter-age-${speaker.id}`}
            className="block text-[11px] text-text-muted"
          >
            Độ tuổi
          </label>
          <select
            id={`filter-age-${speaker.id}`}
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
            className="mt-0.5 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-2 py-1 text-xs text-text-primary"
          >
            <option value="all">Tất cả độ tuổi</option>
            <option value="young_adult">Trẻ (Young Adult)</option>
            <option value="adult">Trưởng thành (Adult)</option>
            <option value="senior">Cao niên (Senior)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`filter-style-${speaker.id}`}
            className="block text-[11px] text-text-muted"
          >
            Phong cách
          </label>
          <input
            id={`filter-style-${speaker.id}`}
            type="text"
            value={styleQuery}
            onChange={(e) => setStyleQuery(e.target.value)}
            placeholder="VD: trầm, tự tin, gần gũi..."
            className="mt-0.5 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-2 py-1 text-xs text-text-primary"
          />
        </div>
      </div>

      {/* Voice list */}
      <div className="mt-space-3 space-y-space-2">
        {filteredVoices.length === 0 ? (
          <p className="py-space-2 text-xs text-text-muted">
            Không có giọng đọc tiếng Việt nào khớp bộ lọc hiện tại.
          </p>
        ) : (
          filteredVoices.map((v) => {
            const isCurrent = speaker.voiceAssignment?.voiceId === v.id;
            return (
              <div
                key={v.id}
                className={`flex flex-wrap items-center justify-between gap-space-2 rounded-sm border p-space-3 ${
                  isCurrent
                    ? "border-primary bg-surface-2"
                    : "border-surface-2 bg-surface-2/50"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-space-2">
                    <span className="text-xs font-semibold text-text-primary">
                      {v.displayName}
                    </span>
                    <span className="rounded-sm bg-surface px-space-2 py-0.5 text-[10px] uppercase text-text-secondary">
                      {v.language}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-space-1">
                    {v.styleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-sm bg-surface px-1.5 py-0.5 text-[10px] text-text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-space-2">
                  <VoicePreviewButton
                    speakerId={speaker.id}
                    voiceId={v.id}
                    label="Nghe thử"
                  />
                  <button
                    type="button"
                    disabled={applyingVoiceId === v.id}
                    onClick={() => handleApply(v.id)}
                    className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {isCurrent
                      ? "Đang dùng"
                      : applyingVoiceId === v.id
                      ? "Đang áp dụng..."
                      : "Chọn giọng này"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function SpeakerVoicePanel({ jobId }: { jobId: string }) {
  const [speakers, setSpeakers] = useState<SpeakerWithVoiceDto[]>([]);
  const [voices, setVoices] = useState<VoiceDto[]>([]);
  const [presets, setPresets] = useState<VoicePresetDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [openPickerSpeakerId, setOpenPickerSpeakerId] = useState<string | null>(
    null
  );
  const [presetName, setPresetName] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetToast, setPresetToast] = useState<string | null>(null);

  const loadCastingData = useCallback(async () => {
    try {
      const [spkRes, voicesRes, presetsRes] = await Promise.all([
        fetch(`/api/dub-jobs/${jobId}/speakers`, { cache: "no-store" }),
        fetch(`/api/voices?language=vi`, { cache: "no-store" }),
        fetch(`/api/voice-presets`, { cache: "no-store" }),
      ]);

      if (!spkRes.ok) {
        const errData = await spkRes.json();
        setErrorMsg(
          errData.message || "Không thể tải danh sách nhân vật & giọng nói."
        );
        setIsLoading(false);
        return;
      }

      const spkData = await spkRes.json();
      setSpeakers(spkData.speakers ?? []);

      if (voicesRes.ok) {
        const vData = await voicesRes.json();
        setVoices(vData.voices ?? []);
      }

      if (presetsRes.ok) {
        const pData = await presetsRes.json();
        setPresets(pData.presets ?? []);
      }

      setErrorMsg(null);
    } catch {
      setErrorMsg("Mất kết nối khi tải dữ liệu AI Casting.");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadCastingData();
  }, [loadCastingData]);

  const isCastingReady =
    speakers.length > 0 && speakers.every((s) => s.voiceAssignment !== null);

  useEffect(() => {
    if (isCastingReady) return;
    const interval = setInterval(() => {
      loadCastingData();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadCastingData, isCastingReady]);

  const handleAssignVoice = async (speakerId: string, voiceId: string) => {
    const res = await fetch(`/api/speakers/${speakerId}/voice`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId }),
    });
    if (res.ok) {
      await loadCastingData();
    }
  };

  const handleCloneSpeakerVoice = async (speakerId: string) => {
    setPresetToast(null);
    const res = await fetch(`/api/speakers/${speakerId}/clone-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setPresetToast("Đã nhân bản giọng gốc nhân vật (Zero-Shot F5-TTS-Vi).");
      await loadCastingData();
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPreset(true);
    setPresetToast(null);

    try {
      const nameToSave =
        presetName.trim() || `Preset Video (${new Date().toLocaleDateString("vi-VN")})`;
      const res = await fetch(`/api/voice-presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameToSave,
          jobId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPresetName("");
        setPresetToast(`Đã lưu preset "${data.name}" thành công.`);
        await loadCastingData();
      } else {
        setPresetToast(data.message || "Không thể lưu preset giọng nói.");
      }
    } catch {
      setPresetToast("Lỗi kết nối khi lưu preset.");
    } finally {
      setIsSavingPreset(false);
    }
  };

  if (isLoading) {
    return (
      <LoadingSkeletonState label="Đang tải bảng phân vai Nhân vật & Giọng nói..." />
    );
  }

  if (errorMsg) {
    return (
      <ErrorState
        whatHappened="Không thể tải bảng Nhân vật & Giọng nói"
        whyItHappened={errorMsg}
        nextStep="Hãy bấm thử lại để nạp danh sách giọng đọc theo nhân vật."
        onRetry={loadCastingData}
      />
    );
  }

  if (speakers.length === 0) {
    return (
      <EmptyState
        title="Đang chờ phân tích nhân vật"
        reason="Hệ thống sẽ tự động phân tích độ tuổi ước lượng, giới tính biểu hiện và vai trò của từng người nói sau khi có Transcript."
        nextAction="Bảng Nhân vật & Giọng nói sẽ hiển thị ngay khi bước nhận diện hoàn tất."
      />
    );
  }

  return (
    <section
      aria-labelledby="speaker-voice-heading"
      className="rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <div className="flex items-center gap-space-2">
            <Mic2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2
              id="speaker-voice-heading"
              className="text-lg font-bold text-text-primary"
            >
              Nhân vật & giọng nói
            </h2>
          </div>
          <p className="text-xs text-text-secondary">
            AI tự động đề xuất giọng đọc phù hợp với từng nhân vật. Đổi giọng bất kỳ nhân vật nào mà không cần render lại toàn bộ video.
          </p>
        </div>

        <span className="inline-flex items-center gap-space-1 rounded-sm bg-surface-2 px-space-3 py-space-1 text-xs font-medium text-text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          AI Casting theo nhân vật
        </span>
      </div>

      <div className="mt-space-6 space-y-space-4">
        {speakers.map((spk, idx) => {
          const isPickerOpen = openPickerSpeakerId === spk.id;
          const assignedVoice = spk.voiceAssignment?.voice;
          const assignedBy = spk.voiceAssignment?.assignedBy;

          return (
            <div
              key={spk.id}
              className="rounded-md border border-surface-2 bg-surface-2/60 p-space-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-space-3">
                <div className="flex items-center gap-space-3">
                  {/* Avatar Initial */}
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/20 text-sm font-bold text-text-primary"
                  >
                    S{idx + 1}
                  </div>

                  <div className="space-y-space-1">
                    <div className="flex flex-wrap items-center gap-space-2">
                      <span className="text-sm font-bold text-text-primary">
                        {spk.displayName}
                      </span>
                      <span className="text-xs text-text-secondary">·</span>
                      <span className="rounded-sm bg-surface px-space-2 py-0.5 text-xs font-medium text-text-secondary">
                        {spk.estimatedLabelVi}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums">
                        ({spk.appearanceCount} câu thoại)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-space-2 text-xs">
                      <span className="text-text-secondary">
                        Giọng hiện tại:{" "}
                        <strong className="text-text-primary">
                          {assignedVoice
                            ? assignedVoice.displayName
                            : "Đang chọn giọng..."}
                        </strong>
                      </span>
                      {assignedBy && (
                        <span className="rounded-sm bg-surface px-space-2 py-0.5 text-[11px] text-text-muted">
                          {assignedBy === "user"
                            ? "Người dùng chọn"
                            : "Đề xuất AI"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-space-2">
                  <VoicePreviewButton
                    speakerId={spk.id}
                    voiceId={assignedVoice?.id}
                    label="Nghe thử"
                  />
                  <button
                    type="button"
                    onClick={() => handleCloneSpeakerVoice(spk.id)}
                    className="inline-flex items-center gap-space-1 rounded-sm border border-primary/50 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    Nhân bản giọng gốc (Zero-Shot)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenPickerSpeakerId(isPickerOpen ? null : spk.id)
                    }
                    className="rounded-sm border border-surface-2 bg-surface px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {isPickerOpen ? "Đóng danh sách" : "Đổi giọng"}
                  </button>
                </div>
              </div>

              {isPickerOpen && (
                <VoicePicker
                  speaker={spk}
                  voices={voices}
                  onSelectVoice={(voiceId) =>
                    handleAssignVoice(spk.id, voiceId)
                  }
                  onClose={() => setOpenPickerSpeakerId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Save Preset Bar */}
      <form
        onSubmit={handleSavePreset}
        className="mt-space-6 flex flex-col justify-between gap-space-3 border-t border-surface-2 pt-space-4 sm:flex-row sm:items-center"
      >
        <div className="flex flex-1 items-center gap-space-2">
          <label htmlFor="preset-name-input" className="sr-only">
            Tên preset giọng nói
          </label>
          <input
            id="preset-name-input"
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Đặt tên preset (ví dụ: Phỏng vấn công nghệ 2 người)..."
            className="w-full max-w-sm rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
          {presets.length > 0 && (
            <span className="text-xs text-text-muted tabular-nums">
              Đã lưu {presets.length} preset
            </span>
          )}
        </div>

        <div className="flex items-center gap-space-3">
          {presetToast && (
            <span role="status" className="text-xs text-success">
              {presetToast}
            </span>
          )}
          <button
            type="submit"
            disabled={isSavingPreset}
            className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-4 py-space-2 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
            {isSavingPreset
              ? "Đang lưu..."
              : "Lưu preset cho video này"}
          </button>
        </div>
      </form>
    </section>
  );
}
