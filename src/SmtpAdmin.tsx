import React, { useState, useEffect } from 'react';
import { Mail, Save } from 'lucide-react';
import { adminJson } from './lib/adminApi';

type SmtpSettings = { host: string; port: string | number; user: string; recipient: string; configured: boolean; hasPassword: boolean; source?: string };

export default function SmtpAdmin() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [recipient, setRecipient] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const applySettings = (settings: SmtpSettings) => {
    setHost(settings.host || '');
    setPort(String(settings.port || '587'));
    setUser(settings.user || '');
    setRecipient(settings.recipient || '');
    setHasPassword(settings.hasPassword === true);
    setConfigured(settings.configured === true);
    setDirty(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const settings = await adminJson<SmtpSettings>('/api/smtp-settings', { signal: controller.signal });
        if (!controller.signal.aborted) applySettings(settings);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setMessage({ text: error instanceof Error ? error.message : 'Không tải được cấu hình SMTP.', type: 'error' });
        }
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage({ text: '', type: '' });
    try {
      const settings = await adminJson<SmtpSettings>('/api/smtp-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), port: Number(port), user: user.trim(), recipient: recipient.trim(), ...(password ? { password } : {}) }),
      });
      applySettings(settings);
      setMessage({ text: 'Đã lưu cấu hình email.', type: 'success' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Không lưu được cấu hình SMTP.', type: 'error' });
    } finally {
      // The secret is write-only, and is never populated from API/Firestore or persisted in browser storage.
      setPassword('');
      setIsSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setIsTesting(true);
    setMessage({ text: 'Đang gửi email thử bằng cấu hình đã lưu...', type: 'info' });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const result = await adminJson<{ message?: string }>('/api/test-smtp', { method: 'POST', signal: controller.signal });
      setMessage({ text: result.message || 'Đã gửi email thử nghiệm.', type: 'success' });
    } catch (error) {
      setMessage({ text: error instanceof Error && error.name === 'AbortError' ? 'Máy chủ email phản hồi quá thời gian. Vui lòng thử lại.' : error instanceof Error ? error.message : 'Không gửi được email thử nghiệm.', type: 'error' });
    } finally { window.clearTimeout(timeout); setIsTesting(false); }
  };

  if (isLoading) return <div role="status" className="p-8 text-center text-gray-500">Đang tải cấu hình...</div>;

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-gray-100">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><Mail className="w-5 h-5" /></div>
        <div><h2 className="text-xl font-bold text-gray-900">Cấu hình Email (SMTP)</h2><p className="text-sm text-gray-500">Cài đặt máy chủ gửi email cho hệ thống</p></div>
      </div>
      {message.text && <div role={message.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-xl mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : message.type === 'info' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>}
      <form onSubmit={handleSave} onChange={() => setDirty(true)} className="space-y-6 max-w-2xl">
        <fieldset disabled={loadFailed || isSaving || isTesting} className="space-y-6 disabled:opacity-70">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label htmlFor="smtp-host" className="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label><input id="smtp-host" value={host} onChange={event => setHost(event.target.value)} className={inputClass} placeholder="smtp.gmail.com" required /></div>
            <div><label htmlFor="smtp-port" className="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label><input id="smtp-port" type="number" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} className={inputClass} placeholder="465 hoặc 587" required /></div>
          </div>
          <div><label htmlFor="smtp-user" className="block text-sm font-medium text-gray-700 mb-2">Email gửi (SMTP User)</label><input id="smtp-user" type="email" value={user} onChange={event => setUser(event.target.value)} className={inputClass} placeholder="no-reply@example.com" required /></div>
          <div>
            <label htmlFor="smtp-password" className="block text-sm font-medium text-gray-700 mb-2">Mật khẩu ứng dụng (SMTP Password)</label>
            <input id="smtp-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} placeholder={hasPassword ? 'Để trống để giữ mật khẩu đã lưu' : 'Nhập mật khẩu ứng dụng mới'} required={!hasPassword} />
            <p className="mt-2 text-xs text-gray-500">{hasPassword ? 'Mật khẩu đã được cấu hình. Để trống để giữ nguyên; nhập mới để thay thế.' : 'Nhập mật khẩu ứng dụng để gửi email.'} Nếu dùng Gmail, hãy dùng App Password.</p>
          </div>
          <div className="pt-6 border-t border-gray-100"><label htmlFor="smtp-recipient" className="block text-sm font-medium text-gray-700 mb-2">Email nhận hồ sơ</label><input id="smtp-recipient" type="email" value={recipient} onChange={event => setRecipient(event.target.value)} className={inputClass} placeholder="tuyendung@example.com" required /><p className="mt-2 text-xs text-gray-500">Thông báo hồ sơ ứng tuyển sẽ được gửi về địa chỉ này.</p></div>
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <button type="submit" disabled={isSaving || isTesting} className="flex items-center justify-center space-x-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium disabled:opacity-70"><Save className="w-5 h-5" /><span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span></button>
            <button type="button" onClick={() => void handleTestSmtp()} disabled={!configured || dirty || isSaving || isTesting} className="px-8 py-3 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed">{isTesting ? 'Đang gửi...' : 'Gửi email thử nghiệm'}</button>
          </div>
          {dirty && <p className="text-sm text-gray-500">Lưu cấu hình trước khi gửi email thử nghiệm.</p>}
        </fieldset>
      </form>
    </div>
  );
}
