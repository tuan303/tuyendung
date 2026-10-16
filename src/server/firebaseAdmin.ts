import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const ADMIN_APP_NAME = 'tuyendung-server';
const DEFAULT_PROJECT_ID = 'graphic-pattern-482103-m6';

function configurationError(): Error & { status: number } {
  return Object.assign(new Error('Dịch vụ lưu trữ chưa được cấu hình. Vui lòng liên hệ quản trị viên.'), { status: 503 });
}

function createAdminApp(): App {
  try {
    let serviceAccount: ServiceAccount | undefined;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      serviceAccount = {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
      };
    } else if (process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_PRIVATE_KEY) {
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
    }
    if (serviceAccount && (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey)) throw configurationError();
    const projectId = serviceAccount?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || (projectId === DEFAULT_PROJECT_ID ? `${DEFAULT_PROJECT_ID}.firebasestorage.app` : undefined);
    // ADC is supported on managed Google runtimes and GOOGLE_APPLICATION_CREDENTIALS.
    // SDK credential failures propagate; there is deliberately no local-file fallback.
    return initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
      projectId,
      ...(storageBucket ? { storageBucket } : {}),
    }, ADMIN_APP_NAME);
  } catch {
    throw configurationError();
  }
}

/** Server-only, lazy Admin SDK services. Never import this module into browser code. */
export function getAdminServices() {
  const app = getApps().find(candidate => candidate.name === ADMIN_APP_NAME) || createAdminApp();
  return { auth: getAuth(app), db: getFirestore(app), get bucket() { return getStorage(app).bucket(); } };
}
