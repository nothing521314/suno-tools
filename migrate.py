import json
import os

# Đường dẫn file
QUEUE_FILE = 'queue.txt'
RESULT_FOLDER = 'original_manager'
RESULT_FILE = os.path.join(RESULT_FOLDER, 'results.json')

def migrate_fake_names():
    print("Bắt đầu đồng bộ Tên giả vào dữ liệu cũ...")

    # 1. Đọc queue.txt và tạo từ điển ánh xạ (Mapping) { "ID": "Tên giả" }
    mapping = {}
    if not os.path.exists(QUEUE_FILE):
        print(f"[!] Lỗi: Không tìm thấy file {QUEUE_FILE}.")
        return

    with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            parts = line.rsplit(maxsplit=1)
            if len(parts) == 2:
                mapping[parts[1]] = parts[0]
            elif len(parts) == 1:
                mapping[parts[0]] = "Không có"

    print(f"-> Đã tải {len(mapping)} ID từ queue.txt.")

    # 2. Đọc file results.json hiện tại
    if not os.path.exists(RESULT_FILE):
        print(f"[!] Lỗi: Không tìm thấy file {RESULT_FILE}.")
        return

    try:
        with open(RESULT_FILE, 'r', encoding='utf-8') as f:
            results = json.load(f)
    except json.JSONDecodeError:
        print("[!] Lỗi: File results.json bị hỏng định dạng.")
        return

    # 3. Tiến hành cập nhật
    updated_count = 0
    for item in results:
        claim_id = item.get('claim_id')
        
        # Nếu ID có trong queue.txt, lấy tên giả tương ứng
        if claim_id in mapping:
            # Chỉ đếm những dòng chưa có hoặc tên bị sai lệch
            if item.get('fake_name') != mapping[claim_id]:
                item['fake_name'] = mapping[claim_id]
                updated_count += 1
        else:
            # Nếu trong json có ID nhưng queue.txt đã xóa mất thì để mặc định
            if 'fake_name' not in item:
                item['fake_name'] = "Không có"
                updated_count += 1

    # 4. Ghi đè lại file JSON
    with open(RESULT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=4)

    print(f"-> HOÀN THÀNH: Đã cập nhật Tên giả cho {updated_count} bài hát trong results.json!")

if __name__ == "__main__":
    migrate_fake_names()