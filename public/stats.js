export const OWNER = '2019CAIY01';
export const EVENTS = [
  ['333', '三阶'], ['222', '二阶'], ['444', '四阶'], ['555', '五阶'], ['666', '六阶'], ['777', '七阶'],
  ['333bf', '三阶盲拧'], ['333fm', '最少步'], ['333oh', '三阶单手'], ['clock', '魔表'],
  ['minx', '五魔方'], ['pyram', '金字塔'], ['skewb', '斜转'], ['sq1', 'Square-1'],
  ['444bf', '四阶盲拧'], ['555bf', '五阶盲拧'], ['333mbf', '多盲'],
  ['333ft', '脚拧（历史）'], ['magic', '魔板（历史）'], ['mmagic', '大魔板（历史）'], ['333mbo', '旧多盲（历史）'],
];
export const eventName = id => EVENTS.find(e => e[0] === id)?.[1] || id;
export const roundName = id => ({ '0': '资格赛', '1': '第一轮', '2': '第二轮', '3': '半决赛',
  f: '决赛', b: 'B 组决赛', c: '合并决赛', d: '合并第一轮', e: '合并第二轮', g: '合并第三轮', h: '合并资格赛' })[id] || id;
function seconds(n) {
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
export function formatResult(value, event = '333', type = 'single') {
  if (value === -1) return 'DNF';
  if (value === -2) return 'DNS';
  if (!Number.isFinite(value) || value === 0) return '—';
  if (event === '333fm') return type === 'average' ? (value / 100).toFixed(2) : String(value);
  if (event === '333mbf') {
    const missed = value % 100;
    const solved = 99 - Math.floor(value / 10000000) + missed;
    const time = Math.floor(value / 100) % 100000;
    return `${solved}/${solved + missed} · ${time === 99999 ? '时间未知' : seconds(time)}`;
  }
  if (event === '333mbo') return `${value}（旧制编码）`;
  if (value < 6000) return (value / 100).toFixed(2);
  return `${seconds(Math.floor(value / 100))}.${String(value % 100).padStart(2, '0')}`;
}
export function orderedResults(data, event) {
  const comps = new Map(data.competitions.map(c => [c.id, c]));
  const rounds = ['0', 'h', '1', 'd', '2', 'e', '3', 'g', 'b', 'f', 'c'];
  return data.results.filter(r => !event || r.event_id === event).map(r => ({ ...r, competition: comps.get(r.competition_id) }))
    .sort((a, b) => (a.competition?.start_date || '9999').localeCompare(b.competition?.start_date || '9999')
      || a.competition_id.localeCompare(b.competition_id)
      || rounds.indexOf(a.round_type_id) - rounds.indexOf(b.round_type_id) || a.id - b.id);
}
export function summary(data, event) {
  const rows = data.results.filter(r => !event || r.event_id === event);
  const attempts = rows.flatMap(r => r.attempts || []);
  const completed = attempts.filter(v => v > 0).length;
  const dnf = attempts.filter(v => v === -1).length;
  const dns = attempts.filter(v => v === -2).length;
  const finals = rows.filter(r => ['f', 'c'].includes(r.round_type_id));
  return { competitions: new Set(rows.map(r => r.competition_id)).size, rounds: rows.length,
    completed, dnf, dns, dnfRate: completed + dnf ? dnf / (completed + dnf) * 100 : null,
    finals: finals.length, fourths: finals.filter(r => r.pos === 4 && r.best > 0).length,
    podiums: finals.filter(r => r.pos <= 3 && r.pos > 0 && r.best > 0).length };
}
export function leaderboard(people, event, type) {
  let previous, rank = 0;
  return people.map(data => ({ data, record: data.profile.personal_records[event]?.[type] }))
    .filter(p => p.record?.best > 0).sort((a, b) => a.record.best - b.record.best || a.data.id.localeCompare(b.data.id))
    .map((p, i) => { if (p.record.best !== previous) rank = i + 1; previous = p.record.best; return { ...p, rank }; });
}
export function personalBests(data, event, type) {
  let best = Infinity;
  return orderedResults(data, event).flatMap(r => {
    const value = type === 'single' ? r.best : r.average;
    if (value <= 0 || value >= best) return [];
    best = value;
    return [{ ...r, value }];
  });
}
export function yearly(data) {
  const map = new Map();
  for (const r of orderedResults(data)) {
    const year = r.competition?.start_date?.slice(0, 4) || '日期未知';
    if (!map.has(year)) map.set(year, { year, competitions: new Set(), rounds: 0, completed: 0 });
    const item = map.get(year);
    item.competitions.add(r.competition_id); item.rounds++;
    item.completed += (r.attempts || []).filter(v => v > 0).length;
  }
  return [...map.values()].reverse().map(v => ({ ...v, competitions: v.competitions.size }));
}
