/**
 * THE MULTIVERSE: SIMOLYSIS — static preview server.
 *
 * Binds 0.0.0.0 so the sandbox preview proxy can reach it, sets no
 * framing/origin restrictions (the preview is a cross-origin iframe),
 * supports HTTP range requests (audio seeking) and gzips text assets.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.json', '.css', '.svg', '.txt', '.md', '.map']);

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null; // path traversal guard
  return full;
}

/**
 * Runtime telemetry from whatever browser is looking at the game.
 *
 * The sandbox has no GPU to run the page in, so the only way a boot failure
 * becomes visible here is if the page tells us about it. The client beacons
 * to POST /__diag and the reports land in diag.log next to this file.
 */
const DIAG_LOG = path.join(root, 'diag.log');
const diagReports = [];

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

/**
 * Rewrite asset URLs in HTML with a build stamp.
 *
 * The preview is proxied and browser-cached, and `bundle.js` keeps its name
 * across rebuilds — which is how a player ends up running yesterday's code
 * and reporting a bug that was fixed an hour ago. Stamping the query string
 * makes every build a new URL, and the HTML itself is never cached.
 */
function stampHtml(html, file) {
  const dir = path.dirname(file);
  const stamp = (name) => {
    const target = path.join(dir, name);
    const stat = fs.existsSync(target) ? fs.statSync(target) : null;
    return stat ? `${name}?v=${Math.floor(stat.mtimeMs).toString(36)}` : name;
  };
  return html
    .replace(/("|\.\/)(bundle\.js)(")/g, (match, a, name, b) => `${a}${stamp(name)}${b}`)
    .replace(/("|\.\/)(style\.css)(")/g, (match, a, name, b) => `${a}${stamp(name)}${b}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    if (url === '/__diag') {
      if (req.method === 'POST') {
        const body = await readBody(req);
        const stamp = new Date().toISOString().slice(11, 23);
        const line = `[${stamp}] ${body.slice(0, 4000)}`;
        diagReports.push(line);
        if (diagReports.length > 400) diagReports.shift();
        fsp.appendFile(DIAG_LOG, line + '\n').catch(() => {});
        console.log(`[diag] ${body.slice(0, 400)}`);
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(diagReports.join('\n') || '(no diagnostics yet)');
    }
    if (url === '/__diag/clear') {
      diagReports.length = 0;
      fsp.writeFile(DIAG_LOG, '').catch(() => {});
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('method not allowed');
    }
    let file = safeJoin(req.url || '/');
    if (!file) {
      res.writeHead(403).end('forbidden');
      return;
    }
    // The game lives in game/. A bare visit to the preview root should land
    // in it rather than 404 — relative asset paths then resolve correctly.
    if ((url === '/' || url === '/index.html') && !fs.existsSync(file)) {
      res.writeHead(302, { Location: '/game/' });
      return res.end();
    }
    let stat = await fsp.stat(file).catch(() => null);
    if (stat?.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = await fsp.stat(file).catch(() => null);
    }
    if (!stat?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 — ${req.url}\n(the multiverse has no such reality)`);
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
    // Scripts are rebuilt in place during development, and a cached copy of an
    // old bundle looks exactly like a bug in new code. Never cache them.
    const cacheControl = ext === '.js' || ext === '.mjs' || ext === '.css' ? 'no-store, must-revalidate' : 'no-cache';
    const headers = {
      'Content-Type': type,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Accept-Ranges': 'bytes',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    // Range requests (audio/video seeking)
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = String(end - start + 1);
        res.writeHead(206, headers);
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }

    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (acceptsGzip && COMPRESSIBLE.has(ext) && stat.size > 2048) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    }

    // HTML: never cached, and always stamped so a rebuild is picked up.
    if (ext === '.html') {
      const html = stampHtml(await fsp.readFile(file, 'utf8'), file);
      const body = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        ...headers,
        'Cache-Control': 'no-store, must-revalidate',
        'Content-Length': String(body.length),
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(body);
    }

    headers['Content-Length'] = String(stat.size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error('[serve] error', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('internal error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] THE MULTIVERSE running at http://${HOST}:${PORT}  (root: ${root})`);
});
