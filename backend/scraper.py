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

from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import pandas as pd
from pydantic import BaseModel, Field
from google import genai
from google.genai import types


class LeadAnalysis(BaseModel):
    lead_potential: str = Field(description="Must be exactly one of: 'High Potential Lead', 'Medium Potential Lead', 'Low Potential Lead'")
    insight: str = Field(description="Summary of key insights and why this potential rating was given")
    valuable_data: str = Field(description="Key details and highlights (A-Z info, services, pros/cons, etc.) extracted from the text.")


def random_delay(min_sec=1.0, max_sec=2.5):
    """Sleep for a random duration to mimic human browsing behavior."""
    delay = random.uniform(min_sec, max_sec)
    time.sleep(delay)


def update_job_status(job_id, status, query=None, limit=None):
    """
    Updates status of a lead scraping/analysis job in leadsdata/status.json.
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
        data[job_id] = {
            "query": query,
            "limit": limit,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        
    data[job_id]["status"] = status
    if status in ["completed", "failed"]:
        data[job_id]["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
    try:
        with open(status_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Could not write status to {status_file}: {e}")


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


def get_gemini_model_name(client):
    """
    Dynamically finds the best available Gemini Flash model on the current account.
    """
    try:
        models = [m.name for m in client.models.list()]
        for preferred in ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-1.5-flash"]:
            for m in models:
                if preferred in m:
                    return m
        for m in models:
            if "flash" in m.lower():
                return m
    except Exception:
        pass
    return "gemini-2.5-flash"


def process_and_cleanup_data(job_id=None, query=None):
    """
    Reads all raw scraped batch files in 'data/', evaluates them using Gemini LLM,
    appends the results to 'data/final.txt', converts 'final.txt' to a sorted Excel
    sheet in 'leadsdata/', and finally erases the 'data/' folder.
    """
    data_dir = "data"
    leadsdata_dir = "leadsdata"
    
    if not os.path.exists(data_dir):
        print(f"Error: {data_dir} directory not found. No data to analyze.")
        return
        
    t_files = sorted(glob.glob(os.path.join(data_dir, "t*.txt")))
    # Exclude final.txt from input files if it somehow pre-exists
    t_files = [f for f in t_files if "final.txt" not in f]
    
    if not t_files:
        print("No raw scrape files (t*.txt) found in data/ folder.")
        return
        
    print(f"\n--- Starting Lead Analysis Phase on {len(t_files)} batch files ---")
    
    # Check/Prompt for API Key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY environment variable not found.")
        try:
            api_key = input("Enter your GEMINI_API_KEY to proceed with LLM Analysis (or press Enter to skip): ").strip()
            if api_key:
                os.environ["GEMINI_API_KEY"] = api_key
        except (KeyboardInterrupt, EOFError):
            pass
            
    client = None
    model_name = None
    if os.environ.get("GEMINI_API_KEY"):
        try:
            client = genai.Client()
            model_name = get_gemini_model_name(client)
            print(f"Gemini client successfully initialized using model: {model_name}")
        except Exception as e:
            print(f"Error initializing GenAI Client: {e}. Running without LLM analysis.")
            client = None
    else:
        print("Running in offline mode. Skipping Gemini LLM analysis.")
        
    all_analyzed_records = []
    final_txt_path = os.path.join(data_dir, "final.txt")
    
    # Process batch files one-by-one and append results to final.txt
    try:
        with open(final_txt_path, "w", encoding="utf-8") as final_f:
            for file_path in t_files:
                print(f"\nReading raw batch file: {os.path.basename(file_path)}")
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if not line.strip():
                                continue
                            record = json.loads(line)
                            
                            # Add default fallback values
                            record["lead_potential"] = "Low Potential Lead"
                            record["insight"] = "N/A (LLM analysis skipped)"
                            record["valuable_data"] = record.get("full_text", "")
                            
                            # Perform LLM analysis if API key is provided
                            if client and record.get("full_text"):
                                print(f"Analyzing lead: '{record.get('name')}'...")
                                prompt = f"Analyse the following raw text content of a business listing from Google Maps:\n\n{record['full_text']}\n\nExtract all valuable details and evaluate the potential of this lead."
                                try:
                                    # Anti-rate-limit sleep
                                    time.sleep(1.0)
                                    response = client.models.generate_content(
                                        model=model_name,
                                        contents=prompt,
                                        config=types.GenerateContentConfig(
                                            system_instruction="analyse leads get valuable data and create insights",
                                            response_mime_type="application/json",
                                            response_schema=LeadAnalysis
                                        )
                                    )
                                    
                                    res_data = json.loads(response.text)
                                    potential = res_data.get("lead_potential", "Low Potential Lead")
                                    
                                    # Normalize potential values
                                    if "high" in potential.lower():
                                        potential = "High Potential Lead"
                                    elif "medium" in potential.lower():
                                        potential = "Medium Potential Lead"
                                    else:
                                        potential = "Low Potential Lead"
                                        
                                    record["lead_potential"] = potential
                                    record["insight"] = res_data.get("insight", "")
                                    record["valuable_data"] = res_data.get("valuable_data", "")
                                    print(f"  -> {potential}")
                                except Exception as e:
                                    print(f"  -> Error calling Gemini: {e}")
                                    record["insight"] = f"Error during Gemini analysis: {e}"
                            
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
        return
        
    # Convert final.txt to xlsx inside leadsdata/
    print("\n--- Compile Master Excel ---")
    try:
        os.makedirs(leadsdata_dir, exist_ok=True)
        if query and job_id:
            query_slug = re.sub(r'[^a-zA-Z0-9]', '_', query).strip('_')
            excel_name = f"{query_slug}_{job_id}.xlsx"
        elif job_id:
            excel_name = f"leads_{job_id}.xlsx"
        else:
            excel_name = "master_leads.xlsx"
        master_xlsx_path = os.path.join(leadsdata_dir, excel_name)
        
        # Load from final.txt to guarantee exact storage sync
        try:
            df = pd.read_json(final_txt_path, lines=True)
        except Exception:
            # Fallback manual read
            rows = []
            with open(final_txt_path, "r", encoding="utf-8") as final_f:
                for line in final_f:
                    if line.strip():
                        rows.append(json.loads(line))
            df = pd.DataFrame(rows)
        
        # Sort potential: High Potential Lead (1), Medium Potential Lead (2), Low Potential Lead (3)
        potential_weights = {
            "High Potential Lead": 1,
            "Medium Potential Lead": 2,
            "Low Potential Lead": 3
        }
        df['sort_order'] = df['lead_potential'].map(lambda x: potential_weights.get(x, 4))
        df = df.sort_values(by='sort_order')
        df = df.drop(columns=['sort_order'])
        
        # Order columns to look professional
        cols = ['lead_potential', 'insight', 'name', 'rating', 'reviews_count', 'category', 'phone', 'website', 'address', 'opening_hours', 'social_links', 'valuable_data']
        actual_cols = [c for c in cols if c in df.columns]
        remaining_cols = [c for c in df.columns if c not in actual_cols]
        df = df[actual_cols + remaining_cols]
        
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
        update_job_status(job_id, "completed")


def scrape_google_maps(query, limit=100, headless=False, job_id=None):
    """
    Main function to run the scraping workflow.
    """
    print(f"Starting scraper for query: '{query}' (Limit: {limit}, Headless: {headless})")
    
    with sync_playwright() as p:
        # Headed mode is recommended for stealth, but headless can be passed
        print("Launching browser...")
        browser = p.chromium.launch(headless=headless, args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox"
        ])
        
        # Create a new browser context with standard viewport and user agent
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
        page = context.new_page()
        
        # Navigate to Google Maps
        print("Navigating to Google Maps...")
        page.goto("https://www.google.com/maps", timeout=60000)
        random_delay(2.0, 4.0)
        
        # Handle cookie consent banner if still visible
        handle_cookie_consent(page)
        
        # Perform Search
        print(f"Typing query: '{query}'")
        search_box = page.locator('input#searchboxinput, input[name="q"]').first
        search_box.wait_for(state="visible", timeout=10000)
        search_box.click()
        random_delay(0.5, 1.0)
        
        # Simulate human typing
        search_box.type(query, delay=random.randint(50, 150))
        random_delay(0.5, 1.0)
        
        # Press Enter or click search button
        search_box.press("Enter")
        print("Search submitted. Waiting for results feed or details panel...")
        
        # Determine if we got a list or a single result redirect
        # Determine if we got a list or a single result redirect
        # We wait for either the results feed container (div[role="feed"]) or a details panel (div[role="main"])
        results_feed_selector = 'div[role="feed"]'
        details_panel_selector = 'div[role="main"][aria-label]'
        
        # Wait up to 15 seconds to see which one appears
        feed_found = False
        details_found = False
        
        for _ in range(30):
            if page.locator(results_feed_selector).count() > 0:
                feed_found = True
                break
            # If no feed is found, but a details panel is found, check if it's a single result direct redirect.
            if page.locator(details_panel_selector).count() > 0:
                # In single result redirect, no results feed exists
                if page.locator(results_feed_selector).count() == 0:
                    details_found = True
                    break
            time.sleep(0.5)
            
        if not feed_found and not details_found:
            print("Error: Could not find results feed or place details panel. The search might have returned no results.")
            browser.close()
            return
            
        records = []
        batch_num = 1
        
        # Case A: Redirected directly to a single business details panel
        if details_found and not feed_found:
            print("Direct redirect to business details panel detected (single result).")
            details_panel = page.locator(details_panel_selector)
            
            # Scroll details panel to trigger lazy loading
            print("Scrolling details panel to load all content...")
            for _ in range(3):
                page.evaluate(
                    'const el = document.querySelector(\'div[role="main"][aria-label]\'); if (el) { el.scrollBy(0, 1000); }'
                )
                random_delay(0.5, 1.0)
                
            record = extract_details(details_panel, page)
            if record:
                records.append(record)
                save_batch(records, batch_num)
            browser.close()
            return
            
        # Case B: Standard feed of multiple results
        print("Results feed detected. Starting scroll to load listings...")
        
        cards_selector = 'div[role="feed"] div[role="article"]'
        
        # Infinite scroll logic
        last_count = 0
        no_change_count = 0
        max_scroll_attempts = 100
        
        for attempt in range(max_scroll_attempts):
            # Scroll down the feed container
            page.evaluate(
                'const el = document.querySelector(\'div[role="feed"]\'); if (el) { el.scrollBy(0, el.scrollHeight); }'
            )
            random_delay(1.5, 3.0)
            
            current_count = page.locator(cards_selector).count()
            print(f"Scroll attempt {attempt + 1}: Found {current_count} listings.")
            
            # Check for end of list indicator
            end_text_visible = page.locator("text=You've reached the end of the list.").count() > 0
            if end_text_visible:
                print("Reached the end of the list (detected end text).")
                break
                
            if current_count >= limit:
                print(f"Reached request limit of {limit} results.")
                break
                
            if current_count == last_count:
                no_change_count += 1
                if no_change_count >= 8:
                    print("No new results loaded after multiple scroll attempts. Stopping scroll.")
                    break
            else:
                no_change_count = 0
                last_count = current_count
                
        # Get final list of card elements
        final_count = page.locator(cards_selector).count()
        if final_count > limit:
            final_count = limit
            
        print(f"\nScroll complete. Scraping details for up to {final_count} listings...")
        
        # Iterate and click each card to scrape the details panel
        for i in range(final_count):
            print(f"\nProcessing listing {i + 1} of {final_count}...")
            
            try:
                card = page.locator(cards_selector).nth(i)
                card.scroll_into_view_if_needed()
                random_delay(0.5, 1.2)
                
                # Attempt to extract business name from card to verify load match later
                card_name = None
                try:
                    name_el = card.locator('.fontHeadlineSmall, [class*="title"], h3').first
                    if name_el.count() > 0:
                        card_name = name_el.inner_text().strip()
                except Exception:
                    pass
                
                # Click the card to open details panel
                card.click()
                
                # Wait for details panel
                details_panel = page.locator(details_panel_selector)
                details_panel.wait_for(state="visible", timeout=10000)
                
                h1_locator = details_panel.locator('h1.DUwDvf, h1:not([aria-label="Sponsored"]):not([aria-label="Ad"])').first
                h1_locator.wait_for(state="visible", timeout=5000)
                
                # Verify that the panel content updated to the clicked card
                if card_name:
                    start_wait = time.time()
                    while time.time() - start_wait < 5.0:
                        current_h1 = h1_locator.inner_text().strip() if h1_locator.count() > 0 else ""
                        if current_h1 and (card_name.lower() in current_h1.lower() or current_h1.lower() in card_name.lower()):
                            break
                        time.sleep(0.2)
                
                # Scroll details panel to trigger lazy loading of "Web results" / reviews
                for _ in range(3):
                    page.evaluate(
                        'const el = document.querySelector(\'div[role="main"][aria-label]\'); if (el) { el.scrollBy(0, 1000); }'
                    )
                    random_delay(0.3, 0.7)
                
                # Extract details
                record = extract_details(details_panel, page)
                if record:
                    records.append(record)
                    print(f"Scraped: '{record['name']}' (Rating: {record['rating']}, Reviews: {record['reviews_count']})")
                    
                    # Accumulate and write in batches of 20
                    if len(records) == 20:
                        save_batch(records, batch_num)
                        records = []  # Clear buffer
                        batch_num += 1
                        
            except Exception as e:
                print(f"Error scraping listing {i + 1}: {e}", file=sys.stderr)
                
        # Save remaining records at the end
        if len(records) > 0:
            save_batch(records, batch_num)
            
        print("\nScraping session finished.")
        browser.close()
        
    # Execute the post-scrape lead analysis and cleanup
    process_and_cleanup_data(job_id=job_id, query=query)


def extract_details(details_panel, page):
    """
    Extracts all fields from the details panel.
    """
    record = {}
    
    # 1. Name
    try:
        name_el = details_panel.locator('h1.DUwDvf, h1:not([aria-label="Sponsored"]):not([aria-label="Ad"])').first
        record["name"] = name_el.inner_text().strip() if name_el.count() > 0 else None
    except Exception:
        record["name"] = None
        
    if not record["name"]:
        return None
        
    # 2. Rating
    record["rating"] = None
    try:
        rating_el = details_panel.locator("div.F7nice span").first
        if rating_el.count() > 0:
            rating_text = rating_el.inner_text().strip()
            rating_text = rating_text.replace(",", ".")
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
        cat_el = details_panel.locator('button[jsaction*="category"]').first
        if cat_el.count() > 0:
            record["category"] = cat_el.inner_text().strip()
    except Exception:
        pass
        
    if not record["category"]:
        try:
            cat_el = details_panel.locator('button[class*="category"]').first
            if cat_el.count() > 0:
                record["category"] = cat_el.inner_text().strip()
        except Exception:
            pass

    # 5. Address
    record["address"] = None
    try:
        addr_el = details_panel.locator('[data-item-id="address"]').first
        if addr_el.count() > 0:
            record["address"] = addr_el.inner_text().strip()
    except Exception:
        pass

    # 6. Phone
    record["phone"] = None
    try:
        phone_el = details_panel.locator('[data-item-id^="phone:tel:"]').first
        if phone_el.count() > 0:
            item_id = phone_el.get_attribute("data-item-id")
            if item_id and item_id.startswith("phone:tel:"):
                record["phone"] = item_id.replace("phone:tel:", "").strip()
            else:
                record["phone"] = phone_el.inner_text().strip()
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
            record["website"] = href if href else web_el.inner_text().strip()
    except Exception:
        pass

    # 8. Opening Hours
    record["opening_hours"] = None
    try:
        hours_el = details_panel.locator('[data-item-id="oh"]').first
        if hours_el.count() > 0:
            initial_text = hours_el.inner_text().strip()
            try:
                hours_el.click(timeout=1000)
                random_delay(0.4, 0.6)
            except Exception:
                pass
                
            table_el = details_panel.locator("table").first
            if table_el.count() > 0:
                table_text = table_el.inner_text().strip()
                record["opening_hours"] = "\n".join([line.strip() for line in table_text.splitlines() if line.strip()])
            else:
                record["opening_hours"] = initial_text
    except Exception:
        pass

    # 9. Full text content of details panel
    try:
        record["full_text"] = details_panel.inner_text().strip()
    except Exception:
        record["full_text"] = ""

    # 10. Social media links
    record["social_links"] = extract_social_links(details_panel)
    
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
        update_job_status(args.job_id, "active", query_input, args.limit)
        
    try:
        scrape_google_maps(query_input, limit=args.limit, headless=args.headless, job_id=args.job_id)
    except Exception as e:
        print(f"\nAn error occurred during execution: {e}", file=sys.stderr)
        if args.job_id:
            update_job_status(args.job_id, "failed")
        sys.exit(1)
