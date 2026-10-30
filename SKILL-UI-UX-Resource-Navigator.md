---
name: ui-ux-resource-navigator
description: Kỹ năng chọn nguồn UI/UX phù hợp (mẫu giao diện, component, hiệu ứng, bố cục, font, màu, icon, hình, 3D, chuyển động, dữ liệu mẫu, trạng thái rỗng/lỗi, kiểm thử) rồi biến chúng thành prompt và tiêu chí kiểm tra cho AI dựng giao diện. Dùng khi bắt đầu hoặc nâng cấp một tool/web/app, khi cần chọn thư viện giao diện, hệ màu, phối chữ, chuẩn dashboard, hoặc cần checklist QA UI trước khi giao. Use when designing, selecting, or auditing UI/UX for web apps, dashboards, landing pages and internal tools (Vietnamese UI).
version: 1.0
language: vi
---

# UI/UX Resource Navigator

> Skill này không phải bộ sưu tập link. Nó là **quy trình ra quyết định**: nhìn nhu cầu → chọn đúng nhóm nguồn → lấy đúng thứ cần → kiểm giấy phép → ép AI áp dụng theo hệ thống chung → kiểm thử trước khi giao.

---

## 0. Cách đọc trạng thái nguồn trong tài liệu này

| Nhãn | Nghĩa |
|---|---|
| `[GỐC]` | Link do người dùng cung cấp ban đầu. Đã gỡ tham số theo dõi (`fbclid`) và giải mã link chuyển hướng. Mô tả giá/giấy phép lấy từ bản gốc, **chưa kiểm lại**. |
| `[BỔ SUNG]` | Link được thêm khi dựng skill. Một số đã được tra cứu xác nhận tồn tại; số còn lại chọn theo hiểu biết chung, **chưa mở từng link**. |
| `[ĐÃ XÁC NHẬN]` | Đã thấy trong kết quả tìm kiếm ngày 2026-10-09: Laws of UX, NN/g 10 Heuristics, Apple HIG, DesignSystems.one, Design Systems Directory (designsystem.cc), Radix/shadcn là nguồn thành phần có thể truy cập. |

**Quy tắc bảo trì:** giá, hạn mức miễn phí, giấy phép và thương hiệu của các nguồn thay đổi nhanh. Trước khi đưa tài nguyên vào sản phẩm thật, mở trang giấy phép/giá của đúng tài nguyên đó. Không suy ra từ mô tả trong file này.

---

## 1. Khi nào dùng skill này

- Bắt đầu một tool/web/app mới và cần chọn nền giao diện, hệ màu, font, icon.
- Nâng cấp giao diện sẵn có (đồng bộ màu/font/icon, thêm trạng thái chờ/rỗng/lỗi).
- Cần mẫu bố cục (bảng giá, FAQ, header, dashboard) để AI dựng lại.
- Cần hiệu ứng/chuyển động nhưng không muốn viết từ đầu.
- Cần checklist kiểm tra trước khi gửi link hoặc deploy.

**Không dùng** để: tự bịa nội dung/wording cho sản phẩm (xem mục 6.5), sao chép nguyên giao diện của bên thứ ba, hoặc thay thế việc kiểm tra giấy phép.

---

## 2. Nguyên tắc cốt lõi

1. **Hệ thống trước, trang sau.** Chốt token (màu, chữ, khoảng cách, bo góc, bóng) trước khi dựng từng màn hình. Mọi nguồn lấy về phải được ép qua token này, không để mỗi khối một phong cách.
2. **Một nguồn cho một việc.** Mỗi nhóm (component, icon, font, chart) chọn **một** thư viện chính. Trộn nhiều bộ icon/thư viện chart trong một sản phẩm là lỗi, trừ khi có lý do ghi lại.
3. **Mẫu là điểm xuất phát, không phải đích.** Lấy mẫu rồi nhờ AI đổi nội dung, màu, font, khoảng cách theo hệ thống của dự án; không giữ nguyên thương hiệu của mẫu.
4. **Dữ liệu thật quyết định giao diện.** Thiết kế phải chịu được: rất ít dữ liệu, rất nhiều dữ liệu, đang tải, lỗi, chưa cấu hình, không có quyền.
5. **Trung thực với số liệu.** Không hiển thị `0` khi thực chất là *chưa biết*. Phân biệt: `có dữ liệu` / `thiếu dữ liệu` / `ước tính` / `chưa xác minh`.
6. **Trợ năng là yêu cầu, không phải tính năng thêm.** Độ tương phản, bàn phím, focus, nhãn cho icon-only button.
7. **Kiểm giấy phép trước khi đưa vào sản phẩm.** Ghi nguồn khi bắt buộc; không dùng tài nguyên thương mại cho sản phẩm thương mại nếu giấy phép không cho phép.
8. **Hiệu năng là một phần của UX.** Ảnh nén, font nạp có kiểm soát, hiệu ứng tôn trọng `prefers-reduced-motion`.
9. **Không thêm trang trí không có chức năng.** Mỗi phần tử phải trả lời được: nó giúp người dùng quyết định/hành động điều gì.

---

## 3. Quy trình 7 bước

### Bước 1 — Brief ngắn (bắt buộc điền)

```text
Loại sản phẩm:      [tool nội bộ | SaaS | landing | app khách hàng]
Người dùng chính:   [vai trò, mức quen công nghệ]
Việc chính (top 3): [...]
Dữ liệu chính:      [bảng | biểu đồ | form | nội dung]
Stack:              [VD: Next.js + React + Tailwind + shadcn/ui]
Ngôn ngữ giao diện: [vi | vi+en]
Chế độ màu:         [sáng | tối | cả hai]
Mật độ:             [thoáng | cân bằng | dày dữ liệu]
Ràng buộc:          [giấy phép, hiệu năng, thương hiệu, trợ năng]
```

### Bước 2 — Chọn hướng tham chiếu

Dùng mục 4 để chọn nhóm nguồn. Giới hạn **2–3 tham chiếu** cho mỗi màn hình; nhiều hơn làm AI trộn phong cách.

### Bước 3 — Chốt hệ thống thiết kế (token)

Tối thiểu cần: bảng màu (nền, bề mặt, chữ 3 mức, nhấn, trạng thái), thang cỡ chữ, thang khoảng cách (bội số 4px), bán kính, bóng, độ cao lớp.

### Bước 4 — Dựng component và màn hình

Ưu tiên component có sẵn đã kiểm trợ năng (mục 5.4). Chỉ tự viết khi không có.

### Bước 5 — Thêm chuyển động, minh họa, nền

Chỉ sau khi bố cục và trạng thái đã ổn. Tối đa 1–2 điểm nhấn chuyển động cho mỗi màn hình trong tool vận hành.

### Bước 6 — Trạng thái đầy đủ

Mỗi màn hình có dữ liệu phải có: **tải**, **rỗng**, **lỗi**, **không có quyền**, **một phần dữ liệu**.

### Bước 7 — Kiểm thử và giao

Chạy checklist mục 9. Ghi lại những gì đã kiểm và những gì **chưa** kiểm.

---

## 4. Bảng chọn nhanh theo nhu cầu

| Nhu cầu | Bắt đầu từ | Bước tiếp | Đừng làm |
|---|---|---|---|
| Không biết giao diện nên trông thế nào | Land-book, Lapa Ninja, Siteinspire (mục 5.3, 5.4) | Chọn 2–3 trang, mô tả *bố cục*, không mô tả thương hiệu | Dán link cho AI và bảo "làm giống" |
| Cần bảng/menu/form chuẩn | shadcn/ui + Radix (mục 5.4) | Áp token riêng | Trộn 3 bộ component |
| Cần dashboard dữ liệu | shadcn/ui blocks + Recharts/Tremor + TanStack Table (mục 5.5) | Chốt mật độ, số liệu, trạng thái | Chart trang trí không có trục/đơn vị |
| Cần landing page đẹp nhanh | Aura, Layers, MotionSites, Shadcnblocks (mục 5.1–5.2) | Thay nội dung, màu, font | Giữ nguyên chữ/logo mẫu |
| Cần hiệu ứng | React Bits, Magic UI, Aceternity (mục 5.2) | Chọn 1–2 hiệu ứng, kiểm hiệu năng | Hiệu ứng trong bảng dữ liệu dày |
| Cần đồng bộ màu/font cho shadcn | tweakcn, shadcn theme generators (mục 5.11) | Xuất biến CSS | Sửa màu từng component |
| Cần phối chữ có dấu tiếng Việt | Google Fonts (lọc Vietnamese), Fontshare (thử dấu) (mục 5.8) | Test chuỗi tiếng Việt thật | Chọn font chỉ vì đẹp ở chữ Latin |
| Cần icon đồng bộ | Lucide / Phosphor / Heroicons / Tabler (mục 5.7) | Chọn một bộ | Trộn emoji và icon |
| Cần trạng thái chờ/rỗng/lỗi | Mục 5.15 | Thêm vào mọi màn hình dữ liệu | Chỉ làm màn hình "đầy dữ liệu" |
| Cần kiểm thử trước khi giao | Mục 5.16 + checklist mục 9 | Sửa từng điểm | Kết luận "ổn" khi chưa kiểm di động |
| Cần học nguyên tắc UX | Laws of UX, NN/g, Refactoring UI (mục 5.17) | Dùng làm tiêu chí review | Trích luật để biện minh cho mọi quyết định |

---

## 5. Danh mục nguồn

### 5.1 Lấy mẫu có sẵn để tùy chỉnh (khối giao diện)

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| OriginKit | https://www.originkit.dev/ | Chọn phần trang (menu, bảng giá, đầu trang), lấy mã cho AI sửa | Có phần miễn phí; có hạn mức | `[GỐC]` |
| 21st.dev | https://21st.dev/ | Nút, thẻ, menu; lấy mã hoặc prompt | Lượt lấy tùy gói | `[GỐC]` |
| Shadcnblocks | https://www.shadcnblocks.com/ | Đầu trang, bảng giá, FAQ cho dự án shadcn | Mẫu miễn phí và trả phí | `[GỐC]` |
| shadcn/ui Blocks | https://ui.shadcn.com/blocks | Khối dashboard, đăng nhập, sidebar chính thức | Miễn phí | `[BỔ SUNG]` |
| Tailwind Plus | https://tailwindcss.com/plus | Mẫu giao diện chất lượng cao cho Tailwind | Trả phí | `[BỔ SUNG]` |

**Cách dùng:** chọn mẫu → lấy mã/prompt → yêu cầu AI *giữ cấu trúc, thay token và nội dung*. Kiểm tra mẫu có phụ thuộc thư viện không có trong stack hay không.

### 5.2 Chọn mẫu đẹp, lấy prompt; hiệu ứng có sẵn

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Layers | https://www.getlayers.ai/ | Chọn mẫu, lấy câu lệnh cho AI dựng lại | Tải mã, dùng thương mại tùy gói | `[GỐC]` |
| MotionSites | https://motionsites.ai/ | Trang có chuyển động kèm câu lệnh | Lấy mẫu tùy gói | `[GỐC]` |
| Aura Templates | https://www.aura.build/templates | Chọn mẫu rồi nhờ AI chỉnh | Có mẫu trả phí; xuất mã tùy gói | `[GỐC]` |
| React Bits | https://reactbits.dev/ | Hiệu ứng cho dự án React | — | `[GỐC]` |
| Aceternity UI | https://ui.aceternity.com/ | Thẻ, nền, hiệu ứng | Có mẫu miễn phí và bộ trả phí | `[GỐC]` |
| Magic UI | https://magicui.design/ | Hiệu ứng cho trang | Thư viện miễn phí; Pro bán riêng | `[GỐC]` |

**Cảnh báo UX:** hiệu ứng nền, chữ chuyển động, hiệu ứng rê chuột nên dành cho trang giới thiệu. Trong tool vận hành (bảng, form, dashboard) chỉ dùng chuyển động để báo trạng thái hoặc chuyển cảnh, và phải tắt được theo `prefers-reduced-motion`.

### 5.3 Tìm bố cục đẹp cho website

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Land-book | https://land-book.com/ | Học bố cục trang | Bộ lọc nâng cao thuộc Pro | `[GỐC]` |
| Lapa Ninja | https://www.lapa.ninja/ | Cách đặt chữ và ảnh trang giới thiệu | Tài nguyên tải về có điều kiện riêng | `[GỐC]` |
| Curated.design | https://www.curated.design/ | Chọn website cho AI học cách sắp xếp | Có tính năng Pro | `[GỐC]` |
| Godly | https://godly.website/ | Tham khảo thẩm mỹ web hiện đại | — | `[BỔ SUNG]` |
| Awwwards | https://www.awwwards.com/ | Tham khảo trang thiên về trải nghiệm/chuyển động | — | `[BỔ SUNG]` |
| Refero | https://refero.design/ | Tham khảo màn hình sản phẩm web/app | Có thể giới hạn theo gói | `[BỔ SUNG]` |

**Cách dùng đúng:** mô tả cho AI **cấu trúc** (số cột, thứ bậc chữ, tỷ lệ ảnh/chữ, nhịp khoảng cách), không dán tên thương hiệu.

### 5.4 Phong cách và cách người dùng thao tác

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Siteinspire | https://www.siteinspire.com/ | Tìm website theo phong cách | — | `[GỐC]` |
| Dark Design | https://www.dark.design/ | Tham khảo nền tối | — | `[GỐC]` |
| Mobbin | https://mobbin.com/ | Màn hình và luồng của app thật | Kho đầy đủ cần gói trả phí | `[GỐC]` |
| Page Flows | https://pageflows.com/ | Luồng đăng ký, thanh toán, onboarding dạng video | Trả phí một phần | `[BỔ SUNG]` |

### 5.5 Nút, menu, bảng có sẵn; dashboard và dữ liệu

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| shadcn/ui | https://ui.shadcn.com/ | Nút, ô nhập, bảng; mã nằm trong dự án của bạn | Miễn phí; cần dự án phù hợp | `[GỐC]` |
| DaisyUI | https://daisyui.com/ | Nút, menu, bộ màu cho Tailwind | Lõi miễn phí | `[GỐC]` |
| Flowbite | https://flowbite.com/ | Nút, bảng, ô nhập cho Tailwind | Lõi miễn phí; tương tác cần JS | `[GỐC]` |
| Radix Primitives | https://www.radix-ui.com/primitives | Thành phần không kiểu dáng, đã xử lý bàn phím/focus/ARIA | Mã nguồn mở | `[BỔ SUNG]` |
| TanStack Table | https://tanstack.com/table | Bảng dữ liệu lớn: sắp xếp, lọc, phân trang, ảo hóa | Mã nguồn mở | `[BỔ SUNG]` |
| Recharts | https://recharts.org/ | Biểu đồ cho React | Mã nguồn mở | `[BỔ SUNG]` |
| shadcn/ui Charts | https://ui.shadcn.com/charts | Biểu đồ đồng bộ với token shadcn | Miễn phí | `[BỔ SUNG]` |
| Tremor | https://tremor.so/ | Thành phần dashboard (KPI, thanh, đường) | Kiểm tra giấy phép hiện hành | `[BỔ SUNG]` |
| Sonner | https://sonner.emilkowal.ski/ | Thông báo nhẹ | Mã nguồn mở | `[BỔ SUNG]` |
| React Hook Form | https://react-hook-form.com/ | Form có kiểm tra dữ liệu | Mã nguồn mở | `[BỔ SUNG]` |
| Zod | https://zod.dev/ | Schema kiểm tra dữ liệu dùng chung client/server | Mã nguồn mở | `[BỔ SUNG]` |

### 5.6 Hệ thống thiết kế tham chiếu (để học quy ước, không để sao chép)

| Nguồn | Link | Học gì | Nhãn |
|---|---|---|---|
| Apple Human Interface Guidelines | https://developer.apple.com/design/human-interface-guidelines/ | Nguyên tắc tương tác, bố cục, trợ năng đa nền tảng | `[ĐÃ XÁC NHẬN]` |
| Material Design 3 | https://m3.material.io/ | Hệ thống thành phần, trạng thái, chuyển động | `[BỔ SUNG]` |
| IBM Carbon | https://carbondesignsystem.com/ | Giao diện doanh nghiệp, bảng dữ liệu dày | `[BỔ SUNG]` |
| Ant Design | https://ant.design/ | Giao diện quản trị, form/bảng phức tạp | `[BỔ SUNG]` |
| Shopify Polaris | https://polaris.shopify.com/ | Ngôn ngữ giao diện cho công cụ quản trị thương mại | `[BỔ SUNG]` |
| GOV.UK Design System | https://design-system.service.gov.uk/ | Form, lỗi, trợ năng rất kỹ | `[BỔ SUNG]` |
| Vercel Geist | https://vercel.com/geist/introduction | Giao diện công cụ cho lập trình viên | `[BỔ SUNG]` |
| DesignSystems.one | https://www.designsystems.one/ | Thư viện hệ thống thiết kế thực tế, công cụ token/màu | `[ĐÃ XÁC NHẬN]` |
| Design Systems Directory | https://designsystem.cc/ | Danh mục hệ thống thiết kế | `[ĐÃ XÁC NHẬN]` |

### 5.7 Icon đồng bộ

| Nguồn | Link | Đặc điểm | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Lucide | https://lucide.dev/icons/ | Nét viền mảnh | Miễn phí, mã nguồn mở | `[GỐC]` |
| Phosphor | https://phosphoricons.com/ | Nhiều độ đậm; hai tông màu | Miễn phí | `[GỐC]` |
| Heroicons | https://heroicons.com/ | Viền hoặc tô đặc | Miễn phí, mã nguồn mở | `[GỐC]` |
| Tabler Icons | https://tabler.io/icons | Bộ lớn, nét nhất quán | Mã nguồn mở | `[BỔ SUNG]` |

**Quy tắc:** một bộ icon cho toàn sản phẩm; một độ dày nét; kích thước theo bậc (16/20/24). Nút chỉ có icon phải có nhãn truy cập (`aria-label`) và gợi ý khi rê chuột/focus.

### 5.8 Font và phối chữ (lưu ý dấu tiếng Việt)

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Google Fonts | https://fonts.google.com/ | Chọn font; lọc theo ngôn ngữ Vietnamese | Miễn phí | `[GỐC]` |
| Fontshare | https://www.fontshare.com/ | Font miễn phí cho dự án cá nhân/thương mại; **thử dấu tiếng Việt** | Miễn phí | `[GỐC]` |
| Typewolf | https://www.typewolf.com/ | Xem website phối font ra sao | Font gợi ý có thể trả phí | `[GỐC]` |
| Be Vietnam Pro | https://fonts.google.com/specimen/Be+Vietnam+Pro | Thiết kế cho tiếng Việt, hợp giao diện sản phẩm | Miễn phí | `[BỔ SUNG]` |

**Quy tắc tiếng Việt:**
- Luôn thử chuỗi có dấu chồng (ví dụ: `Ướt, Quyết định, Nhượng quyền, Thiết lập`) ở cỡ nhỏ nhất của sản phẩm.
- Kiểm tra chiều cao dòng: dấu có bị cắt/đè dòng trên không.
- Không giả định font có đủ bộ ký tự tiếng Việt chỉ vì đẹp ở chữ Latin; xác nhận bằng bản xem trước thực tế.
- Tối đa 2 họ font; phân biệt vai trò (tiêu đề / nội dung).

### 5.9 Màu và thử màu lên giao diện

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Coolors | https://coolors.co/ | Tạo bảng màu | Có Free và Pro | `[GỐC]` |
| Realtime Colors | https://www.realtimecolors.com/ | Thử màu lên nền, chữ, nút; lấy CSS | — | `[GỐC]` |
| Radix Colors | https://www.radix-ui.com/colors | Thang 12 bậc cho nền sáng/tối | Vẫn cần kiểm tra màu chữ | `[GỐC]` |
| OKLCH Color Picker | https://oklch.com/ | Chọn màu theo không gian cảm thụ đồng đều | — | `[BỔ SUNG]` |

### 5.10 Hình minh họa cùng phong cách

| Nguồn | Link | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|
| unDraw | https://undraw.co/illustrations | Miễn phí, không cần ghi nguồn | `[GỐC]` |
| Storyset | https://storyset.com/ | Bản miễn phí cần ghi nguồn | `[GỐC]` |
| Humaaans | https://www.humaaans.com/ | Thư viện gốc miễn phí | `[GỐC]` |

### 5.11 Đồng bộ màu/font cho web dùng shadcn/ui

| Nguồn | Link | Dùng khi | Nhãn |
|---|---|---|---|
| tweakcn | https://tweakcn.com/editor/theme | Thử màu/font trên mẫu; lấy cấu hình | `[GỐC]` |
| Zippy Starter Theme Generator | https://zippystarter.com/tools/shadcn-ui-theme-generator | Tạo bộ màu cho shadcn/ui | `[GỐC]` |
| shadcn.io Theme Generator | https://www.shadcn.io/theme-generator | Xem màu trên nhiều mẫu | `[GỐC]` |

### 5.12 Cỡ chữ và khoảng cách

| Nguồn | Link | Dùng khi | Giá/giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Typescale | https://typescale.com/ | Chọn cỡ chữ theo cấp | Xuất CSS và tính năng nâng cao thuộc Pro | `[GỐC]` |
| Utopia | https://utopia.fyi/ | Cỡ chữ/khoảng cách co giãn; có CSS | — | `[GỐC]` |
| Modular Scale | https://www.modularscale.com/ | Thang cỡ chữ theo tỷ lệ | — | `[GỐC]` |

### 5.13 Nền, ảnh, video, khung thiết bị, 3D, chuyển động

| Nhóm | Nguồn | Link | Lưu ý giấy phép (theo nguồn gốc) | Nhãn |
|---|---|---|---|---|
| Nền SVG | Haikei | https://haikei.app/ | Tải SVG/PNG | `[GỐC]` |
| Nền SVG | SVG Backgrounds | https://www.svgbackgrounds.com/ | Nền miễn phí cần ghi nguồn | `[GỐC]` |
| Nền SVG | fffuel | https://www.fffuel.co/ | Cá nhân và thương mại | `[GỐC]` |
| Ảnh/video | Unsplash | https://unsplash.com/ | Có kho Plus trả phí | `[GỐC]` |
| Ảnh/video | Pexels | https://www.pexels.com/ | Xem giấy phép | `[GỐC]` |
| Ảnh/video | Pixabay | https://pixabay.com/ | Xem giấy phép | `[GỐC]` |
| Khung thiết bị | Shots | https://shots.so/ | Tính năng miễn phí/trả phí | `[GỐC]` |
| Khung thiết bị | Mockup Bro | https://mockupbro.com/ | Kiểm tra giấy phép từng mẫu | `[GỐC]` |
| Khung thiết bị | Mockuphone | https://mockuphone.com/ | Miễn phí, cần ghi nguồn | `[GỐC]` |
| 3D dạng ảnh | Shapefest | https://shapefest.com/ | Bộ miễn phí; ảnh lớn trả phí | `[GỐC]` |
| 3D dạng ảnh | Icons8 Illustrations | https://icons8.com/illustrations | Bản miễn phí có giới hạn, cần ghi nguồn | `[GỐC]` |
| 3D dạng ảnh | 3dicons | https://old.3dicons.co/ | Bộ V1 miễn phí, dùng thương mại | `[GỐC]` |
| 3D tương tác | Spline | https://spline.design/ | Gói miễn phí có watermark | `[GỐC]` |
| 3D tương tác | model-viewer | https://modelviewer.dev/ | Chỉ xoay mô hình có sẵn | `[GỐC]` |
| 3D tương tác | Vectary | https://www.vectary.com/ | Nhúng web, thương mại tùy gói | `[GỐC]` |
| Nguyên liệu 3D | Poly Haven | https://polyhaven.com/ | Miễn phí, dùng thương mại | `[GỐC]` |
| Nguyên liệu 3D | ambientCG | https://ambientcg.com/ | Miễn phí theo CC0 | `[GỐC]` |
| Nguyên liệu 3D | Kenney | https://kenney.nl/assets | Miễn phí, hợp kiểu game | `[GỐC]` |
| Icon động | Lucide Animated | https://lucide-animated.com/ | Mã miễn phí, cho React | `[GỐC]` |
| Icon động | Lordicon | https://lordicon.com/ | Bộ miễn phí cần ghi nguồn | `[GỐC]` |
| Icon động | Rive Marketplace | https://rive.app/marketplace/ | Cần bộ chạy Rive; xem giấy phép | `[GỐC]` |
| Icon động | LottieFiles | https://lottiefiles.com/ | Kiểm tra giấy phép từng file | `[BỔ SUNG]` |
| Chuyển động bằng mã | GSAP | https://gsap.com/ | Miễn phí theo giấy phép GSAP | `[GỐC]` |
| Chuyển động bằng mã | Motion | https://motion.dev/ | Lõi miễn phí; Motion+ trả phí | `[GỐC]` |
| Chuyển động bằng mã | Anime.js | https://animejs.com/ | Miễn phí | `[GỐC]` |
| Học hiệu ứng | CodePen | https://codepen.io/ | Mã public theo MIT; ảnh/font có giấy phép riêng | `[GỐC]` |
| Học hiệu ứng | Codrops | https://tympanus.net/codrops/ | Quyền dùng mã tùy tài nguyên | `[GỐC]` |
| Học hiệu ứng | Hoverstat.es | https://www.hoverstat.es/ | Tham khảo, không phải kho mã | `[GỐC]` |
| Nguyên tắc chuyển động | NN/g — Animation Duration | https://www.nngroup.com/articles/animation-duration/ | Học độ dài/đặc tính chuyển động | `[BỔ SUNG]` |

### 5.14 Chỉnh ảnh trước khi lên web và dữ liệu mẫu

| Nhóm | Nguồn | Link | Lưu ý | Nhãn |
|---|---|---|---|---|
| Ảnh | Squoosh | https://squoosh.app/ | Nén ngay trên máy; so chất lượng trước khi lưu | `[GỐC]` |
| Ảnh | iLoveIMG | https://www.iloveimg.com/ | **File được tải lên máy chủ** — không dùng với ảnh nhạy cảm | `[GỐC]` |
| Ảnh | Photopea | https://www.photopea.com/ | Bản chỉnh sửa cơ bản miễn phí | `[GỐC]` |
| Dữ liệu mẫu | Mockaroo | https://www.mockaroo.com/ | Miễn phí tối đa 1.000 dòng/file | `[GỐC]` |
| Dữ liệu mẫu | DummyJSON | https://dummyjson.com/docs/products | Dữ liệu sản phẩm cho bản thử | `[GỐC]` |
| Dữ liệu mẫu | DiceBear | https://www.dicebear.com/playground/ | Kiểm giấy phép từng kiểu hình | `[GỐC]` |

**Quy tắc dữ liệu mẫu:** chỉ dùng trong môi trường thử/thiết kế. Không để dữ liệu mẫu hiển thị trong sản phẩm thật như số liệu thật. Với sản phẩm báo cáo/quảng cáo, dữ liệu mẫu phải được gắn nhãn rõ.

### 5.15 Trạng thái chờ, rỗng, lỗi

| Nguồn | Link | Dùng khi | Nhãn |
|---|---|---|---|
| react-loading-skeleton | https://github.com/dvtng/react-loading-skeleton | Khung chờ cho React | `[GỐC]` |
| PatternFly — Empty state | https://www.patternfly.org/components/empty-state/ | Mẫu trang chưa có dữ liệu | `[GỐC]` |
| GOV.UK — Error summary | https://design-system.service.gov.uk/components/error-summary/ | Báo lỗi biểu mẫu: chỉ rõ ô cần sửa và cách sửa | `[GỐC]` |

### 5.16 Kiểm tra trước khi giao

| Nguồn | Link | Dùng khi | Nhãn |
|---|---|---|---|
| WebAIM Contrast Checker | https://webaim.org/resources/contrastchecker/ | Kiểm độ tương phản chữ/nền | `[GỐC]` |
| WAVE | https://wave.webaim.org/ | Quét cảnh báo trợ năng | `[GỐC]` |
| Chrome DevTools Device Mode | https://developer.chrome.com/docs/devtools/device-mode | Giả lập màn hình nhỏ | `[GỐC]` |
| WCAG 2.2 Quick Reference | https://www.w3.org/WAI/WCAG22/quickref/ | Tra tiêu chí trợ năng cụ thể | `[BỔ SUNG]` |
| ARIA Authoring Practices | https://www.w3.org/WAI/ARIA/apg/ | Mẫu tương tác bàn phím chuẩn (menu, tab, dialog) | `[BỔ SUNG]` |
| axe-core | https://github.com/dequelabs/axe-core | Kiểm trợ năng tự động trong test | `[BỔ SUNG]` |
| PageSpeed Insights | https://pagespeed.web.dev/ | Đo hiệu năng và Core Web Vitals | `[BỔ SUNG]` |
| web.dev | https://web.dev/ | Hướng dẫn hiệu năng, trợ năng | `[BỔ SUNG]` |
| Can I use | https://caniuse.com/ | Kiểm hỗ trợ tính năng trình duyệt | `[BỔ SUNG]` |
| Storybook | https://storybook.js.org/ | Xem/ kiểm từng component và từng trạng thái riêng lẻ | `[BỔ SUNG]` |

**Lưu ý:** công cụ tự động chỉ bắt được một phần lỗi trợ năng. Luôn thử thao tác bằng bàn phím và đọc nhãn bằng mắt.

### 5.17 Nguyên tắc UX và học thuật

| Nguồn | Link | Học gì | Nhãn |
|---|---|---|---|
| Laws of UX | https://lawsofux.com/ | Luật tâm lý/Gestalt áp dụng vào giao diện | `[ĐÃ XÁC NHẬN]` |
| NN/g — 10 Usability Heuristics | https://www.nngroup.com/articles/ten-usability-heuristics/ | Bộ tiêu chí đánh giá khả dụng | `[ĐÃ XÁC NHẬN]` |
| Refactoring UI | https://www.refactoringui.com/ | Mẹo thực hành về thứ bậc, khoảng cách, màu | `[BỔ SUNG]` |
| Data-to-Viz | https://www.data-to-viz.com/ | Chọn loại biểu đồ theo dạng dữ liệu | `[BỔ SUNG]` |
| FT Visual Vocabulary | https://ft-interactive.github.io/visual-vocabulary/ | Từ vựng biểu đồ theo mục đích | `[BỔ SUNG]` |

**Cách dùng luật UX:** là công cụ *đánh giá*, không phải lý do biện minh. Mỗi quyết định thiết kế phải gắn với một quan sát về người dùng hoặc dữ liệu, không chỉ với tên một "định luật".

---

## 6. Chuẩn cho tool vận hành / dashboard dữ liệu

Phần này áp dụng cho tool nội bộ, quản trị, quảng cáo, báo cáo.

### 6.1 Cấu trúc màn hình
- Thứ bậc: **KPI chính → xu hướng → chi tiết/bảng → hành động**.
- Một vùng cuộn chính; thanh bên và đầu trang cố định.
- Bộ lọc toàn cục (thời gian, công ty/đơn vị, nền tảng) hiển thị nhất quán ở đầu trang.
- Mật độ dày hơn trang giới thiệu: chữ nội dung 14–16px, khoảng cách theo bội số 4px.

### 6.2 Số liệu và định dạng
- Locale `vi-VN`; tiền tệ rõ đơn vị; dùng cách rút gọn nhất quán trong toàn sản phẩm.
- Số trong bảng dùng chữ số đều chiều rộng (`font-variant-numeric: tabular-nums`) và căn phải.
- Luôn có đơn vị, khoảng thời gian và nguồn khi hiển thị chỉ số.

### 6.3 Trung thực dữ liệu (bắt buộc)
- Không hiển thị `0` thay cho *chưa biết/chưa kết nối/lỗi đọc*.
- Bốn trạng thái dữ liệu với nhãn riêng: `đầy đủ` / `thiếu` / `ước tính` / `chưa xác minh`.
- Số ước tính phải có nhãn và nêu căn cứ.
- Phân biệt số do nền tảng quảng cáo tự báo với số đối chiếu từ nguồn thật (đơn đã thu tiền, ERP).
- Khi một nguồn không đọc được, ẩn phần phụ thuộc và nêu rõ nguồn nào lỗi, không để trống im lặng.

### 6.4 Hành động ghi lên hệ thống thật
Mẫu giao diện cho thao tác có hệ quả:

```text
Kiểm trước (không ghi)  →  Xem khác biệt (trước/sau)  →  Gõ chuỗi xác nhận
→  Ghi  →  Đọc lại để xác minh  →  Ghi nhật ký  →  Hoàn tác (nếu hỗ trợ)
```

- Hộp xác nhận hiển thị **đối tượng, giá trị cũ, giá trị mới, phạm vi ảnh hưởng**.
- Nút phá hủy/thay đổi tiền dùng kiểu riêng và đặt cách xa nút an toàn.
- Sau khi ghi: hiển thị **kết quả đọc lại**, không chỉ "thành công".
- Hành động không thể hoàn tác phải nói rõ trước khi xác nhận.

### 6.5 Nội dung chữ trên giao diện
- Giao diện bằng tiếng Việt; câu chữ nhãn nút, thông báo, báo lỗi **cần được người phụ trách nghiệp vụ duyệt**.
- Khi AI đề xuất câu chữ, gắn nhãn `[ĐỀ XUẤT — chờ duyệt]` và đặt trong tệp/biến i18n, không rải trong mã.
- Báo lỗi theo mẫu: *chuyện gì xảy ra → vì sao (nếu biết) → làm gì tiếp theo → liên kết tới nơi sửa*. Không hiển thị lỗi kỹ thuật thô cho người dùng cuối.

### 6.6 Phân quyền trong giao diện
- Ẩn hoàn toàn mục không thuộc phạm vi vai trò/mô-đun; chỉ vô hiệu hóa (kèm lý do) khi người dùng cần biết tính năng tồn tại.
- Không dùng giao diện làm lớp bảo vệ duy nhất; quyền phải được kiểm ở phía máy chủ.

### 6.7 Tối ưu cho mật độ cao
- Bảng: tiêu đề cố định, sắp xếp/lọc, cột có thể ẩn/hiện, phân trang hoặc ảo hóa khi nhiều dòng.
- Hàng có hành động: hiển thị trạng thái hàng (đang xử lý/lỗi/đã áp dụng) tại chỗ.
- Biểu đồ: có trục, đơn vị, chú giải, trạng thái rỗng; không dùng quá 5–6 màu phân biệt.

---

## 7. Giấy phép và rủi ro (ma trận kiểm tra nhanh)

| Rủi ro | Nguồn thường gặp (theo mô tả gốc) | Việc cần làm |
|---|---|---|
| Bắt buộc ghi nguồn | Storyset (bản miễn phí), SVG Backgrounds (nền miễn phí), Mockuphone, Lordicon (bộ miễn phí), Icons8 (bản miễn phí) | Ghi nguồn đúng yêu cầu hoặc mua gói không cần ghi nguồn |
| Có watermark ở bản miễn phí | Spline | Dùng gói phù hợp trước khi đưa lên sản phẩm thật |
| Dùng thương mại tùy gói | Layers, Vectary, Aura, MotionSites | Đọc điều khoản của gói đang dùng |
| Giấy phép riêng cho từng file | Lapa Ninja (tải về), Mockup Bro, DiceBear, LottieFiles, Rive | Kiểm từng tài nguyên |
| Mã demo không có giấy phép rõ | Một số demo trên CodePen/Codrops | Dùng làm tham khảo; viết lại hoặc xác nhận giấy phép |
| Tải file lên máy chủ bên thứ ba | iLoveIMG | Không dùng cho ảnh/tài liệu nhạy cảm |
| Phụ thuộc runtime riêng | Rive | Cân nhắc kích thước và bảo trì |
| Giới hạn gói miễn phí | OriginKit, 21st.dev, Coolors, Typescale, Mobbin | Đừng xây quy trình phụ thuộc vào hạn mức miễn phí |
| Link/nhóm Pro có thể thay đổi | Mọi nguồn | Kiểm lại trước khi dùng |

---

## 8. Mẫu prompt cho AI (ngắn, dùng được ngay)

### 8.1 Dựng lại bố cục từ tham chiếu
```text
Dựng khối [tên khối] cho [tên sản phẩm].
Tham chiếu: mô tả CẤU TRÚC (không sao chép thương hiệu):
- bố cục: [số cột, thứ bậc chữ, vị trí ảnh]
- nhịp khoảng cách: [bội số 4px]
Bắt buộc dùng token của dự án: màu [biến], font [biến], bo góc [biến].
Giữ nguyên component có sẵn: [shadcn/ui ...]. Không thêm thư viện mới.
Có đủ trạng thái: tải, rỗng, lỗi, không có quyền.
Chữ tiếng Việt lấy từ file i18n; chỗ chưa có thì để khóa và đánh dấu [ĐỀ XUẤT — chờ duyệt].
```

### 8.2 Đồng bộ theme
```text
Áp dụng cấu hình theme sau cho toàn dự án bằng biến CSS (sáng + tối):
[dán cấu hình từ tweakcn / theme generator]
Không sửa màu từng component. Kiểm tương phản chữ/nền đạt tối thiểu AA.
Báo cáo các chỗ vẫn dùng màu cứng.
```

### 8.3 Thay icon đồng bộ
```text
Thay toàn bộ emoji/icon rời rạc bằng bộ [Lucide]. Một độ dày nét, kích thước 16/20/24.
Nút chỉ có icon phải có aria-label và tooltip. Liệt kê các file đã sửa.
```

### 8.4 Thêm trạng thái
```text
Với màn hình [tên], thêm: skeleton khi tải, trạng thái rỗng (nêu lý do + hành động tiếp theo),
trạng thái lỗi (nguyên nhân + cách xử lý + liên kết), trạng thái không có quyền.
Không hiển thị 0 cho dữ liệu chưa biết; dùng nhãn "chưa có dữ liệu".
```

### 8.5 Thêm hiệu ứng có kiểm soát
```text
Thêm [tên hiệu ứng] vào [vị trí]. Chỉ ở trang giới thiệu, không đặt trong bảng dữ liệu.
Tôn trọng prefers-reduced-motion. Kiểm tra không làm giảm hiệu năng (không giật khi cuộn).
Mô tả lựa chọn thư viện và lý do.
```

### 8.6 Rà soát giao diện
```text
Rà soát [màn hình/PR] theo checklist UI: thứ bậc, khoảng cách, tương phản, bàn phím, focus,
di động 375px, trạng thái dữ liệu, trung thực số liệu, câu chữ tiếng Việt.
Trả về bảng: vấn đề | mức nghiêm trọng | file | đề xuất sửa | đã kiểm hay chưa kiểm.
```

---

## 9. Checklist kiểm thử UI trước khi giao

**Hệ thống**
- [ ] Mọi màu/chữ/khoảng cách lấy từ token; không còn màu cứng ngoài ngoại lệ có ghi chú.
- [ ] Một bộ icon, một độ dày nét.
- [ ] Tối đa 2 họ font; thử chuỗi tiếng Việt có dấu ở cỡ nhỏ nhất.
- [ ] Chế độ sáng/tối đều đạt tương phản.

**Trợ năng**
- [ ] Độ tương phản chữ thường ≥ 4.5:1, chữ lớn ≥ 3:1.
- [ ] Thao tác được toàn bộ bằng bàn phím; focus nhìn thấy rõ.
- [ ] Nút chỉ có icon có nhãn truy cập.
- [ ] Biểu mẫu: nhãn gắn với ô nhập; lỗi chỉ rõ ô và cách sửa.
- [ ] Hiệu ứng tắt/giảm khi người dùng chọn giảm chuyển động.

**Trạng thái và dữ liệu**
- [ ] Tải / rỗng / lỗi / không có quyền / một phần dữ liệu đều có thiết kế.
- [ ] Không có `0` thay cho chưa biết; có nhãn nguồn và khoảng thời gian.
- [ ] Số ước tính được gắn nhãn.
- [ ] Dữ liệu mẫu không lọt vào bản thật.

**Hành động ghi**
- [ ] Có kiểm trước, xem khác biệt, xác nhận, đọc lại, nhật ký, hoàn tác (nếu hỗ trợ).
- [ ] Hành động không hoàn tác được nói rõ trước khi xác nhận.

**Đáp ứng và hiệu năng**
- [ ] Kiểm ở 375px, 768px, 1280px+; không tràn ngang ngoài ý muốn.
- [ ] Ảnh đã nén và có kích thước; font không gây nhảy bố cục.
- [ ] Đo bằng công cụ hiệu năng; ghi lại kết quả.

**Giấy phép**
- [ ] Mọi tài nguyên bên ngoài đã kiểm giấy phép/ghi nguồn.
- [ ] Không còn watermark/nhãn mẫu.

**Ghi nhận trung thực**
- [ ] Danh sách những gì **đã kiểm** và **chưa kiểm** (ví dụ chưa thử trên thiết bị thật, chưa chạy trình đọc màn hình).

---

## 10. Định dạng đầu ra khi dùng skill

Khi được yêu cầu tư vấn/dựng giao diện, trả về theo thứ tự:

1. **Brief đã điền** (mục 3, bước 1) và giả định nào còn thiếu.
2. **Hướng tham chiếu đã chọn** (2–3 nguồn) và vì sao.
3. **Token đề xuất** (màu, chữ, khoảng cách, bo góc).
4. **Danh sách component/thư viện** dùng và thư viện **không** dùng.
5. **Các trạng thái** cần thiết kế cho từng màn hình.
6. **Rủi ro giấy phép/hiệu năng/trợ năng** đã nhận diện.
7. **Prompt** sẵn sàng đưa cho AI dựng (từ mục 8).
8. **Kế hoạch kiểm thử** (mục 9) và phần chưa thể kiểm.

---

## 11. Lỗi thường gặp (tránh)

- Dán link website cho AI và bảo "làm giống" → ra bản sao thương hiệu, lệch token.
- Trộn nhiều thư viện component/icon/chart → giao diện không đồng nhất, bundle nặng.
- Hiệu ứng ở mọi nơi → mất tập trung, giảm hiệu năng, khó đọc dữ liệu.
- Chỉ thiết kế màn hình "đầy dữ liệu" → hỏng khi rỗng/lỗi.
- Hiển thị `0`/biểu đồ phẳng khi nguồn dữ liệu lỗi → người dùng quyết định sai.
- Chọn font không hỗ trợ tiếng Việt đủ → dấu bị cắt/đè.
- Dùng tài nguyên miễn phí yêu cầu ghi nguồn mà không ghi.
- Tin công cụ kiểm tự động là đủ → bỏ sót lỗi bàn phím/đọc màn hình.
- Chỉnh câu chữ nghiệp vụ không qua người duyệt.

---

## 12. Bảo trì skill

- Rà lại link và mô tả giá/giấy phép mỗi quý hoặc trước dự án lớn.
- Thêm nguồn mới vào đúng nhóm và gắn nhãn `[BỔ SUNG]`; chỉ chuyển `[ĐÃ XÁC NHẬN]` khi đã mở và đọc trang.
- Khi một nguồn ngừng hoạt động hoặc đổi giấy phép, ghi ngày và lý do thay vì xóa im lặng.
- Giữ danh mục ngắn gọn: mỗi nhóm nên có 3–6 nguồn đã chọn lọc, không phải mọi thứ tìm được.
