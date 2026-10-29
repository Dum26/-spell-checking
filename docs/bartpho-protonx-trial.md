# Thử BARTpho + ProtonX + database

Lựa chọn mới: **BARTpho + ProtonX + database**. VN Spell Correction Base vẫn là lựa chọn mặc định để người dùng đối chiếu.

Hai checkpoint cố định:

- `bmd1905/vietnamese-correction-v2@a3d342348d39d87622aa58aabd07de38ade8c17b`
- `protonx-models/protonx-legal-tc@2007b3f3e577dcbebf0e5c435bfe041584920cd1` (v1.3.1)

Cả hai chạy local bằng CPU INT8. ProtonX dùng tokenizer fast và beam search 4 nhánh. Hai model nhận cùng đầu vào gốc, không sửa nối tiếp. Database và bộ bảo vệ mã hàng, số, dấu câu, số từ, xuống dòng lọc từng ứng viên. Ứng viên giảm số từ chưa nhận diện nhiều nhất được chọn; nếu hai bản khác nội dung đồng hạng thì giữ kết quả database. Khi chỉ khác hoa/thường đầu câu, ưu tiên kiểu viết của đầu vào.

## Kết quả thử

Cùng tập 20 ca của thử nghiệm VN Base: 12 đầu vào có lỗi và 8 đầu vào đúng. Đây là kiểm tra tích hợp trên tập nhỏ có các ví dụ người dùng đã đưa, không phải benchmark độc lập.

| Cách xử lý | Khớp hoàn toàn, có phân biệt hoa/thường |
|---|---:|
| Database | 14/20 |
| BARTpho riêng | 2/20 |
| ProtonX riêng | 11/20 |
| BARTpho + ProtonX + database | 17/20 |
| VN Base + database (thử nghiệm trước) | 17/20 |

Điểm BARTpho riêng thấp một phần do viết hoa đầu câu và khác cách viết chuẩn trong đáp án. Không dùng các con số này để xếp hạng chất lượng ngôn ngữ tổng quát.

Luồng kết hợp giữ nguyên cả 8 ca đúng. ProtonX đóng góp bản sửa `vong bii 6201-2RS` → `vòng bi 6201-2RS` khi BARTpho thêm dấu câu ngoài ý muốn. Hai model đồng ý sửa `muón` → `muốn`, `đnag` → `đang`.

Ba ca chưa tự sửa đúng: `bugf lloong`, `bugf loong M10`, `toi muoomss mua dụng cu doa khoang cach`. `bugf lloong` bị ProtonX đoán thành `building`; bộ lọc loại phương án này, người dùng vẫn có thể chọn gợi ý `bu lông` từ database.

Lượt đầu gồm nạp hai model: khoảng 15,6 giây. Các lượt còn lại: khoảng 0,32–0,99 giây/yêu cầu trên CPU máy hiện tại, chưa tính thời gian tải database và thao tác trình duyệt. Không thấy cải thiện số ca đúng so với VN Base trên tập này, nên giữ thành một lựa chọn thử nghiệm riêng.

Tái lập bằng `node scripts/benchmark-spelling.js bartpho-protonx`; chi tiết ở `output/spelling/bartpho-protonx-trial.json` sau khi chạy.

## Giấy phép

ProtonX có giấy phép riêng [v1.3-NC](https://huggingface.co/protonx-models/protonx-legal-tc/blob/2007b3f3e577dcbebf0e5c435bfe041584920cd1/LICENSE.md), cho phép thử và dùng nội bộ. Việc bán model hoặc cung cấp API/phần mềm trả phí có nhúng model cần giấy phép thương mại riêng. File giấy phép được giữ trong thư mục model tải về.
