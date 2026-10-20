import DOMPurify from 'dompurify';

// Nội dung tin tuyển dụng là HTML từ trình soạn thảo (lưu trong Firestore). Luôn làm sạch trước khi
// hiển thị bằng dangerouslySetInnerHTML để mã độc (<script>, onerror=..., javascript:...) đã lỡ bị
// ghi vào dữ liệu không chạy được trên trang công khai hay trang quản trị.

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Link mở tab mới không được truy cập ngược lại trang (reverse tabnabbing).
  if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Trả về HTML đã loại bỏ script, thuộc tính sự kiện và link nguy hiểm. */
export function sanitizeHtml(html: unknown): string {
  if (typeof html !== 'string' || !html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
  });
}
