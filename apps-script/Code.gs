/**
 * =====================================================================
 *  ỨNG DỤNG WEB LƯU CV ỨNG VIÊN VÀO GOOGLE DRIVE
 *  Website Tuyển dụng — Trường Ngôi Sao Hoàng Mai
 * =====================================================================
 *
 *  Trình duyệt của ứng viên gửi file CV (PDF/DOCX, tối đa 5 MB) THẲNG tới
 *  script này (không đi qua Vercel). Script lưu file vào Google Drive của
 *  tài khoản triển khai script và trả về link file. File được giữ ở chế độ
 *  RIÊNG TƯ (script không hề thay đổi quyền chia sẻ) — chỉ chủ Drive và những
 *  người được chia sẻ thư mục mới mở được.
 *
 *  Vì URL /exec là công khai (nằm trong mã trang web), script tự giới hạn số
 *  lượt tải lên (mặc định 20 file/phút và 300 file/ngày cho toàn bộ ứng viên —
 *  xem MAX_UPLOADS_PER_MINUTE / MAX_UPLOADS_PER_DAY bên dưới) để không ai có
 *  thể dùng script làm đầy Google Drive của nhà trường.
 *
 *  ---------------------------------------------------------------------
 *  HƯỚNG DẪN TRIỂN KHAI (làm một lần)
 *  ---------------------------------------------------------------------
 *  1. Đăng nhập Google bằng tài khoản sẽ LƯU CV (nên dùng tài khoản của
 *     phòng tuyển dụng, ví dụ tuyendung@hoangmaistarschool.edu.vn, hoặc một
 *     tài khoản riêng chỉ dùng để chứa CV).
 *  2. Mở https://script.google.com > "Dự án mới". Đặt tên dự án, ví dụ
 *     "Tuyen dung - Luu CV".
 *  3. Xóa nội dung mặc định trong tệp Code.gs, dán TOÀN BỘ nội dung tệp này
 *     vào, rồi bấm Lưu (biểu tượng đĩa mềm hoặc Ctrl+S / Cmd+S).
 *  4. Tệp kê khai (khuyên làm): bấm "Cài đặt dự án" (biểu tượng bánh răng bên
 *     trái) > tích "Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh
 *     sửa". Quay lại "Trình chỉnh sửa", mở appsscript.json, thay bằng nội dung
 *     tệp apps-script/appsscript.json trong mã nguồn, rồi Lưu.
 *  5. (Tùy chọn) Chọn thư mục lưu CV — xem mục "CV_FOLDER_ID" bên dưới.
 *  6. Cấp quyền: trên thanh công cụ chọn hàm "thietLapBanDau" > bấm "Chạy" >
 *     "Xem xét quyền" > chọn tài khoản > nếu hiện "Google chưa xác minh ứng
 *     dụng này" bấm "Nâng cao" > "Đi tới ... (không an toàn)" > "Cho phép".
 *     Xem "Nhật ký thực thi": phải thấy dòng "Thư mục lưu CV: ...".
 *  7. Bấm "Triển khai" > "Tùy chọn triển khai mới" > biểu tượng bánh răng cạnh
 *     "Chọn loại" > "Ứng dụng web", rồi điền:
 *        - Nội dung mô tả:            v1
 *        - Thực thi với tư cách:      Tôi (email của bạn)
 *        - Người có quyền truy cập:   Bất kỳ ai
 *     Bấm "Triển khai" > sao chép "URL ứng dụng web" (kết thúc bằng /exec).
 *     Nếu KHÔNG thấy lựa chọn "Bất kỳ ai": tài khoản Google Workspace của
 *     trường đang bị quản trị viên tên miền chặn chia sẻ ra ngoài — nhờ quản
 *     trị viên Google Workspace bật lại, hoặc triển khai bằng tài khoản khác.
 *  8. Kiểm tra: dán URL /exec vào trình duyệt, phải thấy
 *        {"status":"ok","service":"cv-upload"}
 *  9. BẮT BUỘC — chia sẻ thư mục lưu CV: mở thư mục (link in ở "Nhật ký thực
 *     thi" của bước 6) > Chia sẻ > thêm email của MỌI người cần mở CV: mọi
 *     địa chỉ "Email nhận hồ sơ" trong Quản trị > Cài đặt Email và mọi tài
 *     khoản quản trị dùng nút "Mở CV" — quyền "Người xem". Đừng bật "Bất kỳ ai
 *     có đường liên kết". Email thông báo chỉ chứa LINK riêng tư tới file CV
 *     (không đính kèm file), người chưa được chia sẻ sẽ thấy "Bạn cần quyền
 *     truy cập".
 * 10. Trên Vercel: Settings > Environment Variables > thêm
 *        VITE_CV_UPLOAD_URL = <URL /exec vừa sao chép>
 *     rồi Redeploy để website build lại.
 *
 *  Khi sửa mã script sau này: "Triển khai" > "Quản lý các lần triển khai" >
 *  chọn bản đang chạy > biểu tượng bút chì > Phiên bản: "Phiên bản mới" >
 *  "Triển khai". Làm như vậy URL /exec GIỮ NGUYÊN. (Nếu tạo "Tùy chọn triển
 *  khai mới" thì URL sẽ đổi và phải cập nhật lại VITE_CV_UPLOAD_URL.)
 *
 *  ---------------------------------------------------------------------
 *  CV_FOLDER_ID — chọn thư mục lưu CV (tùy chọn)
 *  ---------------------------------------------------------------------
 *  - Tạo/mở thư mục trên Google Drive, nhìn thanh địa chỉ dạng
 *       https://drive.google.com/drive/folders/1AbCdEf...XyZ
 *    phần sau "folders/" chính là ID thư mục.
 *  - Trong Apps Script: "Cài đặt dự án" > "Thuộc tính tập lệnh" > "Thêm thuộc
 *    tính tập lệnh": Thuộc tính = CV_FOLDER_ID, Giá trị = <ID thư mục> > Lưu.
 *  - Tài khoản triển khai script phải có quyền CHỈNH SỬA thư mục đó.
 *  - Nếu không đặt, script tự tìm (hoặc tạo mới) thư mục
 *       "CV Ung Vien - Tuyen dung"
 *    ở thư mục gốc "Drive của tôi" của tài khoản triển khai.
 *  - Muốn đồng nghiệp xem CV: chia sẻ THƯ MỤC cho đúng email của họ
 *    (đừng bật "Bất kỳ ai có đường liên kết") — xem bước 9.
 *
 *  ---------------------------------------------------------------------
 *  GIAO TIẾP (hợp đồng với website)
 *  ---------------------------------------------------------------------
 *  POST <URL /exec>   Content-Type: text/plain;charset=utf-8
 *    Body (JSON): { fileName, mimeType, fileData, candidateName, position }
 *      - fileData: base64 của file, có hoặc không có tiền tố "data:...;base64,"
 *  Trả về JSON:
 *    { status: 'success', fileId, fileUrl, fileName }
 *    { status: 'error', code, message }
 *      - code 'invalid_file': lỗi do chính file (định dạng, dung lượng, nội
 *        dung) — website báo nguyên nhân cho ứng viên, không thử cách khác.
 *      - code 'rate_limited' / 'bad_request' / 'server_error': lỗi tạm thời
 *        hoặc lỗi hệ thống — website dùng cách gửi dự phòng.
 *  GET <URL /exec>  ->  { status: 'ok', service: 'cv-upload' }
 * =====================================================================
 */

/** Tên thư mục mặc định (ở "Drive của tôi") khi chưa đặt CV_FOLDER_ID. */
var ROOT_FOLDER_NAME = 'CV Ung Vien - Tuyen dung';

/** Dung lượng tối đa của một file CV: 5 MB. */
var MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Múi giờ dùng để đặt tên file và tính "ngày" cho giới hạn tải lên. */
var TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Giới hạn số lượt tải CV (tính chung cho mọi ứng viên). Muốn đổi mà không sửa
 * mã: thêm thuộc tính tập lệnh MAX_UPLOADS_PER_MINUTE / MAX_UPLOADS_PER_DAY.
 * Khi vượt giới hạn, website tự chuyển sang cách gửi dự phòng (đính kèm email).
 */
var MAX_UPLOADS_PER_MINUTE = 20;
var MAX_UPLOADS_PER_DAY = 300;

/** Định dạng được chấp nhận: phần mở rộng -> MIME type tương ứng. */
var ALLOWED_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

/**
 * Nhận file CV từ website.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    // Giới hạn lượt tải trước mọi xử lý tốn tài nguyên (đọc JSON, giải mã, ghi Drive).
    if (!acquireUploadSlot_()) {
      return errorResponse_('rate_limited', 'Hệ thống lưu CV đang bận, vui lòng thử lại sau ít phút.');
    }

    if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents === '') {
      return errorResponse_('bad_request', 'Không nhận được dữ liệu file CV.');
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return errorResponse_('bad_request', 'Dữ liệu gửi lên không đúng định dạng JSON.');
    }
    if (!payload || typeof payload !== 'object') {
      return errorResponse_('bad_request', 'Dữ liệu gửi lên không hợp lệ.');
    }

    // --- Tên file và định dạng ---
    var originalName = String(payload.fileName || '').trim();
    if (!originalName) {
      return errorResponse_('bad_request', 'Thiếu tên file CV.');
    }
    var ext = getExtension_(originalName);
    if (!ALLOWED_TYPES.hasOwnProperty(ext)) {
      return errorResponse_('invalid_file', 'Chỉ chấp nhận file CV định dạng PDF hoặc DOCX.');
    }
    var expectedMime = ALLOWED_TYPES[ext];
    var mimeType = String(payload.mimeType || '').trim().toLowerCase();
    // Một số máy (thường là Windows không cài Office) không nhận diện được loại
    // file .docx và gửi mimeType rỗng hoặc "application/octet-stream": khi đó
    // dùng MIME theo phần mở rộng, và vẫn kiểm tra nội dung file ở bước dưới.
    if (mimeType === '' || mimeType === 'application/octet-stream') {
      mimeType = expectedMime;
    }
    if (mimeType !== expectedMime) {
      return errorResponse_('invalid_file', 'Định dạng file không khớp với phần mở rộng. Chỉ chấp nhận PDF hoặc DOCX.');
    }

    // --- Giải mã nội dung base64 ---
    var base64 = stripDataUrlPrefix_(payload.fileData);
    if (!base64) {
      return errorResponse_('bad_request', 'File CV trống hoặc không đọc được.');
    }
    // Ước lượng dung lượng trước khi giải mã để từ chối sớm file quá lớn.
    if (Math.floor(base64.length * 3 / 4) - 2 > MAX_FILE_BYTES) {
      return errorResponse_('invalid_file', 'File CV vượt quá dung lượng cho phép (tối đa 5 MB).');
    }
    var bytes;
    try {
      bytes = Utilities.base64Decode(base64);
    } catch (decodeErr) {
      return errorResponse_('bad_request', 'Nội dung file CV không hợp lệ.');
    }
    if (!bytes || bytes.length === 0) {
      return errorResponse_('bad_request', 'File CV trống.');
    }
    if (bytes.length > MAX_FILE_BYTES) {
      return errorResponse_('invalid_file', 'File CV vượt quá dung lượng cho phép (tối đa 5 MB).');
    }
    if (!hasValidSignature_(bytes, ext)) {
      return errorResponse_('invalid_file', 'Nội dung file không phải PDF/DOCX hợp lệ. Vui lòng kiểm tra lại file CV.');
    }

    // --- Đặt tên file: "yyyy-MM-dd_HHmm - <vị trí> - <họ tên> - <tên gốc>" ---
    var position = sanitizePart_(payload.position, 60) || 'Khong ro vi tri';
    var candidateName = sanitizePart_(payload.candidateName, 60) || 'Ung vien';
    var baseName = sanitizePart_(originalName.slice(0, originalName.length - ext.length - 1), 80) || 'CV';
    var stamp = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd_HHmm');
    var finalName = stamp + ' - ' + position + ' - ' + candidateName + ' - ' + baseName + '.' + ext;

    // --- Lưu vào Drive (giữ nguyên chế độ riêng tư, KHÔNG đổi quyền chia sẻ) ---
    var folder = getTargetFolder_();
    var blob = Utilities.newBlob(bytes, expectedMime, finalName);
    var file = folder.createFile(blob);

    return jsonResponse_({
      status: 'success',
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: file.getName()
    });
  } catch (err) {
    // Không ghi nội dung file hay thông tin cá nhân vào nhật ký.
    console.error('Lỗi lưu CV: ' + (err && err.message ? err.message : err));
    return errorResponse_('server_error', 'Không lưu được file CV lên Google Drive. Vui lòng thử lại sau.');
  }
}

/**
 * Kiểm tra nhanh dịch vụ còn hoạt động (mở URL /exec trên trình duyệt).
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doGet() {
  return jsonResponse_({ status: 'ok', service: 'cv-upload' });
}

/**
 * Chạy tay MỘT LẦN trong trình chỉnh sửa Apps Script để cấp quyền truy cập
 * Google Drive và kiểm tra thư mục lưu CV (xem bước 6 ở đầu tệp).
 */
function thietLapBanDau() {
  var folder = getTargetFolder_();
  console.log('Thư mục lưu CV: ' + folder.getName() + ' — ' + folder.getUrl());
}

// =====================================================================
//  Hàm nội bộ (tên kết thúc bằng "_" nên không chạy được từ bên ngoài)
// =====================================================================

/** Trả về JSON cho trình duyệt. */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Trả về lỗi kèm mã (xem mục "GIAO TIẾP" ở đầu tệp). */
function errorResponse_(code, message) {
  return jsonResponse_({ status: 'error', code: code, message: message });
}

/** Đọc giới hạn từ thuộc tính tập lệnh (nếu có), ngược lại dùng giá trị mặc định. */
function getLimit_(props, name, fallback) {
  var value = Number(props.getProperty(name));
  return value > 0 ? value : fallback;
}

/**
 * Giữ một "lượt" tải lên: tối đa MAX_UPLOADS_PER_MINUTE lượt/phút và
 * MAX_UPLOADS_PER_DAY lượt/ngày cho TOÀN BỘ ứng viên (Apps Script không biết
 * địa chỉ IP người gửi). Trả về false khi đã vượt giới hạn hoặc đang quá tải.
 */
function acquireUploadSlot_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    var now = new Date();
    var cache = CacheService.getScriptCache();
    var props = PropertiesService.getScriptProperties();
    var perMinute = getLimit_(props, 'MAX_UPLOADS_PER_MINUTE', MAX_UPLOADS_PER_MINUTE);
    var perDay = getLimit_(props, 'MAX_UPLOADS_PER_DAY', MAX_UPLOADS_PER_DAY);

    var minuteKey = 'upload_minute_' + Utilities.formatDate(now, 'UTC', 'yyyyMMddHHmm');
    var minuteCount = Number(cache.get(minuteKey) || 0);

    // Một thuộc tính duy nhất dạng "yyyyMMdd:số lượt" (tự đặt lại khi sang ngày mới).
    var today = Utilities.formatDate(now, TIME_ZONE, 'yyyyMMdd');
    var stored = String(props.getProperty('UPLOAD_DAY_COUNT') || '').split(':');
    var dayCount = stored[0] === today ? Number(stored[1] || 0) : 0;

    if (minuteCount >= perMinute || dayCount >= perDay) {
      console.warn('Vượt giới hạn tải CV: ' + minuteCount + '/phút, ' + dayCount + '/ngày');
      return false;
    }
    cache.put(minuteKey, String(minuteCount + 1), 120);
    props.setProperty('UPLOAD_DAY_COUNT', today + ':' + (dayCount + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Lấy phần mở rộng (chữ thường, không có dấu chấm) của tên file. */
function getExtension_(name) {
  var dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** Bỏ tiền tố "data:<mime>;base64," (nếu có) và khoảng trắng của chuỗi base64. */
function stripDataUrlPrefix_(data) {
  if (typeof data !== 'string') return '';
  var s = data.trim();
  if (s.slice(0, 5).toLowerCase() === 'data:') {
    var comma = s.indexOf(',');
    if (comma < 0) return '';
    s = s.slice(comma + 1);
  }
  return s.replace(/\s+/g, '');
}

/**
 * Kiểm tra "chữ ký" file (khớp với kiểm tra của máy chủ website):
 *  - PDF: có "%PDF-" trong 1024 byte đầu (một số phần mềm ghi thêm vài byte
 *    trước tiêu đề PDF)
 *  - DOCX là file ZIP, bắt đầu bằng "PK\x03\x04"
 * (byte trong Apps Script là số có dấu -128..127 nên cần & 0xFF)
 */
function hasValidSignature_(bytes, ext) {
  var sig = ext === 'pdf'
    ? [0x25, 0x50, 0x44, 0x46, 0x2D]
    : [0x50, 0x4B, 0x03, 0x04];
  if (bytes.length < sig.length) return false;
  var lastStart = ext === 'pdf' ? Math.min(1024, bytes.length) - sig.length : 0;
  for (var start = 0; start <= lastStart; start++) {
    var match = true;
    for (var i = 0; i < sig.length; i++) {
      if ((bytes[start + i] & 0xFF) !== sig[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Làm sạch một phần tên file: bỏ các ký tự không dùng được trong tên file trên
 * Windows/macOS (\ / : * ? " < > |) và ký tự điều khiển, gộp khoảng trắng,
 * cắt ngắn tối đa maxLen ký tự (tổng tên file khoảng 230 ký tự trở xuống).
 */
function sanitizePart_(value, maxLen) {
  var s = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Không để tên bắt đầu/kết thúc bằng dấu chấm hoặc gạch ngang thừa.
  s = s.replace(/^[.\-\s]+/, '').replace(/[.\s]+$/, '');
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).trim();
  }
  return s;
}

/**
 * Lấy thư mục lưu CV:
 *  1) Thư mục có ID trong thuộc tính tập lệnh CV_FOLDER_ID (nếu đã đặt);
 *  2) Ngược lại: tìm thư mục ROOT_FOLDER_NAME ở gốc "Drive của tôi", chưa có
 *     thì tạo mới. Dùng khóa (LockService) để hai ứng viên nộp cùng lúc không
 *     tạo ra hai thư mục trùng tên.
 */
function getTargetFolder_() {
  var props = PropertiesService.getScriptProperties();
  var configuredId = String(props.getProperty('CV_FOLDER_ID') || '').trim();
  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (err) {
      throw new Error('Không mở được thư mục CV_FOLDER_ID = ' + configuredId +
        '. Kiểm tra lại ID và quyền chỉnh sửa của tài khoản triển khai. (' +
        (err && err.message ? err.message : err) + ')');
    }
  }

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(15000);
  try {
    var root = DriveApp.getRootFolder();
    var existing = root.getFoldersByName(ROOT_FOLDER_NAME);
    if (existing.hasNext()) {
      return existing.next();
    }
    return root.createFolder(ROOT_FOLDER_NAME);
  } finally {
    if (locked) lock.releaseLock();
  }
}
