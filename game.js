/* =====================================================================
   Twin Tank Dive: game logic, scoring, live questions, visuals, sound,
   storage. Plain JavaScript, no libraries, no build step.

   Sections in this file:
     1. CONFIG            every number the game uses
     2. Skill lookups     built from skills.js
     3. Scoring engine    pure functions (also used by test.js)
     4. Mission selection
     5. Dive records      logging results, finishing a dive
     6. Storage           localStorage, export / import
     7. College Board     live questions fetched by the browser
     8. Sound             Web Audio
     9. Scene             the underwater canvas
    10. Screens           start, dive, end, skill map, history
   ===================================================================== */
(function (root) {
"use strict";

var IS_NODE = typeof module !== "undefined" && module.exports;
var SECTIONS = IS_NODE ? require("./skills.js") : root.SAT_SKILLS;

/* =====================================================================
   1. CONFIG
   ===================================================================== */
var CONFIG = {
  // Tier ladder, lowest to highest.
  tiers: [
    { name: "Plankton", points: 10 },
    { name: "Shrimp", points: 25 },
    { name: "Krill", points: 40 },
    { name: "Squid", points: 60 },
    { name: "Anglerfish", points: 80 },
    { name: "One in a Krillion", points: 100 },
  ],
  // Where a correct answer starts on the ladder (index into tiers).
  baseTier: { easy: 0, medium: 2, hard: 4 },
  // Each bonus moves the answer up one tier.
  bonuses: {
    weakSpot: { label: "Weak spot", maxAccuracy: 0.5, minAttempts: 3 },
    crossCurrent: { label: "Cross-current" },
    noChoices: { label: "No choices" },
  },
  // A dive: missions 1-6 alternate sections, mission 7 is the boss.
  missionOrder: ["math", "rw", "math", "rw", "math", "rw", "boss"],
  boss: {
    bothPoints: 100,          // both parts correct: split evenly between the tanks
    onePoints: 50,            // one part correct: goes to that part's tank
    partA: { section: "rw", skillId: "rw-ii-coe-quant", difficulty: "hard" },
    partB: { section: "math", domainId: "m-psda", difficulty: "hard" },
  },
  finalMultiplier: 2,         // final score = 2 x the lower tank
  tankMax: 350,               // the most one tank can hold in a dive (gauge scale)
  selection: {
    weakChance: 0.5,          // how often a mission targets a weak skill
    weakPoolSize: 3,          // "weakest skills" = this many lowest-accuracy skills
    rampAfterDives: 5,        // after this many dives...
    rampAccuracy: 0.8,        // ...skills above this accuracy get harder questions
    rampMinAttempts: 3,
    rampMediumToHardChance: 0.5,
  },
  // Depth zones, by Engine points.
  zones: [
    { name: "Sunlit Reef", at: 0, top: "#37bfe0", bottom: "#0c78a8", dark: 0 },
    { name: "Kelp Forest", at: 50, top: "#17909c", bottom: "#0a5568", dark: 0.22 },
    { name: "Twilight Zone", at: 110, top: "#0b3f66", bottom: "#061f3d", dark: 0.6 },
    { name: "Midnight Zone", at: 180, top: "#05152d", bottom: "#020916", dark: 0.86 },
    { name: "Abyssal Trench", at: 260, top: "#02060f", bottom: "#000205", dark: 0.96 },
  ],
  bankUrl: "https://satsuite.collegeboard.org/practice/student-question-bank",
  storageKey: "twinTankDive.v1",
};

var DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
var DIFF_CODE = { easy: "E", medium: "M", hard: "H" };

/* =====================================================================
   2. SKILL LOOKUPS
   ===================================================================== */
var SECTION = {}, DOMAIN = {}, SKILL = {};
SECTIONS.forEach(function (sec) {
  SECTION[sec.id] = sec;
  sec.domains.forEach(function (d) {
    DOMAIN[d.id] = { id: d.id, name: d.name, code: d.code, section: sec.id, skills: d.skills };
    d.skills.forEach(function (s) {
      SKILL[s.id] = { id: s.id, name: s.name, aliases: s.aliases || [], domain: d.id, section: sec.id };
    });
  });
});
function skillsOf(sectionId) {
  var out = [];
  SECTION[sectionId].domains.forEach(function (d) { d.skills.forEach(function (s) { out.push(SKILL[s.id]); }); });
  return out;
}
function tankOf(sectionId) { return SECTION[sectionId].tank; }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

/* =====================================================================
   3. SCORING ENGINE
   ===================================================================== */
// m:   { section, difficulty, correct, noChoices }
// ctx: { skillStat: {a, c} before this answer, prev: {correct, section} | null }
function scoreMission(m, ctx) {
  ctx = ctx || {};
  var out = { tank: tankOf(m.section), points: 0, tier: -1, base: -1, bonuses: [], capped: false };
  if (!m.correct) return out;
  out.base = CONFIG.baseTier[m.difficulty];
  var st = ctx.skillStat, w = CONFIG.bonuses.weakSpot;
  if (st && st.a >= w.minAttempts && st.c / st.a < w.maxAccuracy) out.bonuses.push("weakSpot");
  if (ctx.prev && ctx.prev.correct && ctx.prev.section && ctx.prev.section !== m.section) out.bonuses.push("crossCurrent");
  if (m.section === "math" && m.noChoices) out.bonuses.push("noChoices");
  var top = CONFIG.tiers.length - 1, raw = out.base + out.bonuses.length;
  out.capped = raw > top;
  out.tier = Math.min(raw, top);
  out.points = CONFIG.tiers[out.tier].points;
  return out;
}

// Part A is Reading & Writing (Light), part B is Math (Engine).
function scoreBoss(aCorrect, bCorrect) {
  var b = CONFIG.boss, out = { engine: 0, light: 0, points: 0, tier: -1 };
  if (aCorrect && bCorrect) { out.engine = out.light = b.bothPoints / 2; out.points = b.bothPoints; out.tier = CONFIG.tiers.length - 1; }
  else if (aCorrect) { out.light = out.points = b.onePoints; }
  else if (bCorrect) { out.engine = out.points = b.onePoints; }
  return out;
}

function finalScore(engine, light) { return CONFIG.finalMultiplier * Math.min(engine, light); }

/* =====================================================================
   4. MISSION SELECTION
   ===================================================================== */
// Small seeded random generator, so the Daily Dive is the same all day.
function seeded(text) {
  var h = 1779033703 ^ text.length;
  for (var i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  var a = h >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rng) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function stat(state, skillId) { return state.skills[skillId] || { a: 0, c: 0 }; }

// About half the time: one of the weakest skills. Otherwise: a skill with the fewest attempts.
function pickSkill(sectionId, state, rng, exclude) {
  exclude = exclude || [];
  var sel = CONFIG.selection;
  var all = skillsOf(sectionId).filter(function (s) { return exclude.indexOf(s.id) < 0; });
  if (!all.length) all = skillsOf(sectionId);
  var tried = all.filter(function (s) { return stat(state, s.id).a > 0; });
  var pool;
  if (tried.length && rng() < sel.weakChance) {
    tried.sort(function (x, y) {
      var sx = stat(state, x.id), sy = stat(state, y.id);
      return sx.c / sx.a - sy.c / sy.a || sy.a - sx.a || (x.id < y.id ? -1 : 1);
    });
    pool = tried.slice(0, sel.weakPoolSize);
  } else {
    var min = Math.min.apply(null, all.map(function (s) { return stat(state, s.id).a; }));
    pool = all.filter(function (s) { return stat(state, s.id).a === min; });
  }
  return pool[Math.floor(rng() * pool.length)].id;
}

// After enough dives, strong skills shift toward medium and hard.
function rampDifficulty(diff, skillId, state, rng) {
  var sel = CONFIG.selection, st = stat(state, skillId);
  if (state.divesCompleted < sel.rampAfterDives) return diff;
  if (st.a < sel.rampMinAttempts || st.c / st.a <= sel.rampAccuracy) return diff;
  if (diff === "easy") return "medium";
  if (diff === "medium" && rng() < sel.rampMediumToHardChance) return "hard";
  return diff;
}

function buildDive(state, mode, dateStr, rng) {
  rng = rng || (mode === "daily" ? seeded("twin-tank-dive " + dateStr) : Math.random);
  var diffs = { math: shuffle(["easy", "medium", "hard"], rng), rw: shuffle(["easy", "medium", "hard"], rng) };
  var used = [], count = { math: 0, rw: 0 };
  var missions = CONFIG.missionOrder.map(function (type) {
    if (type === "boss") return { type: "boss" };
    var skillId = pickSkill(type, state, rng, used);
    used.push(skillId);
    var diff = rampDifficulty(diffs[type][count[type]++ % 3], skillId, state, rng);
    return { type: type, skillId: skillId, difficulty: diff };
  });
  return { mode: mode, date: dateStr, missions: missions, index: 0, engine: 0, light: 0, results: [], boss: { a: null, b: null } };
}

// "Change skill": a different skill in the same section, same difficulty.
function changeSkill(state, dive, rng) {
  var m = dive.missions[dive.index];
  if (!m || m.type === "boss") return false;
  var taken = dive.missions.filter(function (x) { return x.skillId; }).map(function (x) { return x.skillId; });
  var next = pickSkill(m.type, state, rng || Math.random, taken);
  if (next === m.skillId) {
    var others = skillsOf(m.type).filter(function (s) { return s.id !== m.skillId; });
    next = others[Math.floor((rng || Math.random)() * others.length)].id;
  }
  m.skillId = next; delete m.qid; delete m.reveal;
  return true;
}

/* =====================================================================
   5. DIVE RECORDS
   The only things ever stored about a question: its ID, section,
   domain, skill, difficulty and the player's result.
   ===================================================================== */
function newState() {
  return { v: 1, best: 0, streak: { count: 0, last: null }, dailyDone: null, divesCompleted: 0, skills: {}, log: [], dive: null, muted: false };
}
function normId(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, "").toLowerCase(); }
function isLogged(state, id) {
  id = normId(id);
  return state.log.some(function (e) { return e.id === id; });
}
function checkId(state, raw) {
  var id = normId(raw);
  if (!id) return { error: "Enter the Question ID first." };
  if (id.length > 40) return { error: "That Question ID is too long." };
  if (isLogged(state, id)) return { error: "You already logged question " + id + ". Pick a different one." };
  return { id: id };
}
function addLog(state, id, section, domainId, skillId, difficulty, correct, dateStr) {
  state.log.push({ id: id, section: section, domain: domainId, skill: skillId || null, difficulty: difficulty, correct: !!correct, date: dateStr });
  if (skillId && SKILL[skillId]) {
    var st = state.skills[skillId] || (state.skills[skillId] = { a: 0, c: 0 });
    st.a++; if (correct) st.c++;
  }
}

// input: { qid, correct, noChoices, skillId? (if the question turned out to be a different skill) }
function recordMission(state, dive, input, dateStr) {
  var m = dive.missions[dive.index];
  if (!m || m.type === "boss") return { error: "Not a regular mission." };
  var chk = checkId(state, input.qid);
  if (chk.error) return chk;
  var skillId = input.skillId && SKILL[input.skillId] && SKILL[input.skillId].section === m.type ? input.skillId : m.skillId;
  var prev = dive.results[dive.index - 1] || null;
  var s = scoreMission(
    { section: m.type, difficulty: m.difficulty, correct: !!input.correct, noChoices: !!input.noChoices },
    { skillStat: stat(state, skillId), prev: prev && { correct: prev.correct, section: prev.section } }
  );
  addLog(state, chk.id, m.type, SKILL[skillId].domain, skillId, m.difficulty, input.correct, dateStr);
  dive[s.tank] += s.points;
  var res = { n: dive.index + 1, type: m.type, section: m.type, skillId: skillId, difficulty: m.difficulty, qid: chk.id,
    correct: !!input.correct, points: s.points, tier: s.tier, base: s.base, bonuses: s.bonuses, capped: s.capped, tank: s.tank };
  dive.results.push(res);
  dive.index++;
  return res;
}

// Call once for part A, then once for part B. input: { qid, correct, skillId? }
function recordBossPart(state, dive, input, dateStr) {
  var m = dive.missions[dive.index];
  if (!m || m.type !== "boss") return { error: "Not the boss mission." };
  var chk = checkId(state, input.qid);
  if (chk.error) return chk;
  var b = CONFIG.boss;
  if (dive.boss.a === null) {
    var sa = input.skillId && SKILL[input.skillId] && SKILL[input.skillId].section === "rw" ? input.skillId : b.partA.skillId;
    addLog(state, chk.id, "rw", SKILL[sa].domain, sa, b.partA.difficulty, input.correct, dateStr);
    dive.boss.a = !!input.correct; dive.boss.qidA = chk.id;
    return { part: "a", correct: !!input.correct };
  }
  var sb = input.skillId && SKILL[input.skillId] && SKILL[input.skillId].domain === b.partB.domainId ? input.skillId : null;
  addLog(state, chk.id, "math", b.partB.domainId, sb, b.partB.difficulty, input.correct, dateStr);
  dive.boss.b = !!input.correct; dive.boss.qidB = chk.id;
  var s = scoreBoss(dive.boss.a, dive.boss.b);
  dive.engine += s.engine; dive.light += s.light;
  var res = { n: dive.index + 1, type: "boss", a: dive.boss.a, b: dive.boss.b, correct: dive.boss.a && dive.boss.b,
    points: s.points, engine: s.engine, light: s.light, tier: s.tier, bonuses: [] };
  dive.results.push(res);
  dive.index++;
  return { part: "b", correct: !!input.correct, boss: res, summary: finishDive(state, dive, dateStr) };
}

function dayBefore(dateStr) {
  var p = dateStr.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] - 1);
  return fmtDate(d);
}
function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 101).slice(1) + "-" + String(d.getDate() + 100).slice(1);
}
function currentStreak(state, today) {
  var s = state.streak;
  return s.last === today || s.last === dayBefore(today) ? s.count : 0;
}

function finishDive(state, dive, today) {
  var final = finalScore(dive.engine, dive.light);
  var newBest = final > state.best;
  if (newBest) state.best = final;
  state.divesCompleted++;
  if (dive.mode === "daily") {
    if (state.streak.last !== today) {
      state.streak.count = state.streak.last === dayBefore(today) ? state.streak.count + 1 : 1;
      state.streak.last = today;
    }
    state.dailyDone = today;
  }
  state.dive = null;
  return { mode: dive.mode, engine: dive.engine, light: dive.light, final: final, newBest: newBest, results: dive.results, tip: buildTip(state, dive) };
}

function buildTip(state, dive) {
  var parts = [];
  if (dive.engine < dive.light) parts.push("Your Engine (Math) was the weaker tank, " + dive.engine + " to " + dive.light + ", so Math set your score.");
  else if (dive.light < dive.engine) parts.push("Your Light (Reading & Writing) was the weaker tank, " + dive.light + " to " + dive.engine + ", so Reading & Writing set your score.");
  else parts.push("Both tanks finished level at " + dive.engine + ".");
  var worst = null, missed = 0;
  Object.keys(state.skills).forEach(function (id) {
    var st = state.skills[id], miss = st.a - st.c;
    if (SKILL[id] && miss > missed) { missed = miss; worst = id; }
  });
  if (worst) parts.push("The skill you've missed most is " + SKILL[worst].name + " (" + missed + " missed of " + state.skills[worst].a + ").");
  else parts.push("You haven't missed a question in any skill yet.");
  return parts.join(" ");
}

// Typed-answer check: any accepted answer, compared as text and then as a number.
function parseNumber(s) {
  s = String(s).replace(/\s+/g, "").replace(/,/g, "").replace(/^\+/, "");
  var m = /^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/.exec(s);
  if (m) return +m[2] === 0 ? NaN : +m[1] / +m[2];
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? +s : NaN;
}
function checkTyped(input, accepted) {
  var mine = String(input || "").replace(/\s+/g, "").toLowerCase();
  if (!mine) return false;
  var x = parseNumber(mine);
  return (accepted || []).some(function (a) {
    var t = String(a).replace(/\s+/g, "").toLowerCase();
    if (t === mine) return true;
    var y = parseNumber(t);
    return !isNaN(x) && !isNaN(y) && Math.abs(x - y) <= 0.0006 * Math.max(1, Math.abs(y));
  });
}

// Which rows of College Board's question list fit a mission.
// list rows: { questionId, section, skill, domainCode, domainName, difficulty: "E"|"M"|"H" }
// target: { section, skillId | domainId, difficulty }
function rowsFor(list, target, state) {
  var sec = list.filter(function (r) { return r.section === target.section; });
  var fit = [], loose = false, dom;
  if (target.skillId) {
    var sk = SKILL[target.skillId];
    fit = sec.filter(function (r) { return norm(r.skill) === norm(sk.name); });
    if (!fit.length) {
      var al = sk.aliases.map(norm);
      fit = sec.filter(function (r) { return al.indexOf(norm(r.skill)) >= 0; });
    }
    dom = DOMAIN[sk.domain];
  } else dom = DOMAIN[target.domainId];
  if (!fit.length) {
    if (target.skillId) loose = true;
    fit = sec.filter(function (r) { return r.domainCode === dom.code || norm(r.domainName) === norm(dom.name); });
  }
  if (!fit.length) { loose = true; fit = sec; }
  var code = DIFF_CODE[target.difficulty];
  return { loose: loose, pool: fit.filter(function (r) { return r.difficulty === code && !isLogged(state, r.questionId); }) };
}
// The game skill a College Board row belongs to (or null).
function skillOfRow(row, preferId) {
  var n = norm(row.skill), ids = Object.keys(SKILL).filter(function (id) { return SKILL[id].section === row.section; });
  var exact = ids.filter(function (id) { return norm(SKILL[id].name) === n; });
  if (exact.length) return exact[0];
  var alias = ids.filter(function (id) { return SKILL[id].aliases.map(norm).indexOf(n) >= 0; });
  if (alias.indexOf(preferId) >= 0) return preferId;
  return alias[0] || null;
}

/* =====================================================================
   6. STORAGE
   ===================================================================== */
function num(x) { x = Number(x); return isFinite(x) && x > 0 ? Math.floor(x) : 0; }
function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

// Rebuilds a save from untrusted data (localStorage or an imported file).
function cleanState(o) {
  var s = newState();
  if (!o || typeof o !== "object") return s;
  s.best = num(o.best); s.divesCompleted = num(o.divesCompleted); s.muted = !!o.muted;
  s.dailyDone = isDate(o.dailyDone) ? o.dailyDone : null;
  if (o.streak && typeof o.streak === "object") s.streak = { count: num(o.streak.count), last: isDate(o.streak.last) ? o.streak.last : null };
  var seen = {};
  (Array.isArray(o.log) ? o.log : []).forEach(function (e) {
    if (!e || typeof e !== "object") return;
    var id = normId(e.id).slice(0, 40);
    if (!id || seen[id] || !SECTION[e.section]) return;
    seen[id] = 1;
    s.log.push({ id: id, section: e.section, domain: DOMAIN[e.domain] ? e.domain : null, skill: SKILL[e.skill] ? e.skill : null,
      difficulty: DIFF_LABEL[e.difficulty] ? e.difficulty : "medium", correct: !!e.correct, date: isDate(e.date) ? e.date : null });
  });
  var sk = o.skills && typeof o.skills === "object" ? o.skills : {};
  Object.keys(SKILL).forEach(function (id) {
    if (sk[id] && typeof sk[id] === "object") { var a = num(sk[id].a); if (a) s.skills[id] = { a: a, c: Math.min(a, num(sk[id].c)) }; }
  });
  s.dive = cleanDive(o.dive);
  return s;
}
function cleanDive(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.missions) || d.missions.length !== CONFIG.missionOrder.length) return null;
  var ok = d.missions.every(function (m, i) {
    var type = CONFIG.missionOrder[i];
    return m && m.type === type && (type === "boss" || (SKILL[m.skillId] && SKILL[m.skillId].section === type && DIFF_LABEL[m.difficulty]));
  });
  var index = num(d.index);
  if (!ok || index >= d.missions.length || !Array.isArray(d.results) || d.results.length !== index) return null;
  return {
    mode: d.mode === "daily" ? "daily" : "free", date: isDate(d.date) ? d.date : null, index: index,
    engine: num(d.engine), light: num(d.light),
    missions: d.missions.map(function (m) {
      if (m.type === "boss") return { type: "boss" };
      var x = { type: m.type, skillId: m.skillId, difficulty: m.difficulty };
      if (typeof m.qid === "string") x.qid = normId(m.qid).slice(0, 40);
      if (m.reveal === "solved" || m.reveal === "peek") x.reveal = m.reveal;
      return x;
    }),
    results: d.results.map(function (r) {
      r = r || {};
      return { n: num(r.n), type: r.type === "boss" ? "boss" : r.type === "math" ? "math" : "rw", section: r.section === "math" ? "math" : r.section === "rw" ? "rw" : null,
        skillId: SKILL[r.skillId] ? r.skillId : null, difficulty: DIFF_LABEL[r.difficulty] ? r.difficulty : null, qid: normId(r.qid).slice(0, 40),
        correct: !!r.correct, a: !!r.a, b: !!r.b, points: num(r.points), engine: num(r.engine), light: num(r.light),
        tier: Math.min(CONFIG.tiers.length - 1, Math.max(-1, Math.floor(Number(r.tier)) || 0)), base: Math.max(-1, Math.floor(Number(r.base)) || 0),
        bonuses: (Array.isArray(r.bonuses) ? r.bonuses : []).filter(function (b) { return CONFIG.bonuses[b]; }), capped: !!r.capped,
        tank: r.tank === "engine" ? "engine" : "light" };
    }),
    boss: { a: d.boss && typeof d.boss.a === "boolean" ? d.boss.a : null, b: null,
      qidA: d.boss && typeof d.boss.qidA === "string" ? normId(d.boss.qidA).slice(0, 40) : undefined,
      pinA: d.boss && typeof d.boss.pinA === "string" ? normId(d.boss.pinA).slice(0, 40) : undefined,
      pinB: d.boss && typeof d.boss.pinB === "string" ? normId(d.boss.pinB).slice(0, 40) : undefined },
  };
}

var Core = {
  CONFIG: CONFIG, SECTION: SECTION, DOMAIN: DOMAIN, SKILL: SKILL, skillsOf: skillsOf,
  scoreMission: scoreMission, scoreBoss: scoreBoss, finalScore: finalScore,
  seeded: seeded, pickSkill: pickSkill, rampDifficulty: rampDifficulty, buildDive: buildDive, changeSkill: changeSkill,
  newState: newState, cleanState: cleanState, normId: normId, isLogged: isLogged,
  recordMission: recordMission, recordBossPart: recordBossPart, finishDive: finishDive, currentStreak: currentStreak,
  checkTyped: checkTyped, rowsFor: rowsFor, skillOfRow: skillOfRow, fmtDate: fmtDate,
};
if (IS_NODE) { module.exports = Core; return; }
root.TwinTankDive = Core;

/* ---------------------------------------------------------------------
   Everything below needs a browser.
   --------------------------------------------------------------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function today() { return fmtDate(new Date()); }

var state = newState();
var Store = {
  load: function () {
    try { state = cleanState(JSON.parse(localStorage.getItem(CONFIG.storageKey))); } catch (e) { state = newState(); }
  },
  save: function () {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); } catch (e) { /* private window: play without saving */ }
  },
};

/* =====================================================================
   7. COLLEGE BOARD LIVE QUESTIONS
   The player's own browser asks the public endpoints behind College
   Board's question bank for one question at a time. Question text is
   shown and then forgotten: it is never saved, here or anywhere else.
   If the browser can't reach College Board, the game falls back to
   "answer on College Board's site and log the result here".
   ===================================================================== */
var CB_API = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank";
var CB_DISCLOSED = "https://saic.collegeboard.org/disclosed";
var CB_EVENT = 99; // 99 = SAT

var CB = {
  state: "checking", // checking | ready | failed
  plain: false, list: null, log: [], waiters: [],

  request: function (url, body, ms, plain) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    var opt = { signal: ctl.signal };
    if (body) { opt.method = "POST"; opt.body = JSON.stringify(body); opt.headers = { "content-type": plain ? "text/plain" : "application/json" }; }
    return fetch(url, opt).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).finally(function () { clearTimeout(timer); });
  },

  loadList: function () {
    var self = this, all = [];
    var jobs = SECTIONS.map(function (sec) {
      var codes = sec.domains.map(function (d) { return d.code; }).join(",");
      return self.request(CB_API + "/digital/get-questions", { asmtEventId: CB_EVENT, test: sec.test, domain: codes }, 30000, self.plain).then(function (rows) {
        if (!Array.isArray(rows)) throw new Error("unexpected reply");
        rows.forEach(function (r) {
          if (!r || !r.questionId) return;
          all.push({ section: sec.id, questionId: normId(r.questionId), externalId: r.external_id || null, ibn: r.ibn || null,
            difficulty: String(r.difficulty || "M").toUpperCase().charAt(0), skill: r.skill_desc || "", domainCode: r.primary_class_cd || "", domainName: r.primary_class_cd_desc || "" });
        });
      });
    });
    return Promise.all(jobs).then(function () {
      if (!all.length) throw new Error("no questions returned");
      return all;
    });
  },

  // Try a normal request first, then a "simple" one that skips the browser's pre-check.
  detect: function () {
    var self = this;
    self.state = "checking"; self.log = [];
    function attempt(plain) {
      self.plain = plain;
      return self.loadList().then(function (list) { self.list = list; self.state = "ready"; }, function (e) {
        self.log.push((plain ? "simple request: " : "request: ") + (e.name === "TypeError" ? "blocked by the browser" : e.name === "AbortError" ? "no answer in time" : e.message));
        if (!plain) return attempt(true);
        self.state = "failed";
      });
    }
    return attempt(false).then(function () {
      self.waiters.splice(0).forEach(function (fn) { fn(); });
    });
  },
  whenChecked: function (fn) { if (this.state === "checking") this.waiters.push(fn); else fn(); },

  // College Board's reply -> the game's question (or null if it can't be used).
  normalize: function (row, raw) {
    var q = { qid: row.questionId, row: row, type: "mcq" };
    if (row.externalId) {
      var type = String(raw.type || "").toLowerCase();
      var correct = Array.isArray(raw.correct_answer) ? raw.correct_answer : [raw.correct_answer];
      q.passage = sanitize(raw.stimulus); q.stem = sanitize(raw.stem); q.rationale = sanitize(raw.rationale);
      if (type === "spr") {
        q.type = "spr";
        q.accepted = correct.filter(function (x) { return x != null && String(x).trim(); }).map(function (x) { return textOf(String(x)); });
        if (!q.accepted.length) return null;
      } else {
        var opts = Array.isArray(raw.answerOptions) ? raw.answerOptions : [];
        q.choices = opts.map(function (o) { return sanitize(o && o.content); });
        q.answer = String(correct[0] || "").trim().toUpperCase();
      }
    } else {
      var item = Array.isArray(raw) ? raw[0] : raw, ans = (item && item.answer) || {};
      var keys = ans.choices && typeof ans.choices === "object" ? Object.keys(ans.choices) : [];
      q.passage = sanitize(item && item.body); q.stem = sanitize(item && item.prompt); q.rationale = sanitize(ans.rationale);
      q.choices = keys.map(function (k) { return sanitize(ans.choices[k] && ans.choices[k].body); });
      q.answer = String(ans.correct_choice || "").trim().toUpperCase();
    }
    if (!q.stem) return null;
    if (q.type === "mcq" && (q.choices.length !== 4 || q.answer.length !== 1 || "ABCD".indexOf(q.answer) < 0)) return null;
    return q;
  },

  fetchRow: function (row) {
    var self = this;
    var job = row.externalId ? self.request(CB_API + "/digital/get-question", { external_id: row.externalId }, 12000, self.plain)
      : row.ibn ? self.request(CB_DISCLOSED + "/" + encodeURIComponent(row.ibn) + ".json", null, 12000) : Promise.reject(new Error("no id"));
    return job.then(function (raw) { return self.normalize(row, raw); }, function () { return null; });
  },

  // A random unseen question for the target. Resolves to
  // { q, loose } | { empty: true } | { failed: true }.
  take: function (target, pinnedId) {
    var self = this;
    if (self.state !== "ready") return Promise.resolve({ failed: true });
    var fit = rowsFor(self.list, target, state);
    if (!fit.pool.length) return Promise.resolve({ empty: true });
    var order = shuffle(fit.pool, Math.random);
    if (pinnedId) {
      var pin = order.filter(function (r) { return r.questionId === pinnedId; })[0];
      if (pin) order = [pin].concat(order.filter(function (r) { return r !== pin; }));
    }
    var tries = 0;
    function next() {
      if (tries >= 5 || tries >= order.length) return { failed: true };
      return self.fetchRow(order[tries++]).then(function (q) { return q ? { q: q, loose: fit.loose } : next(); });
    }
    return Promise.resolve(next());
  },
};

/* Removes anything active (scripts, event handlers) from fetched HTML. */
function sanitize(html) {
  var doc = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
  var top = doc.body.firstElementChild;
  var blocked = { SCRIPT: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1, STYLE: 1, FORM: 1, INPUT: 1, BUTTON: 1, BASE: 1, TEXTAREA: 1, SELECT: 1 };
  (function walk(el) {
    Array.prototype.slice.call(el.children).forEach(function (child) {
      if (blocked[child.tagName.toUpperCase()]) { child.remove(); return; }
      Array.prototype.slice.call(child.attributes).forEach(function (a) {
        var n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.indexOf("on") === 0 || n === "id" || n === "style" || ((n === "href" || n === "src" || n === "xlink:href") && v.indexOf("javascript:") === 0)) child.removeAttribute(a.name);
      });
      walk(child);
    });
  })(top);
  return top.innerHTML.trim();
}
function textOf(html) {
  return new DOMParser().parseFromString("<div>" + html + "</div>", "text/html").body.textContent.trim();
}

/* =====================================================================
   8. SOUND (Web Audio only)
   ===================================================================== */
var Sound = {
  ac: null,
  ctx: function () {
    if (state.muted) return null;
    try {
      if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ac.state === "suspended") this.ac.resume();
    } catch (e) { return null; }
    return this.ac;
  },
  tone: function (freq, at, dur, type, vol, slideTo) {
    var ac = this.ctx(); if (!ac) return;
    var t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  // Sonar ping with two fading echoes.
  ping: function () {
    this.tone(1320, 0, 0.5, "sine", 0.22); this.tone(1320, 0.22, 0.45, "sine", 0.08); this.tone(1320, 0.44, 0.4, "sine", 0.03);
  },
  // A two-note chime that sits higher for each tier.
  chime: function (tier) {
    var notes = [392, 440, 523.25, 587.33, 659.25, 783.99], f = notes[Math.max(0, Math.min(tier, notes.length - 1))];
    this.tone(f, 0.3, 0.35, "triangle", 0.18); this.tone(f * 1.5, 0.42, 0.5, "triangle", 0.16);
  },
  thud: function () {
    this.tone(120, 0, 0.35, "sine", 0.4, 38); this.tone(70, 0.02, 0.25, "triangle", 0.25, 30);
  },
  krillion: function () {
    var run = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    for (var i = 0; i < run.length; i++) { this.tone(run[i], 0.3 + i * 0.09, 0.4, "triangle", 0.16); this.tone(run[i] * 2, 0.3 + i * 0.09, 0.25, "sine", 0.05); }
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f) { Sound.tone(f, 0.95, 1.4, "sine", 0.11); });
    this.tone(2093, 1.0, 1.2, "sine", 0.05, 4186);
  },
  correct: function (tier) { this.ping(); if (tier >= CONFIG.tiers.length - 1) this.krillion(); else this.chime(tier); },
};

/* =====================================================================
   9. SCENE (underwater canvas)
   Engine points set the depth. Light points set the sub's light cone.
   ===================================================================== */
var Scene = (function () {
  var cv, c, off, oc, W = 0, H = 0, dpr = 1, t = 0, last = 0;
  var depth = 0, depthTo = 0, lightF = 0, lightTo = 0, shake = 0;
  var snow = [], bubbles = [], creatures = [];

  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, k) { a = hex(a); b = hex(b); return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * k) + "," + Math.round(a[1] + (b[1] - a[1]) * k) + "," + Math.round(a[2] + (b[2] - a[2]) * k) + ")"; }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }

  function zoneIndex(engine) {
    var z = CONFIG.zones, i = z.length - 1;
    while (i > 0 && engine < z[i].at) i--;
    return i;
  }
  function depthFor(engine) {
    var z = CONFIG.zones, i = zoneIndex(engine);
    return z[i + 1] ? i + (engine - z[i].at) / (z[i + 1].at - z[i].at) : i;
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(50, r.width); H = Math.max(50, r.height);
    cv.width = off.width = Math.round(W * dpr); cv.height = off.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); oc.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init(canvas) {
    cv = canvas; c = cv.getContext("2d");
    off = document.createElement("canvas"); oc = off.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    for (var i = 0; i < 70; i++) snow.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.6, v: 0.01 + Math.random() * 0.03, p: Math.random() * 6 });
    requestAnimationFrame(frame);
  }

  function setTanks(engine, light, instant) {
    depthTo = depthFor(engine); lightTo = clamp(light / CONFIG.tankMax);
    if (instant) { depth = depthTo; lightF = lightTo; }
    return CONFIG.zones[zoneIndex(engine)].name;
  }
  function spawn(tier) { creatures.length = 0; creatures.push({ tier: tier, born: t }); } // one creature at a time
  function thump() { shake = 1; }

  /* ---- creatures (all drawn facing left, around 0,0) ---- */
  function shrimpShape(g, x, y, s, color, tt) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1; g.lineCap = "round";
    for (var i = 0; i < 6; i++) { // curved, tapering body
      g.beginPath(); g.ellipse(i * 5.2, i * i * 0.55, 5 - i * 0.55, 4 - i * 0.45, 0.25 * i, 0, 6.3); g.fill();
    }
    g.beginPath(); g.moveTo(29, 14); g.lineTo(36, 11); g.lineTo(35, 19); g.closePath(); g.fill(); // tail fan
    g.beginPath(); g.moveTo(-3, -2); g.quadraticCurveTo(-14, -10, -22, -4); g.moveTo(-3, -1); g.quadraticCurveTo(-13, -2, -19, 5); g.stroke(); // antennae
    for (var k = 0; k < 5; k++) { // legs
      var lx = 2 + k * 4.5, sw = Math.sin(tt * 9 + k) * 2;
      g.beginPath(); g.moveTo(lx, 3 + k * 0.9); g.lineTo(lx - 2 + sw, 9 + k * 1.1); g.stroke();
    }
    g.fillStyle = "#101820"; g.beginPath(); g.arc(-1.5, -1.2, 1.1, 0, 6.3); g.fill();
    g.restore();
  }
  function drawCreature(g, tier, x, y, s, tt) {
    var i;
    g.save();
    if (tier === 0) { // Plankton: a drifting cloud of glowing specks
      g.shadowColor = "#b8ffb0"; g.shadowBlur = 10 * s; g.fillStyle = "#c9ffbe";
      for (i = 0; i < 12; i++) {
        var a = i * 2.4 + tt * 0.8, rr = (8 + (i * 7) % 16) * s;
        g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a * 1.3) * rr * 0.6, (1.4 + (i % 3)) * s, 0, 6.3); g.fill();
      }
    } else if (tier === 1) { // Shrimp
      g.shadowColor = "#ff9fb2"; g.shadowBlur = 8 * s;
      shrimpShape(g, x, y, 1.5 * s, "#ff9fb2", tt);
    } else if (tier === 2) { // Krill: a small swarm
      g.shadowColor = "#ffb07a"; g.shadowBlur = 6 * s;
      var spots = [[0, 0], [30, -16], [34, 14], [-26, 12], [-20, -20], [62, 0]];
      for (i = 0; i < spots.length; i++) shrimpShape(g, x + spots[i][0] * s, y + (spots[i][1] + Math.sin(tt * 3 + i) * 3) * s, 0.75 * s, "#ffb07a", tt + i);
    } else if (tier === 3) { // Squid
      g.shadowColor = "#c9a2ff"; g.shadowBlur = 12 * s; g.fillStyle = "#c9a2ff"; g.strokeStyle = "#c9a2ff"; g.lineCap = "round";
      g.beginPath(); g.ellipse(x, y, 26 * s, 11 * s, 0, 0, 6.3); g.fill();
      g.beginPath(); g.moveTo(x - 24 * s, y); g.lineTo(x - 12 * s, y - 16 * s); g.lineTo(x - 6 * s, y); g.lineTo(x - 12 * s, y + 16 * s); g.closePath(); g.fill();
      g.lineWidth = 2.4 * s;
      for (i = 0; i < 6; i++) {
        var oy = (i - 2.5) * 3.4 * s;
        g.beginPath(); g.moveTo(x + 22 * s, y + oy);
        g.bezierCurveTo(x + 38 * s, y + oy + Math.sin(tt * 4 + i) * 7 * s, x + 50 * s, y + oy - Math.sin(tt * 4 + i) * 7 * s, x + 64 * s, y + oy * 1.6 + Math.sin(tt * 4 + i + 1) * 5 * s);
        g.stroke();
      }
      g.shadowBlur = 0; g.fillStyle = "#fff"; g.beginPath(); g.arc(x + 15 * s, y - 2 * s, 4 * s, 0, 6.3); g.fill();
      g.fillStyle = "#1a1030"; g.beginPath(); g.arc(x + 15 * s, y - 2 * s, 2 * s, 0, 6.3); g.fill();
    } else if (tier === 4) { // Anglerfish
      g.fillStyle = "#33415f"; g.strokeStyle = "#6f86b8"; g.lineWidth = 1.5 * s;
      g.beginPath(); g.moveTo(x + 22 * s, y); g.lineTo(x + 40 * s, y - 13 * s); g.lineTo(x + 36 * s, y); g.lineTo(x + 40 * s, y + 13 * s); g.closePath(); g.fill(); g.stroke(); // tail
      g.beginPath(); g.arc(x, y, 24 * s, 0.5, 5.78); g.lineTo(x - 6 * s, y); g.closePath(); g.fill(); g.stroke(); // body with open jaw
      g.fillStyle = "#f4f7ff";
      for (i = 0; i < 4; i++) { // teeth
        var k = i / 3, ux = x - 20 * s + k * 13 * s, uy = y - 11 * s + k * 10 * s, dy = y + 11 * s - k * 10 * s;
        g.beginPath(); g.moveTo(ux - 2 * s, uy); g.lineTo(ux + 3 * s, uy); g.lineTo(ux, uy + 6 * s); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(ux - 2 * s, dy); g.lineTo(ux + 3 * s, dy); g.lineTo(ux, dy - 6 * s); g.closePath(); g.fill();
      }
      g.beginPath(); g.arc(x - 4 * s, y - 12 * s, 3.2 * s, 0, 6.3); g.fill();
      g.fillStyle = "#0a0f1c"; g.beginPath(); g.arc(x - 5 * s, y - 12 * s, 1.5 * s, 0, 6.3); g.fill();
      var lx = x - 34 * s, ly = y - 26 * s + Math.sin(tt * 3) * 2 * s; // lure
      g.strokeStyle = "#6f86b8"; g.beginPath(); g.moveTo(x + 2 * s, y - 23 * s); g.quadraticCurveTo(x - 14 * s, y - 46 * s, lx, ly); g.stroke();
      g.shadowColor = "#aef9ff"; g.shadowBlur = 22 * s; g.fillStyle = "#d9fdff"; g.beginPath(); g.arc(lx, ly, 4.5 * s, 0, 6.3); g.fill();
    } else { // One in a Krillion: a golden giant with a tiny escort
      g.shadowColor = "#ffe27a"; g.shadowBlur = 30 * s;
      shrimpShape(g, x, y, 3 * s, "#ffd84d", tt);
      g.shadowBlur = 8 * s;
      for (i = 0; i < 7; i++) shrimpShape(g, x + (Math.cos(i * 2.1) * 90 + 40) * s, y + (Math.sin(i * 1.7 + tt) * 34) * s, 0.5 * s, "#ffe9a0", tt + i);
      g.fillStyle = "#fff7c9";
      for (i = 0; i < 10; i++) { // sparkles
        var sa = i * 0.63 + tt * 1.2, sr = (50 + (i % 4) * 14) * s, tw = (Math.sin(tt * 6 + i * 2) + 1.3) * 1.6 * s;
        var px = x + 40 * s + Math.cos(sa) * sr, py = y + 14 * s + Math.sin(sa) * sr * 0.55;
        g.beginPath(); g.moveTo(px - tw * 2, py); g.lineTo(px, py - tw * 0.6); g.lineTo(px + tw * 2, py); g.lineTo(px, py + tw * 0.6); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(px, py - tw * 2); g.lineTo(px + tw * 0.6, py); g.lineTo(px, py + tw * 2); g.lineTo(px - tw * 0.6, py); g.closePath(); g.fill();
      }
    }
    g.restore();
  }

  function drawSub(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var spin = Math.abs(Math.sin(t * (6 + depth * 2)));
    g.fillStyle = "#7d8794"; g.beginPath(); g.ellipse(-50, 0, 3, 3 + 9 * spin, 0, 0, 6.3); g.fill(); // propeller
    g.fillStyle = "#d99a1c"; g.fillRect(-48, -3, 8, 6);
    g.fillStyle = "#e2a824"; g.beginPath(); g.moveTo(-34, -2); g.lineTo(-46, -13); g.lineTo(-40, -1); g.closePath(); g.fill(); // tail fins
    g.beginPath(); g.moveTo(-34, 2); g.lineTo(-46, 13); g.lineTo(-40, 1); g.closePath(); g.fill();
    g.fillStyle = "#ffc93c"; g.beginPath(); g.ellipse(0, 0, 42, 17, 0, 0, 6.3); g.fill(); // hull
    g.fillStyle = "#e2a824"; g.beginPath(); g.ellipse(0, 6, 38, 9, 0, 0, 3.15); g.fill();
    g.fillStyle = "#ffc93c"; g.beginPath(); g.roundRect ? g.roundRect(-12, -27, 22, 14, 5) : g.rect(-12, -27, 22, 14); g.fill(); // tower
    g.strokeStyle = "#e2a824"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(2, -27); g.lineTo(2, -36); g.lineTo(9, -36); g.stroke(); // periscope
    g.fillStyle = "#bfefff"; g.strokeStyle = "#8a6a10"; g.lineWidth = 1.5;
    [-14, 4].forEach(function (wx) { g.beginPath(); g.arc(wx, -2, 5.5, 0, 6.3); g.fill(); g.stroke(); });
    g.fillStyle = lightF > 0.02 ? "#fffbd6" : "#9aa3ad"; g.beginPath(); g.arc(39, 1, 4, 0, 6.3); g.fill(); // headlamp
    g.restore();
  }

  function cone(g, nx, ny, len, half, inner, outer) {
    var grad = g.createLinearGradient(nx, ny, nx + len, ny);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(nx, ny - 3); g.lineTo(nx + len, ny - Math.tan(half) * len); g.lineTo(nx + len, ny + Math.tan(half) * len); g.lineTo(nx, ny + 3); g.closePath(); g.fill();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    depth += (depthTo - depth) * Math.min(1, dt * 1.2);
    lightF += (lightTo - lightF) * Math.min(1, dt * 1.5);
    if (W < 60) resize();
    var z = CONFIG.zones, i0 = Math.min(z.length - 1, Math.floor(depth)), i1 = Math.min(z.length - 1, i0 + 1), k = depth - i0;
    var s = Math.max(0.6, Math.min(1.5, Math.min(W, H * 1.9) / 360)), i;

    c.save();
    if (shake > 0.01) { c.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake); shake *= 0.88; }

    // water
    var grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, mix(z[i0].top, z[i1].top, k)); grad.addColorStop(1, mix(z[i0].bottom, z[i1].bottom, k));
    c.fillStyle = grad; c.fillRect(-10, -10, W + 20, H + 20);

    // sun rays (upper zones only)
    var sun = clamp(1.4 - depth);
    if (sun > 0) {
      c.globalAlpha = 0.13 * sun; c.fillStyle = "#ffffff";
      for (i = 0; i < 5; i++) {
        var rx = ((i * 0.23 + 0.05) * W + Math.sin(t * 0.3 + i) * 20);
        c.beginPath(); c.moveTo(rx, -5); c.lineTo(rx + 30 + i * 6, -5); c.lineTo(rx - 60 + i * 6, H); c.lineTo(rx - 130, H); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
    }

    // kelp (strongest in the Kelp Forest)
    var kelp = clamp(1.15 - Math.abs(depth - 1));
    if (kelp > 0) {
      c.globalAlpha = kelp; c.lineCap = "round";
      for (i = 0; i < 9; i++) {
        var span = W + 160, kx = ((i * 137 - t * 26) % span + span) % span - 80, kh = H * (0.45 + ((i * 53) % 40) / 100);
        c.strokeStyle = i % 2 ? "#0f6b45" : "#158a52"; c.lineWidth = (5 + (i % 3) * 2) * s;
        c.beginPath(); c.moveTo(kx, H + 5);
        for (var seg = 1; seg <= 6; seg++) c.lineTo(kx + Math.sin(t * 1.1 + i + seg * 0.8) * 9 * s * (seg / 3), H - (kh * seg) / 6);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    // reef (fades out as you leave the surface) and trench rock (fades in at the bottom)
    var reef = clamp(1.2 - depth);
    if (reef > 0) {
      c.globalAlpha = reef;
      var cols = ["#ff7d8d", "#ffb04f", "#ff8fd0", "#f6d55c", "#8ee0b5"];
      for (i = 0; i < 12; i++) {
        var sp = W + 200, cx = ((i * 113 - t * 34) % sp + sp) % sp - 100, cr = (16 + (i * 37) % 22) * s;
        c.fillStyle = cols[i % cols.length];
        c.beginPath(); c.arc(cx, H + cr * 0.25, cr, 0, 6.3); c.fill();
        c.beginPath(); c.arc(cx + cr * 0.8, H + cr * 0.1, cr * 0.6, 0, 6.3); c.fill();
        if (i % 3 === 0) { c.fillRect(cx - cr * 0.15, H - cr * 1.5, cr * 0.3, cr * 1.5); c.beginPath(); c.arc(cx, H - cr * 1.5, cr * 0.32, 0, 6.3); c.fill(); }
      }
      c.fillStyle = "#e9d9a6"; c.fillRect(-10, H - 5 * s, W + 20, 20);
      c.globalAlpha = 1;
    }
    var rock = clamp(depth - 2.4);
    if (rock > 0) {
      c.globalAlpha = rock; c.fillStyle = "#070b14";
      c.beginPath(); c.moveTo(-10, H + 5);
      for (i = 0; i <= 14; i++) {
        var spn = W / 12, px = i * spn - ((t * 30) % spn);
        c.lineTo(px, H - (14 + ((i + Math.floor((t * 30) / spn)) * 47) % 36) * s);
      }
      c.lineTo(W + 10, H + 5); c.closePath(); c.fill(); c.globalAlpha = 1;
    }

    // marine snow drifting past
    c.fillStyle = "rgba(255,255,255,.45)";
    for (i = 0; i < snow.length; i++) {
      var p = snow[i];
      p.x -= (p.v + 0.02) * dt * 2; p.y += Math.sin(t + p.p) * 0.0004 + 0.004 * dt;
      if (p.x < -0.02) { p.x = 1.02; p.y = Math.random(); }
      if (p.y > 1.02) p.y = -0.02;
      c.beginPath(); c.arc(p.x * W, p.y * H, p.r * s, 0, 6.3); c.fill();
    }

    // the sub and its light
    var sx = W * 0.27, sy = H * 0.5 + Math.sin(t * 1.3) * 5 * s, nx = sx + 40 * s, ny = sy + 1 * s;
    var reach = W * (0.18 + 0.85 * lightF), half = 0.2 + 0.16 * lightF, power = clamp(lightF * 1.8 + (lightF > 0 ? 0.12 : 0));
    if (Math.random() < dt * (3 + depth * 2)) bubbles.push({ x: sx - 50 * s, y: sy, r: (1.5 + Math.random() * 3) * s, life: 0 });
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 1;
    for (i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i]; b.life += dt; b.x -= 26 * dt * s; b.y -= 34 * dt * s;
      if (b.life > 2.5) { bubbles.splice(i, 1); continue; }
      c.globalAlpha = 1 - b.life / 2.5; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 6.3); c.stroke();
    }
    c.globalAlpha = 1;
    if (power > 0) cone(c, nx, ny, reach, half, "rgba(255,244,170," + 0.3 * power + ")", "rgba(255,244,170,0)");
    drawSub(c, sx, sy, s);

    // darkness of the deep, with the light cone cut out of it
    var dark = z[i0].dark + (z[i1].dark - z[i0].dark) * k;
    if (dark > 0.01) {
      oc.globalCompositeOperation = "source-over"; oc.clearRect(0, 0, W, H);
      oc.fillStyle = "rgba(0,3,10," + dark + ")"; oc.fillRect(0, 0, W, H);
      oc.globalCompositeOperation = "destination-out";
      if (power > 0) cone(oc, nx, ny, reach, half, "rgba(0,0,0," + power + ")", "rgba(0,0,0,0)");
      var halo = oc.createRadialGradient(sx, sy, 5, sx, sy, 75 * s);
      halo.addColorStop(0, "rgba(0,0,0," + (0.35 + 0.4 * power) + ")"); halo.addColorStop(1, "rgba(0,0,0,0)");
      oc.fillStyle = halo; oc.fillRect(0, 0, W, H);
      c.drawImage(off, 0, 0, W, H);
    }

    // glowing specks in the deep
    var glow = clamp(depth - 1.6);
    if (glow > 0) {
      for (i = 0; i < 16; i++) {
        var gx = (((i * 0.173 + 0.07) - t * 0.012 * (1 + (i % 3))) % 1 + 1) % 1, gy = (i * 0.317) % 1;
        c.globalAlpha = glow * (0.35 + 0.35 * Math.sin(t * 2 + i * 1.7));
        c.fillStyle = i % 2 ? "#7ef5ff" : "#a9ffcf";
        c.beginPath(); c.arc(gx * W, gy * H, (1 + (i % 3) * 0.6) * s, 0, 6.3); c.fill();
      }
      c.globalAlpha = 1;
    }

    // creatures swim in from the right, linger in the light, then pass the sub
    for (i = creatures.length - 1; i >= 0; i--) {
      var cr2 = creatures[i], age = t - cr2.born, life = 7;
      if (age > life) { creatures.splice(i, 1); continue; }
      var u = age / life, ease = u < 0.3 ? u / 0.3 * 0.42 : u < 0.7 ? 0.42 + (u - 0.3) / 0.4 * 0.16 : 0.58 + (u - 0.7) / 0.3 * 0.42;
      var cxp = W + 110 * s - ease * (W + 260 * s), cyp = sy + (cr2.tier === 4 ? 6 : -4) * s + Math.sin(age * 2) * 6 * s;
      drawCreature(c, cr2.tier, cxp, cyp, s * (cr2.tier === 5 ? 1.05 : 1.15), t);
    }
    c.restore();
  }

  return { init: init, setTanks: setTanks, spawn: spawn, thump: thump, drawCreature: drawCreature, resize: function () { if (cv) resize(); } };
})();

/* =====================================================================
   10. SCREENS
   ===================================================================== */
var ui = { screen: "start", q: null, result: null, summary: null, missedOnly: false, note: "" };
var panel;

function labelFor(sectionId, domainId, skillId, difficulty) {
  var parts = [SECTION[sectionId].name];
  if (domainId && DOMAIN[domainId]) parts.push(DOMAIN[domainId].name);
  if (skillId && SKILL[skillId]) parts.push(SKILL[skillId].name);
  if (difficulty) parts.push(DIFF_LABEL[difficulty]);
  return parts.join(" · ");
}
function missionLabel(m) { return labelFor(m.type, SKILL[m.skillId].domain, m.skillId, m.difficulty); }
function bossLabel(part) {
  var b = CONFIG.boss;
  return part === "a" ? labelFor("rw", SKILL[b.partA.skillId].domain, b.partA.skillId, b.partA.difficulty)
    : labelFor("math", b.partB.domainId, null, b.partB.difficulty) + " (any skill)";
}

function setGauges(engine, light, instant) {
  var zone = Scene.setTanks(engine, light, instant);
  $("g-engine").textContent = engine; $("g-light").textContent = light;
  $("gb-engine").style.width = Math.min(100, (engine / CONFIG.tankMax) * 100) + "%";
  $("gb-light").style.width = Math.min(100, (light / CONFIG.tankMax) * 100) + "%";
  $("zone").textContent = zone;
}
function reveal(html, cls) {
  var el = $("reveal");
  el.className = "reveal show " + (cls || ""); el.innerHTML = html;
  clearTimeout(reveal.timer);
  reveal.timer = setTimeout(function () { el.className = "reveal"; }, 4200);
}
function go(screen) {
  ui.screen = screen;
  render();
  window.scrollTo(0, 0);
}
function render() {
  document.body.setAttribute("data-screen", ui.screen);
  var d = state.dive;
  if (!d && ui.summary && (ui.screen === "end" || ui.screen === "dive")) setGauges(ui.summary.engine, ui.summary.light);
  else if (d) setGauges(d.engine, d.light);
  else setGauges(0, 0);
  ({ start: renderStart, dive: renderDive, end: renderEnd, map: renderMap, history: renderHistory })[ui.screen]();
  $("mute").textContent = state.muted ? "Sound off" : "Sound on";
  $("mute").setAttribute("aria-pressed", String(!state.muted));
}

/* ---- start ---- */
function sourceLine() {
  if (CB.state === "checking") return '<p class="source">Questions: connecting to College Board…</p>';
  if (CB.state === "ready") return '<p class="source ok">Questions: College Board connected. Each mission shows a random question from the official bank.</p>';
  return '<p class="source warn">Questions: this browser couldn\'t load questions from College Board' + (navigator.onLine === false ? " because you're offline" : "") +
    ". You can still dive: each mission tells you what to pull up on College Board's site, and you log your result here. " +
    '<button class="link" data-act="recheck">Try again</button><span class="tiny"> ' + esc(CB.log.join(" · ")) + "</span></p>";
}
function renderStart() {
  var t = today(), d = state.dive, dailyDone = state.dailyDone === t;
  panel.innerHTML =
    '<h1>Twin Tank Dive</h1>' +
    '<p class="lead">Math fills the Engine. Reading &amp; Writing fills the Light. Your score is only as good as your weaker tank.</p>' +
    '<div class="stats">' +
      '<div><b>' + state.best + '</b><span>Best score</span></div>' +
      '<div><b>' + currentStreak(state, t) + '</b><span>Daily streak</span></div>' +
      '<div><b>' + state.log.length + '</b><span>Official questions logged</span></div>' +
    '</div>' +
    (d ? '<button class="btn primary" data-act="resume">Resume dive: mission ' + (d.index + 1) + ' of ' + d.missions.length + '</button>' : "") +
    '<button class="btn ' + (d ? "" : "primary") + '" data-act="daily"' + (dailyDone ? " disabled" : "") + '>' + (dailyDone ? "Daily Dive done. Back tomorrow" : "Daily Dive") + '</button>' +
    '<button class="btn" data-act="free">Free Dive</button>' +
    sourceLine() +
    '<details><summary>How scoring works</summary>' +
      '<p>A dive is 7 missions: Math, English, Math, English, Math, English, then the Fusion Boss.</p>' +
      '<p>A correct answer starts at ' + ["easy", "medium", "hard"].map(function (k) { return DIFF_LABEL[k] + " = " + CONFIG.tiers[CONFIG.baseTier[k]].name; }).join(", ") + '. Each bonus lifts it one tier:</p>' +
      '<ul><li><b>Weak spot</b>: a skill where you are under 50% after 3 or more tries.</li><li><b>Cross-current</b>: your previous mission was correct and in the other section.</li><li><b>No choices</b> (Math): you solved it before looking at the choices. Typed answers always count.</li></ul>' +
      '<p class="ladder">' + CONFIG.tiers.map(function (x) { return esc(x.name) + " " + x.points; }).join(" · ") + '</p>' +
      '<p>Fusion Boss: two hard data questions. Both right = ' + CONFIG.boss.bothPoints + ' points, split between the tanks. Final score = ' + CONFIG.finalMultiplier + ' × your lower tank.</p>' +
    '</details>';
}

function startDive(mode) {
  if (state.dive && !confirm("Leave the unfinished dive? Questions you already answered stay in your history.")) return;
  state.dive = buildDive(state, mode, today());
  ui.q = null; ui.result = null; ui.summary = null;
  Store.save(); Sound.ping();
  go("dive");
}

/* ---- dive ---- */
function pips(d) {
  var out = "";
  for (var i = 0; i < d.missions.length; i++) {
    var r = d.results[i], cls = r ? (r.type === "boss" ? (r.points ? "ok" : "bad") : r.correct ? "ok" : "bad") : i === d.index ? "now" : "";
    out += '<i class="' + cls + '"></i>';
  }
  return out;
}
function bossPart(d) { return d.boss.a === null ? "a" : "b"; }
function currentTarget(d) {
  var m = d.missions[d.index];
  if (m.type !== "boss") return { section: m.type, skillId: m.skillId, difficulty: m.difficulty };
  return bossPart(d) === "a" ? CONFIG.boss.partA : CONFIG.boss.partB;
}
function pinned(d) {
  var m = d.missions[d.index];
  return m.type !== "boss" ? m.qid : bossPart(d) === "a" ? d.boss.pinA : d.boss.pinB;
}
function setPinned(d, id) {
  var m = d.missions[d.index];
  if (m.type !== "boss") m.qid = id; else if (bossPart(d) === "a") d.boss.pinA = id; else d.boss.pinB = id;
}

function loadQuestion() {
  var d = state.dive, m = d.missions[d.index], key = d.index + (m.type === "boss" ? bossPart(d) : "");
  ui.q = { key: key, status: "loading" };
  var slow = setTimeout(function () { if (ui.q && ui.q.key === key && ui.q.status === "loading") { ui.q.status = "failed"; if (ui.screen === "dive") renderDive(); } }, 20000);
  CB.whenChecked(function () {
    CB.take(currentTarget(d), pinned(d)).then(function (out) {
      clearTimeout(slow);
      if (!ui.q || ui.q.key !== key || ui.q.status !== "loading" || state.dive !== d) return;
      if (out.q) {
        ui.q.status = "ready"; ui.q.data = out.q; ui.q.loose = out.loose;
        ui.q.revealed = out.q.type === "spr" || m.type !== "math" || !!m.reveal;
        setPinned(d, out.q.qid); Store.save();
      } else ui.q.status = out.empty ? "empty" : "failed";
      if (ui.screen === "dive") renderDive();
    });
  });
}

function renderDive() {
  var d = state.dive;
  if (ui.result) return renderResult();
  if (!d) { ui.screen = "start"; return render(); }
  var m = d.missions[d.index], boss = m.type === "boss", part = boss ? bossPart(d) : "", key = d.index + part;
  if (!ui.q || ui.q.key !== key) { loadQuestion(); }
  var q = ui.q;
  var head = '<div class="progress"><span>Mission ' + (d.index + 1) + ' of ' + d.missions.length + (d.mode === "daily" ? " · Daily Dive" : " · Free Dive") + '</span><div class="pips">' + pips(d) + '</div></div>';
  var title = boss
    ? '<div class="mission boss"><div class="m-kicker">Mission 7: Fusion Boss · two hard data questions, back to back</div>' +
        '<div class="m-part' + (part === "a" ? " on" : " done") + '">Part A: ' + esc(bossLabel("a")) + (d.boss.a === null ? "" : d.boss.a ? " ✓" : " ✗") + '</div>' +
        '<div class="m-part' + (part === "b" ? " on" : "") + '">Part B: ' + esc(bossLabel("b")) + '</div></div>'
    : '<div class="mission"><div class="m-kicker">Mission ' + (d.index + 1) + '</div><div class="m-title">' + esc(missionLabel(m)) + '</div></div>';
  var body;
  if (q.status === "loading") body = '<div class="loading"><span class="sonar"></span>Pulling a question from College Board…</div>';
  else if (q.status === "ready") body = questionHtml(q, m);
  else body = manualHtml(d, m, part, q.status);
  var swap = !boss ? '<button class="link" data-act="swap">Change skill</button>' : "";
  panel.innerHTML = head + title + (ui.note ? '<p class="note">' + esc(ui.note) + '</p>' : "") + body + '<div class="foot">' + swap + '<button class="link" data-act="home">Save and exit</button></div>';
  ui.note = "";
}

function questionHtml(q, m) {
  var x = q.data, out = "";
  if (q.loose) out += '<p class="tiny">College Board has no label matching this skill exactly, so this question comes from the same domain.</p>';
  if (x.passage) out += '<div class="passage rich">' + x.passage + '</div>';
  out += '<div class="stem rich">' + x.stem + '</div>';
  if (x.type === "spr") {
    out += '<form class="typed" data-form="typed"><label for="typed">Your answer</label><div class="row"><input id="typed" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12" placeholder="e.g. 3/4 or 0.75"><button class="btn primary" type="submit">Submit</button></div>' +
      '<p class="tiny">Typed answer: the No choices bonus counts automatically.</p></form>';
  } else if (!q.revealed) {
    out += '<div class="cover"><p>Work it out first. Solving before you see the choices lifts a correct answer one tier.</p>' +
      '<button class="btn primary" data-act="reveal-solved">I solved it. Show the choices</button>' +
      '<button class="btn" data-act="reveal-peek">Show the choices now (no bonus)</button></div>';
  } else {
    if (m.type === "math") out += '<p class="tiny">' + (m.reveal === "solved" ? "No choices bonus locked in." : "No choices bonus skipped for this one.") + '</p>';
    out += '<div class="choices">' + x.choices.map(function (ch, i) {
      return '<button class="choice" data-act="choose" data-i="' + i + '"><b>' + "ABCD"[i] + '</b><span class="rich">' + ch + '</span></button>';
    }).join("") + '</div>';
  }
  return out + '<p class="qid">Question ID ' + esc(x.qid) + ' · © College Board, shown live from the official question bank</p>';
}

// Fallback: answer on College Board's site, then log the result.
function manualHtml(d, m, part, status) {
  var boss = m.type === "boss", t = currentTarget(d);
  var filter = boss ? bossLabel(part) : missionLabel(m);
  var why = status === "empty" ? "You've already logged every question the bank has for this filter. Tap Change skill, or log one from College Board's site."
    : CB.state === "ready" ? "That question didn't load. Answer one on College Board's site and log it here."
    : "Answer this one on College Board's site, then log your result here.";
  var out = '<p class="note">' + why + '</p>' +
    '<a class="btn primary" href="' + CONFIG.bankUrl + '" target="_blank" rel="noopener">Open Question Bank</a>' +
    '<p class="tiny">Filter by ' + esc(filter.replace(/ · /g, ", ")) + ', and pick a question you haven\'t logged.</p>' +
    (CB.state === "ready" && status !== "empty" ? '<button class="btn" data-act="retry">Try loading a question again</button>' : "") +
    '<form class="log" data-form="log"><label for="qid">Question ID</label><input id="qid" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" placeholder="e.g. 3f5a1c2d">';
  if (boss && part === "b") {
    out += '<label for="boss-skill">Skill (optional)</label><select id="boss-skill"><option value="">Not sure</option>' +
      DOMAIN[CONFIG.boss.partB.domainId].skills.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join("") + '</select>';
  }
  if (t.section === "math" && !boss) {
    out += '<label class="check"><input type="checkbox" id="nochoices"> I solved it before looking at the choices</label>' +
      '<label class="check"><input type="checkbox" id="typedq"> It was a typed-answer question (always counts)</label>';
  }
  out += '<p class="error" id="log-error" role="alert"></p><div class="row two"><button class="btn good" type="button" data-act="log-correct">Correct</button><button class="btn bad" type="button" data-act="log-incorrect">Incorrect</button></div></form>';
  return out;
}

/* One place where every answer lands, live or logged. */
function submit(info) {
  var d = state.dive, m = d.missions[d.index], res;
  if (m.type === "boss") {
    res = recordBossPart(state, d, info, today());
    if (res.error) return res;
    Store.save();
    if (res.part === "a") {
      if (res.correct) Sound.ping(); else { Sound.thud(); Scene.thump(); }
      ui.result = { kind: "bossA", correct: res.correct, review: info.review };
    } else {
      var b = res.boss;
      ui.summary = res.summary;
      setGauges(res.summary.engine, res.summary.light);
      if (b.tier >= 0) { Sound.correct(b.tier); Scene.spawn(b.tier); reveal('<b>' + esc(CONFIG.tiers[b.tier].name) + '</b><span>+' + b.points + ' · Fusion complete</span>', "gold"); }
      else if (b.points) { Sound.ping(); reveal('<b>Half fusion</b><span>+' + b.points + ' to ' + (b.engine ? "Engine" : "Light") + '</span>'); }
      else { Sound.thud(); Scene.thump(); }
      ui.result = { kind: "boss", boss: b, correct: res.correct, review: info.review };
    }
  } else {
    res = recordMission(state, d, info, today());
    if (res.error) return res;
    Store.save();
    setGauges(d.engine, d.light);
    if (res.correct) {
      Sound.correct(res.tier); Scene.spawn(res.tier);
      reveal('<b>' + esc(CONFIG.tiers[res.tier].name) + '</b><span>+' + res.points + ' ' + (res.tank === "engine" ? "Engine" : "Light") + '</span>', res.tier === CONFIG.tiers.length - 1 ? "gold" : "");
    } else { Sound.thud(); Scene.thump(); }
    ui.result = { kind: "mission", res: res, review: info.review };
  }
  ui.q = null;
  renderDive();
  window.scrollTo({ top: 0, behavior: "smooth" });
  return res;
}

function answerLive(correct, review) {
  var q = ui.q, d = state.dive, m = d.missions[d.index], x = q.data;
  var mapped = skillOfRow(x.row, m.skillId || (m.type === "boss" && bossPart(d) === "a" ? CONFIG.boss.partA.skillId : null));
  var info = { qid: x.qid, correct: correct, skillId: mapped, noChoices: x.type === "spr" || m.reveal === "solved", review: review };
  var out = submit(info);
  if (out && out.error) { ui.note = out.error; ui.q = null; renderDive(); }
}
function choose(i) {
  var q = ui.q; if (!q || q.status !== "ready" || !q.revealed || q.data.type !== "mcq") return;
  var x = q.data, letter = "ABCD"[i];
  answerLive(letter === x.answer, { yours: letter, right: x.answer, rightHtml: x.choices["ABCD".indexOf(x.answer)], rationale: x.rationale });
}
function submitTyped(text) {
  var q = ui.q; if (!q || q.status !== "ready" || q.data.type !== "spr" || !String(text).trim()) return;
  var x = q.data;
  answerLive(checkTyped(text, x.accepted), { yours: String(text).trim(), right: x.accepted.join(" or "), rationale: x.rationale });
}
function logManual(correct) {
  var d = state.dive, m = d.missions[d.index];
  var info = { qid: $("qid").value, correct: correct };
  if ($("boss-skill")) info.skillId = $("boss-skill").value;
  if ($("nochoices")) info.noChoices = $("nochoices").checked || $("typedq").checked;
  var out = submit(info);
  if (out && out.error) { $("log-error").textContent = out.error; $("qid").focus(); }
}

function reviewHtml(rv) {
  if (!rv) return "";
  return '<div class="review"><p><b>Your answer:</b> ' + esc(rv.yours) + ' &nbsp; <b>Correct answer:</b> ' + esc(rv.right) + '</p>' +
    (rv.rightHtml ? '<div class="rich">' + rv.rightHtml + '</div>' : "") +
    (rv.rationale ? '<details open><summary>Explanation</summary><div class="rich">' + rv.rationale + '</div></details>' : "") + '</div>';
}
function breakdown(res) {
  var rows = ['<li>Base: ' + esc(CONFIG.tiers[res.base].name) + ' (' + DIFF_LABEL[res.difficulty].toLowerCase() + ')</li>'];
  res.bonuses.forEach(function (b) { rows.push('<li>+1 tier: ' + esc(CONFIG.bonuses[b].label) + '</li>'); });
  if (res.capped) rows.push('<li>Capped at ' + esc(CONFIG.tiers[CONFIG.tiers.length - 1].name) + '</li>');
  return '<ul class="breakdown">' + rows.join("") + '</ul>';
}
function renderResult() {
  var r = ui.result, d = state.dive, html, next = "Next mission";
  var head = d ? '<div class="progress"><span>Mission ' + d.index + ' of ' + d.missions.length + ' logged</span><div class="pips">' + pips(d) + '</div></div>' : "";
  if (r.kind === "mission") {
    var res = r.res;
    html = res.correct
      ? '<div class="result ok"><canvas class="creature" data-tier="' + res.tier + '" width="240" height="120"></canvas><h2>' + esc(CONFIG.tiers[res.tier].name) + '</h2><p class="pts">+' + res.points + ' to ' + (res.tank === "engine" ? "Engine" : "Light") + '</p>' + breakdown(res) + '</div>'
      : '<div class="result bad"><h2>Incorrect</h2><p class="pts">0 points. It\'s in your history so you can redo it later.</p></div>';
  } else if (r.kind === "bossA") {
    html = '<div class="result ' + (r.correct ? "ok" : "bad") + '"><h2>Part A ' + (r.correct ? "correct" : "incorrect") + '</h2><p class="pts">Part B is next. Points are settled after both parts.</p></div>';
    next = "On to Part B";
  } else {
    var b = r.boss;
    html = '<div class="result ' + (b.points ? "ok" : "bad") + '">' + (b.tier >= 0 ? '<canvas class="creature" data-tier="' + b.tier + '" width="240" height="120"></canvas>' : "") +
      '<h2>' + (b.tier >= 0 ? esc(CONFIG.tiers[b.tier].name) : b.points ? "Half fusion" : "Fusion failed") + '</h2>' +
      '<p class="pts">Part A ' + (b.a ? "✓" : "✗") + ' · Part B ' + (b.b ? "✓" : "✗") + ' · +' + b.light + ' Light, +' + b.engine + ' Engine</p></div>';
    next = "See dive results";
  }
  panel.innerHTML = head + html + reviewHtml(r.review) + '<button class="btn primary" data-act="next">' + next + '</button>';
  paintCreatures();
}
function paintCreatures() {
  Array.prototype.forEach.call(panel.querySelectorAll("canvas.creature"), function (cv) {
    var g = cv.getContext("2d"), tier = +cv.getAttribute("data-tier"), w = cv.width, h = cv.height;
    var k = [1.6, 1.5, 1.2, 1.25, 1.3, 0.8][tier] * (w / 240), ox = [0, -20, -20, -24, 0, -50][tier] * (w / 240);
    g.clearRect(0, 0, w, h);
    Scene.drawCreature(g, tier, w / 2 + ox, h / 2 + (tier === 4 ? 12 : tier === 5 ? -8 : 0) * (w / 240), k, 1.3);
  });
}

/* ---- end of dive ---- */
function renderEnd() {
  var s = ui.summary;
  if (!s) { ui.screen = "start"; return render(); }
  var seen = [];
  s.results.forEach(function (r) { if (r.tier >= 0 && seen.indexOf(r.tier) < 0) seen.push(r.tier); });
  seen.sort();
  var rows = s.results.map(function (r) {
    if (r.type === "boss") return '<tr><td>7</td><td>Fusion Boss<small>Part A ' + (r.a ? "✓" : "✗") + ' · Part B ' + (r.b ? "✓" : "✗") + '</small></td><td>' + (r.tier >= 0 ? esc(CONFIG.tiers[r.tier].name) : "") + '</td><td>' + r.points + '</td></tr>';
    var how = r.correct ? [CONFIG.tiers[r.base].name].concat(r.bonuses.map(function (b) { return CONFIG.bonuses[b].label; })).join(" + ") : "Incorrect";
    return '<tr><td>' + r.n + '</td><td>' + esc(SECTION[r.section].short + " · " + (SKILL[r.skillId] ? SKILL[r.skillId].name : "") + " · " + DIFF_LABEL[r.difficulty]) + '<small>' + esc(how) + '</small></td><td>' + (r.correct ? esc(CONFIG.tiers[r.tier].name) : "✗") + '</td><td>' + r.points + '</td></tr>';
  }).join("");
  panel.innerHTML =
    '<h1>Dive complete</h1>' +
    '<div class="final"><span>Final score</span><b>' + s.final + '</b>' + (s.newBest ? '<em>New best</em>' : "") + '<small>' + CONFIG.finalMultiplier + ' × the lower tank</small></div>' +
    '<div class="stats two"><div><b>' + s.engine + '</b><span>Engine · Math</span></div><div><b>' + s.light + '</b><span>Light · Reading &amp; Writing</span></div></div>' +
    '<h3>Creatures collected</h3><div class="collected">' + (seen.length ? seen.map(function (t) { return '<figure><canvas class="creature" data-tier="' + t + '" width="160" height="80"></canvas><figcaption>' + esc(CONFIG.tiers[t].name) + '</figcaption></figure>'; }).join("") : '<p class="tiny">None this time.</p>') + '</div>' +
    '<h3>Missions</h3><table class="missions"><tbody>' + rows + '</tbody></table>' +
    '<p class="tip"><b>Tip.</b> ' + esc(s.tip) + '</p>' +
    '<button class="btn primary" data-act="free">Free Dive</button><button class="btn" data-act="home">Home</button>';
  paintCreatures();
}

/* ---- skill map ---- */
function renderMap() {
  var html = '<h1>Skill Map</h1><p class="lead">Every skill, colored by your accuracy on official questions.</p>' +
    '<p class="legend"><i class="c-none"></i>Not tried <i class="c-low"></i>Under 50% <i class="c-mid"></i>50 to 80% <i class="c-high"></i>Over 80%</p>';
  SECTIONS.forEach(function (sec) {
    html += '<h2>' + esc(sec.name) + '</h2>';
    sec.domains.forEach(function (d) {
      html += '<h3>' + esc(d.name) + '</h3><div class="tiles">';
      d.skills.forEach(function (s) {
        var st = stat(state, s.id), acc = st.a ? st.c / st.a : null;
        var cls = acc === null ? "c-none" : acc < 0.5 ? "c-low" : acc <= 0.8 ? "c-mid" : "c-high";
        html += '<div class="tile ' + cls + '"><b>' + esc(s.name) + '</b><span>' + (st.a ? Math.round(acc * 100) + "% · " + st.c + " of " + st.a + " correct" : "0 questions") + '</span></div>';
      });
      html += '</div>';
    });
  });
  panel.innerHTML = html + '<button class="btn" data-act="home">' + (state.dive ? "Back" : "Home") + '</button>';
}

/* ---- history, export, import ---- */
function renderHistory() {
  var list = state.log.slice().reverse();
  if (ui.missedOnly) list = list.filter(function (e) { return !e.correct; });
  var missed = state.log.filter(function (e) { return !e.correct; }).length;
  panel.innerHTML =
    '<h1>History</h1><p class="lead">' + state.log.length + ' official questions logged, ' + missed + ' missed. Look a missed one up by its ID in College Board\'s question bank to redo it.</p>' +
    '<div class="row two"><button class="btn' + (ui.missedOnly ? "" : " on") + '" data-act="hist-all">All</button><button class="btn' + (ui.missedOnly ? " on" : "") + '" data-act="hist-missed">Missed only</button></div>' +
    (list.length ? '<ul class="history">' + list.map(function (e) {
      return '<li class="' + (e.correct ? "ok" : "bad") + '"><b>' + (e.correct ? "✓" : "✗") + '</b><div><code>' + esc(e.id) + '</code><small>' + esc(labelFor(e.section, e.domain, e.skill, e.difficulty)) + (e.date ? " · " + esc(e.date) : "") + '</small></div></li>';
    }).join("") + '</ul>' : '<p class="tiny">Nothing here yet.</p>') +
    '<h3>Move progress between devices</h3>' +
    '<div class="row two"><button class="btn" data-act="export">Export file</button><button class="btn" data-act="import">Import file</button></div>' +
    '<p class="tiny">The file holds your scores, skill counts and question IDs. It never contains question text.</p>' +
    '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
    '<a class="btn" href="' + CONFIG.bankUrl + '" target="_blank" rel="noopener">Open Question Bank</a>' +
    '<button class="btn" data-act="home">' + (state.dive ? "Back" : "Home") + '</button>';
}
function exportFile() {
  var data = JSON.stringify({ app: "twin-tank-dive", exported: new Date().toISOString(), state: state }, null, 1);
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "twin-tank-dive-" + today() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}
function importFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var data;
    try { data = JSON.parse(reader.result); } catch (e) { data = null; }
    if (!data || data.app !== "twin-tank-dive" || !data.state) return alert("That isn't a Twin Tank Dive export file.");
    var next = cleanState(data.state);
    if (!confirm("Replace the progress on this device with the file? It has " + next.log.length + " logged questions and a best score of " + next.best + ".")) return;
    state = next; ui.q = null; ui.result = null; ui.summary = null;
    Store.save(); render();
  };
  reader.readAsText(file);
}

/* ---- wiring ---- */
var ACTIONS = {
  daily: function () { startDive("daily"); },
  free: function () { startDive("free"); },
  resume: function () { go("dive"); },
  home: function () {
    if ((ui.screen === "map" || ui.screen === "history") && ui.back === "dive" && state.dive) return go("dive");
    go("start");
  },
  recheck: function () { CB.detect().then(function () { if (ui.screen === "start") render(); }); render(); },
  swap: function () { changeSkill(state, state.dive); ui.q = null; Store.save(); renderDive(); },
  retry: function () { ui.q = null; renderDive(); },
  "reveal-solved": function () { doReveal("solved"); },
  "reveal-peek": function () { doReveal("peek"); },
  choose: function (el) { choose(+el.getAttribute("data-i")); },
  "log-correct": function () { logManual(true); },
  "log-incorrect": function () { logManual(false); },
  next: function () {
    ui.result = null;
    if (!state.dive && ui.summary) go("end"); else go("dive");
  },
  "hist-all": function () { ui.missedOnly = false; render(); },
  "hist-missed": function () { ui.missedOnly = true; render(); },
  export: exportFile,
  import: function () { $("import-file").click(); },
};
function doReveal(kind) {
  var d = state.dive, m = d.missions[d.index];
  if (!ui.q || ui.q.status !== "ready" || m.reveal) return;
  m.reveal = kind; ui.q.revealed = true;
  Store.save(); renderDive();
}

function boot() {
  panel = $("panel");
  Store.load();
  Scene.init($("sea"));
  panel.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (el && !el.disabled && ACTIONS[el.getAttribute("data-act")]) ACTIONS[el.getAttribute("data-act")](el);
  });
  panel.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.getAttribute("data-form") === "typed") submitTyped($("typed").value);
  });
  panel.addEventListener("change", function (e) {
    if (e.target.id === "import-file" && e.target.files[0]) importFile(e.target.files[0]);
    if (e.target.id === "typedq" && e.target.checked) $("nochoices").checked = true;
  });
  document.querySelector(".topbar").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.id === "mute") { state.muted = !state.muted; Store.save(); render(); if (!state.muted) Sound.ping(); return; }
    var dest = b.getAttribute("data-go");
    if (dest === "home") { if (ui.result && !state.dive && ui.summary) { ui.result = null; return go("end"); } return go("start"); }
    ui.back = ui.screen === "dive" ? "dive" : "start";
    go(dest);
  });
  document.addEventListener("keydown", function (e) {
    if (ui.screen !== "dive" || ui.result || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var i = "abcd".indexOf(e.key.toLowerCase()); if (i < 0) i = "1234".indexOf(e.key);
    if (i >= 0) choose(i);
  });
  // A dive left on its result card resumes at the next mission; a finished one shows nothing stale.
  render();
  CB.detect().then(function () { if (ui.screen === "start") render(); });
  root.__ttd = { ui: ui, CB: CB, Scene: Scene, getState: function () { return state; }, submit: submit, render: render };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

})(typeof window !== "undefined" ? window : globalThis);
