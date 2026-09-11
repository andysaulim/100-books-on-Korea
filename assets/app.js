/* ---------------------------------------------------------------
   100 Books on Korea — shelf behaviour
   Data comes from books.js (window.BOOKS).
   --------------------------------------------------------------- */

(function () {
  'use strict';

  var books = Array.isArray(window.BOOKS) ? window.BOOKS.slice() : [];

  /* A colour per theme, used for the generated covers and the dot on
     each theme chip. Anything not listed falls back to slate. */
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

  var els = {
    books:  document.getElementById('books'),
    chips:  document.getElementById('chips'),
    search: document.getElementById('search'),
    sort:   document.getElementById('sort'),
    count:  document.querySelector('.count'),
    empty:  document.getElementById('empty'),
    clear:  document.querySelector('[data-clear]'),
    views:  document.querySelectorAll('[data-view]')
  };

  var state = { q: '', category: 'All', sort: 'author', view: 'grid' };

  /* --- helpers ------------------------------------------------- */

  function hue(cat) {
    return HUES[cat] || FALLBACK_HUE;
  }

  /* Drop leading articles so "The Vegetarian" files under V. */
  function titleKey(t) {
    return t.replace(/^(the|a|an)\s+/i, '').toLowerCase();
  }

  /* Fold accents, curly quotes and dashes so "Choson" finds
     "Chosŏn" and a typed hyphen matches an en dash. */
  function norm(s) {
    return (s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―]/g, '-')
      .toLowerCase();
  }

  var COMPARE = new Intl.Collator('en', { sensitivity: 'base' }).compare;

  function haystack(b) {
    if (!b._hay) {
      b._hay = norm([b.title, b.author, b.publisher, b.category].join('  '));
    }
    return b._hay;
  }

  /* --- filtering & sorting ------------------------------------- */

  function visible() {
    var terms = norm(state.q).split(/\s+/).filter(Boolean);

    var out = books.filter(function (b) {
      if (state.category !== 'All' && b.category !== state.category) return false;
      if (!terms.length) return true;
      var hay = haystack(b);
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });

    /* Sort last so an unmapped publisher lands at the end. */
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

  /* --- rendering ----------------------------------------------- */

  function bookNode(b, index) {
    var li = document.createElement('li');
    li.className = 'book';
    li.style.setProperty('--hue', hue(b.category));

    var a = document.createElement('a');
    a.href = b.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    var num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(index + 1).padStart(2, '0');

    /* The cover is decorative: it repeats the title and author that
       the .meta block already states, so screen readers skip it. */
    var cover = document.createElement('span');
    cover.className = 'cover';
    cover.setAttribute('aria-hidden', 'true');

    var rule = document.createElement('span');
    rule.className = 'cover-rule';
    cover.appendChild(rule);

    var ct = document.createElement('span');
    ct.className = 'cover-title';
    ct.textContent = b.title;
    cover.appendChild(ct);

    var ca = document.createElement('span');
    ca.className = 'cover-author';
    ca.textContent = b.author;
    cover.appendChild(ca);

    var meta = document.createElement('span');
    meta.className = 'meta';

    var t = document.createElement('span');
    t.className = 't';
    t.textContent = b.title;

    var au = document.createElement('span');
    au.className = 'a';
    au.textContent = b.author;

    meta.appendChild(t);
    meta.appendChild(au);

    if (b.publisher) {
      var p = document.createElement('span');
      p.className = 'p';
      p.textContent = b.publisher;
      meta.appendChild(p);
    }

    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = b.category;

    a.appendChild(num);
    a.appendChild(cover);
    a.appendChild(meta);
    a.appendChild(tag);
    li.appendChild(a);
    return li;
  }

  function render() {
    var list = visible();

    var frag = document.createDocumentFragment();
    list.forEach(function (b, i) { frag.appendChild(bookNode(b, i)); });

    els.books.replaceChildren(frag);
    els.books.dataset.view = state.view;

    els.count.innerHTML = (list.length === books.length)
      ? 'All <strong>' + books.length + '</strong> books'
      : '<strong>' + list.length + '</strong> of ' + books.length + ' books';

    els.empty.hidden = list.length > 0;
    els.clear.hidden = !state.q;

    syncUrl();
  }

  function renderChips() {
    var counts = {};
    books.forEach(function (b) { counts[b.category] = (counts[b.category] || 0) + 1; });

    var rows = [['All', books.length]].concat(
      Object.keys(counts).sort(COMPARE).map(function (c) { return [c, counts[c]]; })
    );

    var frag = document.createDocumentFragment();

    rows.forEach(function (pair) {
      var name = pair[0];
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.category = name;
      btn.setAttribute('aria-pressed', String(state.category === name));

      if (name !== 'All') {
        var sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.setProperty('--chip', hue(name));
        btn.appendChild(sw);
      }

      btn.appendChild(document.createTextNode(name));

      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = pair[1];
      btn.appendChild(n);

      li.appendChild(btn);
      frag.appendChild(li);
    });

    els.chips.replaceChildren(frag);
  }

  function markChips() {
    els.chips.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.category === state.category));
    });
  }

  function renderStats() {
    function uniq(key) {
      var seen = Object.create(null), n = 0;
      books.forEach(function (b) {
        var v = b[key];
        if (v && !seen[v]) { seen[v] = 1; n++; }
      });
      return n;
    }
    function set(name, value) {
      var el = document.querySelector('[data-stat="' + name + '"]');
      if (el) el.textContent = value;
    }
    set('books', books.length);
    set('authors', uniq('author'));
    set('categories', uniq('category'));
    set('publishers', uniq('publisher'));
  }

  /* --- URL sync ------------------------------------------------ */

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'All') p.set('theme', state.category);
    if (state.sort !== 'author') p.set('sort', state.sort);
    if (state.view !== 'grid') p.set('view', state.view);

    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);

    state.q = p.get('q') || '';

    var theme = p.get('theme');
    var known = books.some(function (b) { return b.category === theme; });
    if (theme && known) state.category = theme;

    var sort = p.get('sort');
    if (['author', 'title', 'category', 'publisher'].indexOf(sort) !== -1) state.sort = sort;

    if (p.get('view') === 'list') state.view = 'list';

    els.search.value = state.q;
    els.sort.value = state.sort;
    els.views.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    });
  }

  /* --- events -------------------------------------------------- */

  function debounce(fn, ms) {
    var id;
    return function () {
      clearTimeout(id);
      id = setTimeout(fn, ms);
    };
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
    if (e.key === 'Escape' && els.search.value) {
      e.preventDefault();
      resetSearch();
    }
  });

  els.clear.addEventListener('click', resetSearch);

  els.sort.addEventListener('change', function () {
    state.sort = els.sort.value;
    render();
  });

  els.chips.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-category]');
    if (!btn) return;
    /* Clicking the active theme again clears the filter. */
    state.category = (state.category === btn.dataset.category) ? 'All' : btn.dataset.category;
    markChips();
    render();
  });

  els.views.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.view = btn.dataset.view;
      els.views.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      render();
    });
  });

  els.empty.querySelector('[data-reset]').addEventListener('click', function () {
    state.q = '';
    state.category = 'All';
    els.search.value = '';
    markChips();
    render();
    els.search.focus();
  });

  /* Press "/" anywhere to jump to the search box. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    e.preventDefault();
    els.search.focus();
    els.search.select();
  });

  /* --- boot ---------------------------------------------------- */

  if (!books.length) {
    els.count.textContent = 'The book list failed to load.';
    return;
  }

  readUrl();
  renderStats();
  renderChips();
  render();
})();
