import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/', import.meta.url));
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(homedir(), '.pi', 'agent', 'tmp', `wca-pages-${Date.now()}`);
async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}
const files = await listFiles(source);
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file.replaceAll('\\', '/')).update('\0');
  hash.update(await readFile(path.join(source, file))).update('\0');
}
const version = hash.digest('hex').slice(0, 16);
// 只创建新输出目录，拒绝覆盖已有构建；本地默认输出到约定的临时目录。
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const releaseDir = path.join(output, 'releases', version);
for (const file of files) {
  if (['index.html', 'bootstrap.js', '.nojekyll'].includes(file)) continue;
  const target = path.join(releaseDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(source, file), target);
}
let html = await readFile(path.join(source, 'index.html'), 'utf8');
html = html.replace('name="site-version" content="development"', `name="site-version" content="${version}"`);
html = html.replace(/(href|src)="\.\/(style\.css|averages\.css|cube\.svg)"/g,
  (_, attribute, file) => `${attribute}="./releases/${version}/${file}"`);
html = html.replace('src="./bootstrap.js"', `src="./bootstrap.js?v=${version}"`);
await writeFile(path.join(output, 'index.html'), html, { flag: 'wx' });
await copyFile(path.join(source, 'bootstrap.js'), path.join(output, 'bootstrap.js'));
await writeFile(path.join(output, 'version.json'), JSON.stringify({ version }) + '\n', { flag: 'wx' });
await writeFile(path.join(output, '.nojekyll'), '', { flag: 'wx' });
console.log(`Pages release: ${version}\nOutput: ${output}`);
