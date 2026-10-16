# Tuyển dụng - Ngôi Sao Hoàng Mai

React/TypeScript + Vite, Firebase Auth/Firestore, Firebase Storage riêng tư và Express. Cả máy chủ Node và Vercel dùng chung `src/server/api.ts`.

## Chạy và kiểm tra

Yêu cầu Node.js 24 và npm. Sao chép `.env.example` thành `.env.local`, nhập cấu hình server riêng (không đưa khóa vào chat, Git hoặc biến `VITE_*`).

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
npm start
```

`dev` bật Vite và chỉ nghe loopback theo mặc định. `start` chạy bản server đã bundle, mặc định production; đặt `HOST=0.0.0.0` khi container/proxy của bạn cần. Không bật development server công khai. Chỉ đặt `TRUST_PROXY_HOPS` khi proxy do bạn quản lý ghi đè header forwarded; Vercel dùng đúng một hop của platform.

## Cấu hình bắt buộc trước triển khai

- `APP_URL`: origin HTTPS chính xác của website. Origin khác bị từ chối; preview riêng cần cấu hình origin tương ứng, không dùng wildcard.
- Firebase Admin: chọn `FIREBASE_SERVICE_ACCOUNT` JSON, hoặc bộ `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, hoặc Application Default Credentials trên Google runtime. Chỉ service account của đúng project, có quyền tối thiểu cần thiết cho Auth/Firestore/Storage. Không dùng API key web thay service account.
- `FIREBASE_STORAGE_BUCKET`: bucket CV riêng của project. Bật Firestore/Storage trước khi chạy; không bật public ACL hoặc Firebase download token cho các object mới.
- `RATE_LIMIT_SALT`: chuỗi ngẫu nhiên riêng tối thiểu 32 ký tự. Production thiếu khóa sẽ từ chối tiếp nhận thay vì bỏ bảo vệ lưu lượng. Trong Firestore, bật TTL cho `rateLimits.expiresAt` để dọn bộ đếm cũ.
- `SMTP_ENCRYPTION_KEY`: khóa độc lập 32 byte, base64 hoặc hex, nếu dùng cấu hình SMTP lưu trong quản trị. Không dùng lại Gemini key. Tạo khóa cục bộ: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- `SMTP_ALLOWED_HOSTS`: danh sách hostname SMTP cho phép, phân tách dấu phẩy. Chỉ cổng 465/587, bắt buộc TLS, kiểm tra chứng chỉ; không kết nối IP/mạng riêng.

SMTP có thể được quản lý bằng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_RECIPIENT` trên server; khi đó UI chỉ đọc metadata. Nếu không dùng biến môi trường, quản trị lưu cấu hình vào `settings_private/smtp`, mã hóa AES-GCM. GET không trả mật khẩu; bỏ trống ô mật khẩu giữ giá trị cũ. PUT mật khẩu mới vẫn hoạt động sau khi thay khóa. Các endpoint encrypt/decrypt cũ đã bỏ, test SMTP chỉ dùng POST với cấu hình đã lưu.

Máy chủ chưa có credential sẽ không tự rơi về dữ liệu JSON, khóa mã hóa mặc định hoặc quyền admin giả. Firebase và SMTP thật chưa được cấu hình trong phiên sửa mã nguồn này.

## Quyền quản trị

Người dùng phải có Firebase ID token hợp lệ, chưa bị thu hồi và thỏa một trong hai điều kiện: claim `admin: true` do server tin cậy cấp, hoặc email đã xác minh nằm trong allowlist hiện có. Giao diện không tạo tài khoản, không chứa mật khẩu và không tải hồ sơ trước khi xác nhận quyền.

Nếu tài khoản hiện tại chưa có claim/quyền phù hợp, dùng Firebase Console xác minh UID của chính quản trị viên, sau đó chạy bằng credential Admin riêng:

```sh
npm run admin:access -- --uid FIREBASE_UID --grant-admin
npm run admin:access -- --uid FIREBASE_UID --revoke-sessions
```

Lệnh chỉ hoạt động khi được chạy rõ ràng, không tự cấp quyền khi website khởi động. Sau khi cấp claim, đăng xuất/đăng nhập lại. Mật khẩu quick-login từng bị viết cứng cần được **đổi trong Firebase**, mật khẩu SMTP cũ cần được **thu hồi/đổi tại nhà cung cấp email**. Xóa source không vô hiệu hóa mật khẩu hoặc các bản clone/lịch sử Git đã có. Cần rà soát session, log cũ chứa query SMTP và các bản dữ liệu Git cũ theo quy trình của chủ dự án.

## Hồ sơ, CV và thống kê

- Mặc định metadata lưu trong Firestore, CV trong `private-applications/`. Không phục vụ thư mục uploads tĩnh. Tải CV qua API có Bearer token, dạng attachment, `nosniff` và cache riêng; server không fetch URL CV ngoài tùy ý.
- PDF/DOCX tối đa **3 MiB**. Giới hạn thống nhất này giữ JSON base64 dưới mức 4.5 MB của Vercel Functions. Kiểm tra loại tệp, chữ ký, cấu trúc ZIP, macro, đường dẫn và giới hạn giải nén trên server. Đây không phải phần mềm quét malware; có thể thêm dịch vụ AV/CDR theo nhu cầu vận hành.
- Chỉ trả `applicationId` thành công sau khi lưu metadata. Gửi mail được chờ với timeout; lỗi mail không xóa hồ sơ đã lưu, `emailDispatched` phản ánh việc SMTP đã nhận yêu cầu gửi, không phải bảo đảm thư vào inbox.
- File mode chỉ để phát triển/test: `APPLICATION_STORE=file` và `APPLICATION_DATA_DIR` riêng, `NODE_ENV` không phải production, không có `VERCEL`. Dùng khóa liên tiến trình và atomic rename; file hỏng phát lỗi thay vì bị thay bằng danh sách rỗng.
- Trang quản trị có bảng **Số hồ sơ theo vị trí tuyển dụng**, số lượng từng trạng thái và thao tác nhấn để lọc. Đếm **hồ sơ**, không phải số người duy nhất. Mã vị trí là ưu tiên; hồ sơ cũ thiếu ID chỉ ghép bằng tên duy nhất. Vị trí trùng tên, đã xóa hoặc không khớp nằm trong nhóm chưa xác định, không bị đếm nhiều lần. Vị trí ẩn và chưa có hồ sơ vẫn hiện.

## Di chuyển hồ sơ cũ an toàn

Các file JSON/CV và `smtp-config.json` đã được bỏ khỏi tracked files và thêm vào ignore; bản cục bộ được giữ. Bản sao của phiên sửa đặt bên ngoài repo ở `../security-remediation-backup`, quyền thư mục 0700. Nội dung hồ sơ thật không được dùng trong kiểm thử.

Chọn đúng bản sao dữ liệu mới nhất; kiểm tra **dry-run** trước (không gọi Firebase, không ghi/xóa hồ sơ):

```sh
npm run migrate:applications -- --source-dir /absolute/private/backup/data
```

Sau khi xác minh project, credential, backup và rules, nhập rõ ràng bằng:

```sh
npm run migrate:applications -- --source-dir /absolute/private/backup/data --apply --confirm-project YOUR_FIREBASE_PROJECT_ID
```

Giữ ID/ngày cũ, tạo ID ổn định nếu nguồn không có ID hợp lệ, không ghi đè document đã có và có thể chạy tiếp sau lỗi. CV local hợp lệ được chuyển vào kho riêng; file nguồn được giữ nguyên. Dữ liệu sai hoặc CV không hợp lệ làm preflight thất bại, không âm thầm bỏ hồ sơ. Liên kết CV HTTPS ngoài được giữ để không mất liên kết; phải đánh giá/chuyển riêng và thu hồi URL/token công khai cũ sau khi xác minh bản sao. Không rewrite Git history tự động; bỏ tracked files chỉ bảo vệ các commit mới.

## Rules, phát hành và nghiệm thu

`firebase.json` khai báo Firestore/Storage rules. Triển khai rules mới vào đúng project trước khi dùng quyền phía client; không triển khai riêng UI mà bỏ phần server/credential/migration. Rules từ chối client truy cập applications/settings/private storage; server dùng Admin SDK, vì vậy kiểm tra quyền API là bắt buộc.

Kiểm thử rules cần Firebase CLI (đã kiểm tra với 15.2.0) và Java 21+. Nếu máy chưa có CLI, cài từ npm bằng `npm install --global firebase-tools@15.2.0`, sau đó chạy Firebase Emulator:

```sh
npm run test:rules
```

Kiểm thử thường dùng dữ liệu giả, không gọi dịch vụ thật; emulator kiểm tra admin/verified email, schema đầy đủ và các giới hạn, private documents và private Storage. Trước phát hành, xác nhận thêm trên staging bằng tài khoản quản trị thật: đăng nhập, nộp CV, xem thống kê, cập nhật trạng thái/ghi chú, tải CV, gửi thử mail. Cấu hình SMTP đúng không thay thế việc kiểm tra hộp thư và theo dõi thông báo gửi thất bại.

Nguồn giới hạn/triển khai: [Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [Vercel Functions limits](https://vercel.com/docs/functions/limitations).

## Kiểm thử riêng trước go-live trên Vercel

Giữ PR ở nhánh `fix/security-applicant-statistics` trong thời gian thử. Chưa merge `main`, promote deployment, đổi domain hoặc triển khai rules/migration vào Firebase đang vận hành. Một Preview URL **không tự tách Firebase hoặc SMTP**: dữ liệu phụ thuộc cấu hình của cả trình duyệt và server.

1. Tạo Firebase project/web app/bucket **riêng cho staging**. Chỉ dùng vị trí, hồ sơ và CV giả. Không sao chép dữ liệu ứng viên hoặc tài khoản/mật khẩu quản trị thật.
2. Trong đúng project Vercel, đặt các biến ở phạm vi **Preview**, có thể giới hạn cho nhánh sửa này. Bộ `VITE_FIREBASE_*` gồm API key web, auth domain, project ID, storage bucket, messaging sender ID và app ID phải được lấy cùng một web app staging. `VITE_*` là cấu hình công khai; private key và mật khẩu luôn là biến server không có tiền tố này.
3. Server Preview cần `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, credential Firebase Admin **cùng project staging**, `APP_URL` đúng origin Preview, `RATE_LIMIT_SALT` và `SMTP_ENCRYPTION_KEY` riêng. Không dùng bản sao credential/khóa production. Khai báo đầy đủ trước khi redeploy.
4. Dùng tài khoản SMTP thử và hộp thư nhận thử. Đặt `SMTP_TEST_RECIPIENT` trên server; email nhận trong cấu hình SMTP phải là chính địa chỉ đó. Preview/staging sẽ từ chối kết nối SMTP nếu thiếu địa chỉ test hoặc địa chỉ nhận không khớp.
5. Triển khai `firestore.rules` và `storage.rules` vào **project staging**. Bật Firebase Auth email/password, thêm hostname Preview vào authorized domains và tạo tài khoản thử. Dùng script `admin:access` với UID của tài khoản staging để cấp claim quản trị, rồi đăng nhập lại. Không thao tác tài khoản production.
6. Vercel Preview tự bật kiểm tra tách môi trường. Nếu chạy staging ngoài Vercel, đặt **cả** `VITE_APP_ENV=staging` lúc build và `APP_ENV=staging` trên server. Thiếu cấu hình riêng hoặc dùng các định danh Firebase production đã biết sẽ làm build/API từ chối chạy; không bỏ kiểm tra để thử tiếp.

| Kiểm tra trên staging | Điều kiện đạt |
| --- | --- |
| Xem vị trí và nộp CV mẫu | Chỉ vị trí đang tuyển được chọn; PDF/DOCX hợp lệ được lưu; reload vẫn có hồ sơ |
| Xác thực và CV riêng | Khách/tài khoản thường không đọc, sửa hoặc tải CV; quản trị thử có quyền hợp lệ |
| Thống kê | Nộp một hồ sơ làm tổng và đúng vị trí tăng một; đổi trạng thái cập nhật đúng cột; vị trí ẩn, 0 hồ sơ và nhóm không khớp đúng số |
| Quản lý | Ghi chú/trạng thái còn sau reload; lọc, tải CV và xuất danh sách hoạt động |
| Email | Lưu cấu hình không lộ mật khẩu; mail thử và thông báo chỉ đến hộp test, link quản trị trỏ staging |
| Lỗi mạng/lưu/email | Chưa lưu thì không báo thành công; form giữ dữ liệu khi lỗi; mail lỗi không làm mất hồ sơ đã lưu |
| Nội dung/vị trí | Chỉnh nội dung hoặc vị trí trong staging không thay đổi website hay Firestore production |

Bản thử cục bộ dùng fixture Firebase/Auth/SMTP chỉ kiểm tra giao diện và nghiệp vụ với dữ liệu giả; không thay thế nghiệm thu đăng nhập, Firestore/Storage, SMTP và giới hạn runtime thật trên Vercel. Chỉ lên kế hoạch go-live sau khi các kiểm tra staging đạt, có bản sao lưu/đường quay lại và chủ dự án yêu cầu phát hành.
