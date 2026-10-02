# Trang lời chúc sinh nhật bí mật

Trang web Node.js có:
- Màn hình nhập mật khẩu.
- Lời chúc chỉ hiển thị sau khi mật khẩu đúng.
- Cookie phiên `HttpOnly`, hết hạn sau 2 giờ.
- Mã QR thật tại `/qr`, tự trỏ tới URL website đang được triển khai.

## Mật khẩu
Mặc định là `郝汇斌`. Khi triển khai công khai, hãy đặt biến môi trường `SITE_PASSWORD` thành mật khẩu mong muốn. Đừng đưa mật khẩu vào đường link hoặc mã QR.

## Đăng lên Render (dễ làm trên điện thoại)
1. Giải nén ZIP này trên máy tính/điện thoại.
2. Tải toàn bộ các tệp lên một repository GitHub mới.
3. Vào https://render.com, đăng nhập và chọn **New → Web Service**, kết nối repository.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Trong phần **Environment Variables**, thêm:
   - `SITE_PASSWORD` = `郝汇斌` (hoặc mật khẩu khác bạn muốn)
   - `NODE_ENV` = `production`
7. Deploy. Chờ Render cấp URL dạng `https://ten-trang.onrender.com`.
8. Mở `https://ten-trang.onrender.com/qr` để xem mã QR thật. Lưu ảnh hoặc chụp màn hình mã QR, rồi gửi/in cho người yêu.
9. Thử quét QR bằng một điện thoại khác; nhập `郝汇斌` để kiểm tra.

## Lưu ý bảo mật
- Mật khẩu được kiểm tra ở máy chủ, không phải chỉ ẩn nội dung bằng JavaScript phía trình duyệt.
- Dùng HTTPS của Render; đặt `NODE_ENV=production` để cookie phiên có cờ Secure.
- Đây là trang quà tặng cá nhân, không có giới hạn số lần nhập mật khẩu hoặc chống bot nâng cao. Không dùng để bảo vệ dữ liệu nhạy cảm.
- Nếu đổi `SITE_PASSWORD`, redeploy/restart dịch vụ để áp dụng.
