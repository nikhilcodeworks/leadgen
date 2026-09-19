import urllib.parse
import time
from playwright.sync_api import sync_playwright

def diagnose():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage"
        ])
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        query = "dentists in Delhi"
        url = "https://www.google.com/maps/search/" + urllib.parse.quote_plus(query)
        page.goto(url, timeout=60000, wait_until="domcontentloaded")
        time.sleep(3)
        
        feed = page.locator('div[role="feed"]').first
        seen = set()
        
        for attempt in range(1, 10):
            anchors = page.locator('div[role="feed"] a[href*="/maps/place/"]')
            for i in range(anchors.count()):
                try:
                    href = anchors.nth(i).get_attribute("href")
                    if href:
                        seen.add(href.split("?")[0])
                except Exception:
                    pass
            print(f"Attempt {attempt}: Total found = {len(seen)}", flush=True)
            
            # Scroll feed
            page.evaluate('''() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) feed.scrollTop = feed.scrollHeight;
            }''')
            time.sleep(2)
            
        print(f"\n--- Stalled at {len(seen)} items. Diagnosing DOM state ---", flush=True)
        
        # Check end of list text
        end_list = page.locator("text=You've reached the end of the list.").count()
        print(f"Has 'You\\'ve reached the end of the list.': {end_list > 0}", flush=True)
        
        # Check all text at bottom of feed
        feed_text = feed.inner_text()
        print("Last 200 chars of feed text:", repr(feed_text[-200:]), flush=True)
        
        # Check buttons on page
        buttons = page.locator("button")
        for i in range(buttons.count()):
            try:
                b = buttons.nth(i)
                txt = b.inner_text().strip()
                label = b.get_attribute("aria-label") or ""
                if "search" in (txt + label).lower() or "zoom" in (txt + label).lower() or "area" in (txt + label).lower():
                    print(f"Interesting button {i}: text='{txt}' aria-label='{label}' visible={b.is_visible()}", flush=True)
            except Exception:
                pass
                
        # Let's test zooming out!
        zoom_out_btn = page.locator('button#widget-zoomout, button[aria-label="Zoom out"]').first
        print(f"Zoom out button count: {zoom_out_btn.count()}, visible: {zoom_out_btn.is_visible() if zoom_out_btn.count() > 0 else False}", flush=True)
        if zoom_out_btn.count() > 0 and zoom_out_btn.is_visible():
            print("Clicking zoom out twice...", flush=True)
            zoom_out_btn.click()
            time.sleep(1)
            zoom_out_btn.click()
            time.sleep(2)
            
            # Check for 'Search this area'
            search_area_btn = page.locator('button:has-text("Search this area"), button[aria-label*="Search this area"]').first
            print(f"After zoom out, 'Search this area' count: {search_area_btn.count()}, visible: {search_area_btn.is_visible() if search_area_btn.count() > 0 else False}", flush=True)
            if search_area_btn.count() > 0 and search_area_btn.is_visible():
                print("Clicking 'Search this area'...", flush=True)
                search_area_btn.click()
                time.sleep(3)
                
                # Check how many anchors now
                anchors2 = page.locator('div[role="feed"] a[href*="/maps/place/"]')
                print(f"After 'Search this area' click, anchor count in feed: {anchors2.count()}", flush=True)
                
        browser.close()

if __name__ == "__main__":
    diagnose()
