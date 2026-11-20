// Helpers for reading questions from the College Board SAT Suite Question Bank
// (https://satsuitequestionbank.collegeboard.org/). These are the same public
// JSON endpoints the Question Bank web app calls from your browser.
//
// Questions are College Board content. Use them for your own studying only,
// and do not commit or republish the downloaded data.

const API = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank';
const DISCLOSED = 'https://saic.collegeboard.org/disclosed';

export const SAT_EVENT_ID = 99; // 99 = SAT, 100 = PSAT/NMSQT & PSAT 10, 102 = PSAT 8/9

export const SECTIONS = {
  rw: { test: 1, name: 'Reading and Writing', domains: ['INI', 'CAS', 'EOI', 'SEC'] },
  math: { test: 2, name: 'Math', domains: ['H', 'P', 'Q', 'S'] },
};

const HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json',
  'user-agent': 'sat-study-game/1.0',
  origin: 'https://satsuitequestionbank.collegeboard.org',
  referer: 'https://satsuitequestionbank.collegeboard.org/',
};

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': HEADERS['user-agent'] } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

/** List question metadata (no question text) for one section: 'math' or 'rw'. */
export async function listQuestions(sectionKey) {
  const s = SECTIONS[sectionKey];
  if (!s) throw new Error(`Unknown section ${sectionKey}`);
  const rows = await postJson(`${API}/digital/get-questions`, {
    asmtEventId: SAT_EVENT_ID,
    test: s.test,
    domain: s.domains.join(','),
  });
  if (!Array.isArray(rows)) throw new Error('Unexpected question list format');
  return rows.map((r) => ({
    section: s.name,
    questionId: r.questionId,
    externalId: r.external_id || null,
    ibn: r.ibn || null,
    difficulty: r.difficulty || 'M',
    domain: r.primary_class_cd_desc || r.primary_class_cd || '',
    skill: r.skill_desc || r.skill_cd || '',
  }));
}

/** Fetch the full question for one metadata row and normalize it for the game. */
export async function fetchQuestion(meta) {
  let raw;
  if (meta.externalId) {
    raw = await postJson(`${API}/digital/get-question`, { external_id: meta.externalId });
    return normalizeDigital(meta, raw);
  }
  if (meta.ibn) {
    raw = await getJson(`${DISCLOSED}/${encodeURIComponent(meta.ibn)}.json`);
    return normalizeDisclosed(meta, Array.isArray(raw) ? raw[0] : raw);
  }
  throw new Error(`Question ${meta.questionId} has no id to fetch`);
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function base(meta) {
  return {
    id: `cb-${meta.questionId}`,
    source: 'College Board',
    section: meta.section,
    domain: meta.domain,
    skill: meta.skill,
    difficulty: meta.difficulty,
  };
}

function normalizeDigital(meta, q) {
  if (!q || (!q.stem && !q.stimulus)) throw new Error(`Question ${meta.questionId} came back empty`);
  const type = String(q.type || '').toLowerCase() === 'spr' ? 'spr' : 'mcq';
  const correct = Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer].filter(Boolean);
  const out = {
    ...base(meta),
    stimulus: q.stimulus || '',
    stem: q.stem || '',
    rationale: q.rationale || '',
    type,
  };
  if (type === 'mcq') {
    const opts = Array.isArray(q.answerOptions) ? q.answerOptions : [];
    out.choices = opts.map((o, i) => ({ letter: LETTERS[i], html: o.content || '' }));
    out.answer = String(correct[0] || '').trim().toUpperCase();
    if (!out.choices.length || !LETTERS.includes(out.answer)) throw new Error(`Question ${meta.questionId} has no usable answer`);
  } else {
    out.answer = correct.map((a) => String(a).trim()).filter(Boolean);
    if (!out.answer.length) throw new Error(`Question ${meta.questionId} has no usable answer`);
  }
  return out;
}

function normalizeDisclosed(meta, q) {
  if (!q) throw new Error(`Question ${meta.questionId} came back empty`);
  const ans = q.answer || {};
  const out = {
    ...base(meta),
    stimulus: q.body || '',
    stem: q.prompt || '',
    rationale: ans.rationale || '',
  };
  const choices = ans.choices && typeof ans.choices === 'object' ? Object.entries(ans.choices) : [];
  if (choices.length) {
    out.type = 'mcq';
    out.choices = choices.map(([k, v]) => ({ letter: k.toUpperCase(), html: (v && v.body) || '' }));
    out.answer = String(ans.correct_choice || '').toUpperCase();
  } else {
    out.type = 'spr';
    const c = ans.correct_choice ?? ans.correct_answer ?? '';
    out.answer = String(c).split(/,|\bor\b/).map((s) => s.trim()).filter(Boolean);
  }
  if (!out.answer || !out.answer.length) throw new Error(`Question ${meta.questionId} has no usable answer`);
  return out;
}
