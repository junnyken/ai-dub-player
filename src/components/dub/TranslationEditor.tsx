"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Edit3,
  Languages,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { GlossaryCategory, TranslationSegmentStatus } from "@/domain/models";
import { formatTimestampMs } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  LoadingSkeletonState,
} from "@/components/states/DataStates";

interface TranslationSegmentDto {
  id: string;
  translationId: string;
  transcriptSegmentId: string;
  segmentIndex: number;
  speakerId: string;
  speakerDisplayName: string;
  externalSpeakerId: string;
  startMs: number;
  endMs: number;
  sourceText: string;
  translatedText: string;
  originalTranslatedText: string;
  status: TranslationSegmentStatus;
  errorCode?: string | null;
  editedBy?: string | null;
  version: number;
}

interface GlossaryEntryDto {
  id?: string;
  category: GlossaryCategory;
  sourceTerm: string;
  targetTerm: string;
  speakerId?: string | null;
  notes?: string | null;
}

interface TranslationPayloadDto {
  jobId: string;
  jobStatus: string;
  translation: {
    id: string;
    targetLanguage: string;
    status: "processing" | "ready" | "failed";
    provider: string;
    model: string;
    promptVersion: string;
  } | null;
  segments: TranslationSegmentDto[];
  glossaryEntries: GlossaryEntryDto[];
}

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  proper_noun: "Tên riêng",
  term: "Thuật ngữ",
  pronoun_rule: "Quy tắc xưng hô",
};

export function TranslationEditor({ jobId }: { jobId: string }) {
  const [data, setData] = useState<TranslationPayloadDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftViText, setDraftViText] = useState("");
  const [isSavingSeg, setIsSavingSeg] = useState(false);
  const [saveSegError, setSaveSegError] = useState<string | null>(null);

  const [glossaryList, setGlossaryList] = useState<GlossaryEntryDto[]>([]);
  const [newCategory, setNewCategory] = useState<GlossaryCategory>("proper_noun");
  const [newSourceTerm, setNewSourceTerm] = useState("");
  const [newTargetTerm, setNewTargetTerm] = useState("");
  const [isRetranslating, setIsRetranslating] = useState(false);

  const fetchTranslation = useCallback(async () => {
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/translation`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || "Không thể tải bản dịch tiếng Việt.");
        setIsLoading(false);
        return;
      }
      setData(json);
      setGlossaryList(json.glossaryEntries ?? []);
      if (json.segments?.length > 0) {
        setActiveSegmentId((prev) => prev ?? json.segments[0].id);
      }
      setErrorMsg(null);
    } catch {
      setErrorMsg("Mất kết nối khi tải dữ liệu bản dịch.");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchTranslation();
  }, [fetchTranslation]);

  const hasTranslationLoaded = Boolean(data?.translation);

  useEffect(() => {
    if (hasTranslationLoaded) return;
    const interval = setInterval(() => {
      fetchTranslation();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchTranslation, hasTranslationLoaded]);

  const handleTriggerTranslate = async (customGlossary?: GlossaryEntryDto[]) => {
    setIsRetranslating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/dub-jobs/${jobId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glossaryEntries: customGlossary ?? glossaryList,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || "Không thể thực hiện dịch ngữ cảnh.");
        return;
      }
      setData(json);
      setGlossaryList(json.glossaryEntries ?? []);
    } catch {
      setErrorMsg("Lỗi kết nối khi gọi dịch vụ dịch ngữ cảnh.");
    } finally {
      setIsRetranslating(false);
    }
  };

  const handleAddGlossaryRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTerm.trim() || !newTargetTerm.trim()) return;
    const next = [
      ...glossaryList,
      {
        category: newCategory,
        sourceTerm: newSourceTerm.trim(),
        targetTerm: newTargetTerm.trim(),
      },
    ];
    setGlossaryList(next);
    setNewSourceTerm("");
    setNewTargetTerm("");
  };

  const handleRemoveGlossaryRule = (idx: number) => {
    setGlossaryList((prev) => prev.filter((_, i) => i !== idx));
  };

  const startEditSegment = (seg: TranslationSegmentDto) => {
    setEditingSegmentId(seg.id);
    setActiveSegmentId(seg.id);
    setDraftViText(seg.translatedText);
    setSaveSegError(null);
  };

  const handleSaveSegment = async (seg: TranslationSegmentDto) => {
    if (!data?.translation) return;
    setIsSavingSeg(true);
    setSaveSegError(null);

    try {
      const res = await fetch(
        `/api/translations/${data.translation.id}/segments/${seg.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translatedText: draftViText,
          }),
        }
      );
      const updated = await res.json();
      if (!res.ok) {
        setSaveSegError(updated.message || "Không thể lưu câu dịch đã sửa.");
        return;
      }
      setEditingSegmentId(null);
      await fetchTranslation();
    } catch {
      setSaveSegError("Mất kết nối khi lưu câu dịch.");
    } finally {
      setIsSavingSeg(false);
    }
  };

  if (isLoading) {
    return (
      <LoadingSkeletonState label="Đang tải bản dịch tiếng Việt và bảng thuật ngữ Glossary..." />
    );
  }

  if (errorMsg) {
    return (
      <ErrorState
        whatHappened="Không thể tải trình biên tập bản dịch"
        whyItHappened={errorMsg}
        nextStep="Hãy kiểm tra lại trạng thái Transcript và bấm thử lại."
        onRetry={fetchTranslation}
      />
    );
  }

  if (!data?.translation || data.segments.length === 0) {
    return (
      <EmptyState
        title="Bản dịch tiếng Việt đang chờ khởi tạo"
        reason="Hệ thống dịch theo cửa sổ ngữ cảnh (Context Window) ngay sau khi Transcript hoàn tất."
        nextAction="Bấm nút bên dưới để chạy dịch ngữ cảnh sang tiếng Việt ngay."
        actionButton={
          <button
            type="button"
            disabled={isRetranslating}
            onClick={() => handleTriggerTranslate()}
            className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
          >
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
            {isRetranslating ? "Đang dịch..." : "Dịch sang tiếng Việt ngay"}
          </button>
        }
      />
    );
  }

  const renderStatusBadge = (status: TranslationSegmentStatus) => {
    if (status === "edited") {
      return (
        <span className="rounded-sm bg-primary/20 px-space-2 py-0.5 text-[11px] font-semibold text-text-primary">
          Đã chỉnh
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="inline-flex items-center gap-space-1 rounded-sm bg-danger/20 px-space-2 py-0.5 text-[11px] font-semibold text-danger">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Lỗi dịch
        </span>
      );
    }
    return (
      <span className="rounded-sm bg-success/15 px-space-2 py-0.5 text-[11px] font-medium text-success">
        Đã dịch
      </span>
    );
  };

  return (
    <section
      aria-labelledby="translation-editor-heading"
      className="rounded-lg border border-surface-2 bg-surface p-space-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-space-3 border-b border-surface-2 pb-space-4">
        <div className="space-y-space-1">
          <div className="flex flex-wrap items-center gap-space-2">
            <h2
              id="translation-editor-heading"
              className="text-lg font-bold text-text-primary"
            >
              Bản dịch ngữ cảnh (Original | Tiếng Việt)
            </h2>
            <span className="rounded-sm bg-surface-2 px-space-2 py-0.5 text-[11px] text-text-secondary">
              {data.translation.model} · {data.translation.promptVersion}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            Dịch theo cửa sổ hội thoại đa nhân vật, giữ nguyên speaker và mốc thời gian.
          </p>
        </div>

        <button
          type="button"
          disabled={isRetranslating}
          onClick={() => handleTriggerTranslate()}
          className="inline-flex items-center gap-space-2 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:border-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRetranslating ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isRetranslating
            ? "Đang dịch lại theo Glossary..."
            : "Áp dụng Glossary & Dịch lại"}
        </button>
      </div>

      <div className="mt-space-6 grid grid-cols-1 gap-space-6 lg:grid-cols-12">
        {/* Two-column Bilingual Translation View (8 cols) */}
        <div className="space-y-space-3 lg:col-span-8">
          <div className="grid grid-cols-2 gap-space-4 rounded-sm bg-surface-2 px-space-4 py-space-2 text-xs font-semibold uppercase text-text-secondary">
            <span>Original (Ngôn ngữ gốc)</span>
            <span>Tiếng Việt (Bản lồng tiếng)</span>
          </div>

          {data.segments.map((seg) => {
            const isHighlighted = activeSegmentId === seg.id;
            const isEditing = editingSegmentId === seg.id;

            return (
              <div
                key={seg.id}
                onClick={() => {
                  if (!isEditing) setActiveSegmentId(seg.id);
                }}
                className={`rounded-md border p-space-4 transition-colors ${
                  isHighlighted
                    ? "border-primary bg-surface-2"
                    : "border-surface-2 bg-surface-2/40 hover:border-text-muted"
                }`}
              >
                <div className="mb-space-2 flex flex-wrap items-center justify-between gap-space-2">
                  <div className="flex items-center gap-space-2">
                    <span className="rounded-sm bg-surface px-space-2 py-0.5 text-xs font-semibold text-text-primary">
                      {seg.speakerDisplayName}
                    </span>
                    <span className="text-xs text-text-muted tabular-nums">
                      {formatTimestampMs(seg.startMs)} –{" "}
                      {formatTimestampMs(seg.endMs)}
                    </span>
                  </div>

                  <div className="flex items-center gap-space-2">
                    {renderStatusBadge(seg.status)}
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditSegment(seg);
                        }}
                        aria-label={`Sửa bản dịch câu số ${seg.segmentIndex + 1}`}
                        className="inline-flex items-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-2 py-1 text-xs font-medium text-text-secondary hover:border-primary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Sửa câu dịch
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-space-4 md:grid-cols-2">
                  {/* Left: Original */}
                  <div className="rounded-sm bg-surface/60 p-space-3 text-sm text-text-secondary">
                    {seg.sourceText}
                  </div>

                  {/* Right: Vietnamese */}
                  <div className="rounded-sm bg-surface p-space-3">
                    {isEditing ? (
                      <div
                        className="space-y-space-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          htmlFor={`vi-input-${seg.id}`}
                          className="sr-only"
                        >
                          Bản dịch tiếng Việt
                        </label>
                        <textarea
                          id={`vi-input-${seg.id}`}
                          rows={3}
                          value={draftViText}
                          onChange={(e) => setDraftViText(e.target.value)}
                          className="w-full rounded-sm border border-surface-2 bg-surface-2 p-space-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        />
                        {saveSegError && (
                          <p role="alert" className="text-xs text-danger">
                            {saveSegError}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-space-2">
                          <button
                            type="button"
                            onClick={() => setEditingSegmentId(null)}
                            className="rounded-sm bg-surface-2 px-space-3 py-1 text-xs text-text-secondary hover:text-text-primary"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            disabled={isSavingSeg}
                            onClick={() => handleSaveSegment(seg)}
                            className="inline-flex items-center gap-space-1 rounded-sm bg-primary px-space-3 py-1 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {isSavingSeg ? "Đang lưu..." : "Lưu bản dịch"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        className={`text-sm ${
                          seg.status === "failed"
                            ? "font-medium text-danger"
                            : "text-text-primary"
                        }`}
                      >
                        {seg.translatedText}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Glossary Panel (4 cols) */}
        <aside
          aria-label="Bảng từ điển và quy tắc xưng hô Glossary"
          className="space-y-space-4 lg:col-span-4"
        >
          <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4">
            <div className="flex items-center gap-space-2 text-xs font-semibold text-text-primary">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Glossary (Tên riêng · Thuật ngữ · Xưng hô)</span>
            </div>
            <p className="mt-space-1 text-xs text-text-secondary">
              Định nghĩa tên riêng, thuật ngữ chuyên ngành hoặc quy tắc đại từ nhân xưng để nhất quán toàn video.
            </p>

            <form
              onSubmit={handleAddGlossaryRule}
              className="mt-space-4 space-y-space-3"
            >
              <div>
                <label
                  htmlFor="glossary-category"
                  className="block text-xs font-medium text-text-secondary"
                >
                  Nhóm quy tắc
                </label>
                <select
                  id="glossary-category"
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as GlossaryCategory)
                  }
                  className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface px-space-2 py-space-1 text-xs font-semibold text-text-primary"
                >
                  <option value="proper_noun">Tên riêng</option>
                  <option value="term">Thuật ngữ chuyên ngành</option>
                  <option value="pronoun_rule">Quy tắc xưng hô</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-space-2">
                <div>
                  <label
                    htmlFor="glossary-source"
                    className="block text-xs font-medium text-text-secondary"
                  >
                    Từ gốc
                  </label>
                  <input
                    id="glossary-source"
                    type="text"
                    value={newSourceTerm}
                    onChange={(e) => setNewSourceTerm(e.target.value)}
                    placeholder="VD: artificial intelligence"
                    className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface px-space-2 py-space-1 text-xs text-text-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="glossary-target"
                    className="block text-xs font-medium text-text-secondary"
                  >
                    Bản dịch chuẩn
                  </label>
                  <input
                    id="glossary-target"
                    type="text"
                    value={newTargetTerm}
                    onChange={(e) => setNewTargetTerm(e.target.value)}
                    placeholder="VD: AI thế hệ mới"
                    className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface px-space-2 py-space-1 text-xs text-text-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-space-1 rounded-sm border border-surface-2 bg-surface px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:border-primary"
              >
                <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Thêm vào Glossary
              </button>
            </form>

            <div className="mt-space-4 space-y-space-2 border-t border-surface pt-space-3">
              {glossaryList.length === 0 ? (
                <p className="text-xs text-text-muted">
                  Chưa có quy tắc Glossary riêng cho video này.
                </p>
              ) : (
                glossaryList.map((rule, idx) => (
                  <div
                    key={`${rule.sourceTerm}-${idx}`}
                    className="flex items-center justify-between rounded-sm bg-surface px-space-3 py-space-2 text-xs"
                  >
                    <div>
                      <span className="block text-[10px] uppercase text-text-muted">
                        {CATEGORY_LABELS[rule.category]}
                      </span>
                      <span className="font-medium text-text-secondary">
                        {rule.sourceTerm}
                      </span>{" "}
                      →{" "}
                      <strong className="text-text-primary">
                        {rule.targetTerm}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGlossaryRule(idx)}
                      aria-label={`Xóa quy tắc ${rule.sourceTerm}`}
                      className="text-text-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
