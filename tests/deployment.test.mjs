import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { OWNER } from '../public/stats.js';
import { sortMembers } from '../public/member-order.js';
import { mergeDefaultMembers, newerSnapshot, loadDirectPerson, isSnapshot } from '../public/wca-data.js';

const config = JSON.parse(await readFile(new URL('../public/default-members.json', import.meta.url), 'utf8'));
test('默认十一位成员均有匹配姓名和 ID 的完整快照', async () => {
  assert.equal(config.members.length, 11);
  assert.equal(new Set(config.members.map(m => m.id)).size, 11);
  for (const member of config.members) {
    const data = JSON.parse(await readFile(new URL(`../public/data/${member.id}.json`, import.meta.url), 'utf8'));
    assert.ok(isSnapshot(data, member.id));
    assert.ok(data.profile.person.name.includes(`(${member.name})`));
    assert.ok(data.results.length > 0);
    assert.ok(data.competitions.length > 0);
  }
});
test('默认名单迁移不覆盖旧成员，手动删除后不反复加入', () => {
  assert.equal(mergeDefaultMembers(null, config, OWNER).ids.length, 11);
  const custom = '2020TEST01';
  const migrated = mergeDefaultMembers({ ids: [OWNER, custom] }, config, OWNER);
  assert.equal(migrated.ids.length, 12);
  assert.ok(migrated.ids.includes(custom));
  const removed = { ...migrated, ids: migrated.ids.filter(id => id !== '2018HUAN08') };
  assert.deepEqual(mergeDefaultMembers(removed, config, OWNER).ids, removed.ids);
  assert.ok(mergeDefaultMembers(removed, { ...config, version: 'next-version' }, OWNER).ids.includes('2018HUAN08'));
  assert.deepEqual(mergeDefaultMembers({ ids: [OWNER, '../invalid', OWNER], defaultVersion: config.version }, config, OWNER).ids, [OWNER]);
});
test('成员按姓氏拼音排序，同姓按名字，多音姓曾使用 Zeng', async () => {
  const expected = ['蔡扬', '蔡子健', '陈震', '范柏轩', '黄华', '李庆泽', '温韬', '徐嘉乐', '曾浩锴', '张博藩', '周向民'];
  assert.deepEqual(sortMembers([...config.members].reverse()).map(m => m.name), expected);
  const loaded = await Promise.all(config.members.map(async member => {
    const data = JSON.parse(await readFile(new URL(`../public/data/${member.id}.json`, import.meta.url), 'utf8'));
    return { id: member.id, name: data.profile.person.name };
  }));
  assert.deepEqual(sortMembers(loaded).map(m => m.id), config.members.map(m => m.id));
});
test('更新部署后的快照与浏览器缓存选择时间较新的版本', () => {
  const old = { fetchedAt: '2025-01-01T00:00:00Z' }, fresh = { fetchedAt: '2026-01-01T00:00:00Z' };
  assert.equal(newerSnapshot(old, fresh), fresh);
  assert.equal(newerSnapshot(fresh, old), fresh);
  assert.equal(newerSnapshot(null, old), old);
});
test('静态网站直连 API 的数据格式与本地快照一致，404 不写入缓存', async () => {
  const data = JSON.parse(await readFile(new URL(`../public/data/${OWNER}.json`, import.meta.url), 'utf8'));
  const urls = [];
  const result = await loadDirectPerson(OWNER, async (url, options) => {
    urls.push(url);
    assert.equal(options.credentials, 'omit');
    const value = url.endsWith('/results') ? data.results : url.endsWith('/competitions') ? data.competitions : data.profile;
    return { ok: true, json: async () => value };
  });
  assert.ok(isSnapshot(result, OWNER));
  assert.equal(urls.length, 3);
  assert.ok(urls.every(url => url.startsWith(`https://www.worldcubeassociation.org/api/v0/persons/${OWNER}`)));
  assert.deepEqual(result.results, data.results);
  await assert.rejects(loadDirectPerson(OWNER, async () => ({ ok: false, status: 404 })), /未找到/);
});
test('GitHub 仓库子目录下的静态资源均为相对路径且文件存在', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  const base = 'https://example.github.io/wca-statistics/';
  const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    assert.ok(new URL(ref, base).pathname.startsWith('/wca-statistics/'));
    await access(new URL(`../public/${ref}`, import.meta.url));
  }
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /path: public/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
