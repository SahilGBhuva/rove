#!/usr/bin/env node
/* Local stand-in for the Vercel preview: serves site/ and runs api/v2/*.mjs handlers with a
 * minimal Vercel-style req/res. For development and browser tests only.
 * Usage: node scripts/preview-site.mjs [port]   (default 4321, binds to 127.0.0.1) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const port = Number(process.argv[2] || process.env.PORT || 4321);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8' };
const handlers = new Map();

async function apiHandler(urlPath) {
  const rel = urlPath.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[\w/-]+$/.test(rel)) return null;
  const file = path.join(root, 'api', rel + '.mjs');
  if (!file.startsWith(path.join(root, 'api') + path.sep) || !fs.existsSync(file)) return null;
  if (!handlers.has(file)) handlers.set(file, (await import(pathToFileURL(file).href)).default);
  return handlers.get(file);
}

function vercelResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
  res.send = body => { res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = await apiHandler(url.pathname);
      if (!handler) { res.statusCode = 404; return res.end('Not found'); }
      req.query = Object.fromEntries(url.searchParams);
      if (req.method === 'POST') {
        const chunks = []; for await (const c of req) chunks.push(c);
        try { req.body = JSON.parse(Buffer.concat(chunks).toString() || 'null'); } catch { req.body = null; }
      }
      return await handler(req, vercelResponse(res));
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(site, rel));
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) { res.statusCode = 500; res.end('Server error'); }
  }
}).listen(port, '127.0.0.1', () => console.log(`Rove site preview: http://localhost:${port}`));
