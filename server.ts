import dotenv from "dotenv";
import express from "express";
import path from "path";
import fs from "fs/promises";
import { createApp } from "./src/server/app.js";
import { getStorageMode } from "./src/server/applicationsStore.js";

// Local dev: load server secrets from .env.local / .env (on Vercel they come from Project Settings).
dotenv.config({ path: [".env.local", ".env"], quiet: true });

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isDev = process.env.NODE_ENV !== "production";
  // Dev server listens on this machine only unless HOST is set (e.g. HOST=0.0.0.0 to test from a phone/LAN).
  const HOST = process.env.HOST || (isDev ? "127.0.0.1" : "0.0.0.0");

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        fs: {
          // Setting "deny" replaces Vite's defaults, so they are repeated here.
          // "**/data/**" keeps the local dev data (applications.json, smtp-settings.json) from being
          // served as static files (a pattern without the leading "**/" does not match in Vite 6).
          deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/**"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Explicit SPA fallback in dev (API routes are already answered by createApp()).
    app.get("*", async (req, res, next) => {
      try {
        let template = await fs.readFile(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server is listening on http://${HOST}:${PORT} (lưu trữ hồ sơ: ${getStorageMode()})`);
  });
}

startServer().catch((error) => {
  console.error("Không khởi động được server:", error);
  process.exit(1);
});
