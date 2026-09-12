/* ---------------------------------------------------------------
   100 Books on Korea — shelf behaviour
   Data comes from books.js (window.BOOKS).

   Filtering lives in four plain-text columns above the shelf, so the
   grid keeps the full page width. A book opens as a draggable floating
   window, minchi.co/books style, so several can sit open at once.
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var books = Array.isArray(window.BOOKS) ? window.BOOKS.slice() : [];

  /* Tint for the typographic stand-in shown when no source has art. */
  var HUES = {
    'Korean War':                        '#7a3a33',
    'History & Empire':                  '#7d5a36',
    'North Korea: Regime & Leadership':  '#35405c',
    'North Korea: Nuclear & Security':   '#434c59',
    'North Korea: Society & Economy':    '#3b5d5b',
    'Escape & Human Rights':             '#584163',
    'South Korea: Politics & Democracy': '#2b5a66',
    'South Korea: Society & Economy':    '#37604c',
    'Alliances & Regional Order':        '#2f4a6d',
    'Culture & the Korean Wave':         '#8b4c63',
    'Fiction & Memoir':                  '#846731',
    'Diaspora & Migration':              '#4e6542'
  };
  var FALLBACK_HUE = '#4a5266';

  var SORTS = [
    { id: 'author',    label: 'Author A–Z' },
    { id: 'title',     label: 'Title A–Z' },
    { id: 'category',  label: 'Theme' },
    { id: 'publisher', label: 'Publisher' }
  ];

  var ABOUT = [
    'A hundred recommendations: the war and its long aftermath, two states ' +
    'built from the same country, the alliance, the culture, and the people.',
    'Ranked by nothing — it is a shelf, not a league table. Themes are my own ' +
    'shelving, not the publishers’ categories.',
    'Open any cover for a short description and a link to its publisher.'
  ];

  var $ = function (sel) { return document.querySelector(sel); };

  var els = {
    shelf:     $('#shelf'),
    empty:     $('#empty'),
    count:     $('#shelf-count'),
    search:    $('#search'),
    clear:     $('[data-clear]'),
    filters:   $('.filters'),
    reset:     $('#filters-reset'),
    windows:   $('#book-windows'),
    scrollTop: $('#scroll-top')
  };

  var state = { q: '', category: 'All', publisher: 'All', sort: 'author' };

  var COMPARE = new Intl.Collator('en', { sensitivity: 'base' }).compare;
  var narrow = window.matchMedia('(max-width: 680px)');

  /* --- helpers ------------------------------------------------- */

  function hue(cat) { return HUES[cat] || FALLBACK_HUE; }

  /* Drop leading articles so "The Vegetarian" files under V. */
  function titleKey(t) { return t.replace(/^(the|a|an)\s+/i, '').toLowerCase(); }

  /* Fold accents, curly quotes and dashes so "Choson" finds "Chosŏn"
     and a typed hyphen matches an en dash. */
  function norm(s) {
    return (s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―]/g, '-')
      .toLowerCase();
  }

  function haystack(b) {
    if (!b._hay) b._hay = norm([b.title, b.author, b.publisher, b.category].join('  '));
    return b._hay;
  }

  function filtered() {
    return !!state.q || state.category !== 'All' || state.publisher !== 'All';
  }

  /* --- covers ---------------------------------------------------- */

  /* Google indexes some editions under the 10-digit ISBN only, so it is
     worth deriving. Only 978-prefixed ISBN-13s have an ISBN-10 form. */
  function isbn10(i13) {
    if (!/^978\d{10}$/.test(i13)) return null;
    var core = i13.slice(3, 12);
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += (10 - i) * +core[i];
    var check = (11 - (sum % 11)) % 11;
    return core + (check === 10 ? 'X' : String(check));
  }

  /* Books are drawn 188px wide, so Google's default zoom=1 rendering —
     about 128px — was being upscaled. Each ISBN is now asked for the
     large rendering first, and the minimum width a candidate must meet
     stays high while a better source is still in play, dropping to the
     bare size guard once only the small renderings are left. */
  var BIG = 200, ANY = 50;

  function googleCover(isbn, zoom) {
    return 'https://books.google.com/books/content?vid=ISBN' + isbn +
           '&printsec=frontcover&img=1&zoom=' + zoom;
  }

  function googleIdCover(id, zoom) {
    return 'https://books.google.com/books/content?id=' + encodeURIComponent(id) +
           '&printsec=frontcover&img=1&zoom=' + zoom;
  }

  /* Open Library holds art for a good share of these ISBNs but nothing
     like all of them, so a miss falls through to Google Books before
     the searches and then the typographic stand-in. `cover` stays the
     first candidate, which is also the hook for pointing a book at your
     own artwork. */
  function coverSources(b) {
    var out = [];
    var local = b.cover && !/^https?:/i.test(b.cover);

    /* Your own artwork always wins. */
    if (local) out.push({ url: b.cover, min: ANY });

    /* Google before Open Library, which is a change of order that matters.
       Open Library's cover API allows 100 requests per IP per 5 minutes
       when looking up BY IDENTIFIER, and answers 403 past that. This shelf
       is 101 books, so asking Open Library by ISBN first meant a single
       page load sat on the limit and a reload went straight through it —
       which is why covers were vanishing in batches rather than one by
       one. Google carries no comparable limit, so it goes first and Open
       Library now only sees the handful Google has nothing for. */
    if (b.isbn) {
      var ids = [b.isbn];
      var i10 = isbn10(b.isbn);
      if (i10) ids.push(i10);
      ids.forEach(function (id) { out.push({ url: googleCover(id, 0), min: BIG }); });
      ids.forEach(function (id) { out.push({ url: googleCover(id, 1), min: ANY }); });
    }

    if (b.cover && !local) out.push({ url: b.cover, min: ANY });
    return out;
  }

  /* Even below a rate limit, a hundred simultaneous image requests is a
     burst any host may shed. Covers are fetched a few at a time instead;
     the shelf still fills top-down because that is the order they queue in. */
  var MAX_IN_FLIGHT = 6;
  var inFlight = 0;
  var waiting = [];

  function queueLoad(run) {
    waiting.push(run);
    pump();
  }

  function pump() {
    while (inFlight < MAX_IN_FLIGHT && waiting.length) {
      inFlight++;
      waiting.shift()(function done() {
        inFlight--;
        pump();
      });
    }
  }

  /* "Stephan Haggard and Marcus Noland" -> "Stephan Haggard". */
  function firstAuthor(a) {
    return (a || '').split(/\s+(?:and|&|with)\s+|,\s*/)[0].trim();
  }

  /* "The Cleanest Race: How North Koreans..." -> "The Cleanest Race".
     Catalogues often hold the work under its bare title. */
  function titleOnly(t) {
    return (t || '').split(/\s*[:\u2014\u2013]\s+/)[0].trim();
  }

  /* One title has to be a prefix of the other, which tolerates a missing
     subtitle but not a different work. Without this a near-miss in a
     search result would put another book's art on the shelf. */
  function titlesAgree(want, got) {
    if (!want || !got) return false;
    want = norm(want); got = norm(got);
    return want.indexOf(got) === 0 || got.indexOf(want) === 0;
  }

  /* A search host that hangs rather than refusing would otherwise leave
     the book with neither art nor its stand-in, so give up after a few
     seconds and let the chain fall through. */
  var SEARCH_TIMEOUT = 6000;

  function getJSON(url) {
    if (!window.fetch) return Promise.resolve(null);
    return Promise.race([
      fetch(url).then(function (r) { return r.ok ? r.json() : null; }),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, SEARCH_TIMEOUT); })
    ]).catch(function () { return null; });
  }

  /* Open Library carries plenty of works it holds no ISBN-level cover
     for, so ask its search API for the work itself. */
  function olSearch(b, title) {
    var url = 'https://openlibrary.org/search.json?limit=5&fields=title,cover_i' +
              '&title=' + encodeURIComponent(title) +
              '&author=' + encodeURIComponent(firstAuthor(b.author));
    return getJSON(url).then(function (j) {
      var docs = (j && j.docs) || [];
      for (var i = 0; i < docs.length; i++) {
        if (docs[i].cover_i && titlesAgree(b.title, docs[i].title)) {
          return [{ url: 'https://covers.openlibrary.org/b/id/' + docs[i].cover_i + '-L.jpg', min: ANY }];
        }
      }
      return [];
    });
  }

  /* The last resort, and the one that actually rescues the handful the
     rest miss: Google's volumes API matches the work rather than one
     exact ISBN, so it holds art for editions the ISBN endpoint has
     nothing for. The volume id it returns is then rendered large. */
  function gbSearch(b) {
    var q = 'intitle:"' + titleOnly(b.title) + '" inauthor:"' + firstAuthor(b.author) + '"';
    var url = 'https://www.googleapis.com/books/v1/volumes?maxResults=5&country=US&q=' +
              encodeURIComponent(q);
    return getJSON(url).then(function (j) {
      var items = (j && j.items) || [];
      for (var i = 0; i < items.length; i++) {
        var v = items[i].volumeInfo || {};
        if (items[i].id && titlesAgree(b.title, v.title)) {
          return [{ url: googleIdCover(items[i].id, 0), min: BIG },
                  { url: googleIdCover(items[i].id, 1), min: ANY }];
        }
      }
      return [];
    });
  }

  /* Tried in order, and only by the books every ISBN attempt missed. */
  function searchCovers(b) {
    var bare = titleOnly(b.title);
    var steps = [function () { return olSearch(b, b.title); }];
    if (bare && bare !== b.title) steps.push(function () { return olSearch(b, bare); });
    steps.push(function () { return gbSearch(b); });

    var i = 0;
    function step() {
      if (i >= steps.length) return Promise.resolve([]);
      return steps[i++]().then(function (found) {
        return found && found.length ? found : step();
      });
    }
    return step();
  }

  function loadCover(face, b) {
    var srcs = coverSources(b);
    if (!srcs.length) { face.appendChild(fallbackNode(b)); b._noCover = true; return; }

    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    /* Google's cover endpoint can refuse on referrer. */
    img.referrerPolicy = 'no-referrer';

    var i = 0;
    var searched = false;
    var cur = null;
    var release = null;

    function settle() {
      if (release) { var r = release; release = null; r(); }
    }

    function giveUp() {
      img.remove();
      face.appendChild(fallbackNode(b));
      b._noCover = true;
      settle();
    }

    function next() {
      if (i < srcs.length) { cur = srcs[i++]; img.src = cur.url; return; }
      if (searched) { giveUp(); return; }
      searched = true;
      searchCovers(b).then(function (found) {
        if (found && found.length) { srcs = srcs.concat(found); next(); }
        else giveUp();
      });
    }

    img.addEventListener('error', next);
    img.addEventListener('load', function () {
      /* A source with no art for an ISBN may answer 200 with a 1x1 or a
         "no cover" placeholder rather than 404, so judge it by size. The
         bar starts at the width a 188px book deserves and drops to the
         bare guard once only the small renderings are left. */
      if (img.naturalWidth < cur.min || img.naturalHeight < ANY) next();
      else { b._noCover = false; settle(); }
    });

    face.appendChild(img);

    /* One slot is held from the first attempt until this book settles,
       either with art or with its stand-in, so the queue measures books
       in flight rather than requests. */
    queueLoad(function (done) {
      release = done;
      next();
    });
  }

  /* Which books ended up with no art, for filling gaps by hand. */
  window.missingCovers = function () {
    return books.filter(function (b) { return b._noCover; })
      .map(function (b) { return b.author + ' — ' + b.title + ' (' + b.isbn + ')'; });
  };

  /* --- filter & sort ------------------------------------------- */

  function visible() {
    var terms = norm(state.q).split(/\s+/).filter(Boolean);

    var out = books.filter(function (b) {
      if (state.category !== 'All' && b.category !== state.category) return false;
      if (state.publisher !== 'All' && b.publisher !== state.publisher) return false;
      if (!terms.length) return true;
      var hay = haystack(b);
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });

    var LAST = '￿';
    var by = {
      author: function (a, b) {
        return COMPARE(a.author, b.author) || COMPARE(titleKey(a.title), titleKey(b.title));
      },
      title: function (a, b) {
        return COMPARE(titleKey(a.title), titleKey(b.title));
      },
      category: function (a, b) {
        return COMPARE(a.category, b.category) || COMPARE(a.author, b.author);
      },
      publisher: function (a, b) {
        return COMPARE(a.publisher || LAST, b.publisher || LAST) || COMPARE(a.author, b.author);
      }
    };

    return out.sort(by[state.sort] || by.author);
  }

  /* --- tiles ---------------------------------------------------- */

  function fallbackNode(b) {
    var box = document.createElement('span');
    box.className = 'fallback';

    var t = document.createElement('span');
    t.className = 'fb-title';
    t.textContent = b.title;

    var a = document.createElement('span');
    a.className = 'fb-author';
    a.textContent = b.author;

    box.appendChild(t);
    box.appendChild(a);
    return box;
  }

  /* The 3D book: back cover, three pages, front cover, spine, light.
     `flat` drops the layers that stick out, for the detail window. */
  function bookScene(b, flat) {
    var scene = document.createElement('span');
    scene.className = 'book-scene';
    scene.setAttribute('aria-hidden', 'true');

    var book = document.createElement('span');
    book.className = 'book-3d';

    if (!flat) {
      var back = document.createElement('span');
      back.className = 'b-back-cover';
      book.appendChild(back);

      var inside = document.createElement('span');
      inside.className = 'b-inside';
      for (var i = 0; i < 3; i++) {
        var page = document.createElement('span');
        page.className = 'b-page';
        inside.appendChild(page);
      }
      book.appendChild(inside);
    }

    var face = document.createElement('span');
    face.className = 'b-image';
    face.style.setProperty('--fallback-bg', hue(b.category));
    book.appendChild(face);

    if (!flat) {
      var effect = document.createElement('span');
      effect.className = 'b-effect';
      book.appendChild(effect);

      var light = document.createElement('span');
      light.className = 'b-light';
      book.appendChild(light);
    }

    scene.appendChild(book);
    return { scene: scene, face: face };
  }

  /* The shelf used to snap into place fully formed, and a filter change
     was a hard cut. Books now rise into view a beat apart as you reach
     them, which is also what makes a filter feel like a re-shelving
     rather than a page swap. Anyone who has asked for less motion gets
     the old instant behaviour. */
  var STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var shelfObserver = (!STILL && window.IntersectionObserver)
    ? new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          obs.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' })
    : null;

  /* Reveal has to be decided after the books are in the document, because
     what matters is where they landed. Anything already within reach rises
     immediately — a filter click must show its answer without being
     scrolled to, even when the shelf starts below the fold — and only the
     books genuinely further down wait for the observer. */
  function primeReveal() {
    if (!shelfObserver) return;
    var reach = window.innerHeight * 1.5;
    var lis = els.shelf.children;
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i];
      li.style.setProperty('--enter-delay', (i % 6) * 55 + 'ms');
      li.classList.add('is-out');
      if (li.getBoundingClientRect().top < reach) {
        li.classList.add('is-in');
      } else {
        shelfObserver.observe(li);
      }
    }
  }

  function tileNode(b) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'book-cell';
    /* The cover art carries no text for a screen reader, so the
       control names the book itself. */
    btn.setAttribute('aria-label', b.title + ' by ' + b.author);
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.dataset.id = b.id;
    btn._book = b;

    var built = bookScene(b, false);
    btn.appendChild(built.scene);
    loadCover(built.face, b);

    var li = document.createElement('li');
    li.appendChild(btn);
    return li;
  }

  /* --- ambient tint ---------------------------------------------
     Hovering a book washes the page toward that cover's average
     colour. Sampling needs CORS; where a host refuses it the tint is
     simply skipped, which is why the display image is never the one
     being read. */

  var PAPER = [233, 239, 226];
  var tintCache = {};
  var tintToken = 0;

  function mixToward(c, t) {
    return [
      Math.round(c[0] * (1 - t) + PAPER[0] * t),
      Math.round(c[1] * (1 - t) + PAPER[1] * t),
      Math.round(c[2] * (1 - t) + PAPER[2] * t)
    ];
  }

  function sampleCover(src) {
    if (tintCache[src] !== undefined) return Promise.resolve(tintCache[src]);
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = function () {
        try {
          var size = 24;
          var c = document.createElement('canvas');
          c.width = c.height = size;
          var ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          var d = ctx.getImageData(0, 0, size, size).data;
          var r = 0, g = 0, bl = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 140) continue;
            var pr = d[i], pg = d[i + 1], pb = d[i + 2];
            /* Skip near-black and near-white so the tint comes from the
               artwork rather than its ink or its margins. */
            if (Math.max(pr, pg, pb) < 18) continue;
            if (Math.min(pr, pg, pb) > 238) continue;
            r += pr; g += pg; bl += pb; n++;
          }
          if (!n) { tintCache[src] = null; resolve(null); return; }
          var avg = [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
          /* 0.78 still swung the whole page off its green on a saturated
             jacket. 0.88 reads as a warmth in the paper rather than a
             change of background. */
          var soft = mixToward(avg, 0.88);
          var out = 'rgb(' + soft[0] + ', ' + soft[1] + ', ' + soft[2] + ')';
          tintCache[src] = out;
          resolve(out);
        } catch (err) {
          tintCache[src] = null;   /* tainted canvas: host sent no CORS */
          resolve(null);
        }
      };
      img.onerror = function () { tintCache[src] = null; resolve(null); };
      img.src = src;
    });
  }

  function setAmbient(src) {
    var token = ++tintToken;
    if (!src) { document.documentElement.style.removeProperty('--bg'); return; }
    sampleCover(src).then(function (colour) {
      if (token !== tintToken || !colour) return;
      document.documentElement.style.setProperty('--bg', colour);
    });
  }

  function clearAmbient() {
    tintToken++;
    document.documentElement.style.removeProperty('--bg');
  }

  /* The capped theme and publisher lists clip mid-row, which reads as a
     rendering fault rather than "there is more". Mark them so the CSS can
     fade the cut edge, and unmark once you have scrolled to the end. */
  function markScrollers() {
    els.filters.querySelectorAll('.scroller').forEach(function (el) {
      /* Capped vertically on a wide screen, swiped horizontally on a
         phone, so measure whichever axis actually overflows. */
      var more = el.scrollWidth > el.clientWidth + 2
        ? el.scrollWidth - el.clientWidth - el.scrollLeft > 2
        : el.scrollHeight - el.clientHeight - el.scrollTop > 2;
      el.classList.toggle('has-more', more);
    });
  }

  els.filters.querySelectorAll('.scroller').forEach(function (el) {
    el.addEventListener('scroll', markScrollers, { passive: true });
  });
  window.addEventListener('resize', markScrollers);

  els.shelf.addEventListener('pointerover', function (e) {
    var cell = e.target.closest('.book-cell');
    if (!cell || !cell._book) return;
    var img = cell.querySelector('img');
    if (img && img.currentSrc) setAmbient(img.currentSrc);
  });
  els.shelf.addEventListener('pointerleave', clearAmbient);

  /* --- floating windows ----------------------------------------- */

  var openWins = {};      /* key -> element */
  var winZ = 1;
  var cascade = 0;

  function markTiles() {
    els.shelf.querySelectorAll('.book-cell').forEach(function (t) {
      var on = Object.prototype.hasOwnProperty.call(openWins, 'book:' + t.dataset.id);
      t.classList.toggle('is-open', on);
      t.setAttribute('aria-expanded', String(on));
    });
  }

  function raise(win) { win.style.zIndex = ++winZ; }

  function closeWin(key) {
    var win = openWins[key];
    if (!win) return;
    var opener = win._opener;
    var hadFocus = win.contains(document.activeElement);
    delete openWins[key];
    win.remove();
    markTiles();
    /* Send focus back where it came from rather than to the document. */
    if (hadFocus && opener && document.contains(opener)) opener.focus();
  }

  function place(win, anchor) {
    /* Narrow screens pin windows to the bottom centre in CSS. */
    if (narrow.matches) return;

    var w = win.offsetWidth;
    var h = win.offsetHeight;
    var pad = 12;
    var left, top;

    if (anchor) {
      var r = anchor.getBoundingClientRect();
      left = r.right + pad;
      if (left + w > window.innerWidth - pad) left = r.left - w - pad;
      top = r.top + (r.height - h) / 2;
    } else {
      left = (window.innerWidth - w) / 2;
      top = (window.innerHeight - h) / 2;
    }

    /* Offset each additional window so they do not stack exactly. */
    left += cascade * 20;
    top += cascade * 20;
    cascade = (cascade + 1) % 6;

    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));

    win.style.left = Math.round(left) + 'px';
    win.style.top = Math.round(top) + 'px';
  }

  var ICON = {
    prev:  '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
    next:  '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
    close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>'
  };

  function iconBtn(name, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'winbtn';
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
    return b;
  }

  function makeWindow(key, kind, opts) {
    if (openWins[key]) { raise(openWins[key]); return openWins[key]; }

    var win = document.createElement('div');
    win.className = 'bookwin' + (opts.about ? ' is-about' : '');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', kind);

    var bar = document.createElement('div');
    bar.className = 'bookwin-bar';

    var nav = document.createElement('div');
    nav.className = 'bookwin-nav';
    if (opts.step) {
      var prev = iconBtn('prev', 'Previous book');
      var next = iconBtn('next', 'Next book');
      prev.addEventListener('click', function (e) { e.stopPropagation(); opts.step(win, -1); });
      next.addEventListener('click', function (e) { e.stopPropagation(); opts.step(win, 1); });
      nav.appendChild(prev);
      nav.appendChild(next);
    }

    var close = iconBtn('close', 'Close');
    close.addEventListener('click', function (e) { e.stopPropagation(); closeWin(win._key); });

    bar.appendChild(nav);
    bar.appendChild(close);

    var body = document.createElement('div');
    body.className = 'bookwin-body';

    win.appendChild(bar);
    win.appendChild(body);
    els.windows.appendChild(win);

    win._key = key;
    win._opener = opts.anchor;
    openWins[key] = win;
    opts.build(body, win);

    raise(win);
    place(win, opts.anchor);
    drag(win);

    win.addEventListener('pointerdown', function () { raise(win); });

    /* The window is the last thing in the DOM, so leaving focus on the
       cover would put a hundred covers between the two. Move into it. */
    win.tabIndex = -1;
    win.focus({ preventScroll: true });
    return win;
  }

  /* The whole window is a drag surface. The bar is mostly buttons now,
     so limiting dragging to it would leave only a sliver to grab; the
     controls and the prose keep their own behaviour instead. */
  function drag(win) {
    var dx = 0, dy = 0, id = null;

    win.addEventListener('pointerdown', function (e) {
      if (narrow.matches) return;
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, .bookwin-text')) return;
      id = e.pointerId;
      var r = win.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      win.setPointerCapture(id);
      e.preventDefault();
    });

    win.addEventListener('pointermove', function (e) {
      if (id === null || e.pointerId !== id) return;
      var pad = 8;
      var left = Math.max(pad, Math.min(e.clientX - dx, window.innerWidth - win.offsetWidth - pad));
      var top = Math.max(pad, Math.min(e.clientY - dy, window.innerHeight - win.offsetHeight - pad));
      win.style.left = Math.round(left) + 'px';
      win.style.top = Math.round(top) + 'px';
    });

    function end(e) {
      if (id === null || e.pointerId !== id) return;
      if (win.hasPointerCapture(id)) win.releasePointerCapture(id);
      id = null;
    }
    win.addEventListener('pointerup', end);
    win.addEventListener('pointercancel', end);
  }

  function para(cls, text) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }

  function fillBook(body, b, anchor) {
    body.replaceChildren();

    var coverWrap = document.createElement('div');
    coverWrap.className = 'bookwin-cover';
    var built = bookScene(b, true);
    coverWrap.appendChild(built.scene);

    /* Reuse whatever the shelf already resolved rather than fetching the
       cover a second time. */
    var tileImg = anchor && anchor.querySelector('img');
    if (tileImg && tileImg.currentSrc) {
      var img = document.createElement('img');
      img.src = tileImg.currentSrc;
      img.alt = '';
      built.face.appendChild(img);
    } else {
      built.face.appendChild(fallbackNode(b));
    }
    body.appendChild(coverWrap);

    var col = document.createElement('div');
    col.appendChild(para('bookwin-author', b.author));
    col.appendChild(para('bookwin-title', b.title));

    var facts = document.createElement('p');
    facts.className = 'bookwin-facts';
    [b.category, b.publisher || b.source].filter(Boolean).forEach(function (t) {
      var span = document.createElement('span');
      span.textContent = t;
      facts.appendChild(span);
    });
    col.appendChild(facts);

    if (b.blurb) col.appendChild(para('bookwin-text', b.blurb));

    var link = document.createElement('p');
    link.className = 'bookwin-link';
    var a = document.createElement('a');
    a.href = b.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'View at publisher \u2192';
    link.appendChild(a);
    col.appendChild(link);

    body.appendChild(col);
  }

  /* Prev / next walk the shelf as it is currently filtered and sorted. */
  function stepBook(win, dir) {
    var list = visible();
    if (!list.length) return;

    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === win._bookId) { i = k; break; }
    }
    if (i < 0) i = 0;

    var b = list[(i + dir + list.length) % list.length];
    var cell = els.shelf.querySelector('.book-cell[data-id="' + b.id + '"]');

    delete openWins[win._key];
    win._key = 'book:' + b.id;
    win._bookId = b.id;
    win._opener = cell || null;
    openWins[win._key] = win;
    win.setAttribute('aria-label', b.category);

    fillBook(win.querySelector('.bookwin-body'), b, cell);
    markTiles();

    var img = cell && cell.querySelector('img');
    if (img && img.currentSrc) setAmbient(img.currentSrc);
  }

  function openBook(b, anchor) {
    makeWindow('book:' + b.id, b.category, {
      anchor: anchor,
      step: stepBook,
      build: function (body, win) {
        win._bookId = b.id;
        fillBook(body, b, anchor);
      }
    });
    markTiles();
  }

  function openAbout() {
    makeWindow('about', 'About', {
      about: true,
      build: function (body) {
        body.appendChild(para('bookwin-title', '100 Books on Korea'));
        ABOUT.forEach(function (line) { body.appendChild(para('bookwin-text', line)); });
      }
    });
  }

  els.shelf.addEventListener('click', function (e) {
    var tile = e.target.closest('.book-cell');
    if (!tile || !tile._book) return;
    var key = 'book:' + tile._book.id;
    if (openWins[key]) closeWin(key);
    else openBook(tile._book, tile);
  });

  document.querySelectorAll('[data-about]').forEach(function (b) {
    b.addEventListener('click', openAbout);
  });

  /* --- filter columns -------------------------------------------- */

  function tally(key) {
    var counts = {};
    books.forEach(function (b) {
      var v = b[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }

  function buildOptions(group, rows) {
    var ul = els.filters.querySelector('[data-group="' + group + '"]');
    var frag = document.createDocumentFragment();

    rows.forEach(function (row) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.value = row.id;
      btn.setAttribute('aria-pressed', String(state[group] === row.id));
      btn.appendChild(document.createTextNode(row.label));

      if (row.n != null) {
        var n = document.createElement('span');
        n.className = 'n';
        n.textContent = row.n;
        btn.appendChild(n);
      }

      li.appendChild(btn);
      frag.appendChild(li);
    });

    ul.replaceChildren(frag);
  }

  function buildFilters() {
    buildOptions('sort', SORTS);

    var cats = tally('category');
    buildOptions('category', [{ id: 'All', label: 'All', n: books.length }].concat(
      Object.keys(cats).sort(COMPARE).map(function (c) {
        return { id: c, label: c, n: cats[c] };
      })
    ));

    var pubs = tally('publisher');
    buildOptions('publisher', [{ id: 'All', label: 'All', n: books.length }].concat(
      Object.keys(pubs).sort(COMPARE).map(function (p) {
        return { id: p, label: p, n: pubs[p] };
      })
    ));
  }

  function markGroup(group) {
    els.filters.querySelectorAll('[data-group="' + group + '"] button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === state[group]));
    });
  }

  els.filters.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-value]');
    if (!btn) return;
    var group = btn.closest('[data-group]').dataset.group;
    var value = btn.dataset.value;

    /* Re-picking the active theme or publisher clears it; sort always
       has exactly one choice. */
    if (group !== 'sort' && state[group] === value) value = 'All';
    state[group] = value;

    markGroup(group);
    render();
  });

  /* --- reset ----------------------------------------------------- */

  function resetAll() {
    state.q = '';
    state.category = 'All';
    state.publisher = 'All';
    els.search.value = '';
    markGroup('category');
    markGroup('publisher');
    render();
  }

  els.reset.addEventListener('click', resetAll);
  els.empty.querySelector('[data-reset]').addEventListener('click', resetAll);

  /* --- search ---------------------------------------------------- */

  function debounce(fn, ms) {
    var id;
    return function () { clearTimeout(id); id = setTimeout(fn, ms); };
  }

  els.search.addEventListener('input', debounce(function () {
    state.q = els.search.value.trim();
    render();
  }, 120));

  els.search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && els.search.value) {
      e.preventDefault();
      els.search.value = '';
      state.q = '';
      render();
    }
  });

  els.clear.addEventListener('click', function () {
    els.search.value = '';
    state.q = '';
    render();
    els.search.focus();
  });

  /* --- scroll to top --------------------------------------------- */

  var topShown = null;
  function syncScrollTop() {
    var show = window.scrollY > window.innerHeight * 0.8;
    if (show === topShown) return;
    topShown = show;
    els.scrollTop.hidden = !show;
    els.scrollTop.classList.toggle('is-visible', show);
  }
  window.addEventListener('scroll', syncScrollTop, { passive: true });
  els.scrollTop.addEventListener('click', function () {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });

  /* --- keyboard --------------------------------------------------- */

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var keys = Object.keys(openWins);
    if (!keys.length) return;
    var top = keys.reduce(function (best, k) {
      return (+openWins[k].style.zIndex > +openWins[best].style.zIndex) ? k : best;
    }, keys[0]);
    closeWin(top);
  });

  /* --- render ----------------------------------------------------- */

  function render() {
    var list = visible();

    var frag = document.createDocumentFragment();
    list.forEach(function (b) { frag.appendChild(tileNode(b)); });
    els.shelf.replaceChildren(frag);
    primeReveal();
    markTiles();

    var was = els.count.textContent;
    els.count.textContent = (list.length === books.length)
      ? books.length + ' books'
      : list.length + ' of ' + books.length + ' books';
    if (was && was !== els.count.textContent) {
      els.count.classList.remove('is-changed');
      void els.count.offsetWidth;          /* restart the animation */
      els.count.classList.add('is-changed');
    }

    els.empty.hidden = list.length > 0;
    els.clear.hidden = !state.q;
    els.reset.hidden = !filtered();

    markScrollers();
    syncUrl();
  }

  /* --- URL sync ---------------------------------------------------- */

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'All') p.set('theme', state.category);
    if (state.publisher !== 'All') p.set('publisher', state.publisher);
    if (state.sort !== 'author') p.set('sort', state.sort);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';

    var theme = p.get('theme');
    if (theme && books.some(function (b) { return b.category === theme; })) state.category = theme;

    var pub = p.get('publisher');
    if (pub && books.some(function (b) { return b.publisher === pub; })) state.publisher = pub;

    var sort = p.get('sort');
    if (SORTS.some(function (s) { return s.id === sort; })) state.sort = sort;

    els.search.value = state.q;
  }

  /* --- boot -------------------------------------------------------- */

  document.querySelectorAll('.footer-year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  if (!books.length) {
    els.count.textContent = 'The book list failed to load.';
    els.empty.hidden = false;
    return;
  }

  readUrl();
  buildFilters();
  render();
  syncScrollTop();
})();
