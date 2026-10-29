# Thử VN Spell Correction Base kết hợp database

Model: `nrl-ai/vn-spell-correction-base`, commit `ba1e57fc3bacdfb22bfa20b19db7182a6d1b0b6b`.
Chạy local bằng CPU INT8 trên máy hiện tại, không dùng GPU hoặc API bên ngoài.

Tập thử gồm 20 ca: 12 đầu vào có lỗi và 8 đầu vào đúng cần giữ nguyên. Các ca được chọn để kiểm tra tích hợp và có chứa ví dụ người dùng đã đưa; đây không phải tập kiểm thử độc lập để suy ra độ chính xác tổng quát.

| Cách xử lý | Đúng hoàn toàn |
|---|---:|
| Database | 14/20 |
| Model riêng | 10/20 |
| Kết hợp tự động | 17/20 |

Luồng kết hợp dùng kết quả database trước. Model chỉ được áp dụng khi đầu vào còn từ chưa nhận diện, kết quả giảm số từ chưa nhận diện và không vi phạm kiểm tra bảo vệ mã, số, dấu câu, số từ, xuống dòng. Model không được ghi đè một cụm database đã nhận diện đầy đủ.

| Ví dụ | Kết quả kết hợp |
|---|---|
| `vong bii 6201-2RS` | `vòng bi 6201-2RS` |
| `tôi muón mua M10` | `tôi muốn mua M10` |
| `tôi đnag cần mua vòng bi` | `tôi đang cần mua vòng bi` |
| `dunhg cui rut rivet` | `dụng cụ rút rivet` (database đã sửa được) |
| `bulonh M8x30` | `bulong M8x30` (model riêng sửa nhầm mã; luồng kết hợp giữ kết quả database) |
| `dao doa lỗ` | Giữ nguyên (model riêng sửa nhầm thành `dao dao lỗ`) |
| `bugf lloong` | Chưa tự sửa đúng; vẫn hiện gợi ý `bu lông` để chọn |

Cả 8 ca đúng được luồng kết hợp giữ nguyên. Ba ca chưa tự sửa đúng là `bugf lloong`, `bugf loong M10` và `toi muoomss mua dụng cu doa khoang cach`.

Lượt đầu gồm nạp model mất khoảng 19,6 giây; các lượt sau trong tập thử mất khoảng 0,11–0,36 giây mỗi yêu cầu. Thời gian này đo ở worker, chưa tính tải database và thao tác trên trình duyệt.

Tái lập: `node scripts/benchmark-spelling.js`. Chi tiết từng ca nằm tại `output/spelling/vn-base-trial.json` sau khi chạy.
