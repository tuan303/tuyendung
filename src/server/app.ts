import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { requireAdmin } from "./auth.js";
import { EncryptionConfigError } from "./crypto.js";
import { isVercel } from "./firebaseAdmin.js";
import {
  countApplications,
  createApplication,
  deleteApplication,
  generateApplicationId,
  getStorageMode,
  isValidApplicationId,
  listApplications,
  setApplicationCvStorage,
  StoreUnavailableError,
  updateApplication,
  type ApplicationUpdate,
  type CvStorage,
} from "./applicationsStore.js";
import {
  cvContentDisposition,
  CvFileCorruptError,
  cvResponseContentType,
  deleteCvFile,
  getCvFile,
  hasRoomForCvFile,
  saveCvFile,
  type CvFile,
} from "./cvFiles.js";
import {
  buildApplicationEmail,
  createSmtpTransport,
  getStoredPassword,
  isSmtpComplete,
  loadSmtpSettings,
  mapSmtpError,
  saveSmtpSettings,
  toHeaderText,
  withTimeout,
} from "./smtp.js";
import {
  checkEmail,
  checkLength,
  CV_MIME_TYPES,
  EMAIL_RE,
  isAllowedDriveUrl,
  isHttpUrl,
  multiLine,
  parseCvDataUrl,
  parseUrl,
  requireField,
  sanitizeFileName,
  singleLine,
  ValidationError,
  withFileExtension,
  type ParsedCvFile,
} from "./validation.js";

const API_PREFIXES = ["/api", "/backend-api"];
const SUBMIT_FAILED_MESSAGE =
  "Hệ thống tạm thời không lưu được hồ sơ. Vui lòng thử lại sau hoặc gửi CV qua email tuyendung@hoangmaistarschool.edu.vn";
const CV_NOT_DELIVERED_MESSAGE =
  "Thông tin của bạn đã được ghi nhận nhưng hệ thống chưa gửi được file CV tới bộ phận Tuyển dụng. " +
  "Vui lòng thử nộp lại sau ít phút hoặc gửi CV qua email tuyendung@hoangmaistarschool.edu.vn";
const SUBMISSION_EMAIL_BUDGET_MS = 20000;
const SUBMISSION_SAVE_TIMEOUT_MS = 15000;
const SUBMISSION_FILE_SAVE_TIMEOUT_MS = 15000;
const CV_QUOTA_CHECK_TIMEOUT_MS = 3000;
const MARK_CV_LOST_TIMEOUT_MS = 5000;
const CV_FILE_CLEANUP_TIMEOUT_MS = 5000;
const CV_FILE_DELETE_TIMEOUT_MS = 10000;
const TEST_SMTP_BUDGET_MS = 25000;

function isApiPath(url: string): boolean {
  return API_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`));
}

function pathOnly(url: string): string {
  return url.split("?")[0];
}

/** Wraps an async route so rejections reach the JSON error handler with a route-specific fallback message. */
function route(fn: (req: Request, res: Response) => Promise<unknown>, fallbackMessage: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err: any) => {
      const error = err instanceof Error ? err : new Error(String(err));
      (error as any).fallbackMessage = fallbackMessage;
      next(error);
    });
  };
}

// ---------- candidate submission ----------

interface Submission {
  name: string;
  dob: string;
  phone: string;
  email: string;
  position: string;
  jobId: string;
  cvUrl: string;
  fileName: string;
  file: ParsedCvFile | null;
}

function parseSubmission(body: any): Submission {
  const name = requireField(singleLine(body.name), "họ và tên", 200);
  const phone = requireField(singleLine(body.phone), "số điện thoại", 50);
  const email = checkEmail(requireField(singleLine(body.email), "email", 200));
  const position = requireField(singleLine(body.position), "vị trí ứng tuyển", 500);
  const dob = checkLength(singleLine(body.dob), "Ngày sinh", 50);
  const jobId = checkLength(singleLine(body.jobId), "Mã vị trí tuyển dụng", 200);
  let fileName = sanitizeFileName(singleLine(body.fileName));

  // Only links to Google Drive/Docs are accepted from the public form.
  const rawCvUrl = singleLine(body.cvUrl ?? body.downloadURL);
  let cvUrl = "";
  if (rawCvUrl) {
    if (isAllowedDriveUrl(rawCvUrl)) {
      cvUrl = rawCvUrl;
    } else {
      console.warn(`[send-email] Bỏ qua cvUrl không hợp lệ (host: ${parseUrl(rawCvUrl)?.host || "không phải URL"})`);
    }
  }

  let file: ParsedCvFile | null = null;
  if (body.fileData !== undefined && body.fileData !== null && body.fileData !== "") {
    if (typeof body.fileData !== "string") {
      throw new ValidationError("File CV không hợp lệ. Vui lòng chọn lại file PDF hoặc DOCX.");
    }
    file = parseCvDataUrl(body.fileData, fileName);
    // The stored/emailed name always ends with the extension of the real type (a long name is cut first).
    fileName = withFileExtension(fileName || sanitizeFileName(`CV_${name}`), file.extension);
  }

  return { name, dob, phone, email, position, jobId, cvUrl, fileName, file };
}

/** `fileBeingStored`: the inline CV file is also being saved on the server (the result is not known yet). */
async function sendSubmissionEmail(sub: Submission, startedAt: number, fileBeingStored: boolean): Promise<void> {
  const settings = await withTimeout(loadSmtpSettings(), 8000, "Tải cấu hình SMTP");
  if (!isSmtpComplete(settings)) {
    throw new Error("SMTP chưa được cấu hình đầy đủ trong trang quản trị");
  }
  const pass = getStoredPassword(settings);
  if (!pass) {
    throw new Error("Không giải mã được mật khẩu SMTP đã lưu (kiểm tra SMTP_ENCRYPTION_KEY)");
  }

  const { subject, text, html } = buildApplicationEmail({
    name: sub.name,
    dob: sub.dob,
    phone: sub.phone,
    email: sub.email,
    position: sub.position,
    cvUrl: sub.cvUrl,
    attachmentName: sub.file ? sub.fileName : undefined,
    // The file is saved concurrently with this email (see POST /send-email), so the note is conditional.
    attachmentMayBeStored: fileBeingStored,
  });

  const transporter = createSmtpTransport(
    { host: settings.host, port: settings.port, user: settings.user, pass },
    { connection: 8000, greeting: 8000, socket: 12000 }
  );
  try {
    const remaining = Math.max(3000, SUBMISSION_EMAIL_BUDGET_MS - (Date.now() - startedAt));
    await withTimeout(
      transporter.sendMail({
        from: { name: "Hệ thống Tuyển dụng", address: settings.user },
        to: settings.recipient,
        replyTo: { name: toHeaderText(sub.name), address: sub.email },
        subject,
        text,
        html,
        attachments: sub.file
          ? [{ filename: sub.fileName, content: sub.file.content, contentType: sub.file.mimeType }]
          : undefined,
      }),
      remaining,
      "Gửi email"
    );
  } finally {
    transporter.close();
  }
}

// ---------- SMTP settings ----------

interface SmtpBody {
  host: string;
  port: string;
  user: string;
  recipient: string;
  pass: string;
}

function parseSmtpBody(body: any): SmtpBody {
  const host = requireField(singleLine(body.host), "SMTP Host", 255);
  if (/[\s/]/.test(host)) throw new ValidationError("SMTP Host không hợp lệ.");

  const port = singleLine(body.port);
  const portNumber = Number(port);
  if (!/^\d{1,5}$/.test(port) || portNumber < 1 || portNumber > 65535) {
    throw new ValidationError("Cổng (Port) SMTP không hợp lệ.");
  }

  const user = requireField(singleLine(body.user), "tài khoản SMTP (email gửi)", 255);

  const recipientList = requireField(singleLine(body.recipient), "email nhận hồ sơ", 1000)
    .split(/[,;]/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!recipientList.length || recipientList.some((r) => !EMAIL_RE.test(r))) {
    throw new ValidationError("Email nhận hồ sơ không hợp lệ.");
  }

  const pass = typeof body.pass === "string" && body.pass.trim() ? body.pass : "";
  if (pass.length > 500) throw new ValidationError("Mật khẩu SMTP quá dài.");

  return { host, port: String(portNumber), user, recipient: recipientList.join(", "), pass };
}

/** The stored password may only be reused for the same server + account (prevents sending it elsewhere). */
function sameSmtpAccount(a: { host: string; user: string }, b: { host: string; user: string }): boolean {
  return a.host.trim().toLowerCase() === b.host.trim().toLowerCase() && a.user.trim().toLowerCase() === b.user.trim().toLowerCase();
}

// ---------- app ----------

export function createApp(): express.Express {
  if (isVercel() && getStorageMode() === "unconfigured") {
    // Shows up in Vercel runtime logs on cold start, before any candidate submits.
    console.error(
      "[startup] THIẾU CẤU HÌNH: chưa đặt (hoặc sai) FIREBASE_SERVICE_ACCOUNT cho môi trường này — mọi hồ sơ ứng tuyển sẽ bị từ chối (500/503). " +
        "Thêm biến này trong Vercel > Settings > Environment Variables (cho cả Production và Preview) rồi Redeploy."
    );
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(cors());

  // Request logging for API calls only (no bodies, no query strings, no headers).
  app.use((req, res, next) => {
    if (!isApiPath(req.originalUrl)) return next();
    const start = Date.now();
    res.on("finish", () => {
      console.log(`[api] ${req.method} ${pathOnly(req.originalUrl)} -> ${res.statusCode} (${Date.now() - start} ms)`);
    });
    next();
  });

  const router = express.Router();
  router.use(express.json({ limit: "4.5mb" }));

  // ----- public -----

  router.get("/ping", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", storage: getStorageMode() });
  });

  router.post(
    "/send-email",
    route(async (req, res) => {
      const startedAt = Date.now();
      let sub: Submission;
      try {
        sub = parseSubmission(req.body || {});
      } catch (error: any) {
        if (error instanceof ValidationError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        throw error;
      }

      const id = generateApplicationId();
      // An inline CV file (no Drive link) is stored on the server so admins can open it, and is also
      // attached to the HR email. The record, the file and the email are handled concurrently.
      const inlineFile = !sub.cvUrl ? sub.file : null;
      // This form is public: the file is only stored while under the storage limits (hasRoomForCvFile).
      // Otherwise (or if the check fails) the CV still reaches HR as the email attachment ("email").
      let fileToStore: ParsedCvFile | null = null;
      if (inlineFile) {
        try {
          if (await withTimeout(hasRoomForCvFile(inlineFile.content.length), CV_QUOTA_CHECK_TIMEOUT_MS, "Kiểm tra giới hạn lưu file CV")) {
            fileToStore = inlineFile;
          } else {
            console.warn(`[send-email] Đã đạt giới hạn lưu file CV trên hệ thống: CV của hồ sơ ${id} chỉ được gửi kèm email`);
          }
        } catch (error: any) {
          console.error(`[send-email] Không kiểm tra được giới hạn lưu file CV (không lưu file của hồ sơ ${id}):`, error?.message || error);
        }
      }
      const cvStorage: CvStorage = sub.cvUrl ? "drive" : fileToStore ? "stored" : inlineFile ? "email" : "none";

      const [saveResult, fileResult, emailResult] = await Promise.allSettled([
        withTimeout(
          createApplication({
            id,
            jobId: sub.jobId,
            jobTitle: sub.position,
            name: sub.name,
            dob: sub.dob,
            phone: sub.phone,
            email: sub.email,
            cvUrl: sub.cvUrl,
            fileName: sub.fileName,
            cvStorage,
            status: "new",
            notes: "",
          }),
          SUBMISSION_SAVE_TIMEOUT_MS,
          "Lưu hồ sơ"
        ),
        fileToStore
          ? withTimeout(
              saveCvFile(id, { fileName: sub.fileName, mimeType: fileToStore.mimeType, content: fileToStore.content }),
              SUBMISSION_FILE_SAVE_TIMEOUT_MS,
              "Lưu file CV"
            )
          : Promise.resolve(),
        sendSubmissionEmail(sub, startedAt, !!fileToStore),
      ]);

      const saved = saveResult.status === "fulfilled";
      const fileStored = !!fileToStore && fileResult.status === "fulfilled";
      const emailSent = emailResult.status === "fulfilled";
      // The inline CV file is lost only when it could neither be stored nor emailed.
      const inlineCvLost = !!inlineFile && !fileStored && !emailSent;
      // withTimeout does not cancel the write: after a timeout the record may still be written later.
      const saveMayLandLater =
        saveResult.status === "rejected" && (saveResult.reason?.code === "ETIMEDOUT" || saveResult.reason?.code === 4); // 4 = gRPC DEADLINE_EXCEEDED

      if (saveResult.status === "rejected") {
        console.error(`[send-email] KHÔNG lưu được hồ sơ ${id}:`, saveResult.reason?.message || saveResult.reason);
      }
      if (fileResult.status === "rejected") {
        console.error(`[send-email] KHÔNG lưu được file CV của hồ sơ ${id}:`, fileResult.reason?.message || fileResult.reason);
      }
      if (emailResult.status === "rejected") {
        console.error(`[send-email] KHÔNG gửi được email thông báo cho hồ sơ ${id}:`, emailResult.reason?.message || emailResult.reason);
      }

      let finalCvStorage: CvStorage = cvStorage;
      let cvStorageNotUpdated = false;
      if (inlineFile && !fileStored) {
        // Correct the record to where the CV actually is (it was written as "stored" or "email").
        finalCvStorage = emailSent ? "email" : "email_failed";
        if (saved && finalCvStorage !== cvStorage) {
          try {
            await withTimeout(setApplicationCvStorage(id, finalCvStorage), MARK_CV_LOST_TIMEOUT_MS, "Cập nhật nơi lưu CV");
          } catch (error: any) {
            cvStorageNotUpdated = true;
            console.error(`[send-email] Không cập nhật được nơi lưu CV (${finalCvStorage}) cho hồ sơ ${id}:`, error?.message || error);
          }
        }
      }
      if (fileStored && !saved) {
        if (saveMayLandLater) {
          // Deleting now could leave a late-written "stored" record without its file. Keep the file:
          // if the record does appear, deleting it in the admin page also deletes the file.
          console.warn(
            `[send-email] Giữ file CV của hồ sơ ${id}: lưu hồ sơ quá thời gian chờ, hồ sơ có thể vẫn được ghi sau (nếu không, file này không gắn với hồ sơ nào)`
          );
        } else {
          // No record points to the stored file: remove it instead of keeping orphaned personal data.
          try {
            await withTimeout(deleteCvFile(id), CV_FILE_CLEANUP_TIMEOUT_MS, "Xóa file CV không có hồ sơ");
            console.warn(`[send-email] Đã xóa file CV của hồ sơ ${id} vì hồ sơ không lưu được`);
          } catch (error: any) {
            console.error(`[send-email] Không xóa được file CV không có hồ sơ ${id}:`, error?.message || error);
          }
        }
      }
      const cvStorageLog = cvStorageNotUpdated ? `${finalCvStorage} (CHƯA cập nhật được, hồ sơ vẫn ghi ${cvStorage})` : finalCvStorage;
      console.log(
        `[send-email] Hồ sơ ${id}: saved=${saved} fileStored=${fileStored} emailSent=${emailSent} cvStorage=${cvStorageLog} (${Date.now() - startedAt} ms)`
      );

      if (!saved && !emailSent) {
        res.status(500).json({ error: SUBMIT_FAILED_MESSAGE });
        return;
      }
      if (inlineCvLost) {
        // Do not tell the candidate "received": the CV itself never reached HR.
        res.status(503).json({
          error: CV_NOT_DELIVERED_MESSAGE,
          applicationId: id,
          saved,
          emailSent,
        });
        return;
      }
      res.status(200).json({
        success: true,
        message: "Hồ sơ của bạn đã được tiếp nhận thành công",
        applicationId: saved ? id : null,
        saved,
        emailSent,
      });
    }, SUBMIT_FAILED_MESSAGE)
  );

  // ----- admin only -----

  router.use("/applications", requireAdmin);
  router.use("/smtp-settings", requireAdmin);
  router.use("/test-smtp", requireAdmin);

  router.get(
    "/applications",
    route(async (_req, res) => {
      const data = await listApplications();
      res.json({ success: true, data });
    }, "Không tải được danh sách hồ sơ. Vui lòng thử lại sau.")
  );

  // Cheap change check for the admin page (count() aggregation instead of reading every document).
  router.get(
    "/applications/count",
    route(async (_req, res) => {
      const count = await countApplications();
      res.json({ success: true, count });
    }, "Không kiểm tra được số lượng hồ sơ. Vui lòng thử lại sau.")
  );

  // The CV file stored for an application (cvStorage "stored"), served inline so the admin page can show it.
  router.get(
    "/applications/:id/cv",
    route(async (req, res) => {
      const id = req.params.id;
      if (!isValidApplicationId(id)) {
        res.status(400).json({ error: "Mã hồ sơ không hợp lệ." });
        return;
      }
      let file: CvFile | null;
      try {
        file = await getCvFile(id);
      } catch (error: any) {
        if (error instanceof CvFileCorruptError) {
          console.error(`[applications] File CV của hồ sơ ${id} bị lỗi/không đầy đủ`);
          res.status(500).json({ error: error.message });
          return;
        }
        throw error;
      }
      if (!file) {
        res.status(404).json({ error: "Hồ sơ này không có file CV lưu trên hệ thống." });
        return;
      }
      const contentType = cvResponseContentType(file.mimeType);
      const extension = CV_MIME_TYPES[contentType] || "";
      const fallbackName = `CV_${id}${extension}`;
      // The served name always ends with the extension of the served type (never e.g. ".htm" on a PDF).
      const servedName = file.fileName && extension ? withFileExtension(file.fileName, extension) : file.fileName;
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(file.content.length));
      res.setHeader("Content-Disposition", cvContentDisposition(servedName, fallbackName));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      res.end(file.content);
    }, "Không tải được file CV. Vui lòng thử lại sau.")
  );

  router.post(
    "/applications",
    route(async (req, res) => {
      const body = req.body || {};
      const jobTitle = requireField(singleLine(body.jobTitle ?? body.position), "vị trí ứng tuyển", 500);
      const name = requireField(singleLine(body.name), "họ và tên", 200);
      const phone = requireField(singleLine(body.phone), "số điện thoại", 50);
      const email = checkLength(singleLine(body.email), "Email", 200);
      if (email) checkEmail(email);
      const dob = checkLength(singleLine(body.dob), "Ngày sinh", 50);
      const jobId = checkLength(singleLine(body.jobId), "Mã vị trí tuyển dụng", 200);
      const fileName = sanitizeFileName(singleLine(body.fileName));
      const cvUrl = singleLine(body.cvUrl ?? body.downloadURL);
      if (cvUrl && !isHttpUrl(cvUrl)) {
        throw new ValidationError("Link CV không hợp lệ (phải bắt đầu bằng http:// hoặc https://).");
      }
      const status = checkLength(singleLine(body.status) || "new", "Trạng thái", 50);
      const notes = checkLength(multiLine(body.notes), "Ghi chú", 5000);

      const data = await createApplication({
        jobId,
        jobTitle,
        name,
        dob,
        phone,
        email,
        cvUrl,
        fileName,
        cvStorage: cvUrl ? "link" : "none",
        status,
        notes,
      });
      console.log(`[applications] ${res.locals.adminEmail} tạo hồ sơ thủ công ${data.id}`);
      res.status(201).json({ success: true, data });
    }, "Không tạo được hồ sơ. Vui lòng thử lại sau.")
  );

  router.patch(
    "/applications/:id",
    route(async (req, res) => {
      const body = req.body || {};
      const updates: ApplicationUpdate = {};
      if (body.status !== undefined) {
        const status = singleLine(body.status);
        if (!status) throw new ValidationError("Trạng thái không hợp lệ.");
        updates.status = checkLength(status, "Trạng thái", 50);
      }
      if (body.notes !== undefined) {
        if (body.notes !== null && typeof body.notes !== "string") throw new ValidationError("Ghi chú không hợp lệ.");
        updates.notes = checkLength(multiLine(body.notes), "Ghi chú", 5000);
      }
      if (updates.status === undefined && updates.notes === undefined) {
        throw new ValidationError("Không có thông tin cần cập nhật (chỉ cho phép cập nhật trạng thái và ghi chú).");
      }
      const data = await updateApplication(req.params.id, updates);
      if (!data) {
        res.status(404).json({ error: "Không tìm thấy hồ sơ." });
        return;
      }
      res.json({ success: true, data });
    }, "Không cập nhật được hồ sơ. Vui lòng thử lại sau.")
  );

  router.delete(
    "/applications/:id",
    route(async (req, res) => {
      const id = req.params.id;
      if (!isValidApplicationId(id)) {
        res.status(404).json({ error: "Không tìm thấy hồ sơ." });
        return;
      }
      // The stored CV file is deleted FIRST and must succeed: otherwise the record is kept so the admin
      // can retry (a retry, even of an already deleted record, always deletes the file again — idempotent),
      // instead of leaving the CV (personal data) behind with no record pointing to it.
      try {
        await withTimeout(deleteCvFile(id), CV_FILE_DELETE_TIMEOUT_MS, "Xóa file CV");
      } catch (error: any) {
        if (error instanceof StoreUnavailableError) throw error;
        console.error(`[applications] Không xóa được file CV của hồ sơ ${id} (chưa xóa hồ sơ):`, error?.message || error);
        res.status(500).json({ error: "Không xóa được file CV của hồ sơ nên hồ sơ chưa bị xóa. Vui lòng thử lại." });
        return;
      }
      const deleted = await deleteApplication(id);
      if (!deleted) {
        res.status(404).json({ error: "Không tìm thấy hồ sơ." });
        return;
      }
      console.log(`[applications] ${res.locals.adminEmail} đã xóa hồ sơ ${id}`);
      res.json({ success: true });
    }, "Không xóa được hồ sơ. Vui lòng thử lại sau.")
  );

  router.get(
    "/smtp-settings",
    route(async (_req, res) => {
      const s = await loadSmtpSettings({ fresh: true });
      res.json({
        success: true,
        data: {
          host: s?.host || "",
          port: s?.port || "",
          user: s?.user || "",
          recipient: s?.recipient || "",
          hasPassword: !!s?.pass,
          // false when a password is stored but cannot be used (saved by the old version, or the key changed).
          passwordUsable: s?.pass ? getStoredPassword(s) !== null : false,
        },
      });
    }, "Không tải được cấu hình SMTP. Vui lòng thử lại sau.")
  );

  router.put(
    "/smtp-settings",
    route(async (req, res) => {
      const input = parseSmtpBody(req.body || {});
      if (!input.pass) {
        const stored = await loadSmtpSettings({ fresh: true });
        if (stored?.pass && !sameSmtpAccount(stored, input)) {
          throw new ValidationError(
            "Bạn đã thay đổi SMTP Host hoặc tài khoản gửi. Vui lòng nhập lại mật khẩu ứng dụng trước khi lưu."
          );
        }
      }
      await saveSmtpSettings(input);
      console.log(`[smtp] ${res.locals.adminEmail} đã cập nhật cấu hình SMTP${input.pass ? " (kèm mật khẩu mới)" : ""}`);
      res.json({ success: true });
    }, "Không lưu được cấu hình SMTP. Vui lòng thử lại sau.")
  );

  router.post(
    "/test-smtp",
    route(async (req, res) => {
      const input = parseSmtpBody(req.body || {});
      let pass = input.pass;
      if (!pass) {
        const stored = await loadSmtpSettings({ fresh: true });
        if (!stored?.pass) {
          throw new ValidationError("Chưa có mật khẩu SMTP được lưu. Vui lòng nhập mật khẩu ứng dụng để kiểm tra.");
        }
        if (!sameSmtpAccount(stored, input)) {
          throw new ValidationError(
            "Bạn đã thay đổi SMTP Host hoặc tài khoản gửi. Vui lòng nhập lại mật khẩu ứng dụng để kiểm tra."
          );
        }
        const decrypted = getStoredPassword(stored);
        if (!decrypted) {
          throw new ValidationError(
            "Không giải mã được mật khẩu SMTP đã lưu (khóa mã hóa trên máy chủ đã thay đổi). Vui lòng nhập lại mật khẩu ứng dụng."
          );
        }
        pass = decrypted;
      }

      const transporter = createSmtpTransport(
        { host: input.host, port: input.port, user: input.user, pass },
        { connection: 10000, greeting: 10000, socket: 12000 }
      );
      try {
        await withTimeout(
          (async () => {
            await transporter.verify();
            await transporter.sendMail({
              from: { name: "Hệ thống Tuyển dụng", address: input.user },
              to: input.recipient,
              subject: "Kiểm tra cấu hình SMTP - Tuyển dụng",
              text: "Chúc mừng! Cấu hình SMTP của bạn đã hoạt động chính xác.",
              html: "<h2>Kiểm tra cấu hình SMTP</h2><p>Chúc mừng! Cấu hình SMTP của bạn đã hoạt động chính xác.</p><p>Hệ thống đã có thể gửi email thông báo hồ sơ ứng tuyển.</p>",
            });
          })(),
          TEST_SMTP_BUDGET_MS,
          "Kiểm tra SMTP"
        );
      } catch (error: any) {
        console.error(`[smtp] Kiểm tra SMTP thất bại (${error?.code || error?.name}):`, error?.message);
        res.status(500).json({ error: mapSmtpError(error), details: error?.code || error?.name });
        return;
      } finally {
        transporter.close();
      }
      res.json({ success: true, message: "Kết nối SMTP thành công và đã gửi email thử nghiệm!" });
    }, "Không kiểm tra được cấu hình SMTP. Vui lòng thử lại sau.")
  );

  for (const prefix of API_PREFIXES) app.use(prefix, router);

  // Unknown API route -> JSON 404 (never fall through to the SPA).
  app.use(API_PREFIXES, (req: Request, res: Response) => {
    res.status(404).json({ error: `Không tìm thấy API ${req.method} ${pathOnly(req.originalUrl)}` });
  });

  // JSON error handler for API routes.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (!isApiPath(req.originalUrl) || res.headersSent) return next(err);

    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "File quá lớn. Vui lòng chọn file CV nhỏ hơn 3 MB." });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Dữ liệu gửi lên không hợp lệ." });
      return;
    }
    if (err?.type === "encoding.unsupported" || err?.type === "charset.unsupported") {
      res.status(415).json({ error: "Định dạng dữ liệu gửi lên không được hỗ trợ." });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof StoreUnavailableError) {
      console.error(`[api] ${req.method} ${pathOnly(req.originalUrl)}: ${err.message}`);
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof EncryptionConfigError) {
      console.error(`[api] ${req.method} ${pathOnly(req.originalUrl)}: ${err.message}`);
      res.status(500).json({ error: err.message });
      return;
    }

    console.error(`[api] Lỗi ${req.method} ${pathOnly(req.originalUrl)}:`, err);
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err?.fallbackMessage || "Lỗi máy chủ. Vui lòng thử lại sau." });
  });

  return app;
}
