import json
import random
import os

def generate_artistic_lyrics(count=500, start_id=251):
    # Thư viện câu thơ giàu tính nghệ thuật do "Nhạc sĩ AI" biên soạn
    poetic_library = {
        "Melancholic": [
            "The silence here is louder than the words we never said",
            "Tracing the outline of a memory in the cold morning mist",
            "Midnight is a canvas where I paint your name in shadows",
            "The echoes of your footsteps are the only song I know",
            "Watching the calendar leaves fall like autumn rain",
            "Empty chairs and half-filled glasses tell the story of us",
            "I'm a ghost in a city that forgot how to sleep",
            "Buried beneath the layers of a thousand yesterday",
            "The moon is a silver coin spent on a lonely night",
            "Fading like the ink on a letter sent to nowhere"
        ],
        "Neon_Energy": [
            "Electric blood running through the veins of the concrete jungle",
            "We are the sparks flying in the dark, chasing the strobe lights",
            "Laser beams cutting through the smoke of our shared dreams",
            "The bass is a heartbeat that belongs to the entire city",
            "Glitching through the static of a digital afternoon",
            "Cybernetic lovers dancing on the edge of a silicon peak",
            "Voltage rising until the sky turns a shade of electric blue",
            "We're not just people, we're frequencies in a global soul",
            "Pixelated memories burning bright in the dark web of love",
            "System override, let the rhythm take control of the machine"
        ],
        "Ethereal_Hope": [
            "Drinking the starlight from the palms of a thousand dreams",
            "Gravity is just a suggestion when your heart starts to fly",
            "Finding the gold in the ruins of a broken afternoon",
            "The horizon is a promise whispered by the rising tide",
            "Weaving a ladder out of sunbeams to reach the unknown",
            "Every teardrop is a seed for a garden yet to bloom",
            "The wind carries the secrets of a future we haven't seen",
            "Walking on water made of moonlight and ancient songs",
            "Infinite possibilities hidden in the blink of an eye",
            "Silver linings embroidered on the edges of every storm"
        ],
        "Gritty_Street": [
            "Concrete flowers blooming in the cracks of the boulevard",
            "Streetlight symphonies played on the strings of the power lines",
            "Tires screaming like a wild animal in the urban night",
            "Graffiti walls telling the truths the papers won't print",
            "Cold coffee and a heavy heart on a Monday morning",
            "Leather jackets and the smell of rain on hot asphalt",
            "Chasing the dollar until the dollar starts chasing you",
            "Hard knocks and soft whispers in the alleyways of life",
            "The subway train is a dragon sleeping in the dark tunnels",
            "Survival is the only anthem we ever learned to sing"
        ]
    }

    styles = [
        "Synth-pop, 80s Vibe, Neon, Catchy Synth, Nightlife, Female Vocal, 120 BPM",
        "Dance-pop, Energetic, Club, Bass, Modern, High Energy, Male Vocal, 128 BPM",
        "Indie-pop, Acoustic, Soft, Emotional, Piano, Melancholic, Female Vocal, 80 BPM",
        "Disco-pop, Funky, Groovy, Bassline, Dance, Retro, Energy, 124 BPM",
        "Pop-rock, Electric Guitar, Anthemic, Powerful, Drums, Male Vocal, 110 BPM",
        "Electro-pop, Futuristic, Dark, Heavy Bass, Glossy, Female Vocal, 115 BPM",
        "Dream-pop, Ethereal, Reverb, Atmospheric, Chill, Soft Vocals, 90 BPM",
        "Acoustic Pop, Hopeful, Uplifting, Bright, Soft Piano, Gentle Vocals, 85 BPM"
    ]

    song_pool = []
    vibes = list(poetic_library.keys())
    
    for i in range(count):
        vibe = random.choice(vibes)
        lines_pool = poetic_library[vibe]
        style = random.choice(styles)
        
        # Đặt tên bài hát mang tính ẩn dụ hơn
        titles = [
            f"{vibe} Horizon", "Shadow Dancer", "Electric Echo", "Silver Lining", 
            "Concrete Rose", "Digital Rain", "Starlight Thief", "Midnight Mirror",
            "Neon Pulse", "Velvet Storm", "Crystal Path", "Silent Anthem"
        ]
        title = f"{random.choice(titles)} {start_id + i}"

        lyrics = []
        structure = ["[Intro]", "[Verse 1]", "[Chorus]", "[Verse 2]", "[Chorus]", "[Bridge]", "[Chorus]", "[Outro]"]
        
        for section in structure:
            lyrics.append(section)
            if "Intro" in section:
                lyrics.append(f"(Atmospheric {vibe.lower()} build-up)\n(Soft keys and deep reverb)")
            elif "Verse" in section:
                # Chọn ngẫu nhiên 4 câu thơ nghệ thuật
                v_lines = random.sample(lines_pool, 4)
                lyrics.append("\n".join(v_lines))
            elif "Chorus" in section:
                # Tạo điệp khúc mang tính biểu tượng
                c_lines = random.sample(lines_pool, 2)
                lyrics.append(f"{c_lines[0]}\nOh, it's the {vibe.lower()} calling my name\n{c_lines[1]}\nWe'll never be the same again")
            elif "Bridge" in section:
                b_line = random.choice(lines_pool)
                lyrics.append(f"But in the depth of the {vibe.lower()} soul\n{b_line}\nWe find the strength to be whole")
            elif "Outro" in section:
                lyrics.append(f"(Fade into the {vibe.lower()} night)\n(Last note echoing...)\n(End)")
            lyrics.append("")

        song_pool.append({
            "id": start_id + i,
            "title": title,
            "style": style,
            "lyrics": "\n".join(lyrics).strip()
        })
    
    return song_pool

def main():
    lyrics_file = '/Users/nothing/Code/suno-tool/lyrics.json'
    existing_songs = []
    if os.path.exists(lyrics_file):
        with open(lyrics_file, 'r', encoding='utf-8') as f:
            existing_songs = json.load(f)
    
    # Giữ 250 bài đầu, thay 500 bài cũ bằng bản "nghệ thuật" này
    base_songs = existing_songs[:250]
    print(f"Đang thổi hồn vào 500 bài hát mới...")
    
    new_songs = generate_artistic_lyrics(count=500, start_id=251)
    all_songs = base_songs + new_songs
    
    with open(lyrics_file, 'w', encoding='utf-8') as f:
        json.dump(all_songs, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Hoàn tất! 500 bài hát mang đậm tính nghệ thuật đã sẵn sàng.")

if __name__ == "__main__":
    main()
