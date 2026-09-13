# Installing the books shelf on andysaulim.com

Everything lives in `github.com/andysaulim/100-books-on-Korea`, branch
`claude/tender-carson-ljopjj` (pull request #1). Nothing here needs a build
step at serve time, a framework, or any JavaScript dependency — it is plain
HTML, one stylesheet and one script, and it works at whatever path it is
served from.

## Which of the two to install

**A folder (recommended).** Copy these to `andysaulim.com/books/`:

```
index.html          4.7 KB
books.js             73 KB     the 100 books
assets/styles.css    20 KB
assets/app.js        40 KB
assets/og.png        50 KB     the link-preview card
assets/covers/      4.7 MB     99 jackets, one file each
```

About 140 KB before any cover loads, and the covers arrive as separate files
the browser caches and loads only as they scroll into view. This is the right
choice for a page on a real site.

**One file.** `dist/books.html` is 6.4 MB with every cover inlined as a data
URI. Rename it to `index.html` and it works alone, with no `assets/` folder.
Only worth it if dropping a single file somewhere is easier than copying a
tree — the whole 6.4 MB is downloaded before anything appears.

## Before copying, set the canonical URL

Every link in the page is relative, so the shelf works at any path without
being told where it lives. The exception is the canonical and Open Graph
URLs, which have to be absolute for a link preview to resolve:

```
python3 build.py --base https://andysaulim.com/books/
```

That rewrites them and regenerates `dist/books.html`. If the shelf goes
somewhere other than `/books/`, pass that path instead.

## The one thing that needs a person

The page currently carries an **invented** site header:

```html
<header class="site-head">
  <a class="brand" href="/">Andy Lim</a>
  <nav class="site-nav" aria-label="Site">
    <a href="/">About</a>
    <a href="/writings/">Writings</a>
    <a href="./" class="active" aria-current="page">Books</a>
  </nav>
</header>
```

It was written blind: the sandbox this was built in cannot reach
andysaulim.com, so nobody has seen the real site. **Replace that block with
the site's actual header markup**, and check three things against the rest of
the site:

- the nav links and their labels
- the typeface — the shelf loads Fraunces for display and the system UI stack
  for everything else
- the palette — defined as CSS custom properties at the top of
  `assets/styles.css` (`--ink`, `--paper`, `--card`, `--accent`, `--muted`).
  The accent is `#b32530`, chosen for 5.55:1 contrast on the page ground; if
  you swap it for the site's own, keep it at 4.5:1 or better against `--paper`.

## What not to change

- **`books.js` is generated from `books.json`.** Edit the JSON and re-run
  `python3 build.py`, which fails the build if the two disagree. Editing only
  one of them ships a stale shelf that every test still passes.
- **The covers are downloaded files, not hotlinks.** Do not point the page at
  Open Library or Google at load time: Open Library allows 100 cover requests
  per IP per 5 minutes and 403s past that, and Google returns a real "image
  not available" picture rather than a 404, which a browser cannot tell from a
  cover. Both mistakes were made and undone already.
- **`assets/covers/` filenames come from `fetch_covers.py`.** Renaming one
  breaks the book that points at it; `build.py` will catch two books sharing a
  file, but not a rename.

## Verifying it after it is up

- The shelf lists 100 books and says so under the title.
- Type in the search box: the shelf re-shelves and the covers stay visible.
  (A queue bug used to leave every book blank after the first filter.)
- Click a book: a draggable window opens with the blurb and a link to the
  publisher. Escape closes it; focus returns to the book.
- At 390px wide there is no horizontal scrolling, and the theme and publisher
  lists become swipeable rows.
- The browser console is clean.
