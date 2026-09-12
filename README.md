# 100 Books on Korea

A browsable shelf of the hundred books on Korea Andy Lim recommends, built as a
static page for a subpath of [andysaulim.com](https://andysaulim.com).

## Status

Complete. A centred display title over a full-width wall of covers, with
filtering in four plain-text columns beneath it — the `minchi.co/books`
structure. A book opens as a draggable floating window carrying its cover, a
short description and a link to the publisher, so several can sit open at once.

Type is Fraunces for the display title and Source Serif 4 for everything else.
The palette is the house green with the Korean flag's red as the accent,
deepened from `#cd2e3a` to `#b32530` so it clears WCAG AA on the green ground —
every text style on the page is checked against its painted background.

**All 95 books carry an ISBN and a one-paragraph description.** The list is being rebuilt toward 100; see *Filling the last slots* below. Covers
resolve through a chain of sources rather than a single one, because Open Library
alone leaves a lot of gaps. See *Covers* below.

## What's here

```
index.html          the page
assets/styles.css   styling
assets/app.js       search, filters, sorting, floating windows
assets/og.png       the 1200x630 social card
books.js            the book data the page reads (edit this to change the list)
books.json          the same data, for anything else that wants to consume it
build.py            bundles the above into one portable file
make_og.py          redraws assets/og.png
dist/books.html     that bundle — one file, no relative paths
```

## The data

Sourced from the "100 Books on Korea" Google Sheet (author, title, publisher link).

Two fields are derived rather than taken from the sheet:

- **`publisher`** — mapped from the link's domain. 25 presses across all 95 books.
- **`category`** — a topical theme, assigned by hand so the list can be filtered.
  These are rough shelving calls, not the publishers' own categories. Change any
  of them by editing `books.js`.

One correction was made to the source data: `Brad Glossermana nd Scott A. Snyder`
→ `Brad Glosserman and Scott A. Snyder`.

### Themes

| Theme | Books |
|---|---|
| Fiction & Memoir | 12 |
| Escape & Human Rights | 12 |
| Korean War | 11 |
| Alliances & Regional Order | 10 |
| North Korea: Regime & Leadership | 10 |
| History & Empire | 10 |
| North Korea: Society & Economy | 9 |
| South Korea: Politics & Democracy | 7 |
| Diaspora & Migration | 5 |
| North Korea: Nuclear & Security | 5 |
| Culture & the Korean Wave | 5 |
| South Korea: Society & Economy | 4 |

## Covers

Open Library holds art for a good share of these ISBNs but nothing like all of
them, so `loadCover()` in `assets/app.js` walks a chain and takes the first source
that returns a real image at a usable size:

1. the book's `cover` field — an Open Library URL by ISBN-13, or a local path
   such as `assets/covers/nothing-to-envy.jpg` for your own artwork
2. Google Books by ISBN-13, then by ISBN-10, at the large rendering
3. the same two at Google's default small rendering
4. Open Library's search API, by title and first author, then by the title with
   its subtitle stripped
5. Google's volumes API, which matches the work rather than one exact ISBN and so
   holds art for editions the ISBN endpoint has nothing for
6. a generated typographic cover, tinted by theme

Two guards keep this honest. A source with no art sometimes answers `200` with a
1x1 or a "no cover" placeholder rather than a `404`, so a candidate is judged by
its pixels, not its status code — and because a book is drawn 188px wide, the
large renderings must come back at least 200px before the chain will settle for a
small one. And a search result is only accepted when one title is a prefix of the
other, so a near-miss cannot put a different book's jacket on the shelf. A hit on
step 1 means nothing later is ever requested; the searches in steps 4 and 5 give
up after six seconds, so a host that hangs rather than refusing still falls
through to the stand-in.

To see which books ended up with no art at all, open the console on the live page
and run:

```js
missingCovers()
```

`tools/cover-check.html` does the same across the whole list in a real browser and
reports which source each cover came from, and why the misses missed.

## Filling the last slots

A handful of books have no art at any source. Each one's `cover` points at a file
in `assets/covers/`, which is empty until you put the jacket there —
`assets/covers/README.md` lists the exact filenames. A path with no file behind it
simply 404s and the chain carries on, so nothing breaks in the meantime.
`python3 build.py` inlines whatever is present as a data URI, so local artwork
travels with `dist/books.html`.

## Editing the list

`books.js` is a plain array. Add, remove, or edit an entry and reload — the page
recounts and rebuilds the theme filters on its own. Each entry:

```js
{
  "id": "the-real-north-korea",
  "author": "Andrei Lankov",
  "title": "The Real North Korea",
  "url": "https://global.oup.com/academic/product/...",
  "category": "North Korea: Regime & Leadership",
  "publisher": "Oxford University Press",
  "source": "global.oup.com",
  "isbn": "9780199390038",
  "cover": "https://covers.openlibrary.org/b/isbn/9780199390038-L.jpg?default=false",
  "blurb": "Lankov, who studied in Pyongyang, argues the regime is neither …"
}
```

`blurb` is the paragraph shown in a book's floating window. `id` must be unique —
it keys the open windows, so two books sharing one would open and close together.

## Running it

Open `index.html`, or serve the folder:

```sh
npx http-server -p 8099 .
```

Fonts load from Google Fonts; without a network connection the page falls back to
Georgia and the system sans, which is fine.

## Dropping it into another site

`dist/books.html` is the whole shelf as a single file — CSS, behaviour and data
all inlined, nothing loaded by relative path. Drop it at any subpath and it works;
only the web font, the social card and the cover images come over the network.
Rebuild it after editing the page or the data:

```sh
python3 build.py
```

Every link in the page is relative, so it needs no telling where it lives. The one
exception is the canonical and Open Graph URLs, which have to be absolute for a
link preview to resolve. Pass the URL the page will be served from:

```sh
python3 build.py --base https://andysaulim.com/books/
```

The site nav points at `/` and `/writings/`; change those in `index.html` if the
surrounding site uses different paths.

## The social card

`assets/og.png` is the 1200x630 image link previews show. Redraw it with:

```sh
python3 make_og.py
```

It shells out to headless Chrome's own `--screenshot`, so there is nothing to
install. The card is set in Source Serif 4 pulled from Google Fonts at render
time — without network access the shot still succeeds but falls back to a system
serif, so look at the result.

## Features

- Search across title, author, publisher, and theme (accent- and quote-insensitive)
- Filter by theme or publisher; click an active option again to clear it
- Sort by author, title, theme, or publisher
- Open a cover for a floating window with a one-paragraph description and a link
  to the publisher — windows are draggable and several can stay open at once
- Reset appears in the toolbar once anything is filtered
- Back-to-top button past the first screen
- Filter state is kept in the URL, so any view can be linked to
- The toolbar sticks to the top of the viewport and reflows down to phone widths;
  keyboard accessible throughout
