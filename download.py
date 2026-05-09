import asyncio
import os
import re
import subprocess
import yt_dlp
from playwright.async_api import async_playwright

def get_tiktok_music_id(url):
    match = re.search(r'-(\d+)(?:\?.*)?$', url)
    if match: return match.group(1)
    match = re.search(r'\/music\/[^\/]+-(\d+)(?:\?.*)?$', url)
    if match: return match.group(1)
    return None

async def download_tiktok_music(url, output_folder):
    item_id = get_tiktok_music_id(url)
    if not item_id:
        print(f"Không lấy được ID từ {url}")
        return False
        
    temp_file_path = os.path.join(output_folder, f"{item_id}_temp.mp3")
    final_file_path = os.path.join(output_folder, f"{item_id}.wav")

    if os.path.exists(final_file_path):
        print(f"File {final_file_path} đã tồn tại, bỏ qua.")
        return True

    success = False
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        media_url = None

        async def handle_response(response):
            nonlocal media_url
            if media_url: return 
            
            if response.request.resource_type in ["media", "fetch", "xhr"]:
                if "v16-webapp" in response.url or "bytecdn" in response.url or "tiktokcdn" in response.url:
                    content_type = response.headers.get("content-type", "")
                    if "audio" in content_type or "video" in content_type:
                        media_url = response.url

        page.on("response", handle_response)

        try:
            print("  -> Đang mở trang và kiểm tra dữ liệu mạng...")
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(2000)

            if not media_url:
                play_btn = page.locator('[data-e2e="music-play-icon"]').first
                if await play_btn.is_visible():
                    print(f"  -> Chưa có preload, tiến hành click nút Play...")
                    await play_btn.click()
                    await page.wait_for_timeout(4000) 
                else:
                    print(f"  [!] Lỗi: Không tìm thấy nút Play.")
        except Exception as e:
            print(f"  [*] Cảnh báo tải trang (nhưng vẫn tiếp tục xử lý)...")
        
        if media_url:
            print(f"  -> Đã bắt được Audio, đang lưu file...")
            try:
                res = await context.request.get(
                    media_url, 
                    headers={"Referer": "https://www.tiktok.com/"}
                )
                if res.ok:
                    body = await res.body()
                    with open(temp_file_path, 'wb') as f:
                        f.write(body)
                    
                    print(f"  -> Đang chuyển đổi sang wav...")
                    subprocess.run(['ffmpeg', '-y', '-i', temp_file_path, final_file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                    print(f"  -> Đã lưu thành công: {final_file_path}")
                    success = True
                else:
                    print(f"  [!] Tải file thất bại (Mã lỗi {res.status})")
            except Exception as e:
                print(f"  [!] Lỗi quá trình ghi file: {e}")
        else:
            print("  [!] Lỗi: Không bắt được link âm thanh nào.")
            
        await browser.close()
    return success

def download_with_ytdlp(url, output_folder):
    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
        "outtmpl": f"{output_folder}/%(id)s.%(ext)s",
        "quiet": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([url])
            return True
        except Exception as e:
            print(f"Lỗi khi tải {url} bằng yt-dlp: {e}")
            return False

async def download_wav_from_queue(file_path):
    output_folder = "downloads"

    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"Đã tạo thư mục: {output_folder}")

    if not os.path.exists(file_path):
        print(f"Lỗi: Không tìm thấy file {file_path}")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        urls = [line.strip() for line in f if line.strip()]

    if not urls:
        print("Danh sách hàng đợi trống.")
        return

    print(f"Bắt đầu tải {len(urls)} file vào thư mục '{output_folder}'...")

    for index, url in enumerate(urls, 1):
        print(f"\n[{index}/{len(urls)}] Đang xử lý: {url}")
        if "/music/" in url:
            await download_tiktok_music(url, output_folder)
        else:
            download_with_ytdlp(url, output_folder)

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(download_wav_from_queue("queue.txt"))
