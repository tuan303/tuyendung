import fs from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import { getAdminDb } from "./firebaseAdmin.js";
import { getStorageMode, StoreUnavailableError } from "./applicationsStore.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

/** Stored SMTP settings. `pass` is the ENCRYPTED password ("ivhex:cipherhex"). */
export interface StoredSmtpSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  recipient: string;
}

export interface SmtpConnection {
  host: string;
  port: string | number;
  user: string;
  pass: string; // plain text
}

const SETTINGS_COLLECTION = "settings";
const SETTINGS_DOC = "smtp";
const LOCAL_FILE = path.resolve(process.cwd(), "data", "smtp-settings.json");
const CACHE_TTL_MS = 60 * 1000;

let cache: { value: StoredSmtpSettings | null; at: number; mode: string } | null = null;

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeStored(raw: any): StoredSmtpSettings {
  return {
    host: str(raw?.host),
    port: str(raw?.port),
    user: str(raw?.user),
    pass: typeof raw?.pass === "string" ? raw.pass : "",
    recipient: str(raw?.recipient),
  };
}

/** Loads the stored SMTP settings (Firestore settings/smtp, or data/smtp-settings.json in dev). */
export async function loadSmtpSettings(options: { fresh?: boolean } = {}): Promise<StoredSmtpSettings | null> {
  const mode = getStorageMode();
  if (mode === "unconfigured") throw new StoreUnavailableError();
  if (!options.fresh && cache && cache.mode === mode && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let value: StoredSmtpSettings | null = null;
  if (mode === "firestore") {
    const snap = await getAdminDb()!.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    value = snap.exists ? normalizeStored(snap.data()) : null;
  } else {
    try {
      value = normalizeStored(JSON.parse(await fs.readFile(LOCAL_FILE, "utf-8")));
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      value = null;
    }
  }
  cache = { value, at: Date.now(), mode };
  return value;
}

/**
 * Saves SMTP settings. If `pass` is non-empty it is encrypted and replaces the stored one,
 * otherwise the stored encrypted password is kept.
 */
export async function saveSmtpSettings(input: {
  host: string;
  port: string;
  user: string;
  recipient: string;
  pass?: string;
}): Promise<void> {
  const mode = getStorageMode();
  if (mode === "unconfigured") throw new StoreUnavailableError();

  const update: Partial<StoredSmtpSettings> = {
    host: input.host,
    port: input.port,
    user: input.user,
    recipient: input.recipient,
  };
  if (input.pass) update.pass = encryptSecret(input.pass);

  if (mode === "firestore") {
    await getAdminDb()!.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).set(update, { merge: true });
  } else {
    const existing = await loadSmtpSettings({ fresh: true });
    const next: StoredSmtpSettings = { ...(existing || normalizeStored({})), ...update } as StoredSmtpSettings;
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await fs.writeFile(LOCAL_FILE, JSON.stringify(next, null, 2), "utf-8");
  }
  cache = null;
}

export function isSmtpComplete(s: StoredSmtpSettings | null): s is StoredSmtpSettings {
  return !!(s && s.host && s.port && s.user && s.pass && s.recipient);
}

/** Decrypts the stored password; null when missing or undecryptable. */
export function getStoredPassword(s: StoredSmtpSettings | null): string | null {
  if (!s || !s.pass) return null;
  return decryptSecret(s.pass);
}

export function createSmtpTransport(
  conn: SmtpConnection,
  timeouts: { connection?: number; greeting?: number; socket?: number } = {}
) {
  const port = parseInt(String(conn.port), 10);
  return nodemailer.createTransport({
    host: conn.host,
    port,
    secure: port === 465,
    auth: { user: conn.user, pass: conn.pass },
    connectionTimeout: timeouts.connection ?? 10000,
    greetingTimeout: timeouts.greeting ?? 10000,
    socketTimeout: timeouts.socket ?? 15000,
  });
}

/** Rejects with a timeout error if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(`${label}: quá thời gian chờ (${ms} ms)`);
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function mapSmtpError(error: any): string {
  if (error?.code === "EAUTH") {
    return "Lỗi xác thực: Sai email hoặc mật khẩu ứng dụng. Nếu dùng Gmail, hãy đảm bảo đã bật Mật khẩu ứng dụng (App Password).";
  }
  // nodemailer reports a refused connection as code "ESOCKET" with "connect ECONNREFUSED ..." in the message.
  if (error?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(String(error?.message || ""))) {
    return "Lỗi kết nối: Không thể kết nối tới máy chủ SMTP. Kiểm tra lại Host và Port.";
  }
  if (error?.code === "ETIMEDOUT") {
    return "Lỗi hết thời gian: Kết nối tới máy chủ SMTP quá lâu. Kiểm tra lại mạng hoặc Port.";
  }
  if (error?.syscall === "getaddrinfo" || error?.code === "EDNS" || error?.code === "ENOTFOUND") {
    return "Lỗi DNS: Không tìm thấy máy chủ SMTP. Kiểm tra lại Host.";
  }
  return error?.message || "Lỗi không xác định khi kết nối SMTP";
}

// ---------- HTML email ----------

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Removes CR/LF and other control chars so a value is safe in a single-line header. */
export function toHeaderText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

export interface ApplicationEmailInput {
  applicationId?: string | null;
  name: string;
  dob: string;
  phone: string;
  email: string;
  position: string;
  cvUrl?: string;
  attachmentName?: string;
  /**
   * The attached CV file is also being saved on the server (viewable in the admin page if that succeeds).
   * The email is sent before the result is known, so the note in the email is worded conditionally.
   */
  attachmentMayBeStored?: boolean;
}

export function buildApplicationEmail(input: ApplicationEmailInput): { subject: string; text: string; html: string } {
  const dob = input.dob || "Không cung cấp";
  const subject = toHeaderText(`[Ứng tuyển] ${input.position} - ${input.name}`).slice(0, 250);

  const cvLines: string[] = [];
  const cvHtml: string[] = [];
  if (input.cvUrl) {
    const privateNote = "Link riêng tư — mở bằng tài khoản Google đã được chia sẻ thư mục CV.";
    cvLines.push(`Link CV (Google Drive): ${input.cvUrl}`, `(${privateNote})`);
    cvHtml.push(
      `<p><strong>Link CV (Google Drive):</strong> <a href="${escapeHtml(input.cvUrl)}">${escapeHtml(input.cvUrl)}</a><br/>` +
        `<small><em>${escapeHtml(privateNote)}</em></small></p>`
    );
  }
  if (input.attachmentName) {
    cvLines.push(`File CV đính kèm trong email này: ${input.attachmentName}`);
    cvHtml.push(`<p><em>File CV đính kèm trong email này: ${escapeHtml(input.attachmentName)}</em></p>`);
    if (input.attachmentMayBeStored) {
      const storedNote =
        "Nếu hồ sơ hiển thị nút \"Xem CV\" trong trang Quản trị Tuyển dụng (mục Hồ sơ ứng tuyển), có thể xem file CV trực tiếp tại đó.";
      cvLines.push(storedNote);
      cvHtml.push(`<p><small><em>${escapeHtml(storedNote)}</em></small></p>`);
    }
  }
  if (!cvLines.length) {
    cvLines.push("(Ứng viên không gửi kèm CV)");
    cvHtml.push("<p><em>(Ứng viên không gửi kèm CV)</em></p>");
  }

  const infoLines = [
    `Họ và tên: ${input.name}`,
    `Ngày sinh: ${dob}`,
    `Điện thoại: ${input.phone}`,
    `Email: ${input.email}`,
    `Vị trí ứng tuyển: ${input.position}`,
  ];
  if (input.applicationId) infoLines.push(`Mã hồ sơ: ${input.applicationId}`);
  const text = [...infoLines, "", ...cvLines].join("\n");

  const html =
    `<h2>Thông tin ứng viên ứng tuyển</h2>` +
    `<p><strong>Họ và tên:</strong> ${escapeHtml(input.name)}</p>` +
    `<p><strong>Ngày sinh:</strong> ${escapeHtml(dob)}</p>` +
    `<p><strong>Điện thoại:</strong> ${escapeHtml(input.phone)}</p>` +
    `<p><strong>Email:</strong> ${escapeHtml(input.email)}</p>` +
    `<p><strong>Vị trí ứng tuyển:</strong> ${escapeHtml(input.position)}</p>` +
    (input.applicationId ? `<p><strong>Mã hồ sơ:</strong> ${escapeHtml(input.applicationId)}</p>` : "") +
    `<br/>` +
    cvHtml.join("");

  return { subject, text, html };
}
