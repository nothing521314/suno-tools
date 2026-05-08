import yt_dlp
import os


def download_wav_from_queue(file_path):
    # 1. Tên thư mục đầu ra
    output_folder = "downloads"

    # 2. Tự động tạo thư mục nếu chưa có
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Đã tạo thư mục: {output_folder}")

    if not os.path.exists(file_path):
        print(f"Lỗi: Không tìm thấy file {file_path}")
        return

    # 3. Cấu hình yt-dlp
    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
        # Lưu vào folder outputs với tên là ID video
        "outtmpl": f"{output_folder}/%(id)s.%(ext)s",
        "quiet": False,
    }

    # Đọc danh sách URL
    with open(file_path, "r") as f:
        urls = [line.strip() for line in f if line.strip()]

    if not urls:
        print("Danh sách hàng đợi trống.")
        return

    print(f"Bắt đầu tải {len(urls)} file vào thư mục '{output_folder}'...")

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for index, url in enumerate(urls, 1):
            try:
                print(f"\n[{index}/{len(urls)}] Đang xử lý: {url}")
                ydl.download([url])
            except Exception as e:
                print(f"Lỗi khi tải {url}: {e}")


if __name__ == "__main__":
    download_wav_from_queue("queue.txt")
