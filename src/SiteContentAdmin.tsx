import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Image as ImageIcon, Type, Palette, Layout, ArrowUp, ArrowDown, Eye, EyeOff, GripVertical, Maximize2, Monitor, Smartphone, Tablet, Facebook, Youtube, X, Briefcase, MousePointerClick } from 'lucide-react';
import MainPage from './MainPage';

export const defaultContent = {
  // Styling
  primaryColor: '#c8102e',
  secondaryColor: '#23328c',
  accentColor: '#fdb913',
  textColor: '#1f2937',
  backgroundColor: '#f9fafb',
  fontFamily: 'Inter',
  fontScale: 1,
  containerWidth: 1280,
  borderRadius: 12,
  sectionSpacing: 80,
  
  // Sizing
  logoSize: 10, // 10% as requested previously
  logoUrl: 'https://hoangmaistarschool.edu.vn/storage/general/logo.svg',
  jobIconUrl: 'https://hoangmaistarschool.edu.vn/storage/general/logo.svg',
  heroHeight: 450,
  heroOverlayOpacity: 0.4,
  
  // Social Links
  facebookUrl: 'https://www.facebook.com/tuyendungnshm',
  youtubeUrl: 'https://www.youtube.com/@NgoiSaoHoangMai',
  contactFacebookUrl: 'https://www.facebook.com/tuyendungnshm',
  
  // Section Order & Visibility
  sectionOrder: ['hero', 'nav', 'jobs', 'policies', 'form'],
  showHero: true,
  showNav: true,
  showJobs: true,
  showPolicies: true,
  showForm: true,

  heroBgImage: 'https://hoangmaistarschool.edu.vn/thongtin/nen.jpg',
  heroTitle: 'Tuyển dụng',
  heroSubtitle: 'Trường Ngôi Sao Hoàng Mai',
  
  jobsTitle: 'CƠ HỘI VIỆC LÀM',
  
  policy1Title: 'Đào tạo và phát triển',
  policy1Desc: 'Bên cạnh việc tuyển dụng nhân sự chất lượng cao, Ngôi Sao Hoàng Mai đặc biệt chú trọng vào việc đào tạo và phát triển chuyên môn cho Giáo viên thông qua các chương trình đào tạo bài bản. Giáo viên có cơ hội học hỏi, phát triển và thăng tiến trong công việc, được chứng tỏ bản thân và tạo điều kiện phát huy tối đa năng lực, tiềm năng của mình.',
  policy1Image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2070&auto=format&fit=crop',
  
  policy2Title: 'Môi trường làm việc',
  policy2Quote: '"Trường Ngôi Sao Hoàng Mai chú trọng vào việc xây dựng môi trường làm việc văn minh, chuyên nghiệp, hiệu quả; đồng thời đề cao 5 giá trị cốt lõi: Chân Thành - Chính Trực - Chăm Sóc - Chuyên Nghiệp - Chất Lượng."',
  policy2Desc: 'Bên cạnh đó, với cơ sở vật chất, trang thiết bị hiện đại và nền tảng công nghệ tiên tiến cũng là những ưu thế giúp Giáo viên và Học sinh Trường Ngôi Sao Hoàng Mai tối ưu hiệu quả dạy và học.',
  policy2Image: 'https://images.unsplash.com/photo-1577415124269-fc1140a69e91?q=80&w=1964&auto=format&fit=crop',
  
  policy3Title: 'Chính sách phúc lợi',
  policy3Benefits: [
    'Mức lương và quyền lợi cạnh tranh tùy thuộc vào kinh nghiệm và năng lực.',
    'Tài trợ ăn sáng, ăn trưa tại trường, tham gia BHXH, BHYT... và bảo hiểm chăm sóc sức khỏe.',
    'Hỗ trợ học phí cho con em CBNV lên tới 100%.',
    'Thưởng các ngày Lễ tết, thưởng năm học, tham quan nghỉ mát hàng năm.'
  ].join('\n'),
  policy3Image: 'https://hoangmaistarschool.edu.vn/thongtin/20.jpg',
  
  // Footer
  footerDescription: 'Trường Ngôi Sao Hoàng Mai chú trọng vào việc xây dựng môi trường làm việc văn minh, chuyên nghiệp, hiệu quả; đồng thời đề cao 5 giá trị cốt lõi: Chân Thành - Chính Trực - Chăm Sóc - Chuyên Nghiệp - Chất Lượng.',
  
  // New Layout Styling
  policySectionBgColor: '#ffebd6',
  policyTabTextColor: '#ffebd6',
  recruitmentTitle: 'Quy trình tuyển dụng',
  recruitmentStepBgColor: '#ffecec',
  recruitmentStepTextColor: '#1f2937', // text-gray-800
  recruitmentStep1Title: 'Ứng tuyển',
  recruitmentStep2Title: 'Sàng lọc hồ sơ',
  recruitmentStep3Title: 'Làm bài test/Phỏng vấn vòng 1',
  recruitmentStep4Title: 'Dự giờ, giảng thử (Đối với vị trí GV)',
  recruitmentStep5Title: 'Phỏng vấn vòng cuối',
  recruitmentStep6Title: 'Hoàn thiện hồ sơ cần thiết'
};

function SortableItem({ id, section, isVisible, toggleVisibility, idx }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sectionNames: Record<string, string> = {
    hero: 'Banner chính',
    nav: 'Thanh điều hướng nhanh',
    jobs: 'Danh sách việc làm',
    policies: 'Chính sách nhân sự',
    form: 'Form ứng tuyển'
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex items-center justify-between p-3 rounded-xl border mb-2 ${isVisible ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-200 opacity-60'}`}
    >
      <div className="flex items-center">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 mr-2 text-gray-400 hover:text-gray-600">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-gray-400 mr-3 w-4">{idx + 1}</span>
        <span className="font-medium text-sm text-gray-700">{sectionNames[section]}</span>
      </div>
      <div className="flex items-center space-x-1">
        <button onClick={() => toggleVisibility(section)} className="p-1.5 hover:bg-white rounded-lg transition text-gray-500">
          {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function SiteContentAdmin() {
  const [content, setContent] = useState(defaultContent);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showPreview, setShowPreview] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const docRef = doc(db, 'siteContent', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setContent({
            ...defaultContent,
            ...data,
            policy3Benefits: Array.isArray(data.policy3Benefits) 
              ? data.policy3Benefits.join('\n') 
              : data.policy3Benefits || defaultContent.policy3Benefits
          });
        }
      } catch (error) {
        console.error("Error fetching site content:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchContent();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setContent(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? parseFloat(value) : value 
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'siteContent', 'main');
      const dataToSave = {
        ...content,
        policy3Benefits: content.policy3Benefits.split('\n').filter(b => b.trim() !== '')
      };
      await setDoc(docRef, dataToSave);
      alert('Đã lưu cấu hình giao diện thành công!');
    } catch (error: any) {
      console.error("Error saving site content:", error);
      alert('Lỗi khi lưu: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setContent((prev) => {
        const oldIndex = prev.sectionOrder.indexOf(active.id as string);
        const newIndex = prev.sectionOrder.indexOf(over.id as string);
        return {
          ...prev,
          sectionOrder: arrayMove(prev.sectionOrder, oldIndex, newIndex),
        };
      });
    }
  };

  const toggleVisibility = (section: string) => {
    const key = `show${section.charAt(0).toUpperCase() + section.slice(1)}` as keyof typeof content;
    setContent(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1600px] mx-auto space-y-8 pb-20 px-4"
    >
      {/* Header with Save Button */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex justify-between items-center sticky top-24 z-40">
        <div>
          <h2 className="text-2xl font-bold text-[#1a2b4c]">Thiết kế Giao diện</h2>
          <p className="text-sm text-gray-500">Tùy chỉnh màu sắc, bố cục và nội dung trang Landing Page</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-medium transition ${showPreview ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
          >
            {showPreview ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showPreview ? 'Ẩn xem trước' : 'Hiện xem trước'}</span>
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 bg-[#c8102e] text-white px-8 py-3 rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50 shadow-lg"
          >
            <Save className="w-5 h-5" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu giao diện'}</span>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${showPreview ? 'xl:grid-cols-12' : 'lg:grid-cols-3'} gap-8`}>
        {/* Left: Global Styles & Section Order */}
        <div className={`${showPreview ? 'xl:col-span-4' : 'lg:col-span-1'} space-y-8 h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar`}>
          {/* Global Styles */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Palette className="w-5 h-5 mr-2 text-[#c8102e]" />
              Màu sắc & Font chữ
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu chủ đạo</label>
                  <input type="color" name="primaryColor" value={content.primaryColor} onChange={handleChange} className="w-full h-10 rounded cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu nền phụ</label>
                  <input type="color" name="secondaryColor" value={content.secondaryColor} onChange={handleChange} className="w-full h-10 rounded cursor-pointer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu nhấn</label>
                  <input type="color" name="accentColor" value={content.accentColor} onChange={handleChange} className="w-full h-10 rounded cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu chữ</label>
                  <input type="color" name="textColor" value={content.textColor} onChange={handleChange} className="w-full h-10 rounded cursor-pointer" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu nền trang</label>
                <input type="color" name="backgroundColor" value={content.backgroundColor} onChange={handleChange} className="w-full h-10 rounded cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Font chữ chính</label>
                <select name="fontFamily" value={content.fontFamily} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="Inter">Inter (Hiện đại)</option>
                  <option value="Roboto">Roboto (Phổ biến)</option>
                  <option value="Montserrat">Montserrat (Mạnh mẽ)</option>
                  <option value="Playfair Display">Playfair Display (Sang trọng)</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Tỷ lệ chữ</label>
                  <span className="text-xs font-bold text-[#c8102e]">{content.fontScale}x</span>
                </div>
                <input 
                  type="range" 
                  name="fontScale" 
                  min="0.8" 
                  max="1.5" 
                  step="0.05"
                  value={content.fontScale} 
                  onChange={handleChange} 
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Độ rộng trang (px)</label>
                  <span className="text-xs font-bold text-[#c8102e]">{content.containerWidth}px</span>
                </div>
                <input 
                  type="range" 
                  name="containerWidth" 
                  min="1000" 
                  max="1600" 
                  step="40"
                  value={content.containerWidth} 
                  onChange={handleChange} 
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Bo góc (px)</label>
                    <span className="text-xs font-bold text-[#c8102e]">{content.borderRadius}px</span>
                  </div>
                  <input 
                    type="range" 
                    name="borderRadius" 
                    min="0" 
                    max="32" 
                    step="2"
                    value={content.borderRadius} 
                    onChange={handleChange} 
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Khoảng cách (px)</label>
                    <span className="text-xs font-bold text-[#c8102e]">{content.sectionSpacing}px</span>
                  </div>
                  <input 
                    type="range" 
                    name="sectionSpacing" 
                    min="20" 
                    max="150" 
                    step="10"
                    value={content.sectionSpacing} 
                    onChange={handleChange} 
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu nền phần Chính sách</label>
                    <div className="flex items-center space-x-2">
                      <input type="color" name="policySectionBgColor" value={content.policySectionBgColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                      <input type="text" name="policySectionBgColor" value={content.policySectionBgColor} onChange={handleChange} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu chữ nút Chính sách</label>
                    <div className="flex items-center space-x-2">
                      <input type="color" name="policyTabTextColor" value={content.policyTabTextColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                      <input type="text" name="policyTabTextColor" value={content.policyTabTextColor} onChange={handleChange} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sizing Controls */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Maximize2 className="w-5 h-5 mr-2 text-[#c8102e]" />
              Kích thước & Tỷ lệ
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Logo URL</label>
                <input type="text" name="logoUrl" value={content.logoUrl} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Job Icon URL (SVG)</label>
                <input type="text" name="jobIconUrl" value={content.jobIconUrl} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Kích thước Logo (%)</label>
                  <span className="text-xs font-bold text-[#c8102e]">{content.logoSize}%</span>
                </div>
                <input 
                  type="range" 
                  name="logoSize" 
                  min="5" 
                  max="100" 
                  step="1"
                  value={content.logoSize} 
                  onChange={handleChange} 
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Chiều cao Banner (px)</label>
                  <span className="text-xs font-bold text-[#c8102e]">{content.heroHeight}px</span>
                </div>
                <input 
                  type="range" 
                  name="heroHeight" 
                  min="300" 
                  max="800" 
                  step="10"
                  value={content.heroHeight} 
                  onChange={handleChange} 
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Độ mờ lớp phủ Banner</label>
                  <span className="text-xs font-bold text-[#c8102e]">{Math.round(content.heroOverlayOpacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  name="heroOverlayOpacity" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={content.heroOverlayOpacity} 
                  onChange={handleChange} 
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#c8102e]" 
                />
              </div>
            </div>
          </section>

          {/* Social Links */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Facebook className="w-5 h-5 mr-2 text-[#c8102e]" />
              Mạng xã hội
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Facebook URL</label>
                <input type="text" name="facebookUrl" value={content.facebookUrl} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Youtube URL</label>
                <input type="text" name="youtubeUrl" value={content.youtubeUrl} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Facebook Fanpage (Liên hệ)</label>
                <input type="text" name="contactFacebookUrl" value={content.contactFacebookUrl} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </section>

          {/* Section Order */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Layout className="w-5 h-5 mr-2 text-[#c8102e]" />
              Thứ tự các phần (Kéo thả)
            </h3>
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={content.sectionOrder}
                strategy={verticalListSortingStrategy}
              >
                {content.sectionOrder.map((section, idx) => (
                  <SortableItem 
                    key={section} 
                    id={section} 
                    section={section} 
                    idx={idx}
                    isVisible={(content as any)[`show${section.charAt(0).toUpperCase() + section.slice(1)}`]}
                    toggleVisibility={toggleVisibility}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </section>
        </div>

        {/* Right: Content Editor or Preview */}
        <div className={`${showPreview ? 'xl:col-span-8' : 'lg:col-span-2'} space-y-8`}>
          {showPreview && (
            <div className="sticky top-48 z-30">
              <div className="bg-gray-800 rounded-t-2xl p-3 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-4">
                  <span className="text-white text-xs font-bold uppercase tracking-widest ml-2">Xem trước trực tiếp</span>
                  <div className="h-4 w-[1px] bg-gray-600"></div>
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => setPreviewMode('desktop')}
                      className={`p-1.5 rounded-lg transition ${previewMode === 'desktop' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
                      title="Máy tính"
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setPreviewMode('tablet')}
                      className={`p-1.5 rounded-lg transition ${previewMode === 'tablet' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
                      title="Máy tính bảng"
                    >
                      <Tablet className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setPreviewMode('mobile')}
                      className={`p-1.5 rounded-lg transition ${previewMode === 'mobile' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
                      title="Điện thoại"
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
              </div>
              <div className="bg-gray-100 border-x border-b border-gray-200 rounded-b-2xl overflow-hidden shadow-2xl relative">
                <div 
                  className="mx-auto transition-all duration-500 bg-white overflow-y-auto custom-scrollbar"
                  style={{ 
                    width: previewMode === 'desktop' ? '100%' : previewMode === 'tablet' ? '768px' : '375px',
                    height: '600px',
                    maxWidth: '100%'
                  }}
                >
                  <MainPage previewContent={content} />
                </div>
              </div>
            </div>
          )}

          {/* Hero Section */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <ImageIcon className="w-5 h-5 mr-2 text-[#c8102e]" />
              Nội dung Banner chính
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ảnh nền (URL)</label>
                <input type="text" name="heroBgImage" value={content.heroBgImage} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tiêu đề lớn</label>
                  <input type="text" name="heroTitle" value={content.heroTitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tiêu đề nhỏ</label>
                  <input type="text" name="heroSubtitle" value={content.heroSubtitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
              </div>
            </div>
          </section>

          {/* Jobs Section */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Briefcase className="w-5 h-5 mr-2 text-[#c8102e]" />
              Nội dung Việc làm
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tiêu đề phần việc làm</label>
                <input type="text" name="jobsTitle" value={content.jobsTitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
              </div>
            </div>
          </section>

          {/* Policies */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Type className="w-5 h-5 mr-2 text-[#c8102e]" />
              Chính sách & Phúc lợi
            </h3>
            <div className="space-y-8">
              {/* Policy 1 */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <h4 className="font-bold text-sm text-gray-600 uppercase">Chính sách 1: Đào tạo</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tiêu đề</label>
                    <input type="text" name="policy1Title" value={content.policy1Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Mô tả</label>
                    <textarea name="policy1Desc" value={content.policy1Desc} onChange={handleChange} rows={3} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Ảnh minh họa (URL)</label>
                    <input type="text" name="policy1Image" value={content.policy1Image} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* Policy 2 */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <h4 className="font-bold text-sm text-gray-600 uppercase">Chính sách 2: Môi trường</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tiêu đề</label>
                    <input type="text" name="policy2Title" value={content.policy2Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Câu trích dẫn (Quote)</label>
                    <textarea name="policy2Quote" value={content.policy2Quote} onChange={handleChange} rows={2} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Mô tả thêm</label>
                    <textarea name="policy2Desc" value={content.policy2Desc} onChange={handleChange} rows={2} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Ảnh minh họa (URL)</label>
                    <input type="text" name="policy2Image" value={content.policy2Image} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                </div>
              </div>

              {/* Policy 3 */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <h4 className="font-bold text-sm text-gray-600 uppercase">Chính sách 3: Phúc lợi</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tiêu đề</label>
                    <input type="text" name="policy3Title" value={content.policy3Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Danh sách phúc lợi (Mỗi dòng 1 mục)</label>
                    <textarea name="policy3Benefits" value={content.policy3Benefits} onChange={handleChange} rows={5} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" placeholder="Mức lương cạnh tranh...&#10;Hỗ trợ ăn trưa..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Ảnh minh họa (URL)</label>
                    <input type="text" name="policy3Image" value={content.policy3Image} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Recruitment Section */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <MousePointerClick className="w-5 h-5 mr-2 text-[#c8102e]" />
              Quy trình tuyển dụng
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tiêu đề phần quy trình</label>
                  <input type="text" name="recruitmentTitle" value={content.recruitmentTitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu nền các bước</label>
                  <div className="flex items-center space-x-2">
                    <input type="color" name="recruitmentStepBgColor" value={content.recruitmentStepBgColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                    <input type="text" name="recruitmentStepBgColor" value={content.recruitmentStepBgColor} onChange={handleChange} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu chữ các bước</label>
                  <div className="flex items-center space-x-2">
                    <input type="color" name="recruitmentStepTextColor" value={content.recruitmentStepTextColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                    <input type="text" name="recruitmentStepTextColor" value={content.recruitmentStepTextColor} onChange={handleChange} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 1</label>
                  <input type="text" name="recruitmentStep1Title" value={content.recruitmentStep1Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 2</label>
                  <input type="text" name="recruitmentStep2Title" value={content.recruitmentStep2Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 3</label>
                  <input type="text" name="recruitmentStep3Title" value={content.recruitmentStep3Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 4</label>
                  <input type="text" name="recruitmentStep4Title" value={content.recruitmentStep4Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 5</label>
                  <input type="text" name="recruitmentStep5Title" value={content.recruitmentStep5Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bước 6</label>
                  <input type="text" name="recruitmentStep6Title" value={content.recruitmentStep6Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" />
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
              <Layout className="w-5 h-5 mr-2 text-[#c8102e]" />
              Nội dung Chân trang (Footer)
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mô tả chân trang</label>
                <textarea 
                  name="footerDescription" 
                  value={content.footerDescription} 
                  onChange={handleChange} 
                  rows={4} 
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm" 
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
