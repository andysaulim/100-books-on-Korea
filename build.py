#!/usr/bin/env python3
"""Build a single self-contained books.html.

The shelf normally loads styles.css, books.js and app.js as separate
files. That is fine on its own domain, but awkward to drop into another
site. This inlines all three so the page is one portable file with no
relative paths to get wrong — only the web font, the social card and the
cover images are still fetched over the network.

    python3 build.py
    python3 build.py --base https://andysaulim.com/books/

Every link in the page is relative, so the shelf works at any subpath
without being told where it lives. --base only affects the canonical and
Open Graph URLs, which have to be absolute for a link preview to resolve:
pass the URL the page will be served from and they are rewritten to match.
"""

import argparse
import base64
import pathlib
import re
import sys
from urllib.parse import urljoin

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "dist" / "books.html"
CHECK_OUT = ROOT / "dist" / "cover-check.html"

# Rewritten by --base. Each is (attribute carrying the URL, relative value).
ABSOLUTE_URLS = [
    ('<link rel="canonical" href="{}">', "./"),
    ('<meta property="og:url" content="{}">', "./"),
    ('<meta property="og:image" content="{}">', "assets/og.png"),
    ('<meta name="twitter:image" content="{}">', "assets/og.png"),
]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


MEDIA = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif"}


def inline_local_covers(books_js):
    """Turn `"cover": "assets/covers/x.jpg"` into a data URI.

    A book can be pinned to your own artwork by pointing its `cover` at a
    file in the repo. That path would not resolve once the page is one
    file dropped into another site, so the bytes come along with it. A
    path with no file behind it is left alone: the page then falls through
    to the ISBN sources exactly as it does when the file is missing here.
    """
    out, kept, missed = books_js, 0, []
    for m in set(re.findall(r'"cover":\s*"(assets/covers/[^"]+)"', books_js)):
        f = ROOT / m
        if not f.is_file():
            missed.append(m)
            continue
        kind = MEDIA.get(f.suffix.lower())
        if not kind:
            sys.exit(f"build: {m} is not a web image format")
        uri = f"data:{kind};base64," + base64.b64encode(f.read_bytes()).decode()
        out = out.replace(f'"{m}"', f'"{uri}"')
        kept += 1
    return out, kept, sorted(missed)


def guard(js, name):
    """A literal </script> inside inlined JS would end the block early."""
    if "</script" in js.lower():
        sys.exit(f"{name} contains a literal </script>; escape it before inlining")
    return js


def sub_once(html, pattern, replacement, what):
    html, n = re.subn(pattern, lambda _: replacement, html, count=1)
    if n != 1:
        sys.exit(f"build: expected exactly one {what} in index.html, found {n}")
    return html


def absolutise(html, base):
    if not base.endswith("/"):
        base += "/"
    for template, rel in ABSOLUTE_URLS:
        html = sub_once(
            html,
            re.escape(template.format(rel)),
            template.format(urljoin(base, rel)),
            f"{rel} meta tag",
        )
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--base",
        help="absolute URL the page will be served from, e.g. "
             "https://andysaulim.com/books/ — sets the canonical and Open Graph URLs",
    )
    args = ap.parse_args()

    html = read("index.html")

    html = sub_once(
        html,
        r'<link rel="stylesheet" href="assets/styles\.css">',
        "<style>\n" + read("assets/styles.css").strip() + "\n</style>",
        "stylesheet link",
    )

    books_js, inlined, absent = inline_local_covers(read("books.js"))
    scripts = "\n".join(
        "<script>\n" + guard(js, name).strip() + "\n</script>"
        for name, js in (("books.js", books_js),
                         ("assets/app.js", read("assets/app.js")))
    )
    html = sub_once(
        html,
        r'<script src="books\.js"></script>\s*\n\s*<script src="assets/app\.js"></script>',
        scripts,
        "pair of script tags",
    )

    if args.base:
        html = absolutise(html, args.base)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    if inlined:
        print(f"  inlined {inlined} local cover"
              f"{'' if inlined == 1 else 's'} from assets/covers/")
    for m in absent:
        print(f"  {m} is not there yet; that book falls through to its ISBN sources")

    # The cover audit page needs the same data inlined so it can be opened
    # straight from a downloads folder.
    check = sub_once(
        read("tools/cover-check.html"),
        r"<!--BOOKS-->",
        "<script>\n" + guard(books_js, "books.js").strip() + "\n</script>",
        "books placeholder",
    )
    CHECK_OUT.write_text(check, encoding="utf-8")
    print(f"wrote {CHECK_OUT.relative_to(ROOT)} ({CHECK_OUT.stat().st_size:,} bytes)")
    if args.base:
        print(f"  canonical and Open Graph URLs resolved against {args.base}")
    else:
        print("  canonical and Open Graph URLs left relative; pass --base to set them")


if __name__ == "__main__":
    main()
