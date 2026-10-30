"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Cpu,
  Film,
  KeyRound,
  Mic2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { CurrentUserDto, TopNavBar } from "@/components/header/TopNavBar";
import { RuntimeSystemParameters } from "@/server/providers/live-ai-bridge";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "business";
  creditBalance: number;
  jobCount: number;
  ledgerCount: number;
  recentLedger: Array<{
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
  }>;
  createdAt: string;
}

interface AdminJobRow {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl?: string | null;
  status: string;
  progress: number;
  durationSeconds: number;
  genre?: string | null;
  segmentCount: number;
  speakerCount: number;
  user: {
    id: string;
    email: string;
    name: string;
    plan: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface AdminVoiceRow {
  id: string;
  name: string;
  locale: string;
  genderPresentation: string;
  ageGroup: string;
  basePitchHz: number;
  speakingRate: number;
  isActive: boolean;
  styleTags: string[];
}

interface AdminDashboardData {
  stats: {
    totalUsers: number;
    totalJobs: number;
    totalSegments: number;
    totalSpeakers: number;
    totalVoices: number;
    activeVoices: number;
    activeTranslationEngine: string;
    activeTtsEngine: string;
  };
  aiKeys: {
    configured: {
      deepseek: boolean;
      groq: boolean;
      gemini: boolean;
      openai: boolean;
      elevenlabs: boolean;
      fpt?: boolean;
      hf: boolean;
    };
    masked: {
      deepSeekApiKey: string;
      groqApiKey: string;
      geminiApiKey: string;
      openAiApiKey: string;
      elevenLabsApiKey: string;
      fptAiApiKey?: string;
      hfApiToken: string;
    };
  };
  systemParams: RuntimeSystemParameters;
  users: AdminUserRow[];
  jobs: AdminJobRow[];
  voices: AdminVoiceRow[];
}

type AdminTab = "keys" | "params" | "users" | "jobs_voices";

export default function AdminDashboardPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUserDto | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("keys");

  // Keys state
  const [deepSeekKey, setDeepSeekKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [fptAiKey, setFptAiKey] = useState("");
  const [hfToken, setHfToken] = useState("");

  // System Parameters state
  const [paramsForm, setParamsForm] = useState<RuntimeSystemParameters>({
    preferredTranslationProvider: "auto",
    preferredTtsProvider: "auto",
    preferredAsrModel: "whisper_v3_turbo_deep",
    defaultMaxSyllablesPerSecond: 4.2,
    ttsDefaultSpeedMultiplier: 1.05,
    ttsDefaultPitchBonusHz: 0,
    ttsParallelBatchSize: 4,
    maxSegmentsPerJob: 120,
    autoSkipSilenceDefault: true,
    freePlanDefaultCredits: 15,
    proPlanDefaultCredits: 300,
    businessPlanDefaultCredits: 1200,
  });

  // Create user state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("123456");
  const [newUserPlan, setNewUserPlan] = useState<"free" | "pro" | "business">(
    "pro"
  );
  const [newUserCredits, setNewUserCredits] = useState(300);

  // Per-user edit state
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { plan: "free" | "pro" | "business"; creditBalance: number; name: string }>
  >({});

  // Action feedback & diagnostics
  const [isSaving, setIsSaving] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    translationOk: boolean;
    translationLatencyMs: number;
    translationSampleVi: string;
    activeTranslationEngine: string;
    ttsOk: boolean;
    ttsLatencyMs: number;
    ttsBytes: number;
    activeTtsEngine: string;
    ttsAudioDataUri?: string;
    ttsWarning?: string | null;
  } | null>(null);

  const loadCurrentUser = useCallback(async () => {
    setIsLoadingUser(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const u = await res.json();
        setCurrentUser(u);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  const loadAdminDashboard = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch("/api/admin", { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as AdminDashboardData;
        setData(payload);
        setParamsForm(payload.systemParams);

        const drafts: Record<
          string,
          { plan: "free" | "pro" | "business"; creditBalance: number; name: string }
        > = {};
        for (const u of payload.users) {
          drafts[u.id] = {
            plan: u.plan,
            creditBalance: u.creditBalance,
            name: u.name,
          };
        }
        setUserDrafts(drafts);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
    loadAdminDashboard();
  }, [loadCurrentUser, loadAdminDashboard]);

  const handleSaveKeysAndParams = async (runDiagnostics = true) => {
    setIsSaving(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_keys_and_params",
          runDiagnostics,
          keys: {
            deepSeekApiKey: deepSeekKey.trim() || undefined,
            groqApiKey: groqKey.trim() || undefined,
            geminiApiKey: geminiKey.trim() || undefined,
            openAiApiKey: openAiKey.trim() || undefined,
            elevenLabsApiKey: elevenLabsKey.trim() || undefined,
            fptAiApiKey: fptAiKey.trim() || undefined,
            hfApiToken: hfToken.trim() || undefined,
          },
          systemParams: paramsForm,
        }),
      });
      const out = await res.json();
      if (res.ok) {
        setFeedbackBanner({
          type: "success",
          text: out.message || "Đã lưu cấu hình thành công!",
        });
        if (out.diagnostics) {
          setDiagnostics(out.diagnostics);
        }
        setDeepSeekKey("");
        setGroqKey("");
        setGeminiKey("");
        setOpenAiKey("");
        setElevenLabsKey("");
        setFptAiKey("");
        setHfToken("");
        await loadAdminDashboard();
      } else {
        setFeedbackBanner({
          type: "error",
          text: out.message || "Lỗi khi lưu cấu hình.",
        });
      }
    } catch {
      setFeedbackBanner({
        type: "error",
        text: "Không thể kết nối máy chủ Admin.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearKey = async (keyField: string, label: string) => {
    setIsSaving(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_key",
          keyField,
        }),
      });
      const out = await res.json();
      if (res.ok) {
        setFeedbackBanner({
          type: "success",
          text: `Đã xóa ${label} khỏi hệ thống.`,
        });
        await loadAdminDashboard();
      } else {
        setFeedbackBanner({
          type: "error",
          text: out.message || "Không thể xóa Key.",
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateUser = async (userId: string) => {
    const draft = userDrafts[userId];
    if (!draft) return;
    setIsSaving(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_user",
          userId,
          plan: draft.plan,
          creditBalance: draft.creditBalance,
          name: draft.name,
        }),
      });
      const out = await res.json();
      if (res.ok) {
        setFeedbackBanner({
          type: "success",
          text: out.message,
        });
        await loadAdminDashboard();
        await loadCurrentUser();
      } else {
        setFeedbackBanner({
          type: "error",
          text: out.message || "Không thể cập nhật người dùng.",
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_user",
          email: newUserEmail,
          name: newUserName,
          password: newUserPassword,
          plan: newUserPlan,
          creditBalance: newUserCredits,
        }),
      });
      const out = await res.json();
      if (res.ok) {
        setFeedbackBanner({
          type: "success",
          text: out.message,
        });
        setNewUserEmail("");
        setNewUserName("");
        await loadAdminDashboard();
      } else {
        setFeedbackBanner({
          type: "error",
          text: out.message || "Không thể tạo tài khoản.",
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleJobAction = async (
    jobId: string,
    action: "retranslate_job" | "rescan_job" | "delete_job"
  ) => {
    setBusyJobId(jobId);
    setFeedbackBanner(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          jobId,
        }),
      });
      const out = await res.json();
      if (res.ok) {
        setFeedbackBanner({
          type: "success",
          text: out.message,
        });
        await loadAdminDashboard();
      } else {
        setFeedbackBanner({
          type: "error",
          text: out.message || "Lỗi khi xử lý tiến trình video.",
        });
      }
    } finally {
      setBusyJobId(null);
    }
  };

  const handleToggleVoice = async (voice: AdminVoiceRow) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_voice",
          voiceId: voice.id,
          isActive: !voice.isActive,
        }),
      });
      if (res.ok) {
        await loadAdminDashboard();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text-primary">
      <TopNavBar
        user={currentUser}
        isLoadingUser={isLoadingUser}
        onUserUpdated={loadCurrentUser}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-space-4 py-space-6 space-y-space-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-space-4 rounded-lg border border-surface-2 bg-surface p-space-5">
          <div className="space-y-space-1">
            <div className="flex items-center gap-space-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-text-primary">
                Trung Tâm Quản Trị Hệ Thống (Admin Control Center)
              </h1>
            </div>
            <p className="text-xs text-text-secondary">
              Quản lý tập trung API Keys bên thứ 3 (DeepSeek, Groq, Gemini, OpenAI, ElevenLabs), thông số kỹ thuật lồng tiếng, tài khoản người dùng & số dư Credit.
            </p>
          </div>

          <div className="flex items-center gap-space-2">
            <button
              type="button"
              onClick={loadAdminDashboard}
              disabled={isLoadingData}
              className="inline-flex items-center gap-space-1.5 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-xs font-semibold text-text-secondary hover:text-text-primary"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingData ? "animate-spin" : ""}`}
              />
              <span>Làm mới dữ liệu</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-space-1.5 rounded-sm bg-primary px-space-3 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Về Phòng Thu (Studio)</span>
            </Link>
          </div>
        </div>

        {/* Top Stats Cards */}
        {data && (
          <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-surface-2 bg-surface p-space-4">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Người dùng & Tài khoản</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-space-2 text-2xl font-bold tabular-nums">
                {data.stats.totalUsers}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                Quản lý gói Free / Pro / Business & Credit
              </p>
            </div>

            <div className="rounded-md border border-surface-2 bg-surface p-space-4">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Video & Phân đoạn thoại</span>
                <Film className="h-4 w-4 text-success" />
              </div>
              <p className="mt-space-2 text-2xl font-bold tabular-nums">
                {data.stats.totalJobs} video · {data.stats.totalSegments} câu
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                {data.stats.totalSpeakers} nhân vật đã phân vai giọng đọc
              </p>
            </div>

            <div className="rounded-md border border-surface-2 bg-surface p-space-4">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Engine Dịch Thuật Đang Chạy</span>
                <Cpu className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-space-2 text-xs font-bold text-success leading-snug">
                {data.stats.activeTranslationEngine}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                Ưu tiên: {data.systemParams.preferredTranslationProvider.toUpperCase()}
              </p>
            </div>

            <div className="rounded-md border border-surface-2 bg-surface p-space-4">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Kho Giọng Đọc Neural 24kHz</span>
                <Mic2 className="h-4 w-4 text-warning" />
              </div>
              <p className="mt-space-2 text-2xl font-bold tabular-nums">
                {data.stats.activeVoices}/{data.stats.totalVoices} giọng
              </p>
              <p className="mt-1 text-[11px] text-text-muted truncate">
                Tốc độ mặc định: {data.systemParams.ttsDefaultSpeedMultiplier}x · +{data.systemParams.ttsDefaultPitchBonusHz}Hz
              </p>
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {feedbackBanner && (
          <div
            className={`flex items-center justify-between rounded-md border px-space-4 py-space-3 text-xs font-medium ${
              feedbackBanner.type === "success"
                ? "border-success/40 bg-success/10 text-success"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <div className="flex items-center gap-space-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedbackBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-space-2 border-b border-surface-2 pb-space-3">
          <button
            type="button"
            onClick={() => setActiveTab("keys")}
            className={`inline-flex items-center gap-space-2 rounded-sm px-space-4 py-space-2 text-xs font-semibold transition-colors ${
              activeTab === "keys"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>1. Quản lý API Keys & Kết nối AI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("params")}
            className={`inline-flex items-center gap-space-2 rounded-sm px-space-4 py-space-2 text-xs font-semibold transition-colors ${
              activeTab === "params"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>2. Thông số Lồng tiếng & Hệ thống</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`inline-flex items-center gap-space-2 rounded-sm px-space-4 py-space-2 text-xs font-semibold transition-colors ${
              activeTab === "users"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>3. Quản lý Người dùng & Credit ({data?.users.length ?? 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("jobs_voices")}
            className={`inline-flex items-center gap-space-2 rounded-sm px-space-4 py-space-2 text-xs font-semibold transition-colors ${
              activeTab === "jobs_voices"
                ? "bg-primary text-text-primary"
                : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>4. Tiến trình Video & Kho Giọng Đọc</span>
          </button>
        </div>

        {/* TAB 1: API KEYS & DIAGNOSTICS */}
        {activeTab === "keys" && data && (
          <div className="space-y-space-6 rounded-lg border border-surface-2 bg-surface p-space-6">
            <div className="flex flex-wrap items-center justify-between gap-space-2 border-b border-surface-2 pb-space-4">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  Quản lý Khóa API Bên Thứ 3 (3rd-Party AI Keys)
                </h2>
                <p className="text-xs text-text-secondary">
                  Các khóa được lưu bền vững vào tệp cấu hình máy chủ (<code>.ai-studio-keys.json</code>) và áp dụng tức thì cho mọi video mà không cần khởi động lại server.
                </p>
              </div>
              <span className="rounded-sm bg-success/15 px-space-2.5 py-1 text-xs font-semibold text-success">
                Lưu trữ bền vững (.ai-studio-keys.json)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-space-4 md:grid-cols-2">
              {/* DeepSeek API Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    DeepSeek API Key (DeepSeek-V3 / DeepSeek-Chat)
                  </span>
                  {data.aiKeys.configured.deepseek ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.deepSeekApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Chưa cấu hình
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Hỗ trợ key trực tiếp từ <code>platform.deepseek.com</code> (<code>sk-...</code>) hoặc qua OpenRouter (<code>sk-or-...</code>). Dịch hội thoại phim cực kỳ tự nhiên, chi phí siêu rẻ (~$0.028/1M token).
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={deepSeekKey}
                    onChange={(e) => setDeepSeekKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.deepseek
                        ? `Đang dùng ${data.aiKeys.masked.deepSeekApiKey} (Nhập mới để ghi đè)`
                        : "Nhập sk-... (DeepSeek hoặc OpenRouter)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.deepseek && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("deepSeekApiKey", "DeepSeek API Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Groq Cloud API Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    Groq Cloud API Key (Whisper-v3-Turbo + Llama-3.3-70B)
                  </span>
                  {data.aiKeys.configured.groq ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.groqApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Chưa cấu hình
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Key miễn phí từ <code>console.groq.com</code> (<code>gsk_...</code>). Tốc độ dịch ~500ms, hạn mức 500,000 token/ngày miễn phí.
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.groq
                        ? `Đang dùng ${data.aiKeys.masked.groqApiKey} (Nhập mới để ghi đè)`
                        : "Nhập gsk_... (console.groq.com)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.groq && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("groqApiKey", "Groq API Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Google Gemini API Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    Google Gemini API Key (Gemini 2.0 Flash)
                  </span>
                  {data.aiKeys.configured.gemini ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.geminiApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Chưa cấu hình
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Key từ <code>aistudio.google.com</code> (<code>AIza...</code>). Hỗ trợ ngữ cảnh lớn và dịch đa phương thức.
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.gemini
                        ? `Đang dùng ${data.aiKeys.masked.geminiApiKey} (Nhập mới để ghi đè)`
                        : "Nhập AIza... (aistudio.google.com)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.gemini && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("geminiApiKey", "Gemini API Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* OpenAI API Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    OpenAI API Key (GPT-4o-mini + Whisper-1)
                  </span>
                  {data.aiKeys.configured.openai ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.openAiApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Chưa cấu hình
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Key từ <code>platform.openai.com</code> (<code>sk-proj-...</code>). Dự phòng cao cấp cho dịch thuật và nhận diện giọng nói.
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.openai
                        ? `Đang dùng ${data.aiKeys.masked.openAiApiKey} (Nhập mới để ghi đè)`
                        : "Nhập sk-proj-..."
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.openai && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("openAiApiKey", "OpenAI API Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ElevenLabs API Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    ElevenLabs API Key (Multilingual v2 Voice)
                  </span>
                  {data.aiKeys.configured.elevenlabs ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.elevenLabsApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Đang dùng Edge Neural 24kHz (0đ)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Tùy chọn nếu muốn dùng giọng clone ElevenLabs thay cho giọng Microsoft Edge Neural HoaiMy/NamMinh 24kHz miễn phí.
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={elevenLabsKey}
                    onChange={(e) => setElevenLabsKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.elevenlabs
                        ? `Đang dùng ${data.aiKeys.masked.elevenLabsApiKey}`
                        : "Nhập xi-api-key (Tùy chọn)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.elevenlabs && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("elevenLabsApiKey", "ElevenLabs API Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* FPT.AI Vietnamese Broadcast TTS Key */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    FPT.AI Vietnamese TTS Key (Giọng Ban Mai / Lê Minh / Ngọc Lam)
                  </span>
                  {data.aiKeys.configured.fpt ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.fptAiApiKey}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Tùy chọn (console.fpt.ai)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Giọng đọc AI chuyên biệt cho tiếng Việt 3 miền Bắc - Trung - Nam từ <code>console.fpt.ai</code> (Miễn phí 100,000 ký tự/tháng).
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={fptAiKey}
                    onChange={(e) => setFptAiKey(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.fpt
                        ? `Đang dùng ${data.aiKeys.masked.fptAiApiKey}`
                        : "Nhập FPT.AI API Key (Tùy chọn)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.fpt && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("fptAiApiKey", "FPT.AI TTS Key")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* HuggingFace Token */}
              <div className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary">
                    Hugging Face API Token (Whisper Inference)
                  </span>
                  {data.aiKeys.configured.hf ? (
                    <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Đã kết nối: {data.aiKeys.masked.hfApiToken}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                      Tùy chọn
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">
                  Token <code>hf_...</code> từ Hugging Face dùng làm dự phòng cho Whisper ASR.
                </p>
                <div className="flex gap-space-2">
                  <input
                    type="password"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    placeholder={
                      data.aiKeys.configured.hf
                        ? `Đang dùng ${data.aiKeys.masked.hfApiToken}`
                        : "Nhập hf_... (Tùy chọn)"
                    }
                    className="flex-1 rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                  />
                  {data.aiKeys.configured.hf && (
                    <button
                      type="button"
                      onClick={() =>
                        handleClearKey("hfApiToken", "HuggingFace Token")
                      }
                      className="rounded-sm border border-danger/40 bg-danger/10 px-space-2.5 py-space-1.5 text-xs text-danger hover:bg-danger/20"
                      title="Xóa Key này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-space-3 pt-space-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveKeysAndParams(true)}
                className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-5 py-space-2.5 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {isSaving
                    ? "Đang lưu & kiểm tra kết nối..."
                    : "Lưu API Keys & Test Kết Nối Trực Tiếp"}
                </span>
              </button>

              <p className="text-xs text-text-muted">
                Thứ tự ưu tiên tự động: <strong>DeepSeek V3</strong> → <strong>Groq Llama-3.3-70B</strong> → <strong>OpenAI GPT-4o-mini</strong> → <strong>Gemini 2.0 Flash</strong> → <strong>Google GTX Free</strong>.
              </p>
            </div>

            {diagnostics && (
              <div className="rounded-md border border-success/40 bg-success/10 p-space-4 space-y-space-2 text-xs">
                <div className="flex items-center gap-space-2 font-bold text-success">
                  <Activity className="h-4 w-4" />
                  <span>Kết quả Chẩn đoán & Đo độ trễ Thời gian thực:</span>
                </div>
                <div className="grid grid-cols-1 gap-space-2 sm:grid-cols-2">
                  <div className="rounded-sm bg-bg/60 p-space-2.5">
                    <p className="font-semibold text-text-primary">
                      ✓ Dịch thuật ({diagnostics.activeTranslationEngine}):{" "}
                      <span className="text-success">
                        {diagnostics.translationLatencyMs}ms
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Mẫu dịch kiểm thử: “{diagnostics.translationSampleVi}”
                    </p>
                  </div>
                  <div className="rounded-sm bg-bg/60 p-space-2.5">
                    <p className="font-semibold text-text-primary">
                      ✓ Giọng đọc ({diagnostics.activeTtsEngine}):{" "}
                      <span className="text-success">
                        {diagnostics.ttsLatencyMs}ms ({diagnostics.ttsBytes} bytes MP3)
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Chuẩn âm thanh: 24kHz 48kbps Mono Neural Prosody
                    </p>
                    {diagnostics.ttsAudioDataUri && (
                      <audio
                        controls
                        src={diagnostics.ttsAudioDataUri}
                        className="mt-2 h-8 w-full"
                      />
                    )}
                    {diagnostics.ttsWarning && (
                      <p className="mt-2 rounded border border-warning/50 bg-warning/10 p-2 text-[11px] font-semibold text-warning">
                        ⚠️ Lưu ý ElevenLabs: {diagnostics.ttsWarning}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SYSTEM & DUBBING PARAMETERS */}
        {activeTab === "params" && (
          <div className="space-y-space-6 rounded-lg border border-surface-2 bg-surface p-space-6">
            <div className="border-b border-surface-2 pb-space-4">
              <h2 className="text-base font-bold text-text-primary">
                Thông số Lồng tiếng & Cấu hình Hệ thống (Runtime Engine Parameters)
              </h2>
              <p className="text-xs text-text-secondary">
                Tinh chỉnh tốc độ đọc mặc định, độ cao giọng (Pitch Hz), nhịp độ âm tiết/giây để khớp khẩu hình và hạn mức Credit mặc định cho từng gói người dùng.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-space-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Preferred Translation Provider */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Mô hình Dịch thuật Ưu tiên
                </span>
                <select
                  value={paramsForm.preferredTranslationProvider}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      preferredTranslationProvider: e.target
                        .value as RuntimeSystemParameters["preferredTranslationProvider"],
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                >
                  <option value="auto">
                    Tự động tối ưu (DeepSeek → Groq → Gemini → OpenAI → GTX)
                  </option>
                  <option value="deepseek">Ưu tiên DeepSeek-V3 (Cost-effective)</option>
                  <option value="groq">Ưu tiên Groq Llama-3.3-70B (Siêu tốc)</option>
                  <option value="gemini">Ưu tiên Google Gemini 2.0 Flash</option>
                  <option value="openai">Ưu tiên OpenAI GPT-4o-mini</option>
                  <option value="gtx_free">Chỉ dùng Google Cloud GTX Miễn phí</option>
                </select>
                <span className="block text-[11px] text-text-muted">
                  Quyết định model nào được gọi đầu tiên khi dịch kịch bản.
                </span>
              </label>

              {/* Preferred TTS Provider */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Bộ Máy Tổng Hợp Giọng Đọc (TTS Engine Priority)
                </span>
                <select
                  value={paramsForm.preferredTtsProvider || "auto"}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      preferredTtsProvider: e.target
                        .value as RuntimeSystemParameters["preferredTtsProvider"],
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                >
                  <option value="auto">
                    Tự động (ElevenLabs → FPT.AI → Edge Neural Pure 0Hz)
                  </option>
                  <option value="edge_neural">
                    Microsoft Edge Neural Pure 24kHz (HoaiMy / NamMinh · 0đ)
                  </option>
                  <option value="fpt_ai">
                    FPT.AI Studio Tiếng Việt (Ban Mai / Lê Minh)
                  </option>
                  <option value="elevenlabs">
                    ElevenLabs Flash v2.5 / Multilingual v2
                  </option>
                  <option value="openai_tts">
                    OpenAI Audio Speech (gpt-4o-mini-tts · Nova / Onyx)
                  </option>
                </select>
                <span className="block text-[11px] text-text-muted">
                  Chế độ Pure 0Hz loại bỏ hoàn toàn hiện tượng méo tiếng cao độ.
                </span>
              </label>

              {/* Preferred ASR Model */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Chế độ Thu âm & Bóc băng (ASR Mode)
                </span>
                <select
                  value={paramsForm.preferredAsrModel}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      preferredAsrModel: e.target
                        .value as RuntimeSystemParameters["preferredAsrModel"],
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                >
                  <option value="whisper_v3_turbo_deep">
                    Whisper-v3-Turbo + Deep Acoustic Overlap Recovery (Khuyên dùng)
                  </option>
                  <option value="gemini_2_audio_omni">
                    Gemini 2.0 Multimodal Audio Analysis
                  </option>
                  <option value="youtube_timedtext">
                    YouTube InnerTube TimedText Tiêu chuẩn
                  </option>
                </select>
                <span className="block text-[11px] text-text-muted">
                  Chế độ Deep Acoustic khôi phục cả câu thoại bị lấp bởi [Music].
                </span>
              </label>

              {/* Max Syllables Per Second */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Mật độ Âm tiết Tối đa / Giây (Khớp khẩu hình)
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="2.5"
                  max="6.5"
                  value={paramsForm.defaultMaxSyllablesPerSecond}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      defaultMaxSyllablesPerSecond: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Chuẩn lồng tiếng Việt tự nhiên: <code>4.0 - 4.5</code> âm tiết/giây.
                </span>
              </label>

              {/* Default TTS Speed Multiplier */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Tốc độ Giọng đọc Neural Mặc định (Speed Multiplier)
                </span>
                <input
                  type="number"
                  step="0.05"
                  min="0.8"
                  max="1.6"
                  value={paramsForm.ttsDefaultSpeedMultiplier}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      ttsDefaultSpeedMultiplier: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Mặc định <code>1.15</code> (+15%) giúp bắt kịp thoại phim hành động/hoạt hình.
                </span>
              </label>

              {/* Default Pitch Bonus Hz */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Độ sáng & Cảm xúc Giọng (Pitch Bonus Hz)
                </span>
                <input
                  type="number"
                  step="1"
                  min="-20"
                  max="40"
                  value={paramsForm.ttsDefaultPitchBonusHz}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      ttsDefaultPitchBonusHz: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Mặc định <code>+12Hz</code> giúp giọng HoaiMy/NamMinh tươi sáng, biểu cảm hơn.
                </span>
              </label>

              {/* Max Segments Per Job */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Số phân đoạn (Segments) tối đa mỗi Video
                </span>
                <input
                  type="number"
                  step="10"
                  min="20"
                  max="500"
                  value={paramsForm.maxSegmentsPerJob}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      maxSegmentsPerJob: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Đảm bảo thu và lồng tiếng đầy đủ không bị cắt bớt giữa chừng.
                </span>
              </label>

              {/* Plan Default Credits: Free */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Credit mặc định gói FREE
                </span>
                <input
                  type="number"
                  min="0"
                  value={paramsForm.freePlanDefaultCredits}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      freePlanDefaultCredits: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Số credit cấp cho tài khoản mới đăng ký gói Free.
                </span>
              </label>

              {/* Plan Default Credits: Pro */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Credit mặc định gói PRO
                </span>
                <input
                  type="number"
                  min="0"
                  value={paramsForm.proPlanDefaultCredits}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      proPlanDefaultCredits: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Số credit tiêu chuẩn khi nâng cấp lên gói Pro.
                </span>
              </label>

              {/* Plan Default Credits: Business */}
              <label className="block space-y-space-1.5 rounded-md border border-surface-2 bg-surface-2 p-space-4">
                <span className="text-xs font-bold text-text-primary">
                  Credit mặc định gói BUSINESS
                </span>
                <input
                  type="number"
                  min="0"
                  value={paramsForm.businessPlanDefaultCredits}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      businessPlanDefaultCredits: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <span className="block text-[11px] text-text-muted">
                  Số credit tiêu chuẩn cho gói phòng thu Business.
                </span>
              </label>
            </div>

            {/* AI Dubbing Prompt Guardrails & Custom Director Rules */}
            <div className="rounded-md border border-primary/40 bg-surface-2 p-space-4 space-y-space-3">
              <div className="flex flex-wrap items-center justify-between gap-space-2">
                <div className="flex items-center gap-space-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-text-primary">
                    Rào Chắn Kỹ Thuật Prompt Đạo Diễn Lồng Tiếng (Anti-Chatbot & Lip-Sync Sandbox)
                  </span>
                </div>
                <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                  Đang bật khóa JSON Schema + XML Sandbox + Bộ lọc Hậu kiểm
                </span>
              </div>

              <div className="rounded-sm border border-surface-2 bg-bg p-space-3 text-[11px] text-text-secondary space-y-1 font-mono">
                <p className="text-primary font-semibold">
                  [SYSTEM_ROLE: NON-CONVERSATIONAL_CINEMA_VIETNAMESE_DUBBING_ENGINE]
                </p>
                <p>
                  1. XML Sandbox: Bọc toàn bộ câu thoại trong thẻ <code>&lt;DUBBING_SCRIPT_PAYLOAD&gt;</code> &amp; <code>&lt;SOURCE_DIALOGUE_LINE&gt;</code> kèm câu trước/câu sau (<code>prev_en</code> / <code>next_en</code>) để AI hiểu 100% đây là kịch bản phim đang chiếu, tuyệt đối không trả lời câu hỏi của nhân vật.
                </p>
                <p>
                  2. Khóa đầu ra JSON: Mọi request đơn lẻ &amp; theo cụm tới DeepSeek / Groq / OpenAI / Gemini đều khóa cứng <code>response_format: &#123; type: &quot;json_object&quot; &#125;</code>.
                </p>
                <p>
                  3. Hậu kiểm Anti-Chatbot (Output Sanitizer): Tự động phát hiện và loại bỏ mọi câu phản hồi kiểu trợ lý ảo hoặc vượt quá giới hạn âm tiết khẩu hình (<code>idealSyllables -&gt; maxSyllables</code>).
                </p>
              </div>

              <label className="block space-y-space-1.5">
                <span className="text-xs font-bold text-text-primary">
                  Chỉ dẫn Đạo diễn Bổ sung (Custom Director Prompt Override — Tùy chọn)
                </span>
                <textarea
                  rows={2}
                  value={paramsForm.customDirectorPrompt || ""}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      customDirectorPrompt: e.target.value,
                    }))
                  }
                  placeholder="Ví dụ: Ưu tiên xưng hô 'tớ - cậu' cho nhân vật hoạt hình, giữ giọng điệu hài hước, dịch sát thuật ngữ chuyên ngành..."
                  className="w-full rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-space-2">
              <label className="inline-flex items-center gap-space-2 text-xs text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={paramsForm.autoSkipSilenceDefault}
                  onChange={(e) =>
                    setParamsForm((p) => ({
                      ...p,
                      autoSkipSilenceDefault: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span>
                  Bật mặc định tính năng <strong>Tự động tua nhanh khoảng lặng nhạc nền &gt; 4.5s</strong> trong trình phát
                </span>
              </label>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveKeysAndParams(false)}
                className="inline-flex items-center gap-space-2 rounded-sm bg-primary px-space-5 py-space-2.5 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>Lưu Thông Số Hệ Thống</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: USERS & CREDITS MANAGEMENT */}
        {activeTab === "users" && data && (
          <div className="space-y-space-6">
            {/* Create New User Card */}
            <form
              onSubmit={handleCreateUser}
              className="rounded-lg border border-surface-2 bg-surface p-space-5 space-y-space-4"
            >
              <div className="flex items-center gap-space-2">
                <Plus className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-text-primary">
                  Tạo Tài Khoản Người Dùng Mới
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-5">
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Email (vd: editor@studio.vn)"
                  className="rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Tên hiển thị"
                  className="rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <input
                  type="text"
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mật khẩu (mặc định 123456)"
                  className="rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                />
                <select
                  value={newUserPlan}
                  onChange={(e) =>
                    setNewUserPlan(e.target.value as "free" | "pro" | "business")
                  }
                  className="rounded-sm border border-surface-2 bg-bg px-space-3 py-space-2 text-xs text-text-primary"
                >
                  <option value="free">Gói FREE</option>
                  <option value="pro">Gói PRO</option>
                  <option value="business">Gói BUSINESS</option>
                </select>
                <div className="flex gap-space-2">
                  <input
                    type="number"
                    value={newUserCredits}
                    onChange={(e) => setNewUserCredits(Number(e.target.value))}
                    className="w-24 rounded-sm border border-surface-2 bg-bg px-space-2.5 py-space-2 text-xs text-text-primary tabular-nums"
                    title="Số dư Credit khởi tạo"
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-sm bg-primary px-space-3 py-space-2 text-xs font-bold text-text-primary hover:bg-primary-hover"
                  >
                    Tạo User
                  </button>
                </div>
              </div>
            </form>

            {/* Users List */}
            <div className="rounded-lg border border-surface-2 bg-surface p-space-5 space-y-space-4">
              <h2 className="text-base font-bold text-text-primary">
                Danh Sách Người Dùng & Điều Chỉnh Gói / Credit
              </h2>

              <div className="space-y-space-3">
                {data.users.map((u) => {
                  const draft = userDrafts[u.id] || {
                    plan: u.plan,
                    creditBalance: u.creditBalance,
                    name: u.name,
                  };

                  return (
                    <div
                      key={u.id}
                      className="rounded-md border border-surface-2 bg-surface-2 p-space-4 space-y-space-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-space-3">
                        <div>
                          <div className="flex items-center gap-space-2">
                            <span className="text-sm font-bold text-text-primary">
                              {u.email}
                            </span>
                            <span className="rounded-sm bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase text-primary">
                              {u.plan}
                            </span>
                            <span className="text-xs text-text-secondary">
                              · {u.jobCount} video đã tạo
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted">
                            ID: <code>{u.id}</code>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-space-2">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [u.id]: { ...draft, name: e.target.value },
                              }))
                            }
                            className="w-36 rounded-sm border border-surface-2 bg-bg px-space-2.5 py-1.5 text-xs text-text-primary"
                            placeholder="Tên hiển thị"
                          />

                          <select
                            value={draft.plan}
                            onChange={(e) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...draft,
                                  plan: e.target.value as "free" | "pro" | "business",
                                },
                              }))
                            }
                            className="rounded-sm border border-surface-2 bg-bg px-space-2.5 py-1.5 text-xs font-semibold text-text-primary"
                          >
                            <option value="free">FREE</option>
                            <option value="pro">PRO</option>
                            <option value="business">BUSINESS</option>
                          </select>

                          <div className="flex items-center gap-1 rounded-sm border border-surface-2 bg-bg px-space-2 py-1">
                            <Coins className="h-3.5 w-3.5 text-warning" />
                            <input
                              type="number"
                              value={draft.creditBalance}
                              onChange={(e) =>
                                setUserDrafts((prev) => ({
                                  ...prev,
                                  [u.id]: {
                                    ...draft,
                                    creditBalance: Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-20 bg-transparent text-xs font-bold text-text-primary tabular-nums focus:outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...draft,
                                  creditBalance: draft.creditBalance + 100,
                                },
                              }))
                            }
                            className="rounded-sm border border-surface-2 bg-surface px-2 py-1 text-[11px] font-semibold text-success hover:bg-surface-2"
                          >
                            +100 Cr
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...draft,
                                  creditBalance: draft.creditBalance + 500,
                                },
                              }))
                            }
                            className="rounded-sm border border-surface-2 bg-surface px-2 py-1 text-[11px] font-semibold text-success hover:bg-surface-2"
                          >
                            +500 Cr
                          </button>

                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleUpdateUser(u.id)}
                            className="inline-flex items-center gap-1 rounded-sm bg-primary px-space-3 py-1.5 text-xs font-bold text-text-primary hover:bg-primary-hover"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>Lưu</span>
                          </button>
                        </div>
                      </div>

                      {u.recentLedger.length > 0 && (
                        <div className="border-t border-surface-2 pt-space-2 text-[11px] text-text-secondary">
                          <span className="font-semibold text-text-muted">
                            Lịch sử biến động Credit gần nhất:{" "}
                          </span>
                          {u.recentLedger.slice(0, 3).map((l, idx) => (
                            <span key={l.id} className="mr-3">
                              {idx > 0 ? "· " : ""}
                              <strong
                                className={
                                  l.delta >= 0 ? "text-success" : "text-warning"
                                }
                              >
                                {l.delta >= 0 ? `+${l.delta}` : l.delta}
                              </strong>{" "}
                              ({l.reason})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: JOBS & VOICES MANAGEMENT */}
        {activeTab === "jobs_voices" && data && (
          <div className="space-y-space-6">
            {/* Jobs Management */}
            <div className="rounded-lg border border-surface-2 bg-surface p-space-5 space-y-space-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-primary">
                    Quản Lý Tiến Trình Lồng Tiếng Video (All Dub Jobs)
                  </h2>
                  <p className="text-xs text-text-secondary">
                    Bạn có thể bấm <strong>“Dịch lại bằng Key mới & Render TTS”</strong> để áp dụng ngay API Key (Groq / DeepSeek / Gemini) vừa cài đặt cho bất kỳ video nào.
                  </p>
                </div>
              </div>

              <div className="space-y-space-3">
                {data.jobs.map((job) => {
                  const isBusy = busyJobId === job.id;
                  return (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-space-3 rounded-md border border-surface-2 bg-surface-2 p-space-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-space-2">
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-sm font-bold text-primary hover:underline"
                          >
                            {job.title}
                          </Link>
                          <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                            {job.status} · {job.progress}%
                          </span>
                          <span className="rounded-sm bg-surface px-2 py-0.5 text-[11px] text-text-secondary">
                            {job.segmentCount} câu thoại · {job.speakerCount} nhân vật
                          </span>
                        </div>
                        <p className="text-xs text-text-muted">
                          ID: <code>{job.id}</code> · Chủ sở hữu:{" "}
                          <strong>{job.user.email}</strong> · Thể loại:{" "}
                          <strong>{job.genre || "animation"}</strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-space-2">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="rounded-sm border border-surface-2 bg-surface px-space-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg"
                        >
                          Mở Phòng Thu
                        </Link>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleJobAction(job.id, "retranslate_job")
                          }
                          className="inline-flex items-center gap-1 rounded-sm bg-primary px-space-3 py-1.5 text-xs font-bold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          <span>
                            {isBusy
                              ? "Đang xử lý..."
                              : "Dịch lại bằng Key mới + TTS"}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleJobAction(job.id, "rescan_job")}
                          className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-space-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              isBusy ? "animate-spin" : ""
                            }`}
                          />
                          <span>Quét lại ASR đầy đủ</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleJobAction(job.id, "delete_job")}
                          className="rounded-sm border border-danger/40 bg-danger/10 p-1.5 text-danger hover:bg-danger/20 disabled:opacity-50"
                          title="Xóa tiến trình này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Voices Catalog Management */}
            <div className="rounded-lg border border-surface-2 bg-surface p-space-5 space-y-space-4">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  Danh Mục Giọng Đọc AI Tiếng Việt (Voice Catalog)
                </h2>
                <p className="text-xs text-text-secondary">
                  Bật/tắt các mẫu giọng đọc nhân vật trong thuật toán phân vai tự động (AI Speaker Casting).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.voices.map((v) => (
                  <div
                    key={v.id}
                    className={`rounded-md border p-space-4 space-y-space-2 ${
                      v.isActive
                        ? "border-surface-2 bg-surface-2"
                        : "border-surface-2/50 bg-bg opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">
                        {v.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleVoice(v)}
                        className={`rounded-sm px-2 py-0.5 text-[11px] font-bold ${
                          v.isActive
                            ? "bg-success/15 text-success"
                            : "bg-danger/15 text-danger"
                        }`}
                      >
                        {v.isActive ? "Đang bật" : "Đã tắt"}
                      </button>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      Giới tính: <strong>{v.genderPresentation}</strong> · Độ tuổi:{" "}
                      <strong>{v.ageGroup}</strong> · Pitch:{" "}
                      <strong>{v.basePitchHz}Hz</strong> · Tốc độ:{" "}
                      <strong>{v.speakingRate}x</strong>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {v.styleTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-sm bg-bg px-1.5 py-0.5 text-[10px] text-text-muted"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
