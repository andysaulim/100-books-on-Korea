# Top 100 Books on Korea

A browsable shelf of the hundred books on Korea Andy Lim recommends, built as a
static page for a subpath of [andysaulim.com](https://andysaulim.com).

## Status

Complete. The shelf gets the full page width and the covers are sized to be read
at a glance; filtering lives in a sticky bar above the grid rather than a side
rail, so nothing competes with the covers for room. A book opens as a draggable
floating window carrying a short description, `minchi.co/books` style, so several
can sit open at once. Set in Source Serif 4, the same face that page uses.

The palette is this site's own — a warm off-white ground so the covers carry the
colour, hairline rules in the same warm grey, and one restrained rust accent.

**All 100 books carry an ISBN, a cover, and a one-paragraph description.** Covers
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

- **`publisher`** — mapped from the link's domain. 24 presses across all 100 books.
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
that returns a real image:

1. the book's `cover` field — Open Library by ISBN-13, and the hook for your own
   artwork (see below)
2. Google Books, by ISBN-13
3. Google Books, by ISBN-10 — some editions are indexed only under the 10-digit
   form, which is derived from the 13 for `978` prefixes
4. a generated typographic cover, tinted by theme

A source with no art for an ISBN sometimes answers `200` with a 1x1 or a "no
cover" placeholder rather than a `404`, so the loader also rejects anything under
50px square rather than trusting the status code. A hit on step 1 means steps 2
and 3 are never requested.

To see which books ended up with no art at all, open the console on the live page
and run:

```js
missingCovers()
```

To supply your own artwork for any of them, set `cover` on that book to any URL
or local path; it is tried first and does not have to point at Open Library.

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
