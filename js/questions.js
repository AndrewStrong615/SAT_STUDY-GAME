// Question sources: live College Board (through scripts/serve.mjs), a bank
// downloaded with scripts/fetch-questions.mjs, or the built-in practice set.
(function () {
  const SECTION_NAMES = { math: 'Math', rw: 'Reading and Writing' };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function fetchJson(url, ms = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function detect() {
    let live = false;
    if (location.protocol.startsWith('http')) {
      try {
        const h = await fetchJson('api/health', 2000);
        live = !!(h && h.live);
      } catch (e) { /* not running through serve.mjs */ }
    }
    const bank = Array.isArray(window.CB_BANK) ? window.CB_BANK.length : 0;
    return { live, bank, builtin: (window.SAMPLE_QUESTIONS || []).length };
  }

  function matches(q, opts) {
    const secOk = opts.section === 'both' || q.section === SECTION_NAMES[opts.section];
    const diffOk = opts.difficulty === 'any' || q.difficulty === opts.difficulty;
    return secOk && diffOk;
  }

  // Put questions the player hasn't seen first, then the rest, each shuffled.
  function order(items, seen, idOf) {
    const fresh = [], old = [];
    for (const it of items) (seen.has(idOf(it)) ? old : fresh).push(it);
    return shuffle(fresh).concat(shuffle(old));
  }

  function localDeck(pool, opts, seen, label) {
    let list = pool.filter((q) => matches(q, opts));
    if (!list.length) list = pool.filter((q) => opts.section === 'both' || q.section === SECTION_NAMES[opts.section]);
    if (!list.length) list = pool.slice();
    list = order(list, seen, (q) => q.id);
    let i = 0;
    return {
      label,
      async next() {
        if (i >= list.length) { shuffle(list); i = 0; }
        return list[i++];
      },
    };
  }

  async function liveDeck(opts, seen) {
    const sections = opts.section === 'both' ? 'math,rw' : opts.section;
    const rows = await fetchJson(`api/cb/list?sections=${sections}`, 30000);
    if (!Array.isArray(rows) || !rows.length) throw new Error('No questions in the list');
    let list = rows.filter((r) => opts.difficulty === 'any' || r.difficulty === opts.difficulty);
    if (!list.length) list = rows;
    list = order(list, seen, (r) => `cb-${r.questionId}`);
    let i = 0;
    const pending = new Map();
    const load = (idx) => {
      if (idx >= list.length) return null;
      if (!pending.has(idx)) {
        const p = fetchJson(`api/cb/question?questionId=${encodeURIComponent(list[idx].questionId)}`);
        p.catch(() => {});
        pending.set(idx, p);
      }
      return pending.get(idx);
    };
    const fallback = localDeck(window.SAMPLE_QUESTIONS || [], opts, seen, 'Built-in practice');
    return {
      label: `College Board (live, ${rows.length.toLocaleString()} questions)`,
      async next() {
        for (let tries = 0; tries < 4 && i < list.length; tries++) {
          const idx = i++;
          load(i); // prefetch the one after
          load(i + 1);
          try {
            const q = await load(idx);
            pending.delete(idx);
            if (q && (q.stem || q.stimulus)) return q;
          } catch (e) {
            pending.delete(idx);
          }
        }
        return fallback.next();
      },
      warm() { load(0); load(1); },
    };
  }

  /** Build a deck for a race. Returns { deck, note } where note explains any fallback. */
  async function createDeck(opts, seen, avail) {
    const want = opts.source;
    const tryLive = want === 'live' || (want === 'auto' && avail.live);
    let liveNote = '';
    if (tryLive) {
      try {
        const deck = await liveDeck(opts, seen);
        deck.warm();
        return { deck, note: '' };
      } catch (e) {
        if (want === 'live') {
          const deck = localDeck(window.SAMPLE_QUESTIONS || [], opts, seen, 'Built-in practice');
          return { deck, note: `Couldn't reach College Board (${e.message}), so this race uses built-in questions.` };
        }
        liveNote = `Couldn't reach College Board live (${e.message}). `;
      }
    }
    if ((want === 'bank' || want === 'auto' || want === 'live') && avail.bank) {
      return { deck: localDeck(window.CB_BANK, opts, seen, `Downloaded bank (${avail.bank.toLocaleString()} questions)`), note: liveNote ? liveNote + 'Using your downloaded bank instead.' : '' };
    }
    const note = want === 'bank' ? 'No downloaded bank found yet, so this race uses built-in questions.' : liveNote ? liveNote + 'Using built-in questions instead.' : '';
    return { deck: localDeck(window.SAMPLE_QUESTIONS || [], opts, seen, 'Built-in practice'), note };
  }

  // ---- Answer checking for typed (student-produced) answers ----
  function toNumber(s) {
    s = String(s).replace(/\s+/g, '').replace(/^\+/, '').replace(/−/g, '-');
    if (/^-?\d*\.?\d+\/-?\d*\.?\d+$/.test(s)) {
      const [a, b] = s.split('/').map(Number);
      return b === 0 ? NaN : a / b;
    }
    if (/^-?\d*\.?\d+$/.test(s)) return Number(s);
    return NaN;
  }

  function checkTyped(input, accepted) {
    const clean = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
    const v = toNumber(input);
    return accepted.some((a) => {
      if (clean(a) === clean(input)) return true;
      const n = toNumber(a);
      if (Number.isNaN(n) || Number.isNaN(v)) return false;
      // The SAT accepts decimals that are cut off at the last digit that fits.
      return Math.abs(n - v) < 1e-6 || (String(input).replace(/\D/g, '').length >= 4 && Math.abs(n - v) < 0.001);
    });
  }

  // ---- Light HTML sanitizer for question content ----
  const BLOCKED = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'STYLE', 'FORM', 'INPUT', 'BUTTON', 'BASE']);
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const rootEl = doc.body.firstElementChild;
    const walk = (el) => {
      for (const child of Array.from(el.children)) {
        if (BLOCKED.has(child.tagName.toUpperCase())) { child.remove(); continue; }
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name.toLowerCase();
          const val = attr.value.trim().toLowerCase();
          if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && val.startsWith('javascript:'))) {
            child.removeAttribute(attr.name);
          }
        }
        if (child.tagName.toUpperCase() === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
        walk(child);
      }
    };
    walk(rootEl);
    return rootEl.innerHTML;
  }

  window.Questions = { detect, createDeck, checkTyped, sanitize };
})();
