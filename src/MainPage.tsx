import React, { useState, useEffect } from 'react';
import { 
  MapPin, Phone, Mail, Building2, MousePointerClick, FileText, 
  CheckCircle2, Upload, ChevronDown, Facebook, Youtube, X,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { defaultContent } from './SiteContentAdmin';

interface Job {
  id: string;
  title: string;
  description: string;
  requirements: string;
  deadline: string;
  jdUrl?: string;
  createdAt: any;
  authorUid: string;
  isHidden?: boolean;
}

export default function MainPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [siteContent, setSiteContent] = useState(defaultContent);

  // Form state
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemsPerPage = 4;
  const totalPages = Math.ceil(jobs.length / itemsPerPage);

  useEffect(() => {
    if (jobs.length <= itemsPerPage) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalPages);
    }, 5000);
    return () => clearInterval(timer);
  }, [jobs.length, totalPages]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalPages);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
      } else {
        alert("Vui lòng chọn file PDF hoặc DOCX.");
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !dob || !phone || !email || !position || !file) {
      alert("Vui lòng điền đầy đủ thông tin và đính kèm CV.");
      return;
    }

    setIsSubmitting(true);
    try {
      let downloadURL = '';
      try {
        // 1. Upload file to Firebase Storage
        const fileRef = ref(storage, `cvs/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        downloadURL = await getDownloadURL(fileRef);
      } catch (uploadError) {
        console.warn("Could not upload file to storage, falling back to manual attachment:", uploadError);
        // If upload fails (e.g. no storage rules), we continue but ask user to attach manually
      }

      // 2. Prepare email content
      const subject = `[Ứng tuyển] ${position} - ${name}`;
      const body = `
Họ và tên: ${name}
Ngày sinh: ${dob}
Điện thoại: ${phone}
Email: ${email}
Vị trí ứng tuyển: ${position}

${downloadURL ? `Link CV đính kèm: ${downloadURL}` : `(Vui lòng đính kèm file CV của bạn vào email này trước khi gửi)`}
      `.trim();

      // 3. Open mailto link
      const mailtoLink = `mailto:tuyendung@hoangmaistarschool.edu.vn?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoLink;

      // 4. Reset form
      setName('');
      setDob('');
      setPhone('');
      setEmail('');
      setPosition('');
      setFile(null);
      
      if (downloadURL) {
        alert("Cảm ơn bạn đã ứng tuyển! Vui lòng kiểm tra ứng dụng email của bạn để gửi hồ sơ.");
      } else {
        alert("Cảm ơn bạn đã ứng tuyển! Vui lòng đính kèm file CV của bạn vào email vừa được mở ra trước khi gửi nhé.");
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("Có lỗi xảy ra khi gửi hồ sơ. Vui lòng thử lại sau.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleJobs = jobs.slice(currentSlide * itemsPerPage, (currentSlide + 1) * itemsPerPage);

  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];
      setJobs(jobsData.filter(job => !job.isHidden));
    }, (error) => {
      console.error("Error fetching jobs:", error);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const docRef = doc(db, 'siteContent', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSiteContent({
          ...defaultContent,
          ...data,
          policy3Benefits: Array.isArray(data.policy3Benefits) 
            ? data.policy3Benefits.join('\n') 
            : data.policy3Benefits || defaultContent.policy3Benefits
        });
      }
    }, (error) => {
      console.error("Error fetching site content:", error);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {/* Top Bar */}
      <div className="bg-[#c8102e] text-white py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-sm">
          <div className="flex items-center mb-3 md:mb-0">
            <img 
              src="https://hoangmaistarschool.edu.vn/thongtin/LogoNSHM.png" 
              alt="Ngôi Sao Hoàng Mai" 
              className="h-10 md:h-12 object-contain" 
              referrerPolicy="no-referrer"
            />
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-8 text-xs font-medium">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="text-center md:text-left">Địa chỉ: KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội</span>
            </div>
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 shrink-0" />
              <span>Hotline: 1900 888 689 ext: 3</span>
            </div>
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 shrink-0" />
              <span>Email: tuyendung@hoangmaistarschool.edu.vn</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div 
        className="relative h-[450px] bg-cover bg-center" 
        style={{ backgroundImage: `url(${siteContent.heroBgImage})` }}
      >
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center max-w-5xl w-full mx-4 flex flex-col items-center">
            <h1 className="text-5xl sm:text-6xl md:text-[100px] leading-none font-black text-[#d21235] mb-4 sm:mb-6 tracking-widest uppercase drop-shadow-[0_3px_3px_rgba(0,0,0,0.8)]">
              {siteContent.heroTitle}
            </h1>
            <div className="bg-[#213363] text-white px-4 py-2 sm:px-8 sm:py-3 md:px-12 md:py-4 rounded-xl sm:rounded-2xl text-[21px] sm:text-[23px] md:text-[41px] font-black tracking-widest uppercase shadow-2xl text-center">
              {siteContent.heroSubtitle}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-5xl mx-auto -mt-16 relative z-10 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 shadow-2xl rounded-xl overflow-hidden bg-white">
          <a href="https://hoangmaistarschool.edu.vn/thongtin/Profile.pdf" target="_blank" rel="noreferrer" className="py-8 px-6 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition border-b md:border-b-0 md:border-r border-gray-100 group">
            <Building2 className="w-8 h-8 text-gray-400 mb-4 group-hover:text-[#c8102e] transition" />
            <span className="font-bold text-gray-700 uppercase tracking-wide text-sm leading-relaxed">Giới thiệu về<br/>Ngôi Sao Hoàng Mai</span>
          </a>
          <div className="bg-[#c8102e] py-8 px-6 text-center flex flex-col items-center justify-center cursor-pointer shadow-inner">
            <MousePointerClick className="w-8 h-8 text-white mb-4" />
            <span className="font-bold text-white uppercase tracking-wide text-sm leading-relaxed">Vị trí<br/>Tuyển dụng</span>
          </div>
          <a href="https://hoangmaistarschool.edu.vn/blog" target="_blank" rel="noreferrer" className="py-8 px-6 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition border-t md:border-t-0 md:border-l border-gray-100 group">
            <FileText className="w-8 h-8 text-gray-400 mb-4 group-hover:text-[#c8102e] transition" />
            <span className="font-bold text-gray-700 uppercase tracking-wide text-sm leading-relaxed">Tin tức<br/>Sự kiện</span>
          </a>
        </div>
      </div>

      {/* Featured Jobs */}
      <div className="max-w-6xl mx-auto py-16 px-4 relative">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-[#1a2b4c] uppercase tracking-wide">Việc làm nổi bật</h2>
          <div className="w-16 h-1 bg-[#c8102e] mx-auto mt-4 rounded-full"></div>
        </div>
        
        <div className="relative px-0 sm:px-12">
          {jobs.length > itemsPerPage && (
            <>
              <button 
                onClick={prevSlide}
                className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-white shadow-md rounded-full items-center justify-center text-gray-500 hover:text-[#c8102e] hover:shadow-lg transition z-10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button 
                onClick={nextSlide}
                className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-white shadow-md rounded-full items-center justify-center text-gray-500 hover:text-[#c8102e] hover:shadow-lg transition z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {visibleJobs.length > 0 ? visibleJobs.map((job) => (
              <div key={job.id} onClick={() => setSelectedJob(job)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start space-x-5 hover:shadow-lg hover:border-gray-200 transition duration-300 cursor-pointer group">
                <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shrink-0 border border-gray-100 group-hover:border-[#c8102e] transition duration-300 overflow-hidden p-1">
                  <img src="https://hoangmaistarschool.edu.vn/storage/general/logo.svg" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-900 mb-1.5 group-hover:text-[#c8102e] transition">{job.title}</h3>
                  <p className="text-[11px] text-gray-500 mb-3 uppercase tracking-wider font-medium bg-gray-200 inline-block px-2 py-0.5 rounded">TRƯỜNG NGÔI SAO HOÀNG MAI</p>
                  <div 
                    className="text-gray-600 text-sm mb-3 line-clamp-2 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: job.description }}
                  />
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center text-gray-500 text-xs gap-3">
                      <div className="flex items-center bg-gray-100 px-2 py-1 rounded">
                        <MapPin className="w-3 h-3 mr-1 shrink-0 text-gray-400" />
                        <span>KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center text-gray-500 text-xs gap-3">
                      <div className="flex items-center bg-gray-100 px-2 py-1 rounded">
                        <span className="font-medium text-[#c8102e]">Hạn nộp: {job.deadline}</span>
                      </div>
                      {job.jdUrl && (
                        <a href={job.jdUrl} target="_blank" rel="noreferrer" className="flex items-center text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded" onClick={(e) => e.stopPropagation()}>
                          <FileText className="w-3 h-3 mr-1" />
                          <span>Xem JD</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full text-center text-gray-500 py-10">
                Hiện tại chưa có vị trí tuyển dụng nào.
              </div>
            )}
          </div>
          
          {/* Mobile Navigation Controls */}
          {jobs.length > itemsPerPage && (
            <div className="flex sm:hidden justify-center items-center space-x-4 mt-8">
              <button 
                onClick={prevSlide}
                className="w-10 h-10 bg-white shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-[#c8102e]"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="text-sm font-medium text-gray-500">
                {currentSlide + 1} / {totalPages}
              </span>
              <button 
                onClick={nextSlide}
                className="w-10 h-10 bg-white shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-[#c8102e]"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* HR Policies */}
      <div className="max-w-6xl mx-auto py-16 px-4">
        <div className="flex flex-col items-center mb-16">
          <div className="relative inline-block">
            <div className="flex items-center">
              <h2 className="text-3xl md:text-4xl font-black text-[#c8102e] uppercase tracking-wider">Chính sách</h2>
              <div className="ml-4 h-[2px] w-20 md:w-32 bg-gray-300"></div>
            </div>
            <div className="flex items-center mt-2 justify-end">
              <div className="mr-4 h-[2px] w-20 md:w-32 bg-gray-300"></div>
              <h3 className="text-3xl md:text-4xl font-black text-[#c8102e] uppercase tracking-wider">Nhân sự</h3>
            </div>
          </div>
        </div>

        {/* Policy 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center mb-16">
          <div className="order-2 md:order-1">
            <div className="flex items-center space-x-5 mb-8">
              <div className="w-14 h-14 rounded-full bg-[#fdb913] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-yellow-500/30 shrink-0">01</div>
              <h4 className="text-2xl font-bold text-[#c8102e] uppercase tracking-wide">{siteContent.policy1Title}</h4>
            </div>
            <p className="text-gray-600 leading-relaxed text-lg whitespace-pre-wrap">
              {siteContent.policy1Desc}
            </p>
          </div>
          <div className="order-1 md:order-2 rounded-3xl overflow-hidden shadow-2xl h-[400px] md:h-[500px]">
            <img src={siteContent.policy1Image} alt="Training" className="w-full h-full object-cover hover:scale-105 transition duration-700" />
          </div>
        </div>

        {/* Policy 2 */}
        <div className="bg-[#c8102e] rounded-[2.5rem] overflow-hidden mb-16 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="h-[400px] md:h-auto relative overflow-hidden">
              <img src={siteContent.policy2Image} alt="Environment" className="w-full h-full object-cover absolute inset-0 hover:scale-105 transition duration-700" />
              <div className="absolute inset-0 bg-[#c8102e]/20 mix-blend-multiply"></div>
            </div>
            <div className="p-10 md:p-16 lg:p-20 flex flex-col justify-center">
              <div className="flex items-center space-x-5 mb-8">
                <div className="w-14 h-14 rounded-full bg-[#fdb913] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-yellow-500/30 shrink-0">02</div>
                <h4 className="text-2xl font-bold text-white uppercase tracking-wide">{siteContent.policy2Title}</h4>
              </div>
              <p className="text-white/95 leading-relaxed font-medium italic mb-8 text-lg whitespace-pre-wrap">
                {siteContent.policy2Quote}
              </p>
              <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                {siteContent.policy2Desc}
              </p>
            </div>
          </div>
        </div>

        {/* Policy 3 */}
        <div className="bg-[#1a2b4c] rounded-[2.5rem] overflow-hidden mb-0 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-10 md:p-16 lg:p-20 flex flex-col justify-center">
              <div className="flex items-center space-x-5 mb-10">
                <div className="w-14 h-14 rounded-full bg-[#fdb913] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-yellow-500/30 shrink-0">03</div>
                <h4 className="text-2xl font-bold text-white uppercase tracking-wide">{siteContent.policy3Title}</h4>
              </div>
              <ul className="space-y-6">
                {(typeof siteContent.policy3Benefits === 'string' 
                  ? siteContent.policy3Benefits.split('\n') 
                  : siteContent.policy3Benefits
                ).filter(Boolean).map((item: string, idx: number) => (
                  <li key={idx} className="flex items-start space-x-4">
                    <CheckCircle2 className="w-6 h-6 text-[#fdb913] shrink-0 mt-0.5" />
                    <span className="text-white/90 leading-relaxed text-lg">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="h-[400px] md:h-auto p-8 md:p-12 flex items-center justify-center bg-white/5 relative">
              <img src="https://images.unsplash.com/photo-1556761175-5973dc0f32d7?q=80&w=1932&auto=format&fit=crop" alt="Welfare" className="w-full h-full object-cover rounded-2xl shadow-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Application Form & Instructions */}
      <div className="max-w-6xl mx-auto px-4 mb-24">
        <div className="flex flex-col lg:flex-row rounded-[2.5rem] overflow-hidden shadow-2xl">
          {/* Left Form */}
          <div className="w-full lg:w-5/12 bg-[#c8102e] p-6 sm:p-10 md:p-14">
            <h3 className="text-2xl sm:text-3xl font-black text-white mb-3 uppercase tracking-wide">Ứng tuyển online</h3>
            <p className="text-white/80 mb-10 text-sm font-medium">Yêu cầu ứng viên điền đúng và đủ thông tin theo mẫu:</p>
            
            <form className="space-y-6" onSubmit={handleFormSubmit}>
              <div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Họ và tên *" className="w-full bg-white/10 border-b border-white/30 px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:border-white focus:bg-white/20 transition rounded-t-lg" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <input type="text" value={dob} onChange={(e) => setDob(e.target.value)} placeholder="Ngày sinh *" className="w-full bg-white/10 border-b border-white/30 px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:border-white focus:bg-white/20 transition rounded-t-lg" required />
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Điện thoại *" className="w-full bg-white/10 border-b border-white/30 px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:border-white focus:bg-white/20 transition rounded-t-lg" required />
              </div>
              <div>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" className="w-full bg-white/10 border-b border-white/30 px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:border-white focus:bg-white/20 transition rounded-t-lg" required />
              </div>
              <div className="relative">
                <select value={position} onChange={(e) => setPosition(e.target.value)} className="w-full bg-white/10 border-b border-white/30 px-4 py-3 text-white/60 focus:outline-none focus:border-white focus:bg-white/20 transition rounded-t-lg appearance-none cursor-pointer" required>
                  <option value="" disabled>Vị trí ứng tuyển *</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.title} className="text-gray-800">{job.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60 pointer-events-none" />
              </div>
              
              <div className="pt-4 relative">
                <label className="block text-white/90 text-sm font-medium mb-3">Đính kèm CV (PDF, DOCX) *</label>
                <div className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center hover:bg-white/5 transition cursor-pointer group relative overflow-hidden">
                  <input 
                    type="file" 
                    accept=".pdf,.docx" 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    required 
                  />
                  <Upload className="w-8 h-8 text-white/60 mx-auto mb-3 group-hover:text-white transition" />
                  <p className="text-white/80 text-sm group-hover:text-white transition">
                    {file ? <span className="font-bold text-white">{file.name}</span> : <>Kéo thả file hoặc <span className="font-bold underline">chọn file</span></>}
                  </p>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className={`w-full bg-white text-[#c8102e] font-bold uppercase tracking-widest py-4 rounded-xl mt-8 transition shadow-lg ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-100 hover:shadow-xl active:scale-[0.98]'}`}>
                {isSubmitting ? 'Đang xử lý...' : 'Nộp hồ sơ'}
              </button>
            </form>
          </div>

          {/* Right Instructions */}
          <div className="w-full lg:w-7/12 bg-[#0f4c3a] p-6 sm:p-10 md:p-14 lg:p-20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            
            <div className="relative z-10">
              <h3 className="text-2xl sm:text-3xl font-black text-white mb-8 sm:mb-12 uppercase tracking-wide">Hướng dẫn nộp hồ sơ</h3>
              
              <div className="space-y-8 sm:space-y-10">
                <div className="flex items-start space-x-4 sm:space-x-6">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-lg sm:text-xl shrink-0 border border-white/20">1</div>
                  <div>
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-2">Nộp trực tiếp</h4>
                    <p className="text-white/80 leading-relaxed text-sm sm:text-base">
                      Phòng Nhân sự - Trường Ngôi Sao Hoàng Mai<br/>
                      KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 sm:space-x-6">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-lg sm:text-xl shrink-0 border border-white/20">2</div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-2">Nộp qua Email</h4>
                    <p className="text-white/80 leading-relaxed mb-2 text-sm sm:text-base">
                      Gửi CV và Đơn ứng tuyển về địa chỉ email:
                    </p>
                    <a href="mailto:tuyendung@hoangmaistarschool.edu.vn" className="inline-block bg-[#c8102e] text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg font-medium hover:bg-red-700 transition shadow-md break-all text-sm sm:text-base max-w-full">
                      tuyendung@hoangmaistarschool.edu.vn
                    </a>
                    <p className="text-white/60 text-xs sm:text-sm mt-3 italic">Tiêu đề email: [Vị trí ứng tuyển] - [Họ và tên]</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 sm:space-x-6">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-lg sm:text-xl shrink-0 border border-white/20">3</div>
                  <div>
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-2">Ứng tuyển trực tuyến</h4>
                    <p className="text-white/80 leading-relaxed text-sm sm:text-base">
                      Điền đầy đủ thông tin vào form ứng tuyển bên cạnh và đính kèm CV của bạn. Chúng tôi sẽ liên hệ lại trong thời gian sớm nhất.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#1a2b4c] text-white pt-20 pb-10 border-t-4 border-[#c8102e]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 lg:col-span-2">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                  <img src="https://hoangmaistarschool.edu.vn/storage/general/logo.svg" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="font-black text-xl tracking-wider">NGÔI SAO HOÀNG MAI</div>
                  <div className="text-white/70 text-xs uppercase tracking-widest mt-1">Hệ thống giáo dục</div>
                </div>
              </div>
              <p className="text-white/70 leading-relaxed mb-8 max-w-md">
                Ngôi Sao Hoàng Mai tự hào là môi trường giáo dục tiên tiến, nơi ươm mầm tài năng và phát triển toàn diện cho học sinh.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition">
                  <Youtube className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6 uppercase tracking-wider relative inline-block">
                Liên kết
                <div className="absolute -bottom-2 left-0 w-1/2 h-1 bg-[#c8102e] rounded-full"></div>
              </h4>
              <ul className="space-y-4 text-white/70">
                <li><a href="#" className="hover:text-white hover:translate-x-1 inline-block transition">Trang chủ</a></li>
                <li><a href="#" className="hover:text-white hover:translate-x-1 inline-block transition">Giới thiệu</a></li>
                <li><a href="#" className="hover:text-white hover:translate-x-1 inline-block transition">Tuyển sinh</a></li>
                <li><a href="#" className="hover:text-white hover:translate-x-1 inline-block transition">Tuyển dụng</a></li>
                <li><a href="#" className="hover:text-white hover:translate-x-1 inline-block transition">Liên hệ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6 uppercase tracking-wider relative inline-block">
                Liên hệ
                <div className="absolute -bottom-2 left-0 w-1/2 h-1 bg-[#c8102e] rounded-full"></div>
              </h4>
              <ul className="space-y-4 text-white/70">
                <li className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 shrink-0 text-[#c8102e] mt-0.5" />
                  <span>KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội</span>
                </li>
                <li className="flex items-center space-x-3">
                  <Phone className="w-5 h-5 shrink-0 text-[#c8102e]" />
                  <span>1900 888 689 ext: 3</span>
                </li>
                <li className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 shrink-0 text-[#c8102e]" />
                  <span>tuyendung@hoangmaistarschool.edu.vn</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-white/50 text-sm">
            <p>&copy; 2026 Ngôi Sao Hoàng Mai. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition">Điều khoản</a>
              <a href="#" className="hover:text-white transition">Bảo mật</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div className="flex items-start space-x-4">
                <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shrink-0 border border-gray-100 overflow-hidden p-1">
                  <img src="https://hoangmaistarschool.edu.vn/storage/general/logo.svg" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedJob.title}</h2>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium bg-gray-200 inline-block px-2 py-0.5 rounded mb-3">TRƯỜNG NGÔI SAO HOÀNG MAI</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center text-gray-500 text-xs gap-3">
                      <div className="flex items-center bg-gray-100 px-2 py-1 rounded">
                        <MapPin className="w-3 h-3 mr-1 shrink-0 text-gray-400" />
                        <span>KĐT Kim Văn - Kim Lũ, Định Công, Hà Nội</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center text-gray-500 text-xs gap-3">
                      <div className="flex items-center bg-gray-100 px-2 py-1 rounded">
                        <span className="font-medium text-[#c8102e]">Hạn nộp: {selectedJob.deadline}</span>
                      </div>
                      {selectedJob.jdUrl && (
                        <a href={selectedJob.jdUrl} target="_blank" rel="noreferrer" className="flex items-center text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded">
                          <FileText className="w-3 h-3 mr-1" />
                          <span>Xem JD</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedJob(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 md:p-8 space-y-8">
              <div>
                <h3 className="text-lg font-bold text-[#1a2b4c] mb-3 uppercase tracking-wide flex items-center">
                  <div className="w-2 h-6 bg-[#c8102e] rounded-full mr-3"></div>
                  Mô tả công việc
                </h3>
                <div 
                  className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedJob.description }}
                />
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-[#1a2b4c] mb-3 uppercase tracking-wide flex items-center">
                  <div className="w-2 h-6 bg-[#fdb913] rounded-full mr-3"></div>
                  Yêu cầu ứng viên
                </h3>
                <div 
                  className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedJob.requirements }}
                />
              </div>
            </div>
            
            <div className="p-6 md:p-8 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setSelectedJob(null)}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
