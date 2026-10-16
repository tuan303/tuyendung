import { inflateRawSync } from 'node:zlib';
import { MAX_CV_BYTES } from '../shared/uploadLimits';
export { MAX_CV_BYTES } from '../shared/uploadLimits';

export const APPLICATION_STATUSES = ['new', 'reviewed', 'contacted', 'passed', 'rejected'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export interface ApplicationWrite {
  jobId?: string;
  jobTitle?: string;
  name?: string;
  dob?: string;
  phone?: string;
  email?: string;
  cvUrl?: string;
  downloadURL?: string;
  fileName?: string;
  status?: ApplicationStatus;
  notes?: string;
}

export class InputValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

function bad(message: string): never {
  throw new InputValidationError(message);
}

const FIELD_LIMITS = {
  jobId: 128, jobTitle: 250, name: 150, dob: 10, phone: 30,
  email: 254, cvUrl: 2048, downloadURL: 2048, fileName: 180,
  status: 20, notes: 10000,
} as const;

export const PRIVATE_UPLOAD_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|docx)$/i;
const PRIVATE_UPLOAD_URL = /^\/api\/uploads\/([0-9a-f-]+\.(?:pdf|docx))$/i;

export function privateUploadKey(value: string): string | null {
  const match = PRIVATE_UPLOAD_URL.exec(value);
  return match && PRIVATE_UPLOAD_KEY.test(match[1]) ? match[1] : null;
}

function validateCvUrl(value: string, publicSubmission: boolean): string {
  if (!value || privateUploadKey(value)) return value;
  if (publicSubmission) bad('Hồ sơ công khai phải tải CV trực tiếp.');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) bad('Liên kết CV phải sử dụng HTTPS.');
  } catch {
    bad('Liên kết CV không hợp lệ.');
  }
  return value;
}

function validateFields(input: unknown, publicSubmission: boolean): ApplicationWrite {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Dữ liệu hồ sơ không hợp lệ.');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(FIELD_LIMITS, key)) bad('Trường dữ liệu không được phép.');
    if (typeof value !== 'string') bad(`Trường ${key} phải là chuỗi ký tự.`);
    const clean = value.normalize('NFC').trim();
    if (clean.length > FIELD_LIMITS[key as keyof typeof FIELD_LIMITS]) bad(`Trường ${key} quá dài.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) bad(`Trường ${key} có ký tự không hợp lệ.`);
    if (key !== 'notes' && /[\r\n\t]/.test(clean)) bad(`Trường ${key} không được chứa xuống dòng.`);
    result[key] = clean;
  }
  if (result.jobId && !/^[A-Za-z0-9_-]{1,128}$/.test(result.jobId)) bad('Mã vị trí không hợp lệ.');
  if (result.email && !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(result.email)) bad('Email không hợp lệ.');
  if (result.phone && (!/^\+?[0-9().\-\s]{7,30}$/.test(result.phone) || result.phone.replace(/\D/g, '').length < 7 || result.phone.replace(/\D/g, '').length > 15)) bad('Số điện thoại không hợp lệ.');
  if (result.dob) {
    const vietnameseDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(result.dob);
    if (vietnameseDate) result.dob = `${vietnameseDate[3]}-${vietnameseDate[2]}-${vietnameseDate[1]}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.dob)) bad('Ngày sinh phải có định dạng DD/MM/YYYY hoặc YYYY-MM-DD.');
    const date = new Date(`${result.dob}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result.dob || date > new Date() || date.getUTCFullYear() < 1900) bad('Ngày sinh không hợp lệ.');
  }
  if (Object.hasOwn(result, 'status') && !(APPLICATION_STATUSES as readonly string[]).includes(result.status)) bad('Trạng thái hồ sơ không hợp lệ.');
  if (publicSubmission && result.status && result.status !== 'new') bad('Trạng thái hồ sơ công khai không hợp lệ.');
  if (publicSubmission && result.notes) bad('Ghi chú nội bộ không được gửi công khai.');
  if (Object.hasOwn(result, 'cvUrl')) result.cvUrl = validateCvUrl(result.cvUrl, publicSubmission);
  if (Object.hasOwn(result, 'downloadURL')) result.downloadURL = validateCvUrl(result.downloadURL, publicSubmission);
  if (result.cvUrl && result.downloadURL && result.cvUrl !== result.downloadURL) bad('Liên kết CV không đồng nhất.');
  if (result.fileName && (/[\\/]/.test(result.fileName) || result.fileName === '.' || result.fileName === '..')) bad('Tên CV không hợp lệ.');
  return result as ApplicationWrite;
}

export function validateApplicationCreate(input: unknown, options: { publicSubmission?: boolean } = {}): ApplicationWrite & { name: string; phone: string; jobTitle: string; email: string } {
  const data = validateFields(input, options.publicSubmission === true);
  if (!data.name || !data.phone || !data.jobTitle) bad('Thiếu họ tên, số điện thoại hoặc vị trí tuyển dụng.');
  if (options.publicSubmission && !data.email) bad('Email là bắt buộc.');
  return { ...data, name: data.name, phone: data.phone, jobTitle: data.jobTitle, email: data.email || '' };
}

export function validateApplicationUpdate(input: unknown): ApplicationWrite {
  const data = validateFields(input, false);
  if (Object.keys(data).length === 0) bad('Không có nội dung cập nhật.');
  for (const required of ['name', 'phone', 'jobTitle']) {
    if (Object.hasOwn(data, required) && !data[required as keyof ApplicationWrite]) bad(`Trường ${required} không được để trống.`);
  }
  return data;
}

export interface ValidatedUpload { buffer: Buffer; fileName: string; extension: 'pdf' | 'docx'; contentType: string }

/** Validate ZIP directory structure and expansion budgets without inflating untrusted data. */
function validateDocx(buffer: Buffer): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) bad('Tệp DOCX không hợp lệ.');
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0) bad('Tệp DOCX thiếu thư mục ZIP hợp lệ.');
  const entries = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0 || buffer.readUInt16LE(end + 8) !== entries || entries < 3 || entries > 1000 || directoryOffset + directorySize !== end) bad('Cấu trúc DOCX không được hỗ trợ.');
  let cursor = directoryOffset;
  let expanded = 0;
  let compressedTotal = 0;
  const names = new Set<string>();
  const occupied: Array<[number, number]> = [];
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) bad('Thư mục DOCX không hợp lệ.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || nameLength > 512 || next > end || flags & 1 || ![0, 8].includes(method) || buffer.readUInt16LE(cursor + 34) !== 0 || compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) bad('Tệp DOCX chứa mục không an toàn.');
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    const lowerName = name.toLowerCase();
    if (names.has(lowerName) || /[\\\u0000-\u001f\u007f\ufffd]/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.') || /^[a-z]:/i.test(name)) bad('Tên mục trong DOCX không an toàn.');
    if (/vbaproject|vbadata|activex|(?:^|\/)embeddings(?:\/|$)|\.html?$|\.svg$|\.exe$|\.js$/i.test(name)) bad('DOCX không được chứa macro hoặc nội dung thực thi.');
    names.add(lowerName);
    if (localOffset + 30 > directoryOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) bad('Mục DOCX bị hỏng.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localStart = localOffset + 30;
    const dataStart = localStart + localNameLength + localExtraLength;
    if (buffer.readUInt16LE(localOffset + 6) !== flags || buffer.readUInt16LE(localOffset + 8) !== method || dataStart + compressed > directoryOffset || localNameLength !== nameLength || !buffer.subarray(localStart, localStart + localNameLength).equals(nameBytes)) bad('Mục DOCX không khớp với thư mục.');
    if (method === 0 && compressed !== uncompressed) bad('Kích thước DOCX không hợp lệ.');
    if (uncompressed > 15 * 1024 * 1024 || (uncompressed > 0 && (compressed === 0 || uncompressed / compressed > 200))) bad('DOCX vượt giới hạn giải nén.');
    if (lowerName === '[content_types].xml' || lowerName.endsWith('.rels')) {
      // Inspect only bounded package metadata. maxOutputLength prevents ZIP bombs
      // even if the central-directory expanded-size field was forged.
      if (uncompressed > 512 * 1024) bad('Siêu dữ liệu DOCX vượt giới hạn.');
      const compressedBytes = buffer.subarray(dataStart, dataStart + compressed);
      let metadataBytes: Buffer;
      try { metadataBytes = method === 0 ? compressedBytes : inflateRawSync(compressedBytes, { maxOutputLength: 512 * 1024 }); }
      catch { bad('Siêu dữ liệu DOCX không hợp lệ.'); }
      if (metadataBytes.length !== uncompressed || metadataBytes.includes(0)) bad('Siêu dữ liệu DOCX không hợp lệ.');
      const metadata = metadataBytes.toString('utf8');
      if (/vbaproject|vbadata|macroenabled|activex|oleobject|text\/html|image\/svg\+xml|<!DOCTYPE|<!ENTITY/i.test(metadata)) bad('DOCX không được chứa macro hoặc nội dung thực thi.');
      if (lowerName === '[content_types].xml' && !metadata.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) bad('Tệp không phải tài liệu DOCX thông thường.');
    }
    occupied.push([localOffset, dataStart + compressed]);
    expanded += uncompressed;
    compressedTotal += compressed;
    cursor = next;
  }
  occupied.sort((a, b) => a[0] - b[0]);
  if (occupied.some((range, index) => index > 0 && occupied[index - 1][1] > range[0])) bad('Các mục DOCX chồng lấn.');
  if (cursor !== end || expanded > 30 * 1024 * 1024 || compressedTotal > MAX_CV_BYTES || !names.has('[content_types].xml') || !names.has('_rels/.rels') || !names.has('word/document.xml')) bad('Tệp không phải tài liệu DOCX hợp lệ.');
}

export function validateUploadedFile(fileName: unknown, dataUrl: unknown): ValidatedUpload {
  if (typeof fileName !== 'string' || typeof dataUrl !== 'string') bad('Tên hoặc dữ liệu CV không hợp lệ.');
  const cleanName = fileName.normalize('NFC').trim();
  if (!cleanName || cleanName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(cleanName)) bad('Tên CV không hợp lệ.');
  const extension = cleanName.match(/\.(pdf|docx)$/i)?.[1].toLowerCase() as 'pdf' | 'docx' | undefined;
  if (!extension) bad('Chỉ chấp nhận CV PDF hoặc DOCX.');
  if (dataUrl.length > Math.ceil(MAX_CV_BYTES / 3) * 4 + 200) bad('CV không được vượt quá 3 MiB.');
  let base64 = dataUrl;
  let declaredMime = '';
  if (dataUrl.startsWith('data:')) {
    const match = /^data:([a-zA-Z0-9.+/-]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) bad('Dữ liệu CV phải là base64 hợp lệ.');
    declaredMime = match[1].toLowerCase();
    base64 = match[2];
  }
  if (!base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) bad('Dữ liệu CV phải là base64 hợp lệ.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_CV_BYTES || buffer.toString('base64') !== base64) bad('Dung lượng hoặc dữ liệu CV không hợp lệ.');
  const contentType = extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (declaredMime && declaredMime !== contentType && declaredMime !== 'application/octet-stream') bad('Loại dữ liệu CV không khớp đuôi tệp.');
  if (extension === 'pdf') {
    if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(buffer.subarray(0, 12).toString('ascii')) || !buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from('%%EOF'))) bad('Tệp không phải PDF hợp lệ.');
  } else {
    validateDocx(buffer);
  }
  return { buffer, fileName: cleanName, extension, contentType };
}
