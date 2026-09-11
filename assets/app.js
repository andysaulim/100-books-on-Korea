/* ---------------------------------------------------------------
   100 Books on Korea — shelf behaviour
   Data comes from books.js (window.BOOKS).
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var books = Array.isArray(window.BOOKS) ? window.BOOKS.slice() : [];

  /* Tint for the typographic stand-in shown when a book has no cover
     image, or when the image fails to load. */
  var HUES = {
    'Korean War':                        '#7c2d2a',
    'History & Empire':                  '#8a5a2b',
    'North Korea: Regime & Leadership':  '#2f3f63',
    'North Korea: Nuclear & Security':   '#3f4a5c',
    'North Korea: Society & Economy':    '#3c6060',
    'Escape & Human Rights':             '#5b3a6b',
    'South Korea: Politics & Democracy': '#1f5a6b',
    'South Korea: Society & Economy':    '#2d6148',
    'Alliances & Regional Order':        '#274b78',
    'Culture & the Korean Wave':         '#9c4568',
    'Fiction & Memoir':                  '#8d6a2f',
    'Diaspora & Migration':              '#4a6a3c'
  };
  var FALLBACK_HUE = '#48526b';

  var SORTS = [
    { id: 'author',    label: 'Author A–Z' },
    { id: 'title',     label: 'Title A–Z' },
    { id: 'category',  label: 'Theme' },
    { id: 'publisher', label: 'Publisher' }
  ];

  var els = {
    grid:   document.getElementById('grid'),
    empty:  document.getElementById('empty'),
    search: document.getElementById('search'),
    clear:  document.querySelector('[data-clear]'),
    count:  document.querySelector('.count'),
    peek:   document.getElementById('peek')
  };

  var peekEls = {
    theme:  document.getElementById('peek-theme'),
    title:  document.getElementById('peek-title'),
    author: document.getElementById('peek-author'),
    pub:    document.getElementById('peek-pub'),
    url:    document.getElementById('peek-url')
  };

  var state = { q: '', category: 'All', publisher: 'All', sort: 'author' };

  var COMPARE = new Intl.Collator('en', { sensitivity: 'base' }).compare;
  var coarse = window.matchMedia('(hover: none)').matches;

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
    var li = document.createElement('li');
    li.className = 'tile';

    var a = document.createElement('a');
    a.href = b.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.setProperty('--fallback-bg', hue(b.category));
    /* The cover art carries no text for a screen reader, so the link
       states the book itself. */
    a.setAttribute('aria-label', b.title + ' by ' + b.author);
    a._book = b;

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
        a.appendChild(fallbackNode(b));
      }, { once: true });
      a.appendChild(img);
    } else {
      a.appendChild(fallbackNode(b));
    }

    li.appendChild(a);
    return li;
  }

  /* --- the peek card -------------------------------------------- */

  var peekTimer = null;
  var peekFor = null;

  function showPeek(anchor) {
    var b = anchor._book;
    if (!b) return;
    peekFor = anchor;

    peekEls.theme.textContent = b.category;
    peekEls.title.textContent = b.title;
    peekEls.author.textContent = b.author;
    peekEls.pub.textContent = b.publisher || b.source || '';
    peekEls.url.href = b.url;

    els.peek.hidden = false;
    /* Measure after it is laid out, then place it. */
    var r = anchor.getBoundingClientRect();
    var p = els.peek.getBoundingClientRect();
    var pad = 10;

    var left = r.right + pad;
    if (left + p.width > window.innerWidth - pad) left = r.left - p.width - pad;
    if (left < pad) left = Math.max(pad, (window.innerWidth - p.width) / 2);

    var top = r.top + (r.height - p.height) / 2;
    top = Math.max(pad, Math.min(top, window.innerHeight - p.height - pad));

    els.peek.style.left = Math.round(left) + 'px';
    els.peek.style.top = Math.round(top) + 'px';
    els.peek.classList.add('on');
    if (coarse) els.peek.classList.add('interactive');
  }

  function hidePeek() {
    peekFor = null;
    els.peek.classList.remove('on', 'interactive');
    els.peek.hidden = true;
  }

  function scheduleHide() {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(hidePeek, 90);
  }

  els.grid.addEventListener('pointerover', function (e) {
    if (coarse) return;
    var a = e.target.closest('.tile a');
    if (!a || a === peekFor) return;
    clearTimeout(peekTimer);
    showPeek(a);
  });

  els.grid.addEventListener('pointerout', function (e) {
    if (coarse) return;
    var a = e.target.closest('.tile a');
    if (!a) return;
    if (e.relatedTarget && a.contains(e.relatedTarget)) return;
    scheduleHide();
  });

  els.grid.addEventListener('focusin', function (e) {
    var a = e.target.closest('.tile a');
    if (a) showPeek(a);
  });
  els.grid.addEventListener('focusout', scheduleHide);

  /* On a touch screen there is no hover, so the first tap opens the
     card and the link inside it does the navigating. */
  els.grid.addEventListener('click', function (e) {
    if (!coarse) return;
    var a = e.target.closest('.tile a');
    if (!a) return;
    if (peekFor === a) return;      // tapped again: let the link through
    e.preventDefault();
    showPeek(a);
  });

  document.addEventListener('click', function (e) {
    if (!coarse || !peekFor) return;
    if (e.target.closest('#peek') || e.target.closest('.tile a')) return;
    hidePeek();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && peekFor) hidePeek();
  });

  window.addEventListener('scroll', function () { if (peekFor) hidePeek(); }, { passive: true });
  window.addEventListener('resize', function () { if (peekFor) hidePeek(); });

  /* --- filter columns ------------------------------------------- */

  function tally(key) {
    var counts = {};
    books.forEach(function (b) {
      var v = b[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }

  function buildOptions(group, rows) {
    var ul = document.querySelector('[data-group="' + group + '"]');
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
    document.querySelectorAll('[data-group="' + group + '"] button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === state[group]));
    });
  }

  document.querySelector('.filters').addEventListener('click', function (e) {
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

  /* --- render --------------------------------------------------- */

  function render() {
    hidePeek();
    var list = visible();

    var frag = document.createDocumentFragment();
    list.forEach(function (b) { frag.appendChild(tileNode(b)); });
    els.grid.replaceChildren(frag);

    els.count.textContent = (list.length === books.length)
      ? books.length + ' books'
      : list.length + ' of ' + books.length + ' books';

    els.empty.hidden = list.length > 0;
    els.clear.hidden = !state.q;

    syncUrl();
  }

  /* --- URL sync ------------------------------------------------- */

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

  /* --- search --------------------------------------------------- */

  function debounce(fn, ms) {
    var id;
    return function () { clearTimeout(id); id = setTimeout(fn, ms); };
  }

  function resetSearch() {
    els.search.value = '';
    state.q = '';
    render();
    els.search.focus();
  }

  els.search.addEventListener('input', debounce(function () {
    state.q = els.search.value.trim();
    render();
  }, 120));

  els.search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && els.search.value) { e.preventDefault(); resetSearch(); }
  });

  els.clear.addEventListener('click', resetSearch);

  els.empty.querySelector('[data-reset]').addEventListener('click', function () {
    state.q = '';
    state.category = 'All';
    state.publisher = 'All';
    els.search.value = '';
    markGroup('category');
    markGroup('publisher');
    render();
  });

  /* --- boot ----------------------------------------------------- */

  if (!books.length) {
    els.count.textContent = 'The book list failed to load.';
    return;
  }

  readUrl();
  buildFilters();
  render();
})();
