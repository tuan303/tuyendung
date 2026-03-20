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
  const [isTesting, setIsTesting] = useState(false);
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
      // Encrypt password - Try multiple prefixes
      let encryptResponse;
      let usedPrefix = '/api';
      
      try {
        encryptResponse = await fetch('/api/encrypt-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass }),
        });
        const text = await encryptResponse.clone().text();
        if (!encryptResponse.ok || text.includes('<!doctype html>')) {
          throw new Error('Primary API failed');
        }
      } catch (e) {
        console.warn("Primary API failed, trying fallback prefix...");
        usedPrefix = '/backend-api';
        encryptResponse = await fetch('/backend-api/encrypt-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass }),
        });
      }
      
      const status = encryptResponse.status;
      const responseText = await encryptResponse.text();
      
      if (!encryptResponse.ok) {
        let errorMessage = `Server error ${status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `${errorMessage}: ${responseText.substring(0, 50) || 'Empty response'}`;
        }
        throw new Error(errorMessage);
      }
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        if (responseText.includes('<!doctype html>')) {
          throw new Error(`API returned HTML instead of JSON. Prefix ${usedPrefix} might be blocked.`);
        }
        throw new Error(`Invalid JSON response (Status ${status}): ${responseText.substring(0, 50) || 'Empty'}`);
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

  const handleTestSmtp = async () => {
    if (!host || !port || !user || !pass || !recipient) {
      setMessage({ text: 'Vui lòng nhập đầy đủ thông tin SMTP trước khi kiểm tra', type: 'error' });
      return;
    }

    setIsTesting(true);
    setMessage({ text: 'Đang kiểm tra kết nối SMTP (có thể mất tới 30 giây)...', type: 'info' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    try {
      let usedPrefix = '/api';
      let response = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, pass, recipient }),
        signal: controller.signal
      });

      let responseText = await response.text();

      // Fallback to GET or different prefix if POST is blocked (405) or returns HTML/Empty
      if (response.status === 405 || !responseText || responseText.includes('<!doctype html>')) {
        console.warn("Primary POST failed or blocked, trying fallback prefix...");
        usedPrefix = '/backend-api';
        try {
          response = await fetch('/backend-api/test-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, user, pass, recipient }),
            signal: controller.signal
          });
          responseText = await response.text();
        } catch (e) {
          console.error("Fallback POST failed:", e);
        }
      }

      // Final fallback to GET if POST still fails or returns HTML
      if (response.status === 405 || !responseText || responseText.includes('<!doctype html>')) {
        console.warn("POST still failed, trying GET fallback...");
        try {
          const query = new URLSearchParams({ host, port, user, pass, recipient }).toString();
          response = await fetch(`/backend-api/test-smtp?${query}`, {
            method: 'GET',
            signal: controller.signal
          });
          responseText = await response.text();
        } catch (e) {
          console.error("GET fallback failed:", e);
        }
      }

      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json") && responseText && !responseText.includes('<!doctype html>')) {
        try {
          const data = JSON.parse(responseText);
          if (response.ok) {
            setMessage({ text: data.message || 'Kết nối SMTP thành công!', type: 'success' });
          } else {
            setMessage({ text: `Lỗi SMTP (${response.status}): ${data.error || 'Không thể kết nối'}`, type: 'error' });
            console.error("SMTP Error Details:", data.details, data.raw);
          }
        } catch (e) {
          setMessage({ text: `Lỗi xử lý dữ liệu JSON (${response.status}): ${responseText.substring(0, 100)}`, type: 'error' });
        }
      } else {
        // Not JSON - likely HTML or empty
        if (response.status === 405) {
          setMessage({ text: `Lỗi 405: Phương thức POST bị từ chối. Điều này thường do tường lửa (Firewall) của tên miền hoặc máy chủ đang chặn các yêu cầu POST. Vui lòng liên hệ quản trị viên mạng.`, type: 'error' });
        } else if (responseText.includes("<!doctype html>") || responseText.includes("<html>")) {
          setMessage({ text: `Lỗi hệ thống: API đang trả về trang giao diện (HTML) thay vì dữ liệu. Prefix ${usedPrefix} có thể bị chặn.`, type: 'error' });
        } else {
          setMessage({ text: `Lỗi kết nối (${response.status}): ${responseText.substring(0, 100) || 'Phản hồi trống từ server. Có thể do kết nối bị ngắt hoặc timeout.'}`, type: 'error' });
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("SMTP Test Error:", error);
      if (error.name === 'AbortError') {
        setMessage({ text: 'Lỗi: Quá thời gian kết nối (Timeout). Máy chủ SMTP phản hồi quá chậm.', type: 'error' });
      } else {
        setMessage({ text: `Lỗi kết nối API: ${error.message || 'Lỗi không xác định'}`, type: 'error' });
      }
    } finally {
      setIsTesting(false);
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
            onClick={async () => {
              try {
                // Test API ping
                const pingRes = await fetch('/api/ping');
                const pingStatus = pingRes.status;
                const pingText = await pingRes.text();
                
                // Test API test
                const apiRes = await fetch('/api/test');
                const apiStatus = apiRes.status;
                const apiText = await apiRes.text();
                
                const isPingJson = pingRes.headers.get("content-type")?.includes("application/json");
                const isApiJson = apiRes.headers.get("content-type")?.includes("application/json");

                if (pingStatus === 200 && apiStatus === 200 && isPingJson && isApiJson) {
                  alert("✅ KẾT NỐI API THÀNH CÔNG!\n\nBackend server đang hoạt động và trả về đúng định dạng dữ liệu.\nBạn có thể thực hiện 'Gửi email thử nghiệm' để kiểm tra SMTP.");
                } else if (pingStatus === 200 && (pingText.includes("<!doctype html>") || pingText.includes("<html>"))) {
                  alert("⚠️ CẢNH BÁO: API đang trả về trang HTML.\n\nĐiều này thường xảy ra khi server đang khởi động lại hoặc cấu hình chưa khớp. Vui lòng đợi 10-20 giây và thử lại.");
                } else {
                  alert(`❌ LỖI KẾT NỐI API!\nStatus: ${pingStatus}/${apiStatus}\nType: ${pingRes.headers.get("content-type")}\n\nVui lòng kiểm tra lại server.`);
                }
              } catch (e: any) {
                alert(`❌ LỖI KẾT NỐI API: ${e.message}`);
              }
            }}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-8 py-3 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition text-sm"
          >
            <span>Kiểm tra API Backend</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                const results: any = {};
                
                // Test 1: Root Ping V5
                try {
                  const r1 = await fetch('/ping-v5');
                  results.rootPingV5 = { status: r1.status, text: await r1.text() };
                } catch (e: any) { results.rootPingV5 = { error: e.message }; }

                // Test 2: API Ping V5
                try {
                  const r2 = await fetch('/api/ping-v5');
                  results.apiPingV5 = { status: r2.status, text: await r2.text() };
                } catch (e: any) { results.apiPingV5 = { error: e.message }; }

                // Test 3: Backend API Ping V5
                try {
                  const r3 = await fetch('/backend-api/ping-v5');
                  results.backendApiPingV5 = { status: r3.status, text: await r3.text() };
                } catch (e: any) { results.backendApiPingV5 = { error: e.message }; }

                // Test 4: Simple Test
                try {
                  const r4 = await fetch('/simple-test');
                  results.simpleTest = { status: r4.status, text: await r4.text() };
                } catch (e: any) { results.simpleTest = { error: e.message }; }

                alert(`DIAGNOSTIC RESULTS V5:\n${JSON.stringify(results, null, 2)}`);
              } catch (e: any) {
                alert(`DIAGNOSTIC ERROR: ${e.message}`);
              }
            }}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-4 py-3 border border-blue-200 text-blue-500 rounded-xl hover:bg-blue-50 transition text-xs"
          >
            <span>Chẩn đoán hệ thống</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch('/api/post-test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ test: "hello" })
                });
                const text = await res.text();
                try {
                  const data = JSON.parse(text);
                  alert(`DEBUG POST TEST SUCCESS:\nStatus: ${res.status}\nData: ${JSON.stringify(data, null, 2)}`);
                } catch (e) {
                  alert(`DEBUG POST TEST FAILED (Not JSON):\nStatus: ${res.status}\nRaw Response: ${text || '(empty)'}`);
                }
              } catch (e: any) {
                alert(`DEBUG POST TEST ERROR:\n${e.message}`);
              }
            }}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-4 py-3 border border-gray-200 text-gray-400 rounded-xl hover:bg-gray-50 transition text-xs"
          >
            <span>Debug POST</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                let res = await fetch('/api/post-test', { method: 'GET' });
                let text = await res.text();
                
                if (text.includes('<!doctype html>')) {
                  console.warn("Primary GET returned HTML, trying fallback prefix...");
                  res = await fetch('/backend-api/post-test', { method: 'GET' });
                  text = await res.text();
                }

                try {
                  const data = JSON.parse(text);
                  alert(`DEBUG GET TEST SUCCESS:\nStatus: ${res.status}\nData: ${JSON.stringify(data, null, 2)}`);
                } catch (e) {
                  alert(`DEBUG GET TEST FAILED (Not JSON):\nStatus: ${res.status}\nRaw Response: ${text.substring(0, 200) || '(empty)'}`);
                }
              } catch (e: any) {
                alert(`DEBUG GET TEST ERROR:\n${e.message}`);
              }
            }}
            className="flex items-center justify-center space-x-2 w-full sm:w-auto px-4 py-3 border border-gray-200 text-gray-400 rounded-xl hover:bg-gray-50 transition text-xs"
          >
            <span>Debug GET</span>
          </button>
        </div>
      </form>
    </div>
  );
}
