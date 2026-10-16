import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MAX_CV_BYTES, validateApplicationCreate, validateUploadedFile, type ApplicationWrite } from '../src/server/validation';
import { getAdminServices } from '../src/server/firebaseAdmin';
import { importApplicationRecord, saveUploadedFile, deleteUploadedFile } from '../src/server/applicationsStore';

export function prepareLegacyRecord(raw: Record<string, unknown>, index: number) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Hồ sơ #${index + 1} không hợp lệ.`);
  const known = ['jobId', 'jobTitle', 'name', 'dob', 'phone', 'email', 'cvUrl', 'downloadURL', 'fileName', 'status', 'notes'];
  const data = Object.fromEntries(known.filter(key => raw[key] !== undefined && raw[key] !== null).map(key => [key, raw[key]]));
  const input = validateApplicationCreate(data);
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(raw.id) ? raw.id :
    'legacy_' + createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 40);
  const timestamp = raw.createdAt && typeof raw.createdAt === 'object' && 'seconds' in raw.createdAt ?
    new Date(Number((raw.createdAt as { seconds: unknown }).seconds) * 1000) : new Date(String(raw.createdAt || ''));
  if (Number.isNaN(timestamp.getTime())) throw new Error(`Hồ sơ #${index + 1} có thời gian không hợp lệ.`);
  return { input, metadata: { id, createdAt: timestamp.toISOString() } };
}

/** Validate one source file at a time; retain paths rather than all CV payloads. */
export async function prepareLegacySource(source: string) {
  const sourceDir = path.resolve(source);
  const sourceFile = path.join(sourceDir, 'applications.json');
  const sourceStat = await fs.stat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.size > 20 * 1024 * 1024) throw new Error('Tệp nguồn vượt giới hạn kiểm tra 20 MiB.');
  const body = await fs.readFile(sourceFile, 'utf8');
  if (Buffer.byteLength(body) > 20 * 1024 * 1024) throw new Error('Tệp nguồn vượt giới hạn kiểm tra 20 MiB.');
  const rows = JSON.parse(body);
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Nguồn phải là mảng tối đa 10.000 hồ sơ.');
  const prepared: Array<{ input: ApplicationWrite; metadata: { id: string; createdAt: string }; cv?: { name: string; sourcePath: string } }> = [];
  let externalCvs = 0;
  for (let index = 0; index < rows.length; index++) {
    try {
      const row = rows[index];
      const legacyUrl = row.cvUrl || row.downloadURL || '';
      // Legacy local paths need a private upload, not an externally accessible link.
      const local = typeof legacyUrl === 'string' && /^\/(?:api|backend-api)\/uploads\//.test(legacyUrl);
      const mapped = prepareLegacyRecord({ ...row, ...(local ? { cvUrl: '', downloadURL: '' } : {}) }, index);
      let cv: { name: string; sourcePath: string } | undefined;
      if (local) {
        const name = decodeURIComponent(legacyUrl.split('/').at(-1));
        if (name !== path.basename(name) || /[\\/\0]/.test(name)) throw new Error('Đường dẫn CV nguồn không hợp lệ.');
        const sourcePath = path.join(sourceDir, 'uploads', name);
        const cvStat = await fs.stat(sourcePath);
        if (!cvStat.isFile() || cvStat.size === 0 || cvStat.size > MAX_CV_BYTES) throw new Error('CV nguồn vượt giới hạn dung lượng.');
        const buffer = await fs.readFile(sourcePath);
        const originalName = typeof row.fileName === 'string' && row.fileName ? row.fileName : name;
        validateUploadedFile(originalName, buffer.toString('base64'));
        cv = { name: originalName, sourcePath };
      } else if (legacyUrl) externalCvs++;
      prepared.push({ ...mapped, cv });
    } catch { throw new Error(`Kiểm tra hồ sơ #${index + 1} thất bại. Không nhập dữ liệu; đối chiếu schema/ngày/CV nguồn trong bản sao riêng.`); }
  }
  if (new Set(prepared.map(row => row.metadata.id)).size !== prepared.length) throw new Error('Nguồn có mã hồ sơ trùng. Không nhập dữ liệu.');
  const summary = { records: prepared.length, localCvs: prepared.filter(row => row.cv).length, externalCvsRetained: externalCvs };
  return { prepared, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const source = value('--source-dir');
  if (!source) throw new Error('Cần --source-dir /đường/dẫn/bản-sao-data. Mặc định chỉ kiểm tra; --apply mới nhập dữ liệu.');
  const { prepared, summary } = await prepareLegacySource(source);
  if (!args.includes('--apply')) { console.log(JSON.stringify({ mode: 'dry-run', ...summary, writes: 0 })); return; }
  if (process.env.APPLICATION_STORE === 'file') throw new Error('Nhập dữ liệu yêu cầu APPLICATION_STORE=firestore.');
  const project = getAdminServices().auth.app.options.projectId;
  if (value('--confirm-project') !== project) throw new Error('Cần --confirm-project trùng chính xác FIREBASE_PROJECT_ID để nhập.');
  let created = 0; let skipped = 0;
  for (const row of prepared) {
    const exists = await getAdminServices().db.collection('applications').doc(row.metadata.id).get();
    if (exists.exists) { skipped++; continue; }
    let privateUrl = '';
    try {
      if (row.cv) {
        const cvStat = await fs.stat(row.cv.sourcePath);
        if (!cvStat.isFile() || cvStat.size === 0 || cvStat.size > MAX_CV_BYTES) throw new Error('CV nguồn đã thay đổi hoặc vượt giới hạn dung lượng.');
        const buffer = await fs.readFile(row.cv.sourcePath);
        // saveUploadedFile validates again in case the backup changed after preflight.
        privateUrl = await saveUploadedFile(row.cv.name, buffer.toString('base64'));
      }
      const result = await importApplicationRecord({ ...row.input, ...(privateUrl ? { cvUrl: privateUrl, downloadURL: privateUrl } : {}) }, row.metadata);
      if (result.created) created++; else { skipped++; if (privateUrl) await deleteUploadedFile(privateUrl); }
    } catch {
      if (privateUrl) await deleteUploadedFile(privateUrl);
      throw new Error(`Đã nhập ${created}, bỏ qua ${skipped}; thao tác tiếp theo thất bại. Bản sao nguồn còn nguyên. Chạy lại để tiếp tục, không ghi đè hồ sơ đã có.`);
    }
  }
  console.log(JSON.stringify({ mode: 'applied', ...summary, created, skipped, sourceFilesRemoved: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Không thể nhập dữ liệu.'); process.exitCode = 1; });
}
