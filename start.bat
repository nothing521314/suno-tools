@echo off
chcp 65001 >nul
title Audio Workflow Manager
color 0B

echo.
echo  ============================================================
echo   🎵  AUDIO WORKFLOW MANAGER — ĐANG KHỞI ĐỘNG...
echo  ============================================================
echo.

:: Reload PATH để nhận uv/ffmpeg nếu vừa cài
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:: ============================================================
:: Kiểm tra nhanh các thành phần
:: ============================================================
echo  Đang kiểm tra môi trường...
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Chưa cài Python! Hãy chạy setup.bat trước.
    echo.
    pause
    exit /b 1
)

uv --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Chưa cài uv! Hãy chạy setup.bat trước.
    echo.
    pause
    exit /b 1
)

ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠️  Không tìm thấy ffmpeg trong PATH.
    echo     Có thể cần khởi động lại máy sau khi cài.
    echo     Ứng dụng vẫn thử khởi động, nhưng có thể lỗi khi xử lý file.
    echo.
)

:: ============================================================
:: Khởi động ứng dụng
:: ============================================================
echo  ✅ Mọi thứ sẵn sàng! Đang khởi động ứng dụng...
echo.
echo  ──────────────────────────────────────────────────────────
echo   Đừng đóng cửa sổ này khi đang dùng ứng dụng!
echo   Để tắt: nhấn Ctrl+C hoặc đóng cửa sổ này.
echo  ──────────────────────────────────────────────────────────
echo.

:: Đợi 3 giây rồi tự mở trình duyệt
echo  Trình duyệt sẽ tự mở sau vài giây...
echo.

:: Mở trình duyệt sau 5 giây (chạy ngầm)
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://127.0.0.1:7860"

:: Chạy ứng dụng
uv run audio_processor.py

:: Nếu ứng dụng thoát (lỗi hoặc dừng thủ công)
echo.
echo  ──────────────────────────────────────────────────────────
echo   Ứng dụng đã dừng.
echo  ──────────────────────────────────────────────────────────
echo.
pause
