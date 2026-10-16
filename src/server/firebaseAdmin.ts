import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isProjectBucket, isSeparateFirebaseTarget, PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET } from '../lib/firebaseConfig';

const ADMIN_APP_NAME = 'tuyendung-server';

type ServerEnvironment = Record<string, string | undefined>;
export interface AdminFirebaseConfig { projectId: string; storageBucket?: string; serviceAccount?: ServiceAccount; }

/** Pure preflight: validates the target before creating any SDK app or credential. */
export function resolveAdminFirebaseConfig(env: ServerEnvironment = {}): AdminFirebaseConfig {
  const staging = env.VERCEL_ENV === 'preview' || env.APP_ENV?.trim() === 'staging';
  const explicitProject = env.FIREBASE_PROJECT_ID?.trim();
  const explicitBucket = env.FIREBASE_STORAGE_BUCKET?.trim();
  if (staging && (!explicitProject || !explicitBucket)) {
    throw new Error('Staging/preview cần FIREBASE_PROJECT_ID và FIREBASE_STORAGE_BUCKET riêng, được khai báo rõ ràng.');
  }
  if (staging && (!isSeparateFirebaseTarget(explicitProject!, explicitBucket!) || !isProjectBucket(explicitProject!, explicitBucket!))) {
    throw new Error('Staging/preview không được dùng Firebase production; bucket phải thuộc đúng project staging.');
  }
  let serviceAccount: ServiceAccount | undefined;
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    serviceAccount = {
      projectId: parsed.project_id || parsed.projectId,
      clientEmail: parsed.client_email || parsed.clientEmail,
      privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
    };
  } else if (env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      projectId: explicitProject,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }
  if (serviceAccount && (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey)) {
    throw new Error('Firebase service account chưa đủ projectId, clientEmail hoặc privateKey.');
  }
  if (serviceAccount && explicitProject && serviceAccount.projectId !== explicitProject) {
    throw new Error('Firebase service account không thuộc FIREBASE_PROJECT_ID đã cấu hình.');
  }
  if (staging && serviceAccount && !serviceAccount.clientEmail?.endsWith(`@${explicitProject}.iam.gserviceaccount.com`)) {
    throw new Error('Firebase service account staging/preview phải thuộc đúng project staging.');
  }
  const projectId = serviceAccount?.projectId || explicitProject || env.GOOGLE_CLOUD_PROJECT || PRODUCTION_FIREBASE_PROJECT_ID;
  const storageBucket = explicitBucket || (projectId === PRODUCTION_FIREBASE_PROJECT_ID ? PRODUCTION_FIREBASE_STORAGE_BUCKET : undefined);
  return { projectId, ...(storageBucket ? { storageBucket } : {}), ...(serviceAccount ? { serviceAccount } : {}) };
}

function configurationError(): Error & { status: number } {
  return Object.assign(new Error('Dịch vụ lưu trữ chưa được cấu hình. Vui lòng liên hệ quản trị viên.'), { status: 503 });
}

function createAdminApp(config: AdminFirebaseConfig): App {
  try {
    const { serviceAccount, projectId, storageBucket } = config;
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
  try {
    const config = resolveAdminFirebaseConfig(process.env);
    const previous = getApps().find(candidate => candidate.name === ADMIN_APP_NAME);
    if (previous && (previous.options.projectId !== config.projectId || previous.options.storageBucket !== config.storageBucket)) throw configurationError();
    const app = previous || createAdminApp(config);
    return { auth: getAuth(app), db: getFirestore(app), get bucket() { return getStorage(app).bucket(); } };
  } catch { throw configurationError(); }
}
