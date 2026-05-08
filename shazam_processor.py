import asyncio
import os
import json
from playwright.async_api import async_playwright
from shazamio import Shazam

# Cấu hình thư mục và file
QUEUE_FILE = 'queue.txt'
READY_FOLDER = 'shazam_ready'
RESULT_FOLDER = 'original_manager'
RESULT_FILE = os.path.join(RESULT_FOLDER, 'results.json')

async def download_audio_playwright(claim_id):
    """Giả lập trình duyệt, bắt link nhạc và chống treo trang"""
    url = f"https://www.tiktok.com/music/-{claim_id}"
    file_path = os.path.join(READY_FOLDER, f"{claim_id}.mp3")
    
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
            # Đã sửa lỗi treo: Đổi thành domcontentloaded và giảm timeout xuống 15 giây
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            # Cho trang thở 2 giây để các file nhạc chạy ngầm kịp load
            await page.wait_for_timeout(2000)

            if not media_url:
                play_btn = page.locator('[data-e2e="music-play-icon"]').first
                if await play_btn.is_visible():
                    print(f"  -> Chưa có preload, tiến hành click nút Play...")
                    await play_btn.click()
                    await page.wait_for_timeout(4000) 
                else:
                    print(f"  [!] Lỗi: Không tìm thấy nút Play. Có thể link hỏng.")
        except Exception as e:
            # Dù bị lỗi timeout trang, ta vẫn cứ chạy tiếp nếu đã bắt được media_url
            print(f"  [*] Cảnh báo tải trang: Quá thời gian chờ (Timeout), nhưng vẫn tiếp tục xử lý...")
        
        # Tiến hành lưu file
        if media_url:
            print(f"  -> Đã bắt được Audio, đang lưu file...")
            try:
                res = await context.request.get(
                    media_url, 
                    headers={"Referer": "https://www.tiktok.com/"}
                )
                if res.ok:
                    body = await res.body()
                    with open(file_path, 'wb') as f:
                        f.write(body)
                    await browser.close()
                    return file_path
                else:
                    print(f"  [!] Tải file thất bại (Mã lỗi {res.status})")
            except Exception as e:
                print(f"  [!] Lỗi quá trình ghi file: {e}")
        else:
            print("  [!] Lỗi: Không bắt được link âm thanh nào (Có thể bài hát đã bị xóa bản quyền).")
            
        await browser.close()
            
    return None

async def identify_song(file_path):
    """Sử dụng Shazam để nhận diện file âm thanh"""
    shazam = Shazam()
    try:
        out = await shazam.recognize(file_path)
        if out and 'track' in out:
            track = out['track']
            return {
                "title": track.get('title', 'Không xác định'),
                "artist": track.get('subtitle', 'Không xác định'),
                "image": track.get('images', {}).get('coverart', ''),
                "shazam_url": track.get('url', '')
            }
    except Exception as e:
        print(f"  [!] Lỗi Shazam: {e}")
    return None

async def main():
    os.makedirs(READY_FOLDER, exist_ok=True)
    os.makedirs(RESULT_FOLDER, exist_ok=True) 
    
    if not os.path.exists(QUEUE_FILE):
        open(QUEUE_FILE, 'w', encoding='utf-8').close()
        print(f"Đã tạo file {QUEUE_FILE}.")
        return

    # --- ĐÃ NÂNG CẤP: Đọc và tách Tên giả + ID ---
    queue_data = []
    with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Cắt dòng từ phải sang trái (lấy cụm cuối cùng làm ID)
            parts = line.rsplit(maxsplit=1)
            if len(parts) == 2:
                queue_data.append({"fake_name": parts[0], "claim_id": parts[1]})
            elif len(parts) == 1:
                # Nếu dòng chỉ có ID (không có tên giả)
                queue_data.append({"fake_name": "Không có", "claim_id": parts[0]})

    if not queue_data:
        print(f"File {QUEUE_FILE} đang trống.")
        return

    results = []
    if os.path.exists(RESULT_FILE):
        try:
            with open(RESULT_FILE, 'r', encoding='utf-8') as f:
                results = json.load(f)
        except json.JSONDecodeError:
            pass
            
    existing_ids = {item['claim_id'] for item in results}

    print(f"Bắt đầu xử lý {len(queue_data)} ID...\n{'-'*40}")
    
    for item in queue_data:
        claim_id = item['claim_id']
        fake_name = item['fake_name']

        if claim_id in existing_ids:
            print(f"[*] Bỏ qua ID {claim_id} (Đã có kết quả)")
            continue

        print(f"[*] Đang xử lý: {fake_name} (ID: {claim_id})")
        
        file_path = await download_audio_playwright(claim_id)
        
        if file_path and os.path.exists(file_path):
            info = await identify_song(file_path)
            
            if info:
                info['claim_id'] = claim_id
                info['fake_name'] = fake_name # Lưu thêm trường Tên giả
                info['tiktok_url'] = f"https://www.tiktok.com/music/-{claim_id}"
                results.append(info)
                print(f"  -> Nhận diện: {info['title']} - {info['artist']}")
            else:
                print("  -> Thất bại: Shazam không nhận diện được.")
            
            try:
                os.remove(file_path)
            except Exception:
                pass
        
        # Lưu kết quả
        with open(RESULT_FILE, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=4)

    print(f"\n{'-'*40}\nHoàn thành! Kết quả cập nhật vào {RESULT_FILE}")

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
