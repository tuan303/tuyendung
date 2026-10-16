import { auth } from '../firebase';

export class AdminApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'AdminApiError'; }
}

export function hasAdminClaim(claims: Record<string, unknown>) {
  const allowedEmails = ['tuan303@gmail.com', 'admin_nshm@nshm.edu.vn', 'tuyendung@hoangmaistarschool.edu.vn'];
  return claims.admin === true || (claims.email_verified === true && typeof claims.email === 'string' && allowedEmails.includes(claims.email));
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.includes('://') || path.includes('\\')) throw new Error('Đường dẫn API không hợp lệ.');
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('Vui lòng đăng nhập lại.', 401);
  const token = await user.getIdTokenResult();
  if (!hasAdminClaim(token.claims)) throw new AdminApiError('Tài khoản chưa được cấp quyền quản trị.', 403);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  const response = await fetch(path, { ...init, headers, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const message = typeof result?.error === 'string' ? result.error : response.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : response.status === 403 ? 'Tài khoản không có quyền thực hiện thao tác.' : `Yêu cầu thất bại (${response.status}).`;
    throw new AdminApiError(message, response.status);
  }
  return response;
}

export async function adminJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await adminFetch(path, init);
  const data = await response.json().catch(() => { throw new Error('Máy chủ trả về dữ liệu không hợp lệ.'); });
  if (data?.success === false) throw new Error(data.error || 'Thao tác chưa được lưu.');
  return data as T;
}

export async function downloadApplicationCv(application: { id: string; fileName?: string }) {
  const response = await adminFetch(`/api/applications/${encodeURIComponent(application.id)}/cv`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = (application.fileName || 'CV').replace(/[\\/\u0000-\u001f\u007f]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the object URL alive until the browser starts the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
