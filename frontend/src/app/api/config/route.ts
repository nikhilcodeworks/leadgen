import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const ENV_FILE_PATH = path.join(process.cwd(), '.env.local');

async function testBackend(url: string): Promise<{ ok: boolean; timeMs: number; message: string }> {
  if (!url) {
    return { ok: true, timeMs: 0, message: 'Local PC backend active' };
  }
  const clean = url.trim().replace(/\/+$/, '');
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`${clean}/`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });
    clearTimeout(timeout);
    const timeMs = Date.now() - startTime;
    if (res.ok || res.status === 200 || res.status === 404 || res.status === 301 || res.status === 302 || res.status === 307) {
      return { ok: true, timeMs, message: `Connected to Cloud Backend (${timeMs}ms)` };
    }
    // Fallback try /api/leads
    try {
      const res2 = await fetch(`${clean}/api/leads`, { signal: AbortSignal.timeout(4000) });
      if (res2.ok || res2.status === 200 || res2.status === 404) {
        return { ok: true, timeMs: Date.now() - startTime, message: `Connected to Cloud Backend (${Date.now() - startTime}ms)` };
      }
    } catch (_) {}
    return { ok: false, timeMs, message: `Backend returned HTTP ${res.status}` };
  } catch (err: any) {
    const timeMs = Date.now() - startTime;
    return { ok: false, timeMs, message: `Connection failed: ${err.message || 'Timeout after 7s'}` };
  }
}

async function testHuggingFaceToken(token: string): Promise<{ ok: boolean; message: string; username?: string }> {
  if (!token || !token.trim()) {
    return { ok: false, message: 'No Hugging Face token provided' };
  }
  try {
    const cleanToken = token.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { 'Authorization': `Bearer ${cleanToken}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const username = data.name || data.fullname || 'Authenticated User';
      return { ok: true, message: `Valid Hugging Face Token (@${username})`, username };
    } else if (res.status === 401) {
      return { ok: false, message: 'Invalid token (401 Unauthorized). Check huggingface.co/settings/tokens' };
    }
    return { ok: false, message: `Hugging Face returned HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: `HF validation error: ${err.message || 'Timeout'}` };
  }
}

async function testGeminiKey(key: string): Promise<{ ok: boolean; message: string }> {
  if (!key || !key.trim()) {
    return { ok: false, message: 'No Gemini key provided' };
  }
  try {
    const cleanKey = key.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      return { ok: true, message: 'Valid Google Gemini API Key' };
    }
    return { ok: false, message: 'Invalid Google Gemini API Key' };
  } catch (err: any) {
    return { ok: false, message: `Gemini validation error: ${err.message || 'Timeout'}` };
  }
}

export async function GET(req: NextRequest) {
  try {
    let currentUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || '';
    let hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';
    let geminiKey = process.env.GEMINI_API_KEY || '';

    // Read directly from .env.local if available
    if (fs.existsSync(ENV_FILE_PATH)) {
      try {
        const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
        if (!currentUrl) {
          const m = content.match(/NEXT_PUBLIC_BACKEND_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
          if (m) currentUrl = m[1].trim();
        }
        if (!hfKey) {
          const m = content.match(/(?:HUGGINGFACE_API_KEY|HF_TOKEN)\s*=\s*["']?([^"'\r\n]+)["']?/);
          if (m) hfKey = m[1].trim();
        }
        if (!geminiKey) {
          const m = content.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
          if (m) geminiKey = m[1].trim();
        }
      } catch (e) {}
    }

    const backendResult = await testBackend(currentUrl);
    const hasAi = Boolean(hfKey || geminiKey);
    const isReady = backendResult.ok && hasAi;

    return Response.json({
      backendUrl: currentUrl,
      isConnected: backendResult.ok,
      message: backendResult.message,
      hasHfKey: Boolean(hfKey),
      hasGeminiKey: Boolean(geminiKey),
      isReady
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = (body.backendUrl || '').trim();
    let rawHf = (body.hfApiKey || '').trim();
    let rawGemini = (body.geminiApiKey || '').trim();
    const testOnly = Boolean(body.testOnly);

    // If no keys provided in payload, fallback to env keys to test
    if (!rawHf && !rawGemini && fs.existsSync(ENV_FILE_PATH)) {
      try {
        const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
        const hfMatch = content.match(/(?:HUGGINGFACE_API_KEY|HF_TOKEN)\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (hfMatch) rawHf = hfMatch[1].trim();
        const geminiMatch = content.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (geminiMatch) rawGemini = geminiMatch[1].trim();
      } catch (e) {}
    }
    if (!rawHf) rawHf = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';
    if (!rawGemini) rawGemini = process.env.GEMINI_API_KEY || '';

    const cleanUrl = rawUrl.replace(/\/+$/, '');

    // Concurrently test backend URL, Hugging Face Token, and Gemini Key
    const [backendResult, hfResult, geminiResult] = await Promise.all([
      testBackend(cleanUrl),
      rawHf ? testHuggingFaceToken(rawHf) : Promise.resolve<{ ok: boolean; message: string; username?: string }>({ ok: false, message: 'No Hugging Face token entered' }),
      rawGemini ? testGeminiKey(rawGemini) : Promise.resolve({ ok: false, message: 'No Gemini key entered' })
    ]);

    const hasValidAi = (rawHf && hfResult.ok) || (rawGemini && geminiResult.ok);
    const isReady = backendResult.ok && Boolean(hasValidAi);

    let readyMessage = '';
    if (isReady) {
      const aiInfo = hfResult.ok ? `Hugging Face AI (${hfResult.username ? `@${hfResult.username}` : 'Verified'})` : 'Gemini AI Verified';
      const backendInfo = cleanUrl ? 'Colab 12GB Cloud' : 'Local PC';
      readyMessage = `🎉 READY TO SCRAPE! Backend (${backendInfo}) & AI (${aiInfo}) verified!`;
    } else if (!backendResult.ok) {
      readyMessage = `❌ Backend Error: ${backendResult.message}`;
    } else if (rawHf && !hfResult.ok) {
      readyMessage = `❌ AI Token Error: ${hfResult.message}`;
    } else if (rawGemini && !geminiResult.ok) {
      readyMessage = `❌ Gemini Key Error: ${geminiResult.message}`;
    } else {
      readyMessage = '⚠️ Action Needed: Please enter a Hugging Face Token or Gemini Key to enable AI enrichment.';
    }

    if (testOnly) {
      return Response.json({
        success: isReady,
        isReady,
        backendResult,
        hfResult,
        geminiResult,
        message: readyMessage
      });
    }

    // Update .env.local file permanently
    let envContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    }

    // 1. Backend URL
    if (cleanUrl) {
      if (/NEXT_PUBLIC_BACKEND_URL\s*=/.test(envContent)) {
        envContent = envContent.replace(/NEXT_PUBLIC_BACKEND_URL\s*=.*/g, `NEXT_PUBLIC_BACKEND_URL=${cleanUrl}`);
      } else {
        envContent = envContent.trim() + `\nNEXT_PUBLIC_BACKEND_URL=${cleanUrl}\n`;
      }
      process.env.NEXT_PUBLIC_BACKEND_URL = cleanUrl;
      process.env.BACKEND_URL = cleanUrl;
    } else {
      envContent = envContent.replace(/NEXT_PUBLIC_BACKEND_URL\s*=.*[\r\n]*/g, '');
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
    }

    // 2. Hugging Face Key
    if (rawHf) {
      if (/HUGGINGFACE_API_KEY\s*=/.test(envContent)) {
        envContent = envContent.replace(/HUGGINGFACE_API_KEY\s*=.*/g, `HUGGINGFACE_API_KEY=${rawHf}`);
      } else {
        envContent = envContent.trim() + `\nHUGGINGFACE_API_KEY=${rawHf}\n`;
      }
      if (/HF_TOKEN\s*=/.test(envContent)) {
        envContent = envContent.replace(/HF_TOKEN\s*=.*/g, `HF_TOKEN=${rawHf}`);
      } else {
        envContent = envContent.trim() + `\nHF_TOKEN=${rawHf}\n`;
      }
      process.env.HUGGINGFACE_API_KEY = rawHf;
      process.env.HF_TOKEN = rawHf;
    }

    // 3. Gemini Key
    if (rawGemini) {
      if (/GEMINI_API_KEY\s*=/.test(envContent)) {
        envContent = envContent.replace(/GEMINI_API_KEY\s*=.*/g, `GEMINI_API_KEY=${rawGemini}`);
      } else {
        envContent = envContent.trim() + `\nGEMINI_API_KEY=${rawGemini}\n`;
      }
      process.env.GEMINI_API_KEY = rawGemini;
    }

    fs.writeFileSync(ENV_FILE_PATH, envContent.trim() + '\n', 'utf-8');

    return Response.json({
      success: true,
      isReady,
      backendUrl: cleanUrl,
      backendResult,
      hfResult,
      geminiResult,
      message: readyMessage
    });
  } catch (error: any) {
    console.error('Error in /api/config:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
