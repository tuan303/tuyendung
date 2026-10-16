import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { deleteApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAdminServices } from '../src/server/firebaseAdmin';
import { pathToFileURL } from 'node:url';
import { addApplication, getApplications, updateApplication, deleteApplication, saveUploadedFile, getUploadedFile, deleteUploadedFile, importApplicationRecord } from '../src/server/applicationsStore';
import { MAX_CV_BYTES, validateApplicationCreate, validateApplicationUpdate, validateUploadedFile } from '../src/server/validation';

const candidate = { name: 'Ứng viên thử nghiệm', phone: '+84 912 345 678', email: 'synthetic@example.invalid', jobId: 'job_test', jobTitle: 'Vị trí thử nghiệm' };
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const pdfData = `data:application/pdf;base64,${pdf.toString('base64')}`;

// A small, synthetic ZIP builder. No customer files or network services are used.
function docxZip(extraNames: string[] = [], declaredSize?: number, relationships = '<Relationships/>'): Buffer {
  const names = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', ...extraNames];
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let position = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(name === '[Content_Types].xml' ? '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' : name.endsWith('.rels') ? relationships : '<document/>');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(declaredSize ?? data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(position, 42);
    locals.push(local, nameBytes, data);
    central.push(header, nameBytes);
    position += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const ending = Buffer.alloc(22);
  ending.writeUInt32LE(0x06054b50, 0);
  ending.writeUInt16LE(names.length, 8);
  ending.writeUInt16LE(names.length, 10);
  ending.writeUInt32LE(directory.length, 12);
  ending.writeUInt32LE(position, 16);
  return Buffer.concat([...locals, directory, ending]);
}

function runChild(code: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Storage child failed: ${errors}`)));
  });
}

test('application field validation rejects privilege and malformed input', () => {
  assert.equal(validateApplicationCreate(candidate, { publicSubmission: true }).email, candidate.email);
  assert.equal(validateApplicationCreate({ ...candidate, email: '' }).email, '');
  assert.equal(validateApplicationCreate({ ...candidate, dob: '29/02/2000' }).dob, '2000-02-29');
  assert.equal(validateApplicationCreate({ ...candidate, dob: '2000-02-29' }).dob, '2000-02-29');
  assert.throws(() => validateApplicationCreate({ ...candidate, dob: '29/02/2001' }));
  for (const email of ['one,two@example.invalid', 'one;two@example.invalid', '"one"@example.invalid', 'one\\two@example.invalid', 'one..two@example.invalid', 'one@example.invalid,second@example.invalid']) {
    assert.throws(() => validateApplicationCreate({ ...candidate, email }), email);
  }
  for (const [field, value] of Object.entries({ id: 'chosen-id', createdAt: new Date().toISOString(), admin: true, name: {}, phone: ['0900000000'], email: 'mail\r\nBcc: victim@invalid', status: 'admin', jobId: '../jobs/anything', notes: 'a'.repeat(10001), dob: '2025-02-30' })) {
    assert.throws(() => validateApplicationCreate({ ...candidate, [field]: value }), error => (error as { status?: number }).status === 400, field);
  }
  assert.throws(() => validateApplicationCreate({ ...candidate, email: '' }, { publicSubmission: true }));
  assert.throws(() => validateApplicationCreate({ ...candidate, status: 'passed' }, { publicSubmission: true }));
  assert.throws(() => validateApplicationCreate({ ...candidate, notes: 'internal' }, { publicSubmission: true }));
  assert.throws(() => validateApplicationCreate({ ...candidate, cvUrl: 'https://example.invalid/cv.pdf' }, { publicSubmission: true }));
  assert.throws(() => validateApplicationUpdate({ createdAt: '2000-01-01' }));
  assert.throws(() => validateApplicationUpdate({}));
  assert.throws(() => validateApplicationUpdate({ name: '' }));
  assert.throws(() => validateApplicationUpdate({ cvUrl: 'javascript:alert(1)' }));
  assert.throws(() => validateApplicationUpdate({ cvUrl: 'https://user:pass@example.invalid/cv.pdf' }));
  assert.throws(() => validateApplicationUpdate({ cvUrl: 'https://example.invalid/a', downloadURL: 'https://example.invalid/b' }));
  assert.deepEqual(validateApplicationUpdate({ status: 'reviewed', notes: 'Đã xem\nĐang xử lý' }), { status: 'reviewed', notes: 'Đã xem\nĐang xử lý' });
});

test('CV validation accepts matching PDF/DOCX and rejects active or malformed uploads', () => {
  assert.equal(validateUploadedFile('CV.pdf', pdfData).contentType, 'application/pdf');
  assert.equal(validateUploadedFile('CV.docx', docxZip().toString('base64')).extension, 'docx');
  const invalid: Array<[string, string]> = [
    ['CV.html', Buffer.from('<script>alert(1)</script>').toString('base64')],
    ['CV.pdf', Buffer.from('<html><script>alert(1)</script>').toString('base64')],
    ['CV.pdf', `data:text/html;base64,${pdf.toString('base64')}`],
    ['../CV.pdf', pdfData],
    ['CV.svg', pdfData],
    ['CV.docx', pdfData],
    ['CV.pdf', 'not base64!'],
    ['CV.pdf', 'Zh=='],
    ['CV.pdf', Buffer.alloc(MAX_CV_BYTES + 1).toString('base64')],
    ['CV.docx', Buffer.from('PK\x03\x04fake zip').toString('base64')],
    ['CV.docx', docxZip(['word/vbaProject.bin']).toString('base64')],
    ['CV.docx', docxZip(['word/disguised.dat'], undefined, '<Relationship Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="/word/disguised.dat"/>').toString('base64')],
    ['CV.docx', docxZip(['../outside.xml']).toString('base64')],
    ['CV.docx', docxZip(['word/embeddings/oleObject.bin']).toString('base64')],
    ['CV.docx', docxZip(['word/document.xml']).toString('base64')],
    ['CV.docx', docxZip([], 100 * 1024 * 1024).toString('base64')],
  ];
  for (const [fileName, data] of invalid) assert.throws(() => validateUploadedFile(fileName, data), error => (error as { status?: number }).status === 400, fileName);
});

test('isolated file store serializes mutations, preserves damaged data, and serves private CVs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuyendung-synthetic-storage-'));
  const previous = { store: process.env.APPLICATION_STORE, dir: process.env.APPLICATION_DATA_DIR, node: process.env.NODE_ENV, vercel: process.env.VERCEL };
  process.env.APPLICATION_STORE = 'file';
  process.env.APPLICATION_DATA_DIR = directory;
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  try {
    await t.test('48 concurrent inserts retain every uniquely generated record', async () => {
      const results = await Promise.all(Array.from({ length: 48 }, (_, index) => addApplication({ ...candidate, name: `Synthetic ${index}` })));
      const stored = await getApplications();
      assert.equal(stored.length, 48);
      assert.equal(new Set(stored.map(record => record.id)).size, 48);
      assert.match(results[0].id, /^[0-9a-f-]{36}$/);
      assert.equal(new Date(results[0].createdAt).toISOString(), results[0].createdAt);
    });
    await t.test('separate Node processes retain every concurrent insert', async () => {
      await fs.mkdir(path.join(directory, '.applications.lock'));
      await fs.writeFile(path.join(directory, '.applications.lock', 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'synthetic-abandoned-lock' }));
      const storeUrl = pathToFileURL(path.resolve('src/server/applicationsStore.ts')).href;
      const childCode = `import { addApplication } from ${JSON.stringify(storeUrl)}; await Promise.all(Array.from({length:8},(_,i)=>addApplication({...${JSON.stringify(candidate)},name:'Cross process '+i})));`;
      await Promise.all(Array.from({ length: 4 }, () => runChild(childCode, { ...process.env })));
      assert.equal((await getApplications()).length, 80);
    });
    await t.test('updates preserve server identity and date; deletes work consistently', async () => {
      const before = (await getApplications())[0];
      const updated = await updateApplication(before.id, { status: 'contacted', notes: 'Đã liên hệ' });
      assert.equal(updated?.createdAt, before.createdAt);
      assert.equal(updated?.id, before.id);
      assert.equal(updated?.status, 'contacted');
      await assert.rejects(updateApplication(before.id, { id: 'attacker' }));
      await assert.rejects(addApplication({ ...candidate, createdAt: '2000-01-01T00:00:00.000Z' }));
      assert.equal(await updateApplication('missing-id', { status: 'new' }), null);
      assert.equal(await deleteApplication(before.id), true);
      assert.equal(await deleteApplication(before.id), false);
      assert.equal((await getApplications()).length, 79);
    });
    await t.test('CV uses private opaque paths and deletion removes its bytes', async () => {
      const url = await saveUploadedFile('CV thử nghiệm.pdf', pdfData);
      assert.match(url, /^\/api\/uploads\/[0-9a-f-]{36}\.pdf$/);
      const key = url.split('/').pop()!;
      const file = await getUploadedFile(key);
      assert.deepEqual(file?.buffer, pdf);
      assert.equal(file?.fileName, 'CV thử nghiệm.pdf');
      assert.equal(file?.contentType, 'application/pdf');
      assert.equal(await getUploadedFile('../applications.json'), null);
      assert.equal(await getUploadedFile('%2e%2e%2fapplications.json'), null);
      await deleteUploadedFile('/api/uploads/../applications.json');
      assert.equal((await getApplications()).length, 79);
      const record = await addApplication({ ...candidate, cvUrl: url, fileName: 'CV thử nghiệm.pdf' });
      assert.equal(await deleteApplication(record.id), true);
      assert.equal(await getUploadedFile(key), null);
    });
    await t.test('shared private CV survives until its last reference is deleted', async () => {
      const url = await saveUploadedFile('Shared CV.pdf', pdfData);
      const key = url.split('/').pop()!;
      const first = await addApplication({ ...candidate, cvUrl: url, name: 'First synthetic shared candidate' });
      const second = await addApplication({ ...candidate, cvUrl: url, name: 'Second synthetic shared candidate' });
      await deleteUploadedFile(url); // Cleanup cannot erase an attached/shared file.
      assert.deepEqual((await getUploadedFile(key))?.buffer, pdf);
      assert.equal(await deleteApplication(first.id), true);
      assert.deepEqual((await getUploadedFile(key))?.buffer, pdf);
      assert.equal(await deleteApplication(second.id), true);
      assert.equal(await getUploadedFile(key), null);
      await assert.rejects(addApplication({ ...candidate, cvUrl: url }), error => (error as { status?: number }).status === 400);
    });
    await t.test('replacing a CV keeps shared old bytes until the last reference changes', async () => {
      const previousUrl = await saveUploadedFile('Previous CV.pdf', pdfData);
      const nextUrl = await saveUploadedFile('Next CV.pdf', pdfData);
      const first = await addApplication({ ...candidate, cvUrl: previousUrl });
      const second = await addApplication({ ...candidate, cvUrl: previousUrl });
      await updateApplication(first.id, { cvUrl: nextUrl });
      assert.ok(await getUploadedFile(previousUrl.split('/').pop()!));
      await updateApplication(second.id, { cvUrl: '' });
      assert.equal(await getUploadedFile(previousUrl.split('/').pop()!), null);
      await deleteApplication(first.id);
      assert.equal(await getUploadedFile(nextUrl.split('/').pop()!), null);
      await deleteApplication(second.id);
    });
    await t.test('invalid upload never creates a stored CV', async () => {
      const before = await fs.readdir(path.join(directory, 'uploads'));
      await assert.rejects(saveUploadedFile('CV.pdf', Buffer.from('<svg onload=alert(1)>').toString('base64')));
      assert.deepEqual(await fs.readdir(path.join(directory, 'uploads')), before);
    });
    await t.test('parse failures remain failures and original bytes are preserved', async () => {
      const file = path.join(directory, 'applications.json');
      const corrupt = '{invalid synthetic fixture';
      await fs.writeFile(file, corrupt);
      await assert.rejects(getApplications());
      await assert.rejects(addApplication(candidate));
      assert.equal(await fs.readFile(file, 'utf8'), corrupt);
      await fs.writeFile(file, '{"not":"an array"}');
      await assert.rejects(addApplication(candidate));
      assert.equal(await fs.readFile(file, 'utf8'), '{"not":"an array"}');
    });
    await t.test('file mode is forbidden in production or Vercel and never falls back', async () => {
      await assert.rejects(importApplicationRecord(candidate, { id: 'synthetic-import', createdAt: '2020-01-01T00:00:00.000Z' }));
      process.env.NODE_ENV = 'production';
      await assert.rejects(getApplications(), error => (error as { status?: number }).status === 503);
      process.env.NODE_ENV = 'test';
      process.env.VERCEL = '1';
      await assert.rejects(addApplication(candidate), error => (error as { status?: number }).status === 503);
      delete process.env.VERCEL;
    });
  } finally {
    for (const [key, value] of Object.entries({ APPLICATION_STORE: previous.store, APPLICATION_DATA_DIR: previous.dir, NODE_ENV: previous.node, VERCEL: previous.vercel })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});


test('Firestore transactions preserve shared CV references and idempotent migration without network', async () => {
  const envKeys = ['APPLICATION_STORE', 'NODE_ENV', 'VERCEL', 'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET'];
  const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
  process.env.APPLICATION_STORE = 'firestore';
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  process.env.FIREBASE_PROJECT_ID = 'demo-synthetic-storage';
  process.env.FIREBASE_STORAGE_BUCKET = 'demo-synthetic-storage.invalid';
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo-synthetic-storage', client_email: 'synthetic@demo-synthetic-storage.iam.gserviceaccount.com', private_key: privateKey });
  let restore: (() => void) | undefined;
  try {
    // Real SDK objects are created with an ephemeral synthetic key, then their
    // IO methods are replaced before any operation. No credentials or network
    // requests are used by this in-memory transaction simulator.
    const { db } = getAdminServices();
    const app = getApps().find(candidate => candidate.name === 'tuyendung-server')!;
    const storage = getStorage(app);
    const savedCollection = db.collection;
    const savedTransaction = db.runTransaction;
    const savedBucket = storage.bucket;
    const documents = new Map<string, Record<string, unknown>>();
    const files = new Map<string, { buffer: Buffer; metadata: Record<string, unknown> }>();
    let queue: Promise<unknown> = Promise.resolve();
    const clone = <T,>(value: T): T => structuredClone(value);
    const snapshot = (ref: any) => ({ id: ref.id, exists: documents.has(ref.path), data: () => documents.has(ref.path) ? clone(documents.get(ref.path)!) : undefined });
    const ref = (collection: string, id: string): any => ({
      id, path: `${collection}/${id}`,
      get: async () => snapshot(ref(collection, id)),
      create: async (value: Record<string, unknown>) => { assert.equal(documents.has(`${collection}/${id}`), false); documents.set(`${collection}/${id}`, clone(value)); },
      update: async (value: Record<string, unknown>) => { assert.ok(documents.has(`${collection}/${id}`)); documents.set(`${collection}/${id}`, { ...documents.get(`${collection}/${id}`), ...clone(value) }); },
    });
    (db as any).collection = (name: string) => ({
      doc: (id: string) => ref(name, id),
      get: async () => ({ docs: [...documents.keys()].filter(key => key.startsWith(`${name}/`)).map(key => snapshot(ref(name, key.slice(name.length + 1)))) }),
    });
    (db as any).runTransaction = (handler: (transaction: any) => Promise<unknown>) => {
      const operation = queue.catch(() => {}).then(async () => {
        let wrote = false;
        const writes: Array<() => void> = [];
        const transaction = {
          get: async (reference: any) => { assert.equal(wrote, false, 'Every Firestore read must precede writes'); return snapshot(reference); },
          create: (reference: any, value: Record<string, unknown>) => { wrote = true; writes.push(() => { assert.equal(documents.has(reference.path), false); documents.set(reference.path, clone(value)); }); },
          update: (reference: any, value: Record<string, unknown>) => { wrote = true; writes.push(() => { assert.ok(documents.has(reference.path)); documents.set(reference.path, { ...documents.get(reference.path), ...clone(value) }); }); },
          delete: (reference: any) => { wrote = true; writes.push(() => { documents.delete(reference.path); }); },
        };
        const result = await handler(transaction);
        for (const write of writes) write();
        return result;
      });
      queue = operation;
      return operation;
    };
    (storage as any).bucket = () => ({ file: (key: string) => ({
      save: async (buffer: Buffer, options: { metadata: Record<string, unknown> }) => { files.set(key, { buffer: Buffer.from(buffer), metadata: clone(options.metadata) }); },
      getMetadata: async () => { const value = files.get(key); if (!value) throw Object.assign(new Error('Missing synthetic file'), { code: 404 }); return [clone(value.metadata)]; },
      download: async () => { const value = files.get(key); if (!value) throw Object.assign(new Error('Missing synthetic file'), { code: 404 }); return [Buffer.from(value.buffer)]; },
      delete: async () => { files.delete(key); },
    }) });
    restore = () => { (db as any).collection = savedCollection; (db as any).runTransaction = savedTransaction; (storage as any).bucket = savedBucket; };

    const url = await saveUploadedFile('Synthetic Firestore CV.pdf', pdfData);
    const key = url.split('/').pop()!;
    const registryPath = `privateUploads/${key}`;
    assert.equal(documents.get(registryPath)?.references, 0);
    const created = await Promise.all(Array.from({ length: 12 }, () => addApplication({ ...candidate, cvUrl: url })));
    assert.equal(documents.get(registryPath)?.references, 12);
    await deleteUploadedFile(url);
    assert.ok(await getUploadedFile(key));
    await Promise.all(created.slice(0, 11).map(record => deleteApplication(record.id)));
    assert.equal(documents.get(registryPath)?.references, 1);
    assert.ok(await getUploadedFile(key));
    await deleteApplication(created[11].id);
    assert.equal(documents.get(registryPath)?.state, 'deleted');
    assert.equal(await getUploadedFile(key), null);
    await assert.rejects(addApplication({ ...candidate, cvUrl: url }));

    const importUrl = await saveUploadedFile('Synthetic imported CV.pdf', pdfData);
    const importKey = importUrl.split('/').pop()!;
    const input = { ...candidate, cvUrl: importUrl };
    const metadata = { id: 'app_legacy_synthetic_123', createdAt: '2020-02-29T07:00:00+07:00' };
    const imported = await importApplicationRecord(input, metadata);
    assert.equal(imported.created, true);
    assert.equal(imported.record.id, metadata.id);
    assert.equal(imported.record.createdAt, '2020-02-29T00:00:00.000Z');
    assert.equal(documents.get(`privateUploads/${importKey}`)?.references, 1);
    const repeated = await importApplicationRecord({ ...input, name: 'Cannot overwrite existing import' }, metadata);
    assert.equal(repeated.created, false);
    assert.equal(repeated.record.name, candidate.name);
    assert.equal(documents.get(`privateUploads/${importKey}`)?.references, 1);
    await assert.rejects(importApplicationRecord(input, { ...metadata, id: '../bad-id' }));
    await assert.rejects(importApplicationRecord(input, { ...metadata, createdAt: '2025-02-30T00:00:00Z' }));
    await assert.rejects(importApplicationRecord(input, { ...metadata, createdAt: 'bad date' }));
    await assert.rejects(importApplicationRecord({ ...input, id: 'user-supplied' }, metadata));
    assert.equal((await getApplications()).length, 1);
    await updateApplication(metadata.id, { cvUrl: '' });
    assert.equal(await getUploadedFile(importKey), null);
    await deleteApplication(metadata.id);
    assert.equal((await getApplications()).length, 0);
  } finally {
    restore?.();
    const app = getApps().find(candidate => candidate.name === 'tuyendung-server');
    if (app) await deleteApp(app);
    for (const [key, value] of previousEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
