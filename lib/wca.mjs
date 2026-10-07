import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { validId, normalizePerson } from '../public/wca-data.js';
export { validId } from '../public/wca-data.js';
const exec = promisify(execFile);
const base = 'https://www.worldcubeassociation.org/api/v0';

async function request(path) {
  // Windows 的系统 curl 也能兼容本机常见的网络代理 / TUN 配置。
  const url = `${base}${path}`;
  let text;
  try {
    const { stdout } = await exec('curl', ['--silent', '--show-error', '--location', '--fail-with-body',
      '--connect-timeout', '12', '--max-time', '50', '--max-filesize', '20000000', url],
    { windowsHide: true, timeout: 55000, maxBuffer: 20 * 1024 * 1024 });
    text = stdout;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const response = await fetch(url, { signal: AbortSignal.timeout(50000) });
      if (!response.ok) throw new Error(response.status === 404 ? '未找到这个 WCA ID。' : `WCA 返回 HTTP ${response.status}，请稍后重试。`);
      text = await response.text();
    } else {
      if (String(error.stderr).includes('404')) throw new Error('未找到这个 WCA ID，请核对后重试。');
      throw new Error('暂时无法连接 WCA。请检查网络，稍后重试；已有缓存不会丢失。');
    }
  }
  try { return JSON.parse(text); } catch { throw new Error('WCA 返回了非 JSON 数据，请稍后重试。'); }
}

export async function loadPerson(id) {
  if (!validId(id)) throw new Error('WCA ID 格式不正确，例如 2019CAIY01。');
  const profile = await request(`/persons/${id}`);
  if (profile.person?.wca_id !== id || !profile.personal_records) throw new Error('WCA 选手数据不完整。');
  const [results, competitions] = await Promise.all([
    request(`/persons/${id}/results`), request(`/persons/${id}/competitions`),
  ]);
  return normalizePerson(id, profile, results, competitions);
}
