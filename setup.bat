
@echo off
chcp 65001 >nul
title Audio Workflow Manager - Cai Dat Lan Dau
color 0A

echo.
echo  ============================================================
echo   🎵  AUDIO WORKFLOW MANAGER - CÀI ĐẶT LẦN ĐẦU
echo  ============================================================
echo.
echo  Script này sẽ tự động cài đặt mọi thứ cần thiết.
echo  Vui lòng không đóng cửa sổ này trong quá trình cài đặt.
echo.
pause

:: ============================================================
:: BƯỚC 1: Kiểm tra Python
:: ============================================================
echo.
echo  [1/4] Đang kiểm tra Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Chưa cài Python!
    echo.
    echo  Đang mở trang tải Python...
    echo  Hãy tải và cài đặt Python, nhớ TICK vào ô "Add Python to PATH"
    echo  Sau khi cài xong, chạy lại file setup.bat này.
    echo.
    start https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo  ✅ Đã có %%i

:: ============================================================
:: BƯỚC 2: Cài uv
:: ============================================================
echo.
echo  [2/4] Đang kiểm tra uv...
uv --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ⏳ Chưa có uv, đang cài đặt...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    if %errorlevel% neq 0 (
        echo.
        echo  ❌ Không thể cài uv tự động.
        echo  Hãy chạy lại file này với quyền Administrator:
        echo  Chuột phải vào setup.bat -^> "Run as administrator"
        pause
        exit /b 1
    )
    :: Reload PATH để nhận uv vừa cài
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
for /f "tokens=*" %%i in ('uv --version 2^>^&1') do echo  ✅ Đã có %%i

:: ============================================================
:: BƯỚC 3: Cài ffmpeg
:: ============================================================
echo.
echo  [3/4] Đang kiểm tra ffmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ⏳ Chưa có ffmpeg, đang cài đặt qua winget...
    winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  ⚠️  Không thể cài ffmpeg tự động qua winget.
        echo.
        echo  Hãy cài thủ công theo hướng dẫn trong INSTALL.md
        echo  hoặc tải tại: https://www.gyan.dev/ffmpeg/builds/
        echo.
        echo  Sau khi cài xong, chạy lại setup.bat.
        start https://www.gyan.dev/ffmpeg/builds/
        pause
        exit /b 1
    )
    echo  ✅ Đã cài ffmpeg thành công!
    echo.
    echo  ⚠️  Cần KHỞI ĐỘNG LẠI máy tính để ffmpeg hoạt động.
    echo      Sau khi khởi động lại, hãy chạy lại setup.bat để hoàn tất.
    echo.
    pause
    exit /b 0
) else (
    echo  ✅ Đã có ffmpeg
)

:: ============================================================
:: BƯỚC 4: Cài thư viện Python
:: ============================================================
echo.
echo  [4/4] Đang cài thư viện Python (gradio, pydub, yt-dlp)...
echo  Lần đầu có thể mất vài phút, vui lòng chờ...
echo.
uv venv
uv pip install -r requirements.txt
if %errorlevel% neq 0 (
    uv run python -c "import gradio, pydub" >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  ❌ Lỗi cài thư viện. Thử chạy lại với quyền Administrator.
        pause
        exit /b 1
    )
)
echo  ✅ Đã cài xong tất cả thư viện!

:: ============================================================
:: HOÀN THÀNH
:: ============================================================
echo.
echo  ============================================================
echo   ✅  CÀI ĐẶT HOÀN TẤT!
echo  ============================================================
echo.
echo  Từ bây giờ, mỗi lần muốn dùng hãy nhấn đúp vào:
echo.
echo      ▶  start.bat
echo.
echo  Bạn có muốn khởi động ứng dụng ngay bây giờ không?
echo.
choice /c YN /m "  Nhấn Y để mở ứng dụng, N để thoát"
if %errorlevel% equ 1 (
    call start.bat
)
exit /b 0
