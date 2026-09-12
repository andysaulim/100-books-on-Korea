#!/usr/bin/env python3
"""Render assets/og.png, the 1200x630 social card.

Uses headless Chrome's own --screenshot flag, so there is nothing to
install beyond a Chrome or Chromium binary.

    python3 make_og.py [--chrome /path/to/chrome]

The card is set in Fraunces and Source Serif 4, the same faces as the
page. Headless Chrome does not reliably fetch webfonts during a
screenshot, so the fonts are downloaded here and embedded in the card as
data URIs before it is rendered. Without network access the shot still
succeeds, in a system serif, and the script says which happened.
"""

import argparse
import base64
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "assets" / "og.png"

CANDIDATES = [
    "google-chrome", "chromium", "chromium-browser", "chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

FONT_CSS = ("https://fonts.googleapis.com/css2"
            "?family=Fraunces:opsz,wght@9..144,400..700"
            "&family=Source+Serif+4:opsz,wght@8..60,400..600&display=block")

# Google serves woff2 only to a browser-ish UA; anything else gets ttf.
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}


def fetch(url, timeout=20):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout).read()


def embedded_font_css():
    """The Google Fonts stylesheet with every font file inlined as a data URI.

    Returns None if the fonts cannot be fetched, so the caller can fall
    back to a plain <link> and say the face may be wrong.
    """
    try:
        css = fetch(FONT_CSS).decode()
    except Exception:
        return None

    for url in sorted(set(re.findall(r"url\((https://[^)]+)\)", css))):
        try:
            blob = base64.b64encode(fetch(url)).decode()
        except Exception:
            return None
        css = css.replace(url, "data:font/woff2;base64," + blob)
    return css

# Headless Chrome's --window-size counts browser chrome, so the visible
# viewport is shorter than the image it writes and the leftover band is
# filled with the page background. Anchoring anything to the bottom edge
# therefore gets clipped. The card is instead one block centred in
# whatever viewport it gets, on the same paper as the band.
CARD = """<!doctype html>
<meta charset="utf-8">
__FONTS__
<style>
  html, body { margin: 0; }
  body {
    width: 1200px; min-height: 100vh;
    display: flex; flex-direction: column; justify-content: center;
    box-sizing: border-box;
    padding: 56px 88px;
    background: #e9efe2;
    color: #17201a;
    font-family: "Source Serif 4", Georgia, serif;
  }
  .eyebrow, .foot { margin: 0; }
  .eyebrow { font-size: 24px; letter-spacing: .18em; text-transform: uppercase; color: #5f6a55; }
  h1 { margin: 26px 0 0; font-family: "Fraunces", Georgia, serif; font-size: 96px; font-weight: 600;
       line-height: .97; letter-spacing: -.025em; color: #2c5440;
       font-variation-settings: "SOFT" 24, "WONK" 1; }
  .blurb { margin: 26px 0 0; font-size: 29px; line-height: 1.34; color: #47503f; max-width: 36ch; }
  .rule { height: 1px; background: #cdd8c2; margin: 34px 0 18px; }
  .foot { font-size: 24px; color: #5f6a55; }
</style>
<p class="eyebrow">Recommended by Andy Lim</p>
<h1>100 Books<br>on Korea</h1>
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

    fonts = embedded_font_css()
    card_html = CARD.replace(
        "__FONTS__",
        "<style>\n" + fonts + "\n</style>" if fonts
        else '<link href="' + FONT_CSS + '" rel="stylesheet">')

    with tempfile.TemporaryDirectory() as tmp:
        card = pathlib.Path(tmp) / "og.html"
        card.write_text(card_html, encoding="utf-8")
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
    print("  fonts embedded: Fraunces + Source Serif 4" if fonts else
          "  WARNING: could not fetch the webfonts; the card fell back to a "
          "system serif. Re-run with network access.")


if __name__ == "__main__":
    main()
