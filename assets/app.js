/* ---------------------------------------------------------------
   100 Books on Korea — shelf behaviour
   Data comes from books.js (window.BOOKS).

   Structure follows minchi.co/books: the filter stack lives in the
   left rail on wide screens and moves into a modal on narrow ones,
   and a book opens as a draggable floating window rather than a
   hover card, so several can stay open at once.
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var books = Array.isArray(window.BOOKS) ? window.BOOKS.slice() : [];

  /* Tint for the typographic stand-in shown when a book has no cover
     image, or when the image fails to load. */
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
    'Open any cover for the details and a link to its publisher.'
  ];

  var $ = function (sel) { return document.querySelector(sel); };

  var els = {
    shelf:    $('#shelf'),
    empty:    $('#empty'),
    status:   $('#shelf-status'),
    search:   $('#search'),
    clear:    $('[data-clear]'),
    rail:     $('#side-scroll'),
    aside:    $('.side-nav'),
    windows:  $('#book-windows'),
    modal:    $('#filters-modal'),
    modalBody:$('#filters-modal-body'),
    toggle:   $('#filters-toggle'),
    scrollTop:$('#scroll-top'),
    floatReset:$('#filters-reset-float')
  };

  /* Every Reset button resets; the floating one is shown by scroll
     position rather than by render(), so it is tracked separately. */
  var allResets = Array.prototype.slice.call(document.querySelectorAll('.filters-reset'));
  var resets = allResets.filter(function (b) { return b !== els.floatReset; });

  var state = { q: '', category: 'All', publisher: 'All', sort: 'author' };

  var COMPARE = new Intl.Collator('en', { sensitivity: 'base' }).compare;
  var narrow = window.matchMedia('(max-width: 900px)');

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

  function filtered() { return state.q || state.category !== 'All' || state.publisher !== 'All'; }

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

    if (b.cover) {
      var img = document.createElement('img');
      img.src = b.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      /* Open Library 404s when it has no cover for the ISBN; swap in
         the typographic stand-in when that happens. */
      img.addEventListener('error', function () {
        img.remove();
        btn.appendChild(fallbackNode(b));
      }, { once: true });
      btn.appendChild(img);
    } else {
      btn.appendChild(fallbackNode(b));
    }

    return btn;
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
    delete openWins[key];
    win.remove();
    markTiles();
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
    left += cascade * 18;
    top += cascade * 18;
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
    close.addEventListener('click', function () {
      closeWin(key);
      if (anchor && document.contains(anchor)) anchor.focus();
    });

    bar.appendChild(label);
    bar.appendChild(close);

    var body = document.createElement('div');
    body.className = 'bookwin-body';
    buildBody(body);

    win.appendChild(bar);
    win.appendChild(body);
    els.windows.appendChild(win);

    openWins[key] = win;
    raise(win);
    place(win, anchor);
    drag(win, bar);

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

  function openBook(b, anchor) {
    makeWindow('book:' + b.id, b.category, function (body) {
      var t = document.createElement('p');
      t.className = 'bookwin-title';
      t.textContent = b.title;

      var a = document.createElement('p');
      a.className = 'bookwin-author';
      a.textContent = b.author;

      var p = document.createElement('p');
      p.className = 'bookwin-pub';
      p.textContent = b.publisher || b.source || '';

      var link = document.createElement('p');
      link.className = 'bookwin-link';
      var anchorEl = document.createElement('a');
      anchorEl.href = b.url;
      anchorEl.target = '_blank';
      anchorEl.rel = 'noopener noreferrer';
      anchorEl.textContent = 'View at publisher →';
      link.appendChild(anchorEl);

      body.appendChild(t);
      body.appendChild(a);
      body.appendChild(p);
      body.appendChild(link);
    }, anchor);
    markTiles();
  }

  function openAbout() {
    makeWindow('about', 'About', function (body) {
      var t = document.createElement('p');
      t.className = 'bookwin-title';
      t.textContent = 'Top 100 Books on Korea';
      body.appendChild(t);

      ABOUT.forEach(function (line) {
        var p = document.createElement('p');
        p.className = 'bookwin-text';
        p.textContent = line;
        body.appendChild(p);
      });
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

  /* --- filter lists --------------------------------------------- */

  function tally(key) {
    var counts = {};
    books.forEach(function (b) {
      var v = b[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }

  function buildList(id, group, rows) {
    var nav = document.getElementById(id);
    var frag = document.createDocumentFragment();

    rows.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.group = group;
      btn.dataset.value = row.id;
      btn.setAttribute('aria-pressed', String(state[group] === row.id));
      btn.appendChild(document.createTextNode(row.label));

      if (row.n != null) {
        var n = document.createElement('span');
        n.className = 'n';
        n.textContent = row.n;
        btn.appendChild(n);
      }

      frag.appendChild(btn);
    });

    nav.replaceChildren(frag);
  }

  function buildFilters() {
    buildList('sort-list', 'sort', SORTS);

    var cats = tally('category');
    buildList('theme-list', 'category', [{ id: 'All', label: 'All', n: books.length }].concat(
      Object.keys(cats).sort(COMPARE).map(function (c) {
        return { id: c, label: c, n: cats[c] };
      })
    ));

    var pubs = tally('publisher');
    buildList('publisher-list', 'publisher', [{ id: 'All', label: 'All', n: books.length }].concat(
      Object.keys(pubs).sort(COMPARE).map(function (p) {
        return { id: p, label: p, n: pubs[p] };
      })
    ));
  }

  function markGroup(group) {
    els.rail.querySelectorAll('button[data-group="' + group + '"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === state[group]));
    });
  }

  els.rail.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-value]');
    if (!btn) return;
    var group = btn.dataset.group;
    var value = btn.dataset.value;

    /* Re-picking the active theme or publisher clears it; sort always
       has exactly one choice. */
    if (group !== 'sort' && state[group] === value) value = 'All';
    state[group] = value;

    markGroup(group);
    render();
  });

  /* --- filters modal -------------------------------------------- */

  function openModal() {
    els.modalBody.appendChild(els.rail);       /* move, don't clone */
    els.modal.classList.add('is-open');
    els.modal.setAttribute('aria-hidden', 'false');
    els.toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    $('#filters-close').focus();
  }

  function closeModal() {
    if (!els.modal.classList.contains('is-open')) return;
    els.aside.appendChild(els.rail);           /* put the rail back */
    els.modal.classList.remove('is-open');
    els.modal.setAttribute('aria-hidden', 'true');
    els.toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    els.toggle.focus();
  }

  els.toggle.addEventListener('click', openModal);
  $('#filters-close').addEventListener('click', closeModal);
  $('#filters-backdrop').addEventListener('click', closeModal);

  /* A wide viewport has the rail back on screen, so the modal has no
     reason to stay open. */
  narrow.addEventListener('change', function (e) { if (!e.matches) closeModal(); });

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

  allResets.forEach(function (b) { b.addEventListener('click', resetAll); });
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
    /* The rail carries its own Reset, so the floating one is only worth
       showing once the rail has scrolled out of reach. */
    els.floatReset.hidden = !(show && filtered());
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
    if (els.modal.classList.contains('is-open')) { closeModal(); return; }

    /* Close the topmost window. */
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

    var msg = (list.length === books.length)
      ? books.length + ' books'
      : list.length + ' of ' + books.length + ' books';
    els.status.textContent = msg;

    els.empty.hidden = list.length > 0;
    els.clear.hidden = !state.q;
    resets.forEach(function (b) { b.hidden = !filtered(); });
    syncScrollTop();

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
    els.status.textContent = 'The book list failed to load.';
    els.empty.hidden = false;
    return;
  }

  readUrl();
  buildFilters();
  render();
  syncScrollTop();
})();
