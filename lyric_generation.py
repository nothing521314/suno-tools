import os
import json
import time
import whisper

# --- CONFIGURATION ---
DOWNLOADS_DIR = "downloads"
JSON_DB_PATH = "audio-manager/audio_data.json"
REQUEST_FILE = "agent_requests.json"
RESPONSE_FILE = "agent_responses.json"

# Bảng ánh xạ mã ngôn ngữ sang tên đầy đủ
LANG_MAP = {
    "vi": "Vietnamese",
    "en": "English",
    "es": "Spanish",
    "pt": "Portuguese",
    "fr": "French",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "th": "Thai"
}

def detect_language(file_path, model):
    """Sử dụng Whisper để nhận diện ngôn ngữ của file audio"""
    try:
        # Load audio and pad/trim it to fit 30 seconds
        audio = whisper.load_audio(file_path)
        audio = whisper.pad_or_trim(audio)

        # Make log-Mel spectrogram and move to the same device as the model
        mel = whisper.log_mel_spectrogram(audio).to(model.device)

        # Detect the spoken language
        _, probs = model.detect_language(mel)
        lang_code = max(probs, key=probs.get)
        
        return LANG_MAP.get(lang_code, lang_code.capitalize())
    except Exception as e:
        print(f"\n⚠️ Lỗi nhận diện ngôn ngữ cho {file_path}: {e}")
        return "Unknown"

def process_bulk_metadata():
    # 1. Load database hiện tại
    if os.path.exists(JSON_DB_PATH):
        try:
            with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
                db_data = json.load(f)
        except json.JSONDecodeError:
            db_data = []
    else:
        db_data = []

    db_dict = {item["id"]: item for item in db_data}

    # 2. Quét các file audio chưa có metadata hoặc cần cập nhật
    if not os.path.exists(DOWNLOADS_DIR):
        print(f"❌ Thư mục {DOWNLOADS_DIR} không tồn tại.")
        return

    all_files = [f for f in os.listdir(DOWNLOADS_DIR) if f.endswith(".wav") or f.endswith(".mp3")]
    to_process_files = []
    for filename in all_files:
        # Extract ID from filename
        target_id = filename.split(".")[0].split("_")[0]
        
        needs_processing = False
        if target_id not in db_dict:
            needs_processing = True
        else:
            lyrics = db_dict[target_id].get("lyrics", "")
            # check lyrics is empty or less than 500 chars
            if lyrics is None or len(lyrics) < 500:
                needs_processing = True
                
        if needs_processing:
            to_process_files.append({"id": target_id, "file": filename})

    if not to_process_files:
        print("✅ Tất cả các file đã có metadata.")
        return

    print(f"🚀 Tìm thấy {len(to_process_files)} ID mới.")
    
    # 3. Tự động nhận diện ngôn ngữ bằng Whisper
    print("⏳ Đang khởi tạo bộ nhận diện ngôn ngữ AI (Whisper tiny)...")
    try:
        model = whisper.load_model("tiny")
    except Exception as e:
        print(f"❌ Không thể tải model Whisper. Vui lòng chạy 'pip install openai-whisper'. Lỗi: {e}")
        return
    
    final_requests = []
    for item in to_process_files:
        file_path = os.path.join(DOWNLOADS_DIR, item["file"])
        print(f"🎧 Đang phân tích ngôn ngữ: {item['file']}...", end=" ", flush=True)
        lang = detect_language(file_path, model)
        item["detected_lang"] = lang
        print(f"👉 {lang}")
        final_requests.append(item)

    # 4. Ghi yêu cầu ra file cầu nối
    with open(REQUEST_FILE, "w", encoding="utf-8") as f:
        json.dump(final_requests, f, indent=2, ensure_ascii=False)
    
    print(f"\n📝 Đã cập nhật danh sách kèm ngôn ngữ vào {REQUEST_FILE}")
    print(f"⏳ ĐANG CHỜ PHẢN HỒI TỪ AGENT (Antigravity)...")
    print(f"💡 (Hãy copy dữ liệu Agent cung cấp và lưu vào file {RESPONSE_FILE})")

    # 5. Vòng lặp chờ file response
    try:
        while not os.path.exists(RESPONSE_FILE):
            time.sleep(2)
        
        # 6. Đọc dữ liệu phản hồi và cập nhật
        print(f"📦 Đã nhận được phản hồi! Đang cập nhật database...")
        with open(RESPONSE_FILE, "r", encoding="utf-8") as f:
            responses = json.load(f)
        
        db_index_map = {item["id"]: idx for idx, item in enumerate(db_data)}
        new_ids_count = 0
        updated_ids_count = 0
        
        for entry in responses:
            entry_id = entry.get("id")
            if not entry_id:
                continue
                
            # Chuẩn hóa format: Nếu có key "metadata", lôi các trường bên trong ra ngoài
            normalized_entry = {"id": entry_id}
            
            if "metadata" in entry and isinstance(entry["metadata"], dict):
                meta = entry["metadata"]
                normalized_entry["title"] = meta.get("title", "")
                normalized_entry["lang"] = meta.get("lang", "")
                normalized_entry["style"] = meta.get("style", "")
                normalized_entry["lyrics"] = meta.get("lyrics", "")
            else:
                # Nếu đã là format phẳng
                normalized_entry["title"] = entry.get("title", "")
                normalized_entry["lang"] = entry.get("lang", "")
                normalized_entry["style"] = entry.get("style", "")
                normalized_entry["lyrics"] = entry.get("lyrics", "")

            if entry_id in db_index_map:
                db_data[db_index_map[entry_id]] = normalized_entry
                updated_ids_count += 1
            else:
                db_data.append(normalized_entry)
                db_index_map[entry_id] = len(db_data) - 1
                new_ids_count += 1
        
        # Lưu database
        with open(JSON_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db_data, f, indent=2, ensure_ascii=False)
        
        print(f"✨ Thành công! Đã thêm {new_ids_count} và cập nhật {updated_ids_count} metadata vào {JSON_DB_PATH}")
        
        # 7. Dọn dẹp
        if os.path.exists(REQUEST_FILE):
            os.remove(REQUEST_FILE)
        if os.path.exists(RESPONSE_FILE):
            os.remove(RESPONSE_FILE)
        print("🧹 Đã dọn dẹp các file cầu nối.")

    except KeyboardInterrupt:
        print("\n🛑 Đã dừng quá trình chờ.")
    except Exception as e:
        print(f"❌ Lỗi khi xử lý phản hồi: {e}")

if __name__ == "__main__":
    process_bulk_metadata()
