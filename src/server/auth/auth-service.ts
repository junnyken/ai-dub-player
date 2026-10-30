import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { PLAN_LIMITS, UserPlan } from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";

export const SESSION_COOKIE_NAME = "aidub_session";
const STUDIO_ADMIN_EMAILS = new Set(["creator@aidub.vn", "admin@aidub.vn"]);
const ALLOWED_PLANS = new Set<UserPlan>(["free", "pro", "business"]);

function legacyHashPassword(password: string): string {
  return crypto.createHash("sha256").update(`aidub_salt_${password}`).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasswordTimingSafe(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const candidate = crypto.scryptSync(password, salt, 64);
    const target = Buffer.from(expectedHex, "hex");
    if (candidate.byteLength !== target.byteLength) {
      return false;
    }
    return crypto.timingSafeEqual(candidate, target);
  }
  const candidate = Buffer.from(legacyHashPassword(password), "utf-8");
  const target = Buffer.from(storedHash, "utf-8");
  if (candidate.byteLength !== target.byteLength) {
    return false;
  }
  return crypto.timingSafeEqual(candidate, target);
}

export class AuthService {
  public async register(input: {
    email: string;
    password: string;
    name: string;
    plan?: UserPlan;
  }) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    if (!email || !email.includes("@")) {
      throw new ValidationDomainError("INVALID_EMAIL", "Địa chỉ email không hợp lệ.");
    }
    if (!input.password || input.password.length < 6) {
      throw new ValidationDomainError(
        "WEAK_PASSWORD",
        "Mật khẩu phải có ít nhất 6 ký tự."
      );
    }
    if (!name) {
      throw new ValidationDomainError("MISSING_NAME", "Vui lòng nhập tên hiển thị.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationDomainError(
        "EMAIL_ALREADY_EXISTS",
        "Email này đã được đăng ký. Vui lòng đăng nhập."
      );
    }

    const plan: UserPlan = input.plan ?? "free";
    if (!ALLOWED_PLANS.has(plan)) {
      throw new ValidationDomainError(
        "INVALID_PLAN",
        "Gói dịch vụ không hợp lệ."
      );
    }
    const initialCredits = PLAN_LIMITS[plan].monthlyCredits;

    const { user, session } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword(input.password),
          plan,
          creditBalance: initialCredits,
        },
      });

      await tx.creditLedger.create({
        data: {
          userId: createdUser.id,
          delta: initialCredits,
          reason: "initial_grant",
          balanceAfter: initialCredits,
        },
      });

      const token = `sess_${crypto.randomBytes(24).toString("hex")}`;
      const createdSession = await tx.authSession.create({
        data: {
          token,
          userId: createdUser.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return { user: createdUser, session: createdSession };
    });

    return {
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan as UserPlan,
        creditBalance: user.creditBalance,
        createdAt: user.createdAt,
      },
    };
  }

  public async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !verifyPasswordTimingSafe(input.password, user.passwordHash)) {
      throw new DomainError(
        401,
        "INVALID_CREDENTIALS",
        "Email hoặc mật khẩu không chính xác."
      );
    }

    const token = `sess_${crypto.randomBytes(24).toString("hex")}`;
    await prisma.authSession.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan as UserPlan,
        creditBalance: user.creditBalance,
        createdAt: user.createdAt,
      },
    };
  }

  public async logout(token?: string | null) {
    if (!token) return;
    await prisma.authSession.deleteMany({ where: { token } });
  }

  public async ensureDefaultStudioUser() {
    const defaultEmail = "creator@aidub.vn";
    let user = await prisma.user.findUnique({ where: { email: defaultEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: defaultEmail,
          name: "Creator Studio",
          passwordHash: hashPassword("demo123456"),
          plan: "pro",
          creditBalance: 120,
        },
      });
      await prisma.creditLedger.create({
        data: {
          userId: user.id,
          delta: 120,
          reason: "initial_grant",
          balanceAfter: 120,
        },
      });
    } else if (user.creditBalance < 15) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: 120 },
      });
    }
    return user;
  }

  public async resolveUserFromRequest(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const token = bearerToken || cookieToken;

    if (token) {
      if (token === "unauthorized") {
        throw new DomainError(
          401,
          "UNAUTHORIZED",
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
        );
      }
      const session = await prisma.authSession.findUnique({
        where: { token },
        include: { user: true },
      });
      if (session && session.expiresAt > new Date()) {
        return session.user;
      }
      throw new DomainError(
        401,
        "UNAUTHORIZED",
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
      );
    }

    const explicitUserId = req.headers.get("x-user-id");
    if (explicitUserId) {
      if (process.env.NODE_ENV === "production") {
        throw new DomainError(
          401,
          "UNAUTHORIZED_HEADER_SPOOF_BLOCKED",
          "Header x-user-id bị chặn trong môi trường production. Vui lòng sử dụng phiên đăng nhập hợp lệ."
        );
      }
      const user = await prisma.user.findUnique({ where: { id: explicitUserId } });
      if (!user) {
        throw new DomainError(401, "UNAUTHORIZED", "Không tìm thấy tài khoản người dùng.");
      }
      return user;
    }

    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_DEMO_AUTO_LOGIN !== "true"
    ) {
      throw new DomainError(
        401,
        "UNAUTHORIZED",
        "Vui lòng đăng nhập để sử dụng dịch vụ."
      );
    }

    // For seamless interactive web studio experience when no cookie is set yet
    return this.ensureDefaultStudioUser();
  }

  public async requireAdminFromRequest(req: NextRequest) {
    // 1. Block cross-origin browser requests to Admin/AI-Config control plane
    const origin = req.headers.get("origin");
    if (origin) {
      let allowedOrigin = false;
      try {
        const originUrl = new URL(origin);
        const reqHost = req.headers.get("host") || "localhost:3000";
        allowedOrigin =
          originUrl.host === reqHost ||
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1";
      } catch {
        allowedOrigin = false;
      }
      if (!allowedOrigin) {
        throw new DomainError(
          403,
          "FORBIDDEN_CROSS_ORIGIN_ADMIN",
          "Truy cập quản trị từ tên miền bên ngoài (Cross-Origin) đã bị chặn."
        );
      }
    }

    // 2. Check explicit ADMIN_ACCESS_TOKEN if configured
    const configuredAdminToken = process.env.ADMIN_ACCESS_TOKEN?.trim();
    const suppliedAdminToken = req.headers.get("x-admin-token")?.trim();
    if (configuredAdminToken) {
      if (suppliedAdminToken !== configuredAdminToken) {
        throw new DomainError(
          403,
          "FORBIDDEN_ADMIN_TOKEN_REQUIRED",
          "Thiếu hoặc sai mã khóa quản trị viên (x-admin-token)."
        );
      }
    }

    // 3. Resolve user identity and enforce Studio Admin privilege
    const user = await this.resolveUserFromRequest(req);
    const adminEmailEnv = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const isStudioAdmin =
      STUDIO_ADMIN_EMAILS.has(user.email.toLowerCase()) ||
      (Boolean(adminEmailEnv) && user.email.toLowerCase() === adminEmailEnv);

    if (!isStudioAdmin) {
      throw new DomainError(
        403,
        "FORBIDDEN_ADMIN_ONLY",
        "Chỉ quản trị viên hệ thống (Admin) mới có quyền thực hiện thao tác này."
      );
    }

    return user;
  }
}

export const authService = new AuthService();
