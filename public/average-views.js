import { EVENTS, eventName, roundName, formatResult } from './stats.js';
import { AO_SIZES, analyzeAverages, averageRanking, windowBreakdown, supportsAverage } from './averages.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const displayName = data => data?.profile.person.name.match(/[（(]([^()（）]+)[)）]/)?.[1] || data?.profile.person.name || '未知选手';
const fmt = (value, event, type = 'average') => escape(formatResult(value, event, type));
const dateTime = date => new Date(date).toLocaleString('zh-CN', { hour12: false });
const compLink = attempt => `<a href="https://www.worldcubeassociation.org/competitions/${encodeURIComponent(attempt.competitionId)}" target="_blank" rel="noopener noreferrer">${escape(attempt.competition?.name || attempt.competitionId)}</a>`;
const modeName = mode => mode === 'best' ? '历史最佳' : '最近';
export function playedEvents(data) {
  return EVENTS.filter(([event]) => data.results.some(r => r.event_id === event));
}
function head(data, busy) {
  return `<div class="profile-head"><div><h2>${escape(data.profile.person.name)}</h2><p>${data.id} · 官方成绩获取于 ${escape(dateTime(data.fetchedAt))}</p></div><div class="profile-actions"><a href="https://www.worldcubeassociation.org/persons/${data.id}" target="_blank" rel="noopener noreferrer">官方档案 ↗</a><button class="text-button danger" data-remove="${data.id}" ${busy ? 'disabled' : ''}>移除选手</button></div></div>`;
}
function controls(state, events = EVENTS, full = true) {
  return `<div class="filters">${full ? `<label>项目<select id="event-select">${events.map(([id, name]) => `<option value="${id}" ${id === state.event ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>连续次数<select id="size-select">${AO_SIZES.map(n => `<option value="${n}" ${n === state.size ? 'selected' : ''}>Ao${n}</option>`).join('')}</select></label>` : ''}<label>统计范围<select id="mode-select"><option value="best" ${state.mode === 'best' ? 'selected' : ''}>历史最佳</option><option value="latest" ${state.mode === 'latest' ? 'selected' : ''}>最近一次</option></select></label></div>`;
}
function status(metric, mode, event) {
  if (!supportsAverage(event)) return '多盲不适用';
  if (metric.count < metric.size) return `不足 ${metric.size} 次`;
  if (!metric[mode] || metric[mode].value === -1) return 'DNF';
  return fmt(metric[mode].value, event);
}
function overview(data, state) {
  const events = playedEvents(data);
  return `<section class="panel"><div class="panel-head"><div><h2>${modeName(state.mode)}连续平均</h2></div></div><div class="table-wrap"><table class="ao-overview"><thead><tr><th>项目</th><th>正式尝试</th>${AO_SIZES.map(n => `<th>Ao${n}</th>`).join('')}</tr></thead><tbody>${events.map(([event, name]) => {
    const analysis = analyzeAverages(data, event);
    return `<tr><td class="event-cell">${name}</td><td class="number">${analysis.attempts.length}</td>${AO_SIZES.map(n => {
      const metric = analysis.bySize[n], window = metric[state.mode];
      return `<td>${window ? `<button class="ao-value ${window.value < 0 ? 'invalid-value' : ''}" data-window="${n}" data-event="${event}" data-owner="${data.id}">${fmt(window.value, event)}</button>` : `<span class="muted small">${status(metric, state.mode, event)}</span>`}</td>`;
    }).join('')}</tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">尚无正式比赛尝试，请先更新选手数据。</td></tr>'}</tbody></table></div></section>`;
}
function endpoints(attempts, window) {
  const first = attempts[window.start], last = attempts[window.end];
  const point = a => `<div><span class="small muted">${escape(a.competition?.start_date || '日期未知')} · ${escape(roundName(a.round))} · 第 ${a.attempt} 次</span><br>${compLink(a)}</div>`;
  return `<div class="window-range"><div><span class="range-label">起点 · 第 ${window.start + 1} 次正式尝试</span>${point(first)}</div><div><span class="range-label">终点 · 第 ${window.end + 1} 次正式尝试</span>${point(last)}</div></div>`;
}
function detail(data, state) {
  const { event, size, mode } = state;
  const analysis = analyzeAverages(data, event), metric = analysis.bySize[size], window = metric[mode];
  const label = `${eventName(event)} · ${modeName(mode)} Ao${size}`;
  const heading = `<div class="panel-head"><div><h2>${label}</h2></div>${controls(state, playedEvents(data))}</div>`;
  if (!analysis.supported) return `<section class="panel" id="ao-detail">${heading}<div class="empty">多盲不计算 Ao。</div></section>`;
  if (metric.count < size) return `<section class="panel" id="ao-detail">${heading}<div class="empty"><strong>还差 ${size - metric.count} 次正式尝试</strong>${metric.count} / ${size} 次</div></section>`;
  if (!window) return `<section class="panel" id="ao-detail">${heading}<div class="empty"><strong>历史最佳 Ao${size}：DNF</strong>全部 ${metric.windows.length} 个窗口在剔除最差 ${metric.trim} 次后，仍包含 DNF / DNS。<br>切换「最近一次」可以查看组成。</div></section>`;
  const rows = windowBreakdown(analysis.attempts, window, size);
  const hasInvalid = window.value < 0;
  return `<section class="panel" id="ao-detail">${heading}<div class="window-summary"><div class="window-score"><span>${modeName(mode)} Ao${size}</span><strong>${fmt(window.value, event)}</strong>${event === '333fm' ? '<small>步</small>' : ''}</div>${hasInvalid ? '<p class="invalid-message">剔除后仍有 DNF / DNS</p>' : ''}</div>${endpoints(analysis.attempts, window)}${analysis.missingDates ? '<p class="date-warning">部分比赛日期缺失，排在已知日期之后，可能影响连续统计。</p>' : ''}<div class="attempt-legend"><span class="fast-key">( ) 去最快</span><span class="slow-key">[ ] 去最差</span></div><ol class="attempt-grid">${rows.map(r => `<li class="solve ${r.excluded || 'kept'}"><span class="solve-index">${r.offset + 1}</span><span class="solve-value">${r.excluded === 'fast' ? '(' : r.excluded === 'slow' ? '[' : ''}${fmt(r.value, event, 'single')}${r.excluded === 'fast' ? ')' : r.excluded === 'slow' ? ']' : ''}</span></li>`).join('')}</ol><details class="attempt-source"><summary>成绩来源（${size} 次）</summary><div class="table-wrap"><table><thead><tr><th>窗口内序号</th><th>成绩</th><th>处理方式</th><th>比赛 / 日期</th><th>轮次 / 尝试</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.offset + 1}</td><td class="number">${fmt(r.value, event, 'single')}</td><td>${r.excluded === 'fast' ? '最快剔除' : r.excluded === 'slow' ? '最差剔除' : '计入平均'}</td><td>${compLink(r)}<br><span class="small muted">${escape(r.competition?.start_date || '日期未知')}</span></td><td>${escape(roundName(r.round))} / 第 ${r.attempt} 次</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
export function renderPersonal(data, state) {
  return head(data, state.busy) + overview(data, state) + detail(data, state);
}
export function renderRanking(people, total, state) {
  const { event, size, mode } = state;
  const ranking = averageRanking(people, event, size, mode);
  const eligibleIds = new Set(ranking.map(r => r.data.id));
  const excluded = people.filter(p => !eligibleIds.has(p.id));
  return `<section class="panel"><div class="panel-head"><div><h2>${modeName(mode)} Ao${size} 排行榜</h2><p>${people.length} / ${total} 位选手</p></div>${controls(state)}</div>${total < 2 ? '<div class="ranking-empty">添加选手，开始比较。</div>' : ''}<div class="table-wrap"><table><thead><tr><th>名单内排名</th><th>选手</th><th>${modeName(mode)} Ao${size}</th><th>连续窗口</th><th>起止比赛日期</th><th>数据获取时间</th></tr></thead><tbody>${ranking.map(({ data, analysis, window, rank }) => `<tr><td><span class="place ${rank === 1 ? 'first' : ''}">${rank}</span></td><td><button class="text-button" data-open="${data.id}">${escape(displayName(data))}</button><div class="small muted">${data.id}</div></td><td><button class="ao-value" data-owner="${data.id}" data-event="${event}" data-window="${size}">${fmt(window.value, event)}</button></td><td class="number">第 ${window.start + 1}–${window.end + 1} 次</td><td class="small">${escape(analysis.attempts[window.start].competition?.start_date || '日期未知')}<br>至 ${escape(analysis.attempts[window.end].competition?.start_date || '日期未知')}</td><td class="small muted">${escape(dateTime(data.fetchedAt))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">暂无可排名的有效平均。尝试切换项目或连续次数，或添加其他选手。</td></tr>'}</tbody></table></div>${excluded.length ? `<div class="unranked"><h3>未参与本次排名</h3>${excluded.map(data => `<p><button class="text-button" data-open="${data.id}">${escape(displayName(data))}</button><span>${status(analyzeAverages(data, event).bySize[size], mode, event)}</span></p>`).join('')}</div>` : ''}</section>`;
}
export function renderRules() {
  return `<section class="panel rules"><h2>和参考项目一样，统计连续正式单次</h2><p>这里的 Ao 是从 WCA 的逐次成绩重新计算的非官方统计，不是把多轮官方 average 再求平均，也不是从生涯成绩里挑出最快的 N 次。</p><h3>怎样得到一个 Ao？</h3><ol><li>选定一名选手、一个项目，把正式尝试按顺序串成序列。跨轮次、跨比赛也算连续。</li><li>取连续 N 次作为一个窗口；每次向后移动一条尝试，枚举所有窗口。</li><li>在每个窗口内部排序，两端各剔除 <code>ceil(N × 5%)</code> 次。</li><li>对剩余成绩取算术平均，四舍五入。最少步平均保留两位小数，计时项目保留到百分之一秒。</li></ol><div class="table-wrap"><table><thead><tr><th>统计</th><th>最快剔除</th><th>最差剔除</th><th>计入平均</th></tr></thead><tbody>${AO_SIZES.map(n => `<tr><td>Ao${n}</td><td>${Math.ceil(n * .05)}</td><td>${Math.ceil(n * .05)}</td><td>${n - 2 * Math.ceil(n * .05)}</td></tr>`).join('')}</tbody></table></div><h3>最佳、最近和无效成绩</h3><ul><li><strong>历史最佳</strong>：所有窗口中数值最小的有效 Ao。同值保留按本页顺序最先出现的窗口。</li><li><strong>最近一次</strong>：最后 N 次尝试组成的窗口，即使其结果为 DNF，也不会跳过它去找更早的有效平均。</li><li>DNF 和 DNS 都保留在连续序列里，并按无穷大处理。如果剔除最差成绩后仍有 DNF / DNS，该窗口结果为 DNF。</li><li>API 中的 0 表示未进行的尝试，跳过而不补零。尝试总数不足 N 时明确显示「不足 N 次」，不计算。</li><li>多盲和旧制多盲与参考项目一样排除，不把多盲编码当秒数求平均。</li></ul><h3>顺序的局限</h3><p>公开 API 没有每次还原的真实时间。本页按比赛开始日期、比赛 ID、轮次顺序、尝试序号排序。缺失比赛日期时排在末尾并提示。</p><p>参考项目 SQL 按比赛开始日期、轮次 rank、attempt_number 排序，未明确同日不同比赛的完整平局规则。这里用比赛 ID 保证同场比赛不被交错；同日或跨日比赛的窗口可能与原站不同，不能保证真实发生时间顺序。对于普通不同日期的比赛，按相同的连续单次与去尾规则计算。</p><h3>与原站的其他区别</h3><p>原站为了性能只计算各项目单次世界前 500 的选手，并展示前 10。这里计算你添加的所有选手，不设单次排名门槛；只提供名单内排名，不伪称全球排名。数据更新日期不同，也可能导致结果不同。</p><p>实现依据：<a href="https://github.com/jonatanklosko/wca_statistics/blob/master/statistics/abstract/average_of_x.rb" target="_blank" rel="noopener noreferrer">原项目 AverageOfX 源码 ↗</a>。本项目独立实现，保留源项目的算法说明。</p></section>`;
}
