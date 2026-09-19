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
EXCEL_ROW_COUNT_CACHE = {}


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
        proc = subprocess.Popen(
            cmd,
            cwd=str(SCRIPT_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env
        )
        # Record PID
        status = read_status_data()
        if job_id in status:
            status[job_id]["pid"] = proc.pid
            write_status_data(status)

        with open(log_file, "a", encoding="utf-8") as log_fd:
            for line in proc.stdout:
                # 1. Live print in Colab / server console
                print(f"[{job_id}] {line.rstrip()}", flush=True)
                # 2. Append to log file for API streaming
                log_fd.write(line)
                log_fd.flush()

        proc.wait()
    except Exception as e:
        print(f"[{job_id}] Error running scraper subprocess: {e}", flush=True)
        status = read_status_data()
        if job_id in status:
            status[job_id]["status"] = "failed"
            status[job_id]["status_message"] = f"Error: {str(e)}"
            write_status_data(status)


@app.get("/")
def root():
    return {"status": "ok", "message": "LeadGen AI Backend is running with 100% Hugging Face AI!"}


@app.get("/api/logs")
def get_logs(jobId: Optional[str] = None, tail: int = 100):
    status_data = read_status_data()
    target_job = jobId

    if not target_job:
        for j_id, j_info in status_data.items():
            if j_info.get("status") == "active":
                target_job = j_id
                break
        if not target_job and status_data:
            target_job = list(status_data.keys())[-1]

    if not target_job:
        log_files = sorted(LEADSDATA_DIR.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
        if log_files:
            target_job = log_files[0].stem

    if not target_job:
        return {"jobId": None, "lines": [], "status": "idle", "message": "No active or past job logs available"}

    log_path = LEADSDATA_DIR / f"{target_job}.log"
    lines = []
    if log_path.exists():
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                all_lines = f.readlines()
                lines = [l.rstrip() for l in all_lines[-tail:]]
        except Exception as e:
            lines = [f"Error reading log file: {e}"]

    job_info = status_data.get(target_job, {})
    return {
        "jobId": target_job,
        "query": job_info.get("query"),
        "status": job_info.get("status", "unknown"),
        "stage": job_info.get("stage", "running"),
        "progress": job_info.get("progress", 0),
        "statusMessage": job_info.get("status_message", ""),
        "lines": lines
    }


@app.post("/api/ai-copilot")
async def ai_copilot(req: Request):
    """
    AI Strategy Copilot (LLM Mode):
    Analyzes natural language sales goals or pitches and automatically determines:
    - Optimized Google Maps search queries
    - Best matching service offer (website, ai_agent, crm_automation, local_seo, custom)
    - Value proposition & ICP qualification instructions
    """
    body = await req.json()
    raw_goal = body.get("goal", "").strip()
    hf_token = body.get("hf_api_key") or os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
    
    if not raw_goal:
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
        
    system_prompt = (
        "You are an expert B2B Lead Generation & Local Market Strategist.\n"
        "The user will describe their service, offer, or lead generation goal in natural language (English or Hinglish).\n"
        "Your job is to analyze their intent and return a clean JSON object with:\n"
        "1. query: the most effective, direct Google Maps search query string (e.g. 'dental clinics in South Delhi' or 'hair salons in Mumbai').\n"
        "2. service_offer: one of ['website', 'ai_agent', 'crm_automation', 'local_seo', 'custom'].\n"
        "3. custom_goal: a concise 1-2 sentence description of the target ICP and exact value proposition to qualify leads.\n"
        "4. suggested_queries: an array of 3-5 alternative localized Google Maps search query variations.\n"
        "5. target_audience: a short summary of the ideal customer profile.\n\n"
        "Respond ONLY with a valid JSON object without markdown or code fences."
    )
    
    payload = {
        "model": "Qwen/Qwen2.5-72B-Instruct",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"User Goal: {raw_goal}"}
        ],
        "temperature": 0.3,
        "max_tokens": 512
    }
    
    headers = {"Content-Type": "application/json"}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token.strip()}"
        
    endpoints = [
        "https://router.huggingface.co/v1/chat/completions",
        "https://router.huggingface.co/hf-inference/v1/chat/completions",
        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions"
    ]
    
    if hf_token:
        for ep in endpoints:
            try:
                resp = requests.post(ep, headers=headers, json=payload, timeout=20.0)
                if resp.status_code == 200:
                    c = resp.json()["choices"][0]["message"]["content"].strip()
                    c_clean = re.sub(r'^```(?:json)?\s*', '', c, flags=re.MULTILINE)
                    c_clean = re.sub(r'```\s*$', '', c_clean, flags=re.MULTILINE).strip()
                    s = c_clean.find('{')
                    e = c_clean.rfind('}')
                    if s != -1 and e != -1:
                        data = json.loads(c_clean[s:e+1])
                        return {"success": True, "data": data}
            except Exception:
                pass
                
    # Intelligent Heuristic Fallback if offline or LLM unavailable
    goal_lower = raw_goal.lower()
    inferred_offer = "all_round"
    if any(k in goal_lower for k in ["website", "web design", "site", "web dev", "redesign", "landing page"]):
        inferred_offer = "website"
    elif any(k in goal_lower for k in ["ai agent", "chatbot", "chat bot", "voice agent", "receptionist", "phone agent", "ai bot"]):
        inferred_offer = "ai_agent"
    elif any(k in goal_lower for k in ["crm", "automation", "automate", "pipeline", "follow up", "followup"]):
        inferred_offer = "crm_automation"
    elif any(k in goal_lower for k in ["seo", "reviews", "review", "google maps rank", "rating", "reputation"]):
        inferred_offer = "local_seo"
    else:
        inferred_offer = "custom"
        
    return {
        "success": True,
        "data": {
            "query": raw_goal,
            "service_offer": inferred_offer,
            "custom_goal": raw_goal,
            "suggested_queries": [raw_goal],
            "target_audience": f"Prospective clients for {inferred_offer.replace('_', ' ').title()}"
        }
    }


@app.post("/api/optimize-query")
async def api_optimize_query(req: Request):
    """
    Optimizes a raw search query using LLM / intelligent heuristic engine
    for Google Maps high-precision area matching.
    """
    body = await req.json()
    raw_query = body.get("query", "").strip()
    hf_token = body.get("hf_api_key") or os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
    
    if not raw_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    try:
        from scraper import optimize_search_query_with_llm
        res = optimize_search_query_with_llm(raw_query, hf_token=hf_token)
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": True,
            "data": {
                "optimized_query": raw_query,
                "target_area": "",
                "niche": raw_query,
                "error": str(e)
            }
        }


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
    service_offer = body.get("service_offer", "all_round")
    custom_goal = body.get("custom_goal", "")

    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    job_id = f"job_{int(time.time() * 1000)}"

    # Record initial job status
    status = read_status_data()
    status[job_id] = {
        "query": query,
        "limit": limit,
        "service_offer": service_offer,
        "custom_goal": custom_goal,
        "status": "active",
        "stage": "starting",
        "current": 0,
        "total": limit,
        "progress": 0,
        "status_message": f"Initializing scraper ({service_offer.replace('_', ' ').title()})...",
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
        "--model", ai_model,
        "--service-offer", service_offer
    ]
    if custom_goal:
        cmd.extend(["--custom-goal", custom_goal])
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
    processed_jobs = set()

    for f in sorted(LEADSDATA_DIR.glob("*.xlsx"), key=lambda x: x.stat().st_mtime, reverse=True):
        processed_files.add(f.name)
        stats = f.stat()

        # Count actual rows in sheet (cached by mtime + size for instant polling)
        row_count = 0
        cache_key = f.name
        cached = EXCEL_ROW_COUNT_CACHE.get(cache_key)
        if cached and cached.get("mtime") == stats.st_mtime and cached.get("size") == stats.st_size:
            row_count = cached.get("count", 0)
        else:
            try:
                df_temp = pd.read_excel(f, engine="openpyxl")
                row_count = len(df_temp)
                EXCEL_ROW_COUNT_CACHE[cache_key] = {
                    "mtime": stats.st_mtime,
                    "size": stats.st_size,
                    "count": row_count
                }
            except Exception:
                row_count = 0

        # Try matching job info from status_data
        matched_job_id = None
        m = re.search(r'_(job_\d+)\.xlsx$', f.name)
        if m:
            matched_job_id = m.group(1)
        if not matched_job_id:
            for j_id, j_info in status_data.items():
                if j_info.get("filename") == f.name:
                    matched_job_id = j_id
                    break

        j_info = status_data.get(matched_job_id, {}) if matched_job_id else {}
        if matched_job_id:
            processed_jobs.add(matched_job_id)

        clean_stem = re.sub(r'_job_\d+$', '', f.stem, flags=re.IGNORECASE)
        query_name = j_info.get("query") or clean_stem.replace("_", " ").title()
        limit_val = j_info.get("limit", row_count or 100)
        status_msg = j_info.get("status_message") or (f"{row_count} leads saved" if row_count > 0 else "Ready")

        runs.append({
            "filename": f.name,
            "jobId": matched_job_id or f"file_{int(stats.st_mtime)}",
            "query": query_name,
            "limit": limit_val,
            "status": "completed",
            "stage": "completed",
            "current": row_count,
            "total": row_count,
            "progress": 100,
            "statusMessage": status_msg,
            "size": stats.st_size,
            "timestamp": j_info.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(stats.st_mtime))
        })

    # Append active, failed, or cancelled jobs not matched to a file
    for j_id, j_info in status_data.items():
        st = j_info.get("status", "active")
        if j_id not in processed_jobs and st in ["active", "failed", "cancelled"]:
            runs.insert(0, {
                "filename": j_info.get("filename"),
                "jobId": j_id,
                "query": j_info.get("query", "Unknown Search"),
                "limit": j_info.get("limit", 100),
                "status": st,
                "stage": j_info.get("stage", "failed" if st == "failed" else ("cancelled" if st == "cancelled" else "starting")),
                "current": j_info.get("current", 0),
                "total": j_info.get("total", j_info.get("limit", 100)),
                "progress": j_info.get("progress", 0 if st != "completed" else 100),
                "statusMessage": j_info.get("status_message", f"Job {st}"),
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
        safe_name = Path(file).name
        f_path = LEADSDATA_DIR / safe_name
        if f_path.exists():
            f_path.unlink(missing_ok=True)
        if safe_name in EXCEL_ROW_COUNT_CACHE:
            del EXCEL_ROW_COUNT_CACHE[safe_name]
        # Prune any status entries associated with this file
        keys_to_del = [k for k, v in status_data.items() if v.get("filename") == safe_name]
        for k in keys_to_del:
            del status_data[k]

    write_status_data(status_data)
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting LeadGen AI API Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
