import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';

const LOCALITY_METRO_MAP: Record<string, [string, string]> = {
  // Delhi NCR
  'vasant vihar': ['Vasant Vihar', 'New Delhi'],
  'vasant kunj': ['Vasant Kunj', 'New Delhi'],
  'hauz khas': ['Hauz Khas', 'New Delhi'],
  'saket': ['Saket', 'New Delhi'],
  'greater kailash': ['Greater Kailash', 'New Delhi'],
  'gk 1': ['GK 1', 'New Delhi'],
  'gk 2': ['GK 2', 'New Delhi'],
  'gk': ['Greater Kailash', 'New Delhi'],
  'defence colony': ['Defence Colony', 'New Delhi'],
  'def col': ['Defence Colony', 'New Delhi'],
  'south extension': ['South Extension', 'New Delhi'],
  'south ex': ['South Extension', 'New Delhi'],
  'lajpat nagar': ['Lajpat Nagar', 'New Delhi'],
  'connaught place': ['Connaught Place', 'New Delhi'],
  'cp': ['Connaught Place', 'New Delhi'],
  'chanakyapuri': ['Chanakyapuri', 'New Delhi'],
  'malviya nagar': ['Malviya Nagar', 'New Delhi'],
  'green park': ['Green Park', 'New Delhi'],
  'dwarka': ['Dwarka', 'New Delhi'],
  'rohini': ['Rohini', 'New Delhi'],
  'janakpuri': ['Janakpuri', 'New Delhi'],
  'pitampura': ['Pitampura', 'New Delhi'],
  'karol bagh': ['Karol Bagh', 'New Delhi'],
  'rajouri garden': ['Rajouri Garden', 'New Delhi'],
  'punjabi bagh': ['Punjabi Bagh', 'New Delhi'],
  'paschim vihar': ['Paschim Vihar', 'New Delhi'],
  'shahdara': ['Shahdara', 'New Delhi'],
  'preet vihar': ['Preet Vihar', 'New Delhi'],
  'mayur vihar': ['Mayur Vihar', 'New Delhi'],
  'okhla': ['Okhla', 'New Delhi'],
  'jasola': ['Jasola', 'New Delhi'],
  'kalkaji': ['Kalkaji', 'New Delhi'],
  'nehru place': ['Nehru Place', 'New Delhi'],
  'south delhi': ['South Delhi', 'Delhi'],
  'north delhi': ['North Delhi', 'Delhi'],
  'west delhi': ['West Delhi', 'Delhi'],
  'east delhi': ['East Delhi', 'Delhi'],
  'central delhi': ['Central Delhi', 'Delhi'],
  'cyber city': ['DLF Cyber City', 'Gurugram'],
  'cyber hub': ['DLF Cyber City', 'Gurugram'],
  'golf course road': ['Golf Course Road', 'Gurugram'],
  'golf course extension': ['Golf Course Extension Road', 'Gurugram'],
  'sohna road': ['Sohna Road', 'Gurugram'],
  'sector 29 gurgaon': ['Sector 29', 'Gurugram'],
  'sector 29': ['Sector 29', 'Gurugram'],
  'sector 56 gurgaon': ['Sector 56', 'Gurugram'],
  'mg road gurgaon': ['MG Road', 'Gurugram'],
  'gurugram': ['Gurugram', 'Haryana'],
  'gurgaon': ['Gurugram', 'Haryana'],
  'noida sector 18': ['Sector 18', 'Noida'],
  'noida sector 62': ['Sector 62', 'Noida'],
  'sector 18 noida': ['Sector 18', 'Noida'],
  'sector 62 noida': ['Sector 62', 'Noida'],
  'noida': ['Noida', 'Uttar Pradesh'],
  'greater noida': ['Greater Noida', 'Uttar Pradesh'],
  'faridabad': ['Faridabad', 'Haryana'],
  'indirapuram': ['Indirapuram', 'Ghaziabad'],

  // Mumbai & MMR
  'bandra west': ['Bandra West', 'Mumbai'],
  'bandra east': ['Bandra East', 'Mumbai'],
  'bandra': ['Bandra', 'Mumbai'],
  'andheri west': ['Andheri West', 'Mumbai'],
  'andheri east': ['Andheri East', 'Mumbai'],
  'andheri': ['Andheri', 'Mumbai'],
  'juhu': ['Juhu', 'Mumbai'],
  'bandra kurla complex': ['Bandra Kurla Complex', 'Mumbai'],
  'bkc': ['Bandra Kurla Complex', 'Mumbai'],
  'powai': ['Powai', 'Mumbai'],
  'worli': ['Worli', 'Mumbai'],
  'colaba': ['Colaba', 'Mumbai'],
  'lower parel': ['Lower Parel', 'Mumbai'],
  'dadar': ['Dadar', 'Mumbai'],
  'malad': ['Malad', 'Mumbai'],
  'borivali': ['Borivali', 'Mumbai'],
  'goregaon': ['Goregaon', 'Mumbai'],
  'santacruz': ['Santacruz', 'Mumbai'],
  'santa cruz': ['Santacruz', 'Mumbai'],
  'khar': ['Khar', 'Mumbai'],
  'chembur': ['Chembur', 'Mumbai'],
  'ghatkopar': ['Ghatkopar', 'Mumbai'],
  'mulund': ['Mulund', 'Mumbai'],
  'thane': ['Thane', 'Maharashtra'],
  'navi mumbai': ['Navi Mumbai', 'Maharashtra'],
  'vashi': ['Vashi', 'Navi Mumbai'],

  // Bengaluru
  'koramangala': ['Koramangala', 'Bengaluru'],
  'indiranagar': ['Indiranagar', 'Bengaluru'],
  'whitefield': ['Whitefield', 'Bengaluru'],
  'hsr layout': ['HSR Layout', 'Bengaluru'],
  'hsr': ['HSR Layout', 'Bengaluru'],
  'electronic city': ['Electronic City', 'Bengaluru'],
  'jp nagar': ['JP Nagar', 'Bengaluru'],
  'jayanagar': ['Jayanagar', 'Bengaluru'],
  'mg road bangalore': ['MG Road', 'Bengaluru'],
  'marathahalli': ['Marathahalli', 'Bengaluru'],
  'bellandur': ['Bellandur', 'Bengaluru'],
  'sarjapur road': ['Sarjapur Road', 'Bengaluru'],
  'btm layout': ['BTM Layout', 'Bengaluru'],
  'hebbal': ['Hebbal', 'Bengaluru'],
  'yelahanka': ['Yelahanka', 'Bengaluru'],
  'malleshwaram': ['Malleshwaram', 'Bengaluru'],
  'rajajinagar': ['Rajajinagar', 'Bengaluru'],
  'kalyan nagar': ['Kalyan Nagar', 'Bengaluru'],

  // Hyderabad
  'hitec city': ['Hitec City', 'Hyderabad'],
  'gachibowli': ['Gachibowli', 'Hyderabad'],
  'jubilee hills': ['Jubilee Hills', 'Hyderabad'],
  'banjara hills': ['Banjara Hills', 'Hyderabad'],
  'madhapur': ['Madhapur', 'Hyderabad'],
  'kondapur': ['Kondapur', 'Hyderabad'],
  'kukatpally': ['Kukatpally', 'Hyderabad'],
  'begumpet': ['Begumpet', 'Hyderabad'],
  'financial district': ['Financial District', 'Hyderabad'],

  // Pune
  'koregaon park': ['Koregaon Park', 'Pune'],
  'viman nagar': ['Viman Nagar', 'Pune'],
  'baner': ['Baner', 'Pune'],
  'wakad': ['Wakad', 'Pune'],
  'hinjewadi': ['Hinjewadi', 'Pune'],
  'kalyani nagar': ['Kalyani Nagar', 'Pune'],
  'aundh': ['Aundh', 'Pune'],
  'shivaji nagar': ['Shivaji Nagar', 'Pune'],
  'kothrud': ['Kothrud', 'Pune'],
  'magarpatta': ['Magarpatta', 'Pune'],

  // Kolkata
  'park street': ['Park Street', 'Kolkata'],
  'salt lake': ['Salt Lake', 'Kolkata'],
  'new town': ['New Town', 'Kolkata'],
  'ballygunge': ['Ballygunge', 'Kolkata'],
  'alipore': ['Alipore', 'Kolkata'],

  // Chennai
  't nagar': ['T Nagar', 'Chennai'],
  'adyar': ['Adyar', 'Chennai'],
  'velachery': ['Velachery', 'Chennai'],
  'anna nagar': ['Anna Nagar', 'Chennai'],
  'omr': ['OMR', 'Chennai'],
  'mylapore': ['Mylapore', 'Chennai'],

  // Ahmedabad
  'sg highway': ['SG Highway', 'Ahmedabad'],
  'satellite': ['Satellite', 'Ahmedabad'],
  'bodakdev': ['Bodakdev', 'Ahmedabad'],
  'vastrapur': ['Vastrapur', 'Ahmedabad'],
  'prahlad nagar': ['Prahlad Nagar', 'Ahmedabad'],
  'navrangpura': ['Navrangpura', 'Ahmedabad'],
  'sindhu bhavan road': ['Sindhu Bhavan Road', 'Ahmedabad'],

  // Global Hubs
  'manhattan': ['Manhattan', 'New York'],
  'brooklyn': ['Brooklyn', 'New York'],
  'soho': ['SoHo', 'New York'],
  'beverly hills': ['Beverly Hills', 'California'],
  'mayfair': ['Mayfair', 'London'],
  'canary wharf': ['Canary Wharf', 'London']
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawQuery = (body.query || '').trim();
    if (!rawQuery) {
      return Response.json({ error: 'Query cannot be empty' }, { status: 400 });
    }

    const backendUrl = req.headers.get('x-backend-url') || body.backend_url || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      try {
        const cleanBackend = backendUrl.replace(/\/+$/, '');
        const remoteRes = await fetch(`${cleanBackend}/api/optimize-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const remoteData = await remoteRes.json();
        return Response.json(remoteData, { status: remoteRes.status });
      } catch (fErr: any) {
        console.error('Error proxying to remote backend /api/optimize-query:', fErr);
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

    if (hfToken) {
      const systemPrompt = 
`You are an expert Google Maps Search Query Optimizer.
Given a user's search query (which may lack prepositions, city context, or proper syntax), optimize it for maximum precision on Google Maps.
Rules:
1. Extract the core business category / niche (e.g. 'Luxury real estate developers', 'Dentists', 'Italian restaurants').
2. Extract the specific locality, neighborhood, or area (e.g. 'Vasant Vihar', 'Bandra', 'Koramangala', 'SoHo').
3. If the locality belongs to a well-known metro area (e.g. 'Vasant Vihar' -> 'New Delhi', 'Bandra' -> 'Mumbai'), append the metro city.
4. Construct the optimized search query in Google Maps format: '[Category] in [Locality], [Metro City]'.
Return ONLY a clean JSON object with keys: 'optimized_query', 'target_area', 'niche', 'city', 'locality'. No markdown or backticks.`;

      const payload = {
        model: 'Qwen/Qwen2.5-72B-Instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Query: ${rawQuery}` }
        ],
        temperature: 0.2,
        max_tokens: 256
      };

      const endpoints = [
        'https://router.huggingface.co/v1/chat/completions',
        'https://router.huggingface.co/hf-inference/v1/chat/completions',
        'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions'
      ];

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
            const rJson = await resp.json();
            const c = rJson.choices?.[0]?.message?.content?.trim() || '';
            const cClean = c.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
            const s = cClean.indexOf('{');
            const e = cClean.lastIndexOf('}');
            if (s !== -1 && e !== -1) {
              const data = JSON.parse(cClean.substring(s, e + 1));
              if (data.optimized_query) {
                return Response.json({
                  success: true,
                  data: {
                    ...data,
                    method: 'llm',
                    original_query: rawQuery
                  }
                });
              }
            }
          }
        } catch (llmErr) {
          // Fall through to heuristic
        }
      }
    }

    // Heuristic Fallback
    const qLower = rawQuery.toLowerCase();
    const sortedKeys = Object.keys(LOCALITY_METRO_MAP).sort((a, b) => b.length - a.length);

    for (const locKey of sortedKeys) {
      const regex = new RegExp(`\\b${locKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(qLower)) {
        const [locName, cityName] = LOCALITY_METRO_MAP[locKey];
        let niche = rawQuery.replace(regex, '').trim();
        niche = niche.replace(/\b(in|at|near|of|for)\b\s*$/i, '').trim();
        niche = niche.replace(/^\s*\b(in|at|near|of|for)\b/i, '').trim();
        niche = niche.replace(/\s+/g, ' ').trim();
        const area = `${locName}, ${cityName}`;
        const optQuery = niche ? `${niche} in ${area}` : area;
        return Response.json({
          success: true,
          data: {
            optimized_query: optQuery,
            target_area: area,
            niche: niche || rawQuery,
            city: cityName,
            locality: locName,
            method: 'heuristic_locality_match',
            original_query: rawQuery
          }
        });
      }
    }

    // Check for "in" / "at"
    const prepMatch = rawQuery.match(/^(.*?)\s+\b(in|at|near)\b\s+(.*)$/i);
    if (prepMatch) {
      const niche = prepMatch[1].trim();
      const loc = prepMatch[3].trim();
      return Response.json({
        success: true,
        data: {
          optimized_query: `${niche} in ${loc}`,
          target_area: loc,
          niche: niche,
          city: '',
          locality: loc,
          method: 'heuristic_prep_split',
          original_query: rawQuery
        }
      });
    }

    // Passthrough default
    return Response.json({
      success: true,
      data: {
        optimized_query: rawQuery,
        target_area: '',
        niche: rawQuery,
        city: '',
        locality: '',
        method: 'passthrough',
        original_query: rawQuery
      }
    });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
