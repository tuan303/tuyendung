import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ApplicationsTab from '../src/ApplicationsTab.tsx';
import ApplicationsModal from '../src/ApplicationsModal.tsx';
import type { Job, Application } from '../src/Admin.tsx';
import { hasAdminClaim } from '../src/lib/adminApi.ts';

const jobs: Job[] = [
  { id: 'open', title: 'Synthetic role', description: '', requirements: '', deadline: '', createdAt: '', authorUid: '' },
  { id: 'hidden', title: 'Synthetic role', description: '', requirements: '', deadline: '', createdAt: '', authorUid: '', isHidden: true },
  { id: 'zero', title: 'Empty role', description: '', requirements: '', deadline: '', createdAt: '', authorUid: '' },
];
const applications: Application[] = [
  { id: '1', jobId: 'open', jobTitle: 'Synthetic role', name: 'Synthetic Internal', phone: '0000000000', email: 'test@example.invalid', cvUrl: '/api/uploads/unsafe.html', fileName: 'test.pdf', status: 'new', createdAt: '2026-01-01' },
  { id: '2', jobId: 'hidden', jobTitle: 'Synthetic role', name: 'Synthetic External', phone: '0000000000', email: 'test@example.invalid', cvUrl: 'https://example.invalid/cv', status: 'passed', createdAt: '2026-01-01' },
  { id: '3', jobTitle: 'Synthetic role', name: 'Synthetic Ambiguous', phone: '0000000000', email: 'test@example.invalid', cvUrl: 'javascript:alert(1)', status: 'new', createdAt: '2026-01-01' },
];
const noop = async () => {};

test('only explicit admin claim or verified allowlisted email authorizes admin UI', () => {
  assert.equal(hasAdminClaim({ admin: true }), true);
  assert.equal(hasAdminClaim({ email: 'tuan303@gmail.com', email_verified: true }), true);
  assert.equal(hasAdminClaim({ email: 'tuan303@gmail.com', email_verified: false }), false);
  assert.equal(hasAdminClaim({ email: 'test@example.invalid', email_verified: true }), false);
  assert.equal(hasAdminClaim({ role: 'admin' }), false);
  assert.equal(hasAdminClaim({ admin: 'true' }), false);
});

test('rendered statistics include hidden/empty roles and never expose internal upload href or executable CV URL', () => {
  const html = renderToStaticMarkup(<ApplicationsTab jobs={jobs} applications={applications} onUpdateStatus={noop} onUpdateNotes={noop} onDeleteApplication={noop} onCreateSampleApplication={noop} />);
  assert.match(html, /Số hồ sơ theo vị trí tuyển dụng/);
  assert.match(html, /Empty role/);
  assert.match(html, /Đã ẩn/);
  assert.match(html, /Chưa xác định vị trí/);
  assert.match(html, /1 hồ sơ trùng tên/);
  assert.match(html, /<option value="open">Synthetic role \(1\)<\/option>/);
  assert.match(html, /<option value="hidden">Synthetic role \(Đã ẩn\) \(1\)<\/option>/);
  assert.match(html, /<option value="zero">Empty role \(0\)<\/option>/);
  assert.match(html, /href="https:\/\/example.invalid\/cv"/);
  assert.doesNotMatch(html, /href="\/api\/uploads|href="javascript:/);
});

test('job modal uses identical ID matching and excludes ambiguous title-only records', () => {
  const html = renderToStaticMarkup(<ApplicationsModal isOpen onClose={() => {}} job={jobs[0]} jobs={jobs} applications={applications} onUpdateStatus={noop} onUpdateNotes={noop} onDeleteApplication={noop} />);
  assert.match(html, /Synthetic Internal/);
  assert.doesNotMatch(html, /Synthetic External|Synthetic Ambiguous|href="\/api\/uploads/);
  assert.match(html, /Tất cả \(1\)/);
});
