import json
import asyncio
import os
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

async def create_songs(limit=10):
    # Load lyrics data
    lyrics_path = 'lyrics.json'
    if not os.path.exists(lyrics_path):
        print(f"Error: {lyrics_path} not found.")
        return

    with open(lyrics_path, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    async with async_playwright() as p:
        user_data_dir = os.path.join(os.getcwd(), "suno_session")
        
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            channel="chrome", 
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized"
            ],
            ignore_default_args=["--enable-automation"]
        )
        
        page = context.pages[0]
        stealth_obj = Stealth()
        await stealth_obj.apply_stealth_async(page)
        
        await page.goto("https://suno.com/create")
        
        print("\n" + "="*50)
        print("HƯỚNG DẪN:")
        print("1. Đăng nhập vào Suno.")
        print("2. Đảm bảo Workspace 'Sâu 2' được chọn (nếu cần).")
        print("3. Script sẽ tự động điền form và xác nhận bài hát đã được tạo.")
        print("="*50 + "\n")
        
        # Chờ đăng nhập
        try:
            await page.wait_for_selector('button:has-text("Create")', timeout=0)
        except Exception as e:
            print(f"Lỗi khi chờ đăng nhập: {e}")
            return

        # Tự động chuyển sang Advanced mode
        print("Đang kiểm tra tab Advanced...")
        try:
            advanced_btn = page.locator('button:has-text("Advanced")')
            await advanced_btn.wait_for(state="visible", timeout=5000)
            is_active = await advanced_btn.get_attribute("aria-selected") == "true" or "active" in (await advanced_btn.get_attribute("class") or "")
            if not is_active:
                await advanced_btn.click()
                print("✓ Đã chuyển sang tab Advanced.")
                await asyncio.sleep(2)
        except Exception:
            print("Không tìm thấy nút Advanced hoặc đã được chọn sẵn.")

        for i, song in enumerate(songs[:limit]):
            print(f"[{i+1}/{limit}] Đang xử lý: {song['title']}")
            
            try:
                # 1. Điền Lyrics
                lyrics_area = page.locator('[data-testid="lyrics-textarea"]')
                await lyrics_area.wait_for(state="visible", timeout=10000)
                await lyrics_area.fill(song['lyrics'])
                
                # 2. Điền Style
                style_area = page.locator('[data-testid="create-form-styles-wrapper"] textarea')
                if await style_area.count() == 0:
                    style_area = page.locator('textarea[placeholder*="jam, chopped"]')
                
                await style_area.wait_for(state="visible", timeout=10000)
                await style_area.fill(song['style'])
                
                # 3. Điền Title
                title_input = page.locator('input[placeholder*="Song Title"]').filter(visible=True).first
                await title_input.wait_for(state="visible", timeout=10000)
                await title_input.fill(song['title'])
                
                # 4. Nhấn nút Create
                print("   - Đợi 2 giây để form ổn định...")
                await asyncio.sleep(2) 
                
                # Ưu tiên data-testid và đảm bảo nút đó đang hiển thị
                create_button = page.locator('[data-testid="create-button"]').filter(visible=True).first
                if await create_button.count() == 0:
                     create_button = page.locator('button:has-text("Create")').filter(visible=True).last
                
                try:
                    await create_button.scroll_into_view_if_needed(timeout=5000)
                except Exception:
                    pass 
                
                if await create_button.is_disabled():
                    print("   - Nút Create đang bị disable, đợi thêm 2 giây...")
                    await asyncio.sleep(2)

                # 4. Nhấn nút Create
                print("   - Đang nhấn Create...")
                await create_button.click(force=True, delay=100)
                
                # 5. Kiểm tra xác nhận bài hát và xử lý giới hạn (Spam/Limit)
                print(f"   - Đang chờ xác nhận bài '{song['title']}' xuất hiện trong Workspace...")
                
                success = False
                for retry_count in range(5): # Thử tối đa 5 lần nếu dính giới hạn
                    await asyncio.sleep(3)
                    
                    # Kiểm tra xem có thông báo "Generation in progress" không
                    limit_msg = page.locator('div:has-text("Generation in progress")').filter(visible=True)
                    if await limit_msg.count() > 0:
                        print(f"   ⚠ Thông báo: 'Generation in progress'. Đợi 60 giây để bài cũ render xong (Lần {retry_count+1})...")
                        await asyncio.sleep(60)
                        await create_button.click(force=True, delay=100)
                        continue

                    # Kiểm tra xem bài hát đã xuất hiện chưa
                    try:
                        confirmation_locator = page.locator('[data-testid="clip-row"]').filter(has_text=song['title']).first
                        await confirmation_locator.wait_for(state="visible", timeout=15000)
                        print(f"   ✓ Đã xác nhận: '{song['title']}' đã xuất hiện trong Workspace.")
                        success = True
                        break
                    except Exception:
                        # Nếu chưa thấy bài và cũng không thấy thông báo lỗi, có thể click chưa ăn, thử nhấn lại
                        print(f"   - Chưa thấy bài, đang thử nhấn Create lại...")
                        await create_button.click(force=True, delay=100)

                if not success:
                    print(f"   ⚠ Cảnh báo: Đã thử nhiều lần nhưng không thấy '{song['title']}' trong danh sách.")
                
                # Đợi một chút để hệ thống ổn định
                await asyncio.sleep(3) 
                
                # Tải lại trang để reset form cho bài tiếp theo
                await page.reload()
                await page.wait_for_selector('button:has-text("Create")', timeout=30000)
                
            except Exception as e:
                print(f"   ✘ Lỗi: {e}")
                await asyncio.sleep(10)
                continue

        await context.close()

if __name__ == "__main__":
    asyncio.run(create_songs(limit=750))
