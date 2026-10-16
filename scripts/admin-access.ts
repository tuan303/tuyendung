import { getAdminServices } from '../src/server/firebaseAdmin';

async function main() {
  const args = process.argv.slice(2);
  const uidIndex = args.indexOf('--uid');
  const uid = uidIndex >= 0 ? args[uidIndex + 1] : undefined;
  const grant = args.includes('--grant-admin');
  const revoke = args.includes('--revoke-sessions');
  if (!uid || (!grant && !revoke) || uid.length > 128) throw new Error('Cần --uid <Firebase UID> và --grant-admin hoặc --revoke-sessions.');
  const { auth } = getAdminServices();
  if (grant) {
    const user = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
  }
  if (revoke) await auth.revokeRefreshTokens(uid);
  console.log(JSON.stringify({ adminClaimGranted: grant, sessionsRevoked: revoke, passwordChanged: false }));
}
main().catch(() => { console.error('Không thể cập nhật quyền. Kiểm tra UID và cấu hình Firebase Admin riêng trên máy chủ.'); process.exitCode = 1; });
