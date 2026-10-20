import type { Request, Response, NextFunction } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyIdToken } from "./firebaseAdmin.js";

// Quyền quản trị CHỈ đến từ custom claim { admin: true } do máy chủ gán bằng Firebase Admin SDK
// (xem scripts/admin-users.ts). KHÔNG dựa vào email trong token: bất kỳ ai cũng có thể tự tạo tài
// khoản Firebase với một email chưa xác minh. firestore.rules (isAdmin) kiểm tra cùng claim này.

// Errors that mean "we could not check the token right now", not "the token is bad".
const TRANSIENT_ERROR_CODES = new Set([
  "app/network-error",
  "app/network-timeout",
  "app/invalid-credential",
  "auth/internal-error",
]);
// verifyIdToken reports a failed download of Google's public keys as auth/argument-error.
// These message prefixes are produced by firebase-admin itself, never by token content.
const TRANSIENT_MESSAGE_RE = /^(Error while making request|Error fetching public keys)/;

function requestPath(req: Request): string {
  return String(req.originalUrl || req.url || "").split("?")[0];
}

export function isAdminToken(decoded: DecodedIdToken | null | undefined): boolean {
  return decoded?.admin === true;
}

function isTransientVerifyError(error: any): boolean {
  const code: string = error?.code || error?.errorInfo?.code || "";
  if (TRANSIENT_ERROR_CODES.has(code)) return true;
  return code === "auth/argument-error" && TRANSIENT_MESSAGE_RE.test(String(error?.message || ""));
}

/**
 * Express middleware: requires "Authorization: Bearer <Firebase ID token>" whose account has the
 * custom claim admin === true.
 * 401 when the token is missing/invalid/expired/revoked, 403 when the account is not an admin,
 * 503 when the token could not be checked right now.
 * On success the admin email/uid are available as res.locals.adminEmail / res.locals.adminUid.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = String(req.headers.authorization || "").trim();
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: "Bạn cần đăng nhập tài khoản quản trị để thực hiện thao tác này." });
    return;
  }

  verifyIdToken(match[1]).then(
    (decoded) => {
      const email = (decoded.email || "").toLowerCase();
      if (!isAdminToken(decoded)) {
        console.warn(`[auth] Từ chối quyền quản trị cho ${email || "(không có email)"} / uid ${decoded.uid} (${req.method} ${requestPath(req)})`);
        res.status(403).json({ error: "Tài khoản của bạn không có quyền quản trị." });
        return;
      }
      res.locals.adminEmail = email || `uid ${decoded.uid}`;
      res.locals.adminUid = decoded.uid;
      next();
    },
    (error: any) => {
      const code: string = error?.code || error?.errorInfo?.code || "";
      if (isTransientVerifyError(error)) {
        console.error(`[auth] Không xác minh được token (${code}):`, error?.message);
        res.status(503).json({ error: "Không thể xác minh phiên đăng nhập lúc này. Vui lòng thử lại sau ít phút." });
        return;
      }
      console.warn(`[auth] Token không hợp lệ (${code || "unknown"}) cho ${req.method} ${requestPath(req)}`);
      const expired = code === "auth/id-token-expired";
      const revoked = code === "auth/id-token-revoked" || code === "auth/user-disabled" || code === "auth/user-not-found";
      res.status(401).json({
        error: expired
          ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
          : revoked
            ? "Phiên đăng nhập đã bị thu hồi hoặc tài khoản đã bị vô hiệu hóa. Vui lòng đăng nhập lại."
            : "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
      });
    }
  );
}
