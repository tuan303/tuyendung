import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { resolveFirebaseWebConfig } from './src/lib/firebaseConfig';

export default defineConfig(({ mode }) => {
  // This is a deployment label, never a credential or an export of process.env.
  const vercelEnv = ['preview', 'production', 'development'].includes(process.env.VERCEL_ENV || '') ? process.env.VERCEL_ENV! : '';
  const publicEnv = loadEnv(mode, process.cwd(), 'VITE_');
  // Refuse unsafe preview builds before they produce a deployable artifact.
  resolveFirebaseWebConfig(publicEnv, vercelEnv);
  return {
    define: { __VERCEL_ENV__: JSON.stringify(vercelEnv) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
