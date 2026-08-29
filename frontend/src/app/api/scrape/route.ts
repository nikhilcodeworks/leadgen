import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, limit, headless, gemini_api_key } = body;

    if (!query) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
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
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');

    // Spawn Python scraper in the background
    const pythonCmd = 'python';
    const args = ['scraper.py', query, '--limit', (limit || 100).toString(), '--job-id', jobId];
    if (headless) {
      args.push('--headless');
    }

    const env = { ...process.env };
    if (gemini_api_key) {
      env.GEMINI_API_KEY = gemini_api_key;
    }

    console.log(`Spawning scraper process for Job: ${jobId} Cwd: ${backendDir}`);
    const child = spawn(pythonCmd, args, {
      cwd: backendDir,
      detached: true,
      stdio: 'ignore',
      env: env
    });

    child.unref();

    return Response.json({ success: true, jobId });
  } catch (error: any) {
    console.error('Error in /api/scrape:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
