# 100 Books on Korea

A browsable shelf of 100 books on Korea, built as a static page for
[andysaulim.com](https://andysaulim.com).

## Status

Data layer complete. Layout follows the structure of `minchi.co/books/` — pale
ground, name and nav at top left, filter columns as plain text lists under hairline
rules, then a dense wall of covers with a hover detail card.

**58 of 100 books have a real cover image.** Those are resolved from an ISBN found
in the book's own publisher link. The other 42 link by slug or product id, so no
ISBN can be extracted and they fall back to a generated typographic cover. See
*Covers* below.

## What's here

```
index.html          the page
assets/styles.css   styling
assets/app.js       search, theme filters, sorting, grid/list views
books.js            the book data the page reads (edit this to change the list)
books.json          the same data, for anything else that wants to consume it
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

Cover images come from Open Library, addressed by ISBN:

```
https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false
```

`default=false` makes the CDN return 404 rather than a blank placeholder, so the
page can tell a miss from a hit. Any book with no `cover`, or whose image 404s,
falls back to a generated typographic cover tinted by theme — handled by the
`error` listener in `tileNode()` in `assets/app.js`.

To use your own artwork instead, set `cover` on a book to any URL or local path.
The 42 books without an ISBN are the ones worth doing first.

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
  "source": "global.oup.com"
}
```

## Running it

It's a static page with no build step. Open `index.html`, or serve the folder:

```sh
npx http-server -p 8099 .
```

Fonts load from Google Fonts; without a network connection the page falls back to
Georgia and the system sans, which is fine.

## Features

- Search across title, author, publisher, and theme (accent- and quote-insensitive)
- Filter by theme or publisher; click an active option again to clear it
- Sort by author, title, theme, or publisher
- Hover (or tap, on touch) a cover for a detail card with a link to the publisher
- Filter state is kept in the URL, so any view can be linked to
- Responsive to phone widths, keyboard accessible
