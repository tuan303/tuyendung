import test from 'node:test';
import assert from 'node:assert/strict';
import { auth } from '../src/firebase.ts';
import { adminFetch, adminJson, AdminApiError } from '../src/lib/adminApi.ts';

// Every auth method and network call is synthetic. No identity service or external API is contacted.
test('admin API refuses anonymous/unauthorized users before fetch and sends token only to same-origin API paths', async () => {
  const originalUser = auth.currentUser;
  const originalFetch = globalThis.fetch;
  const requests: { path: string; init?: RequestInit }[] = [];
  const setUser = (claims?: Record<string, unknown>) => {
    (auth as any).currentUser = claims ? { uid: 'synthetic-admin', getIdTokenResult: async () => ({ claims }), getIdToken: async () => 'synthetic-test-token' } : null;
  };
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    requests.push({ path, init });
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    setUser();
    await assert.rejects(() => adminFetch('/api/applications'), (error: AdminApiError) => error.status === 401);
    setUser({ email: 'test@example.invalid', email_verified: true });
    await assert.rejects(() => adminFetch('/api/applications'), (error: AdminApiError) => error.status === 403);
    assert.equal(requests.length, 0);
    setUser({ admin: true });
    await assert.rejects(() => adminFetch('https://attacker.invalid/api/applications'));
    assert.equal(requests.length, 0);
    await adminFetch('/api/applications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"status":"new"}' });
    assert.equal(requests.length, 1);
    assert.equal(new Headers(requests[0].init?.headers).get('Authorization'), 'Bearer synthetic-test-token');
    assert.equal(requests[0].init?.cache, 'no-store');
    assert.equal(requests[0].init?.redirect, 'error');
  } finally {
    (auth as any).currentUser = originalUser;
    globalThis.fetch = originalFetch;
  }
});

test('failed requests and false success responses reject instead of returning optimistic success', async () => {
  const originalUser = auth.currentUser;
  const originalFetch = globalThis.fetch;
  (auth as any).currentUser = { uid: 'synthetic-admin', getIdTokenResult: async () => ({ claims: { admin: true } }), getIdToken: async () => 'synthetic-test-token' };
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Synthetic save failure' }), { status: 503 })) as typeof fetch;
    await assert.rejects(() => adminJson('/api/applications'), /Synthetic save failure/);
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error: 'Synthetic rejected save' }), { status: 200 })) as typeof fetch;
    await assert.rejects(() => adminJson('/api/applications'), /Synthetic rejected save/);
    globalThis.fetch = (async () => new Response('<html>not an API</html>', { status: 200 })) as typeof fetch;
    await assert.rejects(() => adminJson('/api/applications'), /không hợp lệ/);
  } finally {
    (auth as any).currentUser = originalUser;
    globalThis.fetch = originalFetch;
  }
});
