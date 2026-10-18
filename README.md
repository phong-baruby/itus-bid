# Đấu giá số áo · fit@hcmus

Web đấu giá số áo bị trùng để gây quỹ đội. Mỗi số trùng = 1 tab riêng, tất cả chung 1 deadline.

- **Đăng nhập Google** — không cần cấp PIN; email lưu lại để biết chính xác ai thắng số nào.
- **Cài đặt chung** — admin chỉnh giá khởi điểm, bước giá, deadline cho toàn bộ cuộc đấu giá.
- **Mỗi người chỉ dẫn đầu 1 số** — đang giữ giá cao nhất số 7 thì không trả giá số khác được, đến khi bị vượt.
- **Chống "bắn tỉa"** — có người trả giá trong 2 phút cuối thì deadline chung lùi thêm 2 phút.
- **Realtime** — giá mới hiện ngay cho mọi người.
- **VietQR** — hết giờ, người thắng quét mã chuyển khoản đúng số tiền + nội dung.
- **/admin** — mở nhiều số cùng lúc (`7, 10, 23`), huỷ giá troll, chặn người lạ, tick đã thu, tải kết quả CSV.

Stack: Next.js 16 + Supabase (Postgres + Auth + Realtime) + Tailwind 4. Free hoàn toàn.

## Cài đặt (~20 phút)

### 1. Supabase
1. Tạo project free tại supabase.com (region Singapore).
2. **SQL Editor** → dán toàn bộ `supabase/schema.sql` → Run.
3. **Project Settings → API**: lấy `Project URL`, `anon key`, `service_role key`.

### 2. Google OAuth
1. Vào console.cloud.google.com → tạo project → **APIs & Services → OAuth consent screen**: chọn External, điền tên app + email, **Publish app** (để ai cũng đăng nhập được, không chỉ test users).
2. **Credentials → Create credentials → OAuth client ID** → loại *Web application*.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (copy đúng URL ở bước 3 bên dưới).
3. Supabase → **Authentication → Sign In / Providers → Google** → bật, dán Client ID + Client Secret. URL callback hiển thị ngay ở đây.
4. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://ten-doi.vercel.app`
   - Redirect URLs: thêm `https://ten-doi.vercel.app/**` và `http://localhost:3000/**`

### 3. Chạy local
```bash
cp .env.example .env.local   # điền giá trị, ADMIN_EMAILS là email Google của fen
npm install
npm run dev
```

### 4. Deploy Vercel
1. Push lên GitHub → vercel.com → Add New Project → import repo.
2. Dán các biến trong `.env.example` vào Environment Variables → Deploy.
3. Đổi tên project để có `ten-doi.vercel.app` (nhớ cập nhật lại Site URL ở Supabase).

## Dùng
1. Vào `/admin` bằng email nằm trong `ADMIN_EMAILS`.
2. **Cài đặt chung**: giá khởi điểm, bước giá, deadline → Lưu.
3. **Mở đấu giá**: gõ các số bị trùng `7, 10, 23` → Mở.
4. Gửi link vào nhóm. Link tới thẳng 1 số: `/?so=7`.
5. Hết deadline → người thắng thấy mã QR → admin tick **Đã thu** → **Tải kết quả CSV** để chốt số áo.

## Ghi chú
- Mọi lượt trả giá đi qua hàm `place_bid` trong Postgres, xếp hàng tuần tự nên 2 người bấm cùng lúc cũng không lỗi luật.
- Người chơi chỉ thấy tên + avatar của nhau; email chỉ admin xem được.
- Đổi logo: thay `public/logo.png` (bản màu) và `public/logo-white.png` (bản trắng cho dark mode); favicon ở `app/icon.png`.
- Supabase free tạm dừng nếu 7 ngày không có truy cập — vào dashboard bấm Restore là chạy lại.
