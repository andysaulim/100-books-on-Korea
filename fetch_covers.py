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
MAX_WIDTH = 500          # ...and anything much wider is bytes nobody sees
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


def amazon_cover(i10, size="LZZZZZZZ"):
    """Amazon's cover CDN, keyed on ISBN-10.

    Reached last but it matters: its academic coverage is far better than
    Open Library's or Google's, which is where the Stanford and Columbia
    monographs on this shelf kept falling through. A miss returns a 1x1
    GIF, which the size guard already rejects.
    """
    return f"https://m.media-amazon.com/images/P/{i10}.01.{size}.jpg"


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

    # Open Library has one too, served when a cover id or ISBN has no image
    # and `default=false` was not asked for. The first run of this script
    # saved it 39 times before anyone noticed.
    for url in ("https://covers.openlibrary.org/b/id/1-L.jpg",
                "https://covers.openlibrary.org/b/isbn/9780000000002-L.jpg"):
        blob = get(url)
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


def publisher_cover(url):
    """The jacket from the book's own publisher page, via og:image.

    Open Library and Google hold trade titles well and academic monographs
    badly: of the first run's misses, ten were Stanford, nine Columbia, four
    Cornell, while Penguin Random House had eighteen of nineteen. But every
    book here already links to its publisher, and publishers put the cover
    in their page's Open Graph tags. It is also the most authoritative
    source available, being the actual jacket of the actual edition linked,
    which is what an ISBN lookup keeps getting wrong.
    """
    if not url:
        return None
    page = get(url, timeout=20)
    if not page:
        return None
    try:
        html = page.decode("utf-8", "replace")
    except Exception:
        return None

    for pattern in (
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
    ):
        m = re.search(pattern, html, re.I)
        if m:
            return urllib.parse.urljoin(url, m.group(1).replace("&amp;", "&"))
    return None


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
        # The publisher's own page first: it is the jacket of the edition
        # this entry actually links to, which no ISBN lookup can promise.
        og = publisher_cover(book.get("url"))
        if og:
            yield (f"publisher page ({book.get('source', 'og:image')})",
                   lambda og=og: get(og), MIN_WIDTH)

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

            i10 = isbn10(isbn)
            if i10:
                for size in ("LZZZZZZZ", "MZZZZZZZ"):
                    yield (f"Amazon, ISBN {i10} ({size})",
                           lambda i10=i10, size=size: get(amazon_cover(i10, size)),
                           MIN_WIDTH if size == "LZZZZZZZ" else 120)

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
                           lambda cid=cid: get(f"https://covers.openlibrary.org/b/id/{cid}-L.jpg?default=false"),
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


def shrink(path):
    """Downscale an oversized jacket in place, if Pillow is available.

    Covers come back at anything up to 2000px. A book is drawn 188px wide,
    so past about 500 the extra pixels are bytes nobody will ever see — and
    build.py inlines every one of them as a data URI, where the whole set
    arrived at 8.7MB. Without Pillow this is a no-op and the file is kept
    as downloaded, which is worse but not wrong.
    """
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            if im.width <= MAX_WIDTH:
                return None
            before = path.stat().st_size
            h = round(im.height * MAX_WIDTH / im.width)
            im = im.convert("RGB").resize((MAX_WIDTH, h), Image.LANCZOS)
            out = path.with_suffix(".jpg")
            im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        if out != path:
            path.unlink()
        return out, before, out.stat().st_size
    except Exception:
        return None


def slug(book):
    base = re.sub(r"[^a-z0-9]+", "-", bare_title(book["title"]).lower()).strip("-")
    return base[:48] or book["id"][:48]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="re-fetch books that already have a local file")
    ap.add_argument("--only", help="only books whose author or title contains this")
    args = ap.parse_args()

    data = ROOT / "books.json"
    if not data.is_file():
        sys.exit(
            "fetch_covers.py has to live in the repo, next to books.json.\n"
            f"It is currently in {ROOT}, and there is no books.json there.\n\n"
            "Get the repo and run it from inside:\n"
            "  git clone https://github.com/andysaulim/100-books-on-Korea.git\n"
            "  cd 100-books-on-Korea\n"
            "  git checkout claude/tender-carson-ljopjj\n"
            "  python3 fetch_covers.py"
        )

    books = json.loads(data.read_text(encoding="utf-8"))
    COVERS.mkdir(parents=True, exist_ok=True)

    print("learning Google's placeholder so it can be rejected...", flush=True)
    placeholders = learn_placeholders()
    print(f"  {len(placeholders)} placeholder digest(s) recorded"
          if placeholders else
          "  WARNING: could not reach Google; placeholders cannot be detected")

    fetcher = Fetcher(placeholders)
    got = kept = 0
    # sha of the bytes as downloaded, per book. shrink() re-encodes the file,
    # so the hash on disk is not the hash usable() tests against; teaching the
    # placeholder set a file hash blocks nothing, which is why every retry
    # round downloaded the same picture again.
    blob_digest = {}
    missing = []

    for n, book in enumerate(books, 1):
        if args.only and args.only.lower() not in (book["author"] + book["title"]).lower():
            continue

        # A cover already pinned by hand wins, whatever it is called. Some
        # slots were named before this script existed and do not match the
        # slug it would generate, and overwriting those would silently throw
        # away artwork that was chosen deliberately.
        declared = book.get("cover") or ""
        pinned = (ROOT / declared) if declared.startswith("assets/covers/") else None
        existing = [pinned] if pinned and pinned.is_file() else sorted(COVERS.glob(slug(book) + ".*"))
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
                blob_digest[book["id"]] = hashlib.sha256(blob).hexdigest()
                path = COVERS / (slug(book) + extension(blob))
                path.write_bytes(blob)
                smaller = shrink(path)
                if smaller:
                    path, before, after = smaller
                    note += f", resized to {MAX_WIDTH}px, {before // 1024}KB -> {after // 1024}KB"
                book["cover"] = f"assets/covers/{path.name}"
                print(f"          {why} -> {path.name} ({note})")
                saved = path
                got += 1
                break
            print(f"          {why}: {note}")

        if not saved:
            missing.append(label)
            print("          nothing usable; keeping the typographic stand-in")

    # Jackets already on disk from an earlier run are skipped above, so
    # they never pass through shrink(). Sweep them here.
    saved = 0
    for book in books:
        cover = book.get("cover") or ""
        if not cover.startswith("assets/covers/"):
            continue
        f = ROOT / cover
        if not f.is_file():
            continue
        smaller = shrink(f)
        if smaller:
            newpath, before, after = smaller
            book["cover"] = f"assets/covers/{newpath.name}"
            saved += before - after
    if saved:
        print(f"\n  downscaled oversized jackets, saving {saved // 1024}KB")

    # Two books do not share a jacket. Any image that landed for more than
    # one of them is a placeholder, whatever it looks like and whichever
    # host served it — a guard that needs no prior knowledge of the picture,
    # which is what a list of known digests can never have.
    #
    # This has to repeat. Round one caught Google's zoom=0 filler; the retry
    # then walked further down the chain and came back with a *different*
    # repeated image for the same 17 books. Detecting, learning and retrying
    # once is not enough, so it runs until a round finds no repeats.
    for round_no in range(1, 6):
        by_digest = {}
        for book in books:
            cover = book.get("cover") or ""
            if not cover.startswith("assets/covers/"):
                continue
            f = ROOT / cover
            if f.is_file():
                by_digest.setdefault(hashlib.sha256(f.read_bytes()).hexdigest(), []).append(book)

        repeated = {d: bs for d, bs in by_digest.items() if len(bs) > 1}
        if not repeated:
            if round_no > 1:
                print(f"\n  round {round_no}: every cover is unique")
            break

        placeholders |= set(repeated)
        for shared in repeated.values():
            for book in shared:
                if book["id"] in blob_digest:
                    placeholders.add(blob_digest[book["id"]])

        for digest, shared in repeated.items():
            print(f"\n  round {round_no}: one image landed for {len(shared)} books; it is a placeholder:")
            for book in shared:
                print(f"    - {book['author']} — {bare_title(book['title'])[:44]}")
                (ROOT / book["cover"]).unlink(missing_ok=True)
                book["cover"] = None
                label = f"{book['author']} — {bare_title(book['title'])}"
                if label not in missing:
                    missing.append(label)
                got = max(0, got - 1)

        retry = [b for b in books if not b.get("cover")]
        print(f"\n  round {round_no}: retrying {len(retry)} with {len(placeholders)} placeholders known")
        for book in retry:
            for why, fetch, min_w in fetcher.candidates(book):
                blob = fetch()
                ok, note = usable(blob, placeholders, min_w)
                if not ok:
                    continue
                blob_digest[book["id"]] = hashlib.sha256(blob).hexdigest()
                path = COVERS / (slug(book) + extension(blob))
                path.write_bytes(blob)
                smaller = shrink(path)
                if smaller:
                    path, before, after = smaller
                    note += f", resized, {before // 1024}KB -> {after // 1024}KB"
                book["cover"] = f"assets/covers/{path.name}"
                label = f"{book['author']} — {bare_title(book['title'])}"
                if label in missing:
                    missing.remove(label)
                got += 1
                print(f"    {bare_title(book['title'])[:34]:34} {why} -> {note}")
                break

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
