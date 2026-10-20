import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, FileText, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { authBlob, ApiError } from './api';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type CvKind = 'pdf' | 'docx' | 'other';

/** Sau khi bấm "Mở tab mới", giữ object URL thêm một lúc để tab đó còn tải lại được. */
const EXTERNAL_TAB_REVOKE_DELAY_MS = 10 * 60 * 1000;

type ViewerState =
  | { status: 'loading' }
  | { status: 'error'; message: string; canRetry: boolean }
  | { status: 'ready'; url: string; fileName: string; kind: CvKind };

interface CvViewerProps {
  /** id hồ sơ ứng tuyển (GET /api/applications/:id/cv). */
  applicationId: string;
  /** Tên file dự phòng khi máy chủ không gửi Content-Disposition. */
  fileName?: string;
  candidateName?: string;
  onClose: () => void;
}

function detectKind(mimeType: string, fileName: string): CvKind {
  if (mimeType === PDF_MIME) return 'pdf';
  if (mimeType === DOCX_MIME || /\.docx$/i.test(fileName)) return 'docx';
  return 'other';
}

/** Tên file tải xuống: giữ tên gốc, thêm phần mở rộng nếu thiếu. */
function buildDownloadName(fileName: string, kind: CvKind): string {
  const name = fileName.trim() || 'CV';
  if (kind === 'pdf' && !/\.pdf$/i.test(name)) return `${name}.pdf`;
  if (kind === 'docx' && !/\.docx$/i.test(name)) return `${name}.docx`;
  return name;
}

function getErrorState(error: unknown): { message: string; canRetry: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { message: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại để xem CV.', canRetry: false };
    }
    if (error.status === 403) {
      return {
        message: 'Phiên đăng nhập hết hạn hoặc tài khoản không còn quyền quản trị. Vui lòng đăng nhập lại bằng tài khoản quản trị để xem CV.',
        canRetry: false,
      };
    }
    if (error.status === 404) {
      return {
        message:
          'Không tìm thấy file CV lưu trên hệ thống. CV có thể nằm trong email thông báo gửi bộ phận Tuyển dụng (file đính kèm); nếu không có, vui lòng liên hệ ứng viên.',
        canRetry: false,
      };
    }
    return { message: `Không tải được file CV: ${error.message}`, canRetry: true };
  }
  return { message: 'Không tải được file CV. Vui lòng kiểm tra kết nối mạng và thử lại.', canRetry: true };
}

/**
 * Cửa sổ xem CV lưu trên hệ thống (cvStorage 'stored'). Tải file qua API quản trị (kèm token),
 * hiển thị PDF trong iframe từ object URL; file Word chỉ cho tải xuống.
 */
export default function CvViewer({ applicationId, fileName, candidateName, onClose }: CvViewerProps) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openedInNewTabRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Tải file CV; thu hồi object URL khi đóng/đổi hồ sơ.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let objectUrl: string | null = null;
    openedInNewTabRef.current = false;
    setState({ status: 'loading' });

    authBlob(`/api/applications/${encodeURIComponent(applicationId)}/cv`, { signal: controller.signal })
      .then(({ blob, fileName: serverFileName, mimeType }) => {
        if (cancelled) return;
        if (mimeType === 'text/html' || blob.size === 0) {
          setState({
            status: 'error',
            message: blob.size === 0 ? 'File CV trống hoặc bị lỗi.' : 'Phản hồi không hợp lệ từ máy chủ.',
            canRetry: blob.size !== 0,
          });
          return;
        }
        const name = serverFileName || fileName || '';
        const kind = detectKind(mimeType, name);
        // Gán MIME rõ ràng: trình duyệt luôn coi object URL là PDF/Word/nhị phân, không bao giờ là HTML.
        const safeType = kind === 'pdf' ? PDF_MIME : kind === 'docx' ? DOCX_MIME : 'application/octet-stream';
        objectUrl = URL.createObjectURL(new Blob([blob], { type: safeType }));
        setState({ status: 'ready', url: objectUrl, fileName: buildDownloadName(name, kind), kind });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Không tải được file CV:', error);
        setState({ status: 'error', ...getErrorState(error) });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (!objectUrl) return;
      const url = objectUrl;
      if (openedInNewTabRef.current) {
        // Tab mới vẫn dùng URL này (tải lại, lưu file): thu hồi sau. Đóng trang quản trị cũng tự giải phóng.
        window.setTimeout(() => URL.revokeObjectURL(url), EXTERNAL_TAB_REVOKE_DELAY_MS);
      } else {
        URL.revokeObjectURL(url);
      }
    };
  }, [applicationId, fileName, reloadKey]);

  // Esc để đóng, khóa cuộn trang nền, chặn thao tác (kể cả phím Tab) với phần nền phía sau,
  // trả focus về nút đã mở khi đóng.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Cửa sổ này được portal ra document.body (ngoài #root) nên vẫn dùng được khi #root bị inert.
    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.hasAttribute('inert') ?? true;
    if (appRoot && !rootWasInert) appRoot.setAttribute('inert', '');
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Bỏ inert TRƯỚC khi trả focus: không thể focus vào phần tử nằm trong vùng inert.
      if (appRoot && !rootWasInert) appRoot.removeAttribute('inert');
      previouslyFocused?.focus();
    };
  }, []);

  const title = state.status === 'ready' ? state.fileName : fileName || 'CV ứng viên';

  const downloadButton = (variant: 'header' | 'body') =>
    state.status === 'ready' ? (
      <a
        href={state.url}
        download={state.fileName}
        className={
          variant === 'header'
            ? 'inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs'
            : 'inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-md'
        }
        title="Tải file CV về máy"
        aria-label="Tải xuống"
      >
        <Download className="w-4 h-4" />
        <span className={variant === 'header' ? 'hidden sm:inline' : undefined}>Tải xuống</span>
      </a>
    ) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-black/70 flex items-stretch sm:items-center justify-center sm:p-6"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-viewer-title"
        className="bg-white w-full h-full sm:h-[92vh] sm:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a2b4c] to-[#23328c] text-white px-3 sm:px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3 flex items-center gap-3 shrink-0">
          <FileText className="w-5 h-5 shrink-0 text-blue-200" />
          <div className="min-w-0 flex-1">
            <h2 id="cv-viewer-title" className="text-sm sm:text-base font-bold truncate" title={title}>
              {title}
            </h2>
            {candidateName && (
              <p className="text-xs text-white/70 truncate">Ứng viên: {candidateName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {downloadButton('header')}
            {state.status === 'ready' && state.kind === 'pdf' && (
              <a
                href={state.url}
                target="_blank"
                rel="noopener"
                onClick={() => {
                  openedInNewTabRef.current = true;
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition"
                title="Mở CV trong tab mới (muốn giữ tên file gốc khi lưu, hãy dùng nút Tải xuống)"
                aria-label="Mở tab mới"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Mở tab mới</span>
              </a>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition"
              title="Đóng"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 bg-gray-100 flex">
          {state.status === 'loading' && (
            <div className="m-auto flex flex-col items-center text-gray-500 text-sm p-6">
              <Loader2 className="w-8 h-8 animate-spin text-[#23328c] mb-3" />
              <span>Đang tải file CV...</span>
            </div>
          )}

          {state.status === 'error' && (
            <div className="m-auto max-w-md text-center p-6">
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7" />
              </div>
              <p className="text-sm text-gray-800 font-medium mb-4">{state.message}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {state.canRetry && (
                  <button
                    type="button"
                    onClick={() => setReloadKey(key => key + 1)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#23328c] hover:bg-[#1a2b4c] text-white text-sm font-semibold rounded-xl transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Thử lại</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl border border-gray-200 transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {state.status === 'ready' && state.kind === 'pdf' && (
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Một số trình duyệt điện thoại không hiển thị PDF trong khung */}
              <p className="sm:hidden text-[11px] leading-snug text-amber-900 bg-amber-50 border-b border-amber-100 px-3 py-1.5">
                Không thấy nội dung CV? Bấm biểu tượng tải xuống hoặc mở tab mới ở góc trên.
              </p>
              <iframe
                src={state.url}
                title={`CV ${state.fileName}`}
                className="w-full flex-1 min-h-0 border-0 bg-white"
              />
            </div>
          )}

          {state.status === 'ready' && state.kind !== 'pdf' && (
            <div className="m-auto max-w-md text-center p-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7" />
              </div>
              <p className="text-sm text-gray-800 mb-1 font-semibold break-words">{state.fileName}</p>
              <p className="text-sm text-gray-600 mb-5">
                {state.kind === 'docx'
                  ? 'Trình duyệt không xem trực tiếp được file Word (.docx). Bấm "Tải xuống" để mở bằng Word.'
                  : 'Trình duyệt không xem trực tiếp được loại file này. Bấm "Tải xuống" để mở trên máy.'}
              </p>
              {downloadButton('body')}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
