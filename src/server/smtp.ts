import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import ipaddr from 'ipaddr.js';
import nodemailer from 'nodemailer';
import { getAdminServices } from './firebaseAdmin';
import { HttpError } from './security';
import type { ApplicationRecord } from './applicationsStore';

export interface SmtpSettings { host: string; port: number; user: string; recipient: string; password: string; source: 'environment' | 'database'; }
const emailPattern = /^[^\s<>@,;"\r\n]+@[^\s<>@,;"\r\n]+\.[^\s<>@,;"\r\n]+$/;

/** Preview must explicitly pin one test inbox before any SMTP connection. */
export function assertStagingMailRecipient(recipient: string, env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV !== 'preview' && env.APP_ENV !== 'staging') return;
  const testRecipient = env.SMTP_TEST_RECIPIENT?.trim() || '';
  if (testRecipient.length > 254 || !emailPattern.test(testRecipient)) {
    throw new HttpError(503, 'Môi trường thử cần cấu hình một SMTP_TEST_RECIPIENT riêng trên máy chủ.');
  }
  if (recipient.toLowerCase() !== testRecipient.toLowerCase()) {
    throw new HttpError(400, 'Môi trường thử chỉ được gửi đến hộp thư SMTP_TEST_RECIPIENT đã cấu hình.');
  }
}

function encryptionKey() {
  const raw = process.env.SMTP_ENCRYPTION_KEY || '';
  const key = /^[\da-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new HttpError(503, 'Chưa cấu hình khóa bảo vệ SMTP trên máy chủ.');
  return key;
}
export function encryptSmtpPassword(password: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const content = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), content.toString('base64')].join(':');
}
export function decryptSmtpPassword(value: string) {
  const [version, iv, tag, content, extra] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !content || extra) throw new HttpError(503, 'Cấu hình SMTP cần được nhập lại.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(content, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw new HttpError(503, 'Không thể mở cấu hình SMTP. Vui lòng kiểm tra khóa máy chủ.'); }
}
function validText(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\r\n\0]/.test(value)) throw new HttpError(400, `${name} không hợp lệ.`);
  return value.trim();
}
function allowlistedHost(value: unknown) {
  const host = domainToASCII(validText(value, 'Máy chủ SMTP', 253)).toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host)) throw new HttpError(400, 'Máy chủ SMTP phải là tên miền hợp lệ.');
  const allowed = [process.env.SMTP_HOST || '', ...(process.env.SMTP_ALLOWED_HOSTS || '').split(',')].map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(host)) throw new HttpError(400, 'Máy chủ SMTP chưa nằm trong danh sách được phép trên server.');
  return host;
}
function validate(input: Record<string, unknown>) {
  const host = allowlistedHost(input.host);
  const port = Number(input.port);
  if (![465, 587].includes(port)) throw new HttpError(400, 'Chỉ hỗ trợ cổng SMTP TLS 465 hoặc 587.');
  const user = validText(input.user, 'Tài khoản SMTP', 254);
  const recipient = validText(input.recipient, 'Email nhận', 254);
  if (!emailPattern.test(user) || !emailPattern.test(recipient)) throw new HttpError(400, 'Email SMTP không hợp lệ.');
  assertStagingMailRecipient(recipient);
  return { host, port, user, recipient };
}
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const env = process.env;
  if (env.SMTP_HOST || env.SMTP_USER || env.SMTP_PASSWORD || env.SMTP_RECIPIENT) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_RECIPIENT) throw new HttpError(503, 'Cấu hình SMTP máy chủ chưa đầy đủ.');
    const values = validate({ host: env.SMTP_HOST, port: env.SMTP_PORT || 465, user: env.SMTP_USER, recipient: env.SMTP_RECIPIENT });
    return { ...values, password: env.SMTP_PASSWORD, source: 'environment' };
  }
  const snapshot = await getAdminServices().db.collection('settings_private').doc('smtp').get();
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  return { ...validate(data), password: decryptSmtpPassword(data.passwordEncrypted), source: 'database' };
}
export function smtpMetadata(settings: SmtpSettings | null) {
  return settings ? { host: settings.host, port: settings.port, user: settings.user, recipient: settings.recipient, configured: true, hasPassword: true, source: settings.source } :
    { host: '', port: 465, user: '', recipient: '', configured: false, hasPassword: false, source: 'database' };
}
export async function saveSmtpSettings(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Cấu hình SMTP không hợp lệ.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['host', 'port', 'user', 'recipient', 'password'].includes(key))) throw new HttpError(400, 'Cấu hình SMTP chứa trường không được phép.');
  if (process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASSWORD || process.env.SMTP_RECIPIENT) throw new HttpError(409, 'SMTP đang được quản lý bằng biến môi trường trên máy chủ.');
  const reference = getAdminServices().db.collection('settings_private').doc('smtp');
  const previous = (await reference.get()).data();
  const values = validate(value);
  if (value.password !== undefined && (typeof value.password !== 'string' || value.password.length < 1 || value.password.length > 1024 || /[\r\n\0]/.test(value.password))) throw new HttpError(400, 'Mật khẩu SMTP không hợp lệ.');
  // A replacement password can recover after key rotation; never decrypt an old
  // ciphertext unless the admin explicitly preserves that existing password.
  const password = typeof value.password === 'string' && value.password ? value.password :
    previous?.passwordEncrypted ? decryptSmtpPassword(previous.passwordEncrypted) : undefined;
  if (!password) throw new HttpError(400, 'Vui lòng nhập mật khẩu SMTP.');
  // Resolve before saving as well as immediately before connecting.
  await resolvePublicSmtpAddress(values.host);
  await reference.set({ ...values, passwordEncrypted: encryptSmtpPassword(password), updatedAt: new Date().toISOString() });
  return { ...values, password, source: 'database' as const };
}
export async function resolvePublicSmtpAddress(host: string) {
  const addresses = await lookup(allowlistedHost(host), { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => {
    try { return ipaddr.process(address).range() !== 'unicast'; } catch { return true; }
  })) throw new HttpError(400, 'Địa chỉ máy chủ SMTP không được phép.');
  return addresses[0].address;
}
async function transporter(settings: SmtpSettings) {
  assertStagingMailRecipient(settings.recipient);
  const address = await resolvePublicSmtpAddress(settings.host);
  return nodemailer.createTransport({
    host: address, port: settings.port, secure: settings.port === 465, requireTLS: settings.port === 587,
    auth: { user: settings.user, pass: settings.password },
    tls: { servername: settings.host, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}
export async function testSmtp() {
  const settings = await getSmtpSettings();
  if (!settings) throw new HttpError(409, 'Chưa cấu hình SMTP.');
  const transport = await transporter(settings);
  try {
    await transport.verify();
    await transport.sendMail({ from: settings.user, to: settings.recipient, subject: 'Kiểm tra SMTP - Tuyển dụng', text: 'Kết nối SMTP đã được kiểm tra bởi quản trị viên.' });
  } finally { transport.close(); }
}
export async function notifyApplication(record: ApplicationRecord): Promise<boolean> {
  const settings = await getSmtpSettings();
  if (!settings) return false;
  const transport = await transporter(settings);
  const appUrl = process.env.APP_URL?.split(',')[0]?.trim();
  const adminUrl = appUrl ? new URL('/admin', appUrl).href : '';
  try {
    // Plain text prevents untrusted candidate fields becoming email HTML or links.
    await transport.sendMail({ from: `"Hệ thống Tuyển dụng" <${settings.user}>`, to: settings.recipient,
      ...(record.email ? { replyTo: record.email } : {}),
      subject: `[Ứng tuyển] ${record.jobTitle} - ${record.name}`,
      text: [`Họ và tên: ${record.name}`, `Ngày sinh: ${record.dob || ''}`, `Điện thoại: ${record.phone}`, `Email: ${record.email}`, `Vị trí: ${record.jobTitle}`, '', 'Hồ sơ đã được lưu trong hệ thống. Đăng nhập trang quản trị để tải CV.', adminUrl].join('\n'),
    });
    return true;
  } finally { transport.close(); }
}
