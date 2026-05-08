# 🎵 Audio Workflow Manager — Hướng Dẫn Cài Đặt

Ứng dụng giúp cắt, ghép và chuẩn bị file audio cho Suno AI, chạy trên trình duyệt web qua giao diện Gradio.

---

## Yêu Cầu Hệ Thống

| Thành phần | Phiên bản tối thiểu |
|------------|---------------------|
| Python | 3.9+ |
| ffmpeg | Bất kỳ bản stable |
| uv (package manager) | Mới nhất |

---

## 🍎 Cài Đặt trên macOS

### Bước 1 — Cài Homebrew (nếu chưa có)

Mở **Terminal** và chạy:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Bước 2 — Cài ffmpeg

```bash
brew install ffmpeg
```

Kiểm tra cài đặt thành công:

```bash
ffmpeg -version
```

### Bước 3 — Cài uv (Python package manager)

```bash
brew install uv
```

Hoặc dùng script chính thức:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Sau đó restart Terminal hoặc chạy:

```bash
source $HOME/.cargo/env
```

### Bước 4 — Tải source code

```bash
git clone <repository-url> suno-tool
cd suno-tool
```

Hoặc giải nén file ZIP vào thư mục bất kỳ, rồi `cd` vào đó.

### Bước 5 — Chạy ứng dụng

```bash
uv run audio_processor.py
```

`uv` sẽ tự động tạo virtual environment và cài đặt các thư viện (`gradio`, `pydub`, `yt-dlp`) trong lần đầu tiên.

### Bước 6 — Mở trình duyệt

Sau khi khởi động, Terminal sẽ hiển thị:

```
Running on local URL:  http://127.0.0.1:7860
```

Mở URL đó trong trình duyệt là xong ✅

---

## 🪟 Cài Đặt trên Windows

> **Dành cho người không quen terminal:** Dùng file `.bat` có sẵn trong thư mục project — chỉ cần nhấn đúp chuột!

### ⚡ Cách nhanh (khuyên dùng) — Dùng file .bat

| File | Dùng khi nào |
|------|-------------|
| `setup.bat` | **Chạy 1 lần duy nhất** khi cài lần đầu |
| `start.bat` | **Mỗi lần** muốn mở ứng dụng |

**Quy trình:**
1. Chuột phải vào `setup.bat` → **Run as administrator**
2. Làm theo hướng dẫn trên màn hình (tự động cài ffmpeg, uv, thư viện)
3. Sau khi setup xong: nhấn đúp vào `start.bat` để dùng
4. Trình duyệt sẽ **tự động mở** giao diện ứng dụng

> ⚠️ Giữ cửa sổ đen (terminal) mở khi đang dùng. Đóng cửa sổ đó = tắt app.

---

### 🔧 Cách thủ công (nếu .bat không hoạt động)

### Bước 1 — Cài Python

1. Tải Python tại [python.org/downloads](https://www.python.org/downloads/)
2. Chạy installer, **tích vào ô "Add Python to PATH"** trước khi nhấn Install

Kiểm tra:

```cmd
python --version
```

### Bước 2 — Cài ffmpeg

**Cách 1 — Dùng winget (Windows 10/11, khuyên dùng):**

Mở **Command Prompt** hoặc **PowerShell** với quyền Administrator:

```powershell
winget install Gyan.FFmpeg
```

**Cách 2 — Cài thủ công:**

1. Tải ffmpeg tại [ffmpeg.org/download.html](https://ffmpeg.org/download.html) → chọn **Windows builds by BtbN**
2. Giải nén, ví dụ vào `C:\ffmpeg`
3. Thêm `C:\ffmpeg\bin` vào **System PATH**:
   - Tìm kiếm "Environment Variables" → Edit the system environment variables
   - Chọn `Path` → Edit → New → nhập `C:\ffmpeg\bin`
   - Nhấn OK và **restart Command Prompt**

Kiểm tra:

```cmd
ffmpeg -version
```

### Bước 3 — Cài uv

Mở **PowerShell** với quyền Administrator:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Sau đó **đóng và mở lại** PowerShell. Kiểm tra:

```cmd
uv --version
```

### Bước 4 — Tải source code

```cmd
git clone <repository-url> suno-tool
cd suno-tool
```

Hoặc giải nén ZIP vào thư mục, rồi mở Command Prompt tại thư mục đó.

### Bước 5 — Chạy ứng dụng

```cmd
uv run audio_processor.py
```

### Bước 6 — Mở trình duyệt

Truy cập địa chỉ hiện ra trong terminal:

```
Running on local URL:  http://127.0.0.1:7860
```

---

## 📁 Cấu Trúc Thư Mục

```
suno-tool/
├── audio_processor.py   # File chạy chính
├── download.py          # Script tải audio
├── requirements.txt     # Danh sách thư viện
├── downloads/           # Đặt file audio gốc vào đây
├── suno_ready/          # File đã cắt, sẵn sàng cho Suno
└── final_merged/        # File đã ghép hoàn chỉnh
```

---

## ⚙️ Workflow Sử Dụng

```
1. Đặt file audio gốc vào thư mục downloads/
        ↓
2. Tab "1. Chuẩn bị file cho Suno"
   → Upload file → Chọn số giây lấy cuối → "Tạo file cho Suno"
   → File lưu vào suno_ready/
        ↓
3. Upload file suno_ready/ lên Suno AI → Tải file Suno về
        ↓
4. Tab "2. Nối File (Overlay)"
   → Track trên: file gốc (tự động từ downloads/)
   → Track dưới: file từ Suno
   → Chỉnh slider giao thoa → "Nối file và Xuất WAV"
   → File lưu vào final_merged/
```

---

## 🔧 Xử Lý Sự Cố

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `FileNotFoundError: ffmpeg` | ffmpeg chưa cài hoặc chưa vào PATH | Cài lại ffmpeg, restart terminal |
| `ModuleNotFoundError: gradio` | uv chưa cài thư viện | Chạy lại `uv run audio_processor.py` |
| Port 7860 bị chiếm | App đang chạy ở tab khác | Đóng các instance cũ hoặc truy cập URL đang chạy |
| File không đọc được | Định dạng không hỗ trợ | Dùng wav, mp3, m4a, flac, ogg |

---

## 📦 Cài Thủ Công (không dùng uv)

Nếu muốn dùng `pip` thông thường:

```bash
python -m venv .venv

# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
python audio_processor.py
```
