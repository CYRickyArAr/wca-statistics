import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPerson } from '../lib/wca.mjs';
import { validId } from '../public/wca-data.js';

const config = JSON.parse(await readFile(new URL('../public/default-members.json', import.meta.url), 'utf8'));
const output = fileURLToPath(new URL('../public/data/', import.meta.url));
const backup = join(homedir(), '.pi', 'agent', 'backups', 'wca-statistics', `sync-defaults-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const failures = [];
for (const member of config.members) {
  if (!validId(member.id)) throw new Error(`无效 WCA ID：${member.id}`);
  console.log(`获取 ${member.name} / ${member.id}…`);
  try {
    const data = await loadPerson(member.id);
    const target = join(output, `${member.id}.json`);
    // 获取成功后才备份并替换，不因网络失败损坏现有快照。
    await mkdir(backup, { recursive: true });
    try { await copyFile(target, join(backup, `${member.id}.json`)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`已保存 ${data.results.length} 轮 / ${data.competitions.length} 场比赛`);
  } catch (error) {
    failures.push(member.id);
    console.error(`${member.id}：${error.message}，保留旧快照。`);
  }
}
if (failures.length) { console.error(`未更新：${failures.join('、')}`); process.exitCode = 1; }
else console.log(`全部 ${config.members.length} 位选手已更新。旧快照备份：${backup}`);
