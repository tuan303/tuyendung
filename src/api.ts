import { auth } from './firebase';

/** Lỗi gọi API, giữ lại mã HTTP để giao diện xử lý riêng 401/403. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** true nếu lỗi là do chưa đăng nhập / token hết hạn (401) hoặc không có quyền (403). */
export function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * fetch kèm header "Authorization: Bearer <Firebase ID token>" của người dùng đang đăng nhập.
 * Firebase SDK tự làm mới token khi sắp hết hạn.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

/**
 * Đọc JSON từ phản hồi. Ném ApiError(json.error || 'Lỗi máy chủ (status)') nếu mã HTTP không phải 2xx,
 * hoặc nếu máy chủ không trả về JSON hợp lệ.
 */
export async function parseJsonResponse<T = any>(res: Response): Promise<T> {
  let data: any = null;
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = data && typeof data.error === 'string' && data.error.trim()
      ? data.error
      : `Lỗi máy chủ (${res.status})`;
    throw new ApiError(message, res.status);
  }

  if (data === null || typeof data !== 'object') {
    throw new ApiError(`Phản hồi không hợp lệ từ máy chủ (${res.status})`, res.status);
  }

  return data as T;
}

/** authFetch + parseJsonResponse. */
export async function authJson<T = any>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(input, init);
  return parseJsonResponse<T>(res);
}
