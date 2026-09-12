#!/usr/bin/env python3
"""Download every cover once, into assets/covers/, and point the data at them.

    python3 fetch_covers.py
    python3 fetch_covers.py --force        # re-fetch books that already have a file
    python3 fetch_covers.py --only demick  # just the books matching a string

Why this exists
---------------
Resolving covers in the browser has two failures that cannot be fixed there:

1. Open Library's cover API allows 100 requests per IP per 5 minutes when
   looking up by identifier, and answers 403 past that. A 101-book shelf sits
   on that limit every single load.

2. When Google has no art for a volume it does not 404 — it returns a real
   image that reads "image not available". In a browser those bytes are
   cross-origin, so the page cannot look at them and has no way to tell that
   picture from a cover. It renders the placeholder.

Downloading fixes both. Here we can space the requests out, and we can look
at the bytes: this script learns Google's placeholder by deliberately asking
for a nonsense ISBN, then rejects anything that comes back matching it.

Afterwards every cover is a local file, the page makes no cover requests at
all, and `python3 build.py` bakes them into dist/books.html.

Needs nothing but Python and a network that can reach the cover hosts.
"""

import argparse
import hashlib
import json
import pathlib
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent
COVERS = ROOT / "assets" / "covers"

UA = {"User-Agent": "100-books-on-korea/1.0 (personal reading list; contact via andysaulim.com)"}

MIN_WIDTH = 200          # a book is drawn 188px wide; anything less is upscaled
MIN_BYTES = 6000         # placeholders and spacers are tiny
OL_SPACING = 3.1         # 100 requests / 5 minutes, with room to spare


# --- reading image size without an image library ------------------------

def png_size(b):
    if b[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", b[16:24])
    return w, h


def jpeg_size(b):
    """Walk the JPEG segments to the frame header that carries the size."""
    if b[:2] != b"\xff\xd8":
        return None
    i = 2
    while i < len(b) - 9:
        if b[i] != 0xFF:
            i += 1
            continue
        marker = b[i + 1]
        # SOF0..SOF15, skipping the four that are not frame headers
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg = struct.unpack(">H", b[i + 2:i + 4])[0]
        i += 2 + seg
    return None


def gif_size(b):
    if b[:6] not in (b"GIF87a", b"GIF89a"):
        return None
    return struct.unpack("<HH", b[6:10])


def image_size(b):
    for fn in (png_size, jpeg_size, gif_size):
        got = fn(b)
        if got:
            return got
    return None


def extension(b):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    return ".jpg"


# --- fetching -----------------------------------------------------------

def get(url, timeout=25):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
        return None


def isbn10(i13):
    if not re.fullmatch(r"978\d{10}", i13 or ""):
        return None
    core = i13[3:12]
    total = sum((10 - i) * int(core[i]) for i in range(9))
    check = (11 - total % 11) % 11
    return core + ("X" if check == 10 else str(check))


def google_isbn(isbn, zoom):
    return ("https://books.google.com/books/content"
            f"?vid=ISBN{isbn}&printsec=frontcover&img=1&zoom={zoom}")


def google_id(vol, zoom):
    return ("https://books.google.com/books/content"
            f"?id={urllib.parse.quote(vol)}&printsec=frontcover&img=1&zoom={zoom}")


def learn_placeholders():
    """Google's "image not available" picture, fetched on purpose.

    Asking for an ISBN that cannot exist gets the placeholder and nothing
    else, so its digest is a reliable thing to reject later.
    """
    seen = set()
    for zoom in (0, 1, 2):
        blob = get(google_isbn("9780000000002", zoom))
        if blob:
            seen.add(hashlib.sha256(blob).hexdigest())
    return seen


def usable(blob, placeholders, min_width=MIN_WIDTH):
    """(ok, why-not) for a downloaded image."""
    if not blob:
        return False, "no response"
    if hashlib.sha256(blob).hexdigest() in placeholders:
        return False, "Google's 'image not available' placeholder"
    if len(blob) < MIN_BYTES:
        return False, f"only {len(blob)} bytes"
    size = image_size(blob)
    if not size:
        return False, "not a recognisable image"
    w, h = size
    if w < min_width or h < 50:
        return False, f"{w}x{h}, too small"
    return True, f"{w}x{h}, {len(blob) // 1024}KB"


# --- the chain, run once per book ---------------------------------------

def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def titles_agree(want, got):
    want, got = norm(want), norm(got)
    return bool(want and got) and (want.startswith(got) or got.startswith(want))


def first_author(a):
    return re.split(r"\s+(?:and|&|with)\s+|,\s*", a or "")[0].strip()


def bare_title(t):
    return re.split(r"\s*[:—–]\s+", t or "")[0].strip()


class Fetcher:
    def __init__(self, placeholders):
        self.placeholders = placeholders
        self.last_ol = 0.0

    def open_library(self, url):
        """Spaced out, because this is the endpoint with the 100/5min limit."""
        wait = OL_SPACING - (time.time() - self.last_ol)
        if wait > 0:
            time.sleep(wait)
        self.last_ol = time.time()
        return get(url)

    def candidates(self, book):
        """Yield (label, blob-getter, min-width), best jacket fidelity first.

        Open Library leads here, the opposite of the page's order. On the page
        the limit forces Google first; running once, spaced out, we can afford
        the source that carries the actual edition's jacket more often.
        """
        isbn = book.get("isbn")
        if isbn:
            yield ("Open Library, ISBN",
                   lambda: self.open_library(
                       f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"),
                   MIN_WIDTH)
            for i in [isbn, isbn10(isbn)]:
                if i:
                    yield (f"Google, ISBN {i}, large", lambda i=i: get(google_isbn(i, 0)), MIN_WIDTH)
            for i in [isbn, isbn10(isbn)]:
                if i:
                    yield (f"Google, ISBN {i}", lambda i=i: get(google_isbn(i, 1)), 100)

        yield from self.by_search(book)

    def by_search(self, book):
        author = first_author(book.get("author"))

        for title in filter(None, [book["title"], bare_title(book["title"])]):
            url = ("https://openlibrary.org/search.json?limit=5&fields=title,cover_i"
                   f"&title={urllib.parse.quote(title)}&author={urllib.parse.quote(author)}")
            raw = get(url)
            if not raw:
                continue
            try:
                docs = json.loads(raw).get("docs", [])
            except json.JSONDecodeError:
                continue
            for d in docs:
                if d.get("cover_i") and titles_agree(book["title"], d.get("title")):
                    cid = d["cover_i"]
                    # by cover id, which Open Library does not rate limit
                    yield (f"Open Library, search (cover {cid})",
                           lambda cid=cid: get(f"https://covers.openlibrary.org/b/id/{cid}-L.jpg"),
                           MIN_WIDTH)
                    break

        q = f'intitle:"{bare_title(book["title"])}" inauthor:"{author}"'
        raw = get("https://www.googleapis.com/books/v1/volumes?maxResults=5&country=US&q="
                  + urllib.parse.quote(q))
        if raw:
            try:
                items = json.loads(raw).get("items", [])
            except json.JSONDecodeError:
                items = []
            for it in items:
                info = it.get("volumeInfo", {})
                if it.get("id") and titles_agree(book["title"], info.get("title")):
                    vol = it["id"]
                    yield (f"Google, search ({vol}), large",
                           lambda vol=vol: get(google_id(vol, 0)), MIN_WIDTH)
                    yield (f"Google, search ({vol})",
                           lambda vol=vol: get(google_id(vol, 1)), 100)
                    break


def slug(book):
    base = re.sub(r"[^a-z0-9]+", "-", bare_title(book["title"]).lower()).strip("-")
    return base[:48] or book["id"][:48]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="re-fetch books that already have a local file")
    ap.add_argument("--only", help="only books whose author or title contains this")
    args = ap.parse_args()

    books = json.loads((ROOT / "books.json").read_text(encoding="utf-8"))
    COVERS.mkdir(parents=True, exist_ok=True)

    print("learning Google's placeholder so it can be rejected...", flush=True)
    placeholders = learn_placeholders()
    print(f"  {len(placeholders)} placeholder digest(s) recorded"
          if placeholders else
          "  WARNING: could not reach Google; placeholders cannot be detected")

    fetcher = Fetcher(placeholders)
    got = kept = 0
    missing = []

    for n, book in enumerate(books, 1):
        if args.only and args.only.lower() not in (book["author"] + book["title"]).lower():
            continue

        existing = sorted(COVERS.glob(slug(book) + ".*"))
        if existing and not args.force:
            book["cover"] = f"assets/covers/{existing[0].name}"
            kept += 1
            continue

        label = f"{book['author']} — {bare_title(book['title'])}"
        print(f"[{n:3}/{len(books)}] {label[:64]}", flush=True)

        saved = None
        for why, fetch, min_w in fetcher.candidates(book):
            blob = fetch()
            ok, note = usable(blob, placeholders, min_w)
            if ok:
                path = COVERS / (slug(book) + extension(blob))
                path.write_bytes(blob)
                book["cover"] = f"assets/covers/{path.name}"
                print(f"          {why} -> {path.name} ({note})")
                saved = path
                got += 1
                break
            print(f"          {why}: {note}")

        if not saved:
            missing.append(label)
            print("          nothing usable; keeping the typographic stand-in")

    (ROOT / "books.json").write_text(
        json.dumps(books, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    header = (ROOT / "books.js").read_text(encoding="utf-8").split("window.BOOKS = ")[0]
    (ROOT / "books.js").write_text(
        header + "window.BOOKS = " + json.dumps(books, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8")

    print(f"\ndownloaded {got}, already had {kept}, still missing {len(missing)}")
    for label in missing:
        print(f"  - {label}")
    print("\nbooks.json and books.js now point at the local files.")
    print("Run `python3 build.py` to bake them into dist/books.html.")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
