import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = req.headers.get('x-backend-url') || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const targetUrl = new URL(`${cleanBackend}/api/leads`);
        targetUrl.search = new URL(req.url).search;
        const remoteRes = await fetch(targetUrl.toString());
        const contentType = remoteRes.headers.get('content-type') || 'application/json';
        if (contentType.includes('application/json')) {
          const remoteData = await remoteRes.json();
          return Response.json(remoteData, { status: remoteRes.status });
        }
        const blob = await remoteRes.blob();
        return new Response(blob, {
          status: remoteRes.status,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': remoteRes.headers.get('content-disposition') || ''
          }
        });
      } catch (fErr: any) {
        console.error('Error proxying GET /api/leads to BACKEND_URL:', fErr);
        return Response.json({ error: `Remote Backend Error: ${fErr.message}` }, { status: 502 });
      }
    }

    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');
    const download = searchParams.get('download');
    const format = (searchParams.get('format') || 'xlsx').toLowerCase();

    const backendDir = path.join(process.cwd(), '../backend');
    const leadsdataDir = path.join(backendDir, 'leadsdata');
    const statusFile = path.join(leadsdataDir, 'status.json');

    // Read status data
    let statusData: any = {};
    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        console.error('Error reading status.json', e);
      }
    }

    // 1. Single File Operations (View / Download)
    if (file) {
      // Prevent directory traversal
      let safeFilename = path.basename(file);
      let filePath = path.join(leadsdataDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        // Fallback: match by query slug or partial filename
        if (fs.existsSync(leadsdataDir)) {
          const allFiles = fs.readdirSync(leadsdataDir).filter(f => f.endsWith('.xlsx'));
          const fileSlug = safeFilename.replace(/_job_\d+\.xlsx$/, '').replace(/\.xlsx$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          const match = allFiles.find(f => {
            const fSlug = f.replace(/_job_\d+\.xlsx$/, '').replace(/\.xlsx$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            return fSlug.includes(fileSlug) || fileSlug.includes(fSlug);
          });
          if (match) {
            safeFilename = match;
            filePath = path.join(leadsdataDir, match);
          }
        }
      }

      if (!fs.existsSync(filePath)) {
        return Response.json({ error: 'File not found' }, { status: 404 });
      }

      // Download raw file (Excel or CSV)
      if (download === 'true') {
        const fileBuffer = fs.readFileSync(filePath);

        if (format === 'csv') {
          const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const csvData = xlsx.utils.sheet_to_csv(sheet);
          const csvFilename = safeFilename.replace(/\.xlsx$/i, '') + '.csv';

          // Prepend UTF-8 BOM so Excel opens Hindi and non-ASCII characters without encoding glitches
          return new Response('\uFEFF' + csvData, {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${csvFilename}"`
            }
          });
        }

        return new Response(fileBuffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${safeFilename}"`
          }
        });
      }

      const fileBuffer = fs.readFileSync(filePath);
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = xlsx.utils.sheet_to_json(sheet);

      const leadId = searchParams.get('leadId');
      if (leadId) {
        const lead = (rawData as any[]).find(l => 
          String(l['Lead ID']) === leadId || 
          String(l['S.No']) === leadId ||
          String(l['Business Name']) === leadId
        );
        if (!lead) {
          return Response.json({ error: 'Lead not found' }, { status: 404 });
        }
        return Response.json({ data: lead });
      }

      // Sort by Lead Score descending
      const sortedData = (rawData as any[]).sort((a, b) => {
        const scoreA = Number(a['Lead Score']) || 0;
        const scoreB = Number(b['Lead Score']) || 0;
        return scoreB - scoreA;
      });

      return Response.json({ data: sortedData });
    }

    // 2. List Files & Statuses
    const runsList: any[] = [];
    const processedJobIds = new Set<string>();
    const processedFiles = new Set<string>();

    // Helper to find matching Excel file by stored filename or query slug
    const findMatchingExcel = (fname?: string, q?: string) => {
      if (!fs.existsSync(leadsdataDir)) return null;
      const allFiles = fs.readdirSync(leadsdataDir).filter(f => f.endsWith('.xlsx'));
      if (allFiles.length === 0) return null;
      if (fname && allFiles.includes(fname)) {
        return fname;
      }
      if (q) {
        const qSlug = q.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase().trim();
        for (const f of allFiles) {
          const fSlug = f.replace(/_job_\d+\.xlsx$/, '').replace(/_+/g, '_').toLowerCase().trim();
          if (qSlug.includes(fSlug) || fSlug.includes(qSlug)) {
            return f;
          }
        }
      }
      return null;
    };

    if (fs.existsSync(leadsdataDir)) {
      const files = fs.readdirSync(leadsdataDir);
      for (const filename of files) {
        if (filename.endsWith('.xlsx')) {
          const filePath = path.join(leadsdataDir, filename);
          const stats = fs.statSync(filePath);

          // Try to extract jobId from filename format: name_slug_job_171234567.xlsx
          const match = filename.match(/_(job_\d+)\.xlsx$/);
          const jobId = match ? match[1] : null;

          let query = filename.replace('.xlsx', '').replace(/_/g, ' ');
          let limit = 100;
          let status = 'completed';
          let timestamp = stats.mtime.toISOString();

          let progress = 100;
          let statusMessage = 'Completed';
          let stage = 'completed';
          let current = limit;
          let total = limit;

          // Match with statusData if available
          let matchedJobId = jobId;
          if (!matchedJobId) {
            for (const [jId, jInfo] of Object.entries(statusData)) {
              const info = jInfo as any;
              if (info.filename === filename || (info.query && filename.includes(info.query.replace(/[^a-zA-Z0-9]/g, '_')))) {
                matchedJobId = jId;
                break;
              }
            }
          }

          if (matchedJobId && statusData[matchedJobId]) {
            query = statusData[matchedJobId].query || query;
            limit = statusData[matchedJobId].limit || limit;
            status = statusData[matchedJobId].status || status;
            timestamp = statusData[matchedJobId].timestamp || timestamp;
            progress = statusData[matchedJobId].progress !== undefined ? statusData[matchedJobId].progress : (status === 'completed' ? 100 : 0);
            statusMessage = statusData[matchedJobId].status_message || (status === 'completed' ? 'Completed' : '');
            stage = statusData[matchedJobId].stage || (status === 'completed' ? 'completed' : 'scraping');
            current = statusData[matchedJobId].current !== undefined ? statusData[matchedJobId].current : (status === 'completed' ? limit : 0);
            total = statusData[matchedJobId].total !== undefined ? statusData[matchedJobId].total : limit;
            processedJobIds.add(matchedJobId);
          }

          processedFiles.add(filename);
          runsList.push({
            filename,
            jobId: matchedJobId,
            query,
            limit,
            status,
            stage,
            current,
            total,
            progress,
            statusMessage,
            size: stats.size,
            timestamp
          });
        }
      }
    }

    // Append remaining jobs from status.json (e.g. active jobs or jobs whose file is being written)
    let statusNeedsSync = false;
    for (const [jobId, jobInfo] of Object.entries(statusData)) {
      if (!processedJobIds.has(jobId)) {
        const info = jobInfo as any;
        const matchedFilename = findMatchingExcel(info.filename, info.query);

        // If completed and file is already listed in runsList, consolidate into existing run
        if (info.status === 'completed' && matchedFilename && processedFiles.has(matchedFilename)) {
          const existingRun = runsList.find(r => r.filename === matchedFilename);
          if (existingRun) {
            if (info.timestamp && new Date(info.timestamp) > new Date(existingRun.timestamp)) {
              existingRun.timestamp = info.timestamp;
            }
            existingRun.query = info.query || existingRun.query;
            existingRun.limit = Math.max(existingRun.limit || 0, info.limit || 0);
            if (info.status_message) existingRun.statusMessage = info.status_message;
          }
          continue;
        }

        // If completed or failed but NO file exists on disk, it was deleted! Prune it from status.json
        if (info.status === 'completed' || info.status === 'failed') {
          if (!matchedFilename) {
            delete statusData[jobId];
            statusNeedsSync = true;
            continue;
          }
        }

        let fileSize = 0;
        if (matchedFilename) {
          try {
            fileSize = fs.statSync(path.join(leadsdataDir, matchedFilename)).size;
          } catch (e) {}
        }
        runsList.push({
          filename: matchedFilename,
          jobId,
          query: info.query || 'Unknown Search',
          limit: info.limit || 100,
          status: info.status || 'completed',
          stage: info.stage || (info.status === 'completed' ? 'completed' : 'starting'),
          current: info.current !== undefined ? info.current : 0,
          total: info.total !== undefined ? info.total : (info.limit || 100),
          progress: info.progress !== undefined ? info.progress : 100,
          statusMessage: info.status_message || '',
          size: fileSize,
          timestamp: info.timestamp || new Date().toISOString()
        });
      }
    }

    if (statusNeedsSync) {
      try {
        fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');
      } catch (e) {
        console.error('Error auto-syncing status.json:', e);
      }
    }

    // Sort: newest first
    runsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Check if Hugging Face API key is configured in environment or .env files
    let hasEnvHfKey = Boolean((process.env.HUGGINGFACE_API_KEY && process.env.HUGGINGFACE_API_KEY.trim()) || (process.env.HF_TOKEN && process.env.HF_TOKEN.trim()));

    if (!hasEnvHfKey) {
      for (const envPath of [
        path.join(backendDir, '.env'),
        path.join(process.cwd(), '../.env'),
        path.join(process.cwd(), '.env.local')
      ]) {
        if (fs.existsSync(envPath)) {
          try {
            const content = fs.readFileSync(envPath, 'utf-8');
            if (!hasEnvHfKey && /(?:HUGGINGFACE_API_KEY|HF_TOKEN)=([^\s#]+)/.test(content)) {
              hasEnvHfKey = true;
            }
          } catch (e) {}
        }
      }
    }

    return Response.json({ runs: runsList, hasEnvHfKey, hasEnvApiKey: hasEnvHfKey });
  } catch (error: any) {
    console.error('Error listing leads:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const backendUrl = req.headers.get('x-backend-url') || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const targetUrl = new URL(`${cleanBackend}/api/leads`);
        targetUrl.search = new URL(req.url).search;
        const remoteRes = await fetch(targetUrl.toString(), { method: 'DELETE' });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        return Response.json({ error: fErr.message }, { status: 502 });
      }
    }

    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');
    const jobId = searchParams.get('jobId');

    const backendDir = path.join(process.cwd(), '../backend');
    const leadsdataDir = path.join(backendDir, 'leadsdata');
    const statusFile = path.join(leadsdataDir, 'status.json');

    // Read status data
    let statusData: any = {};
    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        console.error('Error reading status.json', e);
      }
    }

    const isJobActive = Boolean(jobId && statusData[jobId] && statusData[jobId].status === 'active');

    // 1. Delete file ONLY if explicitly requested AND not cancelling an active scrape job
    if (file && !isJobActive) {
      const safeFilename = path.basename(file);
      const filePath = path.join(leadsdataDir, safeFilename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted file: ${filePath}`);
      }
    }

    // 2. Kill process ONLY if active job
    if (isJobActive && jobId && statusData[jobId]?.pid) {
      const pid = statusData[jobId].pid;
      try {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
          console.log(`Successfully killed process tree for Job ${jobId} (PID: ${pid})`);
        } else {
          process.kill(-pid, 'SIGKILL');
        }
      } catch (killErr) {
        console.warn(`Could not kill process ${pid}:`, killErr);
      }
    }

    // 3. Clean up jobId and its log file
    if (jobId) {
      delete statusData[jobId];
      const logFile = path.join(leadsdataDir, `${jobId}.log`);
      if (fs.existsSync(logFile)) {
        try { fs.unlinkSync(logFile); } catch (e) {}
      }
    }

    // 4. Also clean up any jobs referencing the file if file was specified
    if (file) {
      for (const [jId, jInfo] of Object.entries(statusData)) {
        const info = jInfo as any;
        if (info.filename === file || (info.query && file.includes(info.query.replace(/[^a-zA-Z0-9]/g, '_')))) {
          delete statusData[jId];
          const logFile = path.join(leadsdataDir, `${jId}.log`);
          if (fs.existsSync(logFile)) {
            try { fs.unlinkSync(logFile); } catch (e) {}
          }
        }
      }
    }

    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting lead:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const backendUrl = req.headers.get('x-backend-url') || body.backend_url || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const remoteRes = await fetch(`${cleanBackend}/api/leads`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        return Response.json({ error: fErr.message }, { status: 502 });
      }
    }

    const { file, leadId, updates } = body;

    if (!file || !leadId || !updates) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const backendDir = path.join(process.cwd(), '../backend');
    const leadsdataDir = path.join(backendDir, 'leadsdata');
    let safeFilename = path.basename(file);
    let filePath = path.join(leadsdataDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(leadsdataDir)) {
        const allFiles = fs.readdirSync(leadsdataDir).filter(f => f.endsWith('.xlsx'));
        const fileSlug = safeFilename.replace(/_job_\d+\.xlsx$/, '').replace(/\.xlsx$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const match = allFiles.find(f => {
          const fSlug = f.replace(/_job_\d+\.xlsx$/, '').replace(/\.xlsx$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          return fSlug.includes(fileSlug) || fileSlug.includes(fSlug);
        });
        if (match) {
          safeFilename = match;
          filePath = path.join(leadsdataDir, match);
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }

    // Read workbook
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet) as any[];

    // Find and update row by Lead ID, S.No, or Business Name
    const targetLeadIdStr = String(leadId).trim().toLowerCase();
    const leadIndex = rawData.findIndex(l => {
      const lId = l['Lead ID'] ? String(l['Lead ID']).trim().toLowerCase() : '';
      const sNo = l['S.No'] !== undefined ? String(l['S.No']).trim().toLowerCase() : '';
      const bName = l['Business Name'] ? String(l['Business Name']).trim().toLowerCase() : '';
      return lId === targetLeadIdStr || sNo === targetLeadIdStr || bName === targetLeadIdStr;
    });

    if (leadIndex === -1) {
      return Response.json({ error: `Lead '${leadId}' not found in file` }, { status: 404 });
    }

    rawData[leadIndex] = {
      ...rawData[leadIndex],
      ...updates
    };

    // Extract original ordered column headers to preserve exact layout
    const existingHeaders: string[] = [];
    if (sheet['!ref']) {
      const range = xlsx.utils.decode_range(sheet['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
        if (cell && cell.v) existingHeaders.push(String(cell.v));
      }
    }

    // Ensure all keys from updates are preserved in headers
    if (existingHeaders.length > 0) {
      for (const key of Object.keys(updates)) {
        if (!existingHeaders.includes(key)) {
          existingHeaders.push(key);
        }
      }
    }

    // Write back to sheet with headers preserved
    const newSheet = existingHeaders.length > 0 
      ? xlsx.utils.json_to_sheet(rawData, { header: existingHeaders })
      : xlsx.utils.json_to_sheet(rawData);
    workbook.Sheets[sheetName] = newSheet;
    
    const writeBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(filePath, writeBuffer);

    return Response.json({ success: true, data: rawData[leadIndex] });
  } catch (error: any) {
    console.error('Error updating lead:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

