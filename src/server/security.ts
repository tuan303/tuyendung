import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getAdminServices } from './firebaseAdmin';

export const ADMIN_EMAILS = new Set([
  'tuan303@gmail.com',
  'admin_nshm@nshm.edu.vn',
  'tuyendung@hoangmaistarschool.edu.vn',
]);

export interface Identity {
  uid: string;
  email?: string;
  email_verified?: boolean;
  admin?: boolean;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const isAdmin = (identity: Identity) => identity.admin === true ||
  (identity.email_verified === true && ADMIN_EMAILS.has((identity.email || '').toLowerCase()));

export async function verifyToken(token: string): Promise<Identity> {
  // checkRevoked also rejects disabled users and revoked sessions.
  return getAdminServices().auth.verifyIdToken(token, true);
}

const localSalt = randomBytes(32).toString('hex');
export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export const persistentRateLimiter: RateLimiter = {
  async consume(key, limit, windowMs) {
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const salt = process.env.RATE_LIMIT_SALT;
    if ((!salt || salt.length < 32) && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
      throw new HttpError(503, 'Máy chủ chưa được cấu hình bảo vệ lưu lượng.');
    }
    const id = createHmac('sha256', salt || localSalt).update(`${windowMs}:${window}:${key}`).digest('hex');
    const { db } = getAdminServices();
    const ref = db.collection('rateLimits').doc(id);
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const count = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0;
      if (count >= limit) return false;
      transaction.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * windowMs) });
      return true;
    });
  },
};

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const development = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const scripts = development ? "'self' 'unsafe-inline'" : "'self'";
  const connections = development ? ' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*' : '';
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", `script-src ${scripts} https://apis.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob: https:",
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.firebasestorage.app${connections}`,
    "frame-src https://*.firebaseapp.com https://www.google.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || process.env.VERCEL) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function protectOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (!origin) return next();
  const allowed = (process.env.APP_URL || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.length && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    allowed.push(`http://${req.get('host')}`);
  }
  let canonical: string;
  try { canonical = new URL(origin).origin; } catch { return next(new HttpError(403, 'Origin không được phép.')); }
  if (!allowed.some(value => {
    try { return new URL(value).origin === canonical; } catch { return false; }
  })) return next(new HttpError(403, 'Origin không được phép.'));
  res.setHeader('Access-Control-Allow-Origin', canonical);
  res.vary('Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.sendStatus(204);
  }
  next();
}
