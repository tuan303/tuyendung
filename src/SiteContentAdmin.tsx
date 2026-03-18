import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Save, Image as ImageIcon, Type } from 'lucide-react';

export const defaultContent = {
  heroBgImage: 'https://hoangmaistarschool.edu.vn/thongtin/nen.jpg',
  heroTitle: 'Tuyển dụng',
  heroSubtitle: 'Trường Ngôi Sao Hoàng Mai',
  
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
  ].join('\n')
};

export default function SiteContentAdmin() {
  const [content, setContent] = useState(defaultContent);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContent(prev => ({ ...prev, [name]: value }));
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

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
        <h2 className="text-2xl font-bold text-[#1a2b4c]">Quản lý Giao diện</h2>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center space-x-2 bg-[#c8102e] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50 shadow-md"
        >
          <Save className="w-5 h-5" />
          <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
        </button>
      </div>

      <div className="space-y-10">
        {/* Hero Section */}
        <section className="space-y-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center border-l-4 border-[#c8102e] pl-3">
            <ImageIcon className="w-5 h-5 mr-2 text-gray-500" />
            Banner Chính (Hero Section)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Link Ảnh Nền (Background URL)</label>
              <input type="text" name="heroBgImage" value={content.heroBgImage} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề chính</label>
              <input type="text" name="heroTitle" value={content.heroTitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề phụ</label>
              <input type="text" name="heroSubtitle" value={content.heroSubtitle} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
          </div>
        </section>

        {/* Policy 1 */}
        <section className="space-y-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center border-l-4 border-[#c8102e] pl-3">
            <Type className="w-5 h-5 mr-2 text-gray-500" />
            Chính sách 1: Đào tạo
          </h3>
          <div className="grid grid-cols-1 gap-5 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
              <input type="text" name="policy1Title" value={content.policy1Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
              <textarea name="policy1Desc" value={content.policy1Desc} onChange={handleChange} rows={3} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link Ảnh</label>
              <input type="text" name="policy1Image" value={content.policy1Image} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
          </div>
        </section>

        {/* Policy 2 */}
        <section className="space-y-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center border-l-4 border-[#c8102e] pl-3">
            <Type className="w-5 h-5 mr-2 text-gray-500" />
            Chính sách 2: Môi trường
          </h3>
          <div className="grid grid-cols-1 gap-5 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
              <input type="text" name="policy2Title" value={content.policy2Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Câu trích dẫn (Quote)</label>
              <textarea name="policy2Quote" value={content.policy2Quote} onChange={handleChange} rows={2} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả thêm</label>
              <textarea name="policy2Desc" value={content.policy2Desc} onChange={handleChange} rows={2} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link Ảnh</label>
              <input type="text" name="policy2Image" value={content.policy2Image} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
          </div>
        </section>

        {/* Policy 3 */}
        <section className="space-y-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center border-l-4 border-[#c8102e] pl-3">
            <Type className="w-5 h-5 mr-2 text-gray-500" />
            Chính sách 3: Phúc lợi
          </h3>
          <div className="grid grid-cols-1 gap-5 bg-gray-50 p-5 rounded-xl border border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
              <input type="text" name="policy3Title" value={content.policy3Title} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Danh sách phúc lợi (Mỗi dòng 1 mục)</label>
              <textarea name="policy3Benefits" value={content.policy3Benefits} onChange={handleChange} rows={5} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#c8102e] outline-none" placeholder="Mức lương cạnh tranh...&#10;Hỗ trợ ăn trưa..." />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
