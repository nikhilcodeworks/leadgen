import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawGoal = (body.goal || '').trim();
    if (!rawGoal) {
      return Response.json({ error: 'Goal cannot be empty' }, { status: 400 });
    }

    const backendUrl = req.headers.get('x-backend-url') || body.backend_url || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const remoteRes = await fetch(`${cleanBackend}/api/ai-copilot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        console.error('Error proxying to remote backend /api/ai-copilot:', fErr);
        // Continue to local execution if proxy fails
      }
    }

    // Determine HF token if available
    let hfToken = body.hf_api_key || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
    if (!hfToken) {
      const backendDir = path.join(process.cwd(), '../backend');
      for (const envPath of [
        path.join(backendDir, '.env'),
        path.join(process.cwd(), '../.env'),
        path.join(process.cwd(), '.env.local')
      ]) {
        if (fs.existsSync(envPath)) {
          try {
            const content = fs.readFileSync(envPath, 'utf-8');
            const m = content.match(/(?:HUGGINGFACE_API_KEY|HF_TOKEN)=([^\s#]+)/);
            if (m && m[1]) {
              hfToken = m[1].trim();
              break;
            }
          } catch (e) {}
        }
      }
    }

    const systemPrompt = 
`You are an expert B2B Lead Generation & Local Market Strategist.
The user will describe their service, offer, or lead generation goal in natural language (English or Hinglish).
Your job is to analyze their intent and return a clean JSON object with:
1. query: the most effective, direct Google Maps search query string (e.g. 'dental clinics in South Delhi' or 'hair salons in Mumbai').
2. service_offer: one of ['website', 'ai_agent', 'crm_automation', 'local_seo', 'custom'].
3. custom_goal: a concise 1-2 sentence description of the target ICP and exact value proposition to qualify leads.
4. suggested_queries: an array of 3-5 alternative localized Google Maps search query variations.
5. target_audience: a short summary of the ideal customer profile.

Respond ONLY with a valid JSON object without markdown or code fences.`;

    if (hfToken) {
      const endpoints = [
        'https://router.huggingface.co/v1/chat/completions',
        'https://router.huggingface.co/hf-inference/v1/chat/completions',
        'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions'
      ];

      const payload = {
        model: 'Qwen/Qwen2.5-72B-Instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User Goal: ${rawGoal}` }
        ],
        temperature: 0.3,
        max_tokens: 512
      };

      for (const ep of endpoints) {
        try {
          const resp = await fetch(ep, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${hfToken.trim()}`
            },
            body: JSON.stringify(payload)
          });

          if (resp.ok) {
            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content?.trim() || '';
            const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
              const parsed = JSON.parse(cleaned.substring(start, end + 1));
              return Response.json({ success: true, data: parsed });
            }
          }
        } catch (callErr) {
          console.warn(`HF copilot call error on ${ep}:`, callErr);
        }
      }
    }

    // Heuristic Fallback if offline or LLM unavailable
    const goalLower = rawGoal.toLowerCase();
    let inferredOffer = 'all_round';
    if (/website|web design|site|web dev|redesign|landing page/.test(goalLower)) {
      inferredOffer = 'website';
    } else if (/ai agent|chatbot|chat bot|voice agent|receptionist|phone agent|ai bot|bot/.test(goalLower)) {
      inferredOffer = 'ai_agent';
    } else if (/crm|automation|automate|pipeline|follow up|followup|booking/.test(goalLower)) {
      inferredOffer = 'crm_automation';
    } else if (/seo|reviews|review|google maps rank|rating|reputation/.test(goalLower)) {
      inferredOffer = 'local_seo';
    } else {
      inferredOffer = 'custom';
    }

    // Clean up query extraction from goal
    let queryClean = rawGoal
      .replace(/pitch(ing)?\s+(for\s+)?/gi, '')
      .replace(/lead(s)?\s+(for\s+)?/gi, '')
      .replace(/find(ing)?\s+/gi, '')
      .replace(/search(ing)?\s+/gi, '')
      .trim();

    if (!queryClean || queryClean.length < 3) {
      queryClean = rawGoal;
    }

    return Response.json({
      success: true,
      data: {
        query: queryClean,
        service_offer: inferredOffer,
        custom_goal: rawGoal,
        suggested_queries: [
          queryClean,
          `${queryClean} best`,
          `top ${queryClean}`,
          `${queryClean} near me`
        ],
        target_audience: `High-intent prospects for ${inferredOffer.replace('_', ' ')}`
      }
    });
  } catch (error: any) {
    console.error('Error in /api/ai-copilot:', error);
    return Response.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
