import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import fs from "fs/promises";

const SMTP_CONFIG_FILE = path.join(process.cwd(), 'smtp-config.json');

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API route to get SMTP settings (only for admin)
  app.get("/api/settings/smtp", async (req, res) => {
    try {
      const data = await fs.readFile(SMTP_CONFIG_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.json({}); // Return empty if file doesn't exist
      } else {
        res.status(500).json({ error: "Failed to read SMTP settings" });
      }
    }
  });

  // API route to save SMTP settings (only for admin)
  app.post("/api/settings/smtp", async (req, res) => {
    try {
      const { host, port, user, pass, recipient } = req.body;
      const config = { host, port, user, pass, recipient };
      await fs.writeFile(SMTP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save SMTP settings" });
    }
  });

  // API route to send email
  app.post("/api/send-email", async (req, res) => {
    try {
      const { name, dob, phone, email, position, downloadURL } = req.body;

      if (!name || !phone || !email || !position) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Fetch SMTP settings from local file
      let smtpSettings;
      try {
        const data = await fs.readFile(SMTP_CONFIG_FILE, 'utf-8');
        smtpSettings = JSON.parse(data);
      } catch (error: any) {
        return res.status(500).json({ error: "SMTP settings not configured" });
      }
      
      if (!smtpSettings || !smtpSettings.host || !smtpSettings.port || !smtpSettings.user || !smtpSettings.pass || !smtpSettings.recipient) {
        return res.status(500).json({ error: "Incomplete SMTP settings" });
      }

      // Create Nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: parseInt(smtpSettings.port),
        secure: parseInt(smtpSettings.port) === 465, // true for 465, false for other ports
        auth: {
          user: smtpSettings.user,
          pass: smtpSettings.pass,
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