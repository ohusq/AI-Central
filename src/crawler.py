#!/usr/bin/env python3
import hashlib
import os
import re
import signal
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import (
    TimeoutException, WebDriverException,
    StaleElementReferenceException,
)

SPEED = 0.35
PAGES_DIR = Path("pages")
DB_FILE = "crawler.db"
STARTING_POINT_FILE = "starting point.txt"

BLOCKED_DOMAINS = {
    "facebook.com", "www.facebook.com", "m.facebook.com",
    "twitter.com", "www.twitter.com", "x.com", "www.x.com",
    "instagram.com", "www.instagram.com",
    "linkedin.com", "www.linkedin.com",
    "tiktok.com", "www.tiktok.com",
    "snapchat.com", "www.snapchat.com",
    "pinterest.com", "www.pinterest.com",
    "reddit.com", "www.reddit.com", "old.reddit.com",
    "youtube.com", "www.youtube.com", "m.youtube.com",
    "twitch.tv", "www.twitch.tv",
    "vimeo.com", "www.vimeo.com",
    "dailymotion.com", "www.dailymotion.com",
    "whatsapp.com", "www.whatsapp.com",
    "telegram.org", "www.telegram.org", "t.me",
    "discord.com", "www.discord.com", "discord.gg",
    "signal.org", "www.signal.org",
    "amazon.com", "www.amazon.com",
    "ebay.com", "www.ebay.com",
    "walmart.com", "www.walmart.com",
    "alibaba.com", "www.alibaba.com",
    "aliexpress.com", "www.aliexpress.com",
    "etsy.com", "www.etsy.com",
    "google.com", "www.google.com",
    "bing.com", "www.bing.com",
    "yahoo.com", "www.yahoo.com",
    "duckduckgo.com", "www.duckduckgo.com",
    "netflix.com", "www.netflix.com",
    "spotify.com", "www.spotify.com",
    "zoom.us", "www.zoom.us",
}

CLOUDFLARE_INDICATORS = [
    "Checking your browser",
    "Just a moment",
    "DDoS protection by Cloudflare",
    "Attention Required! | Cloudflare",
    "cf-browser-verification",
    "Cloudflare Ray ID",
    "Please stand by, while we are checking your browser",
]


def normalize_url(url):
    parsed = urlparse(url)
    parsed = parsed._replace(fragment="")
    path = parsed.path.rstrip("/") or "/"
    parsed = parsed._replace(path=path)
    return parsed.geturl()


def sanitize_filename(title):
    safe = re.sub(r'[<>:"/\\|?*]', "_", title)
    safe = re.sub(r"\s+", " ", safe).strip()
    return (safe or "untitled")[:120]


def domain_from_url(url):
    return urlparse(url).netloc.lower().lstrip("www.")


def is_blocked(url):
    domain = domain_from_url(url)
    return any(domain == b or domain.endswith("." + b) for b in BLOCKED_DOMAINS)


def is_cloudflare(driver):
    try:
        text = driver.page_source.lower()
        title = driver.title.lower()
        for ind in CLOUDFLARE_INDICATORS:
            if ind.lower() in text or ind.lower() in title:
                return True
    except Exception:
        pass
    return False


def load_seeds():
    if not os.path.exists(STARTING_POINT_FILE):
        return []
    with open(STARTING_POINT_FILE) as f:
        return [l.strip() for l in f if l.strip() and not l.startswith("#")]


def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS queue (
            url TEXT PRIMARY KEY,
            status TEXT DEFAULT 'pending'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pages (
            url TEXT PRIMARY KEY,
            title TEXT,
            filename TEXT
        )
    """)
    conn.commit()
    return conn


def enqueue_urls(conn, urls):
    conn.executemany(
        "INSERT OR IGNORE INTO queue (url, status) VALUES (?, 'pending')",
        [(u,) for u in urls],
    )
    conn.commit()


def dequeue_url(conn):
    cur = conn.execute(
        "SELECT url FROM queue WHERE status = 'pending' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        url = row[0]
        conn.execute("UPDATE queue SET status = 'visited' WHERE url = ?", (url,))
        conn.commit()
        return url
    return None


def queue_pending(conn):
    cur = conn.execute("SELECT COUNT(*) FROM queue WHERE status = 'pending'")
    return cur.fetchone()[0]


def queue_visited(conn):
    cur = conn.execute("SELECT COUNT(*) FROM queue WHERE status = 'visited'")
    return cur.fetchone()[0]


def pages_saved(conn):
    cur = conn.execute("SELECT COUNT(*) FROM pages")
    return cur.fetchone()[0]


def main():
    print(f"[+] Speed: {SPEED}s  |  Ctrl+C to stop")

    conn = init_db()
    PAGES_DIR.mkdir(exist_ok=True)

    if queue_pending(conn) == 0:
        seeds = load_seeds()
        if not seeds:
            print("[-] No seed URLs in 'starting point.txt'")
            return
        enqueue_urls(conn, seeds)
        print(f"[+] Loaded {len(seeds)} seed URLs")

    options = Options()
    options.binary_location = (
        r"C:\Users\ohusq\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe"
    )
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"},
    )

    running = True

    def shutdown(sig, frame):
        nonlocal running
        print("\n[!] Shutting down...")
        running = False

    signal.signal(signal.SIGINT, shutdown)

    try:
        while running:
            url = dequeue_url(conn)
            if url is None:
                print("\n[-] Queue empty")
                break

            if is_blocked(url):
                continue

            domain = domain_from_url(url)
            count = pages_saved(conn) + 1
            pending = queue_pending(conn)

            try:
                driver.get(url)
            except WebDriverException as e:
                print(f"[{count}] {domain}  |  q:{pending}  |  \u2717 nav fail")
                continue

            try:
                WebDriverWait(driver, timeout=max(10, SPEED * 5)).until(
                    lambda d: d.execute_script("return document.readyState") == "complete"
                )
            except TimeoutException:
                print(f"[{count}] {domain}  |  q:{pending}  |  \u2717 timeout")
                try:
                    driver.back()
                except WebDriverException:
                    pass
                time.sleep(SPEED)
                continue

            time.sleep(SPEED)

            if is_cloudflare(driver):
                print(f"[{count}] {domain}  |  q:{pending}  |  \u2717 cloudflare")
                try:
                    driver.back()
                except WebDriverException:
                    pass
                time.sleep(SPEED)
                continue

            title = driver.title or "untitled"

            if any(e in title.lower() for e in [
                "404 not found", "500 internal server",
                "this site can't be reached", "page not found",
                "access denied", "error",
            ]):
                print(f"[{count}] {domain}  |  q:{pending}  |  \u2717 {title[:50]}")
                continue

            html = driver.page_source
            safe = sanitize_filename(title)
            hash_ = hashlib.md5(url.encode()).hexdigest()[:8]
            filepath = PAGES_DIR / f"{safe}_{hash_}.html"

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(html)

            conn.execute(
                "INSERT OR REPLACE INTO pages (url, title, filename) VALUES (?, ?, ?)",
                (url, title, filepath.name),
            )
            conn.commit()

            new_urls = []
            try:
                for link in driver.find_elements(By.TAG_NAME, "a"):
                    try:
                        href = link.get_attribute("href")
                    except StaleElementReferenceException:
                        continue
                    if not href:
                        continue
                    parsed = urlparse(href)
                    if parsed.scheme not in ("http", "https"):
                        continue
                    new_urls.append(normalize_url(href))
            except Exception:
                pass

            if new_urls:
                enqueue_urls(conn, new_urls)

            print(f"[{count}] {domain}  |  q:{len(new_urls)} new  |  \u2713 \"{title[:65]}\"")
            time.sleep(SPEED)

    finally:
        driver.quit()
        saved = pages_saved(conn)
        visited = queue_visited(conn)
        pending = queue_pending(conn)
        conn.close()
        print(f"[Done] Saved {saved} pages, visited {visited} URLs ({pending} pending)")


if __name__ == "__main__":
    main()
