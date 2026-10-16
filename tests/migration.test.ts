import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prepareLegacyRecord, prepareLegacySource } from '../scripts/migrate-applications';
import { MAX_CV_BYTES } from '../src/server/validation';

test('migration preserves trusted legacy identity/date but never accepts them as public write fields', () => {
  const row = { id: 'old_application_1', createdAt: '2026-10-15T09:25:00Z', name: 'Synthetic Only', phone: '0900000000', email: '', jobTitle: 'Math', dob: '29/02/2000', status: 'reviewed' };
  const result = prepareLegacyRecord(row, 0);
  assert.equal(result.metadata.id, row.id);
  assert.equal(result.metadata.createdAt, '2026-10-15T09:25:00.000Z');
  assert.equal(result.input.dob, '2000-02-29');
  assert.ok(!Object.hasOwn(result.input, 'id')); assert.ok(!Object.hasOwn(result.input, 'createdAt'));
  assert.deepEqual(prepareLegacyRecord({ ...row, id: 'unusable/id' }, 0).metadata, prepareLegacyRecord({ ...row, id: 'unusable/id' }, 0).metadata);
  assert.throws(() => prepareLegacyRecord({ ...row, createdAt: 'invalid' }, 0));
  assert.throws(() => prepareLegacyRecord({ ...row, name: { invalid: true } }, 0));
});

test('migration preflight keeps CV paths rather than accumulating file payloads', async () => {
  const fixture = await makeLegacyFixture(20);
  try {
    const originalJson = await fs.readFile(path.join(fixture.directory, 'applications.json'), 'utf8');
    const result = await prepareLegacySource(fixture.directory);
    assert.deepEqual(result.summary, { records: 22, localCvs: 20, externalCvsRetained: 1 });
    assert.equal(result.prepared[0].metadata.id, 'synthetic_0');
    assert.deepEqual(result.prepared[0].cv, { name: 'Synthetic CV.pdf', sourcePath: path.join(fixture.directory, 'uploads', 'synthetic.pdf') });
    assert.ok(result.prepared.every(row => !row.cv || !Object.hasOwn(row.cv, 'data')));
    assert.ok(JSON.stringify(result.prepared).length < 20000, 'Prepared rows retain only small metadata regardless of CV payload count');
    assert.equal(await fs.readFile(path.join(fixture.directory, 'applications.json'), 'utf8'), originalJson);
    assert.deepEqual(await fs.readFile(path.join(fixture.directory, 'uploads', 'synthetic.pdf')), fixture.pdf);
  } finally { await fs.rm(fixture.directory, { recursive: true, force: true }); }
});

test('migration dry-run does not require Firebase credentials and leaves all source bytes unchanged', async () => {
  const fixture = await makeLegacyFixture(2);
  try {
    const originalJson = await fs.readFile(path.join(fixture.directory, 'applications.json'), 'utf8');
    const result = await runMigrationCli(fixture.directory);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { mode: 'dry-run', records: 4, localCvs: 2, externalCvsRetained: 1, writes: 0 });
    assert.equal(result.stderr, '');
    assert.equal(await fs.readFile(path.join(fixture.directory, 'applications.json'), 'utf8'), originalJson);
    assert.deepEqual(await fs.readFile(path.join(fixture.directory, 'uploads', 'synthetic.pdf')), fixture.pdf);
    assert.deepEqual((await fs.readdir(fixture.directory)).sort(), ['applications.json', 'uploads']);
  } finally { await fs.rm(fixture.directory, { recursive: true, force: true }); }
});

test('migration rejects an invalid source before any import and preserves the source for repair', async () => {
  const fixture = await makeLegacyFixture(1);
  try {
    const sourceFile = path.join(fixture.directory, 'applications.json');
    const originalRows = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
    await fs.writeFile(sourceFile, JSON.stringify([originalRows[0], originalRows[0]]));
    await assert.rejects(prepareLegacySource(fixture.directory), /trùng/);
    await fs.writeFile(sourceFile, JSON.stringify([{ ...originalRows[0], cvUrl: '/api/uploads/%2e%2e%2foutside.pdf' }]));
    await assert.rejects(prepareLegacySource(fixture.directory), /hồ sơ #1/);
    await fs.writeFile(sourceFile, JSON.stringify([originalRows[0]]));
    await fs.writeFile(path.join(fixture.directory, 'uploads', 'synthetic.pdf'), '<html><script>not a CV</script></html>');
    await assert.rejects(prepareLegacySource(fixture.directory), /hồ sơ #1/);
    const handle = await fs.open(path.join(fixture.directory, 'uploads', 'synthetic.pdf'), 'w');
    try { await handle.truncate(MAX_CV_BYTES + 1); } finally { await handle.close(); }
    await assert.rejects(prepareLegacySource(fixture.directory), /hồ sơ #1/);
    assert.equal((await fs.stat(path.join(fixture.directory, 'uploads', 'synthetic.pdf'))).size, MAX_CV_BYTES + 1);
    assert.deepEqual(JSON.parse(await fs.readFile(sourceFile, 'utf8')), [originalRows[0]]);
    const result = await runMigrationCli(fixture.directory);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Không nhập dữ liệu/);
    assert.ok(!result.stderr.includes(originalRows[0].name), 'Failure logs must not expose candidate data');
  } finally { await fs.rm(fixture.directory, { recursive: true, force: true }); }
});

async function makeLegacyFixture(localCount: number) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuyendung-synthetic-migration-'));
  await fs.mkdir(path.join(directory, 'uploads'));
  const pdf = Buffer.from('%PDF-1.7\n' + ' '.repeat(200000) + '\n%%EOF\n');
  await fs.writeFile(path.join(directory, 'uploads', 'synthetic.pdf'), pdf);
  const row = { createdAt: '2020-01-02T00:00:00.000Z', name: 'Synthetic candidate only', phone: '0900000000', email: '', jobTitle: 'Synthetic position', fileName: 'Synthetic CV.pdf', status: 'new' };
  const rows = Array.from({ length: localCount }, (_, index) => ({ ...row, id: `synthetic_${index}`, cvUrl: '/backend-api/uploads/synthetic.pdf' }));
  rows.push({ ...row, id: 'synthetic_external', cvUrl: 'https://example.invalid/retained-cv.pdf' });
  rows.push({ ...row, id: 'synthetic_no_cv', cvUrl: '' });
  await fs.writeFile(path.join(directory, 'applications.json'), JSON.stringify(rows));
  return { directory, pdf };
}

async function runMigrationCli(directory: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate-applications.ts', '--source-dir', directory], {
      cwd: process.cwd(),
      env: { ...process.env, APPLICATION_STORE: 'file', FIREBASE_SERVICE_ACCOUNT: 'invalid-synthetic-value-dry-run-must-not-initialize-admin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}
