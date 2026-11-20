#!/usr/bin/env node
// Runs the game at http://localhost:8080 and adds a small proxy so the game can
// pull random questions LIVE from the College Board SAT Suite Question Bank
// (browsers can't call College Board's API directly from another site).
//
//   node scripts/serve.mjs            # then open http://localhost:8080
//   PORT=3000 node scripts/serve.mjs

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listQuestions, fetchQuestion } from './cb-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Question lists are cached for an hour; question bodies for the session.
const listCache = new Map();
const questionCache = new Map();

async function getList(sectionKey) {
  const hit = listCache.get(sectionKey);
  if (hit && Date.now() - hit.at < 3600_000) return hit.rows;
  const rows = await listQuestions(sectionKey);
  listCache.set(sectionKey, { at: Date.now(), rows });
  return rows;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function api(url, res) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, live: true });

  if (url.pathname === '/api/cb/list') {
    // Returns metadata only (ids, difficulty, skill); bodies are fetched one at a time.
    const sections = (url.searchParams.get('sections') || 'math,rw').split(',').filter((s) => s === 'math' || s === 'rw');
    const rows = [];
    for (const s of sections) rows.push(...(await getList(s)));
    return send(res, 200, rows);
  }

  if (url.pathname === '/api/cb/question') {
    const id = url.searchParams.get('questionId');
    if (!id) return send(res, 400, { error: 'questionId required' });
    if (questionCache.has(id)) return send(res, 200, questionCache.get(id));
    let meta = null;
    for (const s of ['math', 'rw']) {
      const rows = listCache.get(s)?.rows || [];
      meta = rows.find((r) => r.questionId === id);
      if (meta) break;
    }
    if (!meta) return send(res, 404, { error: 'Unknown question; load /api/cb/list first' });
    const q = await fetchQuestion(meta);
    questionCache.set(id, q);
    return send(res, 200, q);
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(url, res);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || file.includes(`${path.sep}.git`)) return send(res, 403, 'Forbidden', 'text/plain');
    const data = await readFile(file);
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, 'Not found', 'text/plain');
    console.error(e.message);
    send(res, 502, { error: e.message });
  }
});

server.listen(port, () => {
  console.log(`SAT Racer running at http://localhost:${port}`);
  console.log('Live College Board questions are available while this server is running.');
});
