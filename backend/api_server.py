#!/usr/bin/env python3
"""
FastAPI Server for LeadGen AI Scraper Backend
---------------------------------------------
Exposes HTTP endpoints for:
- POST   /api/scrape  (Initiate scraping job)
- GET    /api/leads   (List runs, view single sheet, download XLSX/CSV)
- PUT    /api/leads   (In-place update of lead CRM fields)
- DELETE /api/leads   (Cancel active job or delete file)

Can be executed locally or on Google Colab / VPS!
"""

import os
import sys
import json
import time
import subprocess
import shutil
import re
from typing import Optional, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import pandas as pd
import openpyxl

app = FastAPI(title="LeadGen AI Scraper API", version="1.0.0")

# Enable CORS for Vercel and local requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCRIPT_DIR = Path(__file__).resolve().parent
LEADSDATA_DIR = SCRIPT_DIR / "leadsdata"
STATUS_FILE = LEADSDATA_DIR / "status.json"

LEADSDATA_DIR.mkdir(parents=True, exist_ok=True)


def read_status_data() -> dict:
    if STATUS_FILE.exists():
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def write_status_data(data: dict):
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error writing status.json: {e}")


def run_scraper_subprocess(cmd: list, env: dict, log_file: Path, job_id: str):
    try:
        with open(log_file, "a", encoding="utf-8") as log_fd:
            proc = subprocess.Popen(
                cmd,
                cwd=str(SCRIPT_DIR),
                stdout=log_fd,
                stderr=log_fd,
                env=env
            )
            # Record PID
            status = read_status_data()
            if job_id in status:
                status[job_id]["pid"] = proc.pid
                write_status_data(status)
            proc.wait()
    except Exception as e:
        print(f"Error running scraper subprocess: {e}")
        status = read_status_data()
        if job_id in status:
            status[job_id]["status"] = "failed"
            status[job_id]["status_message"] = f"Error: {str(e)}"
            write_status_data(status)


@app.get("/")
def root():
    return {"status": "ok", "message": "LeadGen AI Backend is running with 100% Hugging Face AI!"}


@app.post("/api/scrape")
async def start_scrape(req: Request, background_tasks: BackgroundTasks):
    body = await req.json()
    query = body.get("query")
    limit = body.get("limit", 100)
    headless = body.get("headless", True)
    hf_api_key = body.get("hf_api_key")
    ai_model = body.get("ai_model", "Qwen/Qwen2.5-72B-Instruct")
    enable_fallback = body.get("enable_fallback", True)
    merge_existing = body.get("merge_existing", True)

    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    job_id = f"job_{int(time.time() * 1000)}"

    # Record initial job status
    status = read_status_data()
    status[job_id] = {
        "query": query,
        "limit": limit,
        "status": "active",
        "stage": "starting",
        "current": 0,
        "total": limit,
        "progress": 0,
        "status_message": "Initializing scraper process...",
        "provider": "huggingface",
        "model": ai_model,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    }
    write_status_data(status)

    python_bin = sys.executable
    cmd = [
        python_bin, "-u", "scraper.py",
        query,
        "--limit", str(limit),
        "--job-id", job_id,
        "--provider", "huggingface",
        "--model", ai_model
    ]
    if headless:
        cmd.append("--headless")
    if not merge_existing:
        cmd.append("--no-merge")
    if not enable_fallback:
        cmd.append("--no-fallback")

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if hf_api_key:
        env["HUGGINGFACE_API_KEY"] = hf_api_key
        env["HF_TOKEN"] = hf_api_key

    log_file = LEADSDATA_DIR / f"{job_id}.log"

    background_tasks.add_task(run_scraper_subprocess, cmd, env, log_file, job_id)

    return {"success": True, "jobId": job_id}


@app.get("/api/leads")
def get_leads(file: Optional[str] = None, download: Optional[str] = None, format: Optional[str] = "xlsx", leadId: Optional[str] = None):
    status_data = read_status_data()

    # 1. Single file operations
    if file:
        safe_name = Path(file).name
        file_path = LEADSDATA_DIR / safe_name

        if not file_path.exists():
            # Fallback search
            all_xlsx = list(LEADSDATA_DIR.glob("*.xlsx"))
            slug = re.sub(r'[^a-zA-Z0-9]', '_', safe_name.replace(".xlsx", "")).lower()
            for f in all_xlsx:
                f_slug = re.sub(r'[^a-zA-Z0-9]', '_', f.name.replace(".xlsx", "")).lower()
                if slug in f_slug or f_slug in slug:
                    file_path = f
                    safe_name = f.name
                    break

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if download == "true":
            if format.lower() == "csv":
                df = pd.read_excel(file_path, engine="openpyxl")
                csv_bytes = ('\ufeff' + df.to_csv(index=False)).encode('utf-8')
                return Response(
                    content=csv_bytes,
                    media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{file_path.stem}.csv"'}
                )
            return FileResponse(
                path=str(file_path),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename=safe_name
            )

        # Parse Excel data
        try:
            df = pd.read_excel(file_path, engine="openpyxl")
            records = df.fillna("").to_dict(orient="records")
            if leadId:
                for r in records:
                    if str(r.get("Lead ID")) == leadId or str(r.get("S.No")) == leadId or str(r.get("Business Name")) == leadId:
                        return {"data": r}
                raise HTTPException(status_code=404, detail="Lead not found")
            return {"data": records}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # 2. List all runs
    runs = []
    processed_files = set()
    for f in sorted(LEADSDATA_DIR.glob("*.xlsx"), key=lambda x: x.stat().st_mtime, reverse=True):
        processed_files.add(f.name)
        stats = f.stat()
        runs.append({
            "filename": f.name,
            "jobId": f"file_{int(stats.st_mtime)}",
            "query": f.stem.replace("_", " ").title(),
            "limit": 100,
            "status": "completed",
            "stage": "completed",
            "current": 0,
            "total": 100,
            "progress": 100,
            "statusMessage": "Ready",
            "size": stats.st_size,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(stats.st_mtime))
        })

    # Append active/status jobs
    for j_id, j_info in status_data.items():
        if j_info.get("status") == "active":
            runs.insert(0, {
                "filename": None,
                "jobId": j_id,
                "query": j_info.get("query", "Unknown Search"),
                "limit": j_info.get("limit", 100),
                "status": "active",
                "stage": j_info.get("stage", "starting"),
                "current": j_info.get("current", 0),
                "total": j_info.get("total", 100),
                "progress": j_info.get("progress", 0),
                "statusMessage": j_info.get("status_message", ""),
                "size": 0,
                "timestamp": j_info.get("timestamp", time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()))
            })

    has_env_hf = bool(os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN"))
    return {"runs": runs, "hasEnvHfKey": has_env_hf, "hasEnvApiKey": has_env_hf}


@app.put("/api/leads")
async def update_lead(req: Request):
    body = await req.json()
    file_name = body.get("file")
    lead_id = body.get("leadId")
    updates = body.get("updates", {})

    if not file_name or not lead_id:
        raise HTTPException(status_code=400, detail="Missing required parameters")

    file_path = LEADSDATA_DIR / Path(file_name).name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    df = pd.read_excel(file_path, engine="openpyxl")
    lead_id_str = str(lead_id).strip().lower()

    target_idx = None
    for idx, row in df.iterrows():
        l_id = str(row.get("Lead ID", "")).strip().lower()
        s_no = str(row.get("S.No", "")).strip().lower()
        b_name = str(row.get("Business Name", "")).strip().lower()
        if l_id == lead_id_str or s_no == lead_id_str or b_name == lead_id_str:
            target_idx = idx
            break

    if target_idx is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    for k, v in updates.items():
        df.at[target_idx, k] = v

    df.to_excel(file_path, index=False, engine="openpyxl")
    return {"success": True, "data": df.iloc[target_idx].fillna("").to_dict()}


@app.delete("/api/leads")
def delete_lead(file: Optional[str] = None, jobId: Optional[str] = None):
    status_data = read_status_data()

    # Kill process if active
    if jobId and jobId in status_data and status_data[jobId].get("status") == "active":
        pid = status_data[jobId].get("pid")
        if pid:
            try:
                if sys.platform == "win32":
                    subprocess.run(f"taskkill /pid {pid} /T /F", shell=True, check=False)
                else:
                    os.kill(pid, 9)
            except Exception as e:
                print(f"Error killing PID {pid}: {e}")

    if jobId and jobId in status_data:
        del status_data[jobId]
        log_file = LEADSDATA_DIR / f"{jobId}.log"
        if log_file.exists():
            log_file.unlink(missing_ok=True)

    if file:
        f_path = LEADSDATA_DIR / Path(file).name
        if f_path.exists():
            f_path.unlink(missing_ok=True)

    write_status_data(status_data)
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting LeadGen AI API Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
