import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');
    const download = searchParams.get('download');

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
      const safeFilename = path.basename(file);
      const filePath = path.join(leadsdataDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        return Response.json({ error: 'File not found' }, { status: 404 });
      }

      // Download raw file
      if (download === 'true') {
        const fileBuffer = fs.readFileSync(filePath);
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

      // Parse social_links from Python string list/Excel cell format into JSON arrays
      const parsedData = (rawData as any[]).map((item: any) => {
        let socialLinks: string[] = [];
        if (item.social_links) {
          const val = item.social_links;
          if (Array.isArray(val)) {
            socialLinks = val;
          } else if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
              try {
                const jsonStr = trimmed.replace(/'/g, '"');
                socialLinks = JSON.parse(jsonStr);
              } catch (e) {
                try {
                  socialLinks = trimmed
                    .slice(1, -1)
                    .split(',')
                    .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
                    .filter((s: string) => s.length > 0);
                } catch (e2) {
                  socialLinks = [];
                }
              }
            } else if (trimmed.length > 0) {
              socialLinks = trimmed.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            }
          }
        }
        return {
          ...item,
          social_links: socialLinks
        };
      });

      // Sort by Lead Potential: High (1) -> Medium (2) -> Low (3)
      const potentialWeights: any = {
        'High Potential Lead': 1,
        'Medium Potential Lead': 2,
        'Low Potential Lead': 3
      };
      
      const sortedData = parsedData.sort((a, b) => {
        const weightA = potentialWeights[a.lead_potential] || 4;
        const weightB = potentialWeights[b.lead_potential] || 4;
        return weightA - weightB;
      });

      return Response.json({ data: sortedData });
    }

    // 2. List Files & Statuses
    const runsList: any[] = [];
    const processedJobIds = new Set<string>();

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

          if (jobId && statusData[jobId]) {
            query = statusData[jobId].query || query;
            limit = statusData[jobId].limit || limit;
            status = statusData[jobId].status || status;
            timestamp = statusData[jobId].timestamp || timestamp;
            processedJobIds.add(jobId);
          }

          runsList.push({
            filename,
            jobId,
            query,
            limit,
            status,
            size: stats.size,
            timestamp
          });
        }
      }
    }

    // Append jobs that are active or failed and do not have an Excel file yet
    for (const [jobId, jobInfo] of Object.entries(statusData)) {
      if (!processedJobIds.has(jobId)) {
        const info = jobInfo as any;
        runsList.push({
          filename: null,
          jobId,
          query: info.query || 'Unknown Search',
          limit: info.limit || 100,
          status: info.status || 'failed',
          size: 0,
          timestamp: info.timestamp || new Date().toISOString()
        });
      }
    }

    // Sort: newest first
    runsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json({ runs: runsList });
  } catch (error: any) {
    console.error('Error listing leads:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');
    const jobId = searchParams.get('jobId');

    const backendDir = path.join(process.cwd(), '../backend');
    const leadsdataDir = path.join(backendDir, 'leadsdata');
    const statusFile = path.join(leadsdataDir, 'status.json');

    // 1. Delete file if provided
    if (file) {
      const safeFilename = path.basename(file);
      const filePath = path.join(leadsdataDir, safeFilename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted file: ${filePath}`);
      }
    }

    // 2. Remove / Update status from status.json
    let statusData: any = {};
    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      } catch (e) {
        console.error('Error reading status.json', e);
      }
    }

    // Remove by jobId
    if (jobId && statusData[jobId]) {
      delete statusData[jobId];
    } else if (file) {
      // Find matching jobId by scanning statusData
      const match = file.match(/_(job_\d+)\.xlsx$/);
      const extractedJobId = match ? match[1] : null;
      if (extractedJobId && statusData[extractedJobId]) {
        delete statusData[extractedJobId];
      }
    }

    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf-8');

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting lead:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
