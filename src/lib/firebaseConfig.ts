/** Public Firebase configuration only. Never add server credentials to this module. */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'graphic-pattern-482103-m6';
export const PRODUCTION_FIREBASE_STORAGE_BUCKET = `${PRODUCTION_FIREBASE_PROJECT_ID}.firebasestorage.app`;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

type PublicEnvironment = Record<string, string | undefined>;

const productionConfig: FirebaseWebConfig = {
  apiKey: 'AIzaSyBtsC_4jAhCI7YJd8J-SiTYg9t7WH6Mvm8',
  authDomain: `${PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: PRODUCTION_FIREBASE_PROJECT_ID,
  storageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: '525030358816',
  appId: '1:525030358816:web:31f20398d053bee7c3a145',
  measurementId: 'G-B7XB9K7X2N',
};

const configKeys = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

export function isSeparateFirebaseTarget(projectId: string, bucket: string): boolean {
  return projectId !== PRODUCTION_FIREBASE_PROJECT_ID &&
    bucket !== PRODUCTION_FIREBASE_STORAGE_BUCKET &&
    bucket !== `${PRODUCTION_FIREBASE_PROJECT_ID}.appspot.com`;
}

export function isProjectBucket(projectId: string, bucket: string): boolean {
  return bucket === `${projectId}.firebasestorage.app` || bucket === `${projectId}.appspot.com`;
}

/** A preview must never inherit the live project's web SDK configuration. */
export function resolveFirebaseWebConfig(env: PublicEnvironment = {}, vercelEnv = ''): FirebaseWebConfig {
  const staging = vercelEnv === 'preview' || env.VITE_APP_ENV?.trim() === 'staging';
  const provided = Object.values(configKeys).filter(key => env[key]?.trim());
  const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID?.trim();
  if (!provided.length && !measurementId && !staging) return { ...productionConfig };
  const missing = Object.values(configKeys).filter(key => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Firebase web chưa đủ cấu hình${staging ? ' cho staging/preview' : ''}: ${missing.join(', ')}.`);
  }
  const config = Object.fromEntries(Object.entries(configKeys).map(([field, key]) => [field, env[key]!.trim()])) as unknown as FirebaseWebConfig;
  if (measurementId) config.measurementId = measurementId;
  if (staging) {
    if (!isSeparateFirebaseTarget(config.projectId, config.storageBucket) || config.apiKey === productionConfig.apiKey || config.appId === productionConfig.appId) {
      throw new Error('Staging/preview không được dùng Firebase project, bucket, API key hoặc appId production.');
    }
    if (config.authDomain !== `${config.projectId}.firebaseapp.com` || !isProjectBucket(config.projectId, config.storageBucket)) {
      throw new Error('Firebase authDomain và storageBucket staging/preview phải thuộc đúng project đã cấu hình.');
    }
  }
  return config;
}
