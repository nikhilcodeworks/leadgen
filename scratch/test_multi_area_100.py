import urllib.parse
import time
from playwright.sync_api import sync_playwright

def test_100_listings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage"
        ])
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        context.add_cookies([{
            "name": "SOCS",
            "value": "CAISHAgBEhJnd3NfMjAyNDA2MjEtMF8SQzEaBmVuIAEaBgiAsd-yBq",
            "domain": ".google.com",
            "path": "/"
        }])
        page = context.new_page()
        query = "dentists in Delhi"
        url = "https://www.google.com/maps/search/" + urllib.parse.quote_plus(query)
        print(f"Navigating to {url}...", flush=True)
        page.goto(url, timeout=60000, wait_until="domcontentloaded")
        time.sleep(3)
        
        feed = page.locator('div[role="feed"]').first
        seen_urls = set()
        collected = []
        target = 100
        no_new_streak = 0
        
        for step in range(1, 60):
            anchors = page.locator('div[role="feed"] a[href*="/maps/place/"]')
            count = anchors.count()
            new_this_step = 0
            
            for i in range(count):
                try:
                    a = anchors.nth(i)
                    href = a.get_attribute("href")
                    if not href or "/maps/place/" not in href:
                        continue
                    clean_url = href.split("?")[0].rstrip("/")
                    if clean_url in seen_urls:
                        continue
                    name = a.get_attribute("aria-label") or ""
                    seen_urls.add(clean_url)
                    collected.append({"name": name, "url": clean_url})
                    new_this_step += 1
                except Exception:
                    pass
                    
            print(f"Step {step}: Total collected = {len(collected)} (+{new_this_step})", flush=True)
            if len(collected) >= target:
                print(f"🎉 Successfully collected {len(collected)} listings (>= {target})!", flush=True)
                break
                
            if new_this_step == 0:
                no_new_streak += 1
            else:
                no_new_streak = 0
                
            # If stalled or hit limited/end text: expand search area!
            end_detected = (
                page.locator("text=You've reached the end of the list.").count() > 0 or
                page.locator("text=You're seeing a limited view").count() > 0 or
                no_new_streak >= 3
            )
            
            if end_detected and len(collected) < target:
                print(f"Expansion needed (stalled at {len(collected)}). Zooming out and searching area...", flush=True)
                # First check if 'Search this area' is already visible
                search_area_btn = page.locator('button:has-text("Search this area"), button[aria-label*="Search this area"]').first
                if search_area_btn.count() == 0 or not search_area_btn.is_visible():
                    # Zoom out map
                    zoom_out_btn = page.locator('button#widget-zoomout, button[aria-label="Zoom out"]').first
                    if zoom_out_btn.count() > 0 and zoom_out_btn.is_visible():
                        zoom_out_btn.click()
                        time.sleep(0.5)
                        zoom_out_btn.click()
                        time.sleep(1.5)
                    else:
                        # Fallback: zoom via keyboard or mouse on map canvas
                        page.keyboard.press("-")
                        time.sleep(1)
                        
                search_area_btn = page.locator('button:has-text("Search this area"), button[aria-label*="Search this area"]').first
                if search_area_btn.count() > 0 and search_area_btn.is_visible():
                    print("Clicking 'Search this area' button!", flush=True)
                    search_area_btn.click()
                    time.sleep(3)
                    no_new_streak = 0
                    continue
                else:
                    # If still not visible, pan map slightly
                    page.evaluate('''() => {
                        const canvas = document.querySelector('canvas') || document.querySelector('#scene');
                        if (canvas) {
                            const rect = canvas.getBoundingClientRect();
                            const evt = new MouseEvent('mousemove', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
                            canvas.dispatchEvent(evt);
                        }
                    }''')
                    
            # Standard scroll
            page.evaluate('''() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) feed.scrollTop = feed.scrollHeight;
            }''')
            
            feed_box = feed.bounding_box()
            if feed_box:
                page.mouse.move(feed_box["x"] + feed_box["width"] / 2, feed_box["y"] + feed_box["height"] / 2)
                page.mouse.wheel(0, 4000)
                
            time.sleep(2)
            
        print(f"\nFinal Result: Collected {len(collected)} unique listings!", flush=True)
        browser.close()

if __name__ == "__main__":
    test_100_listings()
