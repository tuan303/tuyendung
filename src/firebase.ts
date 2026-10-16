import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { resolveFirebaseWebConfig } from './lib/firebaseConfig';

// Vite exposes only the deployment environment name through this constant.
declare const __VERCEL_ENV__: string;
const publicEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const deploymentEnv = typeof __VERCEL_ENV__ === 'undefined' ? '' : __VERCEL_ENV__;
const firebaseConfig = resolveFirebaseWebConfig(publicEnv, deploymentEnv);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
