"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Headphones,
  LogIn,
  Moon,
  Puzzle,
  ShieldCheck,
  Sun,
  UserCheck,
} from "lucide-react";
import { CreditBalanceBadge } from "@/components/header/CreditBalanceBadge";
import { BillingModal } from "@/components/dub/BillingModal";

export interface CurrentUserDto {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro" | "business";
  creditBalance: number;
}

export function TopNavBar({
  user,
  isLoadingUser,
  onUserUpdated,
}: {
  user?: CurrentUserDto | null;
  isLoadingUser?: boolean;
  onUserUpdated?: () => void;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      if (next === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || "Không thể xác thực tài khoản.");
        return;
      }
      setShowAuthModal(false);
      onUserUpdated?.();
    } catch {
      setAuthError("Không thể kết nối máy chủ xác thực.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <header className="border-b border-surface-2 bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-space-4 py-space-3">
        <Link
          href="/"
          className="inline-flex items-center gap-space-2 text-base font-bold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-text-primary">
            <Headphones className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>AI Dub Player</span>
        </Link>

        <div className="flex items-center gap-space-3">
          <CreditBalanceBadge
            creditBalance={user?.creditBalance}
            plan={user?.plan}
            isLoading={isLoadingUser}
          />

          <Link
            href="/admin"
            className="inline-flex items-center gap-space-1.5 rounded-sm border border-primary/50 bg-primary/15 px-space-3 py-space-1 text-xs font-bold text-primary hover:bg-primary hover:text-text-primary transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quản trị (Admin)</span>
          </Link>

          <button
            type="button"
            onClick={() => setShowExtensionModal(true)}
            className="inline-flex items-center gap-space-1.5 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:border-primary"
          >
            <Puzzle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Tiện ích Chrome</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBillingModal(true)}
            className="inline-flex items-center gap-space-1.5 rounded-sm border border-primary/50 bg-surface-2 px-space-3 py-space-1 text-xs font-semibold text-text-primary hover:bg-primary"
          >
            <CreditCard className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Nâng cấp / Credit</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Chuyển sang giao diện sáng"
                : "Chuyển sang giao diện tối"
            }
            title={
              theme === "dark"
                ? "Chuyển sang giao diện sáng"
                : "Chuyển sang giao diện tối"
            }
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-surface-2 bg-surface-2 text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="inline-flex items-center gap-space-2 rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-1 text-xs font-medium text-text-primary hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {user ? (
              <>
                <UserCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                <span>{user.name}</span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Đăng nhập</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showAuthModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-space-4"
        >
          <div className="w-full max-w-md rounded-lg border border-surface-2 bg-surface p-space-6">
            <div className="flex items-center justify-between">
              <h2
                id="auth-dialog-title"
                className="text-lg font-bold text-text-primary"
              >
                {authMode === "login" ? "Đăng nhập tài khoản" : "Tạo tài khoản mới"}
              </h2>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="mt-space-4 space-y-space-3">
              {authMode === "register" && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-medium text-text-secondary"
                  >
                    Tên hiển thị
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-text-secondary"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="creator@aidub.vn"
                  className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-text-secondary"
                >
                  Mật khẩu
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-space-1 w-full rounded-sm border border-surface-2 bg-surface-2 px-space-3 py-space-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                />
              </div>

              {authError && (
                <p role="alert" className="text-xs text-danger">
                  {authError}
                </p>
              )}

              <div className="flex items-center justify-between pt-space-2">
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "register" : "login")
                  }
                  className="text-xs text-primary hover:underline"
                >
                  {authMode === "login"
                    ? "Chưa có tài khoản? Đăng ký"
                    : "Đã có tài khoản? Đăng nhập"}
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-sm bg-primary px-space-4 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {submitting
                    ? "Đang xử lý..."
                    : authMode === "login"
                    ? "Đăng nhập"
                    : "Đăng ký"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BillingModal
        isOpen={showBillingModal}
        onClose={() => setShowBillingModal(false)}
        onBillingSuccess={() => onUserUpdated?.()}
      />

      {showExtensionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ext-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-space-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-surface-2 bg-surface p-space-6">
            <div className="flex items-center justify-between border-b border-surface-2 pb-space-3">
              <div className="flex items-center gap-space-2">
                <Puzzle className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2
                  id="ext-dialog-title"
                  className="text-lg font-bold text-text-primary"
                >
                  Kết nối Tiện ích Chrome (YouTube &amp; Web Video)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowExtensionModal(false)}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Đóng
              </button>
            </div>

            <div className="mt-space-4 space-y-space-3 text-xs text-text-secondary">
              <p>
                Tiện ích <strong>AI Dub Player Extension</strong> cho phép bấm lồng tiếng và xem trực tiếp trên{" "}
                <strong className="text-text-primary">
                  YouTube, Bilibili, Vimeo, Dailymotion &amp; Web xem phim HTML5
                </strong>
                .
              </p>
              <ol className="list-decimal space-y-space-2 pl-4 text-text-primary">
                <li>
                  Mở trình duyệt Chrome/Edge và truy cập{" "}
                  <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-primary">
                    chrome://extensions
                  </code>
                </li>
                <li>
                  Bật <strong>Developer mode (Chế độ nhà phát triển)</strong>, bấm{" "}
                  <strong>Load unpacked</strong> và chọn thư mục{" "}
                  <code className="rounded-sm bg-surface-2 px-1.5 py-0.5">
                    extension/
                  </code>{" "}
                  trong dự án.
                </li>
                <li>
                  Mở Popup tiện ích, nhập địa chỉ Website hiện tại của bạn và bấm{" "}
                  <strong>Lưu &amp; Kiểm tra kết nối Website</strong>.
                </li>
              </ol>
            </div>

            <div className="mt-space-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExtensionModal(false)}
                className="rounded-sm bg-primary px-space-4 py-space-2 text-xs font-semibold text-text-primary hover:bg-primary-hover"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
