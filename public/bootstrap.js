// 入口文件只负责选取发布版本。旧入口即使被缓存，也会先查询最新版本。
const pageVersion = document.querySelector('meta[name="site-version"]')?.content || 'development';
function showError(message) {
  const content = document.querySelector('#content');
  if (content) content.textContent = message;
}
async function start() {
  if (pageVersion === 'development') {
    await import('./app.js');
    return;
  }
  let latest = pageVersion;
  try {
    const manifest = new URL('./version.json', document.baseURI);
    manifest.searchParams.set('_', String(Date.now()));
    const response = await fetch(manifest, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const release = await response.json();
      if (/^[a-f0-9]{16}$/.test(release.version)) latest = release.version;
    }
  } catch { /* 暂时离线时仍尝试加载当前版本，不删除浏览器里的名单和数据。 */ }
  if (latest !== pageVersion) {
    const target = new URL(location.href);
    if (target.searchParams.get('v') === latest) {
      // CDN 切换中的短暂不一致不能导致无限刷新。
      showError('新版本正在同步，请稍后刷新页面。');
      return;
    }
    target.searchParams.set('v', latest);
    location.replace(target.href);
    return;
  }
  await import(new URL(`./releases/${pageVersion}/app.js`, document.baseURI).href);
}
start().catch(() => showError('页面加载失败，请检查网络后刷新。已有名单和成绩缓存不会被清除。'));
