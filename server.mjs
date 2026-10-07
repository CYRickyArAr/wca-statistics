import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPerson, validId } from './lib/wca.mjs';

const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const port = Number(process.env.PORT || 5288);
const cache = new Map();
const pending = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://www.worldcubeassociation.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  // 只允许本机 Host，避免 DNS rebinding；不开放跨域 API。
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: '仅供本机访问。' });
  if (req.method !== 'GET') return json(res, 405, { error: '不支持此方法。' });
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/person/')) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '不允许跨站请求。' });
      const id = url.pathname.slice('/api/person/'.length).toUpperCase();
      if (!validId(id)) return json(res, 400, { error: 'WCA ID 格式不正确。' });
      const saved = cache.get(id);
      // 至少缓存一分钟，普通请求缓存六小时；刷新不会无限触发上游请求。
      if (saved && Date.now() - saved.time < (url.searchParams.has('refresh') ? 60000 : 21600000)) return json(res, 200, saved.data);
      if (!pending.has(id)) {
        if (pending.size >= 3) return json(res, 429, { error: '正在更新其他选手，请稍后重试。' });
        pending.set(id, loadPerson(id).then(data => {
          if (cache.size >= 100) cache.delete(cache.keys().next().value);
          cache.set(id, { data, time: Date.now() });
          return data;
        }).finally(() => pending.delete(id)));
      }
      try { return json(res, 200, await pending.get(id)); }
      catch (error) { return json(res, 502, { error: error.message }); }
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${relative}`);
    if (!target.startsWith(root + path.sep)) return json(res, 403, { error: '禁止访问。' });
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (error) {
    json(res, error.code === 'ENOENT' ? 404 : 400, { error: '无法读取页面。' });
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被其他应用占用，请设置 PORT 更换端口后再启动。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`\nWCA 连续平均统计已启动\nhttp://localhost:${port}\n保持此窗口打开，按 Ctrl+C 停止。\n`));
