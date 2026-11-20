#!/usr/bin/env node
// SAT Streak helper server. YOU PROBABLY DON'T NEED THIS.
//
// index.html talks to the College Board question bank directly from the
// browser. Only if your browser blocks that connection, run:
//
//   node server.mjs          # then open http://localhost:8080
//   PORT=3000 node server.mjs
//
// It serves index.html and forwards the game's three question requests to the
// public JSON endpoints behind the College Board SAT Suite Question Bank
// (https://satsuitequestionbank.collegeboard.org/). Needs Node 18+.
//
// The questions are College Board content. Nothing is saved to disk, and the
// server only listens on this computer. Use the questions for your own
// studying; don't republish them or host this server publicly.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = process.env.CB_API || 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank';
const DISCLOSED = process.env.CB_DISCLOSED || 'https://saic.collegeboard.org/disclosed';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => { data += d; if (data.length > 10_000) reject(new Error('request too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function forward(url, body) {
  const headers = { accept: 'application/json', 'user-agent': 'sat-streak/1.0' };
  const opt = { headers, signal: AbortSignal.timeout(20000) };
  if (body != null) { opt.method = 'POST'; opt.body = body; headers['content-type'] = 'application/json'; }
  const r = await fetch(url, opt);
  return { status: r.status, text: await r.text() };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // ---- the three pass-through routes ----
    if (req.method === 'POST' && (url.pathname === '/api/cb/get-questions' || url.pathname === '/api/cb/get-question')) {
      const body = await readBody(req);
      JSON.parse(body); // must be JSON
      const out = await forward(`${API}/digital/${url.pathname.split('/').pop()}`, body);
      return send(res, out.status, out.text);
    }
    const m = url.pathname.match(/^\/api\/cb\/disclosed\/([\w.-]+)$/);
    if (req.method === 'GET' && m) {
      const out = await forward(`${DISCLOSED}/${encodeURIComponent(m[1])}.json`, null);
      return send(res, out.status, out.text);
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, '{"error":"not found"}');

    // ---- static files ----
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || file.includes(`${path.sep}.git`)) return send(res, 403, 'Forbidden', 'text/plain');
    send(res, 200, await readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, 'Not found', 'text/plain');
    send(res, 502, JSON.stringify({ error: e.message }));
  }
});

server.listen(port, '127.0.0.1', () => { // this computer only
  console.log(`SAT Streak running at http://localhost:${port}`);
});
