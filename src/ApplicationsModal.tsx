import React, { useState } from 'react';
import { 
  X, Users, Search, Phone, Mail, Calendar, FileText, ExternalLink, 
  Trash2, Download, Check, Copy, Clock, MessageSquare, Plus, AlertCircle, UserPlus, Eye
} from 'lucide-react';
import { Job, Application } from './Admin';
import CvViewer from './CvViewer';

interface ApplicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  applications: Application[];
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onDeleteApplication: (id: string) => Promise<void>;
  onCreateSampleApplication?: (job: Job) => Promise<void>;
  onCreateApplication?: (data: Partial<Application>) => Promise<void>;
}

export function formatTimestamp(timestamp: any): string {
  if (!timestamp) return 'Chưa rõ';
  try {
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (e) {
    console.error("Error formatting timestamp:", e);
  }
  return String(timestamp);
}

/** Trả về URL nếu là link http(s) tuyệt đối hợp lệ; ngược lại null (bỏ qua javascript:, data:, link tương đối...). */
export function getSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // không phải URL tuyệt đối
  }
  return null;
}

export function isGoogleDriveUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === 'drive.google.com' || hostname === 'docs.google.com';
  } catch {
    return false;
  }
}

/** Link CV an toàn của hồ sơ (hỗ trợ bản ghi cũ dùng downloadURL). */
export function getApplicationCvUrl(app: Application): string | null {
  return getSafeHttpUrl(app.cvUrl) || getSafeHttpUrl(app.downloadURL);
}

export function CvAttachment({ app }: { app: Application }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const cvUrl = getApplicationCvUrl(app);

  // File CV lưu trên hệ thống: xem trực tiếp trong trang quản trị
  if (app.cvStorage === 'stored') {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition border border-blue-200 max-w-full min-w-0"
          title={app.fileName ? `Xem CV: ${app.fileName}` : 'Xem CV'}
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="shrink-0">Xem CV</span>
          {app.fileName && (
            <span className="truncate font-normal text-blue-700/80">({app.fileName})</span>
          )}
        </button>
        {viewerOpen && (
          <CvViewer
            applicationId={app.id}
            fileName={app.fileName}
            candidateName={app.name}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </>
    );
  }

  if (cvUrl) {
    const onDrive = app.cvStorage === 'drive' || isGoogleDriveUrl(cvUrl);
    return (
      <a
        href={cvUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition border border-blue-200 max-w-full"
        title={onDrive ? 'Mở CV trên Google Drive' : 'Mở CV'}
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{app.fileName || 'Mở CV'}</span>
        {onDrive && (
          <span className="shrink-0 text-[10px] font-semibold bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
            Google Drive
          </span>
        )}
      </a>
    );
  }

  if (app.cvStorage === 'email_failed') {
    return (
      <span
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded max-w-full"
        title="Email thông báo không gửi được nên file CV ứng viên gửi kèm đã bị mất. Hãy liên hệ ứng viên để xin lại CV."
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          CV KHÔNG gửi được — cần liên hệ ứng viên{app.fileName ? ` (${app.fileName})` : ''}
        </span>
      </span>
    );
  }

  if (app.cvStorage === 'email' || app.fileName) {
    return (
      <span
        className="inline-flex items-center space-x-1.5 text-xs text-gray-600 italic bg-gray-100 px-2 py-1 rounded max-w-full"
        title={app.fileName ? `Tên file: ${app.fileName}` : undefined}
      >
        <Mail className="w-3.5 h-3.5 shrink-0 text-gray-500" />
        <span className="truncate">
          CV gửi kèm email tuyển dụng{app.fileName ? ` (${app.fileName})` : ''}
        </span>
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-500 italic bg-gray-100 px-2 py-1 rounded">
      Không có CV
    </span>
  );
}

/** Mô tả nơi lưu CV (dùng cho file Excel). */
const getCvStorageLabel = (app: Application): string => {
  if (app.cvStorage === 'stored') return 'Lưu trên hệ thống';
  const cvUrl = getApplicationCvUrl(app);
  if (cvUrl) return app.cvStorage === 'drive' || isGoogleDriveUrl(cvUrl) ? 'Google Drive' : 'Link';
  if (app.cvStorage === 'email_failed') return 'CV KHÔNG gửi được — cần liên hệ ứng viên';
  if (app.cvStorage === 'email' || app.fileName) return 'Gửi kèm email tuyển dụng';
  return 'Không có CV';
};

/** Ô CSV an toàn: escape dấu ngoặc kép và chặn công thức Excel (=, +, -, @) từ dữ liệu ứng viên. */
const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

export const exportApplicationsToCSV = (apps: Application[], jobTitle?: string) => {
  const headers = ['STT', 'Họ và tên', 'Ngày sinh', 'Số điện thoại', 'Email', 'Vị trí ứng tuyển', 'File CV', 'Link CV', 'Trạng thái', 'Ghi chú', 'Thời gian nộp'];
  const statusLabels: Record<string, string> = {
    new: 'Mới nộp',
    reviewed: 'Đã xem',
    contacted: 'Đã liên hệ',
    passed: 'Mời phỏng vấn / Đạt',
    rejected: 'Không phù hợp'
  };

  const rows = apps.map((app, index) => [
    index + 1,
    csvCell(app.name),
    csvCell(app.dob),
    csvCell(app.phone),
    csvCell(app.email),
    csvCell(app.jobTitle),
    csvCell(app.fileName),
    csvCell(getApplicationCvUrl(app) || getCvStorageLabel(app)),
    csvCell(statusLabels[app.status || 'new'] || app.status || 'Mới nộp'),
    csvCell(app.notes),
    csvCell(formatTimestamp(app.createdAt))
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeTitle = (jobTitle || 'tat_ca').replace(/[^a-zA-Z0-9]/g, '_');
  link.setAttribute('download', `Ho_so_ung_vien_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function ApplicationsModal({
  isOpen,
  onClose,
  job,
  applications,
  onUpdateStatus,
  onUpdateNotes,
  onDeleteApplication,
  onCreateSampleApplication,
  onCreateApplication
}: ApplicationsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Manual Add Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newCvUrl, setNewCvUrl] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState('new');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  if (!isOpen || !job) return null;

  // Filter applications for this specific job
  const jobNorm = (job.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const jobApplications = applications.filter(app => {
    if (app.jobId && app.jobId === job.id) return true;
    if (app.jobTitle && (app.jobTitle || '').trim().replace(/\s+/g, ' ').toLowerCase() === jobNorm) return true;
    return false;
  });

  // Search and status filtering
  const filteredApps = jobApplications.filter(app => {
    const matchesSearch = 
      (app.name && app.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (app.phone && app.phone.includes(searchTerm)) ||
      (app.email && app.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const currentStatus = app.status || 'new';
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const countByStatus = {
    all: jobApplications.length,
    new: jobApplications.filter(a => (a.status || 'new') === 'new').length,
    reviewed: jobApplications.filter(a => a.status === 'reviewed').length,
    contacted: jobApplications.filter(a => a.status === 'contacted').length,
    passed: jobApplications.filter(a => a.status === 'passed').length,
    rejected: jobApplications.filter(a => a.status === 'rejected').length,
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveNotes = async (appId: string) => {
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(appId, notesValue);
      setEditingNotesId(null);
    } catch (e) {
      console.error("Error saving notes:", e);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleDelete = async (appId: string, candidateName: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa hồ sơ của ứng viên "${candidateName}" không?`)) {
      setDeletingId(appId);
      try {
        await onDeleteApplication(appId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleAddNewCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      alert("Vui lòng nhập họ tên và số điện thoại.");
      return;
    }
    const cvUrlInput = newCvUrl.trim();
    if (cvUrlInput && !getSafeHttpUrl(cvUrlInput)) {
      alert("Link CV phải là đường dẫn bắt đầu bằng http:// hoặc https://");
      return;
    }
    setIsSubmittingNew(true);
    try {
      if (onCreateApplication) {
        await onCreateApplication({
          jobId: job.id,
          jobTitle: job.title,
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim(),
          dob: newDob.trim(),
          cvUrl: cvUrlInput,
          fileName: newFileName.trim() || (cvUrlInput ? 'CV_DinhKem.pdf' : ''),
          notes: newNotes.trim(),
          status: newStatus
        });
      }
      setShowAddForm(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewDob('');
      setNewCvUrl('');
      setNewFileName('');
      setNewNotes('');
      setNewStatus('new');
    } catch (err: any) {
      alert("Lỗi thêm hồ sơ: " + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-[#1a2b4c] to-[#23328c] text-white flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center space-x-2 text-blue-200 text-xs font-semibold uppercase tracking-wider mb-1">
              <Users className="w-4 h-4" />
              <span>Danh sách hồ sơ ứng tuyển</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold leading-tight">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/80">
              <span className="bg-white/20 px-2.5 py-1 rounded-full font-medium">
                Tổng cộng: <strong className="text-white">{jobApplications.length}</strong> hồ sơ
              </span>
              <span>Hạn nộp: {job.deadline}</span>
              {job.department && <span className="bg-blue-900/60 px-2 py-0.5 rounded">{job.department}</span>}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search, Filters & Action Buttons */}
        <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50 shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm ứng viên theo tên, SĐT, email..."
                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#c8102e] focus:border-transparent transition"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Actions: Add Candidate, Export & Create Sample */}
            <div className="flex items-center space-x-2 shrink-0">
              {onCreateApplication && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-[#c8102e] hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
                  title="Nhập thêm hồ sơ ứng viên đã nhận từ email hoặc kênh khác"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showAddForm ? 'Đóng form' : '+ Thêm hồ sơ'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => exportApplicationsToCSV(filteredApps, job.title)}
                disabled={jobApplications.length === 0}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition shadow-xs"
                title="Tải danh sách ứng viên dạng file Excel CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Excel</span>
              </button>

              {onCreateSampleApplication && (
                <button
                  type="button"
                  onClick={() => onCreateSampleApplication(job)}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-xl transition"
                  title="Tạo nhanh 1 hồ sơ mẫu để thử nghiệm tính năng"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mẫu thử</span>
                </button>
              )}
            </div>
          </div>

          {/* Form thêm hồ sơ trực tiếp */}
          {showAddForm && (
            <form onSubmit={handleAddNewCandidate} className="bg-white p-4 rounded-xl border border-red-200 shadow-sm space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#c8102e] flex items-center">
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Nhập thông tin ứng viên đã nhận (qua email hoặc kênh tuyển dụng khác)
                </h4>
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Số điện thoại *</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="VD: 0987123456"
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="VD: ungvien@gmail.com"
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ngày sinh</label>
                  <input
                    type="text"
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                    placeholder="VD: 15/06/1995"
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Link CV (Google Drive/URL)</label>
                  <input
                    type="url"
                    value={newCvUrl}
                    onChange={(e) => setNewCvUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái ban đầu</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                  >
                    <option value="new">Mới nộp</option>
                    <option value="reviewed">Đã xem hồ sơ</option>
                    <option value="contacted">Đã liên hệ</option>
                    <option value="passed">Mời phỏng vấn / Đạt</option>
                    <option value="rejected">Không phù hợp</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú về ứng viên</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ghi chú kinh nghiệm, kết quả liên hệ..."
                  className="w-full text-xs p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-4 py-1.5 bg-[#c8102e] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs"
                >
                  {isSubmittingNew ? 'Đang lưu...' : 'Lưu hồ sơ ứng viên'}
                </button>
              </div>
            </form>
          )}

          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'all' 
                  ? 'bg-gray-800 text-white shadow-xs' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              Tất cả ({countByStatus.all})
            </button>
            <button
              onClick={() => setStatusFilter('new')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'new' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
              }`}
            >
              Mới nộp ({countByStatus.new})
            </button>
            <button
              onClick={() => setStatusFilter('reviewed')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'reviewed' 
                  ? 'bg-purple-600 text-white shadow-xs' 
                  : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
              }`}
            >
              Đã xem ({countByStatus.reviewed})
            </button>
            <button
              onClick={() => setStatusFilter('contacted')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'contacted' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
              }`}
            >
              Đã liên hệ ({countByStatus.contacted})
            </button>
            <button
              onClick={() => setStatusFilter('passed')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'passed' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
              }`}
            >
              Mời PV / Đạt ({countByStatus.passed})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
                statusFilter === 'rejected' 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
              }`}
            >
              Không phù hợp ({countByStatus.rejected})
            </button>
          </div>
        </div>

        {/* Candidate List Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-4">
          {jobApplications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Chưa có hồ sơ ứng tuyển nào</h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                Khi có ứng viên nộp hồ sơ cho vị trí <strong>"{job.title}"</strong> trên trang tuyển dụng, thông tin chi tiết và CV sẽ xuất hiện tại đây.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {onCreateApplication && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#c8102e] hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-md transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Nhập hồ sơ ứng viên đã nhận</span>
                  </button>
                )}
                {onCreateSampleApplication && (
                  <button
                    type="button"
                    onClick={() => onCreateSampleApplication(job)}
                    className="inline-flex items-center space-x-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tạo hồ sơ thử nghiệm</span>
                  </button>
                )}
              </div>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              Không tìm thấy hồ sơ nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            filteredApps.map((app, index) => {
              const status = app.status || 'new';
              const initials = (app.name || 'UV')
                .split(' ')
                .filter(Boolean)
                .slice(-2)
                .map(n => n[0]?.toUpperCase())
                .join('');

              const isEditingNotes = editingNotesId === app.id;

              return (
                <div 
                  key={app.id}
                  className="bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 md:p-5 transition shadow-xs hover:shadow-md"
                >
                  {/* Top Row: Avatar, Name, Time, Status, Delete */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1a2b4c] to-[#c8102e] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {initials}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-base text-gray-900">{app.name}</h4>
                          <span className="text-xs text-gray-400 font-normal">#{index + 1}</span>
                        </div>
                        <div className="flex items-center text-xs text-gray-500 space-x-1.5 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>Nộp lúc: {formatTimestamp(app.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 self-end sm:self-center">
                      {/* Status Dropdown */}
                      <select
                        value={status}
                        onChange={(e) => onUpdateStatus(app.id, e.target.value)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none transition cursor-pointer ${
                          status === 'new'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 focus:ring-blue-500'
                            : status === 'reviewed'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500'
                            : status === 'contacted'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 focus:ring-amber-500'
                            : status === 'passed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-500'
                            : 'bg-rose-50 text-rose-700 border-rose-200 focus:ring-rose-500'
                        }`}
                      >
                        <option value="new">Mới nộp</option>
                        <option value="reviewed">Đã xem hồ sơ</option>
                        <option value="contacted">Đã liên hệ</option>
                        <option value="passed">Mời phỏng vấn / Đạt</option>
                        <option value="rejected">Không phù hợp</option>
                      </select>

                      {/* Delete Application Button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(app.id, app.name)}
                        disabled={deletingId === app.id}
                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition"
                        title="Xóa hồ sơ này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Middle Row: Contact Info & CV */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-3 text-xs text-gray-700">
                    {/* Phone */}
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <div className="flex items-center space-x-2 truncate">
                        <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <a href={`tel:${app.phone}`} className="font-semibold text-blue-600 hover:underline truncate">
                          {app.phone}
                        </a>
                      </div>
                      <button
                        onClick={() => handleCopy(app.phone, `phone-${app.id}`)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded"
                        title="Sao chép số điện thoại"
                      >
                        {copiedId === `phone-${app.id}` ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <div className="flex items-center space-x-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <a href={`mailto:${app.email}`} className="font-medium text-gray-800 hover:underline truncate">
                          {app.email || 'Không có email'}
                        </a>
                      </div>
                      {app.email && (
                        <button
                          onClick={() => handleCopy(app.email, `email-${app.id}`)}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded"
                          title="Sao chép địa chỉ email"
                        >
                          {copiedId === `email-${app.id}` ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Date of Birth */}
                    <div className="flex items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <Calendar className="w-3.5 h-3.5 text-gray-500 mr-2 shrink-0" />
                      <span>Ngày sinh: <strong className="text-gray-800">{app.dob || 'Chưa cung cấp'}</strong></span>
                    </div>
                  </div>

                  {/* CV & Attachments */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center space-x-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className="text-xs text-gray-600 shrink-0">File CV:</span>
                      <CvAttachment app={app} />
                    </div>

                    {/* Notes Trigger */}
                    <div>
                      {!isEditingNotes ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotesId(app.id);
                            setNotesValue(app.notes || '');
                          }}
                          className="flex items-center space-x-1 text-xs text-gray-500 hover:text-[#c8102e] transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{app.notes ? 'Xem / Sửa ghi chú' : '+ Thêm ghi chú'}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Notes Inline Box */}
                  {isEditingNotes && (
                    <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                      <label className="block text-xs font-semibold text-amber-900">
                        Ghi chú của HR / Quản trị viên cho ứng viên này:
                      </label>
                      <textarea
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        placeholder="Nhập ghi chú (VD: Đã hẹn phỏng vấn thứ Sáu lúc 9h30, đánh giá chuyên môn tốt...)"
                        rows={2}
                        maxLength={5000}
                        className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                      />
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-600 text-xs rounded-lg border border-gray-200"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNotes(app.id)}
                          disabled={isSavingNotes}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                        >
                          {isSavingNotes ? 'Đang lưu...' : 'Lưu ghi chú'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Display existing note if not editing */}
                  {!isEditingNotes && app.notes && (
                    <div className="mt-2.5 text-xs bg-amber-50/60 border border-amber-100 rounded-lg p-2.5 text-amber-900 flex items-start space-x-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <strong className="font-semibold text-amber-950">Ghi chú: </strong>
                        <span>{app.notes}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500">
            Hiển thị <strong>{filteredApps.length}</strong> / <strong>{jobApplications.length}</strong> hồ sơ
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-medium text-sm rounded-xl transition shadow-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
