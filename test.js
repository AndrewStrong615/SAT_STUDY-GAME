// Automated tests for the scoring engine and mission selection.
// Run with:  node test.js
const assert = require("node:assert/strict");
const T = require("./game.js");

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok  " + name); }

// Builds a dive with exactly the missions we want.
function fixedDive(missions) {
  return { mode: "free", date: "2026-01-01", missions: missions.concat([{ type: "boss" }]), index: 0, engine: 0, light: 0, results: [], boss: { a: null, b: null } };
}

test("the spec's worked example: Engine 220, Light 175, final 350", () => {
  const state = T.newState();
  state.skills["m-alg-ineq"] = { a: 4, c: 1 }; // a weak skill: 25% over 4 attempts
  const dive = fixedDive([
    { type: "math", skillId: "m-alg-linf", difficulty: "medium" },
    { type: "rw", skillId: "rw-cs-wic", difficulty: "easy" },
    { type: "math", skillId: "m-alg-ineq", difficulty: "hard" },
    { type: "rw", skillId: "rw-ei-tr", difficulty: "medium" },
    { type: "math", skillId: "m-geo-cir", difficulty: "easy" },
    { type: "rw", skillId: "rw-ii-inf", difficulty: "hard" },
  ]);
  const day = "2026-01-01";
  const m1 = T.recordMission(state, dive, { qid: "q1", correct: true, noChoices: true }, day);
  assert.equal(m1.points, 60); assert.equal(m1.tank, "engine"); assert.deepEqual(m1.bonuses, ["noChoices"]);
  const m2 = T.recordMission(state, dive, { qid: "q2", correct: true }, day);
  assert.equal(m2.points, 25); assert.equal(m2.tank, "light"); assert.deepEqual(m2.bonuses, ["crossCurrent"]);
  const m3 = T.recordMission(state, dive, { qid: "q3", correct: true, noChoices: false }, day);
  assert.equal(m3.points, 100); assert.equal(m3.tank, "engine"); assert.equal(m3.capped, true);
  assert.deepEqual(m3.bonuses, ["weakSpot", "crossCurrent"]);
  const m4 = T.recordMission(state, dive, { qid: "q4", correct: false }, day);
  assert.equal(m4.points, 0);
  const m5 = T.recordMission(state, dive, { qid: "q5", correct: true, noChoices: false }, day);
  assert.equal(m5.points, 10); assert.equal(m5.tank, "engine"); assert.deepEqual(m5.bonuses, []);
  const m6 = T.recordMission(state, dive, { qid: "q6", correct: true }, day);
  assert.equal(m6.points, 100); assert.equal(m6.tank, "light"); assert.deepEqual(m6.bonuses, ["crossCurrent"]);
  assert.equal(T.recordBossPart(state, dive, { qid: "q7a", correct: true }, day).part, "a");
  const end = T.recordBossPart(state, dive, { qid: "q7b", correct: true }, day);
  assert.equal(end.boss.engine, 50); assert.equal(end.boss.light, 50); assert.equal(end.boss.points, 100);
  assert.equal(T.CONFIG.tiers[end.boss.tier].name, "One in a Krillion");
  assert.equal(end.summary.engine, 220);
  assert.equal(end.summary.light, 175);
  assert.equal(end.summary.final, 350);
  assert.equal(state.best, 350); assert.equal(state.dive, null); assert.equal(state.log.length, 8);
});

test("tier ladder and base tiers", () => {
  assert.deepEqual(T.CONFIG.tiers.map((t) => t.points), [10, 25, 40, 60, 80, 100]);
  const pts = (d) => T.scoreMission({ section: "rw", difficulty: d, correct: true }).points;
  assert.deepEqual([pts("easy"), pts("medium"), pts("hard")], [10, 40, 80]);
  assert.equal(T.scoreMission({ section: "rw", difficulty: "hard", correct: false }).points, 0);
});

test("bonus rules", () => {
  const s = (m, ctx) => T.scoreMission(Object.assign({ correct: true }, m), ctx);
  // weak spot needs under 50% AND at least 3 attempts
  assert.equal(s({ section: "rw", difficulty: "easy" }, { skillStat: { a: 2, c: 0 } }).points, 10);
  assert.equal(s({ section: "rw", difficulty: "easy" }, { skillStat: { a: 4, c: 2 } }).points, 10);
  assert.equal(s({ section: "rw", difficulty: "easy" }, { skillStat: { a: 3, c: 1 } }).points, 25);
  // cross-current needs the previous mission correct AND in the other section
  assert.equal(s({ section: "rw", difficulty: "easy" }, { prev: { correct: true, section: "rw" } }).points, 10);
  assert.equal(s({ section: "rw", difficulty: "easy" }, { prev: { correct: false, section: "math" } }).points, 10);
  // no choices is math only
  assert.equal(s({ section: "rw", difficulty: "easy", noChoices: true }).points, 10);
  assert.equal(s({ section: "math", difficulty: "easy", noChoices: true }).points, 25);
  // all three stack: easy Plankton -> Squid
  assert.equal(s({ section: "math", difficulty: "easy", noChoices: true }, { skillStat: { a: 3, c: 0 }, prev: { correct: true, section: "rw" } }).points, 60);
  // and never pass the top tier
  assert.equal(s({ section: "math", difficulty: "hard", noChoices: true }, { skillStat: { a: 3, c: 0 }, prev: { correct: true, section: "rw" } }).points, 100);
});

test("fusion boss and final score", () => {
  assert.deepEqual(T.scoreBoss(true, true), { engine: 50, light: 50, points: 100, tier: 5 });
  assert.deepEqual(T.scoreBoss(true, false), { engine: 0, light: 50, points: 50, tier: -1 });
  assert.deepEqual(T.scoreBoss(false, true), { engine: 50, light: 0, points: 50, tier: -1 });
  assert.equal(T.scoreBoss(false, false).points, 0);
  assert.equal(T.finalScore(220, 175), 350);
  assert.equal(T.finalScore(0, 300), 0);
});

test("a question ID can't be logged twice", () => {
  const state = T.newState();
  const dive = T.buildDive(state, "free", "2026-01-01");
  assert.ok(!T.recordMission(state, dive, { qid: " AB12 cd ", correct: true }, "2026-01-01").error);
  const again = T.recordMission(state, dive, { qid: "ab12CD", correct: true }, "2026-01-01");
  assert.match(again.error, /already logged/);
  assert.equal(dive.index, 1);
  assert.match(T.recordMission(state, dive, { qid: "  ", correct: true }, "2026-01-01").error, /Question ID/);
});

test("a dive has 7 missions in order, one easy/medium/hard per section, no repeated skill", () => {
  for (let i = 0; i < 200; i++) {
    const d = T.buildDive(T.newState(), "free", "2026-01-01");
    assert.deepEqual(d.missions.map((m) => m.type), ["math", "rw", "math", "rw", "math", "rw", "boss"]);
    for (const sec of ["math", "rw"]) {
      const ms = d.missions.filter((m) => m.type === sec);
      assert.deepEqual(ms.map((m) => m.difficulty).sort(), ["easy", "hard", "medium"]);
      ms.forEach((m) => assert.equal(T.SKILL[m.skillId].section, sec));
    }
    assert.equal(new Set(d.missions.filter((m) => m.skillId).map((m) => m.skillId)).size, 6);
  }
});

test("the Daily Dive is the same all day and changes with the date", () => {
  const a = T.buildDive(T.newState(), "daily", "2026-03-04"), b = T.buildDive(T.newState(), "daily", "2026-03-04");
  assert.deepEqual(a.missions, b.missions);
  const days = new Set();
  for (let d = 10; d < 30; d++) days.add(JSON.stringify(T.buildDive(T.newState(), "daily", "2026-03-" + d).missions));
  assert.ok(days.size > 15);
});

test("selection: about half weak skills, otherwise fewest attempts", () => {
  const state = T.newState();
  T.skillsOf("math").forEach((s) => { state.skills[s.id] = { a: 10, c: 9 }; });
  state.skills["m-geo-cir"] = { a: 10, c: 1 };   // weakest
  state.skills["m-alg-linf"] = { a: 10, c: 2 };
  state.skills["m-adv-eq"] = { a: 10, c: 3 };
  state.skills["m-psda-pct"] = { a: 1, c: 1 };   // fewest attempts
  const rng = T.seeded("selection"), n = 4000;
  let weak = 0, fewest = 0;
  for (let i = 0; i < n; i++) {
    const id = T.pickSkill("math", state, rng);
    if (["m-geo-cir", "m-alg-linf", "m-adv-eq"].includes(id)) weak++; else if (id === "m-psda-pct") fewest++; else assert.fail("unexpected skill " + id);
  }
  assert.ok(Math.abs(weak / n - 0.5) < 0.05, "weak share " + weak / n);
  assert.equal(weak + fewest, n);
  // with no history, every skill is fair game
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(T.pickSkill("rw", T.newState(), rng));
  assert.equal(seen.size, T.skillsOf("rw").length);
});

test("difficulty shifts up only after 5 dives and only for skills over 80%", () => {
  const state = T.newState();
  state.skills["m-alg-linf"] = { a: 10, c: 9 };
  state.skills["m-alg-sys"] = { a: 10, c: 8 };
  const one = () => 0, zero = () => 0.99;
  assert.equal(T.rampDifficulty("easy", "m-alg-linf", state, one), "easy");   // too few dives
  state.divesCompleted = 5;
  assert.equal(T.rampDifficulty("easy", "m-alg-linf", state, one), "medium");
  assert.equal(T.rampDifficulty("medium", "m-alg-linf", state, one), "hard");
  assert.equal(T.rampDifficulty("medium", "m-alg-linf", state, zero), "medium");
  assert.equal(T.rampDifficulty("hard", "m-alg-linf", state, one), "hard");
  assert.equal(T.rampDifficulty("easy", "m-alg-sys", state, one), "easy");    // exactly 80% is not over 80%
});

test("change skill gives a different skill in the same section", () => {
  const state = T.newState();
  for (let i = 0; i < 100; i++) {
    const d = T.buildDive(state, "free", "2026-01-01"), before = d.missions[0].skillId, diff = d.missions[0].difficulty;
    assert.ok(T.changeSkill(state, d));
    assert.notEqual(d.missions[0].skillId, before);
    assert.equal(T.SKILL[d.missions[0].skillId].section, "math");
    assert.equal(d.missions[0].difficulty, diff);
  }
});

test("daily streak counts consecutive days with a finished Daily Dive", () => {
  const state = T.newState();
  const finish = (mode, day) => { const d = T.buildDive(state, mode, day); d.index = 7; return T.finishDive(state, d, day); };
  finish("daily", "2026-02-27"); assert.equal(T.currentStreak(state, "2026-02-27"), 1);
  finish("daily", "2026-02-28"); assert.equal(T.currentStreak(state, "2026-02-28"), 2);
  finish("daily", "2026-03-01"); assert.equal(T.currentStreak(state, "2026-03-01"), 3);
  finish("free", "2026-03-02"); assert.equal(T.currentStreak(state, "2026-03-02"), 3);  // yesterday still counts
  assert.equal(T.currentStreak(state, "2026-03-03"), 0);                                // a missed day resets it
  finish("daily", "2026-03-05"); assert.equal(T.currentStreak(state, "2026-03-05"), 1);
  assert.equal(state.divesCompleted, 5);
});

test("saved data keeps only IDs, labels and results, and survives export/import", () => {
  const state = T.newState();
  const dive = T.buildDive(state, "free", "2026-01-01");
  state.dive = dive;
  T.recordMission(state, dive, { qid: "abc123", correct: true, noChoices: true }, "2026-01-01");
  assert.deepEqual(Object.keys(state.log[0]).sort(), ["correct", "date", "difficulty", "domain", "id", "section", "skill"]);
  const copy = T.cleanState(JSON.parse(JSON.stringify(state)));
  const plain = JSON.parse(JSON.stringify(state));
  assert.deepEqual(copy.log, plain.log); assert.deepEqual(copy.skills, plain.skills);
  assert.deepEqual(copy.dive.missions, plain.dive.missions);
  assert.equal(copy.dive.index, 1); assert.equal(copy.dive.engine, plain.dive.engine);
  assert.equal(copy.dive.results[0].points, plain.dive.results[0].points);
  assert.deepEqual(copy.dive.results[0].bonuses, ["noChoices"]);
  assert.deepEqual(JSON.parse(JSON.stringify(T.cleanState(JSON.parse(JSON.stringify(copy))))), JSON.parse(JSON.stringify(copy)));
  // junk in, safe defaults out
  const junk = T.cleanState({ best: "x", log: [{ id: "<b>", section: "nope" }, null, { id: "ok1", section: "math", skill: "bogus" }], skills: { bogus: { a: 5, c: 9 } }, dive: { missions: [] } });
  assert.equal(junk.best, 0); assert.equal(junk.log.length, 1); assert.equal(junk.log[0].skill, null); assert.deepEqual(junk.skills, {}); assert.equal(junk.dive, null);
});

test("typed answers: fractions and decimals that mean the same number match", () => {
  assert.ok(T.checkTyped("4.5", ["9/2", "4.5"]));
  assert.ok(T.checkTyped(" 9/2 ", ["4.5"]));
  assert.ok(T.checkTyped(".3333", ["1/3"]));
  assert.ok(T.checkTyped("-12", ["-12"]));
  assert.ok(!T.checkTyped("4.4", ["9/2"]));
  assert.ok(!T.checkTyped("", ["0"]));
  assert.ok(!T.checkTyped("abc", ["5"]));
});

test("live questions are matched by section, skill label and difficulty, and never repeat", () => {
  const list = [
    { questionId: "a1", section: "math", skill: "Linear inequalities in one or two variables", domainCode: "H", difficulty: "H" },
    { questionId: "a2", section: "math", skill: "Linear inequalities in one or two variables", domainCode: "H", difficulty: "E" },
    { questionId: "a3", section: "math", skill: "Linear functions", domainCode: "H", difficulty: "H" },
    { questionId: "a4", section: "math", skill: "Percentages", domainCode: "Q", difficulty: "H" },
    { questionId: "b1", section: "rw", skill: "Command of Evidence", domainCode: "INI", difficulty: "H" },
  ];
  const state = T.newState();
  const ids = (t) => T.rowsFor(list, t, state).pool.map((r) => r.questionId);
  assert.deepEqual(ids({ section: "math", skillId: "m-alg-ineq", difficulty: "hard" }), ["a1"]);
  assert.deepEqual(ids({ section: "math", domainId: "m-psda", difficulty: "hard" }), ["a4"]);
  assert.deepEqual(ids(T.CONFIG.boss.partA), ["b1"]);
  // a skill with no matching label falls back to its domain, and says so
  const loose = T.rowsFor(list, { section: "math", skillId: "m-alg-sys", difficulty: "hard" }, state);
  assert.equal(loose.loose, true); assert.deepEqual(loose.pool.map((r) => r.questionId), ["a1", "a3"]);
  state.log.push({ id: "a1" });
  assert.deepEqual(ids({ section: "math", skillId: "m-alg-ineq", difficulty: "hard" }), []);
  assert.equal(T.skillOfRow(list[0]), "m-alg-ineq");
  assert.equal(T.skillOfRow(list[4], "rw-ii-coe-quant"), "rw-ii-coe-quant");
});

console.log("\n" + passed + " tests passed");
