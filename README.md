# web-crawler

Headless Selenium crawler. Reads seed URLs from `starting point.txt`,
loads pages via headless Chrome, saves HTML with the page title as
filename, and follows links — skipping social media and other blocked
domains.

## Usage

```bash
uv run crawler.py
```

## Config

Edit `SPEED` and `MAX_PAGES` at the top of `crawler.py`.
