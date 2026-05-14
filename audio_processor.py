import gradio as gr
from pydub import AudioSegment, effects
import os
import json

# Định nghĩa các thư mục
FOLDER_SUNO_PREP = "suno_ready"
FOLDER_FINAL = "final_merged"
FOLDER_DOWNLOADS = "downloads"

for folder in [FOLDER_SUNO_PREP, FOLDER_FINAL, FOLDER_DOWNLOADS]:
    os.makedirs(folder, exist_ok=True)

# --- ĐOẠN CSS KHẮC PHỤC LỖI GIAO DIỆN ---
custom_css = """
/* Tùy chỉnh toàn bộ thanh cuộn ngang/dọc trong UI */
::-webkit-scrollbar {
    height: 4px; /* Làm thanh cuộn ngang mỏng lại */
    width: 4px;
}
::-webkit-scrollbar-track {
    background: transparent; 
}
::-webkit-scrollbar-thumb {
    background-color: #a0a0a5; /* Màu xám tinh tế */
    border-radius: 8px;
}
::-webkit-scrollbar-thumb:hover {
    background-color: #808080;
}

/* Ép vùng chứa waveform của Gradio đẩy nội dung lên một chút để chừa chỗ cho thanh cuộn */
.audio-container {
    padding-bottom: 12px !important;
}

.timestamps {
    margin-top: 20px !important;
}
"""

def prepare_suno_file(audio_path, extract_sec, trim_end_sec):
    """Bước 1: Cắt audio và lưu vào thư mục suno_ready"""
    if not audio_path:
        return None, "Vui lòng tải lên file audio gốc."
    try:
        audio = AudioSegment.from_file(audio_path)
        duration_sec = len(audio) / 1000.0
        
        status_trim = ""
        # Nếu trim_end_sec nhỏ hơn độ dài hiện tại (có sai số nhỏ), tiến hành cắt
        if 0 < trim_end_sec < (duration_sec - 0.1):
            trim_end_ms = int(trim_end_sec * 1000)
            audio = audio[:trim_end_ms]
            
            # Lưu đè file temp của Gradio
            audio.export(audio_path, format="wav")
            
            # Kiểm tra và đè file trong thư mục downloads nếu có trùng tên
            original_filename = os.path.basename(audio_path)
            potential_path = os.path.join(FOLDER_DOWNLOADS, original_filename)
            if os.path.exists(potential_path):
                audio.export(potential_path, format="wav")
                status_trim = " (Đã đè file gốc tại downloads)"
            else:
                status_trim = " (Đã cắt file gốc)"

        original_full_name = os.path.basename(audio_path)
        file_name_no_ext = os.path.splitext(original_full_name)[0]
        output_filename = os.path.join(FOLDER_SUNO_PREP, f"{file_name_no_ext}.wav")

        extract_ms = int(extract_sec * 1000)
        
        if extract_ms >= len(audio):
            return None, f"❌ Lỗi: Thời gian cắt {extract_sec}s lớn hơn độ dài file hiện tại ({len(audio)/1000:.1f}s)."
            
        extracted = audio[-extract_ms:]
        silence_ms = len(audio) - extract_ms
        silence_segment = AudioSegment.silent(duration=silence_ms)
        
        result_audio = silence_segment + extracted
        # Normalize result for Suno upload
        result_audio = effects.normalize(result_audio, headroom=0.1)
        result_audio.export(output_filename, format="wav")
        
        return output_filename, f"✅ Thành công! File sẵn sàng cho Suno tại: {output_filename}{status_trim}"
    except Exception as e:
        return None, f"❌ Lỗi: {str(e)}"

def update_trim_slider_max(audio_path):
    """Cập nhật giá trị tối đa cho slider trim dựa trên độ dài audio"""
    if not audio_path:
        return gr.update(maximum=300, value=0)
    try:
        audio = AudioSegment.from_file(audio_path)
        duration = round(len(audio) / 1000.0, 1)
        return gr.update(maximum=duration, value=duration)
    except:
        return gr.update(maximum=300, value=0)

def update_ui_on_file_upload(bottom_path, top_path):
    """Xử lý Auto-fill và Force Update Slider vào điểm giữa"""
    top_update = gr.update()
    status_msg = "Đang quét file..."
    custom_name_update = gr.update()

    current_top = top_path
    
    if bottom_path:
        base_name = os.path.splitext(os.path.basename(bottom_path))[0]
        for ext in ['.wav', '.mp3', '.m4a', '.flac', '.ogg']:
            potential_path = os.path.join(FOLDER_DOWNLOADS, base_name + ext)
            if os.path.exists(potential_path):
                current_top = potential_path
                top_update = gr.update(value=current_top)
                break
                
        # Tìm title trong audio_data.json
        try:
            json_path = os.path.join("audio-manager", "audio_data.json")
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    audio_data = json.load(f)
                    for item in audio_data:
                        if item.get("id") == base_name:
                            title = item.get("title")
                            if title:
                                custom_name_update = gr.update(value=title)
                            break
        except Exception:
            pass

    if current_top and bottom_path:
        try:
            audio_t = AudioSegment.from_file(current_top)
            audio_b = AudioSegment.from_file(bottom_path)
            
            max_val = float(round(len(audio_t) / 1000.0, 1))
            
            trim_ms = 0
            while trim_ms < len(audio_b):
                if audio_b[trim_ms:trim_ms+10].dBFS > -40.0:
                    break
                trim_ms += 10
                
            min_val = float(round(trim_ms / 1000.0, 1))
            
            if min_val >= max_val:
                min_val = max(0.0, max_val - 1.0)
            
            mid_val = float(round((min_val + max_val) / 2.0, 1))
            
            slider_update = gr.Slider(
                minimum=min_val, 
                maximum=max_val, 
                value=mid_val, 
                step=0.1, 
                label="Giây bắt đầu giao thoa (Đã tự cân chỉnh)"
            )
            
            status_msg = f"⚙️ Đã khớp file gốc. Vùng an toàn: {min_val}s - {max_val}s. Điểm giữa: {mid_val}s."
            return top_update, slider_update, custom_name_update, status_msg
        except Exception as e:
            return top_update, gr.Slider(minimum=0, maximum=100, value=0), custom_name_update, f"❌ Lỗi: {str(e)}"

    return top_update, gr.update(), custom_name_update, "Vui lòng kiểm tra file trong folder downloads."

def merge_audios(audio_top_path, audio_bottom_path, merge_time_sec, crossfade_sec, custom_output_name):
    """Bước 2: Nối file và lưu vào thư mục final_merged"""
    if not audio_top_path or not audio_bottom_path:
        return None, "Thiếu file để nối."
        
    try:
        if custom_output_name and custom_output_name.strip():
            clean_name = custom_output_name.strip()
            if not clean_name.lower().endswith('.wav'):
                clean_name += '.wav'
            output_filename = os.path.join(FOLDER_FINAL, clean_name)
        else:
            original_full_name = os.path.basename(audio_top_path)
            file_name_no_ext = os.path.splitext(original_full_name)[0]
            output_filename = os.path.join(FOLDER_FINAL, f"{file_name_no_ext}_merged.wav")

        audio_top = AudioSegment.from_file(audio_top_path)
        audio_bottom = AudioSegment.from_file(audio_bottom_path)
        
        # Normalize both tracks to -0.1 dB for consistency before matching
        audio_top = effects.normalize(audio_top, headroom=0.1)
        audio_bottom = effects.normalize(audio_bottom, headroom=0.1)
        
        merge_time_ms = int(merge_time_sec * 1000)
        crossfade_ms = int(crossfade_sec * 1000)
        
        top_cut = audio_top[:merge_time_ms + crossfade_ms]
        top_faded = top_cut.fade_out(crossfade_ms)
        
        bottom_active = audio_bottom[merge_time_ms:]
        
        # Bước 1: Chuẩn hóa âm lượng cao nhất (Peak) của cả 2 file về cùng mức -0.1dB
        # Điều này giúp Waveform của 2 phần trông cân bằng nhau về biên độ tối đa
        audio_top = effects.normalize(audio_top, headroom=0.1)
        bottom_active = effects.normalize(bottom_active, headroom=0.1)
        
        # Bước 2: Cân bằng cục bộ tại điểm nối để tránh hẫng âm lượng (vẫn dùng RMS vì tai nghe nhạy hơn với trung bình)
        check_window_ms = 2000
        top_window = audio_top[max(0, merge_time_ms - check_window_ms):merge_time_ms]
        bottom_window = bottom_active[:check_window_ms]
        
        top_loudness = top_window.dBFS
        bottom_loudness = bottom_window.dBFS
        
        gain_adjustment = 0
        if top_loudness != float('-inf') and bottom_loudness != float('-inf'):
            gain_adjustment = top_loudness - bottom_loudness
            # Giới hạn điều chỉnh để tránh thay đổi quá đột ngột
            gain_adjustment = max(-5, min(5, gain_adjustment))
            bottom_active = bottom_active + gain_adjustment 
            
        bottom_active_faded = bottom_active.fade_in(crossfade_ms)
        absolute_silence = AudioSegment.silent(duration=merge_time_ms)
        bottom_final = absolute_silence + bottom_active_faded
        
        final_audio = bottom_final.overlay(top_faded)
        
        # Final normalization to ensure the merged track is at peak volume
        final_audio = effects.normalize(final_audio, headroom=0.1)
        final_audio.export(output_filename, format="wav")
        
        mins, secs = divmod(len(final_audio) // 1000, 60)
        return output_filename, f"✅ Hoàn thành! File lưu tại: {output_filename}\nThời lượng: {mins}:{secs:02d}"
    except Exception as e:
        return None, f"❌ Lỗi: {str(e)}"

def reset_tab1():
    """Reset toàn bộ form Tab 1 về mặc định"""
    return None, 5, 0, None, ""

def reset_tab2():
    """Reset toàn bộ form Tab 2 về mặc định"""
    return None, None, gr.Slider(minimum=0, maximum=100, value=0, step=0.1), 1.0, "", None, ""

# Giao diện Gradio - Gắn CSS vào tham số css=custom_css
with gr.Blocks(title="Audio Workflow Manager", theme=gr.themes.Soft(), css=custom_css) as app:
    gr.Markdown("# 🎵 Audio Workflow Manager")
    gr.Markdown(f"Thư mục làm việc: \n- File cho Suno: `{FOLDER_SUNO_PREP}`\n- File Hoàn thiện: `{FOLDER_FINAL}`\n- File Gốc để Auto-fill: `{FOLDER_DOWNLOADS}`")
    
    with gr.Tab("1. Chuẩn bị file cho Suno"):
        with gr.Row():
            with gr.Column():
                input_original = gr.Audio(type="filepath", label="File Audio Gốc")
                extract_slider = gr.Slider(minimum=1, maximum=10, value=5, step=0.5, label="Độ dài đoạn lấy ở cuối (giây)")
                trim_end_slider = gr.Slider(minimum=0, maximum=300, value=0, step=0.1, label="Thời gian kết thúc file gốc (Để mặc định nếu không muốn cắt)")
                with gr.Row():
                    btn_prepare = gr.Button("Tạo file cho Suno", variant="primary")
                    btn_reset1 = gr.Button("🔄 Reset", variant="secondary")
            with gr.Column():
                output_suno = gr.Audio(type="filepath", label="Kết quả (Sẽ lưu vào suno_ready)", interactive=False)
                msg_prepare = gr.Textbox(label="Trạng thái")
        
        input_original.change(update_trim_slider_max, inputs=[input_original], outputs=[trim_end_slider])
        btn_prepare.click(prepare_suno_file, inputs=[input_original, extract_slider, trim_end_slider], outputs=[output_suno, msg_prepare])
        btn_reset1.click(reset_tab1, inputs=[], outputs=[input_original, extract_slider, trim_end_slider, output_suno, msg_prepare])

    with gr.Tab("2. Nối File (Overlay)"):
        with gr.Row():
            with gr.Column():
                input_top = gr.Audio(type="filepath", label="Track trên (Tự động lấy từ downloads)")
                input_bottom = gr.Audio(type="filepath", label="Track dưới (Nhạc từ Suno)")
                merge_slider = gr.Slider(minimum=0, maximum=100, value=0, step=0.1, label="Giây bắt đầu giao thoa")
                crossfade_slider = gr.Slider(minimum=0.1, maximum=2.0, value=1.0, step=0.1, label="Thời gian Crossfade (giây)")
                custom_name = gr.Textbox(label="Tên file Output", placeholder="Để trống nếu muốn tự đặt tên...")
                with gr.Row():
                    btn_merge = gr.Button("Nối file và Xuất WAV", variant="primary")
                    btn_reset2 = gr.Button("🔄 Reset", variant="secondary")
            with gr.Column():
                output_final = gr.Audio(type="filepath", label="Kết quả cuối cùng", interactive=False)
                msg_merge = gr.Textbox(label="Trạng thái", lines=3)

        input_bottom.change(
            fn=update_ui_on_file_upload, 
            inputs=[input_bottom, input_top], 
            outputs=[input_top, merge_slider, custom_name, msg_merge]
        )
        
        btn_merge.click(merge_audios, inputs=[input_top, input_bottom, merge_slider, crossfade_slider, custom_name], outputs=[output_final, msg_merge])
        btn_reset2.click(reset_tab2, inputs=[], outputs=[input_top, input_bottom, merge_slider, crossfade_slider, custom_name, output_final, msg_merge])

if __name__ == "__main__":
    app.launch()