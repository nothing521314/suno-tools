import os
import json
from acrcloud.recognizer import ACRCloudRecognizer

# Cấu hình ACRCloud được lấy từ file .env
ACR_CONFIG = {
    'host': os.getenv('ACR_HOST', 'identify-eu-west-1.acrcloud.com'),
    'access_key': os.getenv('ACR_ACCESS_KEY'),
    'access_secret': os.getenv('ACR_ACCESS_SECRET'),
    'debug': False,
    'timeout': 10 # seconds
}

def identify_song(file_path):
    """Sử dụng ACRCloud để nhận diện file âm thanh"""
    # Kiểm tra cấu hình
    if not ACR_CONFIG['access_key'] or ACR_CONFIG['access_key'] == 'YOUR_ACCESS_KEY':
        return None
        
    try:
        recognizer = ACRCloudRecognizer(ACR_CONFIG)
        # Nhận diện file (mặc định lấy 10-15s đầu tiên)
        result_str = recognizer.recognize_by_file(file_path, 0)
        result = json.loads(result_str)
        
        if result.get('status', {}).get('code') == 0:
            metadata = result.get('metadata', {})
            music_list = metadata.get('music', [])
            if music_list:
                music = music_list[0]
                return {
                    "title": music.get('title', 'Không xác định'),
                    "artist": music.get('artists', [{}])[0].get('name', 'Không xác định'),
                    "image": "", # ACRCloud ít khi trả về ảnh cover trực tiếp như Shazam
                    "shazam_url": "", # Có thể lấy link spotify/youtube nếu có trong metadata
                    "source": "ACRCloud"
                }
    except Exception as e:
        print(f"  [!] Lỗi ACRCloud: {e}")
    return None
