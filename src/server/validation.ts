// Input validation helpers shared by the API routes.

export class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
  }
}

// Basic email check; also rejects characters that would let one field become several addresses.
export const EMAIL_RE = /^[^\s@,;:<>()[\]"\\]+@[^\s@,;:<>()[\]"\\]+\.[^\s@,;:<>()[\]"\\]{2,}$/;

/** Coerces to a trimmed single-line string (control chars replaced by spaces). */
export function singleLine(value: unknown): string {
  const s = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

/** Coerces to a trimmed multi-line string (keeps \n and \t, drops other control chars). */
export function multiLine(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  // eslint-disable-next-line no-control-regex
  return s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
}

export function requireField(value: string, label: string, max: number): string {
  if (!value) throw new ValidationError(`Vui lòng nhập ${label}.`);
  return checkLength(value, label, max);
}

export function checkLength(value: string, label: string, max: number): string {
  if (value.length > max) throw new ValidationError(`${label} quá dài (tối đa ${max} ký tự).`);
  return value;
}

export function checkEmail(value: string): string {
  if (!EMAIL_RE.test(value)) throw new ValidationError("Địa chỉ email không hợp lệ.");
  return value;
}

export const MAX_FILE_NAME_LENGTH = 300;

/** Cuts `value` to at most `max` UTF-16 code units without splitting a surrogate pair. */
export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, Math.max(0, max));
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** Makes a safe file name (no path separators / control chars), max 300 chars. */
export function sanitizeFileName(value: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "_").replace(/^\.+/, "").trim();
  return truncateText(cleaned, MAX_FILE_NAME_LENGTH);
}

/**
 * The file name with `extension` (e.g. ".pdf") at the end, still at most 300 chars: the name is cut
 * BEFORE the extension is appended, so the extension always matches the real file type.
 */
export function withFileExtension(fileName: string, extension: string): string {
  if (fileName.toLowerCase().endsWith(extension)) return fileName;
  const base = truncateText(fileName, MAX_FILE_NAME_LENGTH - extension.length).replace(/[.\s]+$/, "");
  return `${base || "CV"}${extension}`;
}

export function parseUrl(value: string): URL | null {
  if (!value || value.length > 2000) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Exactly the link shape the Apps Script returns for an uploaded file
// (DriveApp File.getUrl(): https://drive.google.com/file/d/<id>/view?usp=drivesdk).
// Other Google links (Docs, Forms, folders, ...) are NOT accepted as a "CV stored on Drive".
const DRIVE_FILE_URL_RE = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{20,200}\/view(?:\?usp=(?:drivesdk|sharing))?$/;

/** Accepts only a Google Drive file link of the form https://drive.google.com/file/d/<id>/view. */
export function isAllowedDriveUrl(value: string): boolean {
  return typeof value === "string" && value.length <= 2000 && DRIVE_FILE_URL_RE.test(value);
}

export function isHttpUrl(value: string): boolean {
  const u = parseUrl(value);
  return !!u && (u.protocol === "https:" || u.protocol === "http:");
}

export const CV_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export const MAX_CV_BYTES = 3 * 1024 * 1024;

export interface ParsedCvFile {
  mimeType: string;
  extension: string;
  content: Buffer;
}

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/**
 * Validates a data: URL CV (PDF/DOCX, decoded size <= 3 MB). Throws ValidationError (400/413).
 * Some browsers report .docx as application/octet-stream (no Office installed); in that case the
 * type is taken from the file name extension and still verified via the file signature below.
 */
export function parseCvDataUrl(dataUrl: string, fileName = ""): ParsedCvFile {
  const match = /^data:([^;,]*)((?:;[^;,]+)*);base64,/i.exec(dataUrl);
  if (!match) {
    throw new ValidationError("File CV không hợp lệ. Vui lòng chọn lại file PDF hoặc DOCX.");
  }
  let mimeType = match[1].trim().toLowerCase();
  if (GENERIC_MIME_TYPES.has(mimeType)) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf")) mimeType = "application/pdf";
    else if (lower.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  const extension = CV_MIME_TYPES[mimeType];
  if (!extension) {
    throw new ValidationError("Định dạng file không được hỗ trợ. Vui lòng gửi CV dạng PDF hoặc DOCX.");
  }
  const base64 = dataUrl.slice(match[0].length).replace(/\s+/g, "");
  // Rough pre-check before decoding to avoid allocating huge buffers.
  if (Math.floor((base64.length * 3) / 4) > MAX_CV_BYTES + 3) {
    throw new ValidationError("File CV quá lớn. Vui lòng chọn file nhỏ hơn 3 MB.", 413);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ValidationError("File CV không hợp lệ (dữ liệu bị lỗi). Vui lòng chọn lại file.");
  }
  const content = Buffer.from(base64, "base64");
  if (content.length === 0) {
    throw new ValidationError("File CV trống. Vui lòng chọn lại file.");
  }
  if (content.length > MAX_CV_BYTES) {
    throw new ValidationError("File CV quá lớn. Vui lòng chọn file nhỏ hơn 3 MB.", 413);
  }
  // Check the file really is what it claims to be.
  const looksValid =
    extension === ".pdf"
      ? content.subarray(0, 1024).includes("%PDF")
      : content.length > 4 && content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
  if (!looksValid) {
    throw new ValidationError("Nội dung file không đúng định dạng PDF/DOCX. Vui lòng kiểm tra lại file CV.");
  }
  return { mimeType, extension, content };
}
