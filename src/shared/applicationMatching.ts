/** One application belongs to at most one job. IDs are authoritative; title fallback is legacy-only. */
export interface MatchableJob { id: string; title: string; isHidden?: boolean }
export interface MatchableApplication { id: string; jobId?: string; jobTitle?: string; status?: string }
export const UNMATCHED_JOB = '__unmatched__';
export const APPLICATION_STATUSES = ['new', 'reviewed', 'contacted', 'passed', 'rejected', 'other'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'Mới nộp', reviewed: 'Đã xem', contacted: 'Đã liên hệ',
  passed: 'Mời phỏng vấn / Đạt', rejected: 'Không phù hợp', other: 'Khác',
};
export const normalizeJobTitle = (title = '') => title.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
export const applicationStatus = (status?: string): ApplicationStatus =>
  !status ? 'new' : APPLICATION_STATUSES.includes(status as ApplicationStatus) ? status as ApplicationStatus : 'other';
export const emptyStatusCounts = (): Record<ApplicationStatus, number> => ({ new: 0, reviewed: 0, contacted: 0, passed: 0, rejected: 0, other: 0 });
export function countApplicationStatuses(applications: MatchableApplication[]) {
  const counts = emptyStatusCounts();
  for (const application of applications) counts[applicationStatus(application.status)]++;
  return counts;
}

export function createApplicationMatcher(jobs: MatchableJob[]) {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const byTitle = new Map<string, MatchableJob[]>();
  for (const job of jobs) {
    const title = normalizeJobTitle(job.title);
    if (title) byTitle.set(title, [...(byTitle.get(title) || []), job]);
  }
  return (application: MatchableApplication): { jobId: string | null; reason: 'id' | 'legacy-title' | 'unknown-id' | 'ambiguous-title' | 'unknown-title' } => {
    if (application.jobId?.trim()) {
      return byId.has(application.jobId) ? { jobId: application.jobId, reason: 'id' } : { jobId: null, reason: 'unknown-id' };
    }
    const candidates = byTitle.get(normalizeJobTitle(application.jobTitle));
    return candidates?.length === 1
      ? { jobId: candidates[0].id, reason: 'legacy-title' }
      : { jobId: null, reason: candidates?.length ? 'ambiguous-title' : 'unknown-title' };
  };
}

export function buildApplicationStatistics<J extends MatchableJob, A extends MatchableApplication>(jobs: J[], applications: A[]) {
  const match = createApplicationMatcher(jobs);
  const rows = jobs.map(job => ({ job, applications: [] as A[], total: 0, statuses: emptyStatusCounts() }));
  const byJobId = new Map(rows.map(row => [row.job.id, row]));
  const unmatched: A[] = [];
  let ambiguousCount = 0;
  for (const application of applications) {
    const result = match(application);
    const row = result.jobId ? byJobId.get(result.jobId) : undefined;
    if (row) {
      row.applications.push(application);
      row.total++;
      row.statuses[applicationStatus(application.status)]++;
    } else {
      unmatched.push(application);
      if (result.reason === 'ambiguous-title') ambiguousCount++;
    }
  }
  return { rows, byJobId, unmatched, unmatchedStatuses: countApplicationStatuses(unmatched), ambiguousCount, total: applications.length, statuses: countApplicationStatuses(applications), match };
}

/** Quote all cells, and neutralize spreadsheet formulas even after leading whitespace/control characters. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function applicationsCsv<A extends MatchableApplication & { name?: string; dob?: string; phone?: string; email?: string; fileName?: string; notes?: string; createdAt?: unknown }>(
  applications: A[], jobs: MatchableJob[], formatDate: (value: unknown) => string,
) {
  const statistics = buildApplicationStatistics(jobs, applications);
  const headers = ['STT', 'Họ và tên', 'Ngày sinh', 'Số điện thoại', 'Email', 'Vị trí ứng tuyển', 'Mã vị trí', 'Phân loại vị trí', 'File CV', 'Trạng thái', 'Ghi chú', 'Thời gian nộp'];
  const rows = applications.map((app, index) => {
    const result = statistics.match(app);
    const job = result.jobId ? statistics.byJobId.get(result.jobId)?.job : undefined;
    return [index + 1, app.name, app.dob, app.phone, app.email, job?.title || app.jobTitle, job?.id || '', result.jobId ? 'Đã xác định' : 'Chưa xác định', app.fileName, STATUS_LABELS[applicationStatus(app.status)], app.notes, formatDate(app.createdAt)].map(csvCell).join(',');
  });
  return '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\r\n');
}
