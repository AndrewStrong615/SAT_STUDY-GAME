// Screens, save data, the shop, and the question/answer loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'satRacer.save.v1';
  const ORD = ['1st', '2nd', '3rd', '4th'];

  // ---------- Save data (stays in this browser) ----------
  const defaults = () => ({
    money: 0,
    owned: ['rust'],
    car: 'rust',
    league: 'rookie',
    stats: { races: 0, wins: 0, podiums: 0, answered: 0, correct: 0, earned: 0 },
    seen: [],
  });
  let save = defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(defaults(), JSON.parse(raw));
  } catch (e) { /* storage blocked: play without saving */ }
  function persist() {
    try {
      save.seen = save.seen.slice(-4000);
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) { /* ignore */ }
  }

  const carById = (id) => window.CARS.find((c) => c.id === id) || window.CARS[0];
  const leagueById = (id) => window.LEAGUES.find((l) => l.id === id) || window.LEAGUES[0];

  // ---------- Screens ----------
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    if (name === 'menu') renderMenu();
    if (name === 'garage') renderGarage();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

  function updateMoney(animateFrom) {
    const el = $('money');
    if (animateFrom == null) { el.textContent = save.money.toLocaleString(); return; }
    const start = performance.now(), from = animateFrom, to = save.money;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 900);
      el.textContent = Math.round(from + (to - from) * k).toLocaleString();
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Menu ----------
  const settings = { section: 'both', difficulty: 'any', length: '10', league: save.league, source: 'auto' };
  let avail = { live: false, bank: 0, builtin: 0 };

  function bindSeg(seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      settings[seg.dataset.name] = b.dataset.value;
      if (seg.dataset.name === 'league') { save.league = b.dataset.value; persist(); renderLeagueHint(); }
      if (seg.dataset.name === 'source') renderSourceHint();
    });
  }
  document.querySelectorAll('.seg').forEach(bindSeg);

  function renderLeagueHint() {
    const lg = leagueById(settings.league);
    $('league-hint').textContent = `Win pays $${lg.prizes[0]} (2nd $${lg.prizes[1]}, 3rd $${lg.prizes[2]}), plus $${lg.perCorrect} per correct answer. Rivals get about ${Math.round(lg.rivalAcc[0] * 100)}–${Math.round(lg.rivalAcc[1] * 100)}% right.`;
  }

  function renderSourceHint() {
    const s = settings.source;
    const parts = [];
    parts.push(avail.live ? 'College Board live: connected.' : 'College Board live: start the game with "node scripts/serve.mjs" to enable.');
    parts.push(avail.bank ? `Downloaded bank: ${avail.bank.toLocaleString()} questions.` : 'Downloaded bank: none yet (run "node scripts/fetch-questions.mjs").');
    parts.push(`Built-in: ${avail.builtin} original practice questions.`);
    let lead = '';
    if (s === 'auto') lead = `Using: ${avail.live ? 'College Board live' : avail.bank ? 'downloaded bank' : 'built-in practice'}. `;
    $('source-hint').textContent = lead + parts.join(' ');
  }

  function renderMenu() {
    const lseg = $('league-seg');
    lseg.innerHTML = window.LEAGUES.map((l) => `<button data-value="${l.id}" class="${l.id === settings.league ? 'on' : ''}">${l.name}</button>`).join('');
    renderLeagueHint();
    renderSourceHint();
    const st = save.stats;
    const acc = st.answered ? Math.round((st.correct / st.answered) * 100) + '%' : '–';
    const car = carById(save.car);
    $('career').innerHTML = `
      <h2>Your career</h2>
      <div class="statgrid">
        <div><b>${st.races}</b><span>races</span></div>
        <div><b>${st.wins}</b><span>wins</span></div>
        <div><b>${acc}</b><span>accuracy</span></div>
        <div><b>${st.answered}</b><span>questions</span></div>
        <div><b>$${st.earned.toLocaleString()}</b><span>earned</span></div>
        <div><b style="color:${car.color}">${car.name}</b><span>current car</span></div>
      </div>`;
    updateMoney();
  }

  // ---------- Garage & shop ----------
  function statBar(label, value, min, max) {
    const pct = Math.round(((value - min) / (max - min)) * 80 + 20);
    return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }

  function renderGarage() {
    const list = $('car-list');
    list.innerHTML = '';
    for (const car of window.CARS) {
      const owned = save.owned.includes(car.id);
      const selected = save.car === car.id;
      const div = document.createElement('div');
      div.className = 'car card' + (selected ? ' selected' : '');
      div.innerHTML = `
        <canvas width="260" height="120"></canvas>
        <h3>${car.name}</h3>
        <p class="hint">${car.blurb}</p>
        ${statBar('Power', car.power, 1, 1.45)}
        ${statBar('Grip', car.grip, 1, 1.6)}
        ${statBar('Nitro', car.nitro, 5, 12)}
        <div class="car-actions"></div>`;
      const act = div.querySelector('.car-actions');
      const btn = document.createElement('button');
      if (selected) {
        btn.className = 'btn';
        btn.textContent = 'Driving';
        btn.disabled = true;
      } else if (owned) {
        btn.className = 'btn';
        btn.textContent = 'Drive this';
        btn.onclick = () => { save.car = car.id; persist(); renderGarage(); };
      } else {
        const afford = save.money >= car.price;
        btn.className = 'btn primary';
        btn.textContent = `Buy $${car.price.toLocaleString()}`;
        btn.disabled = !afford;
        if (!afford) btn.title = `You need $${(car.price - save.money).toLocaleString()} more`;
        btn.onclick = () => {
          if (save.money < car.price) return;
          const before = save.money;
          save.money -= car.price;
          save.owned.push(car.id);
          save.car = car.id;
          persist();
          updateMoney(before);
          renderGarage();
        };
      }
      act.appendChild(btn);
      list.appendChild(div);
      window.drawCarPreview(div.querySelector('canvas'), car);
    }
    updateMoney();
  }
  $('btn-garage').onclick = () => show('garage');
  $('btn-results-garage').onclick = () => show('garage');

  // ---------- Race ----------
  let race = null;
  let deck = null;
  let current = null; // current question
  let qIndex = 0;
  let answered = false;
  let log = [];
  let qStart = 0;
  let raceOpts = null;

  async function startRace() {
    const btn = $('btn-start');
    btn.disabled = true;
    btn.textContent = 'Loading questions…';
    raceOpts = { ...settings, length: Number(settings.length) };
    try {
      const made = await window.Questions.createDeck(raceOpts, new Set(save.seen), avail);
      deck = made.deck;
      raceOpts.note = made.note;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start race';
    }
    if (race) race.stop();
    race = new window.Race($('track'), { car: carById(save.car), league: leagueById(raceOpts.league), length: raceOpts.length });
    race.start();
    qIndex = 0;
    log = [];
    show('race');
    resizeCanvas();
    nextQuestion();
  }
  $('btn-start').onclick = startRace;
  $('btn-again').onclick = () => { show('menu'); startRace(); };
  $('btn-quit').onclick = () => {
    if (confirm('Quit this race? You won\'t earn anything for it.')) {
      race && race.stop();
      show('menu');
    }
  };

  function resizeCanvas() {
    const c = $('track');
    const w = c.parentElement.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = Math.max(170, Math.min(300, w * 0.32));
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
  }
  window.addEventListener('resize', () => { if ($('screen-race').classList.contains('active')) resizeCanvas(); });

  function updateHud() {
    const done = log.length;
    const right = log.filter((l) => l.correct).length;
    $('hud-place').textContent = ORD[race.place() - 1];
    $('hud-q').textContent = `${Math.min(qIndex, raceOpts.length)}/${raceOpts.length}`;
    $('hud-streak').textContent = race.player.streak ? `🔥 ${race.player.streak}` : '0';
    $('hud-acc').textContent = done ? `${Math.round((right / done) * 100)}%` : '–';
  }

  const DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };

  async function nextQuestion() {
    if (qIndex >= raceOpts.length) return finishRace();
    answered = false;
    qIndex++;
    $('qpanel').classList.add('loading');
    $('q-feedback').innerHTML = '';
    $('q-feedback').className = 'feedback';
    $('q-choices').innerHTML = '';
    $('q-stem').innerHTML = '<p class="hint">Loading question…</p>';
    $('q-stimulus').innerHTML = '';
    $('q-spr').style.display = 'none';
    updateHud();
    current = await deck.next();
    $('qpanel').classList.remove('loading');
    renderQuestion(current);
    qStart = performance.now();
  }

  function renderQuestion(q) {
    const S = window.Questions.sanitize;
    const src = q.source === 'College Board' ? 'College Board' : 'Original practice';
    $('qmeta').innerHTML = `<span class="tag">${q.section}</span><span class="tag">${q.domain || ''}</span>${q.skill ? `<span class="tag subtle">${q.skill}</span>` : ''}<span class="tag diff-${q.difficulty}">${DIFF[q.difficulty] || q.difficulty}</span><span class="tag subtle">${src}</span>`;
    if (raceOpts.note && qIndex === 1) $('qmeta').innerHTML += `<p class="note">${raceOpts.note}</p>`;
    $('q-stimulus').innerHTML = S(q.stimulus);
    $('q-stimulus').style.display = q.stimulus ? '' : 'none';
    $('q-stem').innerHTML = S(q.stem);
    const box = $('q-choices');
    box.innerHTML = '';
    if (q.type === 'mcq') {
      $('q-spr').style.display = 'none';
      q.choices.forEach((ch, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.dataset.letter = ch.letter;
        b.innerHTML = `<span class="letter">${ch.letter}</span><span class="ctext">${S(ch.html)}</span>`;
        b.onclick = () => answer(ch.letter);
        box.appendChild(b);
      });
    } else {
      $('q-spr').style.display = '';
      const inp = $('q-spr-input');
      inp.value = '';
      inp.disabled = false;
      setTimeout(() => inp.focus({ preventScroll: true }), 50);
    }
  }

  $('q-spr').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('q-spr-input').value.trim();
    if (v) answer(v);
  });

  function answer(choice) {
    if (answered || !current) return;
    answered = true;
    const q = current;
    const correct = q.type === 'mcq' ? choice === q.answer : window.Questions.checkTyped(choice, q.answer);
    const secs = Math.round((performance.now() - qStart) / 1000);
    log.push({ q, choice, correct, secs });
    save.seen.push(q.id);
    save.stats.answered++;
    if (correct) save.stats.correct++;
    persist();

    // mark choices
    if (q.type === 'mcq') {
      document.querySelectorAll('#q-choices .choice').forEach((b) => {
        b.disabled = true;
        if (b.dataset.letter === q.answer) b.classList.add('right');
        else if (b.dataset.letter === choice) b.classList.add('wrong');
      });
    } else {
      $('q-spr-input').disabled = true;
    }

    const gain = race.step(correct);
    flash(correct);
    const streak = race.player.streak;
    const msg = correct
      ? `<b>Correct!</b> +${Math.round(gain)}m${streak >= 2 ? ` · streak ${streak} 🔥 nitro!` : ''}`
      : `<b>Not quite.</b> You spun out. ${q.type === 'mcq' ? `The answer is <b>${q.answer}</b>.` : `Accepted answer${q.answer.length > 1 ? 's' : ''}: <b>${q.answer.join(', ')}</b>.`}`;
    const last = qIndex >= raceOpts.length;
    const fb = $('q-feedback');
    fb.className = 'feedback ' + (correct ? 'good' : 'bad');
    fb.innerHTML = `
      <div class="fb-row"><div>${msg}</div>
      <button class="btn primary" id="btn-next">${last ? 'To the finish line 🏁' : 'Next question →'}</button></div>
      ${q.rationale ? `<details ${correct ? '' : 'open'}><summary>Explanation</summary><div class="rationale">${window.Questions.sanitize(q.rationale)}</div></details>` : ''}`;
    $('btn-next').onclick = nextQuestion;
    setTimeout(() => { updateHud(); }, 2300);
    updateHud();
    // Keep the "next" button reachable without scrolling the pinned track away.
    const r = fb.getBoundingClientRect();
    if (r.bottom > window.innerHeight) window.scrollBy({ top: Math.min(r.bottom - window.innerHeight + 16, r.top - 300), behavior: 'smooth' });
  }

  function flash(good) {
    const f = $('flash');
    f.className = 'flash ' + (good ? 'good' : 'bad');
    void f.offsetWidth;
    f.classList.add('show');
  }

  // keyboard: A-D or 1-4 to answer, Enter for next
  document.addEventListener('keydown', (e) => {
    if (!$('screen-race').classList.contains('active')) return;
    if (e.target.tagName === 'INPUT') return;
    if (!answered && current && current.type === 'mcq') {
      const k = e.key.toUpperCase();
      const idx = 'ABCD'.indexOf(k) >= 0 ? 'ABCD'.indexOf(k) : '1234'.indexOf(k);
      if (idx >= 0 && current.choices[idx]) { e.preventDefault(); answer(current.choices[idx].letter); }
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const b = $('btn-next');
      if (b) b.click();
    }
  });

  function finishRace() {
    $('q-feedback').innerHTML = '<p><b>Final sprint!</b></p>';
    $('q-choices').innerHTML = '';
    $('q-stem').innerHTML = '';
    $('q-stimulus').innerHTML = '';
    $('q-spr').style.display = 'none';
    const place = race.place();
    race.sprint(() => setTimeout(() => showResults(place), 500));
  }

  function showResults(place) {
    const lg = leagueById(raceOpts.league);
    const right = log.filter((l) => l.correct).length;
    const prize = lg.prizes[place - 1] || 0;
    const bonus = right * lg.perCorrect;
    const before = save.money;
    save.money += prize + bonus;
    save.stats.races++;
    save.stats.earned += prize + bonus;
    if (place === 1) save.stats.wins++;
    if (place <= 3) save.stats.podiums++;
    persist();

    const order = race.standings();
    $('podium').innerHTML = order
      .map((c, i) => `<div class="pod p${i + 1} ${c.you ? 'you' : ''}"><span class="pl">${ORD[i]}</span><span class="dot" style="background:${c.color}"></span>${c.you ? 'You' : c.name}</div>`)
      .join('');
    const titles = ['🏆 You won!', '🥈 Second place!', '🥉 Third place', 'Fourth place'];
    $('result-title').textContent = titles[place - 1];
    $('result-sub').textContent = `${right} of ${log.length} correct (${Math.round((right / log.length) * 100)}%) in the ${lg.name} league.` +
      (place === 1 ? '' : place === 4 ? ' Keep at it: every correct answer is speed.' : ' So close. Streaks are where the speed is.');
    $('payout').innerHTML = `
      <div><span>${ORD[place - 1]} place prize</span><b>$${prize}</b></div>
      <div><span>${right} correct × $${lg.perCorrect}</span><b>$${bonus}</b></div>
      <div class="total"><span>Earned</span><b>$${prize + bonus}</b></div>
      ${nextCarHint()}`;
    renderReview();
    show('results');
    updateMoney(before);
    race.stop();
  }

  function nextCarHint() {
    const next = window.CARS.find((c) => !save.owned.includes(c.id));
    if (!next) return '<p class="hint">You own every car. Try the Champion league!</p>';
    if (save.money >= next.price) return `<p class="hint good">You can afford the <b>${next.name}</b> now. Visit the shop!</p>`;
    return `<p class="hint">$${(next.price - save.money).toLocaleString()} more to buy the <b>${next.name}</b>.</p>`;
  }

  function renderReview() {
    const S = window.Questions.sanitize;
    $('review').innerHTML = log
      .map((l, i) => {
        const q = l.q;
        const correctText = q.type === 'mcq' ? q.answer : q.answer.join(', ');
        return `<details class="rev ${l.correct ? 'ok' : 'miss'}">
          <summary><span class="mark">${l.correct ? '✓' : '✗'}</span> Q${i + 1} · ${q.section} · ${q.skill || q.domain} <span class="hint">(${l.secs}s)</span></summary>
          ${q.stimulus ? `<div class="stimulus">${S(q.stimulus)}</div>` : ''}
          <div class="stem">${S(q.stem)}</div>
          ${q.type === 'mcq' ? `<ol class="revchoices">${q.choices.map((c) => `<li class="${c.letter === q.answer ? 'right' : c.letter === l.choice ? 'wrong' : ''}"><b>${c.letter}.</b> ${S(c.html)}</li>`).join('')}</ol>` : ''}
          <p>Your answer: <b>${escapeHtml(l.choice)}</b> · Correct: <b>${escapeHtml(correctText)}</b></p>
          ${q.rationale ? `<div class="rationale">${S(q.rationale)}</div>` : ''}
        </details>`;
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Boot ----------
  renderMenu();
  window.Questions.detect().then((a) => {
    avail = a;
    renderSourceHint();
  });
})();
