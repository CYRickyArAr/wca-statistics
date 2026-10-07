import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatResult, summary, leaderboard, personalBests, yearly } from '../public/stats.js';

const fixture = {
  id: '2019CAIY01',
  profile: { personal_records: { '333': { single: { best: 570 } } } },
  competitions: [{ id: 'A', start_date: '2024-01-01' }, { id: 'B', start_date: '2025-01-01' }],
  results: [
    { id: 3, competition_id: 'B', event_id: '333', round_type_id: 'f', pos: 4, best: 570, average: -1, attempts: [570, -1, -1, -2, 0] },
    { id: 2, competition_id: 'A', event_id: '333', round_type_id: 'f', pos: 4, best: 700, average: 800, attempts: [700, 800] },
    { id: 1, competition_id: 'A', event_id: '333', round_type_id: '1', pos: 8, best: 700, average: 900, attempts: [700, 900] },
  ],
};
test('WCA 成绩格式：分秒、DNF、DNS、最少步、多盲', () => {
  assert.equal(formatResult(570), '5.70');
  assert.equal(formatResult(6123), '1:01.23');
  assert.equal(formatResult(360001), '1:00:00.01');
  assert.equal(formatResult(-1), 'DNF');
  assert.equal(formatResult(-2), 'DNS');
  assert.equal(formatResult(0), '—');
  assert.equal(formatResult(undefined), '—');
  assert.equal(formatResult(25, '333fm'), '25');
  assert.equal(formatResult(2533, '333fm', 'average'), '25.33');
  // 10/12：差值 8，DD=91，30 分钟，2 个失败。
  assert.equal(formatResult(910180002, '333mbf'), '10/12 · 30:00');
});
test('统计排除 DNS 和未进行尝试，比赛去重', () => {
  assert.deepEqual(summary(fixture), { competitions: 2, rounds: 3, completed: 5,
    dnf: 2, dns: 1, dnfRate: 2 / 7 * 100, finals: 2, fourths: 2, podiums: 0 });
  assert.equal(summary(fixture, '222').dnfRate, null);
  assert.equal(yearly(fixture)[1].competitions, 1);
});
test('并列排行榜、缺失成绩及 PB 时间顺序', () => {
  const other = structuredClone(fixture); other.id = '2020TEST01';
  const third = structuredClone(fixture); third.id = '2020TEST02'; third.profile.personal_records['333'].single.best = 600;
  const absent = structuredClone(fixture); absent.id = '2020TEST03'; absent.profile.personal_records = {};
  assert.deepEqual(leaderboard([third, other, fixture, absent], '333', 'single').map(r => r.rank), [1, 1, 3]);
  assert.deepEqual(personalBests(fixture, '333', 'single').map(r => r.id), [1, 3]);
  assert.deepEqual(personalBests(fixture, '333', 'average').map(r => r.value), [900, 800]);
});
test('蔡扬的真实快照与官方个人最佳一致', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/2019CAIY01.json', import.meta.url), 'utf8'));
  assert.equal(data.id, '2019CAIY01');
  assert.equal(summary(data).competitions, data.profile.competition_count);
  for (const [event, record] of Object.entries(data.profile.personal_records)) {
    for (const type of ['single', 'average']) {
      if (record[type]) assert.equal(personalBests(data, event, type).at(-1).value, record[type].best);
    }
  }
});
