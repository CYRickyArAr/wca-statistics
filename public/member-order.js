const collator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
function sortKey(member) {
  if (member.sortName) return member.sortName;
  // WCA 中文选手档案一般使用 Given Family (中文姓名)，以官方拼音的姓排序，
  // 避免把「曾」等多音姓氏误按常见字音排序。
  const romanized = (member.name || '').split(/[（(]/)[0].trim();
  if (/^[A-Za-z\s'-]+$/.test(romanized)) {
    const words = romanized.split(/\s+/);
    return [words.at(-1), ...words.slice(0, -1)].join(' ');
  }
  return member.name || member.id;
}
export function sortMembers(members) {
  return [...members].sort((a, b) => collator.compare(sortKey(a), sortKey(b)) || a.id.localeCompare(b.id));
}
