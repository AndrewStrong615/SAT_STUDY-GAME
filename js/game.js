// Screens, career progression, save data, the shop, and the question loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'satRacer.save.v1';
  const ORD = ['1st', '2nd', '3rd', '4th'];
  const PLACE_XP = [60, 35, 20, 10];

  // ---------- Save data (stays in this browser) ----------
  const defaults = () => ({
    money: 0,
    owned: ['rust'],
    car: 'rust',
    league: 'rookie',
    xp: 0,
    leagueWins: { rookie: 0, pro: 0, champ: 0 },
    goals: [],
    stats: { races: 0, wins: 0, podiums: 0, answered: 0, correct: 0, earned: 0, bestStreak: 0, perfect: 0 },
    seen: [],
  });
  let save = defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = defaults();
      const s = JSON.parse(raw);
      save = Object.assign(d, s, {
        stats: Object.assign(d.stats, s.stats || {}),
        leagueWins: Object.assign(d.leagueWins, s.leagueWins || {}),
      });
      // Saves from before the career ladder: count old wins toward the Rookie Cup.
      if (!s.leagueWins && save.stats.wins) save.leagueWins.rookie = save.stats.wins;
    }
  } catch (e) { /* storage blocked: play without saving */ }
  function persist() {
    try {
      save.seen = save.seen.slice(-4000);
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) { /* ignore */ }
  }

  const carById = (id) => window.CARS.find((c) => c.id === id) || window.CARS[0];
  const leagueById = (id) => window.LEAGUES.find((l) => l.id === id) || window.LEAGUES[0];
  const leagueIndex = (id) => window.LEAGUES.findIndex((l) => l.id === id);

  // ---------- Progression rules ----------
  function isUnlocked(leagueId) {
    const i = leagueIndex(leagueId);
    if (i <= 0) return true;
    const prev = window.LEAGUES[i - 1];
    return isUnlocked(prev.id) && (save.leagueWins[prev.id] || 0) >= window.LEAGUES[i].winsToUnlock;
  }
  function levelInfo(xp) {
    // Level n needs 100 * n * (n - 1) / 2 total XP: 0, 100, 300, 600, 1000...
    let lvl = 1;
    while (xp >= (100 * (lvl + 1) * lvl) / 2) lvl++;
    const base = (100 * lvl * (lvl - 1)) / 2;
    const next = (100 * (lvl + 1) * lvl) / 2;
    return { lvl, into: xp - base, need: next - base };
  }
  const RANKS = ['Learner', 'Street Racer', 'Club Racer', 'Pro Driver', 'Ace', 'Champion', 'Legend'];
  const rankName = (lvl) => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 2))];

  const GOAL_CHECKS = {
    first_win: () => save.stats.wins >= 1,
    streak5: () => save.stats.bestStreak >= 5,
    buy: () => save.owned.length >= 2,
    q50: () => save.stats.answered >= 50,
    perfect: () => save.stats.perfect >= 1,
    pro: () => isUnlocked('pro'),
    pro_win: () => (save.leagueWins.pro || 0) >= 1,
    q200: () => save.stats.answered >= 200,
    champ: () => isUnlocked('champ'),
    title: () => (save.leagueWins.champ || 0) >= 3,
    garage: () => window.CARS.every((c) => save.owned.includes(c.id)),
  };
  /** Award any newly reached goals. Returns the list awarded. */
  function checkGoals() {
    const got = [];
    for (const g of window.GOALS) {
      if (save.goals.includes(g.id)) continue;
      const fn = GOAL_CHECKS[g.id];
      if (fn && fn()) {
        save.goals.push(g.id);
        save.money += g.reward;
        save.stats.earned += g.reward;
        got.push(g);
      }
    }
    if (got.length) persist();
    return got;
  }

  function toast(html, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = html;
    $('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  }
  function goalToasts(list) {
    list.forEach((g, i) => setTimeout(() => toast(`<b>Goal complete</b>${g.text}<span class="tr">+$${g.reward}</span>`, 'gold'), 300 + i * 700));
  }

  // ---------- Screens ----------
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    if (name === 'menu') renderMenu();
    if (name === 'garage') renderGarage();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

  function renderTop(animateFrom) {
    const L = levelInfo(save.xp);
    $('lvl-chip').innerHTML = `<b>LV ${L.lvl}</b><i style="width:${Math.round((L.into / L.need) * 100)}%"></i>`;
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

  // ---------- Career hub ----------
  if (!isUnlocked(save.league)) save.league = 'rookie';
  const settings = { section: 'both', difficulty: 'any', length: '10', league: save.league, source: 'auto' };
  let avail = { live: false, bank: 0, builtin: 0 };

  function bindSeg(seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      settings[seg.dataset.name] = b.dataset.value;
      if (seg.dataset.name === 'source') renderSourceHint();
    });
  }
  document.querySelectorAll('.seg').forEach(bindSeg);

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

  function renderDriver() {
    const L = levelInfo(save.xp);
    const st = save.stats;
    const acc = st.answered ? Math.round((st.correct / st.answered) * 100) + '%' : '–';
    const car = carById(save.car);
    const next = window.CARS.find((c) => !save.owned.includes(c.id));
    $('driver').innerHTML = `
      <div class="dhead">
        <div class="badge"><span>LV</span>${L.lvl}</div>
        <div>
          <h2 class="ptitle">${rankName(L.lvl)}</h2>
          <div class="xpbar"><i style="width:${Math.round((L.into / L.need) * 100)}%"></i></div>
          <p class="hint">${L.into} / ${L.need} XP to level ${L.lvl + 1}</p>
        </div>
      </div>
      <div class="mycar">
        <canvas width="300" height="120" id="driver-car"></canvas>
        <div>
          <p class="kicker">Your car</p>
          <h3>${car.name}</h3>
          <button class="btn ghost small" id="btn-garage"><span>Garage →</span></button>
        </div>
      </div>
      <div class="statgrid">
        <div><b>${st.races}</b><span>races</span></div>
        <div><b>${st.wins}</b><span>wins</span></div>
        <div><b>${acc}</b><span>accuracy</span></div>
        <div><b>${st.bestStreak}</b><span>best streak</span></div>
      </div>
      ${next ? `<p class="hint">Next car: <b>${next.name}</b> · $${next.price.toLocaleString()}${isUnlocked(next.requires) ? '' : ` · unlocks with the ${leagueById(next.requires).name}`}</p>` : '<p class="hint good">You own every car.</p>'}`;
    window.drawCarPreview($('driver-car'), car);
    $('btn-garage').onclick = () => show('garage');
  }

  function renderLadder() {
    const box = $('ladder');
    box.innerHTML = '';
    window.LEAGUES.forEach((lg, i) => {
      const open = isUnlocked(lg.id);
      const wins = save.leagueWins[lg.id] || 0;
      const nextLg = window.LEAGUES[i + 1];
      const div = document.createElement('button');
      div.className = 'rung' + (open ? '' : ' locked') + (settings.league === lg.id ? ' on' : '');
      div.disabled = !open;
      let prog = '';
      if (!open) {
        const prev = window.LEAGUES[i - 1];
        const have = Math.min(save.leagueWins[prev.id] || 0, lg.winsToUnlock);
        prog = `<span class="lock">🔒 Win ${lg.winsToUnlock} ${prev.short} races (${have}/${lg.winsToUnlock})</span>`;
      } else if (nextLg) {
        const have = Math.min(wins, nextLg.winsToUnlock);
        prog = `<span class="pips">${Array.from({ length: nextLg.winsToUnlock }, (_, k) => `<i class="${k < have ? 'on' : ''}"></i>`).join('')}</span><span class="small">${have >= nextLg.winsToUnlock ? `${nextLg.short} unlocked` : `${have}/${nextLg.winsToUnlock} wins to unlock ${nextLg.short}`}</span>`;
      } else {
        const have = Math.min(wins, 3);
        prog = `<span class="pips">${[0, 1, 2].map((k) => `<i class="${k < have ? 'on' : ''}"></i>`).join('')}</span><span class="small">${have >= 3 ? '🏆 SAT Champion!' : `${have}/3 wins for the title`}</span>`;
      }
      div.innerHTML = `
        <span class="tier">T${lg.tier}</span>
        <span class="rbody">
          <span class="rname">${lg.name}</span>
          <span class="rinfo">Win $${lg.prizes[0]} · rivals ~${Math.round(((lg.rivalAcc[0] + lg.rivalAcc[1]) / 2) * 100)}% right</span>
          <span class="rprog">${prog}</span>
        </span>`;
      div.onclick = () => { settings.league = lg.id; save.league = lg.id; persist(); renderLadder(); renderStartHint(); };
      box.appendChild(div);
    });
  }

  function renderGoals() {
    const done = window.GOALS.filter((g) => save.goals.includes(g.id)).length;
    const nextGoals = window.GOALS.filter((g) => !save.goals.includes(g.id)).slice(0, 3);
    $('goals').innerHTML = `
      <div class="goalbar"><i style="width:${Math.round((done / window.GOALS.length) * 100)}%"></i><span>${done}/${window.GOALS.length} complete</span></div>
      ${window.GOALS.map((g) => {
        const ok = save.goals.includes(g.id);
        const up = nextGoals.includes(g);
        return `<div class="goal ${ok ? 'done' : up ? 'next' : 'later'}"><span class="gk">${ok ? '✓' : up ? '▸' : '·'}</span><span class="gt">${g.text}</span><span class="gr">$${g.reward}</span></div>`;
      }).join('')}`;
  }

  function renderStartHint() {
    const lg = leagueById(settings.league);
    $('start-hint').textContent = `${lg.name}: win pays $${lg.prizes[0]}, plus $${lg.perCorrect} per right answer.`;
  }

  function renderMenu() {
    renderDriver();
    renderLadder();
    renderGoals();
    renderStartHint();
    renderSourceHint();
    renderTop();
  }

  // ---------- Garage ----------
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
      const open = isUnlocked(car.requires);
      const div = document.createElement('div');
      div.className = 'car panel' + (selected ? ' selected' : '') + (!open && !owned ? ' locked' : '');
      div.innerHTML = `
        <div class="carstage"><canvas width="260" height="120"></canvas>${!open && !owned ? '<span class="lockover">🔒</span>' : ''}</div>
        <h3>${car.name}</h3>
        <p class="hint">${car.blurb}</p>
        ${statBar('Power', car.power, 1, 1.45)}
        ${statBar('Grip', car.grip, 1, 1.6)}
        ${statBar('Nitro', car.nitro, 5, 12)}
        <div class="car-actions"></div>`;
      const act = div.querySelector('.car-actions');
      const btn = document.createElement('button');
      if (selected) {
        btn.className = 'btn ghost';
        btn.innerHTML = '<span>Driving</span>';
        btn.disabled = true;
      } else if (owned) {
        btn.className = 'btn ghost';
        btn.innerHTML = '<span>Drive this</span>';
        btn.onclick = () => { save.car = car.id; persist(); renderGarage(); };
      } else if (!open) {
        btn.className = 'btn ghost';
        btn.innerHTML = `<span>Unlock the ${leagueById(car.requires).short} league</span>`;
        btn.disabled = true;
      } else {
        const afford = save.money >= car.price;
        btn.className = 'btn go';
        btn.innerHTML = `<span>Buy $${car.price.toLocaleString()}</span>`;
        btn.disabled = !afford;
        if (!afford) btn.title = `You need $${(car.price - save.money).toLocaleString()} more`;
        btn.onclick = () => {
          if (save.money < car.price) return;
          const before = save.money;
          save.money -= car.price;
          save.owned.push(car.id);
          save.car = car.id;
          persist();
          toast(`<b>New car!</b>${car.name} is in your garage.`, 'gold');
          goalToasts(checkGoals());
          renderTop(before);
          renderGarage();
        };
      }
      act.appendChild(btn);
      list.appendChild(div);
      window.drawCarPreview(div.querySelector('canvas'), car);
    }
    renderTop();
  }

  // ---------- Race ----------
  let race = null;
  let deck = null;
  let current = null;
  let qIndex = 0;
  let answered = false;
  let log = [];
  let qStart = 0;
  let raceOpts = null;
  let maxStreak = 0;

  async function startRace() {
    const btn = $('btn-start');
    btn.disabled = true;
    btn.innerHTML = '<span>Loading questions…</span>';
    raceOpts = { ...settings, length: Number(settings.length) };
    if (!isUnlocked(raceOpts.league)) raceOpts.league = 'rookie';
    try {
      const made = await window.Questions.createDeck(raceOpts, new Set(save.seen), avail);
      deck = made.deck;
      raceOpts.note = made.note;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Start race</span>';
    }
    if (race) race.stop();
    const lg = leagueById(raceOpts.league);
    race = new window.Race($('track'), { car: carById(save.car), league: lg, length: raceOpts.length });
    qIndex = 0;
    log = [];
    maxStreak = 0;
    show('race');
    $('hud-league').textContent = lg.name;
    resizeCanvas();
    race.start();
    // Load the first question during the start lights.
    clearQuestion('<p class="hint">Engines ready…</p>');
    const first = deck.next();
    race.countdown(async () => {
      current = await first;
      qIndex = 1;
      showQuestion();
    });
    updateHud();
  }
  $('btn-start').onclick = startRace;
  $('btn-quick').onclick = startRace;
  $('btn-again').onclick = () => { show('menu'); startRace(); };
  $('btn-results-garage').onclick = () => show('garage');
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
  }
  window.addEventListener('resize', () => { if ($('screen-race').classList.contains('active')) resizeCanvas(); });

  function updateHud() {
    const done = log.length;
    const right = log.filter((l) => l.correct).length;
    $('hud-place').textContent = `P${race.place()}`;
    $('hud-q').textContent = `${Math.max(1, Math.min(qIndex, raceOpts.length))}/${raceOpts.length}`;
    $('hud-streak').textContent = race.player.streak ? `🔥${race.player.streak}` : '0';
    $('hud-acc').textContent = done ? `${Math.round((right / done) * 100)}%` : '–';
  }

  const DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };

  function clearQuestion(stemHtml) {
    $('q-feedback').innerHTML = '';
    $('q-feedback').className = 'feedback';
    $('q-choices').innerHTML = '';
    $('q-stem').innerHTML = stemHtml || '';
    $('q-stimulus').innerHTML = '';
    $('q-stimulus').style.display = 'none';
    $('q-spr').style.display = 'none';
    $('qmeta').innerHTML = '';
  }

  async function nextQuestion() {
    if (qIndex >= raceOpts.length) return finishRace();
    answered = false;
    qIndex++;
    $('qpanel').classList.add('loading');
    clearQuestion('<p class="hint">Loading question…</p>');
    updateHud();
    current = await deck.next();
    showQuestion();
  }

  function showQuestion() {
    answered = false;
    $('qpanel').classList.remove('loading');
    renderQuestion(current);
    updateHud();
    qStart = performance.now();
  }

  function renderQuestion(q) {
    const S = window.Questions.sanitize;
    const src = q.source === 'College Board' ? 'College Board' : 'Original practice';
    $('qmeta').innerHTML = `<span class="qnum">Q${qIndex}</span><span class="tag">${q.section}</span><span class="tag">${q.domain || ''}</span>${q.skill ? `<span class="tag subtle">${q.skill}</span>` : ''}<span class="tag diff-${q.difficulty}">${DIFF[q.difficulty] || q.difficulty}</span><span class="tag subtle">${src}</span>`;
    if (raceOpts.note && qIndex === 1) $('qmeta').innerHTML += `<p class="note">${raceOpts.note}</p>`;
    $('q-stimulus').innerHTML = S(q.stimulus);
    $('q-stimulus').style.display = q.stimulus ? '' : 'none';
    $('q-stem').innerHTML = S(q.stem);
    const box = $('q-choices');
    box.innerHTML = '';
    if (q.type === 'mcq') {
      $('q-spr').style.display = 'none';
      q.choices.forEach((ch) => {
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

    if (q.type === 'mcq') {
      document.querySelectorAll('#q-choices .choice').forEach((b) => {
        b.disabled = true;
        if (b.dataset.letter === q.answer) b.classList.add('right');
        else if (b.dataset.letter === choice) b.classList.add('wrong');
      });
    } else {
      $('q-spr-input').disabled = true;
    }

    const placeBefore = race.place();
    const gain = race.step(correct);
    const streak = race.player.streak;
    maxStreak = Math.max(maxStreak, streak);
    if (streak > save.stats.bestStreak) save.stats.bestStreak = streak;
    persist();
    flash(correct);
    const placeAfter = race.place();
    const moved = placeAfter < placeBefore ? ` · <b>overtake!</b> up to P${placeAfter}` : placeAfter > placeBefore ? ` · dropped to P${placeAfter}` : '';
    const msg = correct
      ? `<b>${streak >= 3 ? 'NITRO!' : 'Correct!'}</b> +${Math.round(gain)}m${streak >= 2 ? ` · streak ${streak} 🔥` : ''}${moved}`
      : `<b>Spun out!</b> ${q.type === 'mcq' ? `The answer is <b>${q.answer}</b>.` : `Accepted answer${q.answer.length > 1 ? 's' : ''}: <b>${q.answer.join(', ')}</b>.`}${moved}`;
    const last = qIndex >= raceOpts.length;
    const fb = $('q-feedback');
    fb.className = 'feedback ' + (correct ? 'good' : 'bad');
    fb.innerHTML = `
      <div class="fb-row"><div>${msg}</div>
      <button class="btn go small" id="btn-next"><span>${last ? 'Final sprint 🏁' : 'Next question →'}</span></button></div>
      ${q.rationale ? `<details ${correct ? '' : 'open'}><summary>Explanation</summary><div class="rationale">${window.Questions.sanitize(q.rationale)}</div></details>` : ''}`;
    $('btn-next').onclick = nextQuestion;
    setTimeout(updateHud, 2300);
    updateHud();
    const r = fb.getBoundingClientRect();
    if (r.bottom > window.innerHeight) window.scrollBy({ top: Math.min(r.bottom - window.innerHeight + 16, r.top - 300), behavior: 'smooth' });
  }

  function flash(good) {
    const f = $('flash');
    f.className = 'flash ' + (good ? 'good' : 'bad');
    void f.offsetWidth;
    f.classList.add('show');
  }

  document.addEventListener('keydown', (e) => {
    if (!$('screen-race').classList.contains('active')) return;
    if (e.target.tagName === 'INPUT') return;
    if (!answered && current && qIndex > 0 && current.type === 'mcq') {
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
    clearQuestion('<p class="sprint">🏁 Final sprint!</p>');
    const place = race.place();
    race.sprint(() => setTimeout(() => showResults(place), 500));
  }

  function showResults(place) {
    const lg = leagueById(raceOpts.league);
    const right = log.filter((l) => l.correct).length;
    const prize = lg.prizes[place - 1] || 0;
    const bonus = right * lg.perCorrect;
    const before = save.money;
    const unlockedBefore = window.LEAGUES.filter((l) => isUnlocked(l.id)).map((l) => l.id);
    const carsBefore = window.CARS.filter((c) => isUnlocked(c.requires)).map((c) => c.id);
    const lvlBefore = levelInfo(save.xp).lvl;
    const xp = right * 10 + PLACE_XP[place - 1] + maxStreak * 3;

    save.money += prize + bonus;
    save.xp += xp;
    save.stats.races++;
    save.stats.earned += prize + bonus;
    if (place === 1) { save.stats.wins++; save.leagueWins[lg.id] = (save.leagueWins[lg.id] || 0) + 1; }
    if (place <= 3) save.stats.podiums++;
    if (right === log.length && log.length) save.stats.perfect++;
    persist();
    const goals = checkGoals();

    const newLeagues = window.LEAGUES.filter((l) => isUnlocked(l.id) && !unlockedBefore.includes(l.id));
    const newCars = window.CARS.filter((c) => isUnlocked(c.requires) && !carsBefore.includes(c.id));
    const L = levelInfo(save.xp);

    const order = race.standings();
    const podiumOrder = [1, 0, 2, 3].filter((i) => order[i]);
    $('podium').innerHTML = podiumOrder
      .map((i) => { const c = order[i]; return `<div class="pod p${i + 1} ${c.you ? 'you' : ''}"><span class="dot" style="background:${c.color}"></span><span class="pname">${c.you ? 'You' : c.name}</span><span class="step">${i + 1}</span></div>`; })
      .join('');
    $('result-league').textContent = lg.name;
    const titles = ['🏆 Victory!', '🥈 Second place', '🥉 Third place', 'Fourth place'];
    $('result-title').textContent = titles[place - 1];
    $('result-sub').textContent = `${right} of ${log.length} right (${Math.round((right / log.length) * 100)}%) · best streak ${maxStreak}.` +
      (place === 1 ? '' : place === 4 ? ' Every right answer is speed. Go again!' : ' So close. Streaks are where the speed is.');

    const goalCash = goals.reduce((a, g) => a + g.reward, 0);
    $('payout').innerHTML = `
      <h3>Prize money</h3>
      <div><span>${ORD[place - 1]} place</span><b>$${prize}</b></div>
      <div><span>${right} right × $${lg.perCorrect}</span><b>$${bonus}</b></div>
      ${goals.map((g) => `<div class="goalrow"><span>Goal: ${g.text}</span><b>$${g.reward}</b></div>`).join('')}
      <div class="total"><span>Total</span><b>$${prize + bonus + goalCash}</b></div>`;

    const nextLg = window.LEAGUES[leagueIndex(lg.id) + 1];
    let ladderLine = '';
    if (nextLg) {
      const have = Math.min(save.leagueWins[lg.id] || 0, nextLg.winsToUnlock);
      ladderLine = isUnlocked(nextLg.id)
        ? `<p>${nextLg.name} is open.</p>`
        : `<p>${nextLg.name}: <b>${have}/${nextLg.winsToUnlock}</b> wins</p><div class="pips big">${Array.from({ length: nextLg.winsToUnlock }, (_, k) => `<i class="${k < have ? 'on' : ''}"></i>`).join('')}</div>`;
    } else {
      const have = Math.min(save.leagueWins.champ || 0, 3);
      ladderLine = `<p>SAT Champion title: <b>${have}/3</b> wins</p><div class="pips big">${[0, 1, 2].map((k) => `<i class="${k < have ? 'on' : ''}"></i>`).join('')}</div>`;
    }
    $('progress-box').innerHTML = `
      <h3>Career</h3>
      <p>+${xp} XP${L.lvl > lvlBefore ? ` · <b class="up">Level up! LV ${L.lvl} ${rankName(L.lvl)}</b>` : ''}</p>
      <div class="xpbar"><i style="width:${Math.round((L.into / L.need) * 100)}%"></i></div>
      <p class="hint">LV ${L.lvl} · ${L.into}/${L.need} XP</p>
      ${ladderLine}
      ${newLeagues.map((l) => `<div class="unlock">🔓 <b>${l.name} unlocked!</b> Bigger prizes, faster rivals.</div>`).join('')}
      ${newCars.map((c) => `<div class="unlock">🚗 <b>${c.name}</b> is now for sale in the garage.</div>`).join('')}
      ${nextCarHint()}`;
    renderReview();
    show('results');
    renderTop(before);
    race.stop();
    if (place === 1) confetti();
  }

  function nextCarHint() {
    const next = window.CARS.find((c) => !save.owned.includes(c.id) && isUnlocked(c.requires));
    if (!next) return '';
    if (save.money >= next.price) return `<p class="hint good">You can afford the <b>${next.name}</b>. Hit the garage!</p>`;
    return `<p class="hint">$${(next.price - save.money).toLocaleString()} more for the <b>${next.name}</b>.</p>`;
  }

  function confetti() {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#facc15', '#ff2d2d', '#22e06b', '#38bdf8', '#fff'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = Math.random() * 0.6 + 's';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3500);
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
  goalToasts(checkGoals());
  renderMenu();
  window.Questions.detect().then((a) => {
    avail = a;
    renderSourceHint();
  });
})();
