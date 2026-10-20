/**
 * Quản lý quyền quản trị (custom claim "admin") cho tài khoản Firebase.
 *
 * Quyền quản trị KHÔNG còn dựa vào danh sách email: máy chủ (/api/applications, /api/smtp-settings)
 * và firestore.rules (sửa tin tuyển dụng, nội dung trang) chỉ chấp nhận tài khoản có claim admin = true.
 * Claim này chỉ gán được bằng khóa service account, nên người ngoài không tự cấp quyền được.
 *
 * Chạy trên máy (cần FIREBASE_SERVICE_ACCOUNT trong .env.local hoặc .env):
 *   npm run admin-users -- list                 Liệt kê mọi tài khoản (ngày tạo, lần đăng nhập cuối, quyền)
 *   npm run admin-users -- grant  <email>       Cấp quyền quản trị
 *   npm run admin-users -- revoke <email>       Gỡ quyền quản trị + đăng xuất tài khoản khỏi mọi thiết bị
 *   npm run admin-users -- logout <email>       Chỉ đăng xuất khỏi mọi thiết bị (sau khi đổi mật khẩu)
 *
 * Sau khi cấp/gỡ quyền, người dùng cần đăng xuất rồi đăng nhập lại trang /admin.
 */
import dotenv from "dotenv";
import { getAdminAuth, getProjectId, hasAdminCredentials } from "../src/server/firebaseAdmin.js";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

type UserLike = {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
  providerData: { providerId: string }[];
  metadata: { creationTime: string; lastSignInTime: string | null };
};

function describe(user: UserLike): string {
  const providers = user.providerData.map((p) => p.providerId).join(",") || "-";
  return [
    user.customClaims?.admin === true ? "[ADMIN]" : "       ",
    user.email || "(không có email)",
    `uid=${user.uid}`,
    `xác minh email=${user.emailVerified ? "có" : "không"}`,
    `đăng nhập bằng=${providers}`,
    `tạo lúc=${user.metadata.creationTime}`,
    `đăng nhập cuối=${user.metadata.lastSignInTime || "-"}`,
    user.disabled ? "ĐÃ VÔ HIỆU HÓA" : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function main() {
  const [command, emailArg] = process.argv.slice(2);
  if (!hasAdminCredentials()) {
    console.error("Thiếu hoặc sai FIREBASE_SERVICE_ACCOUNT (đặt trong .env.local hoặc .env). Xem .env.example.");
    process.exit(1);
  }
  const auth = getAdminAuth();
  console.log(`Dự án Firebase: ${getProjectId()}`);

  if (command === "list") {
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      page.users.forEach((u) => console.log(describe(u)));
      pageToken = page.pageToken;
    } while (pageToken);
    return;
  }

  if (!["grant", "revoke", "logout"].includes(command || "") || !emailArg) {
    console.error("Cách dùng: npm run admin-users -- list | grant <email> | revoke <email> | logout <email>");
    process.exit(1);
  }

  const user = await auth.getUserByEmail(emailArg.trim());
  console.log(`Tài khoản: ${describe(user)}`);

  if (command === "grant") {
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
    console.log("Đã cấp quyền quản trị. Người dùng cần đăng xuất rồi đăng nhập lại trang /admin.");
    if (!user.emailVerified) {
      console.log("Lưu ý: email của tài khoản này chưa được xác minh — hãy chắc chắn tài khoản đúng là của người cần cấp quyền.");
    }
    return;
  }

  if (command === "revoke") {
    const claims = { ...(user.customClaims || {}) };
    delete claims.admin;
    await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  }
  await auth.revokeRefreshTokens(user.uid);
  console.log(
    command === "revoke"
      ? "Đã gỡ quyền quản trị và đăng xuất tài khoản khỏi mọi thiết bị."
      : "Đã đăng xuất tài khoản khỏi mọi thiết bị."
  );
}

main().catch((error) => {
  console.error("Lỗi:", error?.code || "", error?.message || error);
  process.exit(1);
});
