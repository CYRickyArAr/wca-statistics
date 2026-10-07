import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AO_SIZES, attemptSequence, rollingAverage, analyzeAverages, windowBreakdown, averageRanking } from '../public/averages.js';
import { renderPersonal, renderRanking, renderRules } from '../public/average-views.js';
const attempts = values => values.map((value, index) => ({ value, index }));
function person(values, id = '2019CAIY01') {
  return { id, fetchedAt: '2026-01-01T00:00:00Z', profile: { person: { wca_id: id, name: 'Test (测试)' }, personal_records: {} },
    competitions: [{ id: 'Test2025', start_date: '2025-01-01', name: 'Test 2025' }],
    results: [{ id: 1, competition_id: 'Test2025', event_id: '333', round_type_id: '1', attempts: values }] };
}
// 直译参考实现的逐窗口排序，用作与增量滑动算法对照的独立实现。
function reference(values, size, event) {
  const trim = Math.ceil(size * .05), windows = [];
  for (let i = 0; i + size <= values.length; i++) {
    const middle = values.slice(i, i + size).map(v => v > 0 ? v : Infinity)
      .sort((a, b) => a - b).slice(trim, -trim);
    windows.push(middle.at(-1) === Infinity ? -1 : Math.round(middle.reduce((a, b) => a + b, 0) / middle.length * (event === '333fm' ? 100 : 1)));
  }
  return windows;
}
test('Ao12/25/50/100 两端去尾、DNF/DNS 容忍阈值、FMC 单位', () => {
  for (const n of AO_SIZES) {
    const trim = Math.ceil(n * .05);
    const good = [...Array(n - trim).fill(1000), ...Array(trim).fill(-1)];
    assert.equal(rollingAverage(attempts(good), n, '333').best.value, 1000);
    good[0] = -2;
    const failed = rollingAverage(attempts(good), n, '333');
    assert.equal(failed.best, null);
    assert.equal(failed.latest.value, -1);
  }
  const values = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.equal(rollingAverage(attempts(values), 12, '333fm').best.value, 650);
  assert.equal(rollingAverage(attempts(values), 12, '333').best.value, 7);
});
test('连续尝试跨轮次与比赛，保留 DNF/DNS，跳过占位 0', () => {
  const data = person([100, 200, 0]);
  data.competitions.push({ id: 'Later2025', start_date: '2025-02-01' });
  data.results.unshift({ id: 3, event_id: '333', competition_id: 'Later2025', round_type_id: 'f', attempts: [400, 500] });
  data.results.push({ id: 2, event_id: '333', competition_id: 'Test2025', round_type_id: 'f', attempts: [-1, -2, 300] });
  data.results.push({ id: 4, event_id: '222', competition_id: 'Later2025', round_type_id: '1', attempts: [999] });
  const sequence = attemptSequence(data, '333');
  assert.deepEqual(sequence.map(a => a.value), [100, 200, -1, -2, 300, 400, 500]);
  assert.equal(sequence[4].attempt, 3);
  assert.equal(analyzeAverages(data, '333').bySize[5].windows.length, 3);
});
test('不足次数不伪造、最佳不是最快 N 次、最近窗口可以是 DNF', () => {
  assert.equal(rollingAverage(attempts([100, 200]), 12, '333').latest, null);
  const result = rollingAverage(attempts([100, 100, 100, 100, 100, 900, 900, -1, -2]), 5, '333');
  assert.equal(result.best.value, 100);
  assert.equal(result.best.start, 0);
  assert.equal(result.latest.value, -1);
  assert.equal(result.windows.length, 5);
  const gaps = rollingAverage(attempts([100, 100, 900, 900, 900, 100, 100]), 5, '333');
  assert.equal(gaps.best.value, 633);
});
test('增量窗口与参考逐窗口排序一致；最佳平局保留首个', () => {
  let seed = 7;
  const values = Array.from({ length: 350 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % 31 === 0 ? -2 : seed % 17 === 0 ? -1 : 100 + seed % 1500;
  });
  for (const n of AO_SIZES) {
    for (const event of ['333', '333fm']) {
      assert.deepEqual(rollingAverage(attempts(values), n, event).windows.map(w => w.value), reference(values, n, event));
    }
  }
  assert.equal(rollingAverage(attempts(Array(20).fill(100)), 12, '333').best.start, 0);
});
test('组成保留原顺序、相同成绩精确去尾、排行榜并列且排除无效值', () => {
  const data = person(Array(25).fill(100));
  const analysis = analyzeAverages(data, '333'), metric = analysis.bySize[25];
  const rows = windowBreakdown(analysis.attempts, metric.best, 25);
  assert.deepEqual(rows.map(r => r.index), Array.from({ length: 25 }, (_, i) => i));
  assert.equal(rows.filter(r => r.excluded === 'fast').length, 2);
  assert.equal(rows.filter(r => r.excluded === 'slow').length, 2);
  assert.equal(rows.filter(r => !r.excluded).length, 21);
  const ranking = averageRanking([data, person(Array(25).fill(100), '2020TEST01'), person(Array(25).fill(200), '2020TEST02'), person([-1], '2020TEST03')], '333', 25);
  assert.deepEqual(ranking.map(r => r.rank), [1, 1, 3]);
  assert.equal(analyzeAverages(data, '333mbf').bySize[25].best, null);
});
test('真实快照 Ao 与参考算法一致，页面能生成且不再显示官方 PB', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/2019CAIY01.json', import.meta.url), 'utf8'));
  for (const event of ['333', '222', '444', '333oh', 'pyram']) {
    const analysis = analyzeAverages(data, event);
    for (const n of AO_SIZES) assert.deepEqual(analysis.bySize[n].windows.map(w => w.value), reference(analysis.attempts.map(a => a.value), n, event));
  }
  const state = { event: '333', size: 100, mode: 'best', busy: false };
  const html = renderPersonal(data, state);
  assert.match(html, /历史最佳连续平均/);
  assert.match(html, /成绩来源（100 次）/);
  assert.doesNotMatch(html, /WR 世界|官方奖牌|世界排名|两端各去|连续序列包含|不是官网的轮次平均/);
  assert.match(renderRanking([data], 1, state), /Ao100 排行榜/);
  assert.match(renderRules(), /ceil\(N × 5%\)/);
});
