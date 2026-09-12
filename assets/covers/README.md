# Your own cover artwork

A book is pinned to a file here by pointing its `cover` field at the path,
for example `"cover": "assets/covers/nothing-to-envy.jpg"`. The page tries
that file first; if it is not there the request simply 404s and the usual
chain takes over (Open Library by ISBN, then Google Books, then a title
search, then the typographic stand-in), so a missing file is never an error.

`python3 build.py` inlines whatever is here as a data URI, so the covers
travel with `dist/books.html` when it is dropped into another site.

Use JPEG, PNG, WebP, GIF or AVIF. Aim for at least 400px wide — the books
are drawn 188px wide and sharper on a high-density screen.

## Slots the page is currently looking for

These are the books no cover source has usable art for. Save the jacket
image under the exact name and it appears:

| File | Book |
|---|---|
| `the-real-north-korea.jpg` | Andrei Lankov, *The Real North Korea* |
| `activists-alliances.jpg` | Andrew Yeo, *Activists, Alliances, and Anti-U.S. Base Protests* |
| `the-cleanest-race.jpg` | B.R. Myers, *The Cleanest Race* |
| `nothing-to-envy.jpg` | Barbara Demick, *Nothing to Envy* |
| `the-lazarus-heist.jpg` | Geoff White, *The Lazarus Heist* |
| `marching-through-suffering.jpg` | Sandra Fahy, *Marching Through Suffering* |

The extension has to match the filename in `books.json`; rename the field if
you save a `.png` or `.webp` instead.
