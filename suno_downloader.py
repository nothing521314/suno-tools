import os
import asyncio
import httpx
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def download_file(url, filename, client):
    if os.path.exists(filename):
        return False
    
    try:
        response = await client.get(url, timeout=30.0)
        if response.status_code == 200:
            with open(filename, 'wb') as f:
                f.write(response.content)
            return True
    except Exception as e:
        print(f"      ✘ Lỗi khi tải {filename}: {e}")
    return False

async def get_all_songs():
    downloads_dir = os.path.join(os.getcwd(), "downloads")
    if not os.path.exists(downloads_dir):
        os.makedirs(downloads_dir)

    async with async_playwright() as p:
        user_data_dir = os.path.join(os.getcwd(), "suno_session")
        
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.pages[0]
        await Stealth().apply_stealth_async(page)
        
        print("Đang mở Suno...")
        await page.goto("https://suno.com/create")
        
        print("Vui lòng đảm bảo bạn đã chọn đúng Workspace (như 'Sâu 2').")
        print("Đang quét danh sách bài hát (vui lòng chờ cuộn hết danh sách)...")
        
        # Đợi danh sách load
        await page.wait_for_selector('[data-testid="clip-row"]', timeout=30000)
        
        # Logic cuộn để load toàn bộ bài hát trong Workspace
        last_count = 0
        songs_data = {} # Dùng dict để tránh trùng lặp: {id: title}
        
        while True:
            # Lấy tất cả các hàng bài hát đang hiển thị
            rows = page.locator('[data-testid="clip-row"]')
            count = await rows.count()
            
            for i in range(count):
                row = rows.nth(i)
                title = await row.get_attribute("aria-label")
                link_elem = row.locator('a[href^="/song/"]')
                if await link_elem.count() > 0:
                    href = await link_elem.get_attribute("href")
                    clip_id = href.split('/')[-1]
                    if clip_id not in songs_data:
                        songs_data[clip_id] = title or "Unknown_Song"
            
            print(f"   - Đã tìm thấy {len(songs_data)} bài hát...")
            
            # Cuộn xuống cuối scroller của workspace
            scroller = page.locator('.clip-browser-list-scroller')
            if await scroller.count() > 0:
                await scroller.evaluate("el => el.scrollTop += 1000")
            else:
                await page.mouse.wheel(0, 1000)
                
            await asyncio.sleep(2) # Chờ load thêm bài mới
            
            if len(songs_data) == last_count:
                # Thử thêm một lần nữa cho chắc
                await asyncio.sleep(2)
                if len(songs_data) == last_count:
                    break
            last_count = len(songs_data)

        print(f"\n✓ Tìm thấy tổng cộng {len(songs_data)} bài hát. Bắt đầu tải...")
        
        async with httpx.AsyncClient() as client:
            success_count = 0
            for clip_id, title in songs_data.items():
                # Suno CDN URL format
                download_url = f"https://cdn1.suno.ai/{clip_id}.mp3"
                clean_title = "".join([c for c in title if c.isalnum() or c in (' ', '_')]).rstrip().replace(' ', '_')
                filename = os.path.join(downloads_dir, f"{clean_title}_{clip_id}.mp3")
                
                print(f"   - Đang tải: {title}...")
                if await download_file(download_url, filename, client):
                    success_count += 1
                else:
                    if os.path.exists(filename):
                         pass # Đã có rồi
                    else:
                         print(f"      ⚠ Bỏ qua hoặc lỗi tải bài: {title}")
            
        print(f"\n==================================================")
        print(f"HOÀN TẤT: Đã tải mới {success_count} bài vào thư mục 'downloads'.")
        print(f"Tổng số file hiện có: {len(os.listdir(downloads_dir))}")
        print(f"==================================================")
        
        await context.close()

if __name__ == "__main__":
    asyncio.run(get_all_songs())
