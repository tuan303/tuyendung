import React, { useState, useEffect, useMemo, useRef } from 'react';
import { signInWithEmailAndPassword, signOut, onIdTokenChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { LogOut, Plus, Trash2, FileText, MapPin, Briefcase, LayoutTemplate, Eye, EyeOff, Edit2, X, ChevronDown, ChevronUp, Mail, Lock, ShieldCheck, AlertCircle, Users } from 'lucide-react';
import SiteContentAdmin from './SiteContentAdmin';
import SmtpAdmin from './SmtpAdmin';
import ApplicationsModal from './ApplicationsModal';
import ApplicationsTab from './ApplicationsTab';
import RichTextEditor from './RichTextEditor';
import { sanitizeRichHtml, safeExternalUrl } from './lib/safeHtml';
import { adminJson, AdminApiError, hasAdminClaim } from './lib/adminApi';
import { buildApplicationStatistics } from './shared/applicationMatching';
import type { User } from 'firebase/auth';

export interface Job {
  id: string;
  title: string;
  department?: string;
  description: string;
  requirements: string;
  benefits?: string;
  workingHours?: string;
  deadline: string;
  jdUrl?: string;
  createdAt: any;
  authorUid: string;
  isHidden?: boolean;
}

export interface Application {
  id: string;
  jobId?: string;
  jobTitle: string;
  name: string;
  dob?: string;
  phone: string;
  email: string;
  cvUrl?: string;
  downloadURL?: string;
  fileName?: string;
  status?: string;
  notes?: string;
  createdAt: any;
}

const JobCard = ({ 
  job, 
  applicantCount = 0,
  onViewApplications,
  onDelete, 
  onToggleHide, 
  onEdit 
}: { 
  job: Job, 
  applicantCount?: number,
  onViewApplications?: (job: Job) => void,
  onDelete: (id: string) => void | Promise<void>, 
  onToggleHide: (id: string, isHidden: boolean) => void | Promise<void>, 
  onEdit: (job: Job) => void,
  key?: string | number
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-xl p-5 transition group relative ${job.isHidden ? 'border-gray-200 bg-gray-50 opacity-75' : 'border-gray-200 hover:border-gray-300'}`}>
      <div className="absolute top-4 right-4 flex space-x-2">
        <button 
          onClick={() => onEdit(job)}
          className="text-gray-400 hover:text-green-600 transition p-2 hover:bg-green-50 rounded-lg"
          title="Chỉnh sửa"
        >
          <Edit2 className="w-5 h-5" />
        </button>
        <button 
          onClick={() => onToggleHide(job.id, !!job.isHidden)}
          className={`transition p-2 rounded-lg ${job.isHidden ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
          title={job.isHidden ? "Hiện" : "Ẩn"}
        >
          {job.isHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
        <button 
          onClick={() => onDelete(job.id)}
          className="text-gray-400 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-lg"
          title="Xóa"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      
      <h3 className="font-bold text-lg text-[#1a2b4c] mb-2 pr-24 flex items-center">
        {job.title}
        {job.isHidden && <span className="ml-3 text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-1 rounded-md">Đã ẩn</span>}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Mô tả công việc</h4>
          <div 
            className={`text-sm text-gray-700 prose prose-sm max-w-none ${expanded ? '' : 'line-clamp-3'}`}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(job.description) }}
          />
        </div>
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Yêu cầu</h4>
          <div 
            className={`text-sm text-gray-700 prose prose-sm max-w-none ${expanded ? '' : 'line-clamp-3'}`}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(job.requirements) }}
          />
        </div>
        {expanded && job.benefits && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Chế độ</h4>
            <div 
              className="text-sm text-gray-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(job.benefits) }}
            />
          </div>
        )}
        {expanded && job.workingHours && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Thời gian làm việc</h4>
            <div 
              className="text-sm text-gray-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(job.workingHours) }}
            />
          </div>
        )}
      </div>

      <button 
        onClick={() => setExpanded(!expanded)}
        className="text-[#c8102e] text-sm font-medium hover:underline mb-4 flex items-center"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4 mr-1" />
            Thu gọn
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4 mr-1" />
            Xem thêm chi tiết
          </>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100">
        <div className="flex items-center text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-md">
          <MapPin className="w-3.5 h-3.5 mr-1.5" />
          KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội
        </div>
        <div className="flex items-center text-xs font-medium bg-red-50 text-[#c8102e] px-2.5 py-1.5 rounded-md">
          Hạn nộp: {job.deadline}
        </div>
        {job.jdUrl && (
          <a href={safeExternalUrl(job.jdUrl)} target="_blank" rel="noreferrer" className="flex items-center text-xs font-medium bg-blue-50 text-blue-600 hover:underline px-2.5 py-1.5 rounded-md">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Xem JD
          </a>
        )}
        <button
          type="button"
          onClick={() => onViewApplications && onViewApplications(job)}
          className={`flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-md transition shadow-xs cursor-pointer border ${
            applicantCount > 0 
              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
          }`}
          title="Nhấn để xem danh sách hồ sơ ứng viên đã nộp cho vị trí này"
        >
          <Users className={`w-3.5 h-3.5 mr-1.5 ${applicantCount > 0 ? 'text-blue-600' : 'text-gray-500'}`} />
          <span>{applicantCount} hồ sơ ứng tuyển</span>
          {applicantCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 bg-blue-600 text-white text-[10px] rounded-full font-bold">
              {applicantCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [applicationsError, setApplicationsError] = useState('');
  const [jobsError, setJobsError] = useState('');
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const applicationsRevision = useRef(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState<'Khối Nhà Trường' | 'Khối Vận Hành'>('Khối Nhà Trường');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [benefits, setBenefits] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [deadline, setDeadline] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'jobs' | 'applications' | 'content' | 'smtp' | 'password'>('jobs');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  // Applications states
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedJobForApplications, setSelectedJobForApplications] = useState<Job | null>(null);
  const [applicationsModalOpen, setApplicationsModalOpen] = useState(false);

  // Change password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Inactivity timer
  useEffect(() => {
    if (!user) return;

    let timeoutId: any;
    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log("Inactivity timeout reached. Logging out...");
        handleLogout();
        alert("Phiên làm việc đã hết hạn do không hoạt động trong 5 phút.");
      }, INACTIVITY_LIMIT);
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer(); // Start timer initially

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  useEffect(() => {
    let version = 0;
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      const currentVersion = ++version;
      setLoading(Boolean(currentUser));
      setUser(currentUser);
      setIsAdmin(false);
      setApplications([]);
      setJobs([]);
      setApplicationsLoaded(false);
      setApplicationsError('');
      setJobsError('');
      if (!currentUser) { setLoading(false); return; }
      try {
        const token = await currentUser.getIdTokenResult();
        if (currentVersion !== version) return;
        const allowed = hasAdminClaim(token.claims);
        setIsAdmin(allowed);
        setAuthError(allowed ? '' : 'Tài khoản chưa được cấp quyền quản trị hoặc email chưa được xác minh.');
      } catch {
        if (currentVersion === version) setAuthError('Không thể xác minh phiên đăng nhập. Vui lòng đăng nhập lại.');
      } finally {
        if (currentVersion === version) setLoading(false);
      }
    });
    return () => { version++; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(job => ({ ...job.data(), id: job.id })) as Job[]);
      setJobsError('');
    }, () => setJobsError('Không tải được vị trí tuyển dụng. Vui lòng kiểm tra kết nối và quyền quản trị.'));
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const controller = new AbortController();
    let inFlight = false;
    const fetchApplications = async () => {
      if (inFlight) return;
      inFlight = true;
      const revision = applicationsRevision.current;
      try {
        const result = await adminJson<{ success: boolean; data: Application[] }>('/api/applications', { signal: controller.signal });
        if (!Array.isArray(result.data)) throw new Error('Dữ liệu hồ sơ không hợp lệ.');
        if (!controller.signal.aborted && revision === applicationsRevision.current) {
          setApplications(result.data);
          setApplicationsLoaded(true);
          setApplicationsError('');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
          setApplications([]);
          setIsAdmin(false);
          setAuthError(error.message);
        } else setApplicationsError(error instanceof Error ? error.message : 'Không tải được hồ sơ.');
      } finally { inFlight = false; }
    };
    void fetchApplications();
    const interval = setInterval(() => void fetchApplications(), 4000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [user, isAdmin]);

  const applicationStatistics = useMemo(() => buildApplicationStatistics(jobs, applications), [jobs, applications]);
  const getJobApplicantCount = (job: Job) => applicationStatistics.byJobId.get(job.id)?.total || 0;

  const handleOpenApplications = (job: Job) => {
    setSelectedJobForApplications(job);
    setApplicationsModalOpen(true);
  };

  const mutateApplication = async (path: string, init: RequestInit) => {
    try {
      const sessionUid = auth.currentUser?.uid;
      const result = await adminJson<{ success: boolean; data?: Application }>(path, init);
      if (!sessionUid || auth.currentUser?.uid !== sessionUid) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang.');
      applicationsRevision.current++;
      setApplicationsError('');
      return result;
    } catch (error) {
      if (error instanceof AdminApiError && [401, 403].includes(error.status)) {
        setApplications([]); setIsAdmin(false); setAuthError(error.message);
      }
      setApplicationsError(error instanceof Error ? error.message : 'Không thể lưu thay đổi hồ sơ.');
      throw error;
    }
  };

  const handleCreateApplication = async (data: Partial<Application>) => {
    const result = await mutateApplication('/api/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!result.data?.id) throw new Error('Máy chủ chưa xác nhận hồ sơ mới. Vui lòng tải lại danh sách.');
    setApplications(previous => [result.data!, ...previous.filter(item => item.id !== result.data!.id)]);
  };

  const handleUpdateApplicationStatus = async (appId: string, status: string) => {
    const result = await mutateApplication(`/api/applications/${encodeURIComponent(appId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    setApplications(previous => previous.map(item => item.id === appId ? result.data || { ...item, status } : item));
  };

  const handleUpdateApplicationNotes = async (appId: string, notes: string) => {
    const result = await mutateApplication(`/api/applications/${encodeURIComponent(appId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
    });
    setApplications(previous => previous.map(item => item.id === appId ? result.data || { ...item, notes } : item));
  };

  const handleDeleteApplication = async (appId: string) => {
    await mutateApplication(`/api/applications/${encodeURIComponent(appId)}`, { method: 'DELETE' });
    setApplications(previous => previous.filter(item => item.id !== appId));
  };

  const handleCreateSampleApplication = async (targetJob?: Job) => {
    const currentJob = targetJob || (jobs.length > 0 ? jobs[0] : null);
    if (!currentJob) {
      alert("Vui lòng tạo ít nhất một vị trí tuyển dụng trước.");
      return;
    }
    const sampleNames = ["Nguyễn Thu Hà", "Trần Minh Quân", "Lê Hoàng Long", "Phạm Thị Hương", "Đặng Minh Quân"];
    const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const randomPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    const randomEmail = `sample-${Date.now()}@example.invalid`;

    await handleCreateApplication({
      jobId: currentJob.id,
      jobTitle: currentJob.title,
      name: randomName,
      dob: "15/06/1995",
      phone: randomPhone,
      email: randomEmail,
      cvUrl: "https://drive.google.com",
      fileName: `CV_${randomName.replace(/\s+/g, '_')}.pdf`,
      status: 'new',
      notes: 'Hồ sơ thử nghiệm mẫu do quản trị viên tạo'
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, username.trim(), password);
      setPassword('');
    } catch {
      setAuthError('Đăng nhập không thành công. Vui lòng kiểm tra email và mật khẩu.');
    } finally { setIsLoggingIn(false); }
  };

  const handleLogout = async () => {
    try {
      setApplications([]);
      setJobs([]);
      setIsAdmin(false);
      setApplicationsModalOpen(false);
      setSelectedJobForApplications(null);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !requirements || !benefits || !workingHours || !deadline) {
      alert("Vui lòng điền đầy đủ thông tin bắt buộc.");
      return;
    }

    if (jdUrl && !safeExternalUrl(jdUrl)) { alert('Link JD phải là địa chỉ HTTP hoặc HTTPS hợp lệ.'); return; }
    setIsSubmitting(true);
    try {
      const formattedDeadline = deadline.includes('-') 
        ? deadline.split('-').reverse().join('/') 
        : deadline;

      if (editingJobId) {
        await updateDoc(doc(db, 'jobs', editingJobId), {
          title,
          department,
          description: sanitizeRichHtml(description),
          requirements: sanitizeRichHtml(requirements),
          benefits: sanitizeRichHtml(benefits),
          workingHours: sanitizeRichHtml(workingHours),
          deadline: formattedDeadline,
          jdUrl: jdUrl || null,
        });
        alert("Đã cập nhật vị trí tuyển dụng thành công!");
      } else {
        await addDoc(collection(db, 'jobs'), {
          title,
          department,
          description: sanitizeRichHtml(description),
          requirements: sanitizeRichHtml(requirements),
          benefits: sanitizeRichHtml(benefits),
          workingHours: sanitizeRichHtml(workingHours),
          deadline: formattedDeadline,
          jdUrl: jdUrl || null,
          createdAt: serverTimestamp(),
          authorUid: user.uid
        });
        alert("Đã thêm vị trí tuyển dụng thành công!");
      }
      
      // Reset form
      handleCancelEdit();
    } catch (error: any) {
      console.error("Error saving job:", error);
      alert("Lỗi khi lưu: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (job: Job) => {
    setEditingJobId(job.id);
    setTitle(job.title);
    setDepartment((job.department as 'Khối Nhà Trường' | 'Khối Vận Hành') || 'Khối Nhà Trường');
    setDescription(job.description);
    setRequirements(job.requirements);
    setBenefits(job.benefits || '');
    setWorkingHours(job.workingHours || '');
    // Convert dd/mm/yyyy back to yyyy-mm-dd for input type="date"
    const formattedDeadline = job.deadline.includes('/') 
      ? job.deadline.split('/').reverse().join('-') 
      : job.deadline;
    setDeadline(formattedDeadline);
    setJdUrl(job.jdUrl || '');
    // Cuộn lên đầu trang để người dùng thấy form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingJobId(null);
    setTitle('');
    setDepartment('Khối Nhà Trường');
    setDescription('');
    setRequirements('');
    setBenefits('');
    setWorkingHours('');
    setDeadline('');
    setJdUrl('');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa vị trí này?")) {
      try {
        await deleteDoc(doc(db, 'jobs', id));
      } catch (error: any) {
        console.error("Error deleting job:", error);
        alert("Lỗi khi xóa: " + error.message);
      }
    }
  };

  const handleToggleHide = async (id: string, currentIsHidden: boolean) => {
    try {
      await updateDoc(doc(db, 'jobs', id), {
        isHidden: !currentIsHidden
      });
    } catch (error: any) {
      console.error("Error toggling job visibility:", error);
      alert("Lỗi khi cập nhật trạng thái: " + error.message);
    }
  };

  const validatePassword = (pass: string) => {
    const minLength = pass.length >= 8;
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[@$!%*?&]/.test(pass);
    
    if (!minLength) return "Mật khẩu phải có ít nhất 8 ký tự.";
    if (!hasUpper) return "Mật khẩu phải có ít nhất một chữ hoa.";
    if (!hasLower) return "Mật khẩu phải có ít nhất một chữ thường.";
    if (!hasNumber) return "Mật khẩu phải có ít nhất một chữ số.";
    if (!hasSpecial) return "Mật khẩu phải có ít nhất một ký tự đặc biệt (@$!%*?&).";
    
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp.");
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setIsChangingPassword(true);
    try {
      if (!user.email) throw new Error("Không tìm thấy email người dùng.");
      
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      alert("Đổi mật khẩu thành công!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('jobs');
    } catch (error: any) {
      console.error("Error changing password:", error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError("Mật khẩu hiện tại không chính xác.");
      } else {
        setPasswordError("Lỗi: " + error.message);
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Đang tải...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100">
          <div className="h-16 flex items-center justify-center mx-auto mb-6">
            <img src="https://hoangmaistarschool.edu.vn/storage/general/logo.svg" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-2xl font-bold text-[#23328c] mb-2">Quản trị Tuyển dụng</h1>
          <p className="text-gray-500 mb-8">Đăng nhập để quản lý các vị trí tuyển dụng</p>
          <form onSubmit={handleLogin} className="space-y-4">
            {authError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{authError}</p>}
            <div>
              <input
                type="email"
                aria-label="Email quản trị"
                autoComplete="username"
                placeholder="Email quản trị"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition text-left"
                required
              />
            </div>
            <div>
              <input
                type="password"
                aria-label="Mật khẩu"
                placeholder="Mật khẩu"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition text-left"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#c8102e] text-white font-bold py-3 rounded-xl hover:bg-red-700 transition shadow-md mb-3"
            >
              {isLoggingIn ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Không có quyền truy cập</h1>
          <p className="text-gray-500 mb-8">{authError || `Tài khoản ${user.email} không có quyền quản trị.`}</p>
          <button 
            onClick={handleLogout}
            className="bg-[#c8102e] text-white font-bold py-2 px-6 rounded-lg hover:bg-red-700 transition"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Admin Header */}
      <header className="bg-[#23328c] text-white py-4 px-6 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="h-10 flex items-center justify-center shrink-0">
              <img src="https://hoangmaistarschool.edu.vn/storage/general/logo.svg" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide">Hệ thống Quản trị Tuyển dụng</h1>
              <p className="text-xs text-white/70">Ngôi Sao Hoàng Mai</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-white/80 hidden md:inline-block">{user.email}</span>
            <button 
              onClick={handleLogout}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4">
        {jobsError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{jobsError}</div>}
        {applicationsError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{applicationsError} Dữ liệu đang hiển thị có thể chưa được cập nhật.</div>}
        {!applicationsLoaded && !applicationsError && <p role="status" className="mb-5 text-sm text-gray-500">Đang tải hồ sơ ứng tuyển...</p>}
        {/* Tabs */}
        <div className="flex space-x-2 md:space-x-4 mb-8 border-b border-gray-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex items-center space-x-2 px-4 py-2 font-medium transition border-b-2 whitespace-nowrap ${activeTab === 'jobs' ? 'border-[#c8102e] text-[#c8102e]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Briefcase className="w-5 h-5" />
            <span>Quản lý Tuyển dụng</span>
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`flex items-center space-x-2 px-4 py-2 font-medium transition border-b-2 whitespace-nowrap ${activeTab === 'applications' ? 'border-[#c8102e] text-[#c8102e]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Users className="w-5 h-5" />
            <span>Hồ sơ ứng tuyển</span>
            {applications.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 bg-[#c8102e] text-white text-xs rounded-full font-bold">
                {applications.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center space-x-2 px-4 py-2 font-medium transition border-b-2 whitespace-nowrap ${activeTab === 'content' ? 'border-[#c8102e] text-[#c8102e]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutTemplate className="w-5 h-5" />
            <span>Quản lý Giao diện</span>
          </button>
          <button
            onClick={() => setActiveTab('smtp')}
            className={`flex items-center space-x-2 px-4 py-2 font-medium transition border-b-2 whitespace-nowrap ${activeTab === 'smtp' ? 'border-[#c8102e] text-[#c8102e]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Mail className="w-5 h-5" />
            <span>Cài đặt Email</span>
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex items-center space-x-2 px-4 py-2 font-medium transition border-b-2 whitespace-nowrap ${activeTab === 'password' ? 'border-[#c8102e] text-[#c8102e]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Lock className="w-5 h-5" />
            <span>Đổi mật khẩu</span>
          </button>
        </div>

        {activeTab === 'jobs' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Form */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-24">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  {editingJobId ? (
                    <>
                      <Edit2 className="w-5 h-5 mr-2 text-green-600" />
                      Cập nhật vị trí
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2 text-[#c8102e]" />
                      Thêm vị trí mới
                    </>
                  )}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vị trí tuyển dụng *</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  placeholder="VD: Giáo viên Tiếng Anh"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Khối bộ phận *</label>
                <div className="flex space-x-6">
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="radio" 
                      name="department"
                      value="Khối Nhà Trường"
                      checked={department === 'Khối Nhà Trường'}
                      onChange={(e) => setDepartment(e.target.value as any)}
                      className="w-4 h-4 text-[#c8102e] border-gray-300 focus:ring-[#c8102e]"
                    />
                    <span className="ml-2 text-gray-700">Khối Nhà Trường</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input 
                      type="radio" 
                      name="department"
                      value="Khối Vận Hành"
                      checked={department === 'Khối Vận Hành'}
                      onChange={(e) => setDepartment(e.target.value as any)}
                      className="w-4 h-4 text-[#c8102e] border-gray-300 focus:ring-[#c8102e]"
                    />
                    <span className="ml-2 text-gray-700">Khối Vận Hành</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả công việc *</label>
                <div className="quill-container">
                  <RichTextEditor
                    theme="snow"
                    value={description}
                    onChange={setDescription}
                    className="bg-white rounded-lg"
                    placeholder="Mô tả chi tiết công việc..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yêu cầu ứng viên *</label>
                <div className="quill-container">
                  <RichTextEditor
                    theme="snow"
                    value={requirements}
                    onChange={setRequirements}
                    className="bg-white rounded-lg"
                    placeholder="Các yêu cầu về bằng cấp, kinh nghiệm..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chế độ *</label>
                <div className="quill-container">
                  <RichTextEditor
                    theme="snow"
                    value={benefits}
                    onChange={setBenefits}
                    className="bg-white rounded-lg"
                    placeholder="Các chế độ phúc lợi, lương thưởng..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian làm việc *</label>
                <div className="quill-container">
                  <RichTextEditor
                    theme="snow"
                    value={workingHours}
                    onChange={setWorkingHours}
                    className="bg-white rounded-lg"
                    placeholder="Thời gian làm việc trong ngày, trong tuần..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hạn nộp hồ sơ *</label>
                <input 
                  type="date" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đính kèm JD (URL) <span className="text-gray-400 font-normal">(Không bắt buộc)</span></label>
                <input 
                  type="url" 
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div className="flex space-x-3">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className={`flex-1 bg-[#c8102e] text-white font-bold py-3 rounded-lg transition shadow-md ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700 hover:shadow-lg'}`}
                >
                  {isSubmitting ? 'Đang lưu...' : (editingJobId ? 'Cập nhật' : 'Đăng tin tuyển dụng')}
                </button>
                {editingJobId && (
                  <button 
                    type="button" 
                    onClick={handleCancelEdit}
                    className="px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg transition hover:bg-gray-200 flex items-center justify-center"
                    title="Hủy chỉnh sửa"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center justify-between">
              <span>Danh sách vị trí tuyển dụng</span>
              <span className="bg-gray-100 text-gray-600 text-sm py-1 px-3 rounded-full">{jobs.length} vị trí</span>
            </h2>

            <div className="space-y-4">
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
                  Chưa có vị trí tuyển dụng nào. Hãy thêm mới ở form bên cạnh.
                </div>
              ) : (
                jobs.map((job) => (
                  <JobCard 
                    key={job.id} 
                    job={job} 
                    applicantCount={getJobApplicantCount(job)}
                    onViewApplications={handleOpenApplications}
                    onDelete={handleDelete} 
                    onToggleHide={handleToggleHide} 
                    onEdit={handleEdit} 
                  />
                ))
              )}
            </div>
          </div>
        </div>
        </div>
        ) : activeTab === 'applications' ? (
          <ApplicationsTab 
            jobs={jobs}
            applications={applications}
            onUpdateStatus={handleUpdateApplicationStatus}
            onUpdateNotes={handleUpdateApplicationNotes}
            onDeleteApplication={handleDeleteApplication}
            onCreateSampleApplication={handleCreateSampleApplication}
            onCreateApplication={handleCreateApplication}
          />
        ) : activeTab === 'content' ? (
          <SiteContentAdmin />
        ) : activeTab === 'smtp' ? (
          <SmtpAdmin />
        ) : (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-red-50 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-[#c8102e]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Đổi mật khẩu</h2>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-5">
              {passwordError && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-lg text-sm flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại</label>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Yêu cầu: Tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#c8102e] focus:border-transparent outline-none transition"
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={isChangingPassword}
                className={`w-full bg-[#c8102e] text-white font-bold py-3 rounded-xl transition shadow-md ${isChangingPassword ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700 hover:shadow-lg'}`}
              >
                {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
              </button>
            </form>
          </div>
        )}

        {/* Modal chi tiết danh sách ứng viên cho vị trí tuyển dụng */}
        <ApplicationsModal 
          isOpen={applicationsModalOpen}
          onClose={() => {
            setApplicationsModalOpen(false);
            setSelectedJobForApplications(null);
          }}
          job={selectedJobForApplications}
          jobs={jobs}
          applications={applications}
          onUpdateStatus={handleUpdateApplicationStatus}
          onUpdateNotes={handleUpdateApplicationNotes}
          onDeleteApplication={handleDeleteApplication}
          onCreateSampleApplication={handleCreateSampleApplication}
          onCreateApplication={handleCreateApplication}
        />
      </main>
    </div>
  );
}
