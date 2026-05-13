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

@app.delete("/api/results/{claim_id}")
async def delete_result(claim_id: str):
    if not os.path.exists(RESULTS_FILE):
        return {"status": "error", "message": "Results file not found"}
    
    try:
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            results = json.load(f)
        
        new_results = [r for r in results if str(r.get('claim_id')) != claim_id]
        
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(new_results, f, ensure_ascii=False, indent=4)
            
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/results/{claim_id}/refresh")
async def refresh_result(claim_id: str):
    if not os.path.exists(RESULTS_FILE):
        raise HTTPException(status_code=404, detail="Results file not found")
    
    try:
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            results = json.load(f)
        
        target_item = None
        for r in results:
            if str(r.get('claim_id')) == claim_id:
                target_item = r
                break
        
        if not target_item:
            raise HTTPException(status_code=404, detail="Item not found in results")
            
        fake_name = target_item.get('fake_name', 'Không có')
        source_url = target_item.get('source_url', claim_id)
        
        with open(QUEUE_FILE, "a", encoding="utf-8") as f:
            f.write(f"{fake_name}\t{source_url}\n")
            
        new_results = [r for r in results if str(r.get('claim_id')) != claim_id]
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(new_results, f, ensure_ascii=False, indent=4)
            
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
