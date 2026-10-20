import React, { useState, useEffect } from 'react';
import { Mail, Save, Server } from 'lucide-react';
import { authJson, parseJsonResponse, ApiError } from './api';

interface SmtpSettingsResponse {
  success: boolean;
  data?: {
    host?: string;
    port?: string | number;
    user?: string;
    recipient?: string;
    hasPassword?: boolean;
    passwordUsable?: boolean;
  };
}

const UNUSABLE_PASSWORD_MESSAGE =
  'Mật khẩu SMTP đã lưu KHÔNG dùng được (do phiên bản cũ của hệ thống lưu, hoặc khóa SMTP_ENCRYPTION_KEY đã thay đổi) nên hiện hệ thống KHÔNG gửi được email thông báo hồ sơ. ' +
  'Phiên bản cũ từng để lộ mật khẩu này: hãy thu hồi Mật khẩu ứng dụng cũ (myaccount.google.com/apppasswords), tạo mật khẩu mới, nhập vào ô "Mật khẩu ứng dụng" bên dưới rồi bấm "Lưu cấu hình". ' +
  'Đồng thời kiểm tra lại SMTP Host, Email gửi và Email nhận hồ sơ có đúng của nhà trường không.';

type StorageMode = 'firestore' | 'local-file' | 'unconfigured';

const STORAGE_MODE_INFO: Record<StorageMode, { label: string; description: string; type: 'success' | 'info' | 'error' }> = {
  firestore: {
    label: 'Firestore (Firebase)',
    description: 'Hồ sơ ứng tuyển và cấu hình email được lưu an toàn trên Firestore. Đây là chế độ hoạt động chuẩn.',
    type: 'success'
  },
  'local-file': {
    label: 'File trên máy chủ (chế độ thử nghiệm)',
    description: 'Máy chủ chưa có biến môi trường FIREBASE_SERVICE_ACCOUNT nên đang lưu dữ liệu vào file trong thư mục data/. Chế độ này chỉ dùng khi chạy thử trên máy cá nhân.',
    type: 'info'
  },
  unconfigured: {
    label: 'Chưa cấu hình',
    description: 'Máy chủ CHƯA được cấu hình nơi lưu trữ (thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT trên Vercel). Hồ sơ ứng tuyển sẽ không được lưu — cần cấu hình ngay.',
    type: 'error'
  }
};

const getRequestErrorMessage = (error: any, fallback: string): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.';
    if (error.status === 403) return 'Tài khoản của bạn không có quyền quản trị cấu hình email.';
    return error.message;
  }
  if (error?.name === 'AbortError') {
    return 'Quá thời gian chờ phản hồi từ máy chủ. Vui lòng thử lại.';
  }
  if (error instanceof TypeError) {
    return 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng.';
  }
  return error?.message || fallback;
};

export default function SmtpAdmin() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [health, setHealth] = useState<{ text: string; type: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSmtpSettings = async () => {
      setIsLoading(true);
      try {
        const result = await authJson<SmtpSettingsResponse>('/api/smtp-settings');
        if (cancelled) return;
        const data = result.data || {};
        setHost(data.host || '');
        setPort(data.port !== undefined && data.port !== null ? String(data.port) : '');
        setUser(data.user || '');
        setRecipient(data.recipient || '');
        const unusable = !!data.hasPassword && data.passwordUsable === false;
        // Mật khẩu đã lưu nhưng không dùng được: bắt buộc nhập lại (ô mật khẩu trở thành bắt buộc).
        setHasPassword(!!data.hasPassword && !unusable);
        setPass('');
        if (unusable) {
          setMessage({ text: UNUSABLE_PASSWORD_MESSAGE, type: 'error' });
        }
      } catch (error: any) {
        if (cancelled) return;
        console.error("Error fetching SMTP settings:", error);
        setMessage({ text: `Lỗi khi tải cấu hình SMTP: ${getRequestErrorMessage(error, 'Lỗi không xác định')}`, type: 'error' });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSmtpSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildPayload = () => {
    const payload: Record<string, string> = {
      host: host.trim(),
      port: String(port).trim(),
      user: user.trim(),
      recipient: recipient.trim()
    };
    if (pass) payload.pass = pass;
    return payload;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!pass && !hasPassword) {
      setMessage({ text: 'Vui lòng nhập mật khẩu ứng dụng SMTP.', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      await authJson('/api/smtp-settings', {
        method: 'PUT',
        body: JSON.stringify(buildPayload())
      });

      if (pass) {
        setHasPassword(true);
        setPass('');
      }
      setMessage({ text: 'Lưu cấu hình thành công!', type: 'success' });
    } catch (error: any) {
      console.error("Error saving SMTP settings:", error);
      setMessage({ text: `Lỗi khi lưu cấu hình: ${getRequestErrorMessage(error, 'Lỗi không xác định')}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!host.trim() || !String(port).trim() || !user.trim() || !recipient.trim() || (!pass && !hasPassword)) {
      setMessage({ text: 'Vui lòng nhập đầy đủ thông tin SMTP trước khi kiểm tra', type: 'error' });
      return;
    }

    setIsTesting(true);
    setMessage({ text: 'Đang kiểm tra kết nối SMTP (có thể mất tới 30 giây)...', type: 'info' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    try {
      const data = await authJson<{ success: boolean; message?: string }>('/api/test-smtp', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
        signal: controller.signal
      });
      setMessage({ text: data.message || 'Kết nối SMTP thành công!', type: 'success' });
    } catch (error: any) {
      console.error("SMTP Test Error:", error);
      if (error?.name === 'AbortError') {
        setMessage({ text: 'Lỗi: Quá thời gian kết nối (Timeout). Máy chủ SMTP phản hồi quá chậm.', type: 'error' });
      } else if (error instanceof ApiError && error.status !== 401 && error.status !== 403) {
        setMessage({ text: `Lỗi SMTP (${error.status}): ${error.message}`, type: 'error' });
      } else {
        setMessage({ text: `Lỗi kiểm tra SMTP: ${getRequestErrorMessage(error, 'Lỗi không xác định')}`, type: 'error' });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsTesting(false);
    }
  };

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    setHealth({ text: 'Đang kiểm tra kết nối máy chủ...', type: 'info' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
      const data = await parseJsonResponse<{ status?: string; storage?: string }>(res);
      if (data.status !== 'ok') {
        setHealth({ text: 'Máy chủ phản hồi nhưng trạng thái không bình thường. Vui lòng thử lại sau.', type: 'error' });
        return;
      }
      const info = STORAGE_MODE_INFO[data.storage as StorageMode];
      if (info) {
        setHealth({ text: `Máy chủ đang hoạt động. Nơi lưu trữ: ${info.label}. ${info.description}`, type: info.type });
      } else {
        setHealth({ text: `Máy chủ đang hoạt động. Nơi lưu trữ: ${data.storage || 'không xác định'}.`, type: 'info' });
      }
    } catch (error: any) {
      console.error("Health check error:", error);
      setHealth({ text: `Không kết nối được máy chủ: ${getRequestErrorMessage(error, 'Lỗi không xác định')}`, type: 'error' });
    } finally {
      clearTimeout(timeoutId);
      setIsCheckingHealth(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải cấu hình...</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-gray-100">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cấu hình Email (SMTP)</h2>
          <p className="text-sm text-gray-500">Cài đặt máy chủ gửi email cho hệ thống</p>
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl mb-6 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' :
          message.type === 'info' ? 'bg-blue-50 text-blue-700' :
          'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ví dụ: smtp.gmail.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ví dụ: 465 hoặc 587"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email gửi (SMTP User)</label>
          <input
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            placeholder="Ví dụ: no-reply@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Mật khẩu ứng dụng (SMTP Password)</label>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            placeholder={hasPassword ? 'Đã lưu — để trống nếu không đổi' : 'Nhập mật khẩu ứng dụng'}
            required={!hasPassword}
          />
          <p className="mt-2 text-xs text-gray-500">
            {hasPassword
              ? 'Mật khẩu đã được lưu và mã hóa trên máy chủ (không hiển thị lại). Chỉ nhập khi muốn thay đổi. '
              : ''}
            Lưu ý: Nếu dùng Gmail, hãy sử dụng Mật khẩu ứng dụng (App Password), không dùng mật khẩu đăng nhập.
          </p>
        </div>

        <div className="pt-6 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">Email nhận hồ sơ</label>
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            placeholder="Ví dụ: tuyendung@hoangmaistarschool.edu.vn"
            required
          />
          <p className="mt-2 text-xs text-gray-500">Tất cả hồ sơ ứng tuyển sẽ được gửi về địa chỉ email này.</p>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row gap-4">
          <button
            type="submit"
            disabled={isSaving || isTesting}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium disabled:opacity-70"
          >
            <Save className="w-5 h-5" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestSmtp}
            disabled={isSaving || isTesting}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-8 py-3 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50 transition font-medium disabled:opacity-70"
          >
            <span>{isTesting ? 'Đang kiểm tra...' : 'Gửi email thử nghiệm'}</span>
          </button>

          <button
            type="button"
            onClick={handleCheckHealth}
            disabled={isCheckingHealth}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-6 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition text-sm disabled:opacity-70"
          >
            <Server className="w-4 h-4" />
            <span>{isCheckingHealth ? 'Đang kiểm tra...' : 'Kiểm tra kết nối máy chủ'}</span>
          </button>
        </div>

        {health && (
          <div className={`p-4 rounded-xl text-sm ${
            health.type === 'success' ? 'bg-green-50 text-green-700' :
            health.type === 'info' ? 'bg-blue-50 text-blue-700' :
            'bg-red-50 text-red-700'
          }`}>
            {health.text}
          </div>
        )}
      </form>
    </div>
  );
}
