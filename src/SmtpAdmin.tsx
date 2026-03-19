import React, { useState, useEffect } from 'react';
import { Mail, Save } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function SmtpAdmin() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    const fetchSmtpSettings = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, 'settings', 'smtp');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setHost(data.host || '');
          setPort(data.port || '');
          setUser(data.user || '');
          setRecipient(data.recipient || '');
          
          if (data.pass) {
            // Decrypt password
            const response = await fetch('/api/decrypt-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ encryptedPassword: data.pass }),
            });
            if (response.ok) {
              const result = await response.json();
              setPass(result.decryptedPassword || '');
            }
          }
        }
      } catch (error) {
        console.error("Error fetching SMTP settings:", error);
        setMessage({ text: 'Lỗi khi tải cấu hình SMTP', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSmtpSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ text: '', type: '' });

    try {
      // Encrypt password
      const encryptResponse = await fetch('/api/encrypt-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      });
      
      const responseText = await encryptResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse JSON response:", responseText);
        throw new Error(`Server returned invalid response: ${responseText.substring(0, 100)}`);
      }

      if (!encryptResponse.ok) {
        throw new Error(responseData.error || 'Failed to encrypt password');
      }
      
      const { encryptedPassword } = responseData;

      // Save to Firestore
      const docRef = doc(db, 'settings', 'smtp');
      await setDoc(docRef, {
        host,
        port,
        user,
        pass: encryptedPassword,
        recipient
      });

      setMessage({ text: 'Lưu cấu hình thành công!', type: 'success' });
    } catch (error: any) {
      console.error("Error saving SMTP settings:", error);
      setMessage({ text: `Lỗi khi lưu cấu hình: ${error.message || 'Lỗi không xác định'}`, type: 'error' });
    } finally {
      setIsSaving(false);
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
        <div className={`p-4 rounded-xl mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
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
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            placeholder="Nhập mật khẩu ứng dụng"
            required
          />
          <p className="mt-2 text-xs text-gray-500">Lưu ý: Nếu dùng Gmail, hãy sử dụng Mật khẩu ứng dụng (App Password), không dùng mật khẩu đăng nhập.</p>
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

        <div className="pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium disabled:opacity-70"
          >
            <Save className="w-5 h-5" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
