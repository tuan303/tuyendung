# Kế hoạch khắc phục lỗi hiển thị số lượng và lưu trữ hồ sơ ứng tuyển

## 1. Nguyên nhân cốt lõi (Root Cause)
- **Lỗi phân quyền Firestore phía Client**: Khi ứng viên nộp hồ sơ từ website (`MainPage.tsx`), ứng dụng gọi hàm `addDoc` trực tiếp từ trình duyệt của người dùng (chưa đăng nhập) vào Firestore. Do quy tắc bảo mật (security rules) trên Firestore của dự án Firebase đang chặn quyền ghi của người dùng vãng lai (`PERMISSION_DENIED: Missing or insufficient permissions`), nên hồ sơ **không thể lưu vào database**, chỉ có email thông báo qua SMTP được gửi đi.
- **Dẫn đến số lượng bằng 0**: Trang Quản trị (`Admin.tsx`) đọc dữ liệu từ bảng `applications` trên Firestore nhưng bảng này đang trống vì mọi lượt ghi từ web trước đó đều bị Firebase từ chối.

---

## 2. Giải pháp kỹ thuật toàn diện

### A. Chuyển việc lưu trữ hồ sơ về Backend Server API (Độ tin cậy 100%)
- Khi ứng viên điền form và bấm nộp hồ sơ, request gửi đến endpoint `/api/send-email` (hoặc `/api/applications/submit`) trên máy chủ Express:
  1. Máy chủ tiếp nhận toàn bộ thông tin ứng viên: Họ tên, ngày sinh, số điện thoại, email, vị trí ứng tuyển (`jobTitle`), ID vị trí tuyển dụng (`jobId`), link file CV (`downloadURL`), tên file CV (`fileName`), thời gian nộp.
  2. Máy chủ **tự động lưu hồ sơ vào cơ sở dữ liệu bền vững** trên server (`data/applications.json`), không bị phụ thuộc hay chặn bởi quyền hạn Firestore ở trình duyệt.
  3. Máy chủ đồng thời gửi email thông báo qua SMTP đến email ban tuyển dụng như hiện tại.
  4. Trả về kết quả thành công cho ứng viên.

### B. Xây dựng API Quản lý Hồ sơ cho Trang Quản trị
Cung cấp các API chuẩn RESTful cho trang Admin:
- `GET /api/applications`: Lấy danh sách tất cả hồ sơ ứng tuyển (có phân loại theo `jobId`, `jobTitle`).
- `PATCH /api/applications/:id`: Cập nhật trạng thái ứng viên (Mới nộp, Đã xem, Đã liên hệ, Mời PV, Từ chối) hoặc ghi chú của HR.
- `DELETE /api/applications/:id`: Xóa hồ sơ (khi cần dọn dẹp bài test / spam).
- `POST /api/applications/test`: Cho phép Admin tạo hồ sơ mẫu thử nghiệm ngay trên giao diện để kiểm tra hoạt động.

### C. Nâng cấp giao diện Quản trị (`Admin.tsx` & `JobCard`)
- Tích hợp gọi API `/api/applications` để lấy số lượng hồ sơ chuẩn xác theo từng vị trí tuyển dụng.
- Khi người dùng bấm vào số lượng (VD: `[ 👥 3 hồ sơ ứng tuyển ]`), mở modal danh sách chi tiết các ứng viên đã nộp cho vị trí đó:
  - Xem họ tên, số điện thoại, email, ngày sinh, thời gian nộp.
  - Bấm nút mở / tải CV ứng viên.
  - Cập nhật trạng thái xử lý và ghi chú nội bộ.
  - Xuất danh sách ứng viên ra file Excel (CSV tiếng Việt).

### D. Kiểm tra & Thử nghiệm thực tế (Verification)
1. Thử gửi hồ sơ ứng tuyển mới từ Form tuyển dụng trên website cho vị trí "CHUYÊN VIÊN C&B" (hoặc vị trí bất kỳ).
2. Kiểm tra xem hồ sơ đã được lưu trữ thành công trên server hay chưa.
3. Mở trang Quản trị kiểm tra:
   - Thẻ vị trí cập nhật số lượng tăng lên tương ứng (không còn bị 0).
   - Bấm vào số lượng hiển thị đúng thông tin ứng viên vừa nộp và file đính kèm.
