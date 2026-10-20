import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Lazy singleton wrapper around firebase-admin.
// Nothing here runs at import time: env vars are read on first use, so a
// malformed FIREBASE_SERVICE_ACCOUNT never crashes module import.

const DEFAULT_PROJECT_ID = "graphic-pattern-482103-m6";
const ADMIN_APP_NAME = "tuyendung-server";

interface ServiceAccountKey {
  project_id?: string;
  client_email: string;
  private_key: string;
}

let parsed = false;
let serviceAccount: ServiceAccountKey | null = null;
let adminApp: App | null = null;
let adminDb: Firestore | null = null;

export function isVercel(): boolean {
  return !!process.env.VERCEL;
}

function parseServiceAccount(): ServiceAccountKey | null {
  if (parsed) return serviceAccount;
  parsed = true;

  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;

  try {
    // Accept either raw JSON text or base64 of the JSON.
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8").trim();
    let obj: any;
    try {
      obj = JSON.parse(text);
    } catch (firstError) {
      // dotenv turns "\n" inside a double-quoted .env value into real line breaks, which breaks the
      // JSON string of private_key. Re-escape line breaks inside the PEM block and try once more.
      const repaired = text.replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----(?:\r?\n)*/g, (pem) =>
        pem.replace(/\r?\n/g, "\\n")
      );
      if (repaired === text) throw firstError;
      obj = JSON.parse(repaired);
    }
    if (!obj || typeof obj !== "object") {
      throw new Error("nội dung không phải object JSON / not a JSON object");
    }
    if (typeof obj.client_email !== "string" || typeof obj.private_key !== "string" || !obj.client_email || !obj.private_key) {
      throw new Error("thiếu client_email hoặc private_key / missing client_email or private_key");
    }
    serviceAccount = {
      project_id: typeof obj.project_id === "string" ? obj.project_id : undefined,
      client_email: obj.client_email,
      // Keys pasted into env dashboards often keep literal "\n" sequences.
      private_key: obj.private_key.replace(/\\n/g, "\n"),
    };
  } catch (error: any) {
    serviceAccount = null;
    // Never log the parser message itself: it can quote parts of the secret.
    const reason = error instanceof SyntaxError ? "không đọc được JSON / could not parse JSON" : error?.message || "unknown";
    console.error(
      "[firebase-admin] Biến FIREBASE_SERVICE_ACCOUNT không hợp lệ (cần là JSON của service account hoặc chuỗi base64 của JSON đó). " +
        "Invalid FIREBASE_SERVICE_ACCOUNT (expected service-account JSON or base64 of it): " +
        reason +
        ". Nếu đặt trong file .env: dùng chuỗi base64, hoặc JSON trên MỘT dòng đặt trong nháy đơn '...' (không dùng nháy kép)."
    );
  }
  return serviceAccount;
}

/** True when a usable service-account key is configured (Firestore access available). */
export function hasAdminCredentials(): boolean {
  return parseServiceAccount() !== null;
}

export function getProjectId(): string {
  const fromEnv = (process.env.FIREBASE_PROJECT_ID || "").trim();
  if (fromEnv) return fromEnv;
  return parseServiceAccount()?.project_id || DEFAULT_PROJECT_ID;
}

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const sa = parseServiceAccount();
  const projectId = getProjectId();
  adminApp = sa
    ? initializeApp(
        {
          credential: cert({ projectId, clientEmail: sa.client_email, privateKey: sa.private_key }),
          projectId,
        },
        ADMIN_APP_NAME
      )
    : // Without credentials only ID-token verification works (it needs just the project id).
      initializeApp({ projectId }, ADMIN_APP_NAME);
  return adminApp;
}

/** Firestore (admin, bypasses security rules) or null when no service account is configured. */
export function getAdminDb(): Firestore | null {
  if (!hasAdminCredentials()) return null;
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
    try {
      adminDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() can only be called once; ignore if already applied.
    }
  }
  return adminDb;
}

/**
 * Firebase Auth admin client. Managing users (custom claims, revoking sessions) needs a service
 * account, so this throws when FIREBASE_SERVICE_ACCOUNT is not configured.
 */
export function getAdminAuth(): Auth {
  if (!hasAdminCredentials()) {
    throw new Error("Chưa cấu hình FIREBASE_SERVICE_ACCOUNT nên không quản lý được tài khoản Firebase.");
  }
  return getAuth(getAdminApp());
}

/**
 * Verifies a Firebase ID token (signature, expiry, audience = project id).
 * With a service account (always the case on Vercel) it also rejects tokens of disabled
 * accounts and tokens issued before the account's sessions were revoked.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  return getAuth(getAdminApp()).verifyIdToken(idToken, hasAdminCredentials());
}
