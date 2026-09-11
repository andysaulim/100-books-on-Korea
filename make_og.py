#!/usr/bin/env python3
"""Render assets/og.png, the 1200x630 social card.

Uses headless Chrome's own --screenshot flag, so there is nothing to
install beyond a Chrome or Chromium binary.

    python3 make_og.py [--chrome /path/to/chrome]

The card is set in Source Serif 4, the same face as the page, fetched
from Google Fonts at render time. Without network access the shot still
succeeds but falls back to a system serif — so look at the result, and
re-run it somewhere with network access if the face is wrong.
"""

import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "assets" / "og.png"

CANDIDATES = [
    "google-chrome", "chromium", "chromium-browser", "chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

# Headless Chrome's --window-size counts browser chrome, so the visible
# viewport is shorter than the image it writes and the leftover band is
# filled with the page background. Anchoring anything to the bottom edge
# therefore gets clipped. The card is instead one block centred in
# whatever viewport it gets, on the same paper as the band.
CARD = """<!doctype html>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400..600&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; }
  body {
    width: 1200px; min-height: 100vh;
    display: flex; flex-direction: column; justify-content: center;
    box-sizing: border-box;
    padding: 56px 88px;
    background: #faf7f0;
    color: #191813;
    font-family: "Source Serif 4", Georgia, serif;
  }
  .eyebrow, .foot { margin: 0; }
  .eyebrow { font-size: 24px; letter-spacing: .14em; text-transform: uppercase; color: #7d7668; }
  h1 { margin: 26px 0 0; font-size: 84px; font-weight: 600; line-height: 1.04; letter-spacing: -.02em; }
  .blurb { margin: 26px 0 0; font-size: 29px; line-height: 1.34; color: #565043; max-width: 36ch; }
  .rule { height: 1px; background: #e4ded0; margin: 34px 0 18px; }
  .foot { font-size: 24px; color: #7d7668; }
</style>
<p class="eyebrow">Recommended by Andy Lim</p>
<h1>Top 100 Books<br>on Korea</h1>
<p class="blurb">The war and its long aftermath, two states, the alliance, the culture, the people.</p>
<div class="rule"></div>
<p class="foot">andysaulim.com</p>
"""


def find_chrome(explicit):
    for c in ([explicit] if explicit else []) + CANDIDATES:
        found = shutil.which(c) or (c if pathlib.Path(c).is_file() else None)
        if found:
            return found
    sys.exit("no Chrome or Chromium found; pass one with --chrome")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", help="path to a Chrome or Chromium binary")
    args = ap.parse_args()

    chrome = find_chrome(args.chrome)
    OUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        card = pathlib.Path(tmp) / "og.html"
        card.write_text(CARD, encoding="utf-8")
        cmd = [
            chrome, "--headless", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", "--force-device-scale-factor=1",
            "--virtual-time-budget=4000",
            f"--user-data-dir={tmp}/profile",
            "--window-size=1200,630",
            f"--screenshot={OUT}",
            card.as_uri(),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)

    if not OUT.exists():
        sys.exit(f"chrome did not write the screenshot:\n{proc.stderr.strip()}")

    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    print("  Check the face: without network access to Google Fonts this "
          "falls back to a system serif.")


if __name__ == "__main__":
    main()
