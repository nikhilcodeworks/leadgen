import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const ENV_FILE_PATH = path.join(process.cwd(), '.env.local');

export async function GET(req: NextRequest) {
  try {
    let currentUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || '';
    
    // Also read directly from .env.local if not loaded yet
    if (!currentUrl && fs.existsSync(ENV_FILE_PATH)) {
      try {
        const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
        const match = content.match(/NEXT_PUBLIC_BACKEND_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (match) currentUrl = match[1].trim();
      } catch (e) {}
    }

    let isConnected = false;
    let message = 'Local PC backend';

    if (currentUrl) {
      try {
        const clean = currentUrl.replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${clean}/`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok || res.status === 200 || res.status === 404) {
          isConnected = true;
          message = 'Connected to Colab / Cloud backend (12GB RAM)';
        } else {
          message = `Backend returned HTTP ${res.status}`;
        }
      } catch (err: any) {
        isConnected = false;
        message = `Could not reach ${currentUrl}: ${err.message || 'Timeout'}`;
      }
    }

    return Response.json({
      backendUrl: currentUrl,
      isConnected,
      message,
      isLocal: !currentUrl
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = (body.backendUrl || '').trim();
    const testOnly = Boolean(body.testOnly);

    const cleanUrl = rawUrl.replace(/\/+$/, '');

    // Test connectivity if URL is given
    let isConnected = false;
    let pingTimeMs = 0;
    let pingMsg = '';

    if (cleanUrl) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${cleanUrl}/`, { signal: controller.signal });
        clearTimeout(timeout);
        pingTimeMs = Date.now() - startTime;
        if (res.ok || res.status === 200 || res.status === 404) {
          isConnected = true;
          pingMsg = `Connected in ${pingTimeMs}ms (Google Colab Cloud)`;
        } else {
          pingMsg = `Backend reachable but returned HTTP ${res.status}`;
        }
      } catch (err: any) {
        pingMsg = `Connection failed: ${err.message || 'Timeout after 5s'}`;
        isConnected = false;
      }
    } else {
      isConnected = true;
      pingMsg = 'Using Local PC backend';
    }

    if (testOnly) {
      return Response.json({
        success: isConnected,
        backendUrl: cleanUrl,
        isConnected,
        pingTimeMs,
        message: pingMsg
      });
    }

    // Save permanently to .env.local
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    }

    if (cleanUrl) {
      // Update or append NEXT_PUBLIC_BACKEND_URL
      if (/NEXT_PUBLIC_BACKEND_URL\s*=/.test(envContent)) {
        envContent = envContent.replace(
          /NEXT_PUBLIC_BACKEND_URL\s*=.*/g,
          `NEXT_PUBLIC_BACKEND_URL=${cleanUrl}`
        );
      } else {
        envContent = envContent.trim() + `\nNEXT_PUBLIC_BACKEND_URL=${cleanUrl}\n`;
      }
      // Also update in-memory process.env
      process.env.NEXT_PUBLIC_BACKEND_URL = cleanUrl;
      process.env.BACKEND_URL = cleanUrl;
    } else {
      // Remove from .env.local to revert to local
      envContent = envContent.replace(/NEXT_PUBLIC_BACKEND_URL\s*=.*[\r\n]*/g, '');
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
    }

    fs.writeFileSync(ENV_FILE_PATH, envContent.trim() + '\n', 'utf-8');

    return Response.json({
      success: true,
      backendUrl: cleanUrl,
      isConnected,
      message: cleanUrl 
        ? `Saved! Connected to Colab (${cleanUrl})` 
        : 'Saved! Reverted to Local PC backend'
    });
  } catch (error: any) {
    console.error('Error in /api/config:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
