import crypto from "crypto";

// AES-256-CBC, key = sha256(secret), stored as "ivhex:cipherhex" (same format as before).
// Passwords stored before this change were encrypted with sha256(GEMINI_API_KEY || LEGACY_DEFAULT_SECRET).
//
// Những mật khẩu cũ đó coi như ĐÃ LỘ (settings/smtp từng cho đọc công khai và /api/decrypt-password
// từng không cần đăng nhập). Vì vậy trên Vercel chỉ dùng SMTP_ENCRYPTION_KEY: mật khẩu cũ bị từ chối,
// quản trị viên phải thu hồi mật khẩu ứng dụng cũ, tạo mật khẩu mới và lưu lại trong trang Quản trị.
// Khi chạy local (dev) vẫn đọc được dữ liệu cũ để tiện thử nghiệm (có cảnh báo).

const LEGACY_DEFAULT_SECRET = "12345678901234567890123456789012";
const IV_LENGTH = 16;
const ENCRYPTED_FORMAT = /^[0-9a-f]{32}:(?:[0-9a-f]{32})+$/i;

export class EncryptionConfigError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = "EncryptionConfigError";
  }
}

let warnedLegacyKey = false;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/** Key used for NEW encryptions: only SMTP_ENCRYPTION_KEY (local dev without it: insecure default). */
function getEncryptionSecret(): string {
  const secret = process.env.SMTP_ENCRYPTION_KEY;
  if (secret) return secret;
  if (process.env.VERCEL) {
    throw new EncryptionConfigError(
      "Máy chủ chưa cấu hình biến môi trường SMTP_ENCRYPTION_KEY nên không thể lưu mật khẩu SMTP an toàn. " +
        "Vui lòng thêm SMTP_ENCRYPTION_KEY trong Vercel (Settings → Environment Variables) rồi deploy lại."
    );
  }
  if (!warnedLegacyKey) {
    warnedLegacyKey = true;
    console.warn(
      "[crypto] CẢNH BÁO: chưa đặt SMTP_ENCRYPTION_KEY. Đang dùng khóa mặc định không an toàn — chỉ dùng cho môi trường dev."
    );
  }
  return LEGACY_DEFAULT_SECRET;
}

/** Keys tried for decryption. On Vercel only SMTP_ENCRYPTION_KEY (legacy keys are compromised). */
function candidateSecrets(): string[] {
  if (process.env.VERCEL) {
    return process.env.SMTP_ENCRYPTION_KEY ? [process.env.SMTP_ENCRYPTION_KEY] : [];
  }
  const list = [process.env.SMTP_ENCRYPTION_KEY, process.env.GEMINI_API_KEY, LEGACY_DEFAULT_SECRET].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  return Array.from(new Set(list));
}

/** The key new values are encrypted with (null on Vercel without SMTP_ENCRYPTION_KEY). */
function currentSecret(): string | null {
  if (process.env.SMTP_ENCRYPTION_KEY) return process.env.SMTP_ENCRYPTION_KEY;
  return process.env.VERCEL ? null : LEGACY_DEFAULT_SECRET;
}

export function isEncryptedFormat(value: string): boolean {
  return ENCRYPTED_FORMAT.test(value);
}

/** Encrypts a secret for storage. Throws EncryptionConfigError when no key is configured on Vercel. */
export function encryptSecret(plainText: string): string {
  const key = deriveKey(getEncryptionSecret());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

function tryDecrypt(value: string, secret: string): string | null {
  try {
    const sep = value.indexOf(":");
    const iv = Buffer.from(value.slice(0, sep), "hex");
    const data = Buffer.from(value.slice(sep + 1), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", deriveKey(secret), iv);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    // A wrong key occasionally yields "valid" padding; reject output that is not clean text.
    const text = strictUtf8.decode(decrypted);
    // eslint-disable-next-line no-control-regex
    if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Decrypts a stored secret. On Vercel only SMTP_ENCRYPTION_KEY is accepted; locally it also tries
 * GEMINI_API_KEY and the legacy default key. Returns null when no key works.
 * Values not in "ivhex:cipherhex" format are legacy plain text: rejected on Vercel, accepted locally.
 */
export function decryptSecret(stored: string | undefined | null): string | null {
  if (!stored) return null;
  if (!isEncryptedFormat(stored)) {
    if (process.env.VERCEL) {
      console.error(
        "[crypto] Mật khẩu SMTP đang lưu ở dạng chưa mã hóa (dữ liệu của phiên bản cũ, coi như đã lộ) nên bị từ chối. " +
          "Hãy thu hồi mật khẩu ứng dụng cũ, tạo mật khẩu mới và lưu lại trong Quản trị > Cài đặt Email."
      );
      return null;
    }
    console.warn("[crypto] Mật khẩu SMTP đang lưu ở dạng chưa mã hóa (dữ liệu cũ). Hãy lưu lại cấu hình SMTP để mã hóa.");
    return stored;
  }
  const secrets = candidateSecrets();
  const current = currentSecret();
  for (const secret of secrets) {
    const result = tryDecrypt(stored, secret);
    if (result !== null) {
      if (secret !== current) {
        console.warn(
          "[crypto] Mật khẩu SMTP được giải mã bằng khóa cũ (chỉ cho phép khi chạy local). Hãy nhập lại mật khẩu trong trang quản trị SMTP để mã hóa bằng SMTP_ENCRYPTION_KEY."
        );
      }
      return result;
    }
  }
  console.error(
    process.env.VERCEL
      ? "[crypto] Không giải mã được mật khẩu SMTP bằng SMTP_ENCRYPTION_KEY (mật khẩu do phiên bản cũ lưu, hoặc khóa đã đổi). " +
          "Hãy thu hồi mật khẩu ứng dụng cũ, tạo mật khẩu mới và lưu lại trong Quản trị > Cài đặt Email."
      : "[crypto] Không giải mã được mật khẩu SMTP với bất kỳ khóa nào (SMTP_ENCRYPTION_KEY / GEMINI_API_KEY / khóa mặc định cũ)."
  );
  return null;
}
