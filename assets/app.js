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

  function googleCover(isbn) {
    return 'https://books.google.com/books/content?vid=ISBN' + isbn +
           '&printsec=frontcover&img=1&zoom=1';
  }

  /* Open Library holds art for a good share of these ISBNs but nothing
     like all of them, so a miss falls through to Google Books before
     the typographic stand-in. `cover` stays the first candidate, which
     is also the hook for pointing a book at your own artwork. */
  function coverSources(b) {
    var out = [];
    if (b.cover) out.push(b.cover);
    if (b.isbn) {
      out.push(googleCover(b.isbn));
      var i10 = isbn10(b.isbn);
      if (i10) out.push(googleCover(i10));
    }
    return out;
  }

  /* "Stephan Haggard and Marcus Noland" -> "Stephan Haggard". */
  function firstAuthor(a) {
    return (a || '').split(/\s+(?:and|&|with)\s+|,\s*/)[0].trim();
  }

  /* Open Library carries plenty of works it holds no ISBN-level cover
     for, so when every ISBN attempt misses, ask its search API for the
     work by title and author and use the cover id that comes back. Only
     the books that got this far ever issue the request. */
  function searchCover(b) {
    if (!window.fetch) return Promise.resolve(null);
    var url = 'https://openlibrary.org/search.json?limit=3&fields=title,cover_i' +
              '&title=' + encodeURIComponent(b.title) +
              '&author=' + encodeURIComponent(firstAuthor(b.author));

    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.docs) return null;
        var want = norm(b.title);
        for (var i = 0; i < j.docs.length; i++) {
          var d = j.docs[i];
          if (!d.cover_i || !d.title) continue;
          /* Guard against the search handing back a different book:
             one title has to be a prefix of the other, which tolerates
             a missing subtitle but not a different work. */
          var got = norm(d.title);
          if (want.indexOf(got) === 0 || got.indexOf(want) === 0) {
            return 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg';
          }
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function loadCover(btn, b) {
    var srcs = coverSources(b);
    if (!srcs.length) { btn.appendChild(fallbackNode(b)); b._noCover = true; return; }

    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    /* Google's cover endpoint can refuse on referrer. */
    img.referrerPolicy = 'no-referrer';

    var i = 0;
    var searched = false;

    function giveUp() {
      img.remove();
      btn.appendChild(fallbackNode(b));
      b._noCover = true;
    }

    function next() {
      if (i < srcs.length) { img.src = srcs[i++]; return; }
      if (searched) { giveUp(); return; }
      searched = true;
      searchCover(b).then(function (url) {
        if (url) { srcs.push(url); next(); }
        else giveUp();
      });
    }

    img.addEventListener('error', next);
    img.addEventListener('load', function () {
      /* A source with no art for an ISBN may answer 200 with a 1x1 or a
         "no cover" placeholder rather than 404, so judge it by size. */
      if (img.naturalWidth < 50 || img.naturalHeight < 50) next();
      else b._noCover = false;
    });

    btn.appendChild(img);
    next();
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

  function tileNode(b) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile';
    btn.style.setProperty('--fallback-bg', hue(b.category));
    /* The cover art carries no text for a screen reader, so the
       control names the book itself. */
    btn.setAttribute('aria-label', b.title + ' by ' + b.author);
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.dataset.id = b.id;
    btn._book = b;

    loadCover(btn, b);

    var li = document.createElement('li');
    li.appendChild(btn);
    return li;
  }

  /* --- floating windows ----------------------------------------- */

  var openWins = {};      /* key -> element */
  var winZ = 1;
  var cascade = 0;

  function markTiles() {
    els.shelf.querySelectorAll('.tile').forEach(function (t) {
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

  function makeWindow(key, kind, buildBody, anchor) {
    if (openWins[key]) { raise(openWins[key]); return openWins[key]; }

    var win = document.createElement('div');
    win.className = 'bookwin';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', kind);

    var bar = document.createElement('div');
    bar.className = 'bookwin-bar';

    var label = document.createElement('span');
    label.className = 'bookwin-kind';
    label.textContent = kind;

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'bookwin-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', function () { closeWin(key); });

    bar.appendChild(label);
    bar.appendChild(close);

    var body = document.createElement('div');
    body.className = 'bookwin-body';
    buildBody(body);

    win.appendChild(bar);
    win.appendChild(body);
    els.windows.appendChild(win);

    openWins[key] = win;
    win._opener = anchor;
    raise(win);
    place(win, anchor);
    drag(win, bar);

    /* The window is the last thing in the DOM, so leaving focus on the
       cover would put a hundred covers between the two. Move into it. */
    win.tabIndex = -1;
    win.focus({ preventScroll: true });

    win.addEventListener('pointerdown', function () { raise(win); });
    return win;
  }

  function drag(win, bar) {
    var dx = 0, dy = 0, id = null;

    bar.addEventListener('pointerdown', function (e) {
      if (narrow.matches) return;
      if (e.target.closest('.bookwin-close')) return;
      id = e.pointerId;
      var r = win.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      bar.setPointerCapture(id);
      e.preventDefault();
    });

    bar.addEventListener('pointermove', function (e) {
      if (id === null || e.pointerId !== id) return;
      var pad = 8;
      var left = Math.max(pad, Math.min(e.clientX - dx, window.innerWidth - win.offsetWidth - pad));
      var top = Math.max(pad, Math.min(e.clientY - dy, window.innerHeight - win.offsetHeight - pad));
      win.style.left = Math.round(left) + 'px';
      win.style.top = Math.round(top) + 'px';
    });

    function end(e) {
      if (id === null || e.pointerId !== id) return;
      if (bar.hasPointerCapture(id)) bar.releasePointerCapture(id);
      id = null;
    }
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  function para(cls, text) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }

  /* Reuse whatever the tile already resolved rather than fetching the
     cover a second time; fall back to a miniature of the stand-in. */
  function thumbNode(b, anchor) {
    var box = document.createElement('div');
    box.className = 'bookwin-thumb';
    box.style.setProperty('--thumb-bg', hue(b.category));

    var tileImg = anchor && anchor.querySelector('img');
    if (tileImg && tileImg.currentSrc) {
      var img = document.createElement('img');
      img.src = tileImg.currentSrc;
      img.alt = '';
      box.appendChild(img);
    } else {
      var stub = document.createElement('span');
      stub.className = 'stub';
      stub.textContent = b.title;
      box.appendChild(stub);
    }
    return box;
  }

  function openBook(b, anchor) {
    makeWindow('book:' + b.id, b.category, function (body) {
      var head = document.createElement('div');
      head.className = 'bookwin-head';
      head.appendChild(thumbNode(b, anchor));

      var titles = document.createElement('div');
      titles.className = 'bookwin-titles';
      titles.appendChild(para('bookwin-author', b.author));
      titles.appendChild(para('bookwin-title', b.title));

      var facts = document.createElement('p');
      facts.className = 'bookwin-facts';
      [b.category, b.publisher || b.source].filter(Boolean).forEach(function (t, i) {
        if (i) {
          var dot = document.createElement('span');
          dot.className = 'dot';
          dot.textContent = '\u00b7';
          facts.appendChild(dot);
        }
        var span = document.createElement('span');
        span.textContent = t;
        facts.appendChild(span);
      });
      titles.appendChild(facts);
      head.appendChild(titles);
      body.appendChild(head);

      if (b.blurb) body.appendChild(para('bookwin-text', b.blurb));

      var link = document.createElement('p');
      link.className = 'bookwin-link';
      var a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'View at publisher →';
      link.appendChild(a);
      body.appendChild(link);
    }, anchor);
    markTiles();
  }

  function openAbout() {
    makeWindow('about', 'About', function (body) {
      body.appendChild(para('bookwin-title', '100 Books on Korea'));
      ABOUT.forEach(function (line) { body.appendChild(para('bookwin-text', line)); });
    }, null);
  }

  els.shelf.addEventListener('click', function (e) {
    var tile = e.target.closest('.tile');
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
    markTiles();

    els.count.textContent = (list.length === books.length)
      ? books.length + ' books'
      : list.length + ' of ' + books.length + ' books';

    els.empty.hidden = list.length > 0;
    els.clear.hidden = !state.q;
    els.reset.hidden = !filtered();

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
