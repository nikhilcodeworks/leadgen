import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

function loadHfToken(body: any): string {
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
          const fc = fs.readFileSync(envPath, 'utf-8');
          const m = fc.match(/(?:HUGGINGFACE_API_KEY|HF_TOKEN)=([^\s#]+)/);
          if (m && m[1]) { hfToken = m[1].trim(); break; }
        } catch (e) {}
      }
    }
  }
  return hfToken || '';
}

async function callHfLlm(hfToken: string, systemPrompt: string, userMessage: string): Promise<any | null> {
  const endpoints = [
    'https://router.huggingface.co/v1/chat/completions',
    'https://router.huggingface.co/hf-inference/v1/chat/completions',
    'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions'
  ];
  const payload = {
    model: 'Qwen/Qwen2.5-72B-Instruct',
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    temperature: 0.3,
    max_tokens: 1200
  };
  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfToken.trim()}` },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        const raw = data?.choices?.[0]?.message?.content?.trim() || '';
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const sa = cleaned.indexOf('['), so = cleaned.indexOf('{');
        if (sa !== -1 && (so === -1 || sa < so)) {
          const e = cleaned.lastIndexOf(']');
          if (e !== -1) { try { return JSON.parse(cleaned.substring(sa, e + 1)); } catch {} }
        }
        if (so !== -1) {
          const e = cleaned.lastIndexOf('}');
          if (e !== -1) { try { return JSON.parse(cleaned.substring(so, e + 1)); } catch {} }
        }
      }
    } catch (callErr) { console.warn('HF LLM error:', ep, callErr); }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'goal';
    const backendUrlGlobal = req.headers.get('x-backend-url') || body.backend_url || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

    // ─── MODE: suggest_niches ─────────────────────────────────────────────
    if (mode === 'suggest_niches') {
      const businessContext = (body.business_context || '').trim();
      const targetCity = (body.target_city || '').trim();
      if (!businessContext) return Response.json({ error: 'business_context is required' }, { status: 400 });

      if (backendUrlGlobal) {
        try {
          const cb = backendUrlGlobal.replace(/\/+$/, '');
          const r = await fetch(`${cb}/api/ai-copilot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const d = await r.json();
          if (d.success && d.niches) return Response.json(d, { status: r.status });
        } catch (pe) { console.error('Proxy suggest_niches error:', pe); }
      }

      const hfTok = loadHfToken(body);
      const nichePrompt = `You are a B2B sales strategist for India. Given a business description, suggest 5-6 industry niches they should target. Return ONLY a valid JSON array (no markdown). Each item: {niche,industry,why,pain_point,service_offer (website/ai_agent/crm_automation/local_seo/custom/all_round),icon (emoji),opportunity_level (Very High/High/Medium)}.`;
      if (hfTok) {
        const r = await callHfLlm(hfTok, nichePrompt, `Business: "${businessContext}"\nCity: "${targetCity || 'India'}"\nSuggest 5-6 niches.`);
        if (Array.isArray(r) && r.length > 0) return Response.json({ success: true, niches: r });
        if (r && typeof r === 'object') {
          const arr = (r as any).niches || Object.values(r);
          if (Array.isArray(arr) && arr.length > 0) return Response.json({ success: true, niches: arr });
        }
      }

      const city = targetCity || 'your city';
      const bl = businessContext.toLowerCase();
      let niches: any[];
      if (/website|web design|web dev|landing page/.test(bl)) {
        niches = [
          { niche: 'Dental & Cosmetic Clinics', industry: 'Healthcare', why: `Dental clinics in ${city} often have outdated or no websites, losing patients to online-ready competitors.`, pain_point: 'No website = losing 60%+ leads who research online before visiting.', service_offer: 'website', icon: '\u{1F9B7}', opportunity_level: 'Very High' },
          { niche: 'Luxury Salons & Spas', industry: 'Beauty & Wellness', why: `Premium salons in ${city} need elegant websites to match their brand.`, pain_point: 'Relying only on Instagram loses clients who want to book via a proper website.', service_offer: 'website', icon: '\u{1F486}', opportunity_level: 'Very High' },
          { niche: 'Interior Design Studios', industry: 'Design', why: 'Portfolio businesses need stunning websites to showcase work and attract premium projects.', pain_point: 'Instagram portfolios are not location-searchable, losing SEO-driven clients.', service_offer: 'website', icon: '\u{1F3E0}', opportunity_level: 'High' },
          { niche: 'CA & Finance Consultancy', industry: 'Finance', why: 'Finance professionals need digital credibility—a professional website signals trustworthiness.', pain_point: 'Outdated sites make them look less credible vs larger firms.', service_offer: 'website', icon: '\u{1F4CA}', opportunity_level: 'High' },
          { niche: 'Boutique Hotels & Homestays', industry: 'Hospitality', why: `Small hospitality businesses in ${city} lose bookings to OTAs due to lack of direct booking sites.`, pain_point: 'Paying 15-25% OTA commission is avoidable with a direct booking website.', service_offer: 'website', icon: '\u{1F3E8}', opportunity_level: 'High' }
        ];
      } else if (/whatsapp|chatbot|ai.?bot|ai agent|receptionist|automation/.test(bl)) {
        niches = [
          { niche: 'Dental & Medical Clinics', industry: 'Healthcare', why: `Clinics in ${city} receive hundreds of appointment inquiries daily—AI handles 24/7 at zero extra staff cost.`, pain_point: 'Staff wastes 3+ hours/day on manual appointment calls and WhatsApp replies.', service_offer: 'ai_agent', icon: '\u{1F3E5}', opportunity_level: 'Very High' },
          { niche: 'Real Estate Agencies', industry: 'Real Estate', why: 'Real estate agents need instant response—prospects move to the next agent within 5 minutes of no reply.', pain_point: 'Cold leads due to delayed response is the #1 problem in real estate sales.', service_offer: 'ai_agent', icon: '\u{1F3D7}', opportunity_level: 'Very High' },
          { niche: 'Premium Fitness Studios', industry: 'Fitness', why: `Luxury gyms in ${city} need smooth trial booking without extra staff.`, pain_point: 'Delayed responses to trial inquiries cost thousands in missed memberships monthly.', service_offer: 'ai_agent', icon: '\u{1F3CB}', opportunity_level: 'High' },
          { niche: 'Coaching & EdTech Centers', industry: 'Education', why: 'Coaching institutes receive peak inquiries during admissions—AI scales response instantly.', pain_point: 'Counselors cannot handle 200+ simultaneous inquiries, losing enrollments.', service_offer: 'ai_agent', icon: '\u{1F4DA}', opportunity_level: 'High' },
          { niche: 'Wedding Planners & Event Companies', industry: 'Events', why: 'Event businesses need rapid qualification of leads before clients book competitors.', pain_point: 'Missing a single wedding inquiry can mean losing lakhs in revenue.', service_offer: 'ai_agent', icon: '\u{1F492}', opportunity_level: 'High' }
        ];
      } else {
        niches = [
          { niche: 'Dental Clinics', industry: 'Healthcare', why: `High-margin local businesses in ${city} with clear pain points and budget for professional services.`, pain_point: 'Lack professional digital presence and automated patient communication.', service_offer: 'all_round', icon: '\u{1F9B7}', opportunity_level: 'Very High' },
          { niche: 'Real Estate Consultants', industry: 'Real Estate', why: `Real estate in ${city} is high-value—every lead matters and agents invest in conversion tools.`, pain_point: 'No systematic CRM follow-up causes leads to go cold.', service_offer: 'crm_automation', icon: '\u{1F3D7}', opportunity_level: 'Very High' },
          { niche: 'Luxury Salons & Spas', industry: 'Beauty', why: `Beauty businesses in ${city} have high footfall intent but weak digital infrastructure.`, pain_point: 'No online booking, no website, no automation—rely entirely on walk-ins.', service_offer: 'website', icon: '\u{1F486}', opportunity_level: 'High' },
          { niche: 'Restaurants & Cloud Kitchens', industry: 'Food & Beverage', why: 'F&B is one of the largest Google Maps categories with intense competition for visibility.', pain_point: 'Low Google ratings and no reputation management strategy.', service_offer: 'local_seo', icon: '\u{1F37D}', opportunity_level: 'High' },
          { niche: 'Coaching & Training Institutes', industry: 'Education', why: 'Education industry invests heavily in student acquisition and values automation tools.', pain_point: 'Admission inquiries often go unanswered during peak season.', service_offer: 'ai_agent', icon: '\u{1F4DA}', opportunity_level: 'High' }
        ];
      }
      return Response.json({ success: true, niches });
    }

    // ─── MODE: goal (existing behavior) ──────────────────────────────────
    const rawGoal = (body.goal || '').trim();
    if (!rawGoal) {
      return Response.json({ error: 'Goal cannot be empty' }, { status: 400 });
    }

    const backendUrl = backendUrlGlobal;
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
      }
    }

    // Use shared HF token loader and LLM caller
    const hfToken = loadHfToken(body);
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
      const result = await callHfLlm(hfToken, systemPrompt, `User Goal: ${rawGoal}`);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return Response.json({ success: true, data: result });
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
