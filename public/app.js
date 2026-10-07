import { AO_SIZES } from './averages.js';
import { escape, displayName, playedEvents, renderPersonal, renderRanking, renderRules } from './average-views.js';
import { validId, isSnapshot, loadDirectPerson, mergeDefaultMembers, newerSnapshot } from './wca-data.js';
import { sortMembers } from './member-order.js';

const $ = selector => document.querySelector(selector);
// 保留旧版存储键，原来添加的选手无需重新添加。
const key = 'caiyang-wca-v1';
const state = { ids: [], data: new Map(), selected: null, tab: 'personal', event: '333', size: 12, mode: 'best', busy: false, defaultVersion: '' };
let defaultNames = new Map();
let defaultSortNames = new Map();
const current = () => state.data.get(state.selected);
const people = () => state.ids.map(id => state.data.get(id)).filter(Boolean);
function notice(message, error = false) {
  $('#notice').hidden = !message;
  $('#notice').textContent = message;
  $('#notice').classList.toggle('error', error);
}
function save() {
  try { localStorage.setItem(key, JSON.stringify({ ids: state.ids, defaultVersion: state.defaultVersion })); return true; }
  catch { notice('浏览器无法保存名单。请使用「备份名单」下载备份，避免关闭后丢失。', true); return false; }
}
function saveSnapshot(data) {
  try { localStorage.setItem(`${key}:${data.id}`, JSON.stringify(data)); return true; }
  catch { notice('成绩已加载，但浏览器缓存空间不足或存储被禁用。关闭页面后可能需要重新联网获取。', true); return false; }
}
function setBusy(busy) {
  state.busy = busy;
  $('#add-button').disabled = busy;
  $('#refresh-button').disabled = busy || !state.selected;
  $('#import-button').disabled = busy;
  $('#refresh-button').textContent = busy ? '正在获取官方数据…' : '更新当前选手';
  $('#content').setAttribute('aria-busy', String(busy));
  document.querySelectorAll('[data-remove]').forEach(button => { button.disabled = busy; });
}
async function fetchPerson(id, refresh = false) {
  let data;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    const response = await fetch(`./api/person/${id}${refresh ? '?refresh=1' : ''}`, { signal: AbortSignal.timeout(115000) });
    if (response.status === 404) data = await loadDirectPerson(id);
    else {
      data = await response.json();
      if (!response.ok) throw new Error(data.error || '获取失败，请稍后重试。');
    }
  } else data = await loadDirectPerson(id);
  if (!isSnapshot(data, id)) throw new Error('收到的数据不完整，保留了旧缓存。');
  state.data.set(id, data);
  return data;
}
function orderedMembers() {
  return sortMembers(state.ids.map(id => ({ id,
    name: state.data.get(id)?.profile.person.name || defaultNames.get(id) || id,
    sortName: defaultSortNames.get(id),
  })));
}
function renderMembers() {
  $('#member-count').textContent = state.ids.length;
  $('#members').innerHTML = orderedMembers().map(({ id }) => {
    const data = state.data.get(id);
    const name = data ? displayName(data) : (defaultNames.get(id) || id);
    return `<button class="member ${id === state.selected ? 'active' : ''}" data-person="${id}" aria-pressed="${id === state.selected}"><span class="avatar">${escape([...name][0])}</span><span><span class="member-name">${escape(name)}</span><span class="member-id">${id}</span></span></button>`;
  }).join('');
}
function render() {
  renderMembers();
  const data = current();
  const name = data ? displayName(data) : defaultNames.get(state.selected) || state.selected;
  $('#refresh-button').disabled = state.busy || !state.selected;
  $('#page-title').textContent = state.tab === 'ranking' ? '连续平均排行榜' : state.tab === 'rules' ? '计算规则' : name ? `${name}的连续平均` : 'WCA 连续平均统计';
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
    if (button.dataset.tab === state.tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (state.tab === 'personal' && data) {
    const played = playedEvents(data).map(([id]) => id);
    if (!played.includes(state.event)) state.event = played[0] || '333';
  }
  $('#content').innerHTML = state.tab === 'rules' ? renderRules()
    : state.tab === 'ranking' ? renderRanking(people(), state.ids.length, state)
    : data ? renderPersonal(data, state)
    : state.selected ? `<div class="empty"><strong>还没有这位选手的成绩缓存</strong>点击「更新当前选手」获取逐次成绩，再计算 Ao。<p><button class="text-button danger" data-remove="${state.selected}" ${state.busy ? 'disabled' : ''}>移除选手</button></p></div>`
    : '<div class="empty">添加选手，查看连续平均。</div>';
}
function focusDetail() {
  const detail = $('#ao-detail');
  if (detail) { detail.setAttribute('tabindex', '-1'); detail.focus({ preventScroll: true }); detail.scrollIntoView({ block: 'start' }); }
}

$('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const id = $('#wca-id').value.trim().toUpperCase();
  if (!validId(id)) return notice('请输入完整的 WCA ID，例如 2019CAIY01。', true);
  if (state.ids.includes(id)) { state.selected = id; state.tab = 'personal'; render(); return notice('这位选手已在名单中，已为你选中。'); }
  if (state.ids.length >= 100) return notice('当前版本最多保存 100 位选手。请先移除不再关注的选手。', true);
  setBusy(true); notice(`正在获取 ${id} 的逐次成绩，用于计算连续平均…`);
  try {
    const data = await fetchPerson(id);
    state.ids.push(id); state.selected = id; state.tab = 'personal';
    notice(`已添加 ${displayName(data)}，Ao 已根据正式比赛尝试计算。`);
    save(); saveSnapshot(data); $('#wca-id').value = '';
  } catch (error) { notice(error.message, true); }
  finally { setBusy(false); render(); }
});
$('#refresh-button').addEventListener('click', async () => {
  if (state.busy || !state.selected) return;
  const id = state.selected;
  setBusy(true); notice(`正在更新 ${id} 的官方成绩并重新计算 Ao…`);
  try { const data = await fetchPerson(id, true); notice(`${displayName(data)}的成绩已更新，连续平均已重新计算。`); saveSnapshot(data); }
  catch (error) { notice(`${error.message}\n如有缓存，继续使用上次成功获取的成绩计算。`, true); }
  finally { setBusy(false); render(); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.window) {
    const size = Number(button.dataset.window);
    if (!AO_SIZES.includes(size) || !state.ids.includes(button.dataset.owner)) return;
    state.size = size; state.event = button.dataset.event; state.selected = button.dataset.owner; state.tab = 'personal';
    render(); focusDetail();
  } else if (button.dataset.person || button.dataset.open) {
    state.selected = button.dataset.person || button.dataset.open;
    state.tab = 'personal'; render();
  } else if (button.dataset.tab) { state.tab = button.dataset.tab; render(); }
  else if (button.dataset.remove && !state.busy) {
    const id = button.dataset.remove;
    const name = state.data.has(id) ? displayName(state.data.get(id)) : id;
    if (!confirm(`从名单移除 ${name}？不会影响 WCA 官方数据。`)) return;
    state.ids = state.ids.filter(i => i !== id); state.data.delete(id);
    state.selected = orderedMembers()[0]?.id || null;
    notice('已从本地名单移除。'); save();
    try { localStorage.removeItem(`${key}:${id}`); } catch { /* Storage may be disabled. */ }
    render();
  }
});
document.addEventListener('change', event => {
  const id = event.target.id;
  if (!['event-select', 'size-select', 'mode-select'].includes(id)) return;
  if (id === 'event-select') state.event = event.target.value;
  if (id === 'size-select') state.size = Number(event.target.value);
  if (id === 'mode-select') state.mode = event.target.value;
  render();
  // 替换面板后恢复选择器焦点，方便键盘连续切换。
  document.getElementById(id)?.focus({ preventScroll: true });
});
$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, ids: state.ids }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `WCA名单-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('已导出选手名单；导入时重新联网获取成绩，并计算 Ao。');
});
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || state.busy) return;
  let ids;
  try {
    if (file.size > 100000) throw new Error('名单文件过大，请选择本网站导出的 JSON 名单。');
    const imported = JSON.parse(await file.text());
    if (imported.version !== 1 || !Array.isArray(imported.ids) || !imported.ids.every(validId)) throw new Error('名单格式无效，请选择本网站导出的 JSON 名单。');
    ids = [...new Set(imported.ids)].filter(id => !state.ids.includes(id));
    if (state.ids.length + ids.length > 100) throw new Error('导入后会超过 100 人，请缩小名单。');
  } catch (error) { return notice(error.message, true); }
  if (!ids.length) return notice('名单中的选手都已经添加，无需重复导入。');
  setBusy(true); const failures = []; let count = 0; let persisted = true;
  for (const id of ids) {
    notice(`正在导入 ${id}（${++count}/${ids.length}）…`);
    try { const data = await fetchPerson(id); state.ids.push(id); if (!state.selected) state.selected = id; persisted = save() && persisted; persisted = saveSnapshot(data) && persisted; render(); }
    catch { failures.push(id); }
  }
  setBusy(false); render();
  notice(`导入完成，新增 ${ids.length - failures.length} 人。${failures.length ? `\n未能获取：${failures.join('、')}，请稍后逐个添加。` : ''}${!persisted ? '\n部分数据未能保存到浏览器，请立即备份名单。' : ''}`, failures.length > 0 || !persisted);
});
async function init() {
  setBusy(true);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { notice('浏览器存储不可用。添加选手后请备份名单。', true); }
  let defaults = { version: saved?.defaultVersion || '', members: [] };
  try {
    const response = await fetch('./default-members.json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('missing defaults');
    const config = await response.json();
    if (typeof config.version !== 'string' || !Array.isArray(config.members) || !config.members.every(m => validId(m.id) && typeof m.name === 'string')) throw new Error('invalid defaults');
    defaults = config;
  } catch { notice('默认名单未能加载，请刷新重试。已有名单不受影响。', true); }
  defaultNames = new Map(defaults.members.map(m => [m.id, m.name]));
  defaultSortNames = new Map(defaults.members.map(m => [m.id, m.sortName]));
  Object.assign(state, mergeDefaultMembers(saved, defaults));
  for (const id of state.ids) {
    try {
      const data = JSON.parse(localStorage.getItem(`${key}:${id}`) || 'null');
      if (isSnapshot(data, id)) state.data.set(id, data);
    } catch { /* 单个坏缓存不影响其他选手。 */ }
  }
  state.selected = orderedMembers()[0]?.id || null;
  render();
  const queue = state.ids.filter(id => defaultNames.has(id));
  const failures = [];
  async function loadBundled() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const response = await fetch(`./data/${id}.json`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('snapshot missing');
        const bundled = await response.json();
        if (!isSnapshot(bundled, id)) throw new Error('invalid snapshot');
        state.data.set(id, newerSnapshot(state.data.get(id), bundled));
      } catch { if (!state.data.has(id)) failures.push(defaultNames.get(id) || id); }
    }
  }
  try { await Promise.all([loadBundled(), loadBundled(), loadBundled()]); }
  finally { setBusy(false); render(); save(); }
  if (failures.length) notice(`未加载：${failures.join('、')}。可选中后点击「更新当前选手」。`, true);
}
init();
