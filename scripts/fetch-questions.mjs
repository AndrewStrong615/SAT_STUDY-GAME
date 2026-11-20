#!/usr/bin/env node
// Downloads questions from the College Board SAT Suite Question Bank into
// data/cb-bank.js on YOUR computer, so the game can use them offline.
//
//   node scripts/fetch-questions.mjs                 # every SAT question (takes a while)
//   node scripts/fetch-questions.mjs --limit 300     # a random 300
//   node scripts/fetch-questions.mjs --section math  # math only (or: rw)
//
// data/cb-bank.js is git-ignored on purpose: the questions belong to College
// Board, so keep them for personal study and don't commit or publish them.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listQuestions, fetchQuestion } from './cb-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const section = opt('section', 'both');
const limit = Number(opt('limit', '0')) || 0;
const concurrency = Math.max(1, Math.min(8, Number(opt('concurrency', '4')) || 4));

const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cb-bank.js');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const keys = section === 'both' ? ['math', 'rw'] : [section];
  let metas = [];
  for (const k of keys) {
    process.stdout.write(`Listing ${k} questions... `);
    const rows = await listQuestions(k);
    console.log(`${rows.length} found`);
    metas.push(...rows);
  }
  shuffle(metas);
  if (limit) metas = metas.slice(0, limit);
  console.log(`Downloading ${metas.length} questions (${concurrency} at a time)...`);

  const out = [];
  let done = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < metas.length) {
      const m = metas[next++];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          out.push(await fetchQuestion(m));
          break;
        } catch (e) {
          if (attempt === 2) failed++;
          else await sleep(800 * (attempt + 1));
        }
      }
      done++;
      if (done % 25 === 0 || done === metas.length) {
        process.stdout.write(`\r  ${done}/${metas.length} done, ${failed} skipped`);
      }
      await sleep(120); // be polite to College Board's servers
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log();

  const header =
    '// Downloaded from the College Board SAT Suite Question Bank by scripts/fetch-questions.mjs.\n' +
    '// College Board content: personal study use only. Do not commit or publish this file.\n';
  await writeFile(outFile, `${header}window.CB_BANK = ${JSON.stringify(out)};\n`);
  console.log(`Saved ${out.length} questions to ${path.relative(process.cwd(), outFile)}`);
  console.log('Open index.html (or run: node scripts/serve.mjs) and pick "Downloaded bank" as the question source.');
}

main().catch((e) => {
  console.error(`\nCould not download questions: ${e.message}`);
  console.error('College Board may have changed the Question Bank. The game still works with its built-in questions.');
  process.exit(1);
});
