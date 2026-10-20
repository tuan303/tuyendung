import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { AggregateField } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";
import { getStorageMode, isValidApplicationId, StoreUnavailableError } from "./applicationsStore.js";
import { CV_MIME_TYPES, MAX_CV_BYTES } from "./validation.js";

// File CV ứng viên gửi trực tiếp trên form (data: URL, tối đa 3 MB) được lưu lại để quản trị viên
// xem ngay trong trang Quản trị (GET /api/applications/:id/cv). CHỈ máy chủ đọc/ghi.
//
//  - Firestore:  applicationFiles/{appId}               = { fileName, mimeType, size, chunkCount, chunkSize, createdAt }
//                applicationFiles/{appId}/chunks/{index} = { index, data: Bytes }
//    Mỗi tài liệu Firestore tối đa 1 MiB nên nội dung file được chia thành các mảnh 768 KiB,
//    ghi cùng một batch (hoặc lưu đủ, hoặc không lưu gì).
//  - Dev (không có FIREBASE_SERVICE_ACCOUNT): data/cv-files/{appId}.bin + data/cv-files/{appId}.json.
//  - Vercel thiếu cấu hình: StoreUnavailableError.
//
// Giới hạn lưu (hasRoomForCvFile): form nộp hồ sơ là công khai, mỗi file tới 3 MB, còn gói Firestore
// miễn phí (Spark) chỉ có 1 GiB cho TOÀN BỘ dữ liệu. Vượt giới hạn thì file không được lưu nữa,
// CV vẫn tới bộ phận Tuyển dụng dưới dạng file đính kèm email (cvStorage "email").

export interface CvFile {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

/** The stored file is incomplete or inconsistent (missing chunk, wrong size). */
export class CvFileCorruptError extends Error {
  status = 500;
  constructor(message = "File CV lưu trên hệ thống bị lỗi hoặc chưa lưu đầy đủ. Vui lòng liên hệ ứng viên để nhận lại CV.") {
    super(message);
    this.name = "CvFileCorruptError";
  }
}

const META_COLLECTION = "applicationFiles";
const CHUNKS_SUBCOLLECTION = "chunks";
export const CV_CHUNK_SIZE = 786432; // 768 KiB, well under Firestore's 1 MiB document limit
const LOCAL_DIR = path.resolve(process.cwd(), "data", "cv-files");

/** At most this many CV files are stored per rolling 24 hours (soft limit: concurrent requests may overshoot slightly). */
export const MAX_STORED_CV_FILES_PER_DAY = 150;
/** At most this many bytes of CV files are stored in total (Firestore Spark plan: 1 GiB for all data). */
export const MAX_STORED_CV_TOTAL_BYTES = 600 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CvFileMeta {
  fileName: string;
  mimeType: string;
  size: number;
}

function requireMode(): "firestore" | "local-file" {
  const mode = getStorageMode();
  if (mode === "unconfigured") throw new StoreUnavailableError();
  return mode;
}

function toBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value && typeof (value as any).toUint8Array === "function") return Buffer.from((value as any).toUint8Array());
  return null;
}

function readMeta(raw: any): CvFileMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const size = raw.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 0) return null;
  return {
    fileName: typeof raw.fileName === "string" ? raw.fileName : "",
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
    size,
  };
}

// ---------- local-file backend (dev only) ----------

function localPaths(appId: string) {
  // appId is checked with isValidApplicationId ([A-Za-z0-9_-] only) before this is called: no path traversal.
  return {
    bin: path.join(LOCAL_DIR, `${appId}.bin`),
    meta: path.join(LOCAL_DIR, `${appId}.json`),
  };
}

async function writeAtomic(file: string, data: Buffer | string): Promise<void> {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

// ---------- public API ----------

/**
 * Whether one more CV file of `size` bytes may be stored: fewer than MAX_STORED_CV_FILES_PER_DAY files
 * stored in the last 24 hours, and at most MAX_STORED_CV_TOTAL_BYTES in total afterwards.
 * Firestore: two aggregation queries (count + sum), i.e. a couple of reads instead of reading the files.
 */
export async function hasRoomForCvFile(size: number): Promise<boolean> {
  const mode = requireMode();
  const since = new Date(Date.now() - DAY_MS).toISOString(); // createdAt is an ISO string: sorts by time

  if (mode === "firestore") {
    const files = getAdminDb()!.collection(META_COLLECTION);
    const [recent, total] = await Promise.all([
      files.where("createdAt", ">=", since).count().get(),
      files.aggregate({ bytes: AggregateField.sum("size") }).get(),
    ]);
    const storedBytes = Number(total.data().bytes) || 0;
    return recent.data().count < MAX_STORED_CV_FILES_PER_DAY && storedBytes + size <= MAX_STORED_CV_TOTAL_BYTES;
  }

  let names: string[];
  try {
    names = await fs.readdir(LOCAL_DIR);
  } catch (error: any) {
    if (error?.code === "ENOENT") return size <= MAX_STORED_CV_TOTAL_BYTES;
    throw error;
  }
  let recentCount = 0;
  let storedBytes = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue; // temp files end with ".tmp"
    try {
      const raw = JSON.parse(await fs.readFile(path.join(LOCAL_DIR, name), "utf-8"));
      const meta = readMeta(raw);
      if (!meta) continue;
      storedBytes += meta.size;
      if (typeof raw.createdAt === "string" && raw.createdAt >= since) recentCount++;
    } catch {
      // unreadable/partial metadata: not counted
    }
  }
  return recentCount < MAX_STORED_CV_FILES_PER_DAY && storedBytes + size <= MAX_STORED_CV_TOTAL_BYTES;
}

/** Stores the CV file of an application (replaces an existing one). */
export async function saveCvFile(appId: string, file: CvFile): Promise<void> {
  if (!isValidApplicationId(appId)) throw new Error("Mã hồ sơ không hợp lệ.");
  if (!Buffer.isBuffer(file.content) || file.content.length === 0) throw new Error("File CV trống.");
  if (file.content.length > MAX_CV_BYTES) throw new Error("File CV quá lớn.");
  const mode = requireMode();
  const size = file.content.length;
  const createdAt = new Date().toISOString();

  if (mode === "firestore") {
    const db = getAdminDb()!;
    const metaRef = db.collection(META_COLLECTION).doc(appId);
    const chunkCount = Math.ceil(size / CV_CHUNK_SIZE);
    const batch = db.batch();
    for (let index = 0; index < chunkCount; index++) {
      const data = file.content.subarray(index * CV_CHUNK_SIZE, Math.min(size, (index + 1) * CV_CHUNK_SIZE));
      batch.set(metaRef.collection(CHUNKS_SUBCOLLECTION).doc(String(index)), { index, data });
    }
    batch.set(metaRef, {
      fileName: file.fileName,
      mimeType: file.mimeType,
      size,
      chunkCount,
      chunkSize: CV_CHUNK_SIZE,
      createdAt,
    });
    await batch.commit();
    return;
  }

  const paths = localPaths(appId);
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  // Content first, metadata last: the .json only exists once the .bin is complete.
  await writeAtomic(paths.bin, file.content);
  await writeAtomic(paths.meta, JSON.stringify({ fileName: file.fileName, mimeType: file.mimeType, size, createdAt }, null, 2));
}

/** The stored CV file of an application, or null when none is stored. Throws CvFileCorruptError if incomplete. */
export async function getCvFile(appId: string): Promise<CvFile | null> {
  if (!isValidApplicationId(appId)) return null;
  const mode = requireMode();

  if (mode === "firestore") {
    const db = getAdminDb()!;
    const metaRef = db.collection(META_COLLECTION).doc(appId);
    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) return null;
    const raw = metaSnap.data();
    const meta = readMeta(raw);
    const chunkCount = raw?.chunkCount;
    if (!meta || typeof chunkCount !== "number" || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 64) {
      throw new CvFileCorruptError();
    }
    const refs = Array.from({ length: chunkCount }, (_, index) => metaRef.collection(CHUNKS_SUBCOLLECTION).doc(String(index)));
    const snaps = await db.getAll(...refs); // returned in the order of refs, i.e. ordered by index
    const parts: Buffer[] = [];
    snaps.forEach((snap, index) => {
      const data = snap.exists ? snap.data() : undefined;
      const part = toBuffer(data?.data);
      if (!data || data.index !== index || !part) throw new CvFileCorruptError();
      parts.push(part);
    });
    const content = Buffer.concat(parts);
    if (content.length !== meta.size) throw new CvFileCorruptError();
    return { fileName: meta.fileName, mimeType: meta.mimeType, content };
  }

  const paths = localPaths(appId);
  let meta: CvFileMeta | null;
  try {
    meta = readMeta(JSON.parse(await fs.readFile(paths.meta, "utf-8")));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new CvFileCorruptError();
    throw error;
  }
  if (!meta) throw new CvFileCorruptError();
  let content: Buffer;
  try {
    content = await fs.readFile(paths.bin);
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new CvFileCorruptError();
    throw error;
  }
  if (content.length !== meta.size) throw new CvFileCorruptError();
  return { fileName: meta.fileName, mimeType: meta.mimeType, content };
}

/** Deletes the stored CV file of an application. No error when there is none. */
export async function deleteCvFile(appId: string): Promise<void> {
  if (!isValidApplicationId(appId)) return;
  const mode = requireMode();

  if (mode === "firestore") {
    const db = getAdminDb()!;
    const metaRef = db.collection(META_COLLECTION).doc(appId);
    const chunkRefs = await metaRef.collection(CHUNKS_SUBCOLLECTION).listDocuments();
    const batch = db.batch();
    for (const ref of chunkRefs) batch.delete(ref);
    batch.delete(metaRef);
    await batch.commit();
    return;
  }

  const paths = localPaths(appId);
  // Metadata first, so a half-deleted file is never served as complete.
  await fs.rm(paths.meta, { force: true });
  await fs.rm(paths.bin, { force: true });
}

// ---------- HTTP response helpers ----------

/** Only PDF/DOCX are ever served with their own type; anything else is a download. */
export function cvResponseContentType(mimeType: string): string {
  return Object.prototype.hasOwnProperty.call(CV_MIME_TYPES, mimeType) ? mimeType : "application/octet-stream";
}

/** Content-Disposition: inline with an ASCII fallback name plus the UTF-8 name (RFC 6266 / RFC 5987). */
export function cvContentDisposition(fileName: string, fallbackBase = "CV"): string {
  const name =
    fileName
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      // Lone surrogates would make encodeURIComponent throw.
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "_")
      .trim() || fallbackBase;
  const ascii =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\%;]/g, "_")
      .trim()
      .slice(0, 200) || fallbackBase;
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
