import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { getAdminServices } from './firebaseAdmin';
import * as store from './applicationsStore';
import { privateUploadKey, validateApplicationCreate, validateApplicationUpdate } from './validation';
import { HttpError, isAdmin, persistentRateLimiter, protectOrigin, securityHeaders, verifyToken, type Identity, type RateLimiter } from './security';
import { getSmtpSettings, saveSmtpSettings, smtpMetadata, testSmtp, notifyApplication } from './smtp';

type Job = { id: string; title: string; isHidden?: boolean };
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const run = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);
const normalizeTitle = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');

async function resolveJob(id: string, title: string): Promise<Job | null> {
  const jobs = getAdminServices().db.collection('jobs');
  if (id) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new HttpError(400, 'Mã vị trí không hợp lệ.');
    const snapshot = await jobs.doc(id).get();
    const data = snapshot.data();
    return snapshot.exists && data && typeof data.title === 'string' ? { id: snapshot.id, title: data.title, isHidden: !!data.isHidden } : null;
  }
  // Only unambiguous legacy submissions may fall back to a title.
  const snapshot = await jobs.limit(1000).get();
  const matches = snapshot.docs.filter(doc => typeof doc.data().title === 'string' && normalizeTitle(doc.data().title) === normalizeTitle(title));
  return matches.length === 1 ? { id: matches[0].id, title: matches[0].data().title, isHidden: !!matches[0].data().isHidden } : null;
}

export interface ApiDependencies {
  verifyToken: (token: string) => Promise<Identity>;
  limiter: RateLimiter;
  resolveJob: (id: string, title: string) => Promise<Job | null>;
  store: typeof store;
  getSmtpSettings: typeof getSmtpSettings;
  saveSmtpSettings: typeof saveSmtpSettings;
  testSmtp: typeof testSmtp;
  notifyApplication: typeof notifyApplication;
}

/** Both Node and Vercel use this application; injection is for isolated tests. */
export function createApiApp(overrides: Partial<ApiDependencies> = {}) {
  const services: ApiDependencies = {
    verifyToken, limiter: persistentRateLimiter, resolveJob, store,
    getSmtpSettings, saveSmtpSettings, testSmtp, notifyApplication, ...overrides,
  };
  const app = express();
  app.disable('x-powered-by');
  const hops = process.env.VERCEL ? 1 : Number(process.env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) throw new Error('TRUST_PROXY_HOPS phải từ 0 đến 2.');
  app.set('trust proxy', hops);
  app.use(securityHeaders);

  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  router.use(protectOrigin);
  router.use('/send-email', run(async (req, res, next) => {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Chỉ hỗ trợ POST.' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!await services.limiter.consume(`submission:ip:${ip}`, 20, 60 * 60 * 1000) ||
        !await services.limiter.consume('submission:global', 120, 60 * 1000)) {
      res.setHeader('Retry-After', '3600'); res.status(429).json({ error: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' }); return;
    }
    next();
  }));
  // Base64 of 3 MiB plus bounded fields stays below Vercel's 4.5 MB payload cap.
  router.use(express.json({ limit: 4_400_000, strict: true }));

  const requireAdmin = run(async (req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_.-]{1,16000})$/.exec(req.get('authorization') || '');
    if (!match) throw new HttpError(401, 'Vui lòng đăng nhập để tiếp tục.');
    let identity: Identity;
    try { identity = await services.verifyToken(match[1]); }
    catch (error) {
      if ((error as { status?: number }).status === 503) throw error;
      throw new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    if (!isAdmin(identity)) throw new HttpError(403, 'Tài khoản không có quyền quản trị.');
    if (!await services.limiter.consume(`admin:${identity.uid}`, 120, 60 * 1000)) {
      res.setHeader('Retry-After', '60'); throw new HttpError(429, 'Vui lòng thử lại sau ít phút.');
    }
    res.locals.admin = identity; next();
  });

  router.get('/ping', (_req, res) => res.json({ status: 'ok' }));
  router.all(['/encrypt-password', '/decrypt-password', '/post-test', '/test'], (_req, res) => res.status(410).json({ error: 'API này đã được ngừng sử dụng.' }));
  router.post('/send-email', run(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Dữ liệu hồ sơ không hợp lệ.');
    const allowed = new Set(['name', 'dob', 'phone', 'email', 'position', 'jobId', 'fileData', 'fileName']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'Hồ sơ chứa trường không được phép.');
    const input = validateApplicationCreate({ name: body.name, dob: body.dob ?? '', phone: body.phone, email: body.email,
      jobTitle: body.position, jobId: body.jobId ?? '' }, { publicSubmission: true });
    const job = await services.resolveJob(input.jobId || '', input.jobTitle);
    if (!job || job.isHidden) throw new HttpError(400, 'Vị trí tuyển dụng không còn khả dụng. Vui lòng chọn lại.');
    let cvUrl = '';
    const hasFile = body.fileData !== undefined && body.fileData !== '';
    if (!hasFile || !body.fileName) throw new HttpError(400, 'Vui lòng đính kèm CV PDF hoặc DOCX.');
    if (hasFile || body.fileName) {
      if (typeof body.fileName !== 'string' || typeof body.fileData !== 'string') throw new HttpError(400, 'Dữ liệu CV không hợp lệ.');
      cvUrl = await services.store.saveUploadedFile(body.fileName, body.fileData);
    }
    let record: store.ApplicationRecord;
    try {
      record = await services.store.addApplication({ ...input, jobId: job.id, jobTitle: job.title,
        cvUrl, downloadURL: cvUrl, fileName: hasFile ? body.fileName : '', status: 'new', notes: '' });
    } catch (error) {
      if (cvUrl) await services.store.deleteUploadedFile(cvUrl).catch(() => {});
      throw error;
    }
    let emailDispatched = false;
    try { emailDispatched = await services.notifyApplication(record); }
    catch { console.error('[notification-failed]', { applicationId: record.id }); }
    res.status(201).json({ success: true, applicationId: record.id, emailDispatched, message: 'Hồ sơ đã được tiếp nhận thành công.' });
  }));

  router.use(['/applications', '/uploads', '/smtp-settings', '/test-smtp'], requireAdmin);
  router.get('/applications', run(async (_req, res) => res.json({ success: true, data: await services.store.getApplications() })));
  router.post('/applications', run(async (req, res) => {
    const data = validateApplicationCreate(req.body);
    const job = await services.resolveJob(data.jobId || '', data.jobTitle);
    if (!job) throw new HttpError(400, 'Vị trí tuyển dụng không hợp lệ.');
    const record = await services.store.addApplication({ ...data, jobId: job.id, jobTitle: job.title });
    res.status(201).json({ success: true, data: record });
  }));
  router.patch('/applications/:id', run(async (req, res) => {
    const data = validateApplicationUpdate(req.body);
    if (data.jobId !== undefined || data.jobTitle !== undefined) {
      const job = await services.resolveJob(data.jobId || '', data.jobTitle || '');
      if (!job) throw new HttpError(400, 'Vị trí tuyển dụng không hợp lệ.');
      data.jobId = job.id; data.jobTitle = job.title;
    }
    const record = await services.store.updateApplication(String(req.params.id), data);
    if (!record) throw new HttpError(404, 'Không tìm thấy hồ sơ.');
    res.json({ success: true, data: record });
  }));
  router.delete('/applications/:id', run(async (req, res) => {
    if (!await services.store.deleteApplication(String(req.params.id))) throw new HttpError(404, 'Không tìm thấy hồ sơ.');
    res.json({ success: true });
  }));
  async function sendPrivateFile(key: string, res: Response) {
    const file = await services.store.getUploadedFile(key);
    if (!file) throw new HttpError(404, 'Không tìm thấy CV.');
    res.attachment(file.fileName);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(file.buffer);
  }
  router.get('/applications/:id/cv', run(async (req, res) => {
    const record = (await services.store.getApplications()).find(application => application.id === req.params.id);
    if (!record) throw new HttpError(404, 'Không tìm thấy hồ sơ.');
    const key = privateUploadKey(record.cvUrl || record.downloadURL || '');
    if (!key) throw new HttpError(404, 'Hồ sơ này chưa có CV trong kho riêng.');
    await sendPrivateFile(key, res);
  }));
  router.get('/uploads/:key', run(async (req, res) => { await sendPrivateFile(String(req.params.key), res); }));
  router.get('/smtp-settings', run(async (_req, res) => res.json(smtpMetadata(await services.getSmtpSettings()))));
  router.put('/smtp-settings', run(async (req, res) => res.json(smtpMetadata(await services.saveSmtpSettings(req.body)))));
  router.post('/test-smtp', run(async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw new HttpError(400, 'Chỉ được kiểm tra cấu hình SMTP đã lưu.');
    await services.testSmtp(); res.json({ success: true, message: 'Đã kiểm tra SMTP và gửi email thử nghiệm.' });
  }));
  router.all('/test-smtp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Chỉ hỗ trợ POST.' }); });
  router.use((_req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
  app.use('/api', router); app.use('/backend-api', router);
  app.use((error: { status?: number; type?: string; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const requestedStatus = Number(error.status);
    const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
    const requestId = randomUUID();
    const message = error.type === 'entity.too.large' ? 'Dữ liệu quá lớn. CV tối đa 3 MiB.' :
      error.type === 'entity.parse.failed' ? 'JSON không hợp lệ.' : status >= 500 ? 'Không thể xử lý yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị viên.' : error.message || 'Yêu cầu không hợp lệ.';
    if (status >= 500) console.error('[api-error]', { requestId, status });
    res.status(status).json({ success: false, error: message, requestId });
  });
  return app;
}
