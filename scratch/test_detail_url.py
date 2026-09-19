import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://www.google.com/maps/search/dentists+in+Delhi", timeout=60000)
    time.sleep(3)
    
    first_a = page.locator('div[role="feed"] a[href*="/maps/place/"]').first
    href = first_a.get_attribute("href")
    print(f"Original href: {href}")
    
    clean_url = href.split("?")[0]
    print(f"Clean URL: {clean_url}")
    
    detail_page = browser.new_page()
    print("Navigating to clean URL...")
    detail_page.goto(clean_url, timeout=30000, wait_until="domcontentloaded")
    time.sleep(2)
    print(f"Detail page title: {detail_page.title()}")
    h1 = detail_page.locator('h1.DUwDvf, div[role="main"] h1').first
    if h1.count() > 0:
        print(f"H1: {h1.inner_text()}")
    else:
        print("H1 not found")
        
    browser.close()
