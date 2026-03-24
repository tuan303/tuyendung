import express from "express";
import cors from "cors";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore as getClientFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBtsC_4jAhCI7YJd8J-SiTYg9t7WH6Mvm8",
  authDomain: "graphic-pattern-482103-m6.firebaseapp.com",
  projectId: "graphic-pattern-482103-m6",
  storageBucket: "graphic-pattern-482103-m6.firebasestorage.app",
  messagingSenderId: "525030358816",
  appId: "1:525030358816:web:31f20398d053bee7c3a145",
  measurementId: "G-B7XB9K7X2N"
};

const clientApp = initializeClientApp(firebaseConfig, "serverApp");
const clientDb = getClientFirestore(clientApp);

const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(process.env.GEMINI_API_KEY || '12345678901234567890123456789012')).digest();
const IV_LENGTH = 16;

function encrypt(text: string) {
  if (!text) return text;
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  if (!text || !text.includes(':')) return text;
  try {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift()!, 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error("Decryption error:", e);
    return "";
  }
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiRouter = express.Router();

app.get("/ping-v5", (req, res) => {
  res.json({ status: "ok", message: "ROOT PING V5 (Vercel)", time: new Date().toISOString() });
});

app.get("/api/ping-v5", (req, res) => {
  res.json({ status: "ok", message: "API PING V5 (Vercel)", time: new Date().toISOString() });
});

app.get("/backend-api/ping-v5", (req, res) => {
  res.json({ status: "ok", message: "BACKEND API PING V5 (Vercel)", time: new Date().toISOString() });
});

apiRouter.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "API PING OK", version: "vercel" });
});

apiRouter.get("/test", (req, res) => {
  res.json({ message: "API is working", version: "vercel", time: new Date().toISOString() });
});

apiRouter.all("/post-test", (req, res) => {
  res.json({ 
    message: `${req.method} is working`, 
    version: "vercel",
    received: req.body,
    method: req.method,
    headers: req.headers
  });
});

apiRouter.post("/encrypt-password", async (req, res) => {
  try {
    const { password } = req.body;
    if (password === undefined) {
      return res.status(400).json({ error: "Mật khẩu không được để trống" });
    }
    const encryptedPass = encrypt(password);
    res.status(200).json({ encryptedPassword: encryptedPass });
  } catch (error: any) {
    res.status(500).json({ error: `Lỗi mã hóa: ${error.message}` });
  }
});

apiRouter.post("/decrypt-password", async (req, res) => {
  try {
    const { encryptedPassword } = req.body;
    if (!encryptedPassword) {
      return res.status(400).json({ error: "Dữ liệu mã hóa không được để trống" });
    }
    const decryptedPass = decrypt(encryptedPassword);
    res.json({ decryptedPassword: decryptedPass });
  } catch (error: any) {
    res.status(500).json({ error: `Lỗi giải mã: ${error.message}` });
  }
});

apiRouter.all("/test-smtp", async (req, res) => {
  let host, port, user, pass, recipient;

  if (req.method === 'POST') {
    ({ host, port, user, pass, recipient } = req.body);
  } else if (req.method === 'GET') {
    ({ host, port, user, pass, recipient } = req.query as any);
  } else {
    return res.status(405).json({ error: `Method ${req.method} not allowed.` });
  }

  try {
    if (!host || !port || !user || !pass || !recipient) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin SMTP để kiểm tra" });
    }

    const transporter = nodemailer.createTransport({
      host: host,
      port: parseInt(port),
      secure: parseInt(port) === 465,
      auth: {
        user: user,
        pass: pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });

    await transporter.verify();
    
    await transporter.sendMail({
      from: `"Hệ thống Tuyển dụng" <${user}>`,
      to: recipient,
      subject: "Kiểm tra cấu hình SMTP - Tuyển dụng",
      text: "Chúc mừng! Cấu hình SMTP của bạn đã hoạt động chính xác.",
      html: "<h2>Kiểm tra cấu hình SMTP</h2><p>Chúc mừng! Cấu hình SMTP của bạn đã hoạt động chính xác.</p><p>Hệ thống đã có thể gửi email thông báo hồ sơ ứng tuyển.</p>",
    });

    res.status(200).json({ success: true, message: "Kết nối SMTP thành công và đã gửi email thử nghiệm!" });
  } catch (error: any) {
    let errorMessage = error.message || "Lỗi không xác định khi kết nối SMTP";
    
    if (error.code === 'EAUTH') {
      errorMessage = "Lỗi xác thực: Sai email hoặc mật khẩu ứng dụng. Nếu dùng Gmail, hãy đảm bảo đã bật Mật khẩu ứng dụng (App Password).";
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = "Lỗi kết nối: Không thể kết nối tới máy chủ SMTP. Kiểm tra lại Host và Port.";
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = "Lỗi hết thời gian: Kết nối tới máy chủ SMTP quá lâu. Kiểm tra lại mạng hoặc Port.";
    } else if (error.syscall === 'getaddrinfo') {
      errorMessage = "Lỗi DNS: Không tìm thấy máy chủ SMTP. Kiểm tra lại Host.";
    }
    
    res.status(500).json({ error: errorMessage, details: error.code || error.name });
  }
});

apiRouter.all("/send-email", async (req, res) => {
  try {
    let data;
    if (req.method === 'POST') {
      data = req.body;
    } else if (req.method === 'GET') {
      data = req.query;
    } else {
      return res.status(405).json({ error: `Method ${req.method} not allowed.` });
    }

    const { name, dob, phone, email, position, downloadURL } = data;
    if (!name || !phone || !email || !position) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }
    const docRef = doc(clientDb, "settings", "smtp");
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return res.status(500).json({ error: "SMTP settings not configured" });
    }
    const smtpSettings = docSnap.data();
    if (!smtpSettings || !smtpSettings.host || !smtpSettings.port || !smtpSettings.user || !smtpSettings.pass || !smtpSettings.recipient) {
      return res.status(500).json({ error: "Incomplete SMTP settings" });
    }
    const decryptedPass = decrypt(smtpSettings.pass);
    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: parseInt(smtpSettings.port),
      secure: parseInt(smtpSettings.port) === 465,
      auth: {
        user: smtpSettings.user,
        pass: decryptedPass,
      },
    });
    const subject = `[Ứng tuyển] ${position} - ${name}`;
    const textBody = `Họ và tên: ${name}\nNgày sinh: ${dob || 'Không cung cấp'}\nĐiện thoại: ${phone}\nEmail: ${email}\nVị trí ứng tuyển: ${position}\n\n${downloadURL ? `Link CV đính kèm: ${downloadURL}` : `(Không có CV đính kèm)`}`.trim();
    const htmlBody = `<h2>Thông tin ứng viên ứng tuyển</h2><p><strong>Họ và tên:</strong> ${name}</p><p><strong>Ngày sinh:</strong> ${dob || 'Không cung cấp'}</p><p><strong>Điện thoại:</strong> ${phone}</p><p><strong>Email:</strong> ${email}</p><p><strong>Vị trí ứng tuyển:</strong> ${position}</p><br/><p>${downloadURL ? `<strong>Link CV đính kèm:</strong> <a href="${downloadURL}">${downloadURL}</a>` : `<em>(Không có CV đính kèm)</em>`}</p>`;
    await transporter.sendMail({
      from: `"${name}" <${smtpSettings.user}>`,
      replyTo: email,
      to: smtpSettings.recipient,
      subject: subject,
      text: textBody,
      html: htmlBody,
    });
    res.status(200).json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send email", details: error instanceof Error ? error.message : String(error) });
  }
});

app.use("/api", apiRouter);
app.use("/backend-api", apiRouter);

export default app;
