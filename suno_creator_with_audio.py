import json
import asyncio
import os
import re
import shutil
import httpx
import time
from datetime import datetime
from pydub import AudioSegment
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

# ─── Config ───────────────────────────────────────────────────────────────────
DOWNLOADS_DIR = "downloads"
OUTPUT_DIR = "output_audio"
FINAL_DIR = "final_merged"
TEMP_TRIM_DIR = os.path.join("suno_ready", "_temp_trim")
AUDIO_DATA_JSON = os.path.join("audio-manager", "audio_data.json")
STATUS_JSON = "generation_status.json"
TODO_FILE = "Todo.txt"
TRIM_DURATIONS = [5.0, 4.0, 3.5, 3.0, 2.5, 2.0]
PREPROCESS_MAX_SEC = 12.0  # Thời gian cắt tối đa cho file gốc khi upload (giây)

for d in [OUTPUT_DIR, FINAL_DIR, TEMP_TRIM_DIR]:
    os.makedirs(d, exist_ok=True)

# ─── Helpers ──────────────────────────────────────────────────────────────────


def load_todo_ids() -> list:
    if not os.path.exists(TODO_FILE):
        return []
    with open(TODO_FILE, "r", encoding="utf-8") as f:
        return [l.strip() for l in f if l.strip()]


def load_audio_data() -> dict:
    if not os.path.exists(AUDIO_DATA_JSON):
        return {}
    with open(AUDIO_DATA_JSON, "r", encoding="utf-8") as f:
        items = json.load(f)
    return {str(item["id"]): item for item in items}


def get_audio_path(audio_id: str) -> str | None:
    for ext in [".wav", ".mp3", ".m4a", ".flac", ".ogg"]:
        p = os.path.join(DOWNLOADS_DIR, f"{audio_id}{ext}")
        if os.path.exists(p):
            return p
    return None


def is_final_file_exists(audio_id, audio_data):
    item = audio_data.get(str(audio_id), {})
    title = item.get("title", audio_id)
    clean_title = "".join([c for c in title if c.isalnum() or c in (" ", "_")]).strip()
    output_path = os.path.join(FINAL_DIR, f"{clean_title}.wav")
    return os.path.exists(output_path)


def get_pending_status(audio_id):
    if not os.path.exists(STATUS_JSON):
        return "none"
    try:
        with open(STATUS_JSON, "r") as f:
            data = json.load(f)
            return data.get(str(audio_id), {}).get("status", "none")
    except:
        return "none"


def update_status(audio_id, status, details=None):
    log_file = STATUS_JSON
    data = {}
    if os.path.exists(log_file):
        try:
            with open(log_file, "r") as f:
                data = json.load(f)
        except:
            pass
    data[str(audio_id)] = {
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "details": details or "",
    }
    with open(log_file, "w") as f:
        json.dump(data, f, indent=4)


def prepare_bypass_audio(input_path: str, extract_sec: float, output_path: str):
    audio = AudioSegment.from_file(input_path)
    extract_ms = int(extract_sec * 1000)
    if extract_ms >= len(audio):
        return input_path
    extracted = audio[-extract_ms:]
    silence_ms = len(audio) - extract_ms
    silence_segment = AudioSegment.silent(duration=silence_ms)
    result_audio = silence_segment + extracted
    result_audio.export(output_path, format="wav")
    return output_path


def get_actual_end_ms(audio: AudioSegment, threshold_db=-50.0) -> int:
    """Tìm millisecond cuối cùng có âm thanh vượt ngưỡng threshold_db."""
    duration_ms = len(audio)
    # Kiểm tra ngược từ cuối file lên (mỗi bước 50ms cho nhanh)
    for ms in range(duration_ms, 0, -50):
        chunk = audio[max(0, ms - 100) : ms]
        if chunk.dBFS > threshold_db:
            return ms
    return duration_ms


def preprocess_original_audio(audio_id):
    path = get_audio_path(audio_id)
    if not path:
        return "none"
    try:
        audio = AudioSegment.from_file(path)
        max_ms = int(PREPROCESS_MAX_SEC * 1000)
        if len(audio) < 6000:
            return "too_short"
        if len(audio) > max_ms:
            audio[:max_ms].export(path, format=os.path.splitext(path)[1][1:] or "wav")
        return "ok"
    except:
        return "error"


async def ensure_advanced_mode(page):
    try:
        btn = page.locator('button:has-text("Advanced")').filter(visible=True)
        if await btn.count() > 0:
            is_active = await btn.get_attribute(
                "aria-selected"
            ) == "true" or "active" in (await btn.get_attribute("class") or "")
            if not is_active:
                await btn.click()
                await asyncio.sleep(2)
    except:
        pass


async def check_suno_errors(page):
    try:
        toasts = page.locator('.chakra-toast__inner, [role="status"]').filter(
            visible=True
        )
        count = await toasts.count()
        for i in range(count):
            toast = toasts.nth(i)
            text = await toast.text_content()
            if any(
                k in text.lower()
                for k in [
                    "matches existing work",
                    "copyright",
                    "moderation",
                    "failed to upload",
                    "too short",
                    "inappropriate",
                ]
            ):
                try:
                    await toast.locator('button[aria-label*="Dismiss"]').click()
                except:
                    pass
                return text.strip()
    except:
        pass
    return None


async def wait_for_captcha(page, timeout_sec=10):
    captcha_selectors = [
        'iframe[src*="cloudflare"]',
        'iframe[src*="turnstile"]',
        "#cf-turnstile-wrapper",
        'div:has-text("Verify you are human")',
        "text=/Verify you are human/i",
        '[class*="captcha"]',
        'div[id*="turnstile"]',
        ".cf-turnstile",
    ]
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        is_captcha_visible = False
        for selector in captcha_selectors:
            try:
                if await page.locator(selector).filter(visible=True).count() > 0:
                    is_captcha_visible = True
                    break
            except:
                pass
        if is_captcha_visible:
            print(
                "\n"
                + "!" * 60
                + "\n⚠️ PHÁT HIỆN CAPTCHA! Vui lòng giải CAPTCHA trên trình duyệt.\n"
                + "!" * 60
                + "\n"
            )
            while True:
                await asyncio.sleep(2)
                still_visible = False
                for selector in captcha_selectors:
                    try:
                        if (
                            await page.locator(selector).filter(visible=True).count()
                            > 0
                        ):
                            still_visible = True
                            break
                    except:
                        pass
                if not still_visible:
                    print("✅ CAPTCHA đã được giải. Tiếp tục...")
                    await asyncio.sleep(2)
                    return True
        await asyncio.sleep(0.5)
    return False


async def clear_workspace_filters(page):
    try:
        reset_btn = (
            page.locator('button:has-text("Reset filters")').filter(visible=True).first
        )
        if await reset_btn.count() > 0:
            await reset_btn.click()
            await asyncio.sleep(1)
    except:
        pass


async def safe_reload(page):
    try:
        print("   - Đang làm mới trang...")
        await page.reload(timeout=45000)
    except:
        print("   ⚠ Reload bị treo, đang chuyển hướng thủ công...")
        try:
            await page.goto("https://suno.com/create", timeout=60000)
        except:
            pass
    await asyncio.sleep(5)


async def get_clip_status_in_workspace(page, audio_id):
    try:
        si = page.locator('input[aria-label="Search clips"]').filter(visible=True).first
        await si.fill(audio_id)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2.5)
        clips = await page.locator(
            f'[data-testid="clip-row"][aria-label*="{audio_id}"]'
        ).all()
        status = "none"
        for clip in clips:
            text = await clip.text_content()
            if (
                "Full Song" in text and "Get Full Song" not in text
            ) or "Extend 1" in text:
                status = "full"
                break
            if "Upload" in text:
                status = "upload"
        await clear_workspace_filters(page)
        return status
    except:
        return "none"


# ─── Main Submitter Logic ─────────────────────────────────────────────────────


async def handle_upload_modals(page):
    for _ in range(60):
        await asyncio.sleep(1)
        err = await check_suno_errors(page)
        if err:
            return err
        btns = page.locator(
            'button:has-text("Continue"), button:has-text("Skip")'
        ).filter(visible=True)
        if await btns.count() > 0:
            await btns.first.click()
            await asyncio.sleep(1)
            break
    for _ in range(60):
        await asyncio.sleep(1)
        err = await check_suno_errors(page)
        if err:
            return err
        btns = page.locator(
            'button:has-text("Continue"), button:has-text("Skip")'
        ).filter(visible=True)
        if await btns.count() > 0:
            await btns.first.click()
            break
    await asyncio.sleep(2)
    progress = (
        page.locator('div:has(span:has-text("Clip"))')
        .filter(has=page.locator('button:has-text("Cancel")'))
        .first
    )
    try:
        await progress.wait_for(state="visible", timeout=5000)
        await progress.wait_for(state="hidden", timeout=90000)
    except:
        pass
    await asyncio.sleep(5)
    return None


async def is_audio_loaded_in_form(page, audio_id: str) -> bool:
    try:
        cond_btn = (
            page.locator('[aria-label^="Change condition type from"]')
            .filter(visible=True)
            .first
        )
        if await cond_btn.count() > 0:
            form_text = await page.locator("div:has(> canvas)").first.inner_text()
            if str(audio_id) in form_text:
                return True
            if (
                await page.locator(f"text=/{audio_id}/").filter(visible=True).count()
                > 0
            ):
                return True
        return False
    except:
        return False


async def submit_song(page, audio_id, item, audio_data):
    if is_final_file_exists(audio_id, audio_data):
        print(f"   ✓ ID {audio_id} đã hoàn tất. Skip.")
        update_status(audio_id, "SUCCESS")
        return
    st = get_pending_status(audio_id)
    if st in ["SUBMITTED", "GETTING_FULL", "SUCCESS"]:
        print(f"   ✓ ID {audio_id} đang được xử lý ({st}). Skip.")
        return
    workspace_status = await get_clip_status_in_workspace(page, audio_id)
    if workspace_status == "full":
        print(f"   ✓ ID {audio_id} đã có trong Workspace. Skip.")
        update_status(audio_id, "SUBMITTED")
        return
    audio_path = get_audio_path(audio_id)
    if not audio_path:
        return
    pre_res = preprocess_original_audio(audio_id)
    last_uploaded_path = audio_path
    if pre_res == "too_short":
        print(f"   ✘ Lỗi: Audio quá ngắn (< 6s). Skip.")
        update_status(
            audio_id,
            "ERROR",
            details="Audio is too short. Please upload a file of at least 6 seconds.",
        )
        return
    if workspace_status == "none":
        upload_success = False
        for trim_sec in [0] + TRIM_DURATIONS:
            current_path = audio_path
            if trim_sec > 0:
                temp_path = os.path.join(TEMP_TRIM_DIR, f"{audio_id}.wav")
                current_path = prepare_bypass_audio(audio_path, trim_sec, temp_path)
                await safe_reload(page)
                await ensure_advanced_mode(page)
            last_uploaded_path = current_path
            await page.locator('[aria-label*="Add audio"]').first.click()
            await asyncio.sleep(1)
            async with page.expect_file_chooser() as fc_info:
                await page.locator(
                    '[role="menuitem"]:has-text("Upload"), button:has-text("Upload")'
                ).filter(visible=True).first.click()
            await (await fc_info.value).set_files(current_path)
            err = await handle_upload_modals(page)
            if err:
                print(f"   ✘ Lỗi Suno: {err}")
                if any(
                    k in err.lower()
                    for k in ["too short", "inappropriate", "moderation"]
                ):
                    update_status(audio_id, "ERROR", details=err)
                    return
                continue
            if (
                await is_audio_loaded_in_form(page, audio_id)
                or await get_clip_status_in_workspace(page, audio_id) != "none"
            ):
                upload_success = True
                break
        if not upload_success:
            return
    if not await is_audio_loaded_in_form(page, audio_id):
        si = page.locator('input[aria-label="Search clips"]').filter(visible=True).first
        await si.fill(audio_id)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)
        row = (
            page.locator(f'[data-testid="clip-row"][aria-label*="{audio_id}"]')
            .filter(has_text="Upload")
            .first
        )
        await row.locator('button[aria-label*="Remix/Edit"]').first.click()
    extend_btn = page.locator('button:has-text("Extend")').filter(visible=True).first
    if await extend_btn.count() > 0:
        await extend_btn.click()
        await asyncio.sleep(1)
    await clear_workspace_filters(page)
    await asyncio.sleep(1)
    await ensure_advanced_mode(page)
    try:
        audio_file = AudioSegment.from_file(last_uploaded_path)
        actual_end_ms = get_actual_end_ms(audio_file)
        ext_sec = max(0, (actual_end_ms / 1000.0) - 0.2)
        ext_val = f"{int(ext_sec // 60):02d}:{ext_sec % 60:04.1f}"
        ext_input = (
            page.locator('span[contenteditable="true"]').filter(visible=True).first
        )
        if await ext_input.count() > 0:
            await ext_input.click()
            await page.keyboard.press("Meta+A")
            await page.keyboard.press("Backspace")
            await ext_input.type(ext_val, delay=10)
        title_input = (
            page.locator('input[placeholder*="Song Title"]').filter(visible=True).first
        )
        await title_input.fill(str(audio_id))
    except:
        pass
    l_area = page.locator('[data-testid="lyrics-textarea"]')
    await l_area.fill(item["lyrics"])
    s_area = (
        page.locator(
            '[data-testid*="styles-wrapper"] textarea, textarea[placeholder*="jam"]'
        )
        .filter(visible=True)
        .first
    )
    if not (await s_area.input_value()).strip():
        await s_area.fill(item["style"])

    create_btn = (
        page.locator('[data-testid="create-button"], button:has-text("Create")')
        .filter(visible=True)
        .last
    )
    await create_btn.click(force=True)
    asyncio.create_task(wait_for_captcha(page, timeout_sec=10))
    print("   - Đang đợi Suno xác nhận yêu cầu...")
    try:
        for _ in range(15):
            # Kiểm tra lỗi Moderation/Policy ngay trong lúc đợi loading
            err = await check_suno_errors(page)
            if err and any(k in err.lower() for k in ["inappropriate", "moderation"]):
                print(f"   ✘ Lỗi chính sách: {err}")
                update_status(audio_id, "ERROR", details=err)
                return

            is_disabled = (
                await create_btn.get_attribute("data-trigger-disabled") is not None
            )
            has_spinner = await create_btn.locator("svg.animate-spin").count() > 0
            if not is_disabled and not has_spinner:
                break
            await asyncio.sleep(2)
    except:
        pass
    await wait_for_captcha(page, timeout_sec=3)
    err = await check_suno_errors(page)
    if err:
        print(f"   ✘ Lỗi sau Create: {err}")
        if any(k in err.lower() for k in ["too short", "inappropriate", "moderation"]):
            update_status(audio_id, "ERROR", details=err)
            return
        return
    print(f"   ✓ Created {audio_id}.")
    update_status(audio_id, "SUBMITTED")
    print(f"   - Đợi 3s để Suno đồng bộ dữ liệu...")
    await asyncio.sleep(3)
    await safe_reload(page)
    await ensure_advanced_mode(page)


# ─── Core Loops ───────────────────────────────────────────────────────────────


async def submission_loop(page, todo_ids, audio_data):
    for idx, audio_id in enumerate(todo_ids):
        print(f"\n[Submitter] [{idx+1}/{len(todo_ids)}] ID: {audio_id}")
        item = audio_data.get(str(audio_id))
        if item:
            try:
                await submit_song(page, audio_id, item, audio_data)
            except Exception as e:
                print(f"   ✘ Lỗi Submit {audio_id}: {e}")
                await safe_reload(page)
                await ensure_advanced_mode(page)
        await asyncio.sleep(3)


async def listener_loop(page, todo_ids, audio_data):
    print("\n[Listener] Đang ở chế độ Polling 3 phút/lần.")
    processed_cids = set()
    while True:
        try:
            print(
                f"\n[Listener] [{datetime.now().strftime('%H:%M:%S')}] Đang quét Workspace..."
            )
            await safe_reload(page)
            await wait_for_captcha(page, timeout_sec=5)
            pending_ids = []
            if os.path.exists(STATUS_JSON):
                with open(STATUS_JSON, "r") as f:
                    data = json.load(f)
                    pending_ids = [
                        aid
                        for aid, info in data.items()
                        if info.get("status") in ["SUBMITTED", "GETTING_FULL"]
                    ]
            for mid in pending_ids:
                if is_final_file_exists(mid, audio_data):
                    update_status(mid, "SUCCESS")
                    continue
                print(f"   - Kiểm tra ID: {mid}...")
                await clear_workspace_filters(page)
                si = (
                    page.locator('input[aria-label="Search clips"]')
                    .filter(visible=True)
                    .first
                )
                await si.fill(mid)
                await page.keyboard.press("Enter")
                await asyncio.sleep(2.5)
                clips = await page.locator(
                    f'[data-testid="clip-row"][aria-label*="{mid}"]'
                ).all()
                for clip in clips:
                    text = await clip.text_content()
                    status = await clip.get_attribute("data-clip-status")
                    if status != "complete":
                        continue
                    cid = (
                        await clip.get_attribute("data-clip-id")
                        or (
                            await clip.locator('a[href*="/song/"]').first.get_attribute(
                                "href"
                            )
                            or ""
                        ).split("/")[-1]
                    )
                    if "Full Song" in text and "Get Full Song" not in text:
                        async with httpx.AsyncClient() as c:
                            r = await c.get(
                                f"https://cdn1.suno.ai/{cid}.mp3", timeout=30
                            )
                            if r.status_code == 200:
                                out_p = os.path.join(OUTPUT_DIR, f"{mid}.mp3")
                                with open(out_p, "wb") as f:
                                    f.write(r.content)
                                if auto_process_audio(mid, out_p, audio_data):
                                    update_status(mid, "SUCCESS")
                                    break
                    elif "Extend 1" in text and cid not in processed_cids:
                        dur_el = (
                            clip.locator(".clip-image-container div")
                            .filter(has_text=":")
                            .first
                        )
                        if await dur_el.count() > 0:
                            dur_sec = sum(
                                int(x) * 60**i
                                for i, x in enumerate(
                                    reversed((await dur_el.text_content()).split(":"))
                                )
                            )
                            if dur_sec >= 60:
                                await clip.hover()
                                await asyncio.sleep(1)
                                btn = (
                                    clip.locator("button")
                                    .filter(
                                        has_text=re.compile(r"Get\s*Full\s*Song", re.I)
                                    )
                                    .first
                                )
                                if await btn.count() > 0:
                                    await btn.click(force=True)
                                    await wait_for_captcha(page, timeout_sec=5)
                                    processed_cids.add(cid)
                                    update_status(mid, "GETTING_FULL")
                                    await asyncio.sleep(2)
                                    break
            await asyncio.sleep(180)
        except Exception as e:
            print(f"   ⚠ [Listener] Lỗi chu kỳ: {e}")
            await asyncio.sleep(10)


def auto_process_audio(audio_id, suno_path, audio_data):
    try:
        path_t = get_audio_path(audio_id)
        audio_t = AudioSegment.from_file(path_t)
        audio_b = AudioSegment.from_file(suno_path)
        start_ms = 0
        for ms in range(0, min(20000, len(audio_b)), 10):
            if audio_b[ms : ms + 10].dBFS > -40.0:
                start_ms = ms
                break
        merge_time_ms = start_ms
        crossfade_ms = 1000
        top_faded = audio_t.fade_out(crossfade_ms)
        bottom_active = audio_b[merge_time_ms:]
        if audio_t.dBFS != float("-inf") and bottom_active.dBFS != float("-inf"):
            gain_adjustment = audio_t.dBFS - bottom_active.dBFS
            if abs(gain_adjustment) > 2:
                bottom_active = bottom_active + gain_adjustment
        bottom_final = AudioSegment.silent(
            duration=merge_time_ms
        ) + bottom_active.fade_in(crossfade_ms)
        final_audio = bottom_final.overlay(top_faded)
        item = audio_data.get(str(audio_id), {})
        title = item.get("title", audio_id)
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "_")).strip()
        final_audio.export(os.path.join(FINAL_DIR, f"{safe_title}.wav"), format="wav")
        return True
    except:
        return False


async def main():
    async with async_playwright() as p:
        user_data_dir = os.path.join(os.getcwd(), "suno_session")
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            channel="chrome",
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
            viewport={"width": 1440, "height": 900},
            args=["--disable-blink-features=AutomationControlled", "--start-maximized"],
            ignore_default_args=["--enable-automation"],
        )
        page_s = context.pages[0]
        page_m = await context.new_page()
        for pg in [page_s, page_m]:
            await Stealth().apply_stealth_async(pg)
            await pg.goto("https://suno.com/create")
        await page_s.wait_for_selector('button:has-text("Create")', timeout=0)
        await ensure_advanced_mode(page_s)
        todo = load_todo_ids()
        data = load_audio_data()
        await asyncio.gather(
            submission_loop(page_s, todo, data), listener_loop(page_m, todo, data)
        )


if __name__ == "__main__":
    asyncio.run(main())
