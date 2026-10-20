/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL của Google Apps Script Web App dùng để lưu file CV vào Google Drive.
   * Không bắt buộc: nếu để trống, CV (tối đa 3 MB) được gửi kèm email tuyển dụng.
   */
  readonly VITE_CV_UPLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
