#!/usr/bin/env python3
"""
Google Maps Search Results Scraper & LLM Lead Analyzer
-------------------------------------------------------
A script that uses Playwright (with playwright-stealth) to search Google Maps,
scroll through results, click each listing, extract structured details and full text.
After scraping, it uses Gemini to analyze the leads, appends them to final.txt,
compiles them into a sorted master Excel sheet in leadsdata/, and deletes temp files.
"""

import argparse
import glob
import json
import os
import random
import re
import shutil
import sys
import time
import urllib.parse
import requests

# Ensure stdout and stderr handle all Unicode characters on Windows
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Load environment variables from .env files
try:
    from dotenv import load_dotenv
    script_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(script_dir, ".env"))
    load_dotenv(os.path.join(script_dir, "..", ".env"))
    load_dotenv(os.path.join(script_dir, "..", "frontend", ".env.local"))
except Exception:
    pass

# Fallback manual .env loader if keys are not yet in os.environ
for env_path in [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", ".env.local"),
]:
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as ef:
                for line in ef:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"\'')
                        if k in ["GEMINI_API_KEY", "HUGGINGFACE_API_KEY", "HF_TOKEN"] and v and not os.environ.get(k):
                            os.environ[k] = v
        except Exception:
            pass


from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import pandas as pd
from pydantic import BaseModel, Field


class LeadAnalysis(BaseModel):
    city: str = Field(description="The city where the business is located.")
    zone: str = Field(description="The zone/district region of the city (e.g. West Zone, SG Highway Area, or Unknown).")
    locality: str = Field(description="The specific locality or neighborhood (e.g. Navrangpura, Satellite).")
    website_quality: str = Field(description="Quality of their website/digital presence. One of: 'No Website', 'Poor', 'Average', 'Good', 'Excellent'")
    mobile_website: str = Field(description="Is the website mobile-friendly? One of: 'No Website', 'Yes', 'No', 'Unknown'")
    online_booking: str = Field(description="Does the business support online booking? One of: 'Yes', 'No', 'Unknown'")
    whatsapp: str = Field(description="Is there a WhatsApp contact option? One of: 'Yes', 'No'")
    instagram: str = Field(description="Instagram link if found in text, otherwise empty string.")
    instagram_activity: str = Field(description="Inferred Instagram activity level. One of: 'Active', 'Inactive', 'Unknown'")
    facebook: str = Field(description="Facebook link if found in text, otherwise empty string.")
    contact_person: str = Field(description="Name or role of contact person if mentioned in reviews/description, otherwise 'Unknown'.")
    problem_found: str = Field(description="A specific problem or gap identified in their business operation, digital presence, or reviews.")
    problem_evidence: str = Field(description="Evidence/quotes from reviews or listing details supporting the problem found.")
    recommended_service: str = Field(description="Service we should recommend to resolve their problem (e.g. Local SEO, Web Development, Reputation Management, etc.).")
    pitch_angle: str = Field(description="A customized sales pitch angle for this specific client.")
    lead_score: int = Field(description="Lead score from 0 to 100 based on reviews count, rating, digital gaps, and revenue potential.")
    lead_tier: str = Field(description="Must be one of: '🔥 Hot', '🟢 Good', '🟡 Medium', '❌ Skip'")



def format_lead_tier(score, raw_tier=None):
    """
    Formats lead tier with reference emojis:
    - 85-100: 🔥 Hot
    - 70-84:  🟢 Good
    - 45-69:  🟡 Medium
    - <45:    ❌ Skip
    """
    try:
        s = int(score)
    except (ValueError, TypeError):
        s = 50

    if raw_tier:
        rt = str(raw_tier).strip()
        if "hot" in rt.lower() or "🔥" in rt:
            return "🔥 Hot"
        if "good" in rt.lower() or "🟢" in rt or "tier 1" in rt.lower():
            return "🔥 Hot" if s >= 85 else "🟢 Good"
        if "medium" in rt.lower() or "🟡" in rt or "tier 2" in rt.lower():
            return "🟡 Medium"
        if "skip" in rt.lower() or "❌" in rt or "low" in rt.lower() or "tier 3" in rt.lower():
            return "❌ Skip" if s < 45 else ("🟡 Medium" if s < 70 else "🟢 Good")

    if s >= 85:
        return "🔥 Hot"
    elif s >= 70:
        return "🟢 Good"
    elif s >= 45:
        return "🟡 Medium"
    else:
        return "❌ Skip"



def random_delay(min_sec=1.0, max_sec=2.5):
    """Sleep for a random duration to mimic human browsing behavior."""
    delay = random.uniform(min_sec, max_sec)
    time.sleep(delay)


def render_cli_progress(current, total, prefix="Progress", status=""):
    """Render a clean CLI progress bar in terminal."""
    try:
        if total <= 0:
            total = 1
        pct = min(100, int((current / total) * 100))
        bar_len = 24
        filled = int(bar_len * current // total)
        bar = "=" * filled + "-" * (bar_len - filled)
        status_short = (status[:36] + '...') if len(status) > 36 else status
        sys.stdout.write(f"\r[{bar}] {pct:3d}% | {prefix}: {current}/{total} {status_short:<40}")
        sys.stdout.flush()
        if current >= total:
            sys.stdout.write("\n")
            sys.stdout.flush()
    except Exception:
        pass


def is_job_cancelled(job_id):
    """
    Checks if the job was deleted from status.json or marked as cancelled by the user.
    """
    if not job_id:
        return False
    status_file = os.path.join("leadsdata", "status.json")
    if not os.path.exists(status_file):
        return False
    try:
        with open(status_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if job_id not in data:
            return True
        if data[job_id].get("status") in ["cancelled", "deleted"]:
            return True
    except Exception:
        pass
    return False


def update_job_status(job_id, status, query=None, limit=None, progress=None, status_message=None, stage=None, current=None, total=None, filename=None):
    """
    Updates the shared status.json file with current progress.
    Checks if job was cancelled or deleted by user to abort immediately.
    """
    if not job_id:
        return
        
    status_file = os.path.join("leadsdata", "status.json")
    os.makedirs("leadsdata", exist_ok=True)
    data = {}
    if os.path.exists(status_file):
        try:
            with open(status_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
            
    if job_id not in data:
        # Only allow creating job entry at the very beginning of the run
        if stage in ["starting", "initializing"] or (status == "active" and (progress is None or progress <= 5)):
            data[job_id] = {
                "query": query,
                "limit": limit,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "progress": 0,
                "stage": "starting",
                "current": 0,
                "total": limit or 0,
                "status_message": "Initializing..."
            }
        else:
            # Job was removed from status.json by user! Terminate immediately without resurrecting!
            print(f"\n[Notice] Job {job_id} was cancelled or removed from status.json. Terminating execution.")
            sys.exit(0)
    elif data[job_id].get("status") in ["cancelled", "deleted"]:
        print(f"\n[Notice] Job {job_id} is marked as '{data[job_id].get('status')}'. Terminating execution.")
        sys.exit(0)
        
    data[job_id]["status"] = status
    if filename:
        data[job_id]["filename"] = filename
        job_query = data[job_id].get("query")
        if job_query:
            for jId, jInfo in data.items():
                if jId != job_id and jInfo.get("query") == job_query and not jInfo.get("filename"):
                    jInfo["filename"] = filename
    if query:
        data[job_id]["query"] = query
    if limit is not None:
        data[job_id]["limit"] = limit
    if progress is not None:
        data[job_id]["progress"] = round(progress, 1) if isinstance(progress, float) else progress
    if status_message is not None:
        data[job_id]["status_message"] = status_message
    if stage is not None:
        data[job_id]["stage"] = stage
    if current is not None:
        data[job_id]["current"] = current
    if total is not None:
        data[job_id]["total"] = total
    if total is not None:
        data[job_id]["total"] = total
        
    if status == "completed":
        data[job_id]["progress"] = 100
        data[job_id]["stage"] = "completed"
        if not status_message:
            data[job_id]["status_message"] = "Completed"
            
    if status in ["completed", "failed"]:
        data[job_id]["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
    try:
        with open(status_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Could not write status to {status_file}: {e}")


def sanitize_string(val):
    """
    Safely strips private-use unicode icons (such as \ue0b0, \ue0c8) and extra whitespace
    to prevent charmap encoding errors on Windows and ensure pristine data.
    """
    if not val:
        return ""
    cleaned = re.sub(r'[\s\ue000-\uf8ff]+', ' ', str(val))
    return cleaned.strip()


def save_batch(buffer, batch_num):
    """
    Saves the accumulated records to a raw JSON Lines file in the 'data' directory.
    No individual Excel files are created here.
    """
    data_dir = "data"
    os.makedirs(data_dir, exist_ok=True)
    txt_filename = os.path.join(data_dir, f"t{batch_num}.txt")
    
    print(f"\n[Batch {batch_num}] Accumulating 20 records. Writing to {txt_filename}...")
    
    try:
        with open(txt_filename, "w", encoding="utf-8") as f:
            for record in buffer:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        print(f"[Batch {batch_num}] Successfully wrote {len(buffer)} records to {txt_filename}.")
    except Exception as e:
        print(f"[Batch {batch_num}] Error writing to {txt_filename}: {e}", file=sys.stderr)


def extract_social_links(details_panel):
    """
    Extracts social media links from anchor tags within the details panel.
    """
    social_domains = [
        "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
        "youtube.com", "x.com", "pinterest.com", "tiktok.com", "snapchat.com"
    ]
    social_links = []
    try:
        anchors = details_panel.locator("a")
        count = anchors.count()
        for i in range(count):
            href = anchors.nth(i).get_attribute("href")
            if href:
                href_lower = href.lower()
                for domain in social_domains:
                    if domain in href_lower:
                        if href not in social_links:
                            social_links.append(href)
                        break
    except Exception as e:
        print(f"Warning: Error extracting social links: {e}")
    return social_links


def extract_web_results_and_socials(details_panel, main_website=""):
    """
    Extracts all external links from the details panel, classifying them into
    social media profiles and organic web results (with link titles).
    """
    social_domains = [
        "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
        "youtube.com", "x.com", "pinterest.com", "tiktok.com", "snapchat.com"
    ]
    social_links = []
    web_results = []
    
    try:
        anchors = details_panel.locator("a")
        count = anchors.count()
        for i in range(count):
            try:
                href = anchors.nth(i).get_attribute("href")
                if not href:
                    continue
                
                href_lower = href.lower()
                # Skip Google domains and maps internal actions
                if any(domain in href_lower for domain in ["google.com", "google.co.in", "gstatic.com", "ggpht.com", "googleusercontent.com"]):
                    continue
                # Skip direct main website duplication
                if main_website:
                    clean_main = main_website.lower().replace("http://", "").replace("https://", "").replace("www.", "").strip('/')
                    if clean_main and clean_main in href_lower:
                        continue
                
                # Check if it is a social link
                is_social = False
                for domain in social_domains:
                    if domain in href_lower:
                        if href not in social_links:
                            social_links.append(href)
                        is_social = True
                        break
                
                if not is_social:
                    # Capture title/text context for organic search web results
                    try:
                        title = anchors.nth(i).inner_text().strip().replace('\n', ' ')
                    except Exception:
                        title = ""
                    
                    result_str = f"{title}: {href}" if title else href
                    if result_str not in web_results:
                        web_results.append(result_str)
            except Exception:
                pass
    except Exception as e:
        print(f"Warning: Error in web results & socials extraction: {e}")
        
    return social_links, web_results



import requests

def extract_social_links_from_website(website_url):
    """
    Tries to fetch the business homepage and extract social media links with strict timeout.
    """
    if not website_url:
        return {}
    
    socials = {"instagram": "", "facebook": "", "twitter": "", "linkedin": ""}
    
    try:
        url = website_url.strip().strip('"\'[] ')
        if not url:
            return socials
        if not url.startswith("http"):
            url = "http://" + url
            
        resp = requests.get(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'},
            timeout=3.0,
            stream=False
        )
        html = resp.text
        
        # Extract links using regex
        links = re.findall(r'href=["\']([^"\']+)["\']', html)
        for link in links:
            link_lower = link.lower()
            if "instagram.com" in link_lower and not socials["instagram"]:
                socials["instagram"] = link
            elif "facebook.com" in link_lower and not socials["facebook"]:
                socials["facebook"] = link
            elif ("twitter.com" in link_lower or "x.com" in link_lower) and not socials["twitter"]:
                socials["twitter"] = link
            elif "linkedin.com" in link_lower and not socials["linkedin"]:
                socials["linkedin"] = link
    except Exception:
        pass
        
    return socials


def generate_whatsapp_link(phone):
    """
    Generates a wa.me API link from raw phone numbers.
    """
    if not phone:
        return ""
    # Strip all non-digit characters
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return ""
    # If 10 digits (India standard format), prefix with 91
    if len(digits) == 10:
        return f"https://wa.me/91{digits}"
    # If 11 digits starting with 0 (like 09876543210), strip the leading 0 and add 91
    if len(digits) == 11 and digits.startswith('0'):
        return f"https://wa.me/91{digits[1:]}"
    # Otherwise, return with the digits as is
    return f"https://wa.me/{digits}"



def handle_cookie_consent(page):
    """Handles Google's cookie consent dialogs if they appear."""
    try:
        print("Checking for Google cookie consent dialog...")
        # Scenario 1: Iframe containing consent banner
        consent_iframe = page.frame_locator('iframe[src*="consent.google.com"]')
        accept_button = consent_iframe.get_by_role("button", name=re.compile("accept all|agree|allow|accept", re.IGNORECASE))
        if accept_button.count() > 0:
            print("Cookie consent iframe found. Clicking Accept All...")
            accept_button.click()
            random_delay(1.0, 2.0)
            return

        # Scenario 2: Consent banner on the main page directly
        for name_regex in ["Accept all", "Agree", "I agree", "Allow all", "Accept"]:
            btn = page.get_by_role("button", name=re.compile(name_regex, re.IGNORECASE))
            if btn.count() > 0:
                print(f"Cookie consent button '{name_regex}' found on page. Clicking...")
                btn.click()
                random_delay(1.0, 2.0)
                return
                
        # Scenario 3: Check for form buttons on consent.google.com
        if "consent.google.com" in page.url:
            print("Redirected to consent.google.com. Looking for accept button...")
            btn = page.locator('form button').first
            if btn.count() > 0:
                btn.click()
                random_delay(1.0, 2.0)
                return
    except Exception as e:
        print(f"Warning during cookie consent handling: {e}")


KNOWN_CITIES = [
    'New Delhi', 'Delhi', 'Noida', 'Greater Noida', 'Gurgaon', 'Gurugram', 'Faridabad', 'Ghaziabad',
    'Mumbai', 'Navi Mumbai', 'Thane', 'Pune', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Secunderabad',
    'Chennai', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore',
    'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ludhiana', 'Agra', 'Nashik', 'Ranchi',
    'Varanasi', 'Amritsar', 'Allahabad', 'Prayagraj', 'Gwalior', 'Jabalpur', 'Coimbatore', 'Vijayawada',
    'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati', 'Dehradun', 'Kochi', 'Goa'
]

INDIAN_STATES = [
    'Delhi', 'NCR', 'Haryana', 'Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 
    'Telangana', 'West Bengal', 'Gujarat', 'Rajasthan', 'Punjab', 'Madhya Pradesh', 'Bihar',
    'Odisha', 'Andhra Pradesh', 'Kerala', 'Jharkhand', 'Assam', 'Uttarakhand', 'Himachal Pradesh'
]


def parse_location_from_address(address, query=""):
    """
    Deterministically parses City, Zone, and Locality from Full Address and search query.
    Ensures that location fields are never left blank or 'Unknown' when raw address exists.
    """
    if not address or str(address).strip().lower() in ['nan', 'none', 'unknown', '']:
        loc, cit, zon = 'Unknown', 'Unknown', 'Unknown'
        if query:
            m_in = re.search(r'\bin\s+([^,]+)(?:,\s*([^,]+))?', query, re.IGNORECASE)
            if m_in:
                loc = m_in.group(1).strip().title()
                if m_in.group(2):
                    cit = m_in.group(2).strip().title()
        return cit, zon, loc

    addr_clean = re.sub(r'^[\s\ue000-\uf8ff]+', '', str(address)).strip()
    addr_clean = re.sub(r',\s*India\s*$', '', addr_clean, flags=re.IGNORECASE)
    addr_clean = re.sub(r',\s*\d{5,6}\s*$', '', addr_clean)

    parts = [p.strip() for p in addr_clean.split(',') if p.strip()]
    city = 'Unknown'
    zone = 'Unknown'
    locality = 'Unknown'

    # 1. Identify City from address or query
    city_indices = set()
    for kc in sorted(KNOWN_CITIES, key=len, reverse=True):
        matched = False
        for i, p in enumerate(parts):
            if re.search(r'\b' + re.escape(kc) + r'\b', p, re.IGNORECASE):
                if city == 'Unknown':
                    city = kc
                city_indices.add(i)
                matched = True
        if matched and city != 'Unknown':
            break

    if city == 'Unknown' and query:
        for kc in sorted(KNOWN_CITIES, key=len, reverse=True):
            if re.search(r'\b' + re.escape(kc) + r'\b', query, re.IGNORECASE):
                city = kc
                break

    # 2. Extract Zone (Sector, Pocket, Block, Phase, Ward)
    zone_parts = []
    zone_indices = set()
    for i, p in enumerate(parts):
        if re.search(r'\b(sector\s*\d+[a-z]?|pocket\s*\d+[a-z]?|block\s*[a-z0-9]+|phase\s*\d+|ward\s*\d+)\b', p, re.IGNORECASE):
            zone_parts.append(p)
            zone_indices.add(i)
    if zone_parts:
        zone = ', '.join(zone_parts[:2])

    # 3. Extract Locality
    candidate_locality_parts = []
    for i in range(len(parts) - 1, -1, -1):
        if i in city_indices or i in zone_indices:
            continue
        p = parts[i]
        if any(re.search(r'\b' + re.escape(st) + r'\b', p, re.IGNORECASE) for st in INDIAN_STATES):
            continue
        if re.search(r'^(shop|plot|kothi|h\s*no|flat|c-|g-|d-|samridhi|floor|road|near|opp|gate|pillar|building|tower)\b', p, re.IGNORECASE):
            continue
        if re.match(r'^[0-9\s\-/&#]+$', p) or len(p) <= 2:
            continue
        candidate_locality_parts.append(p)

    if candidate_locality_parts:
        locality = candidate_locality_parts[0]
    elif query:
        m_in = re.search(r'\bin\s+([^,]+)', query, re.IGNORECASE)
        if m_in:
            locality = m_in.group(1).strip().title()

    if locality != 'Unknown':
        locality = re.sub(r'\s+', ' ', locality).strip().title()

    # Fallbacks if still unknown
    if locality == 'Unknown' and zone != 'Unknown':
        locality = zone.split(',')[0].strip()
    if locality == 'Unknown' and city != 'Unknown':
        locality = city

    return city, zone, locality


def query_huggingface(prompt, model_name="Qwen/Qwen2.5-72B-Instruct", hf_token=None):
    """
    Calls Hugging Face Router or Serverless Inference API for chat completions.
    Parses and returns structured JSON conforming to LeadAnalysis schema.
    """
    if not hf_token:
        hf_token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
        
    headers = {"Content-Type": "application/json"}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token.strip()}"
        
    system_instruction = (
        "You are an expert lead generation analyst. Analyse the business listing and evaluate lead potential. "
        "You MUST respond ONLY with a raw, valid JSON object without markdown formatting, code fences, or additional text. "
        "The JSON MUST have the following keys:\n"
        "city (string), zone (string), locality (string), "
        "website_quality (one of: 'No Website', 'Poor', 'Average', 'Good', 'Excellent'), "
        "mobile_website (one of: 'No Website', 'Yes', 'No', 'Unknown'), "
        "online_booking (one of: 'Yes', 'No', 'Unknown'), "
        "whatsapp (one of: 'Yes', 'No'), "
        "instagram (string), instagram_activity (one of: 'Active', 'Inactive', 'Unknown'), "
        "facebook (string), contact_person (string), "
        "problem_found (string), problem_evidence (string), recommended_service (string), "
        "pitch_angle (string), lead_score (integer from 0 to 100), "
        "lead_tier (one of: '🔥 Hot', '🟢 Good', '🟡 Medium', '❌ Skip')."
    )
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1024
    }
    
    endpoints = [
        "https://router.huggingface.co/v1/chat/completions",
        "https://router.huggingface.co/hf-inference/v1/chat/completions",
        f"https://api-inference.huggingface.co/models/{model_name}/v1/chat/completions",
        "https://api-inference.huggingface.co/v1/chat/completions"
    ]
    
    last_error = None
    for endpoint in endpoints:
        try:
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=35.0)
            if resp.status_code == 200:
                result_json = resp.json()
                content = result_json["choices"][0]["message"]["content"].strip()
                # Clean markdown blocks if present
                content_clean = re.sub(r'^```(?:json)?\s*', '', content, flags=re.MULTILINE)
                content_clean = re.sub(r'```\s*$', '', content_clean, flags=re.MULTILINE).strip()
                start = content_clean.find('{')
                end = content_clean.rfind('}')
                if start != -1 and end != -1:
                    content_clean = content_clean[start:end+1]
                data = json.loads(content_clean)
                return data
            else:
                last_error = f"HF HTTP {resp.status_code}: {resp.text[:180]}"
        except Exception as e:
            last_error = str(e)
            
    raise RuntimeError(f"Hugging Face call failed: {last_error}")


def analyze_lead_with_fallback(record, provider="huggingface", requested_model=None, gemini_client=None, hf_token=None, enable_fallback=True):
    """
    Evaluates a single lead using Hugging Face models.
    Automatically cascades through top open-weights models if primary encounters errors.
    """
    prompt = f"Analyse the following raw text content of a business listing from Google Maps:\n\n{record.get('full_text', '')}\n\nExtract all valuable details and evaluate the potential of this lead."
    
    primary_model = requested_model if (requested_model and requested_model != "auto") else "Qwen/Qwen2.5-72B-Instruct"
    
    model_queue = [primary_model]
    if enable_fallback:
        fallback_models = [
            "meta-llama/Llama-3.3-70B-Instruct",
            "mistralai/Mistral-7B-Instruct-v0.3",
            "Qwen/Qwen2.5-Coder-32B-Instruct"
        ]
        for m in fallback_models:
            if m != primary_model:
                model_queue.append(m)
                
    for m_name in model_queue:
        try:
            time.sleep(0.5)
            res_data = query_huggingface(prompt, model_name=m_name, hf_token=hf_token)
            return res_data, f"HF ({m_name})"
        except Exception as e:
            err_msg = str(e)
            print(f"  -> Model {m_name} encountered issue: {err_msg[:120]}...")
            if not enable_fallback:
                raise e
            print(f"     [Auto-Fallback] Switching to next Hugging Face model...")
            continue
            
    raise RuntimeError("All configured Hugging Face AI models failed or were unavailable.")



def find_existing_query_file(query, leadsdata_dir="leadsdata"):
    """
    Finds an existing Excel sheet for the same normalized query in leadsdata/.
    Returns the file path if found, else None.
    """
    if not query or not os.path.exists(leadsdata_dir):
        return None
    query_slug = re.sub(r'[^a-zA-Z0-9]', '_', query).strip('_').lower()
    query_slug = re.sub(r'_+', '_', query_slug)
    
    for fname in os.listdir(leadsdata_dir):
        if fname.endswith(".xlsx"):
            base_slug = re.sub(r'_job_\d+\.xlsx$', '', fname, flags=re.IGNORECASE)
            base_slug = re.sub(r'_+', '_', base_slug).lower()
            if query_slug in base_slug or base_slug in query_slug:
                return os.path.join(leadsdata_dir, fname)
    return None


def load_existing_identifiers(excel_path):
    """
    Extracts sets of existing normalized phone numbers, Google Maps URLs, and business names
    from an existing Excel sheet to enable fast deduplication.
    """
    existing = {"phones": set(), "urls": set(), "names": set()}
    if not excel_path or not os.path.exists(excel_path):
        return existing
    try:
        df = pd.read_excel(excel_path, engine="openpyxl")
        if "Phone" in df.columns:
            for p in df["Phone"].dropna():
                digits = re.sub(r'\D', '', str(p))
                if len(digits) >= 10:
                    existing["phones"].add(digits[-10:])
        if "Google Maps URL" in df.columns:
            for u in df["Google Maps URL"].dropna():
                u_str = str(u).strip()
                if u_str:
                    clean_u = u_str.split('?')[0].rstrip('/')
                    existing["urls"].add(clean_u)
        if "Business Name" in df.columns:
            for n in df["Business Name"].dropna():
                clean_n = re.sub(r'[^a-zA-Z0-9]', '', str(n).lower())
                if clean_n:
                    existing["names"].add(clean_n)
    except Exception as e:
        print(f"Warning: Could not load identifiers from existing sheet '{excel_path}': {e}")
    return existing


def process_and_cleanup_data(job_id=None, query=None, merge=True, provider="huggingface", model=None, hf_token=None, enable_fallback=True):
    """
    Reads all raw scraped batch files in 'data/', evaluates them using Gemini / Hugging Face LLM,
    appends the results to 'data/final.txt', converts 'final.txt' to a sorted Excel
    sheet in 'leadsdata/', and finally erases the 'data/' folder.
    Supports dynamic fallback across models and providers to prevent 503/rate limit downtime.
    """
    data_dir = "data"
    leadsdata_dir = "leadsdata"
    
    if is_job_cancelled(job_id):
        print(f"\n[Notice] Job {job_id} was cancelled by user. Aborting data processing.")
        return
        
    existing_xlsx_path = find_existing_query_file(query, leadsdata_dir) if merge else None

    if not os.path.exists(data_dir):
        if existing_xlsx_path and os.path.exists(existing_xlsx_path):
            sheet_name = os.path.basename(existing_xlsx_path)
            msg = f"All available listings are already saved in '{sheet_name}'. (0 new leads to add)"
            print(f"\n[Notice] {msg}")
            if job_id:
                update_job_status(job_id, "completed", progress=100, status_message=msg, filename=sheet_name)
            return
        print(f"Error: {data_dir} directory not found. No data to analyze.")
        if job_id:
            update_job_status(job_id, "failed", status_message="No data folder found to analyze.")
        return
        
    t_files = sorted(glob.glob(os.path.join(data_dir, "t*.txt")))
    # Exclude final.txt from input files if it somehow pre-exists
    t_files = [f for f in t_files if "final.txt" not in f]
    
    if not t_files:
        if existing_xlsx_path and os.path.exists(existing_xlsx_path):
            sheet_name = os.path.basename(existing_xlsx_path)
            msg = f"All available listings are already saved in '{sheet_name}'. (0 new leads to add)"
            print(f"\n[Notice] {msg}")
            if job_id:
                update_job_status(job_id, "completed", progress=100, status_message=msg, filename=sheet_name)
            return
        print("No raw scrape files (t*.txt) found in data/ folder.")
        if job_id:
            update_job_status(job_id, "failed", status_message="No raw listings found to analyze.")
        return
        
    print(f"\n--- Starting Lead Analysis Phase on {len(t_files)} batch files ---")
    
    # Check for Hugging Face API key
    huggingface_key = hf_token or os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_TOKEN")
    has_ai = bool(huggingface_key)
    if has_ai:
        prov_info = f"Hugging Face Model: {model or 'Qwen/Qwen2.5-72B-Instruct'}"
        print(f"Hugging Face AI Lead Analyzer initialized ({prov_info} | Fallback: {enable_fallback})")
    else:
        print("Running in offline mode (No Hugging Face Token found). AI analysis skipped.")
        
    all_analyzed_records = []
    final_txt_path = os.path.join(data_dir, "final.txt")
    
    # Calculate total records to process
    total_records = 0
    for file_path in t_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                total_records += sum(1 for line in f if line.strip())
        except Exception:
            pass
    if total_records == 0:
        total_records = 1
        
    analyzed_count = 0
    
    # Process batch files one-by-one and append results to final.txt
    try:
        with open(final_txt_path, "w", encoding="utf-8") as final_f:
            for file_path in t_files:
                if is_job_cancelled(job_id):
                    print(f"\n[Notice] Job {job_id} cancelled during analysis loop. Exiting.")
                    return
                print(f"\nReading raw batch file: {os.path.basename(file_path)}")
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if is_job_cancelled(job_id):
                                print(f"\n[Notice] Job {job_id} cancelled by user. Stopping immediately.")
                                return
                            if not line.strip():
                                continue
                            record = json.loads(line)
                            
                            analyzed_count += 1
                            analysis_progress = 70 + int((analyzed_count / total_records) * 25)
                            lead_name = record.get('name') or f"Lead #{analyzed_count}"
                            stage_label = "analyzing" if has_ai else "processing"
                            msg_prefix = "AI Evaluating" if has_ai else "Processing lead"
                            update_job_status(
                                job_id, 
                                "active", 
                                progress=analysis_progress,
                                stage=stage_label,
                                current=analyzed_count,
                                total=total_records,
                                status_message=f"{msg_prefix} ({analyzed_count}/{total_records}): {lead_name}"
                            )
                            render_cli_progress(analyzed_count, total_records, prefix="Lead Analysis", status=f"- {lead_name}")
                            
                            # Add default fallback values matching reference CSV schema
                            rev_cnt = record.get("reviews_count") or 0
                            rat_val = record.get("rating") or "N/A"
                            has_phone = bool(record.get("phone") and str(record.get("phone")).strip() and str(record.get("phone")).lower() != 'nan')
                            has_web = bool(record.get("website") and str(record.get("website")).strip() and str(record.get("website")).lower() != 'nan')
                            
                            record["lead_potential"] = "Low Potential Lead"
                            record["insight"] = "N/A (LLM analysis skipped)"
                            record["valuable_data"] = record.get("full_text", "")
                            
                            # Extract initial location deterministically from Full Address & search query
                            init_city, init_zone, init_locality = parse_location_from_address(
                                record.get("address") or record.get("full_text", ""), query
                            )
                            record["city"] = init_city
                            record["zone"] = init_zone
                            record["locality"] = init_locality
                            record["website"] = record.get("website") if has_web else "Not Found"
                            record["website_quality"] = "" if not has_web else "Average"
                            record["mobile_website"] = "Unknown"
                            record["online_booking"] = "No"
                            record["whatsapp"] = "Yes" if has_phone else "No"
                            record["instagram"] = record.get("instagram") or "Not Found"
                            record["instagram_activity"] = ""
                            record["facebook"] = record.get("facebook") or "Not Found"
                            record["contact_person"] = "Not Listed"
                            record["problem_found"] = "Limited online accessibility" if not has_web else "Opportunity to improve digital presence"
                            record["problem_evidence"] = "No website and no WhatsApp - hard to reach" if not has_web else "Could benefit from website or social media"
                            record["recommended_service"] = "WhatsApp Business API + Website optimization"
                            record["pitch_angle"] = "Help with digital marketing and website development"
                            record["lead_score"] = 50
                            record["lead_tier"] = format_lead_tier(50)
                            record["contact_method"] = "WhatsApp" if has_phone else "Call"
                            record["outreach_status"] = "Not Contacted"
                            record["follow_up_date"] = ""
                            record["response"] = ""
                            record["notes"] = f"{rev_cnt} reviews @ {rat_val} rating"
                            
                            # Perform LLM analysis if AI keys are available
                            if has_ai and record.get("full_text"):
                                print(f"Analyzing lead: '{record.get('name')}'...")
                                try:
                                    res_data, used_model_tag = analyze_lead_with_fallback(
                                        record,
                                        provider="huggingface",
                                        requested_model=model,
                                        hf_token=huggingface_key,
                                        enable_fallback=enable_fallback
                                    )
                                    
                                    c_ai = res_data.get("city")
                                    z_ai = res_data.get("zone")
                                    l_ai = res_data.get("locality")
                                    record["city"] = c_ai if c_ai and str(c_ai).strip().lower() not in ['unknown', 'nan', 'none', ''] else init_city
                                    record["zone"] = z_ai if z_ai and str(z_ai).strip().lower() not in ['unknown', 'nan', 'none', ''] else init_zone
                                    record["locality"] = l_ai if l_ai and str(l_ai).strip().lower() not in ['unknown', 'nan', 'none', ''] else init_locality
                                    record["website_quality"] = res_data.get("website_quality", "")
                                    record["mobile_website"] = res_data.get("mobile_website", "Unknown")
                                    record["online_booking"] = res_data.get("online_booking", "No")
                                    record["whatsapp"] = res_data.get("whatsapp", "Yes" if has_phone else "No")
                                    record["instagram"] = record.get("instagram") or res_data.get("instagram") or "Not Found"
                                    record["instagram_activity"] = res_data.get("instagram_activity", "")
                                    record["facebook"] = record.get("facebook") or res_data.get("facebook") or "Not Found"
                                    raw_cp = res_data.get("contact_person", "Not Listed")
                                    record["contact_person"] = "Not Listed" if not raw_cp or raw_cp.lower() in ["unknown", "none", "not listed", "n/a"] else raw_cp
                                    record["problem_found"] = res_data.get("problem_found", "Opportunity to improve digital presence")
                                    record["problem_evidence"] = res_data.get("problem_evidence", "Could benefit from website or social media")
                                    record["recommended_service"] = res_data.get("recommended_service", "WhatsApp Business API + Website optimization")
                                    record["pitch_angle"] = res_data.get("pitch_angle", "Help with digital marketing and website development")
                                    
                                    try:
                                        record["lead_score"] = int(res_data.get("lead_score", 50))
                                    except (ValueError, TypeError):
                                        record["lead_score"] = 50
                                        
                                    tier = format_lead_tier(record["lead_score"], res_data.get("lead_tier"))
                                    record["lead_tier"] = tier
                                    
                                    # Set contact method based on WhatsApp availability
                                    if record.get("whatsapp") == "Yes":
                                        record["contact_method"] = "WhatsApp"
                                    else:
                                        record["contact_method"] = "Call"
                                        
                                    record["notes"] = f"{rev_cnt} reviews @ {rat_val} rating"
                                    
                                    # Derive legacy variables for compatibility
                                    record["lead_potential"] = "High Potential Lead" if ("Hot" in tier or "Good" in tier) else "Medium Potential Lead" if "Medium" in tier else "Low Potential Lead"
                                    record["insight"] = f"Lead Score: {record['lead_score']}/100. Recommended: {record['recommended_service']}. Pitch: {record['pitch_angle']}"
                                    record["valuable_data"] = f"Problem: {record['problem_found']}\nEvidence: {record['problem_evidence']}"
                                    
                                    print(f"  -> {tier} (Score: {record['lead_score']}) [{used_model_tag}]")
                                except Exception as e:
                                    print(f"  -> Error calling AI models: {e}")
                                    record["insight"] = f"Error during AI analysis: {e}"
                            
                            # Write analyzed record to final.txt
                            final_f.write(json.dumps(record, ensure_ascii=False) + "\n")
                            all_analyzed_records.append(record)
                except Exception as e:
                    print(f"Error reading file {file_path}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"Error opening final.txt for writing: {e}", file=sys.stderr)
        return

    if not all_analyzed_records:
        print("No records were successfully processed.")
        if job_id:
            update_job_status(job_id, "failed", status_message="No records were successfully processed.")
        return
        
    # Convert final.txt to xlsx inside leadsdata/
    print("\n--- Compile Master Excel ---")
    update_job_status(
        job_id,
        "active",
        progress=96,
        stage="saving",
        status_message="Compiling master Excel spreadsheet & CRM metrics..."
    )
    try:
        os.makedirs(leadsdata_dir, exist_ok=True)
        
        # Load from final.txt to guarantee exact storage sync
        try:
            df_new = pd.read_json(final_txt_path, lines=True)
        except Exception:
            # Fallback manual read
            rows = []
            with open(final_txt_path, "r", encoding="utf-8") as final_f:
                for line in final_f:
                    if line.strip():
                        rows.append(json.loads(line))
            df_new = pd.DataFrame(rows)
        
        # Ensure default CRM fields exist in all new records
        df_new["Contact Method"] = "Phone"
        df_new["Outreach Status"] = "Not Contacted"
        df_new["Follow-up Date"] = ""
        df_new["Response"] = ""
        df_new["Notes"] = ""

        # Map current df columns to requested column names
        column_mapping = {
            "name": "Business Name",
            "category": "Category",
            "city": "City",
            "zone": "Zone",
            "locality": "Locality",
            "address": "Full Address",
            "maps_url": "Google Maps URL",
            "rating": "Google Rating",
            "reviews_count": "Review Count",
            "phone": "Phone",
            "website": "Website",
            "website_quality": "Website Quality",
            "mobile_website": "Mobile Website",
            "online_booking": "Online Booking",
            "whatsapp": "WhatsApp",
            "instagram": "Instagram",
            "instagram_activity": "Instagram Activity",
            "facebook": "Facebook",
            "social_links": "Social Media Links",
            "web_results": "Web Results",
            "contact_person": "Contact Person",
            "problem_found": "Problem Found",
            "problem_evidence": "Problem Evidence",
            "recommended_service": "Recommended Service",
            "pitch_angle": "Pitch Angle",
            "lead_score": "Lead Score",
            "lead_tier": "Lead Tier",
            "Contact Method": "Contact Method",
            "Outreach Status": "Outreach Status",
            "Follow-up Date": "Follow-up Date",
            "Response": "Response",
            "Notes": "Notes"
        }
        
        df_new = df_new.rename(columns=column_mapping)
        
        # Format list columns for clean Excel presentation
        if "Social Media Links" in df_new.columns:
            df_new["Social Media Links"] = df_new["Social Media Links"].apply(
                lambda val: ", ".join(val) if isinstance(val, list) else (val if pd.notna(val) else "")
            )
        if "Web Results" in df_new.columns:
            df_new["Web Results"] = df_new["Web Results"].apply(
                lambda val: "\n".join(val) if isinstance(val, list) else (val if pd.notna(val) else "")
            )
        
        # Generate WhatsApp link from Phone
        if "Phone" in df_new.columns:
            df_new["WhatsApp"] = df_new["Phone"].apply(
                lambda p: generate_whatsapp_link(str(p)) if pd.notna(p) and str(p).strip() and str(p).strip().lower() != 'nan' else ""
            )

        # Check if an existing sheet for this query already exists
        existing_xlsx_path = find_existing_query_file(query, leadsdata_dir) if merge else None
        leads_added = len(df_new)
        dup_count = 0
        
        if existing_xlsx_path and os.path.exists(existing_xlsx_path):
            print(f"Found existing spreadsheet: '{os.path.basename(existing_xlsx_path)}'. Performing smart merge & deduplication...")
            try:
                df_existing = pd.read_excel(existing_xlsx_path, engine="openpyxl")
            except Exception as e:
                print(f"Warning: Could not read existing Excel file: {e}. Writing fresh file.")
                df_existing = None
                
            if df_existing is not None and len(df_existing) > 0:
                # Extract existing phones, URLs, and names
                existing_phones = set()
                if "Phone" in df_existing.columns:
                    for p in df_existing["Phone"].dropna():
                        digs = re.sub(r'\D', '', str(p))
                        if len(digs) >= 10:
                            existing_phones.add(digs[-10:])
                            
                existing_urls = set()
                if "Google Maps URL" in df_existing.columns:
                    for u in df_existing["Google Maps URL"].dropna():
                        u_clean = str(u).split('?')[0].rstrip('/')
                        if u_clean:
                            existing_urls.add(u_clean)
                            
                existing_names = set()
                if "Business Name" in df_existing.columns:
                    for n in df_existing["Business Name"].dropna():
                        clean_n = re.sub(r'[^a-zA-Z0-9]', '', str(n).lower())
                        if clean_n:
                            existing_names.add(clean_n)
                            
                # Filter df_new to keep ONLY truly new leads
                new_mask = []
                for _, row in df_new.iterrows():
                    is_dup = False
                    row_phone = re.sub(r'\D', '', str(row.get("Phone", "")))
                    if len(row_phone) >= 10 and row_phone[-10:] in existing_phones:
                        is_dup = True
                    row_url = str(row.get("Google Maps URL", "")).split('?')[0].rstrip('/')
                    if row_url and row_url in existing_urls:
                        is_dup = True
                    row_name = re.sub(r'[^a-zA-Z0-9]', '', str(row.get("Business Name", "")).lower())
                    if row_name and row_name in existing_names:
                        is_dup = True
                    new_mask.append(not is_dup)
                    
                df_truly_new = df_new[new_mask].copy()
                dup_count = len(df_new) - len(df_truly_new)
                leads_added = len(df_truly_new)
                print(f"Deduplication complete: {leads_added} new leads, {dup_count} duplicate listings skipped.")
                
                if leads_added > 0:
                    # Calculate next sequential Lead ID
                    max_id = 0
                    prefix = job_id.replace("job_", "") if job_id else str(int(time.time()))
                    if "Lead ID" in df_existing.columns:
                        for lid in df_existing["Lead ID"].dropna():
                            parts = str(lid).split('-')
                            if len(parts) >= 3:
                                prefix = parts[1]
                            m = re.search(r'-(\d+)$', str(lid))
                            if m:
                                max_id = max(max_id, int(m.group(1)))
                                
                    new_lids = []
                    for idx in range(leads_added):
                        new_lids.append(f"L-{prefix}-{(max_id + idx + 1):02d}")
                    df_truly_new["Lead ID"] = new_lids
                    
                    # Combine existing and new (existing rows and CRM notes are preserved!)
                    df = pd.concat([df_existing, df_truly_new], ignore_index=True)
                else:
                    df = df_existing
                    
                master_xlsx_path = existing_xlsx_path
            else:
                master_xlsx_path = existing_xlsx_path
                # Add Lead IDs to df_new
                lead_ids = []
                job_num = job_id.replace("job_", "") if job_id else str(int(time.time()))
                for idx in range(len(df_new)):
                    lead_ids.append(f"L-{job_num}-{(idx + 1):02d}")
                df_new["Lead ID"] = lead_ids
                df = df_new
        else:
            # Standalone new sheet
            if query and job_id:
                query_slug = re.sub(r'[^a-zA-Z0-9]', '_', query).strip('_')
                excel_name = f"{query_slug}_{job_id}.xlsx"
            elif job_id:
                excel_name = f"leads_{job_id}.xlsx"
            else:
                excel_name = "master_leads.xlsx"
            master_xlsx_path = os.path.join(leadsdata_dir, excel_name)
            
            lead_ids = []
            job_num = job_id.replace("job_", "") if job_id else str(int(time.time()))
            for idx in range(len(df_new)):
                lead_ids.append(f"L-{job_num}-{(idx + 1):02d}")
            df_new["Lead ID"] = lead_ids
            df = df_new
        
        # Sort by Lead Score (descending)
        if "Lead Score" in df.columns:
            try:
                df["Lead Score"] = pd.to_numeric(df["Lead Score"], errors="coerce").fillna(50).astype(int)
                df = df.sort_values(by="Lead Score", ascending=False)
            except Exception:
                pass

        # Clean and format all columns strictly according to the reference schema
        if "Full Address" in df.columns:
            df["Full Address"] = df["Full Address"].astype(str).apply(
                lambda x: re.sub(r'^[\s\ue000-\uf8ff]+', '', x).strip() if pd.notna(x) and x != 'nan' else ""
            )

        if "Website" in df.columns:
            df["Website"] = df["Website"].apply(
                lambda x: "Not Found" if pd.isna(x) or not str(x).strip() or str(x).strip().lower() in ['nan', 'none', ''] else str(x).strip()
            )

        if "Instagram" in df.columns:
            df["Instagram"] = df["Instagram"].apply(
                lambda x: "Not Found" if pd.isna(x) or not str(x).strip() or str(x).strip().lower() in ['nan', 'none', ''] else str(x).strip()
            )

        if "Facebook" in df.columns:
            df["Facebook"] = df["Facebook"].apply(
                lambda x: "Not Found" if pd.isna(x) or not str(x).strip() or str(x).strip().lower() in ['nan', 'none', ''] else str(x).strip()
            )

        if "Contact Person" in df.columns:
            df["Contact Person"] = df["Contact Person"].apply(
                lambda x: "Not Listed" if pd.isna(x) or not str(x).strip() or str(x).strip().lower() in ['nan', 'none', 'unknown', 'n/a', ''] else str(x).strip()
            )

        # Standardize Lead Tier with reference emojis (🔥 Hot, 🟢 Good, 🟡 Medium, ❌ Skip)
        df["Lead Tier"] = df.apply(lambda row: format_lead_tier(row.get("Lead Score", 50), row.get("Lead Tier")), axis=1)

        # Standardize WhatsApp to Yes / No
        if "WhatsApp" in df.columns:
            df["WhatsApp"] = df["WhatsApp"].apply(
                lambda w: "Yes" if pd.notna(w) and (str(w).strip().lower() in ['yes', 'true', '1'] or 'wa.me' in str(w).lower())
                else ("No" if pd.notna(w) and str(w).strip().lower() in ['no', 'false', '0'] else ("Yes" if pd.notna(w) and str(w).strip() and str(w).strip().lower() != 'nan' else "No"))
            )

        # Standardize Contact Method to Call / WhatsApp
        if "Contact Method" in df.columns:
            df["Contact Method"] = df.apply(
                lambda row: str(row["Contact Method"]).strip() if pd.notna(row.get("Contact Method")) and str(row.get("Contact Method")).strip() and str(row.get("Contact Method")).strip().lower() not in ['nan', 'phone', '']
                else ("WhatsApp" if str(row.get("WhatsApp", "")).strip().lower() == "yes" else "Call"),
                axis=1
            )

        # Standardize Outreach Status
        if "Outreach Status" in df.columns:
            df["Outreach Status"] = df["Outreach Status"].apply(
                lambda s: str(s).strip() if pd.notna(s) and str(s).strip() and str(s).strip().lower() != 'nan' else "Not Contacted"
            )

        # Default Notes to "{Review Count} reviews @ {Google Rating} rating"
        def format_notes_field(row):
            val = row.get("Notes")
            if pd.notna(val) and str(val).strip() and str(val).strip().lower() != 'nan':
                return str(val).strip()
            rev = row.get("Review Count")
            try:
                rev_num = int(rev) if pd.notna(rev) and str(rev).strip().lower() != 'nan' else 0
            except Exception:
                rev_num = 0
            rat = row.get("Google Rating")
            try:
                rat_num = float(rat) if pd.notna(rat) and str(rat).strip().lower() != 'nan' else 0.0
                rat_str = f"{rat_num:.1f}"
            except Exception:
                rat_str = "0.0"
            return f"{rev_num} reviews @ {rat_str} rating"

        df["Notes"] = df.apply(format_notes_field, axis=1)

        # Assign sequential S.No (1, 2, 3, ... N)
        df["S.No"] = list(range(1, len(df) + 1))

        # Replace remaining NaN with clean empty strings
        df["Follow-up Date"] = df.get("Follow-up Date", "").fillna("")
        df["Response"] = df.get("Response", "").fillna("")
        # Ensure City, Zone, and Locality are never 'Unknown' if Full Address is available
        if "City" in df.columns:
            df["City"] = df.apply(
                lambda r: parse_location_from_address(r.get("Full Address", ""), query)[0]
                if (pd.isna(r.get("City")) or str(r.get("City")).strip().lower() in ['unknown', 'nan', 'none', ''])
                else r.get("City"),
                axis=1
            )
        if "Zone" in df.columns:
            df["Zone"] = df.apply(
                lambda r: parse_location_from_address(r.get("Full Address", ""), query)[1]
                if (pd.isna(r.get("Zone")) or str(r.get("Zone")).strip().lower() in ['unknown', 'nan', 'none', ''])
                else r.get("Zone"),
                axis=1
            )
        if "Locality" in df.columns:
            df["Locality"] = df.apply(
                lambda r: parse_location_from_address(r.get("Full Address", ""), query)[2]
                if (pd.isna(r.get("Locality")) or str(r.get("Locality")).strip().lower() in ['unknown', 'nan', 'none', ''])
                else r.get("Locality"),
                axis=1
            )

        # Exact list of reference columns in specified order, plus merged compatibility columns
        ordered_cols = [
            "S.No",
            "Business Name",
            "City",
            "Zone",
            "Locality",
            "Full Address",
            "Google Maps URL",
            "Google Rating",
            "Review Count",
            "Phone",
            "Website",
            "Website Quality",
            "Mobile Website",
            "Online Booking",
            "WhatsApp",
            "Instagram",
            "Instagram Activity",
            "Facebook",
            "Contact Person",
            "Problem Found",
            "Problem Evidence",
            "Recommended Service",
            "Pitch Angle",
            "Lead Score",
            "Lead Tier",
            "Contact Method",
            "Outreach Status",
            "Follow-up Date",
            "Response",
            "Notes",
            # Merged internal tracking columns
            "Lead ID",
            "Category",
            "Social Media Links",
            "Web Results"
        ]
        
        # Reindex to ensure all columns exist, fill missing with default empty strings
        for col in ordered_cols:
            if col not in df.columns:
                df[col] = ""
                
        df = df[ordered_cols]
        
        df.to_excel(master_xlsx_path, index=False, engine='openpyxl')
        print(f"Successfully created sorted master Excel at: {master_xlsx_path}")
    except Exception as e:
        print(f"Error creating master Excel sheet: {e}", file=sys.stderr)
        return
        
    # Erase the raw data directory
    print("\n--- Cleanup Temporary Data ---")
    try:
        shutil.rmtree(data_dir)
        print(f"Successfully erased temporary folder: '{data_dir}'")
    except Exception as e:
        print(f"Warning: Could not erase temporary folder '{data_dir}': {e}", file=sys.stderr)
        
    if job_id:
        if existing_xlsx_path and os.path.exists(existing_xlsx_path):
            completion_msg = f"Completed! Added {leads_added} new leads to existing sheet (Total: {len(df)} leads, {dup_count} duplicates skipped)."
        else:
            completion_msg = f"Completed! Scraped & compiled {len(df)} leads successfully."
            
        update_job_status(
            job_id, 
            "completed", 
            progress=100, 
            stage="completed", 
            status_message=completion_msg,
            filename=os.path.basename(master_xlsx_path),
            current=len(df),
            total=len(df)
        )


def scrape_google_maps(query, limit=100, headless=False, job_id=None, merge=True, provider="huggingface", model=None, hf_token=None, enable_fallback=True):
    """
    Main function to run the scraping workflow.
    Uses multi-strategy infinite scrolling to discover all listings up to `limit`
    (or till the genuine end of Google Maps results), then uses dedicated place detail
    navigation to extract 100% accurate, desync-free business leads.
    """
    safe_query = sanitize_string(query)
    print(f"Starting scraper for query: '{safe_query}' (Limit: {limit}, Headless: {headless}, Merge: {merge})")
    
    # Check for existing database sheet for smart deduplication
    existing_xlsx = find_existing_query_file(query) if merge else None
    existing_ids = load_existing_identifiers(existing_xlsx) if existing_xlsx else {"phones": set(), "urls": set(), "names": set()}
    if existing_xlsx and len(existing_ids["names"]) > 0:
        print(f"Smart Deduplication Active: Found existing sheet '{os.path.basename(existing_xlsx)}' with {len(existing_ids['names'])} leads.")
        init_msg = f"Connecting to Google Maps (Smart Merge: {len(existing_ids['names'])} existing leads found)..."
    else:
        init_msg = "Launching browser with anti-detect stealth..."
        
    update_job_status(job_id, "active", query=query, limit=limit, progress=2, stage="initializing", status_message=init_msg)
    
    with sync_playwright() as p:
        print("Launching browser...")
        if sys.platform != "win32" and not os.environ.get("DISPLAY"):
            headless = True
        browser = p.chromium.launch(headless=headless, args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage"
        ])
        
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # Inject cookie to bypass consent page
        try:
            context.add_cookies([{
                "name": "SOCS",
                "value": "CAISHAgBEhJnd3NfMjAyNDA2MjEtMF8SQzEaBmVuIAEaBgiAsd-yBq",
                "domain": ".google.com",
                "path": "/"
            }])
        except Exception as e:
            print(f"Warning: Could not inject SOCS cookie: {e}")
            
        stealth = Stealth()
        stealth.apply_stealth_sync(context)
        search_page = context.new_page()
        
        # Navigate directly to Google Maps search URL for high speed & reliability
        direct_search_url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(query)}"
        print(f"Navigating to Google Maps search: '{safe_query}'...")
        update_job_status(job_id, "active", progress=5, stage="searching", status_message=f"Connecting to Google Maps for '{safe_query}'...")
        
        try:
            search_page.goto(direct_search_url, timeout=60000, wait_until="domcontentloaded")
        except Exception:
            search_page.goto(direct_search_url, timeout=60000)
            
        random_delay(1.5, 2.5)
        handle_cookie_consent(search_page)
        
        results_feed_selector = 'div[role="feed"], div[aria-label*="Results for"], div.m6QErb.DxyBCb'
        details_panel_selector = 'div[role="main"][aria-label]'
        
        feed_found = False
        details_found = False
        
        for wait_step in range(40):
            if is_job_cancelled(job_id):
                print(f"\n[Notice] Job {job_id} was cancelled by user. Terminating browser.")
                browser.close()
                return
            if search_page.locator('div[role="feed"]').count() > 0:
                feed_found = True
                break
            if search_page.locator('.Nv2PK').count() > 0 or search_page.locator('a.hfpxzc').count() > 0:
                feed_found = True
                break
            if search_page.locator(details_panel_selector).count() > 0:
                if search_page.locator('div[role="feed"]').count() == 0 and search_page.locator('.Nv2PK').count() == 0:
                    details_found = True
                    break
            time.sleep(0.5)

        # Fallback if direct URL didn't render feed: type into search box
        if not feed_found and not details_found:
            search_box = search_page.locator('input#searchboxinput, input[name="q"]').first
            if search_box.count() > 0 and search_box.is_visible():
                print(f"Fallback: Typing query into search box: '{safe_query}'")
                search_box.click()
                search_box.fill(query)
                search_page.keyboard.press("Enter")
                for _ in range(30):
                    if search_page.locator('div[role="feed"]').count() > 0 or search_page.locator('.Nv2PK').count() > 0:
                        feed_found = True
                        break
                    time.sleep(0.5)
            
        if not feed_found and not details_found:
            print("Error: Could not find results feed or place details panel. The search might have returned no results.")
            if job_id:
                update_job_status(job_id, "failed", status_message="No Google Maps results found for this query.")
            browser.close()
            return
            
        records = []
        batch_num = 1
        
        # Case A: Redirected directly to a single business details panel
        if details_found and not feed_found:
            print("Direct redirect to business details panel detected (single result).")
            details_panel = search_page.locator(details_panel_selector).first
            for _ in range(3):
                search_page.evaluate('const el = document.querySelector(\'div[role="main"][aria-label]\'); if (el) { el.scrollBy(0, 1000); }')
                random_delay(0.4, 0.8)
            record = extract_details(details_panel, search_page)
            if record and record.get("name"):
                records.append(record)
                save_batch(records, batch_num)
            browser.close()
            process_and_cleanup_data(
                job_id=job_id, query=query, merge=merge, provider=provider,
                model=model, hf_token=hf_token, enable_fallback=enable_fallback
            )
            return

        # Case B: Standard feed of multiple results
        print("Results feed detected. Starting deep multi-strategy scroll to discover listings...")
        feed = search_page.locator('div[role="feed"]').first
        
        # Ensure we discover enough candidates to absorb deduplication, ads, and detail loading errors
        if limit < 9999:
            target_discovery = min(int(limit * 1.3) + 5, limit + 40)
        else:
            target_discovery = 99999
            
        print(f"Target discovery goal: {target_discovery} candidate listings (to guarantee {limit} verified leads)...")
        seen_urls = set()
        collected_listings = []
        no_new_streak = 0
        area_expansions = 0
        max_scroll_attempts = 150

        for attempt in range(max_scroll_attempts):
            if is_job_cancelled(job_id):
                print(f"\n[Notice] Job {job_id} was cancelled by user. Stopping scraper.")
                browser.close()
                return

            # Extract currently visible listings in the feed
            anchors = search_page.locator('div[role="feed"] a.hfpxzc, div[role="feed"] .Nv2PK a[href*="/maps/place/"]')
            count = anchors.count()
            new_in_pass = 0
            
            for i in range(count):
                try:
                    a = anchors.nth(i)
                    raw_href = a.get_attribute("href")
                    if not raw_href or "/maps/place/" not in raw_href:
                        continue
                    clean_url = raw_href.split('?')[0].rstrip('/')
                    if clean_url in seen_urls:
                        continue
                        
                    raw_name = a.get_attribute("aria-label") or ""
                    if not raw_name:
                        card_parent = a.locator("xpath=..")
                        title_el = card_parent.locator('.fontHeadlineSmall, [class*="title"], h3').first
                        if title_el.count() > 0:
                            raw_name = title_el.inner_text().strip()
                            
                    clean_name = sanitize_string(raw_name)
                    # Deduplicate against existing sheet immediately if merge is active
                    if clean_name:
                        name_key = re.sub(r'[^a-zA-Z0-9]', '', clean_name.lower())
                        if name_key and name_key in existing_ids["names"]:
                            seen_urls.add(clean_url)
                            continue
                            
                    seen_urls.add(clean_url)
                    collected_listings.append({
                        "name": clean_name or f"Listing #{len(collected_listings) + 1}",
                        "url": clean_url
                    })
                    new_in_pass += 1
                except Exception:
                    pass

            total_found = len(collected_listings)
            scroll_progress = min(22, 10 + int((min(total_found, target_discovery) / max(1, target_discovery)) * 12))
            update_job_status(
                job_id,
                "active",
                progress=scroll_progress,
                stage="searching",
                current=total_found,
                total=limit if limit < 9999 else total_found,
                status_message=f"Discovered {total_found}/{target_discovery} candidates on Google Maps..."
            )
            print(f"Scroll pass {attempt + 1}: Found {total_found} unique listings ({new_in_pass} new this pass).")

            # Check if discovery target is achieved
            if limit < 9999 and total_found >= target_discovery:
                print(f"Reached discovery target of {total_found} candidate listings (Goal: {limit} leads).")
                break

            # Check for end of list text or stall
            end_text_visible = search_page.locator("text=You've reached the end of the list.").count() > 0
            
            if new_in_pass == 0:
                no_new_streak += 1
            else:
                no_new_streak = 0

            # If stalled or reached end of current viewport, trigger Multi-Area Expansion!
            if (end_text_visible or no_new_streak >= 3) and total_found < target_discovery and area_expansions < 5:
                print(f"Area saturated at {total_found} listings (Goal: {limit}). Expanding Google Maps search area ({area_expansions + 1}/5)...")
                
                # Check for 'Search this area' button
                search_area_btn = search_page.locator('button:has-text("Search this area"), button[aria-label*="Search this area"]').first
                if search_area_btn.count() == 0 or not search_area_btn.is_visible():
                    # Zoom out map by 1 notch to reveal surrounding area
                    zoom_out_btn = search_page.locator('button#widget-zoomout, button[aria-label="Zoom out"]').first
                    if zoom_out_btn.count() > 0 and zoom_out_btn.is_visible():
                        try:
                            zoom_out_btn.click()
                            random_delay(1.0, 1.5)
                        except Exception:
                            pass
                    else:
                        try:
                            search_page.keyboard.press("-")
                            random_delay(1.0, 1.5)
                        except Exception:
                            pass

                search_area_btn = search_page.locator('button:has-text("Search this area"), button[aria-label*="Search this area"]').first
                if search_area_btn.count() > 0 and search_area_btn.is_visible():
                    print("Found 'Search this area' button. Triggering search over expanded area...")
                    try:
                        search_area_btn.click()
                        random_delay(2.5, 3.5)
                        area_expansions += 1
                        no_new_streak = 0
                        continue
                    except Exception:
                        pass
                else:
                    area_expansions += 1

            if no_new_streak >= 6 and (total_found >= limit or area_expansions >= 5):
                print(f"No further listings available on Google Maps for this query. Proceeding with {total_found} listings.")
                break

            # Multi-strategy scroll movement
            try:
                # 1. Scroll last card into view
                items = search_page.locator('div[role="feed"] .Nv2PK, div[role="feed"] div[role="article"]')
                if items.count() > 0:
                    try:
                        items.last.scroll_into_view_if_needed(timeout=1500)
                    except Exception:
                        pass
                # 2. Scroll the feed container directly to bottom
                search_page.evaluate('const el = document.querySelector(\'div[role="feed"]\'); if (el) { el.scrollTop = el.scrollHeight; }')
                # 3. Mouse wheel over feed
                feed_box = feed.bounding_box()
                if feed_box:
                    search_page.mouse.move(feed_box["x"] + feed_box["width"] / 2, feed_box["y"] + feed_box["height"] / 2)
                    search_page.mouse.wheel(0, 4500)
            except Exception:
                pass
            random_delay(1.5, 2.5)

        total_discovered = len(collected_listings)
        print(f"\nDiscovery complete: {total_discovered} unique candidates found.")

        if total_discovered == 0:
            msg = "No new listings found to extract (all available results may already be in database)."
            print(msg)
            if job_id:
                update_job_status(job_id, "completed", progress=100, status_message=msg)
            browser.close()
            return

        target_goal = min(limit, total_discovered) if limit < 9999 else total_discovered
        print(f"Beginning details extraction to collect {target_goal} verified leads (pool of {total_discovered} candidates)...")

        # Phase 2: High-accuracy details extraction via dedicated detail page
        detail_page = context.new_page()
        new_leads_collected = 0
        duplicates_skipped = 0
        
        update_job_status(
            job_id,
            "active",
            progress=22,
            stage="scraping",
            current=0,
            total=target_goal,
            status_message=f"Beginning details extraction (Target: {target_goal} leads)..."
        )

        for idx, item in enumerate(collected_listings):
            if is_job_cancelled(job_id):
                print(f"\n[Notice] Job {job_id} was cancelled by user. Halting scraping loop.")
                break

            if new_leads_collected >= target_goal:
                print(f"\n🎉 Successfully reached target goal of {target_goal} verified leads!")
                break

            candidate_num = idx + 1
            clean_item_name = sanitize_string(item['name'])
            print(f"\nExtracting lead ({new_leads_collected + 1}/{target_goal}, candidate {candidate_num}/{total_discovered}): '{clean_item_name}'...")
            
            try:
                detail_page.goto(item["url"], timeout=30000, wait_until="domcontentloaded")
            except Exception as e:
                print(f"Warning: Could not load listing URL '{item['url']}': {e}")
                continue

            try:
                detail_page.wait_for_selector('h1.DUwDvf, div[role="main"] h1', timeout=8000)
            except Exception:
                pass

            # Scroll details panel to trigger lazy loading of address, phone, website, hours
            for _ in range(2):
                detail_page.evaluate('const el = document.querySelector(\'div[role="main"][aria-label]\'); if (el) { el.scrollBy(0, 1000); }')
                random_delay(0.2, 0.4)

            main_panel = detail_page.locator('div[role="main"][aria-label]').first
            if main_panel.count() == 0:
                main_panel = detail_page.locator('div[role="main"]').first
            if main_panel.count() == 0:
                main_panel = detail_page
                
            record = extract_details(main_panel, detail_page)
            if not record or not record.get("name"):
                print(f"Warning: Could not extract valid details for '{clean_item_name}'. Skipping candidate to maintain data quality...")
                continue
                
            # Secondary deduplication check post-extraction
            is_dup = False
            if record.get("phone"):
                clean_phone = re.sub(r'\D', '', str(record["phone"]))
                if len(clean_phone) >= 10 and clean_phone[-10:] in existing_ids["phones"]:
                    is_dup = True
            if not is_dup and record.get("maps_url"):
                c_url = str(record["maps_url"]).split('?')[0].rstrip('/')
                if c_url in existing_ids["urls"]:
                    is_dup = True
            if not is_dup and record.get("name"):
                c_name = re.sub(r'[^a-zA-Z0-9]', '', str(record["name"]).lower())
                if c_name in existing_ids["names"]:
                    is_dup = True

            if is_dup:
                print(f"Skipping duplicate listing post-extract: '{record['name']}' (already in database)")
                duplicates_skipped += 1
                scrape_progress = 22 + int((new_leads_collected / max(1, target_goal)) * 48)
                update_job_status(
                    job_id,
                    "active",
                    progress=scrape_progress,
                    stage="scraping",
                    current=new_leads_collected,
                    total=target_goal,
                    status_message=f"Skipped duplicate: {record['name']} (Collected {new_leads_collected}/{target_goal} leads)"
                )
                render_cli_progress(new_leads_collected, target_goal, prefix="Scraping Details", status=f"Duplicate: {record['name']}")
                continue

            records.append(record)
            new_leads_collected += 1

            if record.get("name"):
                existing_ids["names"].add(re.sub(r'[^a-zA-Z0-9]', '', str(record["name"]).lower()))
            if record.get("phone"):
                digits = re.sub(r'\D', '', str(record["phone"]))
                if len(digits) >= 10:
                    existing_ids["phones"].add(digits[-10:])
            if record.get("maps_url"):
                existing_ids["urls"].add(str(record["maps_url"]).split('?')[0].rstrip('/'))

            clean_disp_name = sanitize_string(record.get('name'))
            print(f"Scraped NEW Lead ({new_leads_collected}/{target_goal}): '{clean_disp_name}' (Rating: {record.get('rating')}, Reviews: {record.get('reviews_count')})")

            scrape_progress = 22 + int((new_leads_collected / max(1, target_goal)) * 48)
            update_job_status(
                job_id,
                "active",
                progress=scrape_progress,
                stage="scraping",
                current=new_leads_collected,
                total=target_goal,
                status_message=f"Scraped {new_leads_collected}/{target_goal} leads: {clean_disp_name}"
            )
            render_cli_progress(new_leads_collected, target_goal, prefix="Scraping Details", status=clean_disp_name)

            if len(records) >= 10:
                save_batch(records, batch_num)
                records = []
                batch_num += 1

        if len(records) > 0:
            save_batch(records, batch_num)

        print(f"\nScraping session finished. Collected {new_leads_collected} new leads ({duplicates_skipped} duplicates skipped).")
        detail_page.close()
        browser.close()

    # Execute post-scrape lead analysis and cleanup
    process_and_cleanup_data(
        job_id=job_id,
        query=query,
        merge=merge,
        provider=provider,
        model=model,
        hf_token=hf_token,
        enable_fallback=enable_fallback
    )


def extract_details(details_panel, page):
    """
    Extracts all fields from the details panel.
    All text fields are sanitized to remove private unicode symbols and prevent encoding errors.
    """
    record = {}
    
    # 1. Name
    try:
        name_el = details_panel.locator('h1.DUwDvf, h1:not([aria-label="Sponsored"]):not([aria-label="Ad"])').first
        if name_el.count() > 0:
            raw_name = name_el.inner_text().strip()
            record["name"] = sanitize_string(raw_name)
        elif page:
            name_el_page = page.locator('h1.DUwDvf, h1:not([aria-label="Sponsored"]):not([aria-label="Ad"])').first
            if name_el_page.count() > 0:
                raw_name = name_el_page.inner_text().strip()
                record["name"] = sanitize_string(raw_name)
            else:
                record["name"] = None
        else:
            record["name"] = None
    except Exception:
        record["name"] = None
        
    if not record["name"]:
        return None
        
    # 2. Rating
    record["rating"] = None
    try:
        rating_el = details_panel.locator("div.F7nice span").first
        if rating_el.count() > 0:
            rating_text = rating_el.inner_text().strip().replace(",", ".")
            if rating_text.replace(".", "", 1).isdigit():
                record["rating"] = float(rating_text)
    except Exception:
        pass
        
    if record["rating"] is None:
        try:
            star_el = details_panel.locator('span[aria-label*="star"], span[aria-label*="stars"]').first
            if star_el.count() > 0:
                label = star_el.get_attribute("aria-label")
                match = re.search(r'(\d+[\.,]\d+|\d+)', label)
                if match:
                    record["rating"] = float(match.group(1).replace(",", "."))
        except Exception:
            pass

    # 3. Reviews Count
    record["reviews_count"] = None
    try:
        f7_el = details_panel.locator("div.F7nice")
        if f7_el.count() > 0:
            f7_text = f7_el.inner_text().strip()
            match = re.search(r'\(([\d,.]+)\)', f7_text)
            if match:
                record["reviews_count"] = int(match.group(1).replace(",", "").replace(".", ""))
    except Exception:
        pass
        
    if record["reviews_count"] is None:
        try:
            rev_el = details_panel.locator('button[jsaction*="moreReviews"], button[aria-label*="reviews"]').first
            if rev_el.count() > 0:
                txt = rev_el.inner_text().strip()
                match = re.search(r'([\d,.]+)', txt)
                if match:
                    record["reviews_count"] = int(match.group(1).replace(",", "").replace(".", ""))
        except Exception:
            pass

    # 4. Category
    record["category"] = None
    try:
        cat_el = details_panel.locator('button[jsaction*="category"], button[class*="category"]').first
        if cat_el.count() > 0:
            record["category"] = sanitize_string(cat_el.inner_text())
    except Exception:
        pass

    # 5. Address
    record["address"] = None
    try:
        addr_el = details_panel.locator('[data-item-id="address"]').first
        if addr_el.count() > 0:
            record["address"] = sanitize_string(addr_el.inner_text())
    except Exception:
        pass

    # 6. Phone
    record["phone"] = None
    try:
        phone_el = details_panel.locator('[data-item-id^="phone:tel:"]').first
        if phone_el.count() > 0:
            item_id = phone_el.get_attribute("data-item-id")
            if item_id and item_id.startswith("phone:tel:"):
                record["phone"] = sanitize_string(item_id.replace("phone:tel:", ""))
            else:
                record["phone"] = sanitize_string(phone_el.inner_text())
    except Exception:
        pass

    # 7. Website
    record["website"] = None
    try:
        web_el = details_panel.locator('[data-item-id="authority"]').first
        if web_el.count() > 0:
            href = web_el.get_attribute("href")
            if not href:
                child_a = web_el.locator("a").first
                if child_a.count() > 0:
                    href = child_a.get_attribute("href")
            record["website"] = href if href else sanitize_string(web_el.inner_text())
    except Exception:
        pass

    # 8. Opening Hours
    record["opening_hours"] = None
    try:
        hours_el = details_panel.locator('[data-item-id="oh"]').first
        if hours_el.count() > 0:
            initial_text = sanitize_string(hours_el.inner_text())
            table_el = details_panel.locator("table").first
            if table_el.count() > 0:
                table_text = table_el.inner_text().strip()
                record["opening_hours"] = "\n".join([sanitize_string(line) for line in table_text.splitlines() if line.strip()])
            else:
                record["opening_hours"] = initial_text
    except Exception:
        pass

    # 9. Full text content of details panel
    try:
        record["full_text"] = sanitize_string(details_panel.inner_text())
    except Exception:
        record["full_text"] = ""

    # 10. Social media links & Web results
    social_links, web_results = extract_web_results_and_socials(details_panel, record.get("website", ""))
    record["social_links"] = social_links
    record["web_results"] = web_results
    
    instagram_link = ""
    facebook_link = ""
    for link in social_links:
        if "instagram.com" in link.lower():
            instagram_link = link
        elif "facebook.com" in link.lower():
            facebook_link = link
            
    # Scrape website if needed
    if record.get("website") and (not instagram_link or not facebook_link):
        try:
            site_socials = extract_social_links_from_website(record["website"])
            if site_socials.get("instagram") and not instagram_link:
                instagram_link = site_socials["instagram"]
                if instagram_link not in social_links:
                    social_links.append(instagram_link)
            if site_socials.get("facebook") and not facebook_link:
                facebook_link = site_socials["facebook"]
                if facebook_link not in social_links:
                    social_links.append(facebook_link)
        except Exception:
            pass
            
    record["instagram"] = instagram_link
    record["facebook"] = facebook_link
    record["social_links"] = social_links
    
    # 11. Google Maps URL
    try:
        record["maps_url"] = page.url
    except Exception:
        record["maps_url"] = ""
    
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrapes Google Maps search results, analyzes them with Gemini LLM, saves master Excel in leadsdata/ and cleans up."
    )
    parser.add_argument(
        "query", 
        type=str, 
        nargs="?", 
        default=None, 
        help="Search query to execute (e.g. 'restaurants in London')"
    )
    parser.add_argument(
        "--limit", 
        type=int, 
        default=100, 
        help="Maximum number of listings to scrape (default: 100)"
    )
    parser.add_argument(
        "--headless", 
        action="store_true", 
        help="Run browser in headless mode (default: headed mode is recommended for stealth)"
    )
    parser.add_argument(
        "--job-id",
        type=str,
        default=None,
        help="Job ID for tracking progress in status.json"
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Disable smart merge with existing spreadsheet (forces new standalone file)"
    )
    parser.add_argument(
        "--provider",
        type=str,
        default="huggingface",
        choices=["huggingface"],
        help="AI Provider for lead evaluation (default: 'huggingface')"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen2.5-72B-Instruct",
        help="Specific Hugging Face model (e.g. 'Qwen/Qwen2.5-72B-Instruct' or 'meta-llama/Llama-3.3-70B-Instruct')"
    )
    parser.add_argument(
        "--hf-token",
        type=str,
        default=None,
        help="Hugging Face API token"
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="Disable automatic fallback to alternative models on 503 or rate limit errors"
    )
    
    args = parser.parse_args()
    
    query_input = args.query
    if not query_input:
        try:
            query_input = input("Enter search query (e.g. 'dentists in Boston'): ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)
            
    if not query_input:
        print("Error: Search query cannot be empty.", file=sys.stderr)
        sys.exit(1)
        
    if args.job_id:
        update_job_status(
            args.job_id, 
            "active", 
            query=query_input, 
            limit=args.limit, 
            progress=0, 
            stage="starting", 
            current=0,
            total=args.limit,
            status_message="Job queued. Preparing runner..."
        )
        
    try:
        scrape_google_maps(
            query_input, 
            limit=args.limit, 
            headless=args.headless, 
            job_id=args.job_id,
            merge=not args.no_merge,
            provider=args.provider,
            model=args.model,
            hf_token=args.hf_token,
            enable_fallback=not args.no_fallback
        )
    except Exception as e:
        print(f"\nAn error occurred during execution: {e}", file=sys.stderr)
        if args.job_id:
            update_job_status(args.job_id, "failed", status_message=f"Error: {str(e)[:80]}")
        sys.exit(1)
