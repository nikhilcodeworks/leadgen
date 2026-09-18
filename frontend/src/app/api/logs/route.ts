import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = req.headers.get('x-backend-url') || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const targetUrl = new URL(`${cleanBackend}/api/logs`);
        targetUrl.search = new URL(req.url).search;
        const remoteRes = await fetch(targetUrl.toString(), {
          headers: { 'Cache-Control': 'no-cache' }
        });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        console.error('Error proxying GET /api/logs to BACKEND_URL:', fErr);
        return Response.json({ error: `Remote Backend Error: ${fErr.message}` }, { status: 502 });
      }
    }

    const { searchParams } = new URL(req.url);
    const requestedJobId = searchParams.get('jobId');
    const tailCount = parseInt(searchParams.get('tail') || '150', 10);

    const backendDir = path.join(process.cwd(), '../backend');
    const leadsdataDir = path.join(backendDir, 'leadsdata');
    const statusFile = path.join(leadsdataDir, 'status.json');

    let statusData: Record<string, any> = {};
    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        console.error('Error reading status.json in /api/logs', e);
      }
    }

    let targetJob = requestedJobId;

    // Find active job if none specified
    if (!targetJob) {
      for (const [jId, jInfo] of Object.entries(statusData)) {
        if (jInfo && jInfo.status === 'active') {
          targetJob = jId;
          break;
        }
      }
      if (!targetJob && Object.keys(statusData).length > 0) {
        const keys = Object.keys(statusData);
        targetJob = keys[keys.length - 1];
      }
    }

    // Fallback to most recently updated .log file in leadsdata
    if (!targetJob && fs.existsSync(leadsdataDir)) {
      try {
        const files = fs.readdirSync(leadsdataDir)
          .filter(f => f.endsWith('.log'))
          .map(f => ({ name: f, time: fs.statSync(path.join(leadsdataDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (files.length > 0) {
          targetJob = path.basename(files[0].name, '.log');
        }
      } catch (e) {
        // ignore
      }
    }

    if (!targetJob) {
      return Response.json({
        jobId: null,
        lines: ['[System] No scraper jobs found or active yet.'],
        status: 'idle',
        message: 'No logs available'
      });
    }

    const logPath = path.join(leadsdataDir, `${targetJob}.log`);
    let lines: string[] = [];

    if (fs.existsSync(logPath)) {
      try {
        const content = fs.readFileSync(logPath, 'utf-8');
        const allLines = content.split(/\r?\n/);
        lines = allLines.slice(-tailCount);
      } catch (e: any) {
        lines = [`[Error] Failed to read log file: ${e.message}`];
      }
    } else {
      lines = [`[System] Log file for ${targetJob} is initializing...`];
    }

    const jobInfo = statusData[targetJob] || {};

    return Response.json({
      jobId: targetJob,
      query: jobInfo.query || null,
      status: jobInfo.status || 'unknown',
      stage: jobInfo.stage || 'running',
      progress: jobInfo.progress || 0,
      statusMessage: jobInfo.status_message || '',
      lines
    });
  } catch (error: any) {
    console.error('Error in /api/logs:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
