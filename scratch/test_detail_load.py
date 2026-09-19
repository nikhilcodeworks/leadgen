import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://www.google.com/maps/search/dentists+in+Delhi", timeout=60000)
    time.sleep(3)
    
    first_a = page.locator('div[role="feed"] a[href*="/maps/place/"]').first
    orig_href = first_a.get_attribute("href")
    
    print("Testing Original href navigation...")
    page2 = browser.new_page()
    page2.goto(orig_href, timeout=30000)
    
    # Wait for panel
    for sec in range(10):
        h1_count = page2.locator('h1.DUwDvf, div[role="main"] h1').count()
        if h1_count > 0:
            print(f"H1 found after {sec}s! Text: '{page2.locator('h1.DUwDvf, div[role="main"] h1').first.inner_text()}'")
            break
        time.sleep(1)
    else:
        print("H1 NOT found after 10s on orig_href!")
        print("Page text snippet:", repr(page2.inner_text("body")[:300]))
        
    print("\nTesting Clean URL navigation...")
    clean_url = orig_href.split("?")[0]
    page3 = browser.new_page()
    page3.goto(clean_url, timeout=30000)
    for sec in range(10):
        h1_count = page3.locator('h1.DUwDvf, div[role="main"] h1').count()
        if h1_count > 0:
            print(f"H1 found after {sec}s on clean_url! Text: '{page3.locator('h1.DUwDvf, div[role="main"] h1').first.inner_text()}'")
            break
        time.sleep(1)
    else:
        print("H1 NOT found after 10s on clean_url!")
        print("Page text snippet:", repr(page3.inner_text("body")[:300]))
        
    browser.close()
