// `designlapse dev`: serve the page, rebuild it when a design or the page template changes, and reload the browser.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './project.js';

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'template');
const EVENTS = '/__designlapse/events';
const RELOAD = `<script>(() => { const es = new EventSource('${EVENTS}'); es.onmessage = () => location.reload(); })();</script>`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const escapeHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function dev({ dir = 'designs', port = 4321, host = '127.0.0.1', current, log = console.log } = {}) {
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const clients = new Set();
  let error = null, timer = null;

  const rebuild = why => {
    try {
      const r = build({ dir, current });
      r.warnings.forEach(w => log(`warning: ${w}`));
      error = null;
      if (why) log(`rebuilt (${why})`);
    } catch (e) {
      error = e;
      log(`designlapse: ${e.message}`);
    }
    for (const res of clients) res.write('data: reload\n\n');
  };
  const schedule = why => { clearTimeout(timer); timer = setTimeout(() => rebuild(why), 120); };

  const watchers = [];
  const watch = (target, keep) => {
    try { watchers.push(fs.watch(target, { recursive: true }, (_, f) => { if (f && keep(String(f))) schedule(String(f)); })); }
    catch (e) { log(`can't watch ${target}: ${e.message}`); }
  };
  rebuild();
  watch(root, f => path.basename(f) !== 'designlapse.html');
  watch(TEMPLATE_DIR, () => true);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === EVENTS) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const rel = url.pathname === '/' ? '/designlapse.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (rel === '/designlapse.html' && error) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><title>Designlapse</title><pre style="font:14px/1.5 ui-monospace,monospace;padding:24px;white-space:pre-wrap">${escapeHtml(error.message)}</pre>${RELOAD}`);
    }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (rel === '/designlapse.html') {
        const html = buf.toString('utf8');
        const at = html.lastIndexOf('</body>');  // the page's own closing tag (earlier ones live inside its script)
        res.writeHead(200, headers);
        return res.end(at < 0 ? html + RELOAD : html.slice(0, at) + RELOAD + html.slice(at));
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
  });
  server.listen(port, host, () => {
    const p = server.address().port;
    log(`Designlapse dev server: http://localhost:${p}  (watching ${path.relative(process.cwd(), root) || '.'}; Ctrl+C to stop)`);
  });
  return {
    server,
    close() { clearTimeout(timer); watchers.forEach(w => w.close()); for (const r of clients) r.end(); server.close(); },
  };
}
