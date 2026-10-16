import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createApiApp } from './src/server/api';

process.env.NODE_ENV ||= 'production';

async function startServer() {
  const app = createApiApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      try {
        const template = await fs.readFile(path.resolve('index.html'), 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).type('html').send(html);
      } catch (error) { next(error); }
    });
  } else {
    const dist = path.resolve('dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(port, host, () => console.log(`Recruitment app: http://${host}:${port}`));
}

startServer().catch(() => { console.error('Không thể khởi động máy chủ. Kiểm tra cấu hình.'); process.exitCode = 1; });
