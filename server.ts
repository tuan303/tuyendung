import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import crypto from "crypto";
import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore as getClientFirestore, doc, getDoc, setDoc } from "firebase/firestore";

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

// Test encryption on startup
try {
  const testPass = "test-password";
  const encrypted = encrypt(testPass);
  const decrypted = decrypt(encrypted);
  if (testPass === decrypted) {
    console.log("Encryption self-test passed");
  } else {
    console.error("Encryption self-test failed: Decrypted value does not match");
  }
} catch (e) {
  console.error("Encryption self-test error:", e);
}

async function startServer() {
  console.log("Starting server...");
  const app = express();
  const PORT = 3000;

  // Global logger - MUST BE FIRST
  app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url} - NODE_ENV: ${process.env.NODE_ENV}`);
    next();
  });

  // Root level ping (no /api prefix)
  app.get(["/ping", "/ping/"], (req, res) => {
    console.log("Hit /ping");
    res.send("pong");
  });

  // API ping
  app.get(["/api/ping", "/api/ping/"], (req, res) => {
    console.log("Hit /api/ping");
    res.json({ message: "api-pong", time: new Date().toISOString() });
  });

  // Debug middleware for API routes
  app.use("/api", (req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
  });

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Test route
  app.get(["/api/test", "/api/test/"], (req, res) => {
    res.json({ message: "API is working", time: new Date().toISOString() });
  });

  // API route to encrypt password (only for admin)
  app.get(["/api/encrypt-password", "/api/encrypt-password/"], (req, res) => {
    res.json({ message: "Use POST to encrypt" });
  });

  app.post(["/api/encrypt-password", "/api/encrypt-password/"], async (req, res) => {
    console.log("Processing encryption request...");
    try {
      const { password } = req.body;
      console.log("Password received:", password ? "Yes" : "No");
      
      if (password === undefined) {
        return res.status(400).json({ error: "Mật khẩu không được để trống" });
      }
      
      const encryptedPass = encrypt(password);
      console.log("Encryption successful");
      
      res.status(200).json({ encryptedPassword: encryptedPass });
    } catch (error: any) {
      console.error("Failed to encrypt password:", error);
      res.status(500).json({ error: `Lỗi mã hóa: ${error.message}` });
    }
  });

  // API route to decrypt password (only for admin)
  app.post(["/api/decrypt-password", "/api/decrypt-password/"], async (req, res) => {
    try {
      const { encryptedPassword } = req.body;
      if (!encryptedPassword) {
        return res.status(400).json({ error: "Dữ liệu mã hóa không được để trống" });
      }
      const decryptedPass = decrypt(encryptedPassword);
      res.json({ decryptedPassword: decryptedPass });
    } catch (error: any) {
      console.error("Failed to decrypt password:", error);
      res.status(500).json({ error: `Lỗi giải mã: ${error.message}` });
    }
  });

  // API route to send email
  app.post(["/api/send-email", "/api/send-email/"], async (req, res) => {
    try {
      const { name, dob, phone, email, position, downloadURL } = req.body;

      if (!name || !phone || !email || !position) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Fetch SMTP settings from Firestore
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

      // Create Nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: parseInt(smtpSettings.port),
        secure: parseInt(smtpSettings.port) === 465, // true for 465, false for other ports
        auth: {
          user: smtpSettings.user,
          pass: decryptedPass,
        },
      });

      // Prepare email content
      const subject = `[Ứng tuyển] ${position} - ${name}`;
      const textBody = `
Họ và tên: ${name}
Ngày sinh: ${dob || 'Không cung cấp'}
Điện thoại: ${phone}
Email: ${email}
Vị trí ứng tuyển: ${position}

${downloadURL ? `Link CV đính kèm: ${downloadURL}` : `(Không có CV đính kèm)`}
      `.trim();

      const htmlBody = `
        <h2>Thông tin ứng viên ứng tuyển</h2>
        <p><strong>Họ và tên:</strong> ${name}</p>
        <p><strong>Ngày sinh:</strong> ${dob || 'Không cung cấp'}</p>
        <p><strong>Điện thoại:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Vị trí ứng tuyển:</strong> ${position}</p>
        <br/>
        <p>${downloadURL ? `<strong>Link CV đính kèm:</strong> <a href="${downloadURL}">${downloadURL}</a>` : `<em>(Không có CV đính kèm)</em>`}</p>
      `;

      // Send email
      await transporter.sendMail({
        from: `"${name}" <${smtpSettings.user}>`, // Use authenticated user as sender to avoid spam filters
        replyTo: email,
        to: smtpSettings.recipient,
        subject: subject,
        text: textBody,
        html: htmlBody,
      });

      res.status(200).json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Catch-all for /api to detect 404/405 - MUST BE AFTER ALL API ROUTES
  app.all("/api/*", (req, res) => {
    console.warn(`[API Unhandled] ${req.method} ${req.url}`);
    res.status(405).json({ error: `Method ${req.method} not allowed for ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();