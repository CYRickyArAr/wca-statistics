import { orderedResults } from './stats.js';

export const AO_SIZES = [5, 12, 25, 50, 100];
export const supportsAverage = event => !['333mbf', '333mbo'].includes(event);
const cache = new WeakMap();

// API 中 0 是未进行的占位，不是一条正式尝试。DNF / DNS 保留在序列里。
export function attemptSequence(data, event) {
  let index = 0;
  return orderedResults(data, event).flatMap(row => (row.attempts || []).flatMap((value, attempt) => {
    if (!(value > 0 || value === -1 || value === -2)) return [];
    return [{ value, index: index++, attempt: attempt + 1, resultId: row.id,
      competitionId: row.competition_id, competition: row.competition,
      round: row.round_type_id }];
  }));
}
const comparable = value => value > 0 ? value : Infinity;
function lowerBound(array, value) {
  let lo = 0, hi = array.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (array[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo;
}
function fromSorted(sorted, size, event) {
  const trim = Math.ceil(size * .05);
  if (sorted[size - trim - 1] === Infinity) return -1;
  let sum = 0;
  for (let i = trim; i < size - trim; i++) sum += sorted[i];
  // 对应参考实现：先算均值，FMC 乘 100，最后四舍五入。
  return Math.round(sum / (size - 2 * trim) * (event === '333fm' ? 100 : 1));
}
export function rollingAverage(attempts, size, event) {
  if (!AO_SIZES.includes(size)) throw new RangeError('不支持的 Ao 窗口。');
  const result = { size, count: attempts.length, trim: Math.ceil(size * .05), windows: [], best: null, latest: null };
  if (!supportsAverage(event) || attempts.length < size) return result;
  const sorted = attempts.slice(0, size).map(a => comparable(a.value)).sort((a, b) => a - b);
  for (let start = 0; start <= attempts.length - size; start++) {
    if (start > 0) {
      const old = comparable(attempts[start - 1].value), next = comparable(attempts[start + size - 1].value);
      sorted.splice(lowerBound(sorted, old), 1);
      sorted.splice(lowerBound(sorted, next), 0, next);
    }
    const value = fromSorted(sorted, size, event);
    const window = { start, end: start + size - 1, value };
    result.windows.push(window);
    if (value > 0 && (!result.best || value < result.best.value)) result.best = window;
    result.latest = window;
  }
  return result;
}
export function analyzeAverages(data, event) {
  if (!cache.has(data)) cache.set(data, new Map());
  const byEvent = cache.get(data);
  if (!byEvent.has(event)) {
    const attempts = attemptSequence(data, event);
    const bySize = Object.fromEntries(AO_SIZES.map(size => [size, rollingAverage(attempts, size, event)]));
    byEvent.set(event, { attempts, bySize, supported: supportsAverage(event),
      missingDates: attempts.some(a => !a.competition?.start_date) });
  }
  return byEvent.get(event);
}
export function windowBreakdown(attempts, window, size) {
  if (!window) return [];
  const rows = attempts.slice(window.start, window.end + 1).map((a, offset) => ({ ...a, offset, excluded: null }));
  // 持平成绩按窗口内的原始顺序打破平局，保证两端的剔除次数精确。
  const sorted = [...rows].sort((a, b) => {
    const x = comparable(a.value), y = comparable(b.value);
    return x === y ? a.offset - b.offset : x - y;
  });
  const trim = Math.ceil(size * .05);
  sorted.slice(0, trim).forEach(row => { row.excluded = 'fast'; });
  sorted.slice(-trim).forEach(row => { row.excluded = 'slow'; });
  return rows;
}
export function averageRanking(people, event, size, mode = 'best') {
  let previous, rank = 0;
  return people.map(data => {
    const analysis = analyzeAverages(data, event);
    const metric = analysis.bySize[size];
    return { data, analysis, metric, window: metric[mode] };
  }).filter(row => row.window?.value > 0)
    .sort((a, b) => a.window.value - b.window.value || a.data.id.localeCompare(b.data.id))
    .map((row, i) => { if (row.window.value !== previous) rank = i + 1; previous = row.window.value; return { ...row, rank }; });
}
