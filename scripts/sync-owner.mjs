import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPerson } from '../lib/wca.mjs';

const target = fileURLToPath(new URL('../public/data/2019CAIY01.json', import.meta.url));
console.log('正在获取蔡扬的 WCA 官方档案、成绩与比赛日期…');
const data = await loadPerson('2019CAIY01');
await mkdir(fileURLToPath(new URL('../public/data/', import.meta.url)), { recursive: true });
let exists = false;
try { await access(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (exists) {
  const dir = join(homedir(), '.pi', 'agent', 'backups', 'wca-statistics');
  await mkdir(dir, { recursive: true });
  const backup = join(dir, `2019CAIY01-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await copyFile(target, backup);
  console.log(`旧快照已备份：${backup}`);
}
await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`已保存：${target}\n${data.results.length} 轮成绩，${data.competitions.length} 场比赛。\n数据时间：${data.fetchedAt}`);
