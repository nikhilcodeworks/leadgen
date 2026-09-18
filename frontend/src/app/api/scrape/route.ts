import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      limit,
      headless,
      gemini_api_key,
      hf_api_key,
      ai_provider,
      ai_model,
      enable_fallback,
      merge_existing
    } = body;

    if (!query) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }

    const backendUrl = req.headers.get('x-backend-url') || body.backend_url || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const remoteRes = await fetch(`${cleanBackend}/api/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        console.error('Error proxying to BACKEND_URL:', fErr);
        return Response.json({ error: `Remote Colab Backend Error: ${fErr.message}` }, { status: 502 });
      }
    }

    const jobId = `job_${Date.now()}`;
    const backendDir = path.join(process.cwd(), '../backend');
    const statusFile = path.join(backendDir, 'leadsdata/status.json');

    // Ensure status file and directory exist
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });

    let statusData: any = {};
    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        console.error('Error reading status.json', e);
      }
    }

    // Mark job as active
    statusData[jobId] = {
      query: query,
      limit: limit || 100,
      status: 'active',
      stage: 'starting',
      current: 0,
      total: limit || 100,
      progress: 0,
      status_message: 'Initializing scraper process...',
      provider: 'huggingface',
      model: ai_model || 'Qwen/Qwen2.5-72B-Instruct',
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');

    // Spawn Python scraper in the background - prefer virtual environment python if available
    // On Windows, prefer pythonw.exe so no console / terminal window pops up
    const isWin = process.platform === 'win32';
    const venvPythonWin = isWin && fs.existsSync(path.join(backendDir, 'venv', 'Scripts', 'pythonw.exe'))
      ? path.join(backendDir, 'venv', 'Scripts', 'pythonw.exe')
      : path.join(backendDir, 'venv', 'Scripts', 'python.exe');
    const venvPythonUnix = path.join(backendDir, 'venv', 'bin', 'python');
    const dotVenvPythonWin = isWin && fs.existsSync(path.join(backendDir, '.venv', 'Scripts', 'pythonw.exe'))
      ? path.join(backendDir, '.venv', 'Scripts', 'pythonw.exe')
      : path.join(backendDir, '.venv', 'Scripts', 'python.exe');
    const dotVenvPythonUnix = path.join(backendDir, '.venv', 'bin', 'python');

    let pythonCmd = isWin ? 'pythonw' : 'python';
    if (fs.existsSync(venvPythonWin)) {
      pythonCmd = venvPythonWin;
    } else if (fs.existsSync(dotVenvPythonWin)) {
      pythonCmd = dotVenvPythonWin;
    } else if (fs.existsSync(venvPythonUnix)) {
      pythonCmd = venvPythonUnix;
    } else if (fs.existsSync(dotVenvPythonUnix)) {
      pythonCmd = dotVenvPythonUnix;
    }

    const args = ['-u', 'scraper.py', query, '--limit', (limit || 100).toString(), '--job-id', jobId];
    if (headless) {
      args.push('--headless');
    }
    if (merge_existing === false) {
      args.push('--no-merge');
    }
    args.push('--provider', 'huggingface');
    if (ai_model) {
      args.push('--model', ai_model);
    }
    if (enable_fallback === false) {
      args.push('--no-fallback');
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8'
    };
    if (hf_api_key) {
      env.HUGGINGFACE_API_KEY = hf_api_key;
      env.HF_TOKEN = hf_api_key;
    } else if (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN) {
      env.HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
      env.HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
    }

    const logFile = path.join(backendDir, 'leadsdata', `${jobId}.log`);
    const logFd = fs.openSync(logFile, 'a');

    console.log(`Spawning scraper process for Job: ${jobId} Cwd: ${backendDir} Log: ${logFile}`);
    const child = spawn(pythonCmd, args, {
      cwd: backendDir,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
      env: env
    });

    // Record child process PID for cancellation
    try {
      if (child.pid) {
        statusData[jobId].pid = child.pid;
        fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');
        console.log(`Recorded PID ${child.pid} for Job ${jobId}`);
      }
    } catch (err) {
      console.error('Error saving PID in status.json:', err);
    }

    // Close descriptor in parent; child maintains duplicate
    try {
      fs.closeSync(logFd);
    } catch (e) {
      // Ignored
    }

    child.unref();

    return Response.json({ success: true, jobId });
  } catch (error: any) {
    console.error('Error in /api/scrape:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
