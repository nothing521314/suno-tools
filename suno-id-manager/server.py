from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
import os
import asyncio
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RESULTS_FILE = "original_manager/results.json"
QUEUE_FILE = "queue.txt"

class QueueItem(BaseModel):
    fake_name: str
    claim_id: str

class ProcessStatus:
    is_running = False
    last_output = ""

status = ProcessStatus()

@app.get("/api/results")
async def get_results():
    if os.path.exists(RESULTS_FILE):
        try:
            with open(RESULTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

@app.get("/api/queue")
async def get_queue():
    queue = []
    if os.path.exists(QUEUE_FILE):
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                parts = line.rsplit(maxsplit=1)
                if len(parts) == 2:
                    queue.append({"fake_name": parts[0], "claim_id": parts[1]})
                else:
                    queue.append({"fake_name": "Không có", "claim_id": parts[0]})
    return queue

@app.post("/api/queue")
async def add_to_queue(item: QueueItem):
    with open(QUEUE_FILE, "a", encoding="utf-8") as f:
        f.write(f"{item.fake_name}\t{item.claim_id}\n")
    return {"status": "success"}

@app.post("/api/queue/bulk")
async def add_to_queue_bulk(items: List[QueueItem]):
    with open(QUEUE_FILE, "a", encoding="utf-8") as f:
        for item in items:
            f.write(f"{item.fake_name}\t{item.claim_id}\n")
    return {"status": "success"}

@app.post("/api/queue/clear")
async def clear_queue():
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        pass
    return {"status": "success"}

async def run_processor():
    status.is_running = True
    try:
        # Run shazam_processor.py
        process = await asyncio.create_subprocess_exec(
            "python3", "-u", "shazam_processor.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        status.last_output = ""
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            decoded_line = line.decode(errors='replace')
            status.last_output += decoded_line
            # Giữ log ngắn gọn (ví dụ 5000 ký tự cuối)
            if len(status.last_output) > 5000:
                status.last_output = status.last_output[-5000:]
            print(decoded_line, end="", flush=True)
        await process.wait()
    except Exception as e:
        status.last_output += f"\nError: {str(e)}"
        print(f"Error running processor: {e}", flush=True)
    finally:
        status.is_running = False

@app.post("/api/run")
async def start_processing(background_tasks: BackgroundTasks):
    if status.is_running:
        raise HTTPException(status_code=400, detail="Processing already in progress")
    background_tasks.add_task(run_processor)
    return {"status": "success"}

@app.get("/api/status")
async def get_status():
    return {
        "is_running": status.is_running,
        "last_output": status.last_output[-1000:] # Last 1000 chars
    }

# Serve static results if needed
if os.path.exists("original_manager"):
    app.mount("/results", StaticFiles(directory="original_manager"), name="results")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
