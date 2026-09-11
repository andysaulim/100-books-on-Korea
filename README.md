# 100 Books on Korea

A browsable shelf of 100 books on Korea, built as a static page for
[andysaulim.com](https://andysaulim.com).

## Status

The **data layer is complete**. The **visual design is a first pass, not final** —
it was meant to match the layout of `minchi.co/books/`, but that site is blocked by
the network egress policy in the environment this was built in, so the current
design is an original one. It should be restyled once the reference is available.

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

There are no cover images. Each book gets a generated typographic cover tinted by
its theme. Swapping in real cover art means adding an `image` field to `books.js`
and rendering it in `bookNode()` in `assets/app.js`.

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
- Filter by theme; click the active theme again to clear it
- Sort by author, title, theme, or publisher
- Covers and list views
- Filter state is kept in the URL, so any view can be linked to
- Light and dark, responsive to phone widths, keyboard accessible (`/` focuses search)
