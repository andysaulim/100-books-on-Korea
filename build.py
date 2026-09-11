#!/usr/bin/env python3
"""Build a single self-contained books.html.

The shelf normally loads styles.css, books.js and app.js as separate
files. That is fine on its own domain, but awkward to drop into another
site. This inlines all three so the page is one portable file with no
relative paths to get wrong — only the web font and the cover images are
still fetched over the network.

    python3 build.py            ->  dist/books.html
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "dist" / "books.html"


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


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


def main():
    html = read("index.html")

    html = sub_once(
        html,
        r'<link rel="stylesheet" href="assets/styles\.css">',
        "<style>\n" + read("assets/styles.css").strip() + "\n</style>",
        "stylesheet link",
    )

    scripts = "\n".join(
        "<script>\n" + guard(read(f), f).strip() + "\n</script>"
        for f in ("books.js", "assets/app.js")
    )
    html = sub_once(
        html,
        r'<script src="books\.js"></script>\s*\n\s*<script src="assets/app\.js"></script>',
        scripts,
        "pair of script tags",
    )

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
