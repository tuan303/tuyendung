import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApiApp, type ApiDependencies } from '../src/server/api';
import * as store from '../src/server/applicationsStore';
import { persistentRateLimiter } from '../src/server/security';
import { encryptSmtpPassword, decryptSmtpPassword, getSmtpSettings, smtpMetadata, resolvePublicSmtpAddress } from '../src/server/smtp';

const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64');
const submission = { name: 'Synthetic Candidate', dob: '29/02/2000', phone: '0900000000', email: 'audit@example.invalid',
  position: 'Untrusted display title', jobId: 'math', fileName: 'synthetic.pdf', fileData: pdf };
const adminData = { name: 'Synthetic Manual', phone: '0900000001', email: '', jobId: 'math', jobTitle: 'Math' };
const auth = { Authorization: 'Bearer admin' };

async function fixture(overrides: Partial<ApiDependencies>, run: (context: { base: string; directory: string }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'recruitment-api-'));
  process.env.APPLICATION_STORE = 'file'; process.env.APPLICATION_DATA_DIR = directory;
  process.env.NODE_ENV = 'test'; process.env.APP_URL = 'https://recruitment.example.invalid'; delete process.env.VERCEL;
  const app = createApiApp({
    verifyToken: async token => {
      if (token === 'admin') return { uid: 'audit-admin', admin: true };
      if (token === 'verified') return { uid: 'audit-verified', email: 'tuan303@gmail.com', email_verified: true };
      if (token === 'unverified') return { uid: 'audit-unverified', email: 'tuan303@gmail.com', email_verified: false };
      if (token === 'user') return { uid: 'audit-user', email: 'ordinary@example.invalid', email_verified: true };
      throw new Error('revoked or invalid token');
    },
    limiter: { consume: async () => true },
    resolveJob: async id => id === 'math' ? { id: 'math', title: 'Canonical Math', isHidden: false } : id === 'hidden' ? { id, title: 'Hidden', isHidden: true } : null,
    notifyApplication: async () => false,
    ...overrides,
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { await run({ base: `http://127.0.0.1:${address.port}`, directory }); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
}
const request = async (base: string, url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => {
  const response = await fetch(base + url, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { /* binary or empty */ }
  return { response, text, data };
};

test('every management method and alias requires authentication before storage access', async () => {
  await fixture({}, async ({ base }) => {
    for (const prefix of ['/api', '/backend-api']) {
      for (const [url, method, body] of [['/applications', 'GET', undefined], ['/applications', 'POST', adminData], ['/applications/missing', 'PATCH', { status: 'passed' }], ['/applications/missing', 'DELETE', undefined], ['/smtp-settings', 'GET', undefined], ['/smtp-settings', 'PUT', {}], ['/test-smtp', 'POST', undefined], ['/uploads/not-a-file.pdf', 'GET', undefined]] as const) {
        const result = await request(base, prefix + url, method, body);
        assert.equal(result.response.status, 401, `${prefix}${url} ${method}`);
      }
    }
  });
});

test('invalid/revoked token is 401, ordinary/unverified user 403, verified allowlist and admin claim work', async () => {
  await fixture({}, async ({ base }) => {
    for (const [token, status] of [['revoked', 401], ['user', 403], ['unverified', 403], ['verified', 200], ['admin', 200]] as const) {
      assert.equal((await request(base, '/api/applications', 'GET', undefined, { Authorization: `Bearer ${token}` })).response.status, status);
    }
  });
});

test('public receipt requires real persistence, canonical job identity, strict CV and protected attachment download', async () => {
  await fixture({}, async ({ base }) => {
    const created = await request(base, '/api/send-email', 'POST', submission);
    assert.equal(created.response.status, 201); assert.ok(created.data.applicationId); assert.equal(created.data.emailDispatched, false);
    const listed = await request(base, '/api/applications', 'GET', undefined, auth);
    const record = listed.data.data[0]; assert.equal(record.jobTitle, 'Canonical Math'); assert.equal(record.jobId, 'math'); assert.equal(record.dob, '2000-02-29');
    assert.equal((await request(base, record.cvUrl)).response.status, 401);
    const download = await request(base, `/api/applications/${record.id}/cv`, 'GET', undefined, auth);
    assert.equal(download.response.status, 200); assert.match(download.text, /^%PDF-/);
    assert.match(download.response.headers.get('content-disposition')!, /^attachment/);
    assert.equal(download.response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(download.response.headers.get('content-security-policy')!, /sandbox/);
    assert.equal((await request(base, `/backend-api/applications/${record.id}/cv`)).response.status, 401);
    assert.equal((await request(base, `/api/applications/${record.id}`, 'DELETE', undefined, auth)).response.status, 200);
    assert.equal((await request(base, record.cvUrl, 'GET', undefined, auth)).response.status, 404);
  });
});

test('HTML/mime mismatch, absent CV, hidden/unknown position and fabricated public URL are rejected', async () => {
  await fixture({}, async ({ base }) => {
    const html = 'data:text/html;base64,' + Buffer.from('<script>syntheticOnly()</script>').toString('base64');
    for (const input of [
      { ...submission, fileName: 'audit.html', fileData: html }, { ...submission, fileName: 'audit.pdf', fileData: html },
      { ...submission, fileName: '', fileData: '' }, { ...submission, jobId: 'hidden' }, { ...submission, jobId: 'absent' },
      { ...submission, downloadURL: 'https://attacker.example.invalid/file' }, { ...submission, name: { not: 'string' } },
      { ...submission, email: 'one@example.invalid,two@example.invalid' }, { ...submission, dob: '31/02/2000' },
    ]) assert.equal((await request(base, '/api/send-email', 'POST', input)).response.status, 400);
    assert.equal((await request(base, '/api/applications', 'GET', undefined, auth)).data.data.length, 0);
  });
});

test('manual creation and updates validate schema, preserve immutable fields and surface failures', async () => {
  await fixture({}, async ({ base }) => {
    for (const extra of [{ id: 'forged' }, { createdAt: '2000-01-01' }, { name: { invalid: true } }, { status: 'bad-status' }]) {
      assert.equal((await request(base, '/api/applications', 'POST', { ...adminData, ...extra }, auth)).response.status, 400);
    }
    const created = await request(base, '/api/applications', 'POST', adminData, auth);
    assert.equal(created.response.status, 201);
    const id = created.data.data.id;
    assert.equal((await request(base, `/api/applications/${id}`, 'PATCH', { createdAt: '2000-01-01' }, auth)).response.status, 400);
    assert.equal((await request(base, `/api/applications/${id}`, 'PATCH', { status: 'passed', notes: 'Checked' }, auth)).response.status, 200);
    assert.equal((await request(base, '/api/applications/absent', 'PATCH', { status: 'passed' }, auth)).response.status, 404);
  });
});

test('metadata write failure returns 500, cleans uploaded CV and never reports success or secrets', async () => {
  let cleanups = 0; let notifications = 0;
  await fixture({ store: { ...store, addApplication: async () => { throw new Error('AUDIT_FAKE_SECRET_DO_NOT_DISCLOSE'); }, deleteUploadedFile: async url => { cleanups++; await store.deleteUploadedFile(url); } }, notifyApplication: async () => { notifications++; return false; } }, async ({ base }) => {
    const result = await request(base, '/api/send-email', 'POST', submission);
    assert.equal(result.response.status, 500); assert.equal(result.data.success, false); assert.ok(!result.data.applicationId);
    assert.ok(!result.text.includes('AUDIT_FAKE_SECRET')); assert.equal(cleanups, 1); assert.equal(notifications, 0);
  });
});

test('SMTP failure cannot undo a durably stored application', async () => {
  await fixture({ notifyApplication: async () => { throw new Error('fake SMTP failure'); } }, async ({ base }) => {
    const result = await request(base, '/api/send-email', 'POST', submission);
    assert.equal(result.response.status, 201); assert.equal(result.data.emailDispatched, false);
    const list = await request(base, '/api/applications', 'GET', undefined, auth);
    assert.equal(list.data.data[0].id, result.data.applicationId);
  });
});

test('SMTP API is metadata-only, accepts saved configuration only, no decrypt or query-secret routes', async () => {
  let sends = 0;
  const settings = { host: 'smtp.example.invalid', port: 465, user: 'smtp@example.invalid', recipient: 'hr@example.invalid', password: 'AUDIT_FAKE_PASSWORD', source: 'database' as const };
  await fixture({ getSmtpSettings: async () => settings, saveSmtpSettings: async () => settings, testSmtp: async () => { sends++; } }, async ({ base }) => {
    for (const [method, body] of [['GET', undefined], ['PUT', { host: settings.host }]] as const) {
      const result = await request(base, '/api/smtp-settings', method, body, auth);
      assert.equal(result.response.status, 200); assert.equal(result.data.hasPassword, true);
      assert.ok(!Object.hasOwn(result.data, 'password')); assert.ok(!result.text.includes(settings.password));
    }
    assert.equal((await request(base, '/api/test-smtp?pass=DUMMY', 'GET', undefined, auth)).response.status, 405);
    assert.equal((await request(base, '/api/test-smtp', 'POST', { host: '127.0.0.1', pass: 'DUMMY' }, auth)).response.status, 400);
    assert.equal(sends, 0);
    assert.equal((await request(base, '/api/test-smtp', 'POST', undefined, auth)).response.status, 200); assert.equal(sends, 1);
    for (const endpoint of ['decrypt-password', 'encrypt-password', 'post-test', 'test']) {
      const result = await request(base, '/api/' + endpoint, 'POST', { encryptedPassword: 'DUMMY' });
      assert.equal(result.response.status, 410); assert.ok(!result.text.includes('decryptedPassword'));
    }
  });
});

test('origin policy, rate limits, parser errors and production headers fail safely', async () => {
  await fixture({}, async ({ base }) => {
    const crossOrigin = await request(base, '/api/applications', 'GET', undefined, { ...auth, Origin: 'https://attacker.example.invalid' });
    assert.equal(crossOrigin.response.status, 403); assert.equal(crossOrigin.response.headers.get('access-control-allow-origin'), null);
    const sameOrigin = await request(base, '/api/applications', 'GET', undefined, { ...auth, Origin: 'https://recruitment.example.invalid' });
    assert.equal(sameOrigin.response.status, 200); assert.equal(sameOrigin.response.headers.get('access-control-allow-origin'), 'https://recruitment.example.invalid');
    const malformed = await fetch(base + '/api/send-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(malformed.status, 400); assert.ok(!(await malformed.text()).includes('SyntaxError'));
    assert.equal((await request(base, '/api/send-email', 'POST', { fileData: 'A'.repeat(4_400_000) })).response.status, 413);
    process.env.NODE_ENV = 'production';
    const ping = await request(base, '/api/ping');
    assert.match(ping.response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.doesNotMatch(ping.response.headers.get('content-security-policy')!, /script-src [^;]*'unsafe-inline'/);
    assert.equal(ping.response.headers.get('x-powered-by'), null); assert.equal(ping.response.headers.get('x-content-type-options'), 'nosniff');
    process.env.NODE_ENV = 'test';
  });
  await fixture({ limiter: { consume: async () => false } }, async ({ base }) => {
    const limited = await request(base, '/api/send-email', 'POST', submission);
    assert.equal(limited.response.status, 429); assert.ok(limited.response.headers.get('retry-after'));
    assert.equal((await request(base, '/api/applications', 'GET', undefined, auth)).response.status, 429);
  });
});

test('private download refuses traversal and never fetches legacy external CV URLs', async () => {
  await fixture({}, async ({ base }) => {
    const result = await request(base, '/api/applications', 'POST', { ...adminData, cvUrl: 'https://legacy.example.invalid/cv.pdf' }, auth);
    assert.equal(result.response.status, 201);
    assert.equal((await request(base, `/api/applications/${result.data.data.id}/cv`, 'GET', undefined, auth)).response.status, 404);
    assert.equal((await request(base, '/api/uploads/%2E%2E%2Fsecret.pdf', 'GET', undefined, auth)).response.status, 404);
  });
});

test('SMTP uses independent authenticated encryption and fails without a valid key', async () => {
  const original = process.env.SMTP_ENCRYPTION_KEY;
  try {
    process.env.SMTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptSmtpPassword('AUDIT_FAKE_PASSWORD');
    assert.ok(!encrypted.includes('AUDIT_FAKE_PASSWORD')); assert.equal(decryptSmtpPassword(encrypted), 'AUDIT_FAKE_PASSWORD');
    const parts = encrypted.split(':'); const tag = Buffer.from(parts[2], 'base64'); tag[0] ^= 1; parts[2] = tag.toString('base64');
    assert.throws(() => decryptSmtpPassword(parts.join(':')));
    process.env.SMTP_ENCRYPTION_KEY = ''; process.env.GEMINI_API_KEY = 'not-a-valid-SMTP-key';
    assert.throws(() => encryptSmtpPassword('AUDIT_FAKE_PASSWORD'), { status: 503 });
  } finally { if (original === undefined) delete process.env.SMTP_ENCRYPTION_KEY; else process.env.SMTP_ENCRYPTION_KEY = original; delete process.env.GEMINI_API_KEY; }
});

test('SMTP targets must be allowlisted public addresses and env secrets never enter metadata', async () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_RECIPIENT', 'SMTP_ALLOWED_HOSTS'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.SMTP_HOST = 'smtp.example.invalid'; process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'sender@example.invalid'; process.env.SMTP_PASSWORD = 'AUDIT_ONLY'; process.env.SMTP_RECIPIENT = 'recipient@example.invalid';
    const metadata = smtpMetadata(await getSmtpSettings()); assert.equal(metadata.source, 'environment'); assert.ok(!JSON.stringify(metadata).includes('AUDIT_ONLY'));
    process.env.SMTP_ALLOWED_HOSTS = '127.0.0.1,192.168.0.10';
    await assert.rejects(resolvePublicSmtpAddress('127.0.0.1'), { status: 400 });
    await assert.rejects(resolvePublicSmtpAddress('192.168.0.10'), { status: 400 });
    await assert.rejects(resolvePublicSmtpAddress('untrusted.example.invalid'), { status: 400 });
  } finally { for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } }
});

test('production rate limiting has no insecure missing-secret fallback', async () => {
  process.env.NODE_ENV = 'production'; delete process.env.RATE_LIMIT_SALT;
  try { await assert.rejects(persistentRateLimiter.consume('synthetic', 1, 1000), { status: 503 }); }
  finally { process.env.NODE_ENV = 'test'; }
});
