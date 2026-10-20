import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getAdminDb, hasAdminCredentials, isVercel } from "./firebaseAdmin.js";
import { isAllowedDriveUrl } from "./validation.js";

// "email_failed" = the CV file was sent inline but the HR email could not be sent, so the file is lost.
export type CvStorage = "drive" | "email" | "email_failed" | "link" | "none";
const CV_STORAGE_VALUES: readonly CvStorage[] = ["drive", "email", "email_failed", "link", "none"];
export type StorageMode = "firestore" | "local-file" | "unconfigured";

export interface ApplicationRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  dob: string;
  phone: string;
  email: string;
  cvUrl: string;
  fileName: string;
  cvStorage: CvStorage;
  status: string; // 'new' | 'reviewed' | 'contacted' | 'interview' | 'passed' | 'rejected'
  notes: string;
  createdAt: string; // ISO date string
}

export type NewApplicationInput = Omit<ApplicationRecord, "id" | "createdAt" | "status" | "notes"> & {
  id?: string;
  status?: string;
  notes?: string;
  createdAt?: string;
};

export interface ApplicationUpdate {
  status?: string;
  notes?: string;
}

/** Thrown when no persistent storage is available (Vercel without FIREBASE_SERVICE_ACCOUNT). */
export class StoreUnavailableError extends Error {
  status = 503;
  constructor(
    message = "Máy chủ chưa được cấu hình lưu trữ hồ sơ (thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT). Vui lòng liên hệ quản trị viên."
  ) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

const COLLECTION = "applications";
const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "applications.json");
const VALID_ID = /^[A-Za-z0-9_-]{1,200}$/;

let warnedLocalFile = false;

export function getStorageMode(): StorageMode {
  if (hasAdminCredentials()) return "firestore";
  if (isVercel()) return "unconfigured";
  return "local-file";
}

export function isValidApplicationId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID.test(id);
}

export function generateApplicationId(): string {
  return `app_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---------- normalization (tolerates legacy records) ----------

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toIsoDate(value: unknown, fallback?: string): string {
  try {
    if (typeof value === "string" && value) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toISOString();
    }
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
    if (value && typeof value === "object") {
      const v = value as any;
      if (typeof v.toDate === "function") return v.toDate().toISOString(); // Firestore Timestamp
      const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
      if (seconds !== null) {
        const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : typeof v._nanoseconds === "number" ? v._nanoseconds : 0;
        return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
      }
    }
  } catch {
    // fall through
  }
  return fallback || new Date(0).toISOString();
}

export function normalizeApplication(id: string, raw: any, fallbackCreatedAt?: string): ApplicationRecord {
  const data = raw && typeof raw === "object" ? raw : {};
  const cvUrl = str(data.cvUrl) || str(data.downloadURL);
  let cvStorage: CvStorage;
  if (CV_STORAGE_VALUES.includes(data.cvStorage)) {
    cvStorage = data.cvStorage;
  } else if (cvUrl) {
    cvStorage = isAllowedDriveUrl(cvUrl) ? "drive" : "link";
  } else {
    cvStorage = "none";
  }
  return {
    id: str(data.id) || id,
    jobId: str(data.jobId),
    jobTitle: str(data.jobTitle) || str(data.position) || "Vị trí tuyển dụng",
    name: str(data.name) || "Ứng viên",
    dob: str(data.dob),
    phone: str(data.phone),
    email: str(data.email),
    cvUrl,
    fileName: str(data.fileName),
    cvStorage,
    status: str(data.status) || "new",
    notes: str(data.notes),
    createdAt: toIsoDate(data.createdAt, fallbackCreatedAt),
  };
}

function sortNewestFirst(apps: ApplicationRecord[]): ApplicationRecord[] {
  return apps.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

function buildRecord(input: NewApplicationInput): ApplicationRecord {
  return {
    id: input.id && isValidApplicationId(input.id) ? input.id : generateApplicationId(),
    jobId: input.jobId || "",
    jobTitle: input.jobTitle,
    name: input.name,
    dob: input.dob || "",
    phone: input.phone,
    email: input.email || "",
    cvUrl: input.cvUrl || "",
    fileName: input.fileName || "",
    cvStorage: input.cvStorage,
    status: input.status || "new",
    notes: input.notes || "",
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

// ---------- local-file backend (dev only) ----------

let fileQueue: Promise<unknown> = Promise.resolve();

/** Serializes read-modify-write cycles on the JSON file. */
function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileQueue.then(fn, fn);
  fileQueue = run.catch(() => undefined);
  return run;
}

function warnLocalFile() {
  if (warnedLocalFile) return;
  warnedLocalFile = true;
  console.warn(
    "[applicationsStore] CẢNH BÁO: chưa cấu hình FIREBASE_SERVICE_ACCOUNT — hồ sơ đang lưu vào file data/applications.json (chỉ dùng cho dev, KHÔNG dùng trên Vercel)."
  );
}

async function readLocalFile(): Promise<ApplicationRecord[]> {
  try {
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any, index: number) => normalizeApplication(str(item?.id) || `legacy_${index}`, item));
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalFile(apps: ApplicationRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(apps, null, 2), "utf-8");
  await fs.rename(tmp, DATA_FILE);
}

// ---------- public API ----------

function requireDbOrLocal() {
  const mode = getStorageMode();
  if (mode === "unconfigured") throw new StoreUnavailableError();
  if (mode === "local-file") warnLocalFile();
  return mode === "firestore" ? getAdminDb() : null;
}

export async function listApplications(): Promise<ApplicationRecord[]> {
  const db = requireDbOrLocal();
  if (db) {
    const snapshot = await db.collection(COLLECTION).get();
    // The Firestore document id always wins over a stored "id" field, so PATCH/DELETE target the right doc.
    const apps = snapshot.docs.map((doc) => ({
      ...normalizeApplication(doc.id, doc.data(), doc.createTime ? doc.createTime.toDate().toISOString() : undefined),
      id: doc.id,
    }));
    return sortNewestFirst(apps);
  }
  return withFileLock(async () => sortNewestFirst(await readLocalFile()));
}

/** Number of applications. In Firestore this is a count() aggregation (1 read per 1000 docs), not N reads. */
export async function countApplications(): Promise<number> {
  const db = requireDbOrLocal();
  if (db) {
    const snapshot = await db.collection(COLLECTION).count().get();
    return snapshot.data().count;
  }
  return withFileLock(async () => (await readLocalFile()).length);
}

export async function createApplication(input: NewApplicationInput): Promise<ApplicationRecord> {
  const db = requireDbOrLocal();
  const record = buildRecord(input);
  if (db) {
    await db.collection(COLLECTION).doc(record.id).set(record);
    return record;
  }
  return withFileLock(async () => {
    const apps = await readLocalFile();
    apps.unshift(record);
    await writeLocalFile(apps);
    return record;
  });
}

export async function updateApplication(id: string, updates: ApplicationUpdate): Promise<ApplicationRecord | null> {
  if (!isValidApplicationId(id)) return null;
  const db = requireDbOrLocal();
  const patch: ApplicationUpdate = {};
  if (typeof updates.status === "string") patch.status = updates.status;
  if (typeof updates.notes === "string") patch.notes = updates.notes;

  if (db) {
    const ref = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      tx.update(ref, { ...patch });
      return {
        ...normalizeApplication(
          snap.id,
          { ...snap.data(), ...patch },
          snap.createTime ? snap.createTime.toDate().toISOString() : undefined
        ),
        id: snap.id,
      };
    });
  }

  return withFileLock(async () => {
    const apps = await readLocalFile();
    const index = apps.findIndex((a) => a.id === id);
    if (index === -1) return null;
    apps[index] = { ...apps[index], ...patch };
    await writeLocalFile(apps);
    return apps[index];
  });
}

/** Server-side only: changes where the CV of an application is recorded as stored. */
export async function setApplicationCvStorage(id: string, cvStorage: CvStorage): Promise<boolean> {
  if (!isValidApplicationId(id) || !CV_STORAGE_VALUES.includes(cvStorage)) return false;
  const db = requireDbOrLocal();
  if (db) {
    await db.collection(COLLECTION).doc(id).update({ cvStorage });
    return true;
  }
  return withFileLock(async () => {
    const apps = await readLocalFile();
    const index = apps.findIndex((a) => a.id === id);
    if (index === -1) return false;
    apps[index] = { ...apps[index], cvStorage };
    await writeLocalFile(apps);
    return true;
  });
}

export async function deleteApplication(id: string): Promise<boolean> {
  if (!isValidApplicationId(id)) return false;
  const db = requireDbOrLocal();
  if (db) {
    const ref = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      tx.delete(ref);
      return true;
    });
  }

  return withFileLock(async () => {
    const apps = await readLocalFile();
    const filtered = apps.filter((a) => a.id !== id);
    if (filtered.length === apps.length) return false;
    await writeLocalFile(filtered);
    return true;
  });
}
