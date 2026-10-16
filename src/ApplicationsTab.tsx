import React, { useState, useMemo } from 'react';
import { 
  Users, Search, Filter, Download, Plus, Clock, Phone, Mail, 
  Calendar, FileText, ExternalLink, Trash2, Check, Copy, MessageSquare, 
  Briefcase, CheckCircle2, UserCheck, AlertCircle, UserPlus 
} from 'lucide-react';
import type { Job, Application } from './Admin';
import { downloadApplicationCv } from './lib/adminApi';
import { safeExternalUrl } from './lib/safeHtml';
import { buildApplicationStatistics, applicationStatus, APPLICATION_STATUSES, STATUS_LABELS, UNMATCHED_JOB } from './shared/applicationMatching';
import { formatTimestamp, exportApplicationsToCSV } from './ApplicationsModal';

interface ApplicationsTabProps {
  jobs: Job[];
  applications: Application[];
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onDeleteApplication: (id: string) => Promise<void>;
  onCreateSampleApplication: (job?: Job) => Promise<void>;
  onCreateApplication?: (data: Partial<Application>) => Promise<void>;
}

export default function ApplicationsTab({
  jobs,
  applications,
  onUpdateStatus,
  onUpdateNotes,
  onDeleteApplication,
  onCreateSampleApplication,
  onCreateApplication
}: ApplicationsTabProps) {
  const [selectedJobIdFilter, setSelectedJobIdFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Manual Add Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJobId, setNewJobId] = useState<string>(jobs.length > 0 ? jobs[0].id : '');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newCvUrl, setNewCvUrl] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState('new');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const statistics = useMemo(() => buildApplicationStatistics(jobs, applications), [jobs, applications]);
  const totalCount = statistics.total;
  const newCount = statistics.statuses.new;
  const contactedCount = statistics.statuses.contacted;
  const passedCount = statistics.statuses.passed;

  // Filter applications
  const filteredApps = applications.filter(app => {
    const matchedJobId = statistics.match(app).jobId;
    const matchesJob = selectedJobIdFilter === 'all' ||
      (selectedJobIdFilter === UNMATCHED_JOB ? matchedJobId === null : matchedJobId === selectedJobIdFilter);

    // Status filter
    const currentStatus = applicationStatus(app.status);
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

    // Search filter
    const matchesSearch = !searchTerm || 
      (app.name && app.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (app.phone && app.phone.includes(searchTerm)) ||
      (app.email && app.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (app.jobTitle && app.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesJob && matchesStatus && matchesSearch;
  });

  const runAction = async (action: () => Promise<void>) => {
    setActionError('');
    try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Thao tác thất bại.'); }
  };

  const handleDownload = async (app: Application) => {
    setDownloadingId(app.id);
    await runAction(() => downloadApplicationCv(app));
    setDownloadingId(null);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => setActionError('Không sao chép được vào bộ nhớ tạm.'));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveNotes = async (appId: string) => {
    setActionError('');
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(appId, notesValue);
      setEditingNotesId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Không lưu được ghi chú.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleDelete = async (appId: string, candidateName: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa hồ sơ của ứng viên "${candidateName}" không?`)) {
      setActionError('');
      setDeletingId(appId);
      try {
        await onDeleteApplication(appId);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Không xóa được hồ sơ.');
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
    const matchedJob = jobs.find(j => j.id === (newJobId || jobs[0]?.id));
    if (!matchedJob) {
      alert("Vui lòng chọn vị trí tuyển dụng.");
      return;
    }

    if (newCvUrl && !safeExternalUrl(newCvUrl.trim())) {
      setActionError('Link CV phải là địa chỉ HTTP hoặc HTTPS hợp lệ.');
      return;
    }
    setIsSubmittingNew(true);
    setActionError('');
    try {
      if (onCreateApplication) {
        await onCreateApplication({
          jobId: matchedJob.id,
          jobTitle: matchedJob.title,
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim(),
          dob: newDob.trim(),
          cvUrl: newCvUrl.trim(),
          downloadURL: newCvUrl.trim(),
          fileName: newCvUrl ? 'CV_DinhKem.pdf' : '',
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
      setNewNotes('');
      setNewStatus('new');
    } catch (err: any) {
      setActionError('Lỗi thêm hồ sơ: ' + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</div>}
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="text-xs text-gray-500 font-medium">Tổng số hồ sơ</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-700">{newCount}</div>
            <div className="text-xs text-gray-500 font-medium">Hồ sơ mới nộp</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700">{contactedCount}</div>
            <div className="text-xs text-gray-500 font-medium">Đã liên hệ</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-700">{passedCount}</div>
            <div className="text-xs text-gray-500 font-medium">Mời PV / Đạt</div>
          </div>
        </div>
      </div>

      <section aria-labelledby="position-statistics-title" className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 md:p-6 border-b border-gray-100">
          <h2 id="position-statistics-title" className="text-xl font-bold text-gray-900">Số hồ sơ theo vị trí tuyển dụng</h2>
          <p className="text-sm text-gray-500 mt-1">Thống kê tất cả hồ sơ, gồm cả vị trí đã ẩn và chưa có hồ sơ. Nhấn vào vị trí để lọc danh sách bên dưới.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600"><tr>
              <th scope="col" className="px-5 py-3 min-w-56">Vị trí</th>
              <th scope="col" className="px-3 py-3 text-center">Tổng hồ sơ</th>
              {APPLICATION_STATUSES.map(status => <th scope="col" key={status} className="px-3 py-3 text-center whitespace-nowrap">{STATUS_LABELS[status]}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {statistics.rows.map(row => <tr key={row.job.id} className={selectedJobIdFilter === row.job.id ? 'bg-red-50' : 'hover:bg-gray-50'} onClick={() => setSelectedJobIdFilter(row.job.id)}>
                <th scope="row" className="px-5 py-3 font-medium">
                  <button type="button" onClick={() => setSelectedJobIdFilter(row.job.id)} className="text-left text-blue-700 hover:underline focus-visible:underline">
                    {row.job.title} {row.job.isHidden && <span className="ml-1 text-xs text-gray-500">(Đã ẩn)</span>}
                    <span className="block text-xs font-normal text-gray-500">{row.job.department || 'Vị trí tuyển dụng'} · {row.job.id}</span>
                  </button>
                </th>
                <td className="px-3 py-3 text-center font-bold text-gray-900">{row.total}</td>
                {APPLICATION_STATUSES.map(status => <td key={status} className="px-3 py-3 text-center">{row.statuses[status]}</td>)}
              </tr>)}
              <tr className={selectedJobIdFilter === UNMATCHED_JOB ? 'bg-amber-50' : 'hover:bg-amber-50/50'} onClick={() => setSelectedJobIdFilter(UNMATCHED_JOB)}>
                <th scope="row" className="px-5 py-3 font-medium">
                  <button type="button" onClick={() => setSelectedJobIdFilter(UNMATCHED_JOB)} className="text-left text-amber-800 hover:underline">Chưa xác định vị trí<span className="block text-xs font-normal text-gray-500">Vị trí đã xóa, không khớp hoặc trùng tên ({statistics.ambiguousCount} hồ sơ trùng tên)</span></button>
                </th>
                <td className="px-3 py-3 text-center font-bold">{statistics.unmatched.length}</td>
                {APPLICATION_STATUSES.map(status => <td key={status} className="px-3 py-3 text-center">{statistics.unmatchedStatuses[status]}</td>)}
              </tr>
            </tbody>
            <tfoot className="border-t bg-gray-50 font-bold"><tr>
              <th scope="row" className="px-5 py-3"><button type="button" onClick={() => setSelectedJobIdFilter('all')} className="hover:underline">Tất cả vị trí</button></th>
              <td className="px-3 py-3 text-center">{statistics.total}</td>
              {APPLICATION_STATUSES.map(status => <td key={status} className="px-3 py-3 text-center">{statistics.statuses[status]}</td>)}
            </tr></tfoot>
          </table>
        </div>
      </section>

      {/* Main Filter & List Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 md:p-6 space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
              <span>Danh sách hồ sơ ứng tuyển</span>
              <span className="bg-red-50 text-[#c8102e] text-xs font-semibold py-1 px-3 rounded-full border border-red-100">
                {filteredApps.length} hồ sơ
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Xem và quản lý tất cả thông tin ứng viên đã nộp đơn qua website hoặc nhận trực tiếp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onCreateApplication && (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-[#c8102e] hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
                title="Nhập thêm hồ sơ ứng viên"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{showAddForm ? 'Đóng form' : '+ Thêm hồ sơ'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => exportApplicationsToCSV(filteredApps, jobs)}
              disabled={applications.length === 0}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel ({filteredApps.length})</span>
            </button>

            <button
              type="button"
              onClick={() => void runAction(() => onCreateSampleApplication())}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition"
              title="Tạo hồ sơ thử nghiệm để kiểm tra tính năng"
            >
              <Plus className="w-4 h-4" />
              <span>Mẫu thử</span>
            </button>
          </div>
        </div>

        {/* Form thêm hồ sơ trực tiếp */}
        {showAddForm && (
          <form onSubmit={handleAddNewCandidate} className="bg-red-50/40 p-4 rounded-xl border border-red-200 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-red-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#c8102e] flex items-center">
                <UserPlus className="w-4 h-4 mr-1.5" />
                Nhập hồ sơ ứng viên nhận qua email hoặc kênh khác
              </h4>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Vị trí ứng tuyển *</label>
                <select
                  value={newJobId}
                  onChange={(e) => setNewJobId(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                >
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
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
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="ungvien@gmail.com"
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ngày sinh</label>
                <input
                  type="text"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  placeholder="15/06/1995"
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link CV (URL/Drive)</label>
                <input
                  type="url"
                  value={newCvUrl}
                  onChange={(e) => setNewCvUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Trạng thái</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                >
                  <option value="new">Mới nộp</option>
                  <option value="reviewed">Đã xem hồ sơ</option>
                  <option value="contacted">Đã liên hệ</option>
                  <option value="passed">Mời phỏng vấn / Đạt</option>
                  <option value="rejected">Không phù hợp</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ghi chú tuyển dụng..."
                  className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#c8102e]"
                />
              </div>
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

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, SĐT, email..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#c8102e] focus:bg-white transition"
            />
          </div>

          {/* Job Filter */}
          <div className="relative">
            <select
              aria-label="Lọc theo vị trí tuyển dụng"
              value={selectedJobIdFilter}
              onChange={(e) => setSelectedJobIdFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs md:text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#c8102e] focus:bg-white transition cursor-pointer"
            >
              <option value="all">Tất cả vị trí tuyển dụng ({applications.length})</option>
              {statistics.rows.map(({ job, total }) => (
                <option key={job.id} value={job.id}>{job.title}{job.isHidden ? ' (Đã ẩn)' : ''} ({total})</option>
              ))}
              <option value={UNMATCHED_JOB}>Chưa xác định vị trí ({statistics.unmatched.length})</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs md:text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#c8102e] focus:bg-white transition cursor-pointer"
            >
              <option value="all">Tất cả trạng thái ({applications.length})</option>
              <option value="new">Mới nộp ({applications.filter(a => (a.status || 'new') === 'new').length})</option>
              <option value="reviewed">Đã xem ({applications.filter(a => a.status === 'reviewed').length})</option>
              <option value="contacted">Đã liên hệ ({applications.filter(a => a.status === 'contacted').length})</option>
              <option value="passed">Mời PV / Đạt ({applications.filter(a => a.status === 'passed').length})</option>
              <option value="rejected">Không phù hợp ({statistics.statuses.rejected})</option>
              {statistics.statuses.other > 0 && <option value="other">Khác ({statistics.statuses.other})</option>}
            </select>
          </div>
        </div>

        {/* Candidate List */}
        <div className="space-y-4 pt-2">
          {applications.length === 0 ? (
            <div className="text-center py-16 px-4 border-2 border-dashed border-gray-200 rounded-2xl">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Chưa có hồ sơ ứng tuyển nào</h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                Khi có ứng viên ứng tuyển từ trang chủ, thông tin và file CV của họ sẽ tự động được lưu và hiển thị tại đây.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {onCreateApplication && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#c8102e] hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-md transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Nhập hồ sơ ứng viên</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runAction(() => onCreateSampleApplication())}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo hồ sơ thử nghiệm</span>
                </button>
              </div>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm bg-gray-50 rounded-xl">
              Không có hồ sơ nào phù hợp với điều kiện tìm kiếm và bộ lọc.
            </div>
          ) : (
            filteredApps.map((app, index) => {
              const status = applicationStatus(app.status);
              const initials = (app.name || 'UV')
                .split(' ')
                .filter(Boolean)
                .slice(-2)
                .map(n => n[0]?.toUpperCase())
                .join('');

              const isEditingNotes = editingNotesId === app.id;
              const externalCvUrl = safeExternalUrl(app.cvUrl || app.downloadURL);

              return (
                <div 
                  key={app.id}
                  className="bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 md:p-5 transition shadow-xs hover:shadow-md"
                >
                  {/* Top Row: Avatar, Name, JobTitle, Time, Status, Delete */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1a2b4c] to-[#c8102e] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {initials}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-base text-gray-900">{app.name}</h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-[#c8102e]">
                            <Briefcase className="w-3 h-3 mr-1" />
                            {app.jobTitle}
                          </span>
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
                        aria-label={`Trạng thái hồ sơ ${app.name}`}
                        value={status}
                        onChange={(e) => void runAction(() => onUpdateStatus(app.id, e.target.value))}
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
                        {status === 'other' && <option value="other">Trạng thái khác</option>}
                        <option value="new">Mới nộp</option>
                        <option value="reviewed">Đã xem hồ sơ</option>
                        <option value="contacted">Đã liên hệ</option>
                        <option value="passed">Mời phỏng vấn / Đạt</option>
                        <option value="rejected">Không phù hợp</option>
                      </select>

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

                  {/* Middle Row: Contact Info */}
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

                  {/* CV & Notes */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-xs text-gray-600">File CV:</span>
                      {externalCvUrl ? (
                        <a href={externalCvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200">
                          <ExternalLink className="w-3.5 h-3.5" /><span>{app.fileName || 'Mở liên kết CV'}</span>
                        </a>
                      ) : (app.cvUrl || app.downloadURL || app.fileName) ? (
                        <button
                          type="button"
                          onClick={() => void handleDownload(app)}
                          disabled={downloadingId === app.id}
                          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition border border-blue-200"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{downloadingId === app.id ? 'Đang tải...' : app.fileName || 'Tải CV đính kèm'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500 italic bg-gray-100 px-2 py-1 rounded">
                          {app.fileName ? `${app.fileName} (Gửi qua email)` : 'Không có link CV'}
                        </span>
                      )}
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
                          <span>{app.notes ? 'Sửa ghi chú' : '+ Thêm ghi chú'}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Notes Inline Box */}
                  {isEditingNotes && (
                    <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                      <label className="block text-xs font-semibold text-amber-900">
                        Ghi chú nội bộ cho ứng viên này:
                      </label>
                      <textarea
                        aria-label={`Ghi chú cho ${app.name}`}
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        placeholder="Nhập ghi chú ứng viên..."
                        rows={2}
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
      </div>
    </div>
  );
}
