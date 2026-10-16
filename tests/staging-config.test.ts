import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET, resolveFirebaseWebConfig } from '../src/lib/firebaseConfig';
import { getAdminServices, resolveAdminFirebaseConfig } from '../src/server/firebaseAdmin';

const project = 'tuyendung-staging-synthetic';
const web = {
  VITE_FIREBASE_API_KEY: 'synthetic-public-staging-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: project,
  VITE_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '100000000001',
  VITE_FIREBASE_APP_ID: '1:100000000001:web:synthetic-staging-only',
};
const server = { FIREBASE_PROJECT_ID: project, FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app` };
const account = (projectId = project) => JSON.stringify({ project_id: projectId, client_email: `synthetic@${projectId}.iam.gserviceaccount.com`, private_key: 'SYNTHETIC-NOT-A-REAL-KEY' });

test('production web and server defaults remain compatible without public overrides', () => {
  assert.equal(resolveFirebaseWebConfig({}).projectId, PRODUCTION_FIREBASE_PROJECT_ID);
  assert.equal(resolveFirebaseWebConfig({}, 'production').storageBucket, PRODUCTION_FIREBASE_STORAGE_BUCKET);
  assert.deepEqual(resolveAdminFirebaseConfig({}), { projectId: PRODUCTION_FIREBASE_PROJECT_ID, storageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET });
  const custom = resolveFirebaseWebConfig(web);
  assert.equal(custom.projectId, project);
  assert.equal(custom.measurementId, undefined, 'A staging/custom project must not inherit production analytics');
});

test('any partial web override fails instead of mixing Firebase projects', () => {
  for (const key of Object.keys(web)) {
    const partial = { ...web };
    delete partial[key as keyof typeof partial];
    assert.throws(() => resolveFirebaseWebConfig(partial), /chưa đủ cấu hình/, key);
  }
  assert.throws(() => resolveFirebaseWebConfig({ VITE_FIREBASE_MEASUREMENT_ID: 'synthetic-only' }), /chưa đủ cấu hình/);
});

test('Vercel Preview and explicitly selected staging require a complete separate web target', () => {
  assert.throws(() => resolveFirebaseWebConfig({}, 'preview'), /staging\/preview/);
  assert.throws(() => resolveFirebaseWebConfig({ VITE_APP_ENV: 'staging' }), /staging\/preview/);
  assert.throws(() => resolveFirebaseWebConfig({ VITE_APP_ENV: 'production' }, 'preview'), /staging\/preview/);
  assert.equal(resolveFirebaseWebConfig(web, 'preview').projectId, project);
  assert.equal(resolveFirebaseWebConfig({ ...web, VITE_APP_ENV: 'staging' }).authDomain, `${project}.firebaseapp.com`);
  assert.equal(resolveFirebaseWebConfig({ ...web, VITE_FIREBASE_STORAGE_BUCKET: `${project}.appspot.com` }, 'preview').storageBucket, `${project}.appspot.com`);
});

test('staging web rejects every known production target including the Auth API key', () => {
  const production = resolveFirebaseWebConfig({});
  for (const changes of [
    { VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID },
    { VITE_FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET },
    { VITE_FIREBASE_STORAGE_BUCKET: `${PRODUCTION_FIREBASE_PROJECT_ID}.appspot.com` },
    { VITE_FIREBASE_AUTH_DOMAIN: production.authDomain },
    { VITE_FIREBASE_API_KEY: production.apiKey },
    { VITE_FIREBASE_APP_ID: production.appId },
  ]) assert.throws(() => resolveFirebaseWebConfig({ ...web, ...changes }, 'preview'), /production|đúng project/);
  assert.throws(() => resolveFirebaseWebConfig({ ...web, VITE_FIREBASE_STORAGE_BUCKET: 'some-other-project.firebasestorage.app' }, 'preview'), /đúng project/);
});

test('server staging requires explicit project and bucket with no ADC/default fallback', () => {
  for (const context of [{ VERCEL_ENV: 'preview' }, { APP_ENV: 'staging' }]) {
    for (const input of [{}, { FIREBASE_PROJECT_ID: project }, { FIREBASE_STORAGE_BUCKET: server.FIREBASE_STORAGE_BUCKET }, { GOOGLE_CLOUD_PROJECT: project }, { FIREBASE_SERVICE_ACCOUNT: account() }]) {
      assert.throws(() => resolveAdminFirebaseConfig({ ...context, ...input }), /khai báo rõ ràng/);
    }
    assert.deepEqual(resolveAdminFirebaseConfig({ ...context, ...server }), { projectId: project, storageBucket: server.FIREBASE_STORAGE_BUCKET });
  }
});

test('server preview rejects production and a bucket from a different project before parsing credentials', () => {
  for (const changes of [
    { FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID },
    { FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET },
    { FIREBASE_STORAGE_BUCKET: `${PRODUCTION_FIREBASE_PROJECT_ID}.appspot.com` },
    { FIREBASE_STORAGE_BUCKET: 'other-synthetic.firebasestorage.app' },
  ]) assert.throws(() => resolveAdminFirebaseConfig({ VERCEL_ENV: 'preview', ...server, ...changes, FIREBASE_SERVICE_ACCOUNT: 'not-json' }), /production/);
});

test('server service accounts must match the explicitly selected staging project', () => {
  assert.throws(() => resolveAdminFirebaseConfig({ APP_ENV: 'staging', ...server, FIREBASE_SERVICE_ACCOUNT: account(PRODUCTION_FIREBASE_PROJECT_ID) }), /không thuộc/);
  assert.throws(() => resolveAdminFirebaseConfig({ APP_ENV: 'staging', ...server, FIREBASE_CLIENT_EMAIL: `synthetic@${PRODUCTION_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`, FIREBASE_PRIVATE_KEY: 'SYNTHETIC' }), /đúng project/);
  const resolved = resolveAdminFirebaseConfig({ APP_ENV: 'staging', ...server, FIREBASE_SERVICE_ACCOUNT: account() });
  assert.equal(resolved.projectId, project);
  assert.equal(resolved.serviceAccount?.privateKey, 'SYNTHETIC-NOT-A-REAL-KEY');
  assert.throws(() => resolveAdminFirebaseConfig({ ...server, FIREBASE_SERVICE_ACCOUNT: account('different-synthetic') }), /không thuộc/);
});

test('misconfigured preview fails before creating an Admin SDK app or credential', () => {
  const keys = ['VERCEL_ENV', 'APP_ENV', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_SERVICE_ACCOUNT'];
  const prior = new Map(keys.map(key => [key, process.env[key]]));
  const appNames = getApps().map(app => app.name);
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.FIREBASE_PROJECT_ID = PRODUCTION_FIREBASE_PROJECT_ID;
    process.env.FIREBASE_STORAGE_BUCKET = PRODUCTION_FIREBASE_STORAGE_BUCKET;
    process.env.FIREBASE_SERVICE_ACCOUNT = 'INVALID-SYNTHETIC-CREDENTIAL-MUST-NOT-BE-PARSED';
    assert.throws(getAdminServices, { status: 503 });
    assert.deepEqual(getApps().map(app => app.name), appNames);
  } finally {
    for (const [key, value] of prior) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
