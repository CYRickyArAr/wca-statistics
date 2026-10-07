export const validId = id => typeof id === 'string' && /^\d{4}[A-Z]{4}\d{2}$/.test(id);
export function isSnapshot(data, id) {
  return data?.id === id && data.profile?.person?.wca_id === id && typeof data.profile.person.name === 'string'
    && data.profile.personal_records && Array.isArray(data.results) && Array.isArray(data.competitions);
}
export function normalizePerson(id, profile, results, competitions) {
  if (profile?.person?.wca_id !== id || !profile.personal_records) throw new Error('WCA 选手数据不完整。');
  if (!Array.isArray(results) || !Array.isArray(competitions)) throw new Error('WCA 成绩数据格式发生变化，未覆盖旧缓存。');
  return {
    id, fetchedAt: new Date().toISOString(), profile,
    results: results.map(r => ({ id: r.id, competition_id: r.competition_id, event_id: r.event_id,
      round_type_id: r.round_type_id, pos: r.pos, best: r.best, average: r.average,
      attempts: r.attempts, regional_single_record: r.regional_single_record,
      regional_average_record: r.regional_average_record })),
    competitions: competitions.map(c => ({ id: c.id, name: c.name, start_date: c.start_date,
      end_date: c.end_date, city: c.city, country_iso2: c.country_iso2 })),
  };
}
// WCA 的公开 API 允许跨域 GET，GitHub Pages 不需要 Node 后端或密钥。
export async function loadDirectPerson(id, fetcher = fetch) {
  if (!validId(id)) throw new Error('WCA ID 格式不正确。');
  const base = `https://www.worldcubeassociation.org/api/v0/persons/${id}`;
  async function request(suffix = '') {
    let response;
    try { response = await fetcher(base + suffix, { signal: AbortSignal.timeout(50000), credentials: 'omit' }); }
    catch { throw new Error('无法连接 WCA，请检查网络后重试。'); }
    if (!response.ok) {
      if (response.status === 404) throw new Error('未找到这个 WCA ID。');
      if (response.status === 429) throw new Error('WCA 请求过于频繁，请稍后重试。');
      throw new Error(`WCA 返回 HTTP ${response.status}，请稍后重试。`);
    }
    try { return await response.json(); } catch { throw new Error('WCA 返回了无效数据，请稍后重试。'); }
  }
  const profile = await request();
  if (profile.person?.wca_id !== id) throw new Error('WCA 选手数据不完整。');
  const [results, competitions] = await Promise.all([request('/results'), request('/competitions')]);
  return normalizePerson(id, profile, results, competitions);
}
export function mergeDefaultMembers(saved, defaults) {
  const previous = Array.isArray(saved?.ids) ? saved.ids.filter(validId) : [];
  const version = defaults?.version || '';
  const added = saved?.defaultVersion === version ? [] : (defaults?.members || []).map(m => m.id).filter(validId);
  return { ids: [...new Set([...previous, ...added])].slice(0, 100), defaultVersion: version };
}
export function newerSnapshot(cached, bundled) {
  if (!cached) return bundled;
  if (!bundled) return cached;
  return (Date.parse(bundled.fetchedAt) || 0) > (Date.parse(cached.fetchedAt) || 0) ? bundled : cached;
}
