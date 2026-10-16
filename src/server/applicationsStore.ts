import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getAdminServices } from './firebaseAdmin';
import { APPLICATION_STATUSES, PRIVATE_UPLOAD_KEY, privateUploadKey, validateApplicationCreate, validateApplicationUpdate, validateUploadedFile, type ApplicationStatus } from './validation';

export interface ApplicationRecord {
  id: string;
  jobId?: string;
  jobTitle: string;
  name: string;
  dob?: string;
  phone: string;
  email: string;
  cvUrl?: string;
  downloadURL?: string;
  fileName?: string;
  status: ApplicationStatus;
  notes?: string;
  createdAt: string;
}

const COLLECTION = 'applications';
const OBJECT_PREFIX = 'private-applications/';
const UPLOAD_COLLECTION = 'privateUploads';
const localQueues = new Map<string, Promise<unknown>>();

function localDataDir(): string | null {
  const mode = process.env.APPLICATION_STORE;
  if (mode && mode !== 'file' && mode !== 'firestore') throw Object.assign(new Error('APPLICATION_STORE không hợp lệ.'), { status: 503 });
  if (mode !== 'file') return null;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw Object.assign(new Error('Kho tệp chỉ được sử dụng khi phát triển cục bộ.'), { status: 503 });
  return path.resolve(process.env.APPLICATION_DATA_DIR || path.join(process.cwd(), 'data'));
}

function validateId(id: string): void {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw Object.assign(new Error('Mã hồ sơ không hợp lệ.'), { status: 400 });
}

function normalizeDate(value: unknown): string {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : new Date(value as string);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Hồ sơ có thời gian tạo không hợp lệ.');
  return date.toISOString();
}

function normalizeRecord(value: unknown, documentId?: string): ApplicationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu hồ sơ bị hỏng.');
  const raw = value as Record<string, unknown>;
  const id = documentId || raw.id;
  if (typeof id !== 'string') throw new Error('Dữ liệu hồ sơ thiếu mã định danh.');
  validateId(id);
  const text = (field: string): string => typeof raw[field] === 'string' ? raw[field] as string : '';
  return {
    id, jobId: text('jobId'), jobTitle: text('jobTitle'), name: text('name'),
    dob: text('dob'), phone: text('phone'), email: text('email'),
    cvUrl: text('cvUrl') || text('downloadURL'), downloadURL: text('downloadURL') || text('cvUrl'),
    fileName: text('fileName'), notes: text('notes'),
    status: (APPLICATION_STATUSES as readonly string[]).includes(text('status')) ? text('status') as ApplicationStatus : 'new',
    createdAt: normalizeDate(raw.createdAt),
  };
}

async function readLocal(dataDir: string): Promise<ApplicationRecord[]> {
  let content: string;
  try { content = await fs.readFile(path.join(dataDir, 'applications.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) throw new Error('Kho hồ sơ phải chứa một danh sách.');
  const records = parsed.map(record => normalizeRecord(record));
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Kho hồ sơ có mã định danh trùng lặp.');
  return records;
}

async function atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporaryPath, 'wx', 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporaryPath, filePath);
    const directory = await fs.open(path.dirname(filePath), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await fs.rm(temporaryPath, { force: true }); }
}

async function acquireLocalLock(dataDir: string): Promise<() => Promise<void>> {
  const lockPath = path.join(dataDir, '.applications.lock');
  const token = randomUUID();
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      try { await fs.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 }); }
      catch (error) { await fs.rm(lockPath, { recursive: true, force: true }); throw error; }
      return async () => {
        const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8'));
        if (owner.token === token) await fs.rm(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Serialize stale-lock recovery as well: two waiting processes must never
      // remove a fresh lock after racing to reclaim the same abandoned owner.
      const recoveryPath = path.join(dataDir, '.applications.lock-recovery');
      let recovering = false;
      try {
        await fs.mkdir(recoveryPath, { mode: 0o700 });
        recovering = true;
        const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8'));
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); }
          catch (pidError) {
            if ((pidError as NodeJS.ErrnoException).code === 'ESRCH') await fs.rm(lockPath, { recursive: true, force: true });
          }
        }
      } catch (readError) {
        if (!['ENOENT', 'EEXIST'].includes((readError as NodeJS.ErrnoException).code || '') && !(readError instanceof SyntaxError)) throw readError;
      } finally { if (recovering) await fs.rm(recoveryPath, { recursive: true, force: true }); }
      if (Date.now() > deadline) throw Object.assign(new Error('Kho hồ sơ đang bận. Vui lòng thử lại.'), { status: 503 });
      await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 30)));
    }
  }
}

async function mutateLocal<T>(dataDir: string, mutation: (apps: ApplicationRecord[]) => T | Promise<T>, afterCommit?: (apps: ApplicationRecord[], result: T) => Promise<void>): Promise<T> {
  const previous = localQueues.get(dataDir) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const release = await acquireLocalLock(dataDir);
    try {
      const apps = await readLocal(dataDir);
      const result = await mutation(apps);
      await atomicWrite(path.join(dataDir, 'applications.json'), JSON.stringify(apps, null, 2));
      if (afterCommit) await afterCommit(apps, result);
      return result;
    } finally { await release(); }
  });
  localQueues.set(dataDir, task);
  try { return await task; } finally { if (localQueues.get(dataDir) === task) localQueues.delete(dataDir); }
}

function applicationCvUrl(record: Pick<ApplicationRecord, 'cvUrl' | 'downloadURL'>): string {
  return record.cvUrl || record.downloadURL || '';
}

function hasLocalReference(apps: ApplicationRecord[], url: string): boolean {
  return apps.some(record => applicationCvUrl(record) === url);
}

async function ensureLocalUploadAvailable(dataDir: string, url: string): Promise<void> {
  const key = privateUploadKey(url);
  if (!key) return;
  try {
    await fs.access(path.join(dataDir, 'uploads', key));
    await fs.access(path.join(dataDir, 'uploads', `${key}.json`));
  } catch { throw Object.assign(new Error('CV không tồn tại trong kho riêng.'), { status: 400 }); }
}

async function removeLocalUpload(dataDir: string, url: string): Promise<void> {
  const key = privateUploadKey(url);
  if (!key) return;
  try {
    await fs.rm(path.join(dataDir, 'uploads', key), { force: true });
    await fs.rm(path.join(dataDir, 'uploads', `${key}.json`), { force: true });
  } catch { console.error('Không thể xóa tệp CV riêng tư sau khi cập nhật hồ sơ.'); }
}

/** Transactional reference counts prevent an add/delete race from breaking shared CVs. */
async function changeUploadReferences(transaction: Transaction, db: Firestore, previousUrl: string, nextUrl: string): Promise<string | null> {
  const previousKey = privateUploadKey(previousUrl);
  const nextKey = privateUploadKey(nextUrl);
  if (previousKey === nextKey) return null;
  const keys = [...new Set([previousKey, nextKey].filter((key): key is string => !!key))];
  const snapshots = await Promise.all(keys.map(key => transaction.get(db.collection(UPLOAD_COLLECTION).doc(key))));
  const writes: Array<{ key: string; references: number; state: 'active' | 'deleting' }> = [];
  let unreferencedUrl: string | null = null;
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const snapshot = snapshots[index];
    const metadata = snapshot.data();
    const references = metadata?.references;
    if (key === nextKey && (!snapshot.exists || metadata?.state !== 'active')) throw Object.assign(new Error('CV không tồn tại trong kho riêng.'), { status: 400 });
    // Unknown old metadata is retained rather than risking a legacy/shared file.
    if (!snapshot.exists && key === previousKey) continue;
    if (!Number.isSafeInteger(references) || references < 0) throw new Error('Siêu dữ liệu CV không hợp lệ.');
    const count = references + (key === nextKey ? 1 : -1);
    if (count < 0) throw new Error('Số tham chiếu CV không hợp lệ.');
    const state = count === 0 && key === previousKey ? 'deleting' as const : 'active' as const;
    writes.push({ key, references: count, state });
    if (state === 'deleting') unreferencedUrl = previousUrl;
  }
  // Firestore transactions must finish every read before starting writes.
  for (const write of writes) transaction.update(db.collection(UPLOAD_COLLECTION).doc(write.key), { references: write.references, state: write.state });
  return unreferencedUrl;
}

export async function getApplications(): Promise<ApplicationRecord[]> {
  const dataDir = localDataDir();
  const records = dataDir ? await readLocal(dataDir) : (await getAdminServices().db.collection(COLLECTION).get()).docs.map(doc => normalizeRecord(doc.data(), doc.id));
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addApplication(input: Partial<ApplicationRecord>): Promise<ApplicationRecord> {
  const data = validateApplicationCreate(input);
  const cvUrl = data.cvUrl || data.downloadURL || '';
  const record: ApplicationRecord = {
    id: randomUUID(), jobId: data.jobId || '', jobTitle: data.jobTitle, name: data.name,
    dob: data.dob || '', phone: data.phone, email: data.email,
    cvUrl, downloadURL: cvUrl, fileName: data.fileName || '', status: data.status || 'new',
    notes: data.notes || '', createdAt: new Date().toISOString(),
  };
  const dataDir = localDataDir();
  if (dataDir) await mutateLocal(dataDir, async apps => {
    await ensureLocalUploadAvailable(dataDir, cvUrl);
    apps.unshift(record);
  });
  else {
    const { db } = getAdminServices();
    await db.runTransaction(async transaction => {
      await changeUploadReferences(transaction, db, '', cvUrl);
      transaction.create(db.collection(COLLECTION).doc(record.id), record);
    });
  }
  return record;
}

/** Trusted migration only. HTTP APIs must continue using addApplication. */
export async function importApplicationRecord(input: Partial<ApplicationRecord>, metadata: { id: string; createdAt: string }): Promise<{ record: ApplicationRecord; created: boolean }> {
  if (localDataDir()) throw Object.assign(new Error('Chỉ được nhập dữ liệu vào kho Firestore.'), { status: 400 });
  const data = validateApplicationCreate(input);
  if (!metadata || typeof metadata !== 'object') throw Object.assign(new Error('Siêu dữ liệu nhập hồ sơ không hợp lệ.'), { status: 400 });
  validateId(metadata.id);
  if (typeof metadata.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.createdAt)) throw Object.assign(new Error('Thời gian tạo hồ sơ nhập không hợp lệ.'), { status: 400 });
  let createdAt: string;
  try {
    const calendarDay = metadata.createdAt.slice(0, 10);
    if (new Date(`${calendarDay}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDay) throw new Error('Invalid calendar day');
    createdAt = normalizeDate(metadata.createdAt);
  }
  catch { throw Object.assign(new Error('Thời gian tạo hồ sơ nhập không hợp lệ.'), { status: 400 }); }
  const cvUrl = data.cvUrl || data.downloadURL || '';
  const record: ApplicationRecord = {
    id: metadata.id, jobId: data.jobId || '', jobTitle: data.jobTitle, name: data.name,
    dob: data.dob || '', phone: data.phone, email: data.email,
    cvUrl, downloadURL: cvUrl, fileName: data.fileName || '', status: data.status || 'new',
    notes: data.notes || '', createdAt,
  };
  const { db } = getAdminServices();
  const reference = db.collection(COLLECTION).doc(record.id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) return { record: normalizeRecord(snapshot.data(), record.id), created: false };
    await changeUploadReferences(transaction, db, '', cvUrl);
    transaction.create(reference, record);
    return { record, created: true };
  });
}

export async function updateApplication(id: string, input: Partial<ApplicationRecord>): Promise<ApplicationRecord | null> {
  validateId(id);
  const updates = validateApplicationUpdate(input);
  if (Object.hasOwn(updates, 'cvUrl') || Object.hasOwn(updates, 'downloadURL')) {
    const cvUrl = updates.cvUrl ?? updates.downloadURL ?? '';
    updates.cvUrl = cvUrl;
    updates.downloadURL = cvUrl;
  }
  const dataDir = localDataDir();
  if (dataDir) {
    let previousUrl = '';
    return mutateLocal(dataDir, async apps => {
      const index = apps.findIndex(app => app.id === id);
      if (index < 0) return null;
      previousUrl = applicationCvUrl(apps[index]);
      const updated = { ...apps[index], ...updates };
      await ensureLocalUploadAvailable(dataDir, applicationCvUrl(updated));
      apps[index] = updated;
      return updated;
    }, async (apps, updated) => {
      if (updated && previousUrl !== applicationCvUrl(updated) && !hasLocalReference(apps, previousUrl)) await removeLocalUpload(dataDir, previousUrl);
    });
  }
  const { db } = getAdminServices();
  const reference = db.collection(COLLECTION).doc(id);
  const result = await db.runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    if (!existing.exists) return { record: null, cleanupUrl: null };
    const previous = normalizeRecord(existing.data(), id);
    const record = { ...previous, ...updates };
    const cleanupUrl = await changeUploadReferences(transaction, db, applicationCvUrl(previous), applicationCvUrl(record));
    transaction.update(reference, updates);
    return { record, cleanupUrl };
  });
  if (result.cleanupUrl) await deleteUploadedFile(result.cleanupUrl);
  return result.record;
}

export async function deleteApplication(id: string): Promise<boolean> {
  validateId(id);
  const dataDir = localDataDir();
  if (dataDir) return mutateLocal(dataDir, apps => {
    const index = apps.findIndex(app => app.id === id);
    return index < 0 ? null : apps.splice(index, 1)[0];
  }, async (apps, removed) => {
    if (removed && !hasLocalReference(apps, applicationCvUrl(removed))) await removeLocalUpload(dataDir, applicationCvUrl(removed));
  }).then(removed => removed !== null);
  const { db } = getAdminServices();
  const reference = db.collection(COLLECTION).doc(id);
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return { deleted: false, cleanupUrl: null };
    const removed = normalizeRecord(snapshot.data(), id);
    const cleanupUrl = await changeUploadReferences(transaction, db, applicationCvUrl(removed), '');
    transaction.delete(reference);
    return { deleted: true, cleanupUrl };
  });
  if (result.cleanupUrl) await deleteUploadedFile(result.cleanupUrl);
  return result.deleted;
}

export async function saveUploadedFile(fileName: string, dataUrl: string): Promise<string> {
  const upload = validateUploadedFile(fileName, dataUrl);
  const key = `${randomUUID()}.${upload.extension}`;
  const dataDir = localDataDir();
  if (dataDir) {
    const uploadDir = path.join(dataDir, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    try {
      await atomicWrite(path.join(uploadDir, key), upload.buffer);
      await atomicWrite(path.join(uploadDir, `${key}.json`), JSON.stringify({ fileName: upload.fileName, contentType: upload.contentType }));
    } catch (error) {
      await fs.rm(path.join(uploadDir, key), { force: true });
      await fs.rm(path.join(uploadDir, `${key}.json`), { force: true });
      throw error;
    }
  } else {
    const { db, bucket } = getAdminServices();
    const file = bucket.file(`${OBJECT_PREFIX}${key}`);
    await file.save(upload.buffer, {
      resumable: false,
      validation: 'crc32c',
      metadata: { contentType: upload.contentType, cacheControl: 'private, no-store', metadata: { originalFileName: upload.fileName } },
    });
    try { await db.collection(UPLOAD_COLLECTION).doc(key).create({ references: 0, state: 'active', createdAt: new Date().toISOString() }); }
    catch (error) { await file.delete({ ignoreNotFound: true }).catch(() => {}); throw error; }
  }
  return `/api/uploads/${key}`;
}

export async function getUploadedFile(key: string): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  if (typeof key !== 'string' || !PRIVATE_UPLOAD_KEY.test(key)) return null;
  const dataDir = localDataDir();
  try {
    let buffer: Buffer;
    let fileName: string;
    if (dataDir) {
      buffer = await fs.readFile(path.join(dataDir, 'uploads', key));
      const metadata = JSON.parse(await fs.readFile(path.join(dataDir, 'uploads', `${key}.json`), 'utf8'));
      fileName = metadata.fileName;
    } else {
      const file = getAdminServices().bucket.file(`${OBJECT_PREFIX}${key}`);
      const [metadata] = await file.getMetadata();
      const [download] = await file.download();
      buffer = download;
      fileName = metadata.metadata?.originalFileName as string;
    }
    // Revalidate stored data before returning it, including any legacy metadata.
    const upload = validateUploadedFile(fileName, buffer.toString('base64'));
    if (!key.endsWith(`.${upload.extension}`)) throw new Error('Đuôi tệp lưu trữ không khớp.');
    return { buffer: upload.buffer, contentType: upload.contentType, fileName: upload.fileName };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { code?: number }).code === 404) return null;
    throw error;
  }
}

/** Delete only our opaque private upload paths; external CV links are never fetched. */
export async function deleteUploadedFile(url: string): Promise<void> {
  const key = privateUploadKey(url);
  if (!key) return;
  try {
    const dataDir = localDataDir();
    if (dataDir) {
      await mutateLocal(dataDir, () => undefined, async apps => {
        if (!hasLocalReference(apps, url)) await removeLocalUpload(dataDir, url);
      });
    } else {
      const { db, bucket } = getAdminServices();
      const reference = db.collection(UPLOAD_COLLECTION).doc(key);
      const canDelete = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const metadata = snapshot.data();
        // A missing record is left alone: ownership/reference state is unknown.
        if (!snapshot.exists || metadata?.references !== 0) return false;
        transaction.update(reference, { state: 'deleting' });
        return true;
      });
      if (canDelete) {
        await bucket.file(`${OBJECT_PREFIX}${key}`).delete({ ignoreNotFound: true });
        await reference.update({ state: 'deleted', deletedAt: new Date().toISOString() });
      }
    }
  } catch { console.error('Không thể xóa tệp CV riêng tư sau khi cập nhật hồ sơ.'); }
}
