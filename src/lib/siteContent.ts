import { safeExternalUrl } from './safeHtml';

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
  websiteUrl: 'https://hoangmaistarschool.edu.vn/',
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
  hotline: '0398 130 108',

  jobsTitle: 'CƠ HỘI VIỆC LÀM',

  policy1Title: 'Đào tạo và phát triển',
  policy1Desc: 'Bên cạnh việc tuyển dụng nhân sự chất lượng cao, Ngôi Sao Hoàng Mai đặc biệt chú trọng vào việc đào tạo và phát triển chuyên môn cho Giáo viên thông qua các chương trình đào tạo bài bản. Giáo viên có cơ hội học hỏi, phát triển và thăng tiến trong công việc, được chứng tỏ bản thân và tạo điều kiện phát huy tối đa năng lực, tiềm năng của mình.',
  trainingImages: [
    "https://hoangmaistarschool.edu.vn/thongtin/dtpt1.jpg",
    "https://hoangmaistarschool.edu.vn/thongtin/dtpt2.jpg"
  ].join('\n'),

  policy2Title: 'Không gian làm việc',
  policy2Desc: 'Tại Trường Ngôi Sao Hoàng Mai, chúng tôi chú trọng đầu tư cơ sở vật chất đồng bộ, hiện đại và thân thiện với môi trường, nhằm kiến tạo một không gian làm việc sáng tạo, nơi mỗi cán bộ, giáo viên có thể phát huy tối đa năng lực của mình. Bên cạnh đó, hệ thống trang thiết bị tiên tiến cùng nền tảng công nghệ được ứng dụng linh hoạt trong giảng dạy và vận hành không chỉ nâng cao hiệu quả công việc mà còn góp phần tối ưu chất lượng dạy và học, mang đến trải nghiệm giáo dục toàn diện cho cả giáo viên và học sinh.',
  workspaceImages: [
    "https://hoangmaistarschool.edu.vn/thongtin/kg1.jpg",
    "https://hoangmaistarschool.edu.vn/thongtin/kg2.jpg",
    "https://hoangmaistarschool.edu.vn/thongtin/kg3.jpg",
    "https://hoangmaistarschool.edu.vn/thongtin/kg4.jpg"
  ].join('\n'),

  policy3Title: 'Hệ thống triết lý',
  policy3Desc1: 'Giáo dục hướng đến phát triển toàn diện, tinh hoa và hội nhập, đặt nền trên đạo đức vững vàng, trí tuệ khai mở, thể chất dẻo dai, nhân cách trưởng thành và tinh thần hòa hợp sâu sắc.',
  policy3Desc2: 'Trên tinh thần đó, Trường Ngôi Sao Hoàng Mai xác lập và kiên định với 5 trụ cột giáo dục cốt lõi:\nĐạo đức, Trí tuệ, Thể chất, Nhân cách, Hoà hợp.',
  philosophyImages: [
    "https://hoangmaistarschool.edu.vn/thongtin/httl1.png",
    "https://hoangmaistarschool.edu.vn/thongtin/httl1.png"
  ].join('\n'),

  policy4Title: 'Tầm nhìn - Sứ mệnh - Giá trị cốt lõi',
  policy4Vision: '"Trở thành Trường học tinh hoa, mang bản sắc Việt và vươn tầm quốc tế"',
  policy4Mission: '"Kiến tạo nền tảng giáo dục tiên tiến, mang bản sắc Việt, chất lượng quốc tế"',
  policy4CoreValues: 'Trường Ngôi Sao Hoàng Mai chú trọng vào việc xây dựng môi trường làm việc văn minh, chuyên nghiệp, hiệu quả; đồng thời đề cao 5 giá trị cốt lõi: Chân Thành - Chính Trực - Chăm Sóc - Chuyên Nghiệp - Chất Lượng.',
  coreValuesImage: 'https://hoangmaistarschool.edu.vn/thongtin/gtcl.png',

  policyTab0Label: 'ĐÀO TẠO VÀ PHÁT TRIỂN',
  policyTab1Label: 'KHÔNG GIAN LÀM VIỆC',
  policyTab2Label: 'HỆ THỐNG TRIẾT LÝ',
  policyTab3Label: 'TẦM NHÌN - SỨ MỆNH - GIÁ TRỊ CỐT LÕI',
  policyTab4Label: 'CHÍNH SÁCH PHÚC LỢI',

  policy5Title: 'Chính sách phúc lợi',
  policy5Benefits: [
    'Thưởng các ngày Lễ, Tết, Kỷ niệm thành lập trường, ngày Nhà giáo Việt Nam 20/11...',
    'Chế độ nghỉ mát, du xuân, teambuilding hàng năm.',
    'Khám sức khỏe định kỳ hàng năm.',
    'Chế độ ưu đãi học phí cho con em CBNV.'
  ].join('\n'),
  benefitsImage: 'https://images.unsplash.com/photo-1556761175-5973dc0f32d7?q=80&w=1932&auto=format&fit=crop',
  benefitsImages: [
    'https://hoangmaistarschool.edu.vn/thongtin/cs2.jpg',
    'https://hoangmaistarschool.edu.vn/thongtin/cs3.jpg',
    'https://hoangmaistarschool.edu.vn/thongtin/cs4.jpg'
  ].join('\n'),

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

export const siteContentLists = ['policy5Benefits', 'trainingImages', 'workspaceImages', 'philosophyImages', 'benefitsImages'] as const;
export const siteContentUrlFields = ['logoUrl', 'jobIconUrl', 'heroBgImage', 'coreValuesImage', 'benefitsImage', 'facebookUrl', 'youtubeUrl', 'websiteUrl', 'contactFacebookUrl'] as const;
export const siteContentNumberLimits: Record<string, [number, number]> = {
  fontScale: [0.8, 1.5], containerWidth: [1000, 1600], borderRadius: [0, 32],
  sectionSpacing: [20, 150], logoSize: [5, 100], heroHeight: [300, 800], heroOverlayOpacity: [0, 1],
};
const sections = ['hero', 'nav', 'jobs', 'policies', 'form'];

/** Ignore unknown fields and malformed legacy data before using public settings. */
export function normalizeSiteContent(value: unknown): typeof defaultContent {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...defaultContent } as typeof defaultContent;
  for (const key of Object.keys(defaultContent) as Array<keyof typeof defaultContent>) {
    const candidate = source[key];
    if (candidate === undefined) continue;
    if (key === 'sectionOrder') {
      if (Array.isArray(candidate) && candidate.length === sections.length && new Set(candidate).size === sections.length && candidate.every(item => sections.includes(item))) result.sectionOrder = [...candidate];
    } else if (typeof defaultContent[key] === 'boolean') {
      if (typeof candidate === 'boolean') (result as Record<string, unknown>)[key] = candidate;
    } else if (typeof defaultContent[key] === 'number') {
      const [min, max] = siteContentNumberLimits[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= min && candidate <= max) (result as Record<string, unknown>)[key] = candidate;
    } else if (siteContentLists.includes(key as typeof siteContentLists[number])) {
      const list = Array.isArray(candidate) ? candidate : typeof candidate === 'string' ? candidate.split('\n') : null;
      if (list && list.length <= 20 && list.every(item => typeof item === 'string' && item.length <= (key === 'policy5Benefits' ? 1000 : 2000))) {
        const lines = list.map((item: string) => item.trim()).filter(Boolean);
        (result as Record<string, unknown>)[key] = (key === 'policy5Benefits' ? lines : lines.filter(line => safeExternalUrl(line))).join('\n');
      }
    } else if (key.endsWith('Color')) {
      if (typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)) (result as Record<string, unknown>)[key] = candidate;
    } else if (key === 'fontFamily') {
      if (['Inter', 'Roboto', 'Montserrat', 'Playfair Display'].includes(String(candidate))) result.fontFamily = String(candidate);
    } else if (siteContentUrlFields.includes(key as typeof siteContentUrlFields[number])) {
      if (typeof candidate === 'string' && candidate.length <= 2000) (result as Record<string, unknown>)[key] = candidate === '' ? '' : (safeExternalUrl(candidate) || defaultContent[key]);
    } else if (typeof candidate === 'string' && candidate.length <= 10000) {
      (result as Record<string, unknown>)[key] = candidate;
    }
  }
  return result;
}

export function validateSiteContent(content: typeof defaultContent): void {
  for (const field of siteContentUrlFields) {
    if (content[field] && (!safeExternalUrl(content[field]) || content[field].length > 2000)) throw new Error(`Liên kết ${field} không hợp lệ. Chỉ chấp nhận http:// và https:// (tối đa 2000 ký tự).`);
  }
  for (const field of siteContentLists) {
    const values = content[field].split('\n').map(value => value.trim()).filter(Boolean);
    if (values.length > 20 || values.some(value => value.length > (field === 'policy5Benefits' ? 1000 : 2000))) throw new Error('Mỗi danh sách chỉ được có tối đa 20 dòng, mỗi dòng tối đa 1000 ký tự (2000 với liên kết ảnh).');
    if (field !== 'policy5Benefits' && values.some(value => !safeExternalUrl(value))) throw new Error('Danh sách ảnh chỉ chấp nhận liên kết http:// và https://.');
  }
  for (const [field, [min, max]] of Object.entries(siteContentNumberLimits)) {
    const value = (content as Record<string, unknown>)[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Giá trị ${field} phải nằm trong khoảng ${min}–${max}.`);
  }
  for (const [field, value] of Object.entries(content)) {
    if (field.endsWith('Color') && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error('Màu sắc phải có dạng #RRGGBB.');
    if (typeof value === 'string' && value.length > 10000) throw new Error('Nội dung quá dài (tối đa 10000 ký tự cho mỗi trường).');
  }
}
