import os
import requests
import json

# Lấy danh sách token từ .env, phân tách bằng dấu phẩy
tokens_str = os.getenv("AUDD_API_TOKENS", os.getenv("AUDD_API_TOKEN", ""))
AUDD_TOKENS = [t.strip() for t in tokens_str.split(",") if t.strip()]
AUDD_ENDPOINT = os.getenv("AUDD_ENDPOINT", "https://api.audd.io/")

# Biến để theo dõi token hiện tại
_current_token_index = 0


def identify_song(file_path):
    """Sử dụng AudD để nhận diện file âm thanh với cơ chế xoay vòng token"""
    global _current_token_index

    if not AUDD_TOKENS:
        return None

    # Thử các token bắt đầu từ token hiện tại
    for _ in range(len(AUDD_TOKENS)):
        token = AUDD_TOKENS[_current_token_index]
        if not token or token == "YOUR_API_TOKEN":
            _current_token_index = (_current_token_index + 1) % len(AUDD_TOKENS)
            continue

        try:
            data = {
                "api_token": token,
                "return": "apple_music,spotify",
            }

            with open(file_path, "rb") as f:
                files = {"file": f}
                response = requests.post(AUDD_ENDPOINT, data=data, files=files)

            result = response.json()

            # Kiểm tra xem có lỗi về giới hạn hay token không
            if result.get("status") == "error":
                error_info = result.get("error", {})
                error_code = error_info.get("error_code")
                # 900: Limit reached, 901: Invalid token
                if error_code in [900, 901]:
                    print(
                        f"  [!] Token AudD (index {_current_token_index}) lỗi: {error_info.get('error_message')}. Đang xoay token..."
                    )
                    _current_token_index = (_current_token_index + 1) % len(AUDD_TOKENS)
                    continue  # Thử token tiếp theo

            if result.get("status") == "success" and result.get("result"):
                item = result["result"]
                return {
                    "title": item.get("title", "Không xác định"),
                    "artist": item.get("artist", "Không xác định"),
                    "image": (
                        item.get("spotify", {})
                        .get("album", {})
                        .get("images", [{}])[0]
                        .get("url", "")
                        if item.get("spotify")
                        else ""
                    ),
                    "shazam_url": item.get("song_link", ""),
                    "source": "AudD",
                }

            # Nếu thành công nhưng không có kết quả, trả về None (không cần xoay token)
            return None

        except Exception as e:
            print(f"  [!] Lỗi AudD (Token index {_current_token_index}): {e}")
            _current_token_index = (_current_token_index + 1) % len(AUDD_TOKENS)

    return None
