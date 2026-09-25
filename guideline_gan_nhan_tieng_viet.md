# Guideline gán nhãn nội dung tiếng Việt

## 1. Mục tiêu

Guideline này quy định cách phân loại nội dung tiếng Việt vào đúng một trong ba nhãn:

| Label | Tên | Ý nghĩa |
|---|---|---|
| `0` | `clean` | Nội dung sạch/an toàn, hoặc có từ thô tục dạng viết tắt/từ phủ định hoặc cảm thán nhẹ nhưng không công kích cá nhân/nhóm |
| `1` | `offensive` | Nội dung thô tục, xúc phạm, lăng mạ hoặc công kích cá nhân/nhóm nhỏ không dựa trên đặc tính bảo vệ |
| `2` | `hate` | Kích động/đe dọa gây hại hoặc miệt thị/thù ghét nhóm người dựa trên đặc tính nhóm |

**Thứ tự ưu tiên:**

```text
hate (2) > offensive (1) > clean (0)
```

Nếu một nội dung đồng thời thỏa nhiều điều kiện, chọn nhãn có mức ưu tiên cao hơn.

---

## 2. Quy trình quyết định

Luôn kiểm tra theo thứ tự:

```text
CURRENT TEXT
    |
    v
Có kích động/đe dọa bạo lực
hoặc hate speech?
    |--- Có ---> LABEL 2 (hate)
    |
    Không
    |
    v
Có offensive?
    |--- Có ---> LABEL 1 (offensive)
    |
    Không
    |
    v
LABEL 0 (clean)
```

Chỉ phân loại **CURRENT TEXT**. `CONTEXT` chỉ được sử dụng để hiểu ý nghĩa của CURRENT TEXT.

Không tự suy diễn nội dung không xuất hiện trong CURRENT TEXT.

---

# 3. LABEL 2 — HATE

Gán:

```text
label = 2
```

nếu CURRENT TEXT thỏa ít nhất một trong hai nhóm điều kiện dưới đây.

## 3.1. Kích động bạo lực / đe dọa gây hại

Bao gồm:

- Kêu gọi gây hại về thể chất.
- Cổ súy bạo lực.
- Đe dọa gây thương tích.
- Đe dọa tính mạng.
- Có thể nhắm tới cá nhân hoặc nhóm.

Ví dụ:

```text
"Bắn chết nó đi"
→ 2

"Đập chết nó"
→ 2

"Cho nó một trận đi"
→ 2
```

Không yêu cầu đối tượng phải thuộc một nhóm có đặc tính bảo vệ.

Nếu nội dung có yếu tố kích động/đe dọa gây hại, ưu tiên `2`.

---

## 3.2. Miệt thị/thù ghét dựa trên đặc tính nhóm

Gán `2` khi nội dung công kích, miệt thị, phi nhân hóa hoặc thể hiện thù ghét nhắm vào **một nhóm người thật** dựa trên:

- Vùng miền
- Chủng tộc
- Quốc tịch
- Giới tính
- Tôn giáo
- Khuyết tật
- Địa vị xã hội
- Identity chính trị

Nội dung có thể được thể hiện trực tiếp hoặc thông qua mỉa mai/châm biếm.

### Ví dụ

```text
"Dân vùng X toàn bọn lừa đảo"
→ 2
```

```text
"À vâng, dân vùng X thì giỏi lừa đảo lắm nhỉ"
→ 2
```

Câu thứ hai vẫn là `hate` vì mỉa mai dựa trên đặc tính vùng miền.

---

# 4. Những trường hợp không tự động là HATE

## 4.1. Phê phán chính sách, đảng phái hoặc chính phủ

Nếu nội dung chỉ phê phán:

- Chính sách
- Chính phủ
- Đảng phái
- Tổ chức
- Hệ thống

mà không phi nhân hóa hoặc miệt thị con người dựa trên đặc tính nhóm, không gán `hate`.

Ví dụ:

```text
"Nên quốc hữu hóa nhà máy của bọn tư bản"
→ 0
```

## 4.2. Banter / trash-talk trong game, esports, thể thao

Theo guideline này, banter/trash-talk trong:

- Game
- Esports
- Thể thao

không tự động là `hate`.

Ví dụ:

```text
"SEA là vùng trũng esports"
→ 0
```

Tuy nhiên, nếu nội dung đồng thời thỏa một điều kiện `hate` khác thì vẫn ưu tiên `2`.

---

# 5. LABEL 1 — OFFENSIVE

Gán:

```text
label = 1
```

nếu nội dung không thuộc `hate` nhưng thỏa ít nhất một điều kiện offensive.

## 5.1. Xúc phạm hoặc lăng mạ cá nhân

Nhắm vào một cá nhân cụ thể.

Ví dụ:

```text
"Thằng này ngu như chó"
→ 1
```

```text
"Mày đúng là đồ ngu"
→ 1
```

---

## 5.2. Công kích nhóm nhỏ theo hành vi/ngữ cảnh

Đối tượng là một nhóm nhỏ được xác định bởi hành vi hoặc ngữ cảnh cụ thể, không phải đặc tính bảo vệ.

Ví dụ:

```text
"Mấy đứa gian lận thi cử"
→ 1
```

Phân biệt:

```text
Nhóm dựa trên hành vi
→ offensive (1)

Nhóm dựa trên đặc tính bảo vệ
→ hate (2)
```

---

## 5.3. Quấy rối/gạ gẫm tình dục hoặc bình phẩm thân thể

Nếu nội dung nhắm vào một cá nhân cụ thể và có:

- Quấy rối tình dục
- Gạ gẫm tình dục
- Bình phẩm thân thể mang tính đối tượng hóa

→ `1`

Ví dụ:

```text
"Chị hàng xóm để tối qua giường gạ"
→ 1
```

---

## 5.4. Mỉa mai/châm biếm công kích cá nhân

Mỉa mai nhằm hạ thấp hoặc công kích một cá nhân nhưng không dựa trên đặc tính nhóm bảo vệ.

→ `1`

---

# 6. Từ tục trần trụi = OFFENSIVE

Đây là quy tắc đặc biệt.

Nếu sử dụng từ tục **trần trụi/viết đầy đủ**, gán `1` ngay cả khi:

- Không công kích cá nhân.
- Không công kích nhóm.
- Chỉ dùng làm cảm thán.
- Chỉ dùng để chê sản phẩm/đồ vật.

Các ví dụ trong policy:

```text
"vãi lồn"
"địt mẹ"
"lồn"
"cặc"
"chịch"
```

Ví dụ:

```text
"Màn hình này vãi lồn thật"
→ 1
```

Lý do: có từ tục trần trụi `vãi lồn`.

---

# 7. LABEL 0 — CLEAN

Gán:

```text
label = 0
```

khi nội dung không thỏa điều kiện `hate` hoặc `offensive`.

## 7.1. Từ tục dạng viết tắt

Cho phép các dạng viết tắt nếu không dùng để công kích cá nhân hoặc nhóm cụ thể.

Ví dụ:

```text
vl
vcl
đm
vkl
cc
cl
như cc
```

Các trường hợp có thể gán `0`:

```text
"Mác Kia ngáo giá, như cc tuốt"
→ 0
```

Vì đối tượng bị chê là sản phẩm.

```text
"Đcm cay thật"
→ 0
```

Vì được dùng như một câu cảm thán viết tắt.

---

## 7.2. Từ "vãi" đứng một mình

Từ `vãi` được chấp nhận khi không đi kèm từ tục trần trụi.

Ví dụ:

```text
"Ngon vãi"
→ 0

"Hay vãi"
→ 0

"Đắt vãi"
→ 0
```

Nhưng:

```text
"Vãi lồn"
→ 1
```

vì có từ tục trần trụi.

---

## 7.3. Từ "đéo" dùng làm phủ định

Theo policy này, `đéo` được chấp nhận khi dùng như từ phủ định.

Ví dụ:

```text
"Đéo biết"
→ 0

"Đéo quan tâm"
→ 0

"Đéo có tiền"
→ 0
```

---

## 7.4. Mỉa mai không công kích cá nhân/nhóm

Mỉa mai hoặc châm biếm:

- Tình huống
- Sản phẩm
- Sự việc
- Chính sách
- Hiện tượng nói chung

không tự động là offensive hoặc hate.

---

# 8. Bảng phân loại nhanh

| Nội dung | Label |
|---|---:|
| Nội dung bình thường | `0` |
| "Ngon vãi" | `0` |
| "Tôi đéo quan tâm" | `0` |
| "Đcm cay thật" | `0` |
| "Sản phẩm này như cc" | `0` |
| Chê sản phẩm bằng từ viết tắt | `0` |
| Xúc phạm một cá nhân | `1` |
| "Thằng này ngu" | `1` |
| Từ tục viết đầy đủ | `1` |
| "Vãi lồn" | `1` |
| Quấy rối cá nhân | `1` |
| Công kích nhóm theo hành vi | `1` |
| Miệt thị vùng miền | `2` |
| Miệt thị tôn giáo | `2` |
| Miệt thị chủng tộc | `2` |
| Miệt thị giới tính | `2` |
| Kích động bạo lực | `2` |
| Đe dọa gây hại | `2` |
| Mỉa mai thù ghét nhóm | `2` |

---

# 9. Quy tắc cốt lõi

Có thể rút gọn toàn bộ guideline thành 7 quy tắc:

1. **Chỉ phân loại CURRENT TEXT.**
2. **Kiểm tra `hate` trước `offensive`, `offensive` trước `clean`.**
3. **Kích động hoặc đe dọa bạo lực → `2`.**
4. **Miệt thị/thù ghét nhóm người dựa trên đặc tính nhóm → `2`.**
5. **Xúc phạm/công kích cá nhân hoặc nhóm nhỏ theo hành vi → `1`.**
6. **Từ tục trần trụi/viết đầy đủ → `1`, kể cả khi chỉ cảm thán hoặc chê đồ vật.**
7. **Từ tục viết tắt, `vãi` đơn lẻ và `đéo` phủ định được phép → `0` nếu không có công kích cá nhân/nhóm.**

---

# 10. Các cặp dễ nhầm

## 10.1. Từ viết tắt vs. từ trần trụi

```text
"Game này như cc"
→ 0

"Game này như cứt"
→ 1
```

Theo policy hiện tại, từ tục viết tắt được chấp nhận nhưng từ tục trần trụi được xếp `offensive`.

## 10.2. "Vãi" vs. "vãi lồn"

```text
"Ngon vãi"
→ 0

"Vãi lồn"
→ 1
```

## 10.3. Công kích cá nhân vs. công kích nhóm

```text
"Thằng này ngu"
→ 1
```

nhưng:

```text
"Dân vùng X toàn bọn lừa đảo"
→ 2
```

Vì trường hợp thứ hai nhắm vào nhóm người dựa trên đặc tính vùng miền.

## 10.4. Công kích nhóm theo hành vi vs. đặc tính nhóm

```text
"Mấy đứa gian lận thi cử"
→ 1
```

vì nhóm được xác định bằng hành vi.

```text
"Dân vùng X toàn bọn lừa đảo"
→ 2
```

vì nhóm được xác định bằng đặc tính vùng miền.

---

# 11. Quy tắc sử dụng CONTEXT

`CONTEXT` chỉ được dùng để hiểu CURRENT TEXT.

### Được phép

Dùng context để xác định:

- CURRENT TEXT đang nói về ai/cái gì.
- Đại từ hoặc cách nói ám chỉ đối tượng nào.
- Ý nghĩa của câu trong đoạn hội thoại.

### Không được phép

Không được:

- Gán nhãn cho CONTEXT.
- Lấy nội dung độc hại chỉ xuất hiện trong CONTEXT để gán nhãn CURRENT TEXT.
- Tự suy diễn nội dung không có trong CURRENT TEXT.
- Gán hate/offensive chỉ vì context có từ ngữ độc hại nếu CURRENT TEXT không thể hiện điều đó.

Nguyên tắc:

> **CURRENT TEXT là nguồn quyết định nhãn; CONTEXT chỉ là thông tin hỗ trợ diễn giải.**

---

# 12. Quy tắc cuối cùng cho hệ thống gán nhãn

Với mỗi CURRENT TEXT:

```text
Bước 1:
Có kích động/đe dọa bạo lực?
    Có → 2
    Không → tiếp tục

Bước 2:
Có miệt thị/thù ghét nhóm dựa trên đặc tính nhóm?
    Có → 2
    Không → tiếp tục

Bước 3:
Có xúc phạm/công kích cá nhân?
    Có → 1
    Không → tiếp tục

Bước 4:
Có công kích nhóm nhỏ dựa trên hành vi/ngữ cảnh?
    Có → 1
    Không → tiếp tục

Bước 5:
Có quấy rối/gạ gẫm tình dục hoặc objectification cá nhân?
    Có → 1
    Không → tiếp tục

Bước 6:
Có mỉa mai/châm biếm công kích cá nhân?
    Có → 1
    Không → tiếp tục

Bước 7:
Có từ tục trần trụi/viết đầy đủ?
    Có → 1
    Không → tiếp tục

Bước 8:
Nội dung còn lại
    → 0
```

**Kết quả cuối cùng phải là đúng một nhãn:**

```text
0 = clean
1 = offensive
2 = hate
```
